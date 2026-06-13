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
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
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
/** Above this zoom, 3D settlements replace the flat city squares (the overlay
 *  reads the same constant to suppress its squares). */
export const CITY_MODEL_MIN_SCALE = 0.5;

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

// Instanced 3D map models (armies, settlements): low-poly meshes thin-instanced
// per object. world0..3 carry the transform, iColor the owner's faction tint.
// The baked vertex color is the part's own material; its ALPHA flags whether
// the faction tint applies (1 = banner/livery, 0 = neutral stone/timber), so
// one mesh can mix faction-colored standards with neutral architecture.
ShaderStore.ShadersStore['campModelVertexShader'] = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec4 world0;
attribute vec4 world1;
attribute vec4 world2;
attribute vec4 world3;
attribute vec4 iColor;
attribute vec4 color;
uniform mat4 viewProjection;
varying vec3 vN;
varying vec3 vFaction;
varying vec3 vTint;
varying float vFac;
varying float vHi;
varying float vZ;
void main() {
  mat4 world = mat4(world0, world1, world2, world3);
  vec4 wp = world * vec4(position, 1.0);
  gl_Position = viewProjection * wp;
  vN = normalize((world * vec4(normal, 0.0)).xyz);
  vFaction = iColor.rgb;
  vTint = color.rgb;
  vFac = color.a;
  vHi = iColor.a; // per-instance highlight: 0 none, ~0.5 hover, 1 selected
  vZ = gl_Position.w;
}`;

ShaderStore.ShadersStore['campModelFragmentShader'] = `
precision highp float;
varying vec3 vN;
varying vec3 vFaction;
varying vec3 vTint;
varying float vFac;
varying float vHi;
varying float vZ;
uniform vec3 uSun, uFogC;
uniform float uFogD, uFogStr;
${GRADE}
void main() {
  float li = 0.45 + 0.7 * max(dot(normalize(vN), uSun), 0.0);
  // neutral parts keep their material; livery parts take the faction hue
  vec3 col = vTint * mix(vec3(1.0), vFaction, vFac) * li;
  // selection/hover: lift toward a warm glow so the picked army reads
  col = mix(col, col * 1.5 + vec3(0.28, 0.22, 0.08), vHi);
  if (uFogStr > 0.001) {
    float fog = (1.0 - exp(-pow(vZ * uFogD, 2.0))) * uFogStr;
    col = mix(col, uFogC, clamp(fog, 0.0, 1.0));
  }
  gl_FragColor = vec4(grade(col), 1.0);
}`;

// Contact shadows: soft dark discs the army/city models drop on the ground,
// nudged toward the anti-sun direction so they read as cast shadows. Cheap
// and deterministic — true CSM would need shadow-map plumbing through every
// custom material.
ShaderStore.ShadersStore['campShadowVertexShader'] = `
precision highp float;
attribute vec3 position;       // unit quad, XY in [-0.5, 0.5]
attribute vec4 world0;
attribute vec4 world1;
attribute vec4 world2;
attribute vec4 world3;
uniform mat4 viewProjection;
varying vec2 vL;
void main() {
  mat4 world = mat4(world0, world1, world2, world3);
  gl_Position = viewProjection * world * vec4(position, 1.0);
  vL = position.xy;
}`;

ShaderStore.ShadersStore['campShadowFragmentShader'] = `
precision highp float;
varying vec2 vL;
uniform float uStr;
void main() {
  float a = clamp(1.0 - length(vL) * 2.0, 0.0, 1.0);
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * a * uStr);
}`;

/** Anti-sun ground direction (where shadows fall), from the one campaign sun. */
const SHADOW_DIR: [number, number] = (() => {
  const l = Math.hypot(SUN[0], SUN[1]) || 1;
  return [-SUN[0] / l, -SUN[1] / l];
})();

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
  private modelMat!: ShaderMaterial;
  private chunks: Mesh[] = [];
  private coarse!: Mesh;
  private treeMeshes: Mesh[] = [];
  private armyMesh: Mesh | null = null;
  private armyCount = 0;
  private cityMesh: Mesh | null = null;
  private shadowMat!: ShaderMaterial;
  private armyShadow: Mesh | null = null;
  private cityShadow: Mesh | null = null;
  /** city node index per thin instance, for owner-color lookups */
  private cityNodes: number[] = [];
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

    this.modelMat = new ShaderMaterial('model', scene, 'campModel', {
      attributes: ['position', 'normal', 'color', 'world0', 'world1', 'world2', 'world3', 'iColor'],
      uniforms: ['viewProjection', 'uSun', 'uFogC', 'uFogD', 'uFogStr'],
    });
    this.modelMat.setVector3('uSun', new Vector3(...SUN));
    this.modelMat.setColor3('uFogC', new Color3(0.71, 0.71, 0.68));

    this.shadowMat = new ShaderMaterial('shadow', scene, 'campShadow', {
      attributes: ['position', 'world0', 'world1', 'world2', 'world3'],
      uniforms: ['viewProjection', 'uStr'],
    });
    this.shadowMat.setFloat('uStr', 0.5);
    this.shadowMat.alpha = 0.999; // flag the transparent pass (it blends, never writes depth)
    this.shadowMat.backFaceCulling = false;
    this.shadowMat.disableDepthWrite = true;

    this.buildTerrain();
    this.buildTrees();
    this.buildArmyModel();
    this.buildCityModel(data);

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
  /** Bake a flat material into a part's vertex colors. Alpha is the faction
   *  flag: 1 = livery (takes the owner hue), 0 = neutral stone/timber. */
  private paint(m: Mesh, r: number, g: number, b: number, a = 1): Mesh {
    const v = m.getTotalVertices();
    const c = new Float32Array(v * 4);
    for (let i = 0; i < v; i++) {
      c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = a;
    }
    m.setVerticesData(VertexBuffer.ColorKind, c);
    return m;
  }

  /** A unit quad (XY plane) carrying the shadow material, for thin instances. */
  private shadowQuad(name: string): Mesh {
    const m = new Mesh(name, this.scene);
    const vd = new VertexData();
    vd.positions = [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0];
    vd.indices = [0, 1, 2, 2, 1, 3];
    vd.applyToMesh(m);
    m.material = this.shadowMat;
    m.alwaysSelectAsActiveMesh = true;
    m.setEnabled(false);
    return m;
  }

  /** A flat disc of radius `r` on the ground at (x,y,z), nudged toward the
   *  anti-sun direction so it reads as a cast shadow. Writes one 4x4 (16). */
  private shadowMatrix(buf: Float32Array, o: number, x: number, y: number, z: number, r: number) {
    // Push the disc clear of the footprint so the shadow reads beside the
    // model (toward anti-sun) rather than hiding under its base.
    buf[o] = 2 * r; buf[o + 5] = 2 * r; buf[o + 10] = 1; buf[o + 15] = 1;
    buf[o + 12] = x + SHADOW_DIR[0] * r * 0.85;
    buf[o + 13] = y + SHADOW_DIR[1] * r * 0.85;
    buf[o + 14] = z + 0.06; // float just above the ground to dodge z-fighting
  }

  private buildArmyModel() {
    const parts: Mesh[] = [];
    const base = CreateCylinder('b', { diameterTop: 2.6, diameterBottom: 3.2, height: 0.35, tessellation: 20 }, this.scene);
    base.rotation.x = Math.PI / 2; // cylinder axis Y -> world up Z
    base.position.z = 0.18;
    parts.push(this.paint(base, 0.32, 0.32, 0.34)); // dark muted footprint, faction-tinted
    // A soldier: tapered body + a head, standing on the base.
    const soldier = (sx: number, sy: number, hgt: number) => {
      const body = CreateCylinder('s', { diameterTop: 0.45, diameterBottom: 0.8, height: hgt, tessellation: 6 }, this.scene);
      body.rotation.x = Math.PI / 2;
      body.position.set(sx, sy, 0.35 + hgt / 2);
      parts.push(this.paint(body, 1, 1, 1)); // full faction color
      const head = CreateBox('h', { size: 0.62 }, this.scene);
      head.rotation.z = Math.PI / 4;
      head.position.set(sx, sy, 0.35 + hgt + 0.22);
      parts.push(this.paint(head, 0.85, 0.72, 0.6)); // flesh, faction-tinted
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
    parts.push(this.paint(pole, 0.5, 0.4, 0.3)); // wood, faction-tinted

    const merged = Mesh.MergeMeshes(parts, true, true);
    if (!merged) return;
    merged.name = 'armies';
    merged.material = this.modelMat;
    merged.alwaysSelectAsActiveMesh = true; // dynamic instance set; skip culling
    merged.setEnabled(false);
    this.armyMesh = merged;
    this.armyShadow = this.shadowQuad('armyShadow');
  }

  /** One settlement — a walled knot of terracotta-roofed buildings under a
   *  faction standard — merged once and thin-instanced per city: static
   *  positions, tier-scaled, owner color set by setCityOwners. */
  private buildCityModel(data: CampaignData) {
    const parts: Mesh[] = [];
    // Rampart ring (a flat torus laid on the ground): neutral stone.
    const wall = CreateTorus('cw', { diameter: 9.5, thickness: 1.4, tessellation: 18 }, this.scene);
    wall.rotation.x = Math.PI / 2; // ring from XZ plane down onto the XY ground
    wall.position.z = 0.7;
    parts.push(this.paint(wall, 0.64, 0.6, 0.53, 0));
    // A building: sandstone walls + a wider terracotta roof cap. Boxes only,
    // so orientation stays trivial under the model camera.
    const building = (sx: number, sy: number, w: number, d: number, hgt: number) => {
      const walls = CreateBox('bw', { width: w, depth: d, height: hgt }, this.scene);
      walls.rotation.x = Math.PI / 2; // box height (Y) -> world up Z
      walls.position.set(sx, sy, hgt / 2);
      parts.push(this.paint(walls, 0.82, 0.74, 0.56, 0)); // sandstone, neutral
      const roof = CreateBox('br', { width: w * 1.18, depth: d * 1.18, height: hgt * 0.38 }, this.scene);
      roof.rotation.x = Math.PI / 2;
      roof.position.set(sx, sy, hgt + hgt * 0.19);
      // clay roof carrying half the owner's hue, so whose city it is reads at
      // a glance (Roman red, Macedonian blue) without losing the tiled look
      parts.push(this.paint(roof, 0.66, 0.4, 0.3, 0.5));
    };
    building(0, 0, 2.4, 2.4, 3.0); // the forum/temple at the center
    let s = 2654435761 | 0;
    const rand = () => (s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x80000000;
    for (let i = 0; i < 18; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.9 + rand() * 3.0;
      building(Math.cos(a) * r, Math.sin(a) * r, 0.8 + rand() * 1.0, 0.8 + rand() * 1.0, 1.1 + rand() * 1.4);
    }
    // The faction standard, taller than the town so it flies above the roofs.
    const pole = CreateBox('cp', { width: 0.2, depth: 0.2, height: 7.0 }, this.scene);
    pole.rotation.x = Math.PI / 2;
    pole.position.set(0, 0, 3.5);
    parts.push(this.paint(pole, 0.45, 0.36, 0.28, 0)); // timber, neutral
    const flag = CreateBox('cf', { width: 3.4, depth: 0.16, height: 2.0 }, this.scene);
    flag.rotation.x = Math.PI / 2;
    flag.position.set(1.7, 0, 5.6);
    parts.push(this.paint(flag, 1, 1, 1, 1)); // livery: takes the owner color

    const merged = Mesh.MergeMeshes(parts, true, true);
    if (!merged) return;
    merged.name = 'cities';
    merged.material = this.modelMat;
    merged.alwaysSelectAsActiveMesh = true;

    // Static per-city transforms: position on the terrain, scaled by tier.
    const cityList = data.map.nodes
      .map((n, i) => ({ n, i }))
      .filter((x) => x.n.kind === 'city');
    const mats = new Float32Array(cityList.length * 16);
    const shadows = new Float32Array(cityList.length * 16);
    this.cityNodes = [];
    cityList.forEach((c, k) => {
      const S = c.n.tier >= 3 ? 1.9 : c.n.tier === 2 ? 1.35 : 0.95;
      const x = c.n.pos[0];
      const y = c.n.pos[1];
      const z = Math.max(0, this.field.heightAt(x, y));
      const o = k * 16;
      mats[o] = S; mats[o + 5] = S; mats[o + 10] = S; mats[o + 15] = 1;
      mats[o + 12] = x; mats[o + 13] = y; mats[o + 14] = z;
      this.shadowMatrix(shadows, o, x, y, z, 4.8 * S); // ~the rampart footprint
      this.cityNodes.push(c.i);
    });
    this.cityShadow = this.shadowQuad('cityShadow');
    this.cityShadow.thinInstanceSetBuffer('matrix', shadows, 16, true);
    merged.thinInstanceSetBuffer('matrix', mats, 16, true);
    const cols = new Float32Array(cityList.length * 4);
    for (let k = 0; k < cityList.length; k++) {
      cols[k * 4] = cols[k * 4 + 1] = cols[k * 4 + 2] = 0.55;
      cols[k * 4 + 3] = 0; // highlight flag: cities never glow
    }
    merged.thinInstanceSetBuffer('iColor', cols, 4, false);
    merged.setEnabled(false);
    this.cityMesh = merged;
  }

  /** Recolor each settlement's standard to its current owner (called when
   *  ownership changes — same trigger as the territory recolor). */
  setCityOwners(cities: Map<number, { owner: number }>) {
    const m = this.cityMesh;
    if (!m) return;
    const n = this.cityNodes.length;
    const cols = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) {
      const owner = cities.get(this.cityNodes[k])?.owner ?? -1;
      const c = owner >= 0 ? this.factionColors[owner] ?? [0.55, 0.55, 0.55] : [0.55, 0.55, 0.55];
      cols[k * 4] = c[0]; cols[k * 4 + 1] = c[1]; cols[k * 4 + 2] = c[2]; cols[k * 4 + 3] = 0;
    }
    m.thinInstanceSetBuffer('iColor', cols, 4, false);
  }

  /** Reposition the army models from the live army list (called each frame
   *  before draw). Cheap: a few dozen instances, two small buffers. */
  setArmies(armies: { id: number; x: number; y: number; faction: number }[], scale: number, selected = -1, hover = -1) {
    const m = this.armyMesh;
    if (!m) return;
    const n = armies.length;
    this.armyCount = n;
    if (n === 0) {
      m.thinInstanceCount = 0;
      if (this.armyShadow) this.armyShadow.thinInstanceCount = 0;
      return;
    }
    const mats = new Float32Array(n * 16);
    const cols = new Float32Array(n * 4);
    const shadows = new Float32Array(n * 16);
    // Hold a roughly constant on-screen footprint (the model is ~3.2 km wide
    // per unit S; scale is CSS px/km) so armies read at play zoom without
    // ballooning up close — clamped so they never dwarf the map or vanish.
    const S = Math.min(13, Math.max(5, 80 / (3.2 * scale)));
    for (let i = 0; i < n; i++) {
      const a = armies[i];
      const z = Math.max(0, this.field.heightAt(a.x, a.y));
      const o = i * 16;
      mats[o] = S; mats[o + 5] = S; mats[o + 10] = S; mats[o + 15] = 1;
      mats[o + 12] = a.x; mats[o + 13] = a.y; mats[o + 14] = z;
      const c = this.factionColors[a.faction] ?? [0.6, 0.6, 0.6];
      // iColor.a is the highlight flag the shader reads (not opacity).
      const hi = a.id === selected ? 1 : a.id === hover ? 0.5 : 0;
      cols[i * 4] = c[0]; cols[i * 4 + 1] = c[1]; cols[i * 4 + 2] = c[2]; cols[i * 4 + 3] = hi;
      this.shadowMatrix(shadows, o, a.x, a.y, z, 1.9 * S);
    }
    m.thinInstanceSetBuffer('matrix', mats, 16, false);
    m.thinInstanceSetBuffer('iColor', cols, 4, false);
    this.armyShadow?.thinInstanceSetBuffer('matrix', shadows, 16, false);
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
    this.armyShadow?.setEnabled(cam.scale >= ARMY_MIN_SCALE && this.armyCount > 0);
    this.cityMesh?.setEnabled(cam.scale >= CITY_MODEL_MIN_SCALE);
    this.cityShadow?.setEnabled(cam.scale >= CITY_MODEL_MIN_SCALE);

    this.terrainMat.setVector3('uEyePos', this.camera.position);
    this.terrainMat.setVector2('uFx', new Vector2(this.territoryAlpha(cam.scale), tilt * 0.85));
    this.terrainMat.setFloat('uFogD', 1 / (this.dist * 4.5));
    this.terrainMat.setFloat('uTime', time);
    this.terrainMat.setVector2('uViewport', new Vector2(this.canvas.width, this.canvas.height));
    this.treeMat.setVector2('uFx', new Vector2(0, tilt * 0.85));
    this.treeMat.setFloat('uFogD', 1 / (this.dist * 4.5));
    this.modelMat.setFloat('uFogD', 1 / (this.dist * 4.5));
    this.modelMat.setFloat('uFogStr', tilt * 0.85);

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
