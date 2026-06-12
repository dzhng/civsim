// 3D campaign terrain: a heightfield mesh under the Canvas2D marker overlay.
// The camera is Total War-style — straight down when zoomed out (political
// map), tilting toward the horizon as you zoom in. cam.scale stays "px per km
// at the look-at point" at every tilt, so all the overlay's zoom thresholds
// keep meaning what they meant in the flat renderer.
//
// Surfaces are procedural, driven by the biome texture (moisture/forest/rock/
// shore distance from terrain.ts): grass that greens with moisture, dune sand
// in the deserts, strata rock and snow caps on the ranges, dark canopy where
// forests sit — plus instanced billboard trees — and animated water with sun
// glints and coastal foam.

import type { CampaignData } from './data';
import { compileProgram, uploadMipmapTexture } from '../shared/glutil';
import type { CamView } from './renderer';
import { TerrainField } from './terrain';

const FOV = (45 * Math.PI) / 180;
/** Tilt: 90° (top-down) until TILT_START, easing to MIN_PITCH by TILT_END. */
const TILT_START = 0.32;
const TILT_END = 1.5;
const MIN_PITCH = (52 * Math.PI) / 180;
/** Trees pop in below this height (cam.scale), once they'd be > a few px. */
const TREE_MIN_SCALE = 0.45;

// Shared by terrain and tree shaders: camera projection of a world point.
const PROJECT = `
uniform vec3 uEye, uRight, uUp, uFwd;
uniform vec2 uFA;     // 1/tan(fov/2), aspect
uniform vec2 uNF;     // near, far
vec4 project(vec3 wp) {
  vec3 rel = wp - uEye;
  float zv = dot(rel, uFwd);
  float x = dot(rel, uRight);
  float y = dot(rel, uUp);
  float n = uNF.x, f = uNF.y;
  float zc = zv * (f + n) / (f - n) - 2.0 * f * n / (f - n);
  return vec4(x * uFA.x / uFA.y, y * uFA.x, zc, zv);
}`;

const NOISE = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}`;

const VS = `#version 300 es
precision highp float;
in vec3 aPos;   // world x, y (km), relief height (km)
uniform vec4 uBgRect; // minX, minY, maxX, maxY
${PROJECT}
out vec2 vUV;
out float vH;
out float vZ;
out vec2 vXY;
void main() {
  gl_Position = project(aPos);
  vUV = vec2((aPos.x - uBgRect.x) / (uBgRect.z - uBgRect.x),
             (uBgRect.w - aPos.y) / (uBgRect.w - uBgRect.y));
  vH = aPos.z;
  vZ = gl_Position.w;
  vXY = aPos.xy;
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV;
in float vH;
in float vZ;
in vec2 vXY;
uniform sampler2D uTerr, uLight, uBiome; // uLight: baked lambert * 128
uniform vec3 uEye, uSun, uFogC;
uniform vec2 uFx; // territory alpha, fog strength
uniform float uFogD, uTime;
out vec4 outColor;
${NOISE}
// An octave whose wavelength nears one screen pixel collapses to its mean
// instead of aliasing into static. px = world km per screen px here.
float nz(vec2 p, float freq, float px) {
  float fade = clamp(1.0 - freq * px * 2.2, 0.0, 1.0);
  if (fade <= 0.0) return 0.5; // sub-pixel octave: skip the hashes entirely
  return mix(0.5, vnoise(p * freq), fade);
}
void main() {
  vec4 b = texture(uBiome, vUV); // moisture, forest, rock, signed shore dist
  // signed shore distance: 0.5 at the waterline, land above, water below
  float water = 1.0 - smoothstep(0.497, 0.503, b.a);
  float px = max(fwidth(vXY.x), fwidth(vXY.y));
  vec3 col = vec3(0.0);

  if (water < 0.999) {
    // ---- land: moisture-graded grass, dune sand, canopy, rock, snow ----
    float m = b.r;
    float g1 = nz(vXY, 0.9, px);
    float g2 = nz(vXY, 3.1, px);
    vec3 grass = mix(vec3(0.55, 0.51, 0.30), vec3(0.25, 0.40, 0.18), smoothstep(0.28, 0.62, m));
    grass *= 0.86 + 0.18 * g1 + 0.10 * g2;
    float dune = abs(nz(vXY, 0.16, px) * 2.0 - 1.0);
    vec3 sand = mix(vec3(0.83, 0.74, 0.54), vec3(0.71, 0.60, 0.42), dune);
    sand *= 0.93 + 0.10 * nz(vXY, 1.6, px);
    vec3 ground = mix(sand, grass, smoothstep(0.16, 0.32, m));
    // beach: a narrow sandy rim where land meets water (b.a in shore units)
    float landShore = (b.a - 0.5) * 24.0; // cells from the waterline
    ground = mix(vec3(0.80, 0.73, 0.55), ground, smoothstep(0.1, 0.8, landShore));
    // forest canopy clumps
    float canopy = smoothstep(0.25, 0.7, b.g * (0.55 + 0.9 * nz(vXY, 0.55, px)));
    vec3 forestC = mix(vec3(0.13, 0.25, 0.10), vec3(0.20, 0.33, 0.14), nz(vXY, 1.9, px));
    ground = mix(ground, forestC, canopy);
    // rock strata above the treeline, snow only on the broadest masses
    vec3 rockC = mix(vec3(0.44, 0.41, 0.37), vec3(0.61, 0.58, 0.53),
                     nz(vec2(vXY.x, vXY.y + vH * 0.9), 0.7, px));
    ground = mix(ground, rockC, smoothstep(0.3, 0.75, b.b) * (0.7 + 0.3 * g1));
    float snow = smoothstep(21.0, 26.5, vH + (nz(vXY, 0.5, px) - 0.5) * 6.0);
    ground = mix(ground, vec3(0.92, 0.93, 0.96), snow);
    // political mode reads better over calmer ground
    float grey = dot(ground, vec3(0.333));
    ground = mix(ground, vec3(grey) * 1.08, uFx.x * 0.45);
    col = ground * (texture(uLight, vUV).r * 2.0);
    // political overlay (land only)
    vec4 t = texture(uTerr, vUV);
    col = mix(col, t.rgb, t.a * uFx.x);
  }

  if (water > 0.001) {
    // ---- water: depth gradient, rolling wave normals, sun glint, foam ----
    float depth = clamp((0.5 - b.a) * 2.0, 0.0, 1.0);
    vec2 p1 = vXY + vec2(uTime * 4.6, uTime * 3.1);
    vec2 p2 = vXY + vec2(-uTime * 1.9, uTime * 1.6);
    float e = 0.55;
    float w0 = nz(p1, 0.35, px) * 0.65 + nz(p2, 1.15, px) * 0.35;
    float wx = nz(p1 + vec2(e, 0), 0.35, px) * 0.65 + nz(p2 + vec2(e, 0), 1.15, px) * 0.35 - w0;
    float wy = nz(p1 + vec2(0, e), 0.35, px) * 0.65 + nz(p2 + vec2(0, e), 1.15, px) * 0.35 - w0;
    vec3 wn = normalize(vec3(-wx * 1.6, -wy * 1.6, 1.0));
    vec3 wcol = mix(vec3(0.13, 0.38, 0.42), vec3(0.03, 0.11, 0.21), smoothstep(0.0, 0.6, depth));
    wcol += 0.05 * (w0 - 0.5);
    vec3 V = normalize(uEye - vec3(vXY, 0.0));
    wcol += vec3(1.0, 0.93, 0.75) * pow(max(dot(reflect(-uSun, wn), V), 0.0), 90.0)
            * 0.5 * clamp(1.0 - 0.6 * px, 0.0, 1.0);
    wcol = mix(wcol, vec3(0.36, 0.46, 0.55), pow(1.0 - max(dot(wn, V), 0.0), 3.0) * 0.3);
    float foam = smoothstep(0.5, 0.0, (0.5 - b.a) * 24.0)
               * smoothstep(0.45, 0.85, nz(vXY + vec2(uTime * 3.0, -uTime * 2.0), 2.3, px));
    wcol = mix(wcol, vec3(0.85, 0.90, 0.92), foam * 0.6);
    col = mix(col, wcol, water);
  }

  if (uFx.y > 0.001) {
    float fog = (1.0 - exp(-pow(vZ * uFogD, 2.0))) * uFx.y;
    col = mix(col, uFogC, clamp(fog, 0.0, 1.0));
  }
  outColor = vec4(col, 1.0);
}`;

const TREE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aQuad;     // x: -0.5..0.5, y: 0..1
layout(location=1) in vec3 aBase;     // world km, ground height
layout(location=2) in vec2 aSizeVar;  // height (km), atlas variant
uniform vec4 uBgRect;
${PROJECT}
out vec2 vUV;
out vec2 vLightUV;
out float vZ;
void main() {
  // vertical billboard: the camera never yaws, so quads span world +x
  vec3 wp = aBase + vec3(aQuad.x * aSizeVar.x * 0.72, 0.0, aQuad.y * aSizeVar.x);
  gl_Position = project(wp);
  vUV = vec2((aQuad.x + 0.5 + aSizeVar.y) * 0.5, 1.0 - aQuad.y);
  vLightUV = vec2((aBase.x - uBgRect.x) / (uBgRect.z - uBgRect.x),
                  (uBgRect.w - aBase.y) / (uBgRect.w - uBgRect.y));
  vZ = gl_Position.w;
}`;

const TREE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec2 vLightUV;
in float vZ;
uniform sampler2D uAtlas, uLight;
uniform vec3 uFogC;
uniform vec2 uFx;
uniform float uFogD;
out vec4 outColor;
void main() {
  vec4 c = texture(uAtlas, vUV);
  if (c.a < 0.5) discard;
  vec3 col = c.rgb * (texture(uLight, vLightUV).r * 2.0);
  if (uFx.y > 0.001) {
    float fog = (1.0 - exp(-pow(vZ * uFogD, 2.0))) * uFx.y;
    col = mix(col, uFogC, clamp(fog, 0.0, 1.0));
  }
  outColor = vec4(col, c.a);
}`;

/** Procedural 2-variant tree atlas: broadleaf | conifer. */
function buildTreeAtlas(): OffscreenCanvas {
  const W = 256;
  const H = 256;
  const cv = new OffscreenCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  let seed = 7;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x80000000;
  // broadleaf (left half): trunk + clustered canopy blobs
  ctx.fillStyle = '#4a3520';
  ctx.fillRect(60, 170, 9, 80);
  for (let i = 0; i < 60; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 52;
    const x = 64 + Math.cos(a) * r;
    const y = 110 + Math.sin(a) * r * 0.8;
    const g = 70 + rnd() * 60;
    ctx.fillStyle = `rgba(${22 + rnd() * 25},${g},${24 + rnd() * 20},0.9)`;
    ctx.beginPath();
    ctx.arc(x, y, 14 + rnd() * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  // conifer (right half): trunk + stacked darkening triangles
  ctx.fillStyle = '#3d2c1c';
  ctx.fillRect(188, 190, 8, 60);
  for (let t = 0; t < 4; t++) {
    const y0 = 200 - t * 44;
    const w = 56 - t * 11;
    ctx.fillStyle = `rgb(${18 + t * 4},${52 + t * 10},${26 + t * 5})`;
    ctx.beginPath();
    ctx.moveTo(192 - w, y0);
    ctx.lineTo(192 + w, y0);
    ctx.lineTo(192, y0 - 62);
    ctx.closePath();
    ctx.fill();
  }
  return cv;
}

interface Chunk {
  aabb: [number, number, number, number, number, number];
  ibo: [WebGLBuffer, WebGLBuffer];
  count: [number, number];
  treeVao: WebGLVertexArrayObject | null;
  treeCount: number;
}

export class Terrain3D {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private treeProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private coarseIbo: WebGLBuffer;
  private coarseCount: number;
  /** frustum-culled tiles, two terrain LODs each: [full, half] */
  private chunks: Chunk[] = [];
  private terrTex: WebGLTexture;
  private lightTex: WebGLTexture;
  private biomeTex: WebGLTexture;
  private treeAtlas: WebGLTexture;
  private uni = new Map<string, WebGLUniformLocation>();
  private treeUni = new Map<string, WebGLUniformLocation>();
  /** Pin the water/foam clock for pixel-deterministic snapshots. */
  fixedTime: number | null = null;

  // Camera basis for this frame, shared with project/unproject.
  private eye = [0, 0, 1000];
  private right = [1, 0, 0];
  private up = [0, 1, 0];
  private fwd = [0, 0, -1];
  private f = 1 / Math.tan(FOV / 2);
  private dist = 1000;
  pitch = Math.PI / 2;

  private bgRect: [number, number, number, number];

  constructor(private canvas: HTMLCanvasElement, private field: TerrainField, data: CampaignData) {
    const gl = canvas.getContext('webgl2', { antialias: true })!;
    this.gl = gl;
    this.prog = compileProgram(gl, VS, FS);
    this.treeProg = compileProgram(gl, TREE_VS, TREE_FS);
    for (const name of ['uEye', 'uRight', 'uUp', 'uFwd', 'uFA', 'uNF', 'uBgRect', 'uTerr', 'uLight', 'uBiome', 'uSun', 'uFogC', 'uFx', 'uFogD', 'uTime']) {
      this.uni.set(name, gl.getUniformLocation(this.prog, name)!);
    }
    for (const name of ['uEye', 'uRight', 'uUp', 'uFwd', 'uFA', 'uNF', 'uBgRect', 'uAtlas', 'uLight', 'uFogC', 'uFx', 'uFogD']) {
      this.treeUni.set(name, gl.getUniformLocation(this.treeProg, name)!);
    }

    // Static mesh: one vertex per terrain cell, [x, y, h]. Lighting is baked
    // into a texture (terrain never moves), so no normals on the wire.
    const { w, h, cell, minX, maxY, height } = field;
    const verts = new Float32Array(w * h * 3);
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const i = gy * w + gx;
        verts[i * 3] = minX + (gx + 0.5) * cell;
        verts[i * 3 + 1] = maxY - (gy + 0.5) * cell;
        verts[i * 3 + 2] = height[i];
      }
    }
    // Index buffers: quads [x0,x1) x [y0,y1) at the given vertex stride.
    const buildIdx = (step: number, x0: number, x1: number, y0: number, y1: number) => {
      const out: number[] = [];
      for (let gy = y0; gy + step <= y1 && gy + step < h; gy += step) {
        for (let gx = x0; gx + step <= x1 && gx + step < w; gx += step) {
          const i = gy * w + gx;
          out.push(i, i + step * w, i + step, i + step, i + step * w, i + step * w + step);
        }
      }
      return new Uint32Array(out);
    };
    const upload = (idx: Uint32Array) => {
      const ibo = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      return ibo;
    };
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);

    // Tree quad geometry, shared by every chunk's instance VAO.
    const treeQuad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, treeQuad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0.5, 0, -0.5, 1, 0.5, 1]), gl.STATIC_DRAW);

    // Whole-map stride-4 mesh for the zoomed-out view (relief there is
    // shading, not silhouette), frustum-culled 64-cell tiles for close-up.
    const coarseIdx = buildIdx(4, 0, w - 1, 0, h - 1);
    this.coarseCount = coarseIdx.length;
    this.coarseIbo = upload(coarseIdx);
    const TILE = 64;
    for (let ty = 0; ty < h - 1; ty += TILE) {
      for (let tx = 0; tx < w - 1; tx += TILE) {
        const x1 = Math.min(tx + TILE, w - 1);
        const y1 = Math.min(ty + TILE, h - 1);
        let zMax = 0;
        const trees: number[] = [];
        for (let gy = ty; gy <= y1; gy++) {
          for (let gx = tx; gx <= x1; gx++) {
            const i = gy * w + gx;
            zMax = Math.max(zMax, height[i]);
            // Scatter trees over forest cells, density from the biome.
            const forest = field.biome[i * 4 + 1] / 255;
            if (forest < 0.35) continue;
            const k = Math.round(forest * 3 * (0.5 + hash01(gx, gy) * 0.9));
            for (let t = 0; t < k; t++) {
              const ox = (hash01(gx * 7 + t, gy * 13 + 1) - 0.5) * cell * 1.4;
              const oy = (hash01(gx * 3 + t, gy * 17 + 5) - 0.5) * cell * 1.4;
              const x = minX + (gx + 0.5) * cell + ox;
              const y = maxY - (gy + 0.5) * cell + oy;
              const size = 2.0 + hash01(gx + t, gy + t) * 1.8;
              const conifer = hash01(gx * 5 + t, gy * 11) < (y > 700 ? 0.75 : 0.25) ? 1 : 0;
              trees.push(x, y, field.heightAt(x, y) - 0.15, size, conifer);
            }
          }
        }
        const full = buildIdx(1, tx, x1, ty, y1);
        if (full.length === 0) continue;
        let treeVao: WebGLVertexArrayObject | null = null;
        if (trees.length) {
          treeVao = gl.createVertexArray()!;
          gl.bindVertexArray(treeVao);
          gl.bindBuffer(gl.ARRAY_BUFFER, treeQuad);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
          const inst = gl.createBuffer()!;
          gl.bindBuffer(gl.ARRAY_BUFFER, inst);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(trees), gl.STATIC_DRAW);
          gl.enableVertexAttribArray(1);
          gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 0);
          gl.vertexAttribDivisor(1, 1);
          gl.enableVertexAttribArray(2);
          gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 20, 12);
          gl.vertexAttribDivisor(2, 1);
          gl.bindVertexArray(null);
        }
        this.chunks.push({
          aabb: [
            minX + (tx + 0.5) * cell, maxY - (y1 + 0.5) * cell, 0,
            minX + (x1 + 0.5) * cell, maxY - (ty + 0.5) * cell, zMax + 6,
          ],
          ibo: [upload(full), upload(buildIdx(2, tx, x1, ty, y1))],
          count: [full.length, buildIdx(2, tx, x1, ty, y1).length],
          treeVao,
          treeCount: trees.length / 5,
        });
      }
    }

    const dataTex = (data8: Uint8Array, fmt: number, internal: number, align: number) => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, align);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, fmt, gl.UNSIGNED_BYTE, data8);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };
    this.lightTex = dataTex(field.light, gl.RED, gl.R8, 1);
    this.biomeTex = dataTex(field.biome, gl.RGBA, gl.RGBA, 4);
    this.terrTex = dataTex(new Uint8Array(w * h * 4), gl.RGBA, gl.RGBA, 4);
    this.treeAtlas = uploadMipmapTexture(gl, buildTreeAtlas());

    const r = data.bgRect;
    this.bgRect = [r.min[0], r.min[1], r.max[0], r.max[1]];
    gl.enable(gl.DEPTH_TEST);
  }

  updateTerritory(rgba: Uint8Array) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.terrTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.field.w, this.field.h, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Tilt eases in as the camera descends. */
  private pitchFor(scale: number): number {
    const t = Math.min(1, Math.max(0, (scale - TILT_START) / (TILT_END - TILT_START)));
    const s = t * t * (3 - 2 * t);
    return Math.PI / 2 - s * (Math.PI / 2 - MIN_PITCH);
  }

  /** Territory overlay strength: full when zoomed out, a faint tint zoomed in. */
  territoryAlpha(scale: number): number {
    const t = Math.min(1, Math.max(0, (scale - 0.25) / (0.6 - 0.25)));
    return 0.92 - t * 0.74;
  }

  /** Recompute the camera basis. draw() does this; call it directly when you
   *  need project/unproject to reflect a cam change before the next frame. */
  updateCamera(cam: CamView) {
    const p = this.pitchFor(cam.scale);
    this.pitch = p;
    this.dist = this.canvas.height / (2 * cam.scale * Math.tan(FOV / 2));
    const cp = Math.cos(p);
    const sp = Math.sin(p);
    this.eye = [cam.x, cam.y - this.dist * cp, this.dist * sp];
    this.right = [1, 0, 0];
    this.fwd = [0, cp, -sp];
    this.up = [0, sp, cp];
  }

  draw(cam: CamView) {
    const { gl, canvas } = this;
    this.updateCamera(cam);
    const near = Math.max(1, this.dist * 0.04);
    const far = this.dist * 8 + 8000;
    const aspect = canvas.width / canvas.height;
    const tilt = (Math.PI / 2 - this.pitch) / (Math.PI / 2 - MIN_PITCH);
    const time = this.fixedTime ?? performance.now() / 1000;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.05, 0.08, 0.11, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const setShared = (u: (n: string) => WebGLUniformLocation) => {
      gl.uniform3fv(u('uEye'), this.eye);
      gl.uniform3fv(u('uRight'), this.right);
      gl.uniform3fv(u('uUp'), this.up);
      gl.uniform3fv(u('uFwd'), this.fwd);
      gl.uniform2f(u('uFA'), this.f, aspect);
      gl.uniform2f(u('uNF'), near, far);
      gl.uniform4fv(u('uBgRect'), this.bgRect);
      gl.uniform3f(u('uFogC'), 0.64, 0.69, 0.77);
      gl.uniform2f(u('uFx'), this.territoryAlpha(cam.scale), tilt * 0.85);
      gl.uniform1f(u('uFogD'), 1 / (this.dist * 4.5));
    };

    gl.useProgram(this.prog);
    const u = (n: string) => this.uni.get(n)!;
    setShared(u);
    gl.uniform3f(u('uSun'), -0.435, 0.414, 0.8);
    gl.uniform1f(u('uTime'), time);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.terrTex);
    gl.uniform1i(u('uTerr'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
    gl.uniform1i(u('uLight'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.biomeTex);
    gl.uniform1i(u('uBiome'), 2);
    gl.bindVertexArray(this.vao);
    if (cam.scale < 0.5) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.coarseIbo);
      gl.drawElements(gl.TRIANGLES, this.coarseCount, gl.UNSIGNED_INT, 0);
    } else {
      const lod = cam.scale < 1.2 ? 1 : 0;
      for (const c of this.chunks) {
        if (!this.aabbVisible(c.aabb, aspect)) continue;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.ibo[lod]);
        gl.drawElements(gl.TRIANGLES, c.count[lod], gl.UNSIGNED_INT, 0);
      }
    }
    gl.bindVertexArray(null);

    // Trees: instanced billboards over the visible forest chunks.
    if (cam.scale >= TREE_MIN_SCALE) {
      gl.useProgram(this.treeProg);
      const tu = (n: string) => this.treeUni.get(n)!;
      setShared(tu);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.treeAtlas);
      gl.uniform1i(tu('uAtlas'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
      gl.uniform1i(tu('uLight'), 1);
      for (const c of this.chunks) {
        if (!c.treeVao || !this.aabbVisible(c.aabb, aspect)) continue;
        gl.bindVertexArray(c.treeVao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, c.treeCount);
      }
      gl.bindVertexArray(null);
    }
  }

  /** Conservative AABB-vs-frustum: cull only when all 8 corners are outside
   *  one frustum plane (5% angular margin against edge popping). */
  private aabbVisible(aabb: [number, number, number, number, number, number], aspect: number): boolean {
    const m = 1.05;
    const kx = (aspect / this.f) * m;
    const ky = (1 / this.f) * m;
    // plane normals n with visibility condition dot(rel, n) <= 0
    const planes = [
      [-this.fwd[0], -this.fwd[1], -this.fwd[2]], // zv >= 0
      [this.right[0] - this.fwd[0] * kx, this.right[1] - this.fwd[1] * kx, this.right[2] - this.fwd[2] * kx],
      [-this.right[0] - this.fwd[0] * kx, -this.right[1] - this.fwd[1] * kx, -this.right[2] - this.fwd[2] * kx],
      [this.up[0] - this.fwd[0] * ky, this.up[1] - this.fwd[1] * ky, this.up[2] - this.fwd[2] * ky],
      [-this.up[0] - this.fwd[0] * ky, -this.up[1] - this.fwd[1] * ky, -this.up[2] - this.fwd[2] * ky],
    ];
    for (const n of planes) {
      let allOut = true;
      for (let c = 0; c < 8 && allOut; c++) {
        const rx = aabb[c & 1 ? 3 : 0] - this.eye[0];
        const ry = aabb[c & 2 ? 4 : 1] - this.eye[1];
        const rz = aabb[c & 4 ? 5 : 2] - this.eye[2];
        if (rx * n[0] + ry * n[1] + rz * n[2] <= 0) allOut = false;
      }
      if (allOut) return false;
    }
    return true;
  }

  /** World point (km, km, relief km) -> canvas px, or null when behind camera. */
  project(wx: number, wy: number, wz: number): [number, number] | null {
    const rx = wx - this.eye[0];
    const ry = wy - this.eye[1];
    const rz = wz - this.eye[2];
    const zv = rx * this.fwd[0] + ry * this.fwd[1] + rz * this.fwd[2];
    if (zv < 1) return null;
    const x = rx * this.right[0] + ry * this.right[1] + rz * this.right[2];
    const y = rx * this.up[0] + ry * this.up[1] + rz * this.up[2];
    const aspect = this.canvas.width / this.canvas.height;
    const ndcX = (x * this.f) / (zv * aspect);
    const ndcY = (y * this.f) / zv;
    return [(ndcX * 0.5 + 0.5) * this.canvas.width, (0.5 - ndcY * 0.5) * this.canvas.height];
  }

  /** Canvas px -> world point on the terrain surface (ray-marched). */
  unproject(sx: number, sy: number): [number, number] {
    const aspect = this.canvas.width / this.canvas.height;
    const ndcX = (sx / this.canvas.width) * 2 - 1;
    const ndcY = 1 - (sy / this.canvas.height) * 2;
    const dx = this.right[0] * (ndcX * aspect) / this.f + this.up[0] * ndcY / this.f + this.fwd[0];
    const dy = this.right[1] * (ndcX * aspect) / this.f + this.up[1] * ndcY / this.f + this.fwd[1];
    const dz = this.right[2] * (ndcX * aspect) / this.f + this.up[2] * ndcY / this.f + this.fwd[2];
    const [ex, ey, ez] = this.eye;
    if (dz >= -1e-6) {
      // Ray skims the horizon: fall back to a far ground point.
      return [ex + dx * this.dist * 4, ey + dy * this.dist * 4];
    }
    // March from where the ray could first touch terrain down to sea level.
    const t0 = Math.max(0, (ez - this.field.maxH) / -dz);
    const t1 = (ez - 0) / -dz;
    const horiz = Math.hypot(dx, dy);
    const steps = Math.min(600, Math.max(8, Math.ceil(((t1 - t0) * Math.max(horiz, 0.05)) / (this.field.cell * 0.75))));
    let lo = t0;
    let hi = t1;
    for (let i = 1; i <= steps; i++) {
      const t = t0 + ((t1 - t0) * i) / steps;
      if (ez + dz * t <= this.field.heightAt(ex + dx * t, ey + dy * t)) {
        hi = t;
        lo = t0 + ((t1 - t0) * (i - 1)) / steps;
        break;
      }
      if (i === steps) lo = hi = t1;
    }
    for (let i = 0; i < 8; i++) {
      const t = (lo + hi) / 2;
      if (ez + dz * t <= this.field.heightAt(ex + dx * t, ey + dy * t)) hi = t;
      else lo = t;
    }
    const t = (lo + hi) / 2;
    return [ex + dx * t, ey + dy * t];
  }
}

/** Deterministic [0,1) hash (tree scatter). */
function hash01(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
