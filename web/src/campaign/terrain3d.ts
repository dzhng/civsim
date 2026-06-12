// 3D campaign terrain: a heightfield mesh under the Canvas2D marker overlay.
// The camera is Total War-style — straight down when zoomed out (political
// map), tilting toward the horizon as you zoom in. cam.scale stays "px per km
// at the look-at point" at every tilt, so all the overlay's zoom thresholds
// keep meaning what they meant in the flat renderer.

import type { CampaignData } from './data';
import { compileProgram, uploadMipmapTexture } from '../shared/glutil';
import type { CamView } from './renderer';
import { TerrainField } from './terrain';

const FOV = (45 * Math.PI) / 180;
/** Tilt: 90° (top-down) until TILT_START, easing to MIN_PITCH by TILT_END. */
const TILT_START = 0.32;
const TILT_END = 1.5;
const MIN_PITCH = (52 * Math.PI) / 180;

const VS = `#version 300 es
precision highp float;
in vec3 aPos;   // world x, y (km), relief height (km)
uniform vec3 uEye, uRight, uUp, uFwd;
uniform vec2 uFA;     // 1/tan(fov/2), aspect
uniform vec2 uNF;     // near, far
uniform vec4 uBgRect; // minX, minY, maxX, maxY
out vec2 vUV;
out float vH;
out float vZ;
out vec2 vXY;
void main() {
  vec3 rel = aPos - uEye;
  float zv = dot(rel, uFwd);
  float x = dot(rel, uRight);
  float y = dot(rel, uUp);
  float n = uNF.x, f = uNF.y;
  float zc = zv * (f + n) / (f - n) - 2.0 * f * n / (f - n);
  gl_Position = vec4(x * uFA.x / uFA.y, y * uFA.x, zc, zv);
  vUV = vec2((aPos.x - uBgRect.x) / (uBgRect.z - uBgRect.x),
             (uBgRect.w - aPos.y) / (uBgRect.w - uBgRect.y));
  vH = aPos.z;
  vZ = zv;
  vXY = aPos.xy;
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV;
in float vH;
in float vZ;
in vec2 vXY;
uniform sampler2D uBg, uTerr, uLight; // uLight: baked lambert, value = light * 128
uniform vec3 uFogC;
uniform vec3 uFx; // territory alpha, detail strength, fog strength
uniform float uFogD;
out vec4 outColor;
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
}
void main() {
  vec3 base = texture(uBg, vUV).rgb;
  float water = 1.0 - step(0.05, vH);
  float li = texture(uLight, vUV).r * 2.0;
  vec3 col = base * mix(1.0, li, 1.0 - water * 0.65);
  if (uFx.y > 0.001) {
    float det = ((vnoise(vXY * 0.32) - 0.5) + (vnoise(vXY * 1.3) - 0.5) * 0.5)
                * uFx.y * (1.0 - water);
    col *= 1.0 + det;
  }
  vec4 t = texture(uTerr, vUV);
  col = mix(col, t.rgb, t.a * uFx.x * (1.0 - water));
  if (uFx.z > 0.001) {
    float fog = (1.0 - exp(-pow(vZ * uFogD, 2.0))) * uFx.z;
    col = mix(col, uFogC, clamp(fog, 0.0, 1.0));
  }
  outColor = vec4(col, 1.0);
}`;

export class Terrain3D {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private coarseIbo: WebGLBuffer;
  private coarseCount: number;
  /** frustum-culled tiles, two LODs each: [full, half] */
  private chunks: { aabb: [number, number, number, number, number, number]; ibo: [WebGLBuffer, WebGLBuffer]; count: [number, number] }[] = [];
  private bgTex: WebGLTexture;
  private terrTex: WebGLTexture;
  private lightTex: WebGLTexture;
  private uni = new Map<string, WebGLUniformLocation>();

  // Camera basis for this frame, shared with project/unproject.
  private eye = [0, 0, 1000];
  private right = [1, 0, 0];
  private up = [0, 1, 0];
  private fwd = [0, 0, -1];
  private f = 1 / Math.tan(FOV / 2);
  private dist = 1000;
  pitch = Math.PI / 2;

  constructor(private canvas: HTMLCanvasElement, private field: TerrainField, data: CampaignData) {
    const gl = canvas.getContext('webgl2', { antialias: true })!;
    this.gl = gl;
    this.prog = compileProgram(gl, VS, FS);
    for (const name of ['uEye', 'uRight', 'uUp', 'uFwd', 'uFA', 'uNF', 'uBgRect', 'uBg', 'uTerr', 'uLight', 'uFogC', 'uFx', 'uFogD']) {
      this.uni.set(name, gl.getUniformLocation(this.prog, name)!);
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
        for (let gy = ty; gy <= y1; gy++) {
          for (let gx = tx; gx <= x1; gx++) zMax = Math.max(zMax, height[gy * w + gx]);
        }
        const full = buildIdx(1, tx, x1, ty, y1);
        const half = buildIdx(2, tx, x1, ty, y1);
        if (full.length === 0) continue;
        this.chunks.push({
          aabb: [
            minX + (tx + 0.5) * cell, maxY - (y1 + 0.5) * cell, 0,
            minX + (x1 + 0.5) * cell, maxY - (ty + 0.5) * cell, zMax,
          ],
          ibo: [upload(full), upload(half)],
          count: [full.length, half.length],
        });
      }
    }

    this.lightTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, field.light);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.bgTex = uploadMipmapTexture(gl, data.bg);
    this.terrTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.terrTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.w, field.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const r = data.bgRect;
    this.bgRect = [r.min[0], r.min[1], r.max[0], r.max[1]];
    gl.enable(gl.DEPTH_TEST);
  }

  private bgRect: [number, number, number, number];

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

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.05, 0.08, 0.11, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    const u = (n: string) => this.uni.get(n)!;
    gl.uniform3fv(u('uEye'), this.eye);
    gl.uniform3fv(u('uRight'), this.right);
    gl.uniform3fv(u('uUp'), this.up);
    gl.uniform3fv(u('uFwd'), this.fwd);
    gl.uniform2f(u('uFA'), this.f, canvas.width / canvas.height);
    gl.uniform2f(u('uNF'), near, far);
    gl.uniform4fv(u('uBgRect'), this.bgRect);
    gl.uniform3f(u('uFogC'), 0.64, 0.69, 0.77);
    const detail = Math.min(1, Math.max(0, (cam.scale - 0.5) / 2)) * 0.22;
    const tilt = (Math.PI / 2 - this.pitch) / (Math.PI / 2 - MIN_PITCH);
    gl.uniform3f(u('uFx'), this.territoryAlpha(cam.scale), detail, tilt * 0.85);
    gl.uniform1f(u('uFogD'), 1 / (this.dist * 4.5));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    gl.uniform1i(u('uBg'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.terrTex);
    gl.uniform1i(u('uTerr'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
    gl.uniform1i(u('uLight'), 2);
    gl.bindVertexArray(this.vao);
    if (cam.scale < 0.5) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.coarseIbo);
      gl.drawElements(gl.TRIANGLES, this.coarseCount, gl.UNSIGNED_INT, 0);
    } else {
      const lod = cam.scale < 1.2 ? 1 : 0;
      const aspect = canvas.width / canvas.height;
      for (const c of this.chunks) {
        if (!this.aabbVisible(c.aabb, aspect)) continue;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.ibo[lod]);
        gl.drawElements(gl.TRIANGLES, c.count[lod], gl.UNSIGNED_INT, 0);
      }
    }
    gl.bindVertexArray(null);
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
