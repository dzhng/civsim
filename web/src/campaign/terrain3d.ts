// 3D campaign terrain on Babylon.js. The camera is Total War-style — straight
// down when zoomed out (political map), tilting toward the horizon as you zoom
// in. cam.scale stays "CSS px per km at the look-at point" at every tilt, so
// the overlay's zoom thresholds keep their meaning.
//
// Babylon owns the engine, scene graph, per-mesh frustum culling, and the
// post pipeline (FXAA, bloom, vignette); the terrain/water/tree surfaces are
// custom ShaderMaterials driven by the biome field (terrain.ts). The camera
// basis is computed here and pushed into Babylon, so project/unproject/
// clampCam stay exact for the Canvas2D overlay and input ray-marching.

import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector2, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { Constants } from '@babylonjs/core/Engines/constants';
import '@babylonjs/core/Engines/Extensions/engine.rawTexture';
import '@babylonjs/core/Meshes/thinInstanceMesh';

import type { CampaignData } from './data';
import type { CamView } from './renderer';
import { TerrainField, SUN, TEMPERATE_Y_KM, hash2 } from './terrain';

const FOV = (45 * Math.PI) / 180;
/** Tilt: 90° (top-down) until TILT_START, easing to MIN_PITCH by TILT_END. */
const TILT_START = 0.32;
const TILT_END = 1.5;
const MIN_PITCH = (52 * Math.PI) / 180;
/** Trees pop in below this height (cam.scale), once they'd be > a few px. */
const TREE_MIN_SCALE = 0.45;
/** Army models show once the world tilts toward 3D; the flat pennant carries
 *  the political map below this. */
const ARMY_MIN_SCALE = 0.4;

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

// Rome 2-style grade: warm tone tilt, saturation lift, gentle contrast.
const GRADE = `
vec3 grade(vec3 c) {
  c = pow(max(c, 0.0), vec3(0.93, 0.97, 1.04));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.22);
  return clamp(c * 1.08 - 0.015, 0.0, 1.0);
}`;

ShaderStore.ShadersStore['campTerrainVertexShader'] = `
precision highp float;
attribute vec3 position;
uniform mat4 viewProjection;
uniform vec4 uBgRect; // minX, minY, maxX, maxY
varying vec2 vUV;
varying float vH;
varying float vZ;
varying vec2 vXY;
void main() {
  gl_Position = viewProjection * vec4(position, 1.0);
  vUV = vec2((position.x - uBgRect.x) / (uBgRect.z - uBgRect.x),
             (uBgRect.w - position.y) / (uBgRect.w - uBgRect.y));
  vH = position.z;
  vZ = gl_Position.w;
  vXY = position.xy;
}`;

ShaderStore.ShadersStore['campTerrainFragmentShader'] = `
precision highp float;
varying vec2 vUV;
varying float vH;
varying float vZ;
varying vec2 vXY;
uniform sampler2D uTerr, uLight, uBiome; // uLight: baked lambert * 128
uniform vec3 uEyePos, uSun, uFogC;
uniform vec2 uFx; // territory alpha, fog strength
uniform float uFogD, uTime;
uniform vec2 uViewport;
${NOISE}
${GRADE}
float nz(vec2 p, float freq, float px) {
  float fade = clamp(1.0 - freq * px * 2.2, 0.0, 1.0);
  if (fade <= 0.0) return 0.5; // sub-pixel octave: skip the hashes entirely
  return mix(0.5, vnoise(p * freq), fade);
}
void main() {
  vec4 b = texture2D(uBiome, vUV); // moisture, forest, rock, signed shore dist
  float water = 1.0 - smoothstep(0.497, 0.503, b.a);
  float px = max(fwidth(vXY.x), fwidth(vXY.y));
  vec3 col = vec3(0.0);

  if (water < 0.999) {
    // ---- land: moisture-graded grass, dune sand, canopy, rock, snow ----
    float m = b.r;
    float g1 = nz(vXY, 0.9, px);
    float g2 = nz(vXY, 3.1, px);
    vec3 grass = mix(vec3(0.52, 0.50, 0.27), vec3(0.22, 0.42, 0.15), smoothstep(0.22, 0.55, m));
    grass *= 0.86 + 0.18 * g1 + 0.10 * g2;
    float dune = abs(nz(vXY, 0.16, px) * 2.0 - 1.0);
    vec3 sand = mix(vec3(0.86, 0.75, 0.52), vec3(0.73, 0.61, 0.40), dune);
    sand *= 0.93 + 0.10 * nz(vXY, 1.6, px);
    vec3 ground = mix(sand, grass, smoothstep(0.16, 0.32, m));
    float landShore = (b.a - 0.5) * 24.0; // cells from the waterline
    ground = mix(vec3(0.80, 0.73, 0.55), ground, smoothstep(0.05, 0.6, landShore));
    float canopy = smoothstep(0.25, 0.7, b.g * (0.55 + 0.9 * nz(vXY, 0.55, px)));
    vec3 forestC = mix(vec3(0.13, 0.25, 0.10), vec3(0.20, 0.33, 0.14), nz(vXY, 1.9, px));
    ground = mix(ground, forestC, canopy);
    vec3 rockC = mix(vec3(0.44, 0.41, 0.37), vec3(0.61, 0.58, 0.53),
                     nz(vec2(vXY.x, vXY.y + vH * 0.9), 0.7, px));
    ground = mix(ground, rockC, smoothstep(0.35, 0.85, b.b) * (0.7 + 0.3 * g1));
    // snowline climbs toward the south: the Alps whiten, the Atlas stays rock
    float snowAt = 21.0 + clamp((700.0 - vXY.y) * 0.006, 0.0, 7.0);
    float snow = smoothstep(snowAt, snowAt + 5.5, vH + (nz(vXY, 0.5, px) - 0.5) * 6.0);
    ground = mix(ground, vec3(0.92, 0.93, 0.96), snow);
    // political mode reads better over calmer ground
    float grey = dot(ground, vec3(0.333));
    ground = mix(ground, vec3(grey) * 1.08, uFx.x * 0.45);
    // contrast-stretch the baked light so ridges carve like they used to
    float li = pow(texture2D(uLight, vUV).r * 2.0, 1.35);
    col = ground * li;
    vec4 t = texture2D(uTerr, vUV);
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
    float shelf = smoothstep(0.0, 0.28, depth + (nz(vXY, 0.5, px) - 0.5) * 0.1);
    vec3 wcol = mix(vec3(0.10, 0.40, 0.44), vec3(0.02, 0.15, 0.28), shelf);
    wcol += 0.06 * (w0 - 0.5);
    vec3 V = normalize(uEyePos - vec3(vXY, 0.0));
    wcol += vec3(1.0, 0.95, 0.8) * pow(max(dot(reflect(-uSun, wn), V), 0.0), 70.0)
            * 0.7 * clamp(1.0 - 0.6 * px, 0.0, 1.0);
    wcol = mix(wcol, vec3(0.34, 0.48, 0.55), pow(1.0 - max(dot(wn, V), 0.0), 3.0) * 0.3);
    float foam = smoothstep(0.6, 0.0, (0.5 - b.a) * 24.0)
               * smoothstep(0.4, 0.8, nz(vXY + vec2(uTime * 3.0, -uTime * 2.0), 2.3, px));
    wcol = mix(wcol, vec3(0.88, 0.93, 0.94), foam * 0.7);
    col = mix(col, wcol, water);
  }

  if (uFx.y > 0.001) {
    float fog = (1.0 - exp(-pow(vZ * uFogD, 2.0))) * uFx.y;
    col = mix(col, uFogC, clamp(fog, 0.0, 1.0));
  }
  // Rome 2 frames the world in shadow: a quiet screen-space vignette.
  vec2 vp = gl_FragCoord.xy / uViewport * 2.0 - 1.0;
  col *= 0.84 + 0.16 * smoothstep(1.55, 0.45, length(vp * vec2(1.0, 0.85)));
  gl_FragColor = vec4(grade(col), 1.0);
}`;

ShaderStore.ShadersStore['campTreeVertexShader'] = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 world0;
attribute vec4 world1;
attribute vec4 world2;
attribute vec4 world3;
uniform mat4 viewProjection;
uniform vec4 uBgRect;
varying vec2 vUV;
varying vec2 vLightUV;
varying float vZ;
void main() {
  mat4 world = mat4(world0, world1, world2, world3);
  vec4 wp = world * vec4(position, 1.0);
  gl_Position = viewProjection * wp;
  vUV = uv;
  vLightUV = vec2((world[3].x - uBgRect.x) / (uBgRect.z - uBgRect.x),
                  (uBgRect.w - world[3].y) / (uBgRect.w - uBgRect.y));
  vZ = gl_Position.w;
}`;

ShaderStore.ShadersStore['campTreeFragmentShader'] = `
precision highp float;
varying vec2 vUV;
varying vec2 vLightUV;
varying float vZ;
uniform sampler2D uAtlas, uLight;
uniform vec3 uFogC;
uniform vec2 uFx;
uniform float uFogD;
${GRADE}
void main() {
  vec4 c = texture2D(uAtlas, vUV);
  if (c.a < 0.5) discard;
  vec3 col = c.rgb * (texture2D(uLight, vLightUV).r * 2.0);
  if (uFx.y > 0.001) {
    float fog = (1.0 - exp(-pow(vZ * uFogD, 2.0))) * uFx.y;
    col = mix(col, uFogC, clamp(fog, 0.0, 1.0));
  }
  gl_FragColor = vec4(grade(col), c.a);
}`;

// Army models: low-poly meshes, thin-instanced per army. world0..3 carry the
// per-army transform, iColor the faction tint; lit by the one campaign sun.
ShaderStore.ShadersStore['campArmyVertexShader'] = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec4 world0;
attribute vec4 world1;
attribute vec4 world2;
attribute vec4 world3;
attribute vec4 iColor;
attribute vec4 color;     // baked part tint: dark base, bright figures
uniform mat4 viewProjection;
varying vec3 vN;
varying vec3 vCol;
varying vec3 vTint;
varying float vZ;
void main() {
  mat4 world = mat4(world0, world1, world2, world3);
  vec4 wp = world * vec4(position, 1.0);
  gl_Position = viewProjection * wp;
  vN = normalize((world * vec4(normal, 0.0)).xyz);
  vCol = iColor.rgb;
  vTint = color.rgb;
  vZ = gl_Position.w;
}`;

ShaderStore.ShadersStore['campArmyFragmentShader'] = `
precision highp float;
varying vec3 vN;
varying vec3 vCol;
varying vec3 vTint;
varying float vZ;
uniform vec3 uSun, uFogC;
uniform float uFogD, uFogStr;
${GRADE}
void main() {
  float li = 0.45 + 0.7 * max(dot(normalize(vN), uSun), 0.0);
  vec3 col = vCol * vTint * li;
  if (uFogStr > 0.001) {
    float fog = (1.0 - exp(-pow(vZ * uFogD, 2.0))) * uFogStr;
    col = mix(col, uFogC, clamp(fog, 0.0, 1.0));
  }
  gl_FragColor = vec4(grade(col), 1.0);
}`;

/** Procedural 2-variant tree atlas: broadleaf | conifer. */
function buildTreeAtlas(scene: Scene): Texture {
  const tex = new DynamicTexture('treeAtlas', { width: 256, height: 256 }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  let seed = 7;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x80000000;
  ctx.clearRect(0, 0, 256, 256);
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
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

export class Terrain3D {
  private engine: Engine;
  private scene: Scene;
  private camera: FreeCamera;
  private terrainMat: ShaderMaterial;
  private treeMat: ShaderMaterial;
  private armyMat!: ShaderMaterial;
  private chunks: Mesh[] = [];
  private coarse!: Mesh;
  private treeMeshes: Mesh[] = [];
  private armyMesh: Mesh | null = null;
  private armyCount = 0;
  private factionColors: number[][];
  private terrTex: RawTexture;
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
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, false);
    const scene = new Scene(this.engine);
    this.scene = scene;
    // World axes used directly: x east, y north, z up (right-handed).
    scene.useRightHandedSystem = true;
    scene.clearColor = new Color4(0.07, 0.09, 0.1, 1);
    scene.skipPointerMovePicking = true;

    this.camera = new FreeCamera('cam', new Vector3(0, 0, 1000), scene);
    this.camera.fov = FOV; // vertical
    this.camera.upVector = new Vector3(0, 0, 1);

    const r = data.bgRect;
    this.bgRect = [r.min[0], r.min[1], r.max[0], r.max[1]];
    this.factionColors = data.map.factions.map((f) =>
      (f.color ?? [150, 150, 150]).map((v) => v / 255));

    const { w, h } = field;
    const dataTex = (bytes: Uint8Array) =>
      new RawTexture(bytes, w, h, Constants.TEXTUREFORMAT_RGBA, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
    // light expands to RGBA: single-channel raw textures bind unreliably
    const lightRgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) lightRgba[i * 4] = field.light[i];
    const lightTex = dataTex(lightRgba);
    const biomeTex = dataTex(field.biome);
    this.terrTex = dataTex(new Uint8Array(w * h * 4));

    this.terrainMat = new ShaderMaterial('terrain', scene, 'campTerrain', {
      attributes: ['position'],
      uniforms: ['viewProjection', 'uBgRect', 'uEyePos', 'uSun', 'uFogC', 'uFx', 'uFogD', 'uTime', 'uViewport'],
      samplers: ['uTerr', 'uLight', 'uBiome'],
    });
    this.terrainMat.setTexture('uTerr', this.terrTex);
    this.terrainMat.setTexture('uLight', lightTex);
    this.terrainMat.setTexture('uBiome', biomeTex);
    this.terrainMat.setVector3('uSun', new Vector3(...SUN)); // the one campaign sun
    this.terrainMat.setColor3('uFogC', new Color3(0.71, 0.71, 0.68));
    this.terrainMat.setFloat('uTime', 0);
    this.terrainMat.setVector4('uBgRect', new Vector4(...this.bgRect));
    this.terrainMat.backFaceCulling = false;

    this.treeMat = new ShaderMaterial('tree', scene, 'campTree', {
      attributes: ['position', 'uv', 'world0', 'world1', 'world2', 'world3'],
      uniforms: ['viewProjection', 'uBgRect', 'uFogC', 'uFx', 'uFogD'],
      samplers: ['uAtlas', 'uLight'],
      needAlphaTesting: true,
    });
    this.treeMat.setTexture('uAtlas', buildTreeAtlas(scene));
    this.treeMat.setTexture('uLight', lightTex);
    this.treeMat.setColor3('uFogC', new Color3(0.71, 0.71, 0.68));
    this.treeMat.setVector4('uBgRect', new Vector4(...this.bgRect));
    this.treeMat.backFaceCulling = false;

    this.armyMat = new ShaderMaterial('army', scene, 'campArmy', {
      attributes: ['position', 'normal', 'color', 'world0', 'world1', 'world2', 'world3', 'iColor'],
      uniforms: ['viewProjection', 'uSun', 'uFogC', 'uFogD', 'uFogStr'],
    });
    this.armyMat.setVector3('uSun', new Vector3(...SUN));
    this.armyMat.setColor3('uFogC', new Color3(0.71, 0.71, 0.68));

    this.buildTerrain();
    this.buildTrees();
    this.buildArmyModel();

    // FXAA + a whisper of bloom and vignette: the part of the Rome 2 look
    // the surface shaders can't do alone.

  }

  /** Chunked terrain meshes (Babylon culls per mesh) + a coarse whole-map
   *  mesh for the zoomed-out view where relief is shading, not silhouette. */
  private buildTerrain() {
    const { w, h, cell, minX, maxY, height } = this.field;
    const positions = new Float32Array(w * h * 3);
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const i = gy * w + gx;
        positions[i * 3] = minX + (gx + 0.5) * cell;
        positions[i * 3 + 1] = maxY - (gy + 0.5) * cell;
        positions[i * 3 + 2] = height[i];
      }
    }
    const buildIdx = (step: number, x0: number, x1: number, y0: number, y1: number) => {
      const out: number[] = [];
      for (let gy = y0; gy + step <= y1 && gy + step < h; gy += step) {
        for (let gx = x0; gx + step <= x1 && gx + step < w; gx += step) {
          const i = gy * w + gx;
          out.push(i, i + step * w, i + step, i + step, i + step * w, i + step * w + step);
        }
      }
      return out;
    };
    const makeMesh = (name: string, idx: number[]) => {
      const m = new Mesh(name, this.scene);
      const vd = new VertexData();
      vd.positions = positions;
      vd.indices = idx;
      vd.applyToMesh(m);
      m.material = this.terrainMat;
      m.freezeWorldMatrix(); // static geometry, identity world
      return m;
    };
    this.coarse = makeMesh('coarse', buildIdx(4, 0, w - 1, 0, h - 1));
    const TILE = 64;
    for (let ty = 0; ty < h - 1; ty += TILE) {
      for (let tx = 0; tx < w - 1; tx += TILE) {
        const x1 = Math.min(tx + TILE, w - 1);
        const y1 = Math.min(ty + TILE, h - 1);
        const idx = buildIdx(1, tx, x1, ty, y1);
        if (idx.length === 0) continue;
        this.chunks.push(makeMesh(`chunk${tx}_${ty}`, idx));
      }
    }
  }

  /** All trees as thin instances of two vertical quads (broadleaf/conifer
   *  atlas halves). The camera never yaws, so fixed billboards read fine. */
  private buildTrees() {
    const { w, h, cell, minX, maxY } = this.field;
    const broadleaf: number[] = [];
    const conifer: number[] = [];
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const i = gy * w + gx;
        const forest = this.field.biome[i * 4 + 1] / 255;
        if (forest < 0.35) continue;
        const k = Math.round(forest * 3 * (0.5 + hash2(gx, gy) * 0.9));
        for (let t = 0; t < k; t++) {
          const ox = (hash2(gx * 7 + t, gy * 13 + 1) - 0.5) * cell * 1.4;
          const oy = (hash2(gx * 3 + t, gy * 17 + 5) - 0.5) * cell * 1.4;
          const x = minX + (gx + 0.5) * cell + ox;
          const y = maxY - (gy + 0.5) * cell + oy;
          const size = 2.0 + hash2(gx + t, gy + t) * 1.8;
          const z = this.field.heightAt(x, y) - 0.15;
          const out = hash2(gx * 5 + t, gy * 11) < (y > TEMPERATE_Y_KM ? 0.75 : 0.25) ? conifer : broadleaf;
          // column-major TRS: scale (w, 1, h), translate (x, y, z)
          out.push(size * 0.72, 0, 0, 0, 0, 1, 0, 0, 0, 0, size, 0, x, y, z, 1);
        }
      }
    }
    const makeTreeMesh = (name: string, mats: number[], u0: number) => {
      if (!mats.length) return;
      const m = new Mesh(name, this.scene);
      const vd = new VertexData();
      // vertical quad, base at origin, spanning world x and z
      vd.positions = [-0.5, 0, 0, 0.5, 0, 0, -0.5, 0, 1, 0.5, 0, 1];
      vd.indices = [0, 1, 2, 2, 1, 3];
      vd.uvs = [u0, 0, u0 + 0.5, 0, u0, 1, u0 + 0.5, 1];
      vd.applyToMesh(m);
      m.material = this.treeMat;
      m.thinInstanceSetBuffer('matrix', new Float32Array(mats), 16, true);
      // static thin instances keep the unit quad's bounds: hand it the map's
      const [x0, y0, x1, y1] = this.bgRect;
      m.setBoundingInfo(new BoundingInfo(new Vector3(x0, y0, 0), new Vector3(x1, y1, 40)));
      this.treeMeshes.push(m);
    };
    makeTreeMesh('broadleaf', broadleaf, 0);
    makeTreeMesh('conifers', conifer, 0.5);
  }

  /** One low-poly model — a banner-bearer's knot on a round base — merged
   *  once and thin-instanced per army (faction-tinted, repositioned each
   *  frame). Built standing along +z (world up); base sits on the ground. */
  private buildArmyModel() {
    const parts: Mesh[] = [];
    // Bake a flat part tint into vertex colors: the per-army faction color
    // (iColor) multiplies this, so the base reads as a muted dark footprint
    // while the figures carry the full faction hue.
    const tint = (m: Mesh, r: number, g: number, b: number) => {
      const v = m.getTotalVertices();
      const c = new Float32Array(v * 4);
      for (let i = 0; i < v; i++) {
        c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = 1;
      }
      m.setVerticesData(VertexBuffer.ColorKind, c);
      parts.push(m);
    };
    const base = CreateCylinder('b', { diameterTop: 2.6, diameterBottom: 3.2, height: 0.35, tessellation: 20 }, this.scene);
    base.rotation.x = Math.PI / 2; // cylinder axis Y -> world up Z
    base.position.z = 0.18;
    tint(base, 0.32, 0.32, 0.34); // dark muted footprint
    // A soldier: tapered body + a head, standing on the base.
    const soldier = (sx: number, sy: number, hgt: number) => {
      const body = CreateCylinder('s', { diameterTop: 0.45, diameterBottom: 0.8, height: hgt, tessellation: 6 }, this.scene);
      body.rotation.x = Math.PI / 2;
      body.position.set(sx, sy, 0.35 + hgt / 2);
      tint(body, 1, 1, 1); // full faction color
      const head = CreateBox('h', { size: 0.62 }, this.scene);
      head.rotation.z = Math.PI / 4;
      head.position.set(sx, sy, 0.35 + hgt + 0.22);
      tint(head, 0.85, 0.72, 0.6); // flesh, faction-tinted
    };
    soldier(0, 0.25, 3.1); // the standard-bearer, taller and central
    soldier(1.15, 0.35, 2.3);
    soldier(-1.15, 0.45, 2.3);
    soldier(0.55, -1.1, 2.3);
    soldier(-0.65, -1.0, 2.3);
    // The standard: a pole rising from the central figure (the 3D twin of the
    // flat pennant that flies above it).
    const pole = CreateBox('p', { width: 0.13, depth: 0.13, height: 4.0 }, this.scene);
    pole.rotation.x = Math.PI / 2;
    pole.position.set(0, 0.25, 0.35 + 2.0);
    tint(pole, 0.5, 0.4, 0.3); // wood, faction-tinted

    const merged = Mesh.MergeMeshes(parts, true, true);
    if (!merged) return;
    merged.name = 'armies';
    merged.material = this.armyMat;
    merged.alwaysSelectAsActiveMesh = true; // dynamic instance set; skip culling
    merged.setEnabled(false);
    this.armyMesh = merged;
  }

  /** Reposition the army models from the live army list (called each frame
   *  before draw). Cheap: a few dozen instances, two small buffers. */
  setArmies(armies: { x: number; y: number; faction: number }[], scale: number) {
    const m = this.armyMesh;
    if (!m) return;
    const n = armies.length;
    this.armyCount = n;
    if (n === 0) {
      m.thinInstanceCount = 0;
      return;
    }
    const mats = new Float32Array(n * 16);
    const cols = new Float32Array(n * 4);
    // Hold a roughly constant on-screen footprint (the model is ~3.2 km wide
    // per unit S; scale is CSS px/km) so armies read at play zoom without
    // ballooning up close — clamped so they never dwarf a city or vanish.
    const S = Math.min(6, Math.max(2.5, 40 / (3.2 * scale)));
    for (let i = 0; i < n; i++) {
      const a = armies[i];
      const z = Math.max(0, this.field.heightAt(a.x, a.y));
      const o = i * 16;
      mats[o] = S; mats[o + 5] = S; mats[o + 10] = S; mats[o + 15] = 1;
      mats[o + 12] = a.x; mats[o + 13] = a.y; mats[o + 14] = z;
      const c = this.factionColors[a.faction] ?? [0.6, 0.6, 0.6];
      cols[i * 4] = c[0]; cols[i * 4 + 1] = c[1]; cols[i * 4 + 2] = c[2]; cols[i * 4 + 3] = 1;
    }
    m.thinInstanceSetBuffer('matrix', mats, 16, false);
    m.thinInstanceSetBuffer('iColor', cols, 4, false);
  }

  updateTerritory(rgba: Uint8Array) {
    this.terrTex.update(rgba);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.engine.setSize(w, h);
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

  /** Keep the whole viewport on the map: zoom floor = aspect-fill (no void
   *  past the edges), and pan stays inside the map rect. Mutates cam. */
  clampCam(cam: CamView) {
    const cssW = this.canvas.clientWidth || this.canvas.width;
    const cssH = this.canvas.clientHeight || this.canvas.height;
    const [minX, minY, maxX, maxY] = this.bgRect;
    cam.scale = Math.max(cam.scale, Math.max(cssW / (maxX - minX), cssH / (maxY - minY)));
    this.updateCamera(cam);
    const W = this.canvas.width;
    const H = this.canvas.height;
    for (let iter = 0; iter < 2; iter++) {
      let lo = [Infinity, Infinity];
      let hi = [-Infinity, -Infinity];
      for (const [sx, sy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
        const [wx, wy] = this.unproject(sx, sy);
        lo = [Math.min(lo[0], wx), Math.min(lo[1], wy)];
        hi = [Math.max(hi[0], wx), Math.max(hi[1], wy)];
      }
      let dx = 0;
      let dy = 0;
      if (hi[0] - lo[0] >= maxX - minX) dx = (maxX + minX) / 2 - (hi[0] + lo[0]) / 2;
      else if (lo[0] < minX) dx = minX - lo[0];
      else if (hi[0] > maxX) dx = maxX - hi[0];
      if (hi[1] - lo[1] >= maxY - minY) dy = (maxY + minY) / 2 - (hi[1] + lo[1]) / 2;
      else if (lo[1] < minY) dy = minY - lo[1];
      else if (hi[1] > maxY) dy = maxY - hi[1];
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
      cam.x += dx;
      cam.y += dy;
      this.updateCamera(cam);
    }
  }

  /** Recompute the camera basis and push it into Babylon. draw() does this;
   *  call it directly when project/unproject must reflect a cam change now. */
  updateCamera(cam: CamView) {
    const p = this.pitchFor(cam.scale);
    this.pitch = p;
    // cam.scale is CSS px per km: identical framing on any devicePixelRatio.
    const cssH = this.canvas.clientHeight || this.canvas.height;
    this.dist = cssH / (2 * cam.scale * Math.tan(FOV / 2));
    const cp = Math.cos(p);
    const sp = Math.sin(p);
    this.eye = [cam.x, cam.y - this.dist * cp, this.dist * sp];
    this.right = [1, 0, 0];
    this.fwd = [0, cp, -sp];
    this.up = [0, sp, cp];
    this.camera.position.set(this.eye[0], this.eye[1], this.eye[2]);
    this.camera.upVector.set(this.up[0], this.up[1], this.up[2]);
    this.camera.setTarget(new Vector3(cam.x, cam.y, 0));
    this.camera.minZ = Math.max(1, this.dist * 0.04);
    this.camera.maxZ = this.dist * 8 + 8000;
  }

  draw(cam: CamView) {
    this.updateCamera(cam);
    const tilt = (Math.PI / 2 - this.pitch) / (Math.PI / 2 - MIN_PITCH);
    const time = this.fixedTime ?? performance.now() / 1000;

    const coarseView = cam.scale < 0.5;
    this.coarse.setEnabled(coarseView);
    for (const c of this.chunks) c.setEnabled(!coarseView);
    for (const t of this.treeMeshes) t.setEnabled(cam.scale >= TREE_MIN_SCALE);
    this.armyMesh?.setEnabled(cam.scale >= ARMY_MIN_SCALE && this.armyCount > 0);

    this.terrainMat.setVector3('uEyePos', this.camera.position);
    this.terrainMat.setVector2('uFx', new Vector2(this.territoryAlpha(cam.scale), tilt * 0.85));
    this.terrainMat.setFloat('uFogD', 1 / (this.dist * 4.5));
    this.terrainMat.setFloat('uTime', time);
    this.terrainMat.setVector2('uViewport', new Vector2(this.canvas.width, this.canvas.height));
    this.treeMat.setVector2('uFx', new Vector2(0, tilt * 0.85));
    this.treeMat.setFloat('uFogD', 1 / (this.dist * 4.5));
    this.armyMat.setFloat('uFogD', 1 / (this.dist * 4.5));
    this.armyMat.setFloat('uFogStr', tilt * 0.85);

    this.engine.beginFrame();
    this.scene.render();
    this.engine.endFrame();
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
