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
import { classGeometryDetailed } from '../shared/soldierModel';

const FOV = (45 * Math.PI) / 180;
/** Tilt: 90° (top-down) until TILT_START, easing to MIN_PITCH by TILT_END. */
const TILT_START = 0.32;
const TILT_END = 1.5;
const MIN_PITCH = (52 * Math.PI) / 180;
/** Trees pop in below this height (cam.scale), once they'd be > a few px. */
const TREE_MIN_SCALE = 0.45;
/** Army models show once the world tilts toward 3D; the flat pennant carries
 *  the political map below this. */
export const ARMY_MIN_SCALE = 0.4;
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
}
// Billowing fractal noise for drifting cloud banks.
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}`;

// Antique watercolour-atlas grade: brighten, gently desaturate, lift the
// shadows, and tint the whole frame a faint sepia paper-warmth.
const GRADE = `
vec3 grade(vec3 c) {
  c = pow(max(c, 0.0), vec3(0.92, 0.95, 1.00));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.06);
  c = c * 1.05 + 0.02;
  c *= vec3(1.02, 1.00, 0.95);
  return clamp(c, 0.0, 1.0);
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
uniform sampler2D uTerr, uLight, uBiome; // uLight: baked lambert*128
uniform sampler2D uVis; // player sight mask (fog of war)
uniform vec3 uEyePos, uSun, uFogC;
uniform vec2 uFx; // territory alpha, fog strength
uniform float uFogD, uTime, uCloud, uFow; // uFow: fog-of-war strength (0 = reveal-all)
uniform vec2 uViewport;
uniform vec4 uBgRect;
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
    // Watercolour atlas greens: pale olive in the dry south, soft sage where wet.
    vec3 grass = mix(vec3(0.66, 0.64, 0.42), vec3(0.40, 0.56, 0.33), smoothstep(0.22, 0.55, m));
    grass *= 0.90 + 0.13 * g1 + 0.08 * g2;
    float dune = abs(nz(vXY, 0.16, px) * 2.0 - 1.0);
    vec3 sand = mix(vec3(0.90, 0.81, 0.60), vec3(0.80, 0.69, 0.48), dune);
    sand *= 0.95 + 0.08 * nz(vXY, 1.6, px);
    vec3 ground = mix(sand, grass, smoothstep(0.16, 0.32, m));
    float landShore = (b.a - 0.5) * 24.0; // cells from the waterline
    ground = mix(vec3(0.85, 0.78, 0.60), ground, smoothstep(0.05, 0.6, landShore));
    float canopy = smoothstep(0.25, 0.7, b.g * (0.55 + 0.9 * nz(vXY, 0.55, px)));
    vec3 forestC = mix(vec3(0.24, 0.36, 0.20), vec3(0.32, 0.46, 0.26), nz(vXY, 1.9, px));
    ground = mix(ground, forestC, canopy);
    vec3 rockC = mix(vec3(0.58, 0.50, 0.42), vec3(0.72, 0.66, 0.58),
                     nz(vec2(vXY.x, vXY.y + vH * 0.9), 0.7, px));
    ground = mix(ground, rockC, smoothstep(0.35, 0.85, b.b) * (0.7 + 0.3 * g1));
    // Snow only frosts the very highest northern crests — on a watercolour
    // atlas the ranges read as tan ridges, not white blobs.
    float snowAt = 30.0 + clamp((700.0 - vXY.y) * 0.006, 0.0, 7.0);
    float snow = smoothstep(snowAt, snowAt + 6.0, vH + (nz(vXY, 0.5, px) - 0.5) * 6.0);
    ground = mix(ground, vec3(0.86, 0.86, 0.83), snow * 0.7);
    // political mode reads better over calmer ground
    float grey = dot(ground, vec3(0.333));
    ground = mix(ground, vec3(grey) * 1.08, uFx.x * 0.45);
    // Soft relief: ridges still carve, but shadows lift toward a flat
    // watercolour wash rather than crushing to dark earth.
    float li = pow(texture2D(uLight, vUV).r * 2.0, 1.12);
    col = ground * (0.22 + 0.82 * li);
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
    // Antique-chart water: a muted slate blue, shallows toward pale teal.
    vec3 wcol = mix(vec3(0.40, 0.56, 0.64), vec3(0.16, 0.30, 0.44), shelf);
    wcol += 0.05 * (w0 - 0.5);
    vec3 V = normalize(uEyePos - vec3(vXY, 0.0));
    wcol += vec3(1.0, 0.95, 0.8) * pow(max(dot(reflect(-uSun, wn), V), 0.0), 70.0)
            * 0.6 * clamp(1.0 - 0.6 * px, 0.0, 1.0);
    wcol = mix(wcol, vec3(0.52, 0.64, 0.72), pow(1.0 - max(dot(wn, V), 0.0), 3.0) * 0.3);
    float foam = smoothstep(0.6, 0.0, (0.5 - b.a) * 24.0)
               * smoothstep(0.4, 0.8, nz(vXY + vec2(uTime * 3.0, -uTime * 2.0), 2.3, px));
    wcol = mix(wcol, vec3(0.88, 0.93, 0.94), foam * 0.7);
    col = mix(col, wcol, water);
  }

  if (uFx.y > 0.001) {
    float fog = (1.0 - exp(-pow(vZ * uFogD, 2.0))) * uFx.y;
    col = mix(col, uFogC, clamp(fog, 0.0, 1.0));
  }
  // Parchment grain: a faint mottled paper wash so the map reads watercolour.
  // Two cheap octaves (not fbm) — this runs on every fragment every frame.
  float grain = vnoise(vXY * 0.05) * 0.6 + vnoise(vXY * 0.27) * 0.4;
  col *= 0.95 + 0.11 * grain;
  // Fog-of-war clouds drifting in from the map's rim (overview only).
  if (uCloud > 0.001) {
    float edge = min(min(vXY.x - uBgRect.x, uBgRect.z - vXY.x),
                     min(vXY.y - uBgRect.y, uBgRect.w - vXY.y));
    float span = min(uBgRect.z - uBgRect.x, uBgRect.w - uBgRect.y);
    float rim = 1.0 - smoothstep(0.0, span * 0.28, max(edge, 0.0));
    vec2 cp = vXY * 0.0016 + vec2(uTime * 0.006, uTime * 0.0042);
    float cl = fbm(cp) * 0.6 + fbm(cp * 2.6 + 3.1) * 0.4;
    // Billowy cumulus: dense cores read bright, wisps grey — gives the bank depth.
    float cov = smoothstep(0.46 - rim * 0.42, 0.86 - rim * 0.36, cl);
    float clouds = pow(rim, 0.65) * cov * uCloud;
    vec3 cloudC = mix(vec3(0.74, 0.76, 0.80), vec3(0.97, 0.98, 1.0), smoothstep(0.4, 0.82, cl));
    col = mix(col, cloudC, clamp(clouds, 0.0, 1.0));
  }
  // Fog of war: outside the player's sight the world goes dark under a roiling
  // cloud bank. uVis.r is 1 where seen, 0 where hidden (soft vision edges).
  if (uFow > 0.001) {
    float seen = texture2D(uVis, vUV).r;
    float hidden = (1.0 - seen) * uFow;
    if (hidden > 0.001) {
      vec2 fp = vXY * 0.0015 + vec2(uTime * 0.005, uTime * 0.0032);
      float fc = fbm(fp) * 0.6 + fbm(fp * 2.5 + 1.7) * 0.4;
      vec3 dark = col * 0.16 + vec3(0.03, 0.04, 0.06); // unlit, ink-dark land/sea
      vec3 murk = mix(vec3(0.20, 0.22, 0.27), vec3(0.50, 0.53, 0.58), smoothstep(0.38, 0.82, fc));
      vec3 fogged = mix(dark, murk, smoothstep(0.4, 0.78, fc) * 0.9);
      col = mix(col, fogged, smoothstep(0.0, 0.65, hidden));
    }
  }
  // A quiet screen-space vignette frames the chart.
  vec2 vp = gl_FragCoord.xy / uViewport * 2.0 - 1.0;
  col *= 0.88 + 0.12 * smoothstep(1.55, 0.45, length(vp * vec2(1.0, 0.85)));
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

// Roads: flat granite ribbons draped on the terrain, drawn IN the 3D scene so
// the depth buffer lets city and army models occlude them — a causeway runs
// under the town that sits on it, not painted over the top like the old
// 2D-overlay roads. `color` carries the granite shade (brighter per road level)
// and an edge-fade alpha used to feather the verge into the ground.
ShaderStore.ShadersStore['campRoadVertexShader'] = `
precision highp float;
attribute vec3 position;
attribute vec4 color;
uniform mat4 viewProjection;
varying vec4 vCol;
varying float vZ;
void main() {
  gl_Position = viewProjection * vec4(position, 1.0);
  vCol = color;
  vZ = gl_Position.w;
}`;

ShaderStore.ShadersStore['campRoadFragmentShader'] = `
precision highp float;
varying vec4 vCol;
varying float vZ;
uniform vec3 uFogC;
uniform float uFogD, uFogStr;
${GRADE}
void main() {
  vec3 col = vCol.rgb;
  if (uFogStr > 0.001) {
    float fog = (1.0 - exp(-pow(vZ * uFogD, 2.0))) * uFogStr;
    col = mix(col, uFogC, clamp(fog, 0.0, 1.0));
  }
  gl_FragColor = vec4(grade(col), vCol.a);
}`;

/** Anti-sun ground direction (where shadows fall), from the one campaign sun. */
const SHADOW_DIR: [number, number] = (() => {
  const l = Math.hypot(SUN[0], SUN[1]) || 1;
  return [-SUN[0] / l, -SUN[1] / l];
})();

/** Up to 20 figure slots in a packed disc (golden-angle spiral), so an army's
 *  soldiers stand around its standard. Figure i takes slot i; a small army
 *  fills the inner slots, a large one (capped at 20) fills them all. */
const ARMY_SLOTS: [number, number][] = Array.from({ length: 20 }, (_, i) => {
  const a = i * 2.399963;
  const r = 0.38 * Math.sqrt(i);
  return [Math.cos(a) * r, Math.sin(a) * r];
});
/** One figure per ~250 soldiers, clamped to [1, 20]. */
function figureCount(soldiers: number): number {
  return Math.max(1, Math.min(ARMY_SLOTS.length, Math.round(soldiers / 250)));
}
/** Allocate `n` figures across the 9 classes by soldier share (largest
 *  remainder), so the cluster mirrors the army's real composition. */
function allocFigures(roster: number[], n: number): number[] {
  const total = roster.reduce((a, b) => a + b, 0);
  if (total <= 0) return [n, 0, 0, 0, 0, 0, 0, 0, 0];
  const ideal = roster.map((c) => (n * c) / total);
  const out = ideal.map(Math.floor);
  let rem = n - out.reduce((a, b) => a + b, 0);
  const order = ideal
    .map((v, i) => [v - Math.floor(v), i] as [number, number])
    .sort((a, b) => b[0] - a[0]);
  for (let k = 0; rem > 0; k++, rem--) out[order[k % 9][1]]++;
  return out;
}

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
  private armyBase: Mesh | null = null; // standard pole + flag, one per army
  private armySelRing: Mesh | null = null; // green ring under the selected army
  // Per-army march state: last position + an eased bob amplitude, so figures
  // bounce in step while the army is on the move and stand still when halted
  // (zero amplitude = no animation = deterministic snapshots).
  private armyMarch = new Map<number, { px: number; py: number; amp: number }>();
  private classMeshes: (Mesh | null)[] = []; // per-class soldiers, one per figure
  private armyCount = 0;
  private cityMesh: Mesh | null = null;
  private citySelRing: Mesh | null = null;
  /** node index -> [x, y, z, tier], so the selection ring can find a city. */
  private cityPosByNode = new Map<number, [number, number, number, number]>();
  private shadowMat!: ShaderMaterial;
  private roadMat!: ShaderMaterial;
  private roadMesh: Mesh | null = null;
  private mountainMesh: Mesh | null = null;
  private rockMesh: Mesh | null = null;
  private mtnShadow: Mesh | null = null;
  private sceneMat!: ShaderMaterial;
  // Carts crawling the trunk roads: a cart mesh thin-instanced once, its
  // transforms rewritten each frame from progress along a road centreline.
  private cartMesh: Mesh | null = null;
  private cartShadow: Mesh | null = null;
  private carts: { path: [number, number][]; cum: number[]; len: number; speed: number; phase: number; dir: 1 | -1 }[] = [];
  /** Resampled trunk-road centrelines, kept so carts can travel them. */
  private roadPaths: { path: [number, number][]; cum: number[]; len: number }[] = [];
  private armyShadow: Mesh | null = null;
  private cityShadow: Mesh | null = null;
  /** city node index per thin instance, for owner-color lookups */
  private cityNodes: number[] = [];
  /** static city/shadow transforms + world positions, kept so fog of war can
   *  collapse the settlements the player can't see (zero-scale them). */
  private cityModelMats = new Float32Array(0);
  private cityShadowMats = new Float32Array(0);
  private cityPos: [number, number][] = [];
  private cityFogged = false;
  private factionColors: number[][];
  private terrTex: RawTexture;
  // Fog-of-war sight mask: a low-res grid over the bg rect, .r = how visible a
  // cell is to the player (1 seen, 0 hidden). Rasterized from cities/armies.
  private visTex!: RawTexture;
  private visW = 0;
  private visH = 0;
  private visBuf = new Uint8Array(0);
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
    // Vision mask: ~160 px wide, bg-rect aspect; bilinear so sight edges feather.
    this.visW = 160;
    this.visH = Math.max(1, Math.round(160 * (this.bgRect[3] - this.bgRect[1]) / (this.bgRect[2] - this.bgRect[0])));
    this.visBuf = new Uint8Array(this.visW * this.visH * 4);
    this.visTex = new RawTexture(this.visBuf, this.visW, this.visH, Constants.TEXTUREFORMAT_RGBA, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);

    this.terrainMat = new ShaderMaterial('terrain', scene, 'campTerrain', {
      attributes: ['position'],
      uniforms: ['viewProjection', 'uBgRect', 'uEyePos', 'uSun', 'uFogC', 'uFx', 'uFogD', 'uTime', 'uViewport', 'uCloud', 'uFow'],
      samplers: ['uTerr', 'uLight', 'uBiome', 'uVis'],
    });
    this.terrainMat.setTexture('uTerr', this.terrTex);
    this.terrainMat.setTexture('uLight', lightTex);
    this.terrainMat.setTexture('uBiome', biomeTex);
    this.terrainMat.setTexture('uVis', this.visTex);
    this.terrainMat.setFloat('uFow', 0);
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

    // Scenery (mountains, rocks, carts) shares the lit model shader but keeps
    // both faces — the low-poly peaks are open shells, not closed solids.
    this.sceneMat = new ShaderMaterial('scene', scene, 'campModel', {
      attributes: ['position', 'normal', 'color', 'world0', 'world1', 'world2', 'world3', 'iColor'],
      uniforms: ['viewProjection', 'uSun', 'uFogC', 'uFogD', 'uFogStr'],
    });
    this.sceneMat.setVector3('uSun', new Vector3(...SUN));
    this.sceneMat.setColor3('uFogC', new Color3(0.71, 0.71, 0.68));
    this.sceneMat.backFaceCulling = false;

    this.shadowMat = new ShaderMaterial('shadow', scene, 'campShadow', {
      attributes: ['position', 'world0', 'world1', 'world2', 'world3'],
      uniforms: ['viewProjection', 'uStr'],
    });
    this.shadowMat.setFloat('uStr', 0.5);
    this.shadowMat.alpha = 0.999; // flag the transparent pass (it blends, never writes depth)
    this.shadowMat.backFaceCulling = false;
    this.shadowMat.disableDepthWrite = true;

    this.roadMat = new ShaderMaterial('road', scene, 'campRoad', {
      attributes: ['position', 'color'],
      uniforms: ['viewProjection', 'uFogC', 'uFogD', 'uFogStr'],
    });
    this.roadMat.setColor3('uFogC', new Color3(0.71, 0.71, 0.68));
    this.roadMat.backFaceCulling = false; // opaque: writes depth so models occlude it

    this.buildTerrain();
    this.buildScenery();
    this.buildTrees();
    this.buildArmyModels();
    this.buildCityModel(data);
    this.buildRoads(data);
    this.buildCarts();

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
        if (forest < 0.28) continue;
        const k = Math.round(forest * 4.5 * (0.6 + hash2(gx, gy) * 0.9));
        for (let t = 0; t < k; t++) {
          const ox = (hash2(gx * 7 + t, gy * 13 + 1) - 0.5) * cell * 1.4;
          const oy = (hash2(gx * 3 + t, gy * 17 + 5) - 0.5) * cell * 1.4;
          const x = minX + (gx + 0.5) * cell + ox;
          const y = maxY - (gy + 0.5) * cell + oy;
          const size = 2.0 + hash2(gx + t, gy + t) * 1.8;
          const z = this.field.heightAt(x, y) - 0.15;
          const out = hash2(gx * 5 + t, gy * 11) < (y > TEMPERATE_Y_KM ? 0.75 : 0.25) ? conifer : broadleaf;
          // column-major TRS: scale (w, w, h), translate (x, y, z). x and y
          // scale alike so the crossed quads keep a round canopy footprint.
          out.push(size * 0.72, 0, 0, 0, 0, size * 0.72, 0, 0, 0, 0, size, 0, x, y, z, 1);
        }
      }
    }
    const makeTreeMesh = (name: string, mats: number[], u0: number) => {
      if (!mats.length) return;
      const m = new Mesh(name, this.scene);
      const vd = new VertexData();
      // Two crossed vertical quads (XZ + YZ) so the tree holds volume from any
      // angle instead of reading as a flat cutout; both sample the same atlas.
      vd.positions = [
        -0.5, 0, 0, 0.5, 0, 0, -0.5, 0, 1, 0.5, 0, 1,
        0, -0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1,
      ];
      vd.indices = [0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7];
      vd.uvs = [
        u0, 0, u0 + 0.5, 0, u0, 1, u0 + 0.5, 1,
        u0, 0, u0 + 0.5, 0, u0, 1, u0 + 0.5, 1,
      ];
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

  /** Army markers are assembled per frame from two thin-instanced pieces: a
   *  base+standard (one per army) and the battle's per-class soldier meshes
   *  (one instance per figure). Built once here, filled in setArmies. */
  private buildArmyModels() {
    // Standard only — a neutral timber pole with a small faction flag at the
    // top. No ground disc under the army (the soft contact shadow grounds it);
    // selection is shown by a green ring instead (below).
    const parts: Mesh[] = [];
    const pole = CreateBox('p', { width: 0.12, depth: 0.12, height: 4.2 }, this.scene);
    pole.rotation.x = Math.PI / 2;
    pole.position.set(0, 0, 2.1);
    parts.push(this.paint(pole, 0.5, 0.4, 0.3, 0)); // neutral timber
    // A triangular PENNANT (not the city's rectangular banner) so an army reads
    // as an army at a glance; livery (alpha 1) so its allegiance colour shows.
    // Flat in the XZ plane facing the camera; the shading normal tilts skyward
    // so it catches the sun, while the face still points south for culling.
    const pennant = new Mesh('pf', this.scene);
    const pvd = new VertexData();
    pvd.positions = [0, 0, 4.1, 0, 0, 3.0, 2.0, 0, 3.55];
    pvd.indices = [0, 1, 2];
    pvd.normals = [0, -0.4, 0.92, 0, -0.4, 0.92, 0, -0.4, 0.92];
    pvd.uvs = [0, 1, 0, 0, 1, 0.5]; // match the boxes' attribute set for merge
    pvd.applyToMesh(pennant);
    parts.push(this.paint(pennant, 1, 1, 1, 1)); // livery: takes the allegiance colour
    const baseMesh = Mesh.MergeMeshes(parts, true, true);
    if (baseMesh) {
      baseMesh.name = 'armyBase';
      baseMesh.material = this.modelMat;
      baseMesh.alwaysSelectAsActiveMesh = true;
      baseMesh.setEnabled(false);
      this.armyBase = baseMesh;
    }
    // Green selection ring — a flat torus laid on the ground, shown under the
    // ONE selected army (positioned in setArmies), hidden otherwise.
    const sel = CreateTorus('asel', { diameter: 7.5, thickness: 0.5, tessellation: 32 }, this.scene);
    sel.rotation.x = Math.PI / 2;
    this.paint(sel, 0.2, 0.95, 0.35, 0); // bright green
    sel.material = this.modelMat;
    sel.alwaysSelectAsActiveMesh = true;
    sel.setEnabled(false);
    this.armySelRing = sel;
    // One soldier mesh per class — the battle's DETAILED figure in livery mode,
    // thin-instanced across every figure of every army. Its vertex colours carry
    // the realistic materials (skin, bronze, linen) at alpha 0 and the faction
    // parts (crest, shield blazon, sash) at alpha 1, so the campModel shader
    // paints a realistic soldier wearing the owner's colours — the same look the
    // battlefield shows, on the strategic map. No paint() override here.
    for (let c = 0; c < 9; c++) {
      const m = new Mesh(`armyCls${c}`, this.scene);
      classGeometryDetailed(c, { rest: 1 }, [1, 1, 1], { livery: true }).applyToMesh(m); // at-ease
      m.material = this.modelMat;
      m.alwaysSelectAsActiveMesh = true;
      m.setEnabled(false);
      this.classMeshes[c] = m;
    }
    this.armyShadow = this.shadowQuad('armyShadow');
  }

  /** All land roads as one flat granite ribbon mesh draped on the terrain, in
   *  the 3D scene (opaque, depth-tested) so city and army models occlude it —
   *  a road runs UNDER the town on it, not over the top. Static; rebuild only on
   *  a road-level change (width/shade scale with level). Sea lanes stay 2D. */
  buildRoads(data: CampaignData, roadLevels?: Uint8Array) {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const STEP = 0.9; // km between samples — fine enough to hug the relief so
    //                   the ground never bulges up through a long flat segment.

    // Lay one ribbon down a resampled centreline: a vertex pair per sample,
    // offset ±halfW along the ground-plane normal, draped at terrain height.
    const ribbon = (
      center: [number, number][],
      halfW: number,
      zOff: number,
      r: number,
      g: number,
      bl: number,
    ) => {
      const n = center.length;
      const base = positions.length / 3;
      for (let i = 0; i < n; i++) {
        const p = center[i];
        const a = center[Math.max(0, i - 1)];
        const c = center[Math.min(n - 1, i + 1)];
        let tx = c[0] - a[0];
        let ty = c[1] - a[1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const nx = -ty;
        const ny = tx;
        for (const s of [-1, 1]) {
          const x = p[0] + nx * halfW * s;
          const y = p[1] + ny * halfW * s;
          positions.push(x, y, this.field.heightAt(x, y) + zOff);
          colors.push(r, g, bl, 1);
        }
      }
      for (let i = 0; i + 1 < n; i++) {
        const l = base + i * 2;
        indices.push(l, l + 1, l + 2, l + 1, l + 3, l + 2);
      }
    };

    this.roadPaths = [];
    for (let ei = 0; ei < data.map.edges.length; ei++) {
      const e = data.map.edges[ei];
      if (e.kind === 'sea') continue;
      const via = e.via;
      if (via.length < 2) continue;
      // Resample the simplified polyline so the ribbon follows the ground.
      const center: [number, number][] = [[via[0][0], via[0][1]]];
      for (let i = 1; i < via.length; i++) {
        const a = via[i - 1];
        const b = via[i];
        const segs = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
        for (let k = 1; k <= segs; k++) {
          const t = k / segs;
          center.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      const lvl = roadLevels?.[ei] ?? 1;
      const halfW = 0.52 * (0.85 + 0.18 * lvl); // world km — a thin causeway
      const sh = 0.62 + 0.045 * lvl; // granite, brighter per level
      // Dark embankment first (a touch wider, a touch lower) so it reads as a
      // shadowed lip; then the brighter stone surface on top.
      ribbon(center, halfW * 1.5, 0.18, 0.33, 0.28, 0.23);
      ribbon(center, halfW, 0.32, sh, sh * 0.98, sh * 0.93);
      // Keep the centreline (with cumulative arc length) for cart traffic.
      const cum = [0];
      for (let i = 1; i < center.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(center[i][0] - center[i - 1][0], center[i][1] - center[i - 1][1]));
      }
      const len = cum[cum.length - 1];
      if (len > 24) this.roadPaths.push({ path: center, cum, len });
    }
    if (this.roadMesh) {
      this.roadMesh.dispose();
      this.roadMesh = null;
    }
    if (!positions.length) return;
    const m = new Mesh('roads', this.scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.colors = colors;
    vd.indices = indices;
    vd.applyToMesh(m);
    m.material = this.roadMat;
    m.isPickable = false;
    m.freezeWorldMatrix();
    this.roadMesh = m;
  }

  /** A flat-shaded low-poly peak: an n-sided spire, apex up (+z), base on the
   *  XY plane, ramparts jittered for a craggy silhouette. Faces are built from
   *  independent vertices so each reads as its own facet. baseCol shades the
   *  flanks, topCol the summit (a paler rock/snow highlight). */
  private peakMesh(name: string, sides: number, baseCol: number[], topCol: number[], seed: number): Mesh {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const ax = (hash2(seed, 1) - 0.5) * 0.3;
    const ay = (hash2(seed, 2) - 0.5) * 0.3; // a slight lean off-axis
    const ring: [number, number][] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const rr = 0.78 + hash2(seed + i, 3) * 0.44;
      ring.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    for (let i = 0; i < sides; i++) {
      const b0 = ring[i];
      const b1 = ring[(i + 1) % sides];
      const base = positions.length / 3;
      positions.push(ax, ay, 1); colors.push(topCol[0], topCol[1], topCol[2], 0);
      positions.push(b0[0], b0[1], 0); colors.push(baseCol[0], baseCol[1], baseCol[2], 0);
      positions.push(b1[0], b1[1], 0); colors.push(baseCol[0], baseCol[1], baseCol[2], 0);
      indices.push(base, base + 1, base + 2);
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const mesh = new Mesh(name, this.scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.colors = colors;
    vd.applyToMesh(mesh);
    return mesh;
  }

  /** A massif: a tall central spire flanked by two lesser peaks, merged and
   *  normalised to ~unit radius/height so the per-instance scale sets the size. */
  private buildMountainMesh(): Mesh {
    const stone = [0.50, 0.46, 0.40];
    const cap = [0.74, 0.72, 0.68];
    const main = this.peakMesh('mtnA', 7, stone, cap, 11);
    const f1 = this.peakMesh('mtnB', 6, stone, cap, 23);
    f1.scaling.set(0.6, 0.6, 0.62);
    f1.position.set(0.75, 0.35, 0);
    const f2 = this.peakMesh('mtnC', 6, stone, cap, 37);
    f2.scaling.set(0.52, 0.52, 0.5);
    f2.position.set(-0.65, -0.45, 0);
    const merged = Mesh.MergeMeshes([main, f1, f2], true, true)!;
    merged.name = 'mountains';
    merged.material = this.sceneMat;
    merged.setEnabled(false);
    return merged;
  }

  /** A single squat boulder for rocky-but-low ground. */
  private buildRockMesh(): Mesh {
    const m = this.peakMesh('rock', 6, [0.47, 0.44, 0.40], [0.56, 0.53, 0.49], 5);
    m.material = this.sceneMat;
    m.setEnabled(false);
    return m;
  }

  /** Scatter mountains and rocks across the relief: tall rocky cells get a
   *  massif, merely-rocky cells get boulder clusters. Static thin instances,
   *  seeded by cell hash so the placement is deterministic. Mountains drop a
   *  contact shadow to anchor them to the ground. */
  private buildScenery() {
    const f = this.field;
    const { w, h, cell, minX, maxY } = f;
    this.mountainMesh = this.buildMountainMesh();
    this.rockMesh = this.buildRockMesh();
    const mtn: number[] = [];
    const rock: number[] = [];
    const pushM = (arr: number[], sx: number, sy: number, sz: number, yaw: number, x: number, y: number, z: number) => {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      arr.push(c * sx, s * sx, 0, 0, -s * sy, c * sy, 0, 0, 0, 0, sz, 0, x, y, z, 1);
    };
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const i = gy * w + gx;
        if (!f.land[i]) continue;
        const rk = f.biome[i * 4 + 2] / 255;
        const hh = f.height[i] / (f.maxH || 1);
        const x0 = minX + (gx + 0.5) * cell;
        const y0 = maxY - (gy + 0.5) * cell;
        const score = hh * 0.85 + rk * 0.5;
        if (score > 0.66 && hash2(gx * 3 + 1, gy * 7 + 2) < 0.42) {
          const x = x0 + (hash2(gx, gy * 2) - 0.5) * cell * 0.7;
          const y = y0 + (hash2(gx * 2, gy) - 0.5) * cell * 0.7;
          const z = Math.max(0, f.heightAt(x, y));
          const rad = cell * 0.5 * (0.7 + rk * 0.5);
          const tall = 2.4 + rk * 4.5 + hh * 4.5;
          pushM(mtn, rad, rad, tall, hash2(gx + 3, gy + 5) * 6.28, x, y, z);
        } else if (rk > 0.3 && hash2(gx * 5, gy * 9) < rk * 0.6) {
          const cnt = 1 + Math.floor(hash2(gx, gy) * 2.5);
          for (let t = 0; t < cnt; t++) {
            const x = x0 + (hash2(gx * 7 + t, gy * 11) - 0.5) * cell * 1.2;
            const y = y0 + (hash2(gx * 5 + t, gy * 13) - 0.5) * cell * 1.2;
            const z = Math.max(0, f.heightAt(x, y));
            const rad = 0.9 + hash2(gx + t, gy) * 1.7;
            const tall = 0.7 + hash2(gx, gy + t) * 1.4;
            pushM(rock, rad, rad, tall, hash2(t + 1, gx) * 6.28, x, y, z);
          }
        }
      }
    }
    const [x0, y0, x1, y1] = this.bgRect;
    const bounds = new BoundingInfo(new Vector3(x0, y0, 0), new Vector3(x1, y1, 60));
    if (mtn.length) {
      this.mountainMesh.thinInstanceSetBuffer('matrix', new Float32Array(mtn), 16, true);
      this.mountainMesh.thinInstanceSetBuffer('iColor', new Float32Array((mtn.length / 16) * 4), 4, true);
      this.mountainMesh.setBoundingInfo(bounds);
      this.mountainMesh.isPickable = false;
      const cnt = mtn.length / 16;
      const shad = new Float32Array(cnt * 16);
      for (let k = 0; k < cnt; k++) {
        const o = k * 16;
        const rad = Math.hypot(mtn[o], mtn[o + 1]);
        this.shadowMatrix(shad, o, mtn[o + 12], mtn[o + 13], mtn[o + 14], rad * 0.9);
      }
      this.mtnShadow = this.shadowQuad('mtnShadow');
      this.mtnShadow.thinInstanceSetBuffer('matrix', shad, 16, true);
      this.mtnShadow.setBoundingInfo(bounds);
    }
    if (rock.length) {
      this.rockMesh.thinInstanceSetBuffer('matrix', new Float32Array(rock), 16, true);
      this.rockMesh.thinInstanceSetBuffer('iColor', new Float32Array((rock.length / 16) * 4), 4, true);
      this.rockMesh.setBoundingInfo(bounds);
      this.rockMesh.isPickable = false;
    }
  }

  /** One ox-cart — a timber bed under a canvas tilt — merged and thin-instanced
   *  per cart, its length along +x so a yaw aligns it with the road. */
  private buildCartModel() {
    const parts: Mesh[] = [];
    const bed = CreateBox('cb', { width: 2.0, depth: 0.95, height: 0.55 }, this.scene);
    bed.rotation.x = Math.PI / 2;
    bed.position.set(0, 0, 0.45);
    parts.push(this.paint(bed, 0.42, 0.30, 0.20, 0)); // timber
    const tilt = CreateBox('ct', { width: 1.5, depth: 0.85, height: 0.62 }, this.scene);
    tilt.rotation.x = Math.PI / 2;
    tilt.position.set(-0.05, 0, 1.0);
    parts.push(this.paint(tilt, 0.84, 0.79, 0.68, 0)); // canvas tilt
    const ox = CreateBox('cox', { width: 0.9, depth: 0.6, height: 0.65 }, this.scene);
    ox.rotation.x = Math.PI / 2;
    ox.position.set(1.45, 0, 0.4);
    parts.push(this.paint(ox, 0.34, 0.26, 0.20, 0)); // the beast in harness
    const merged = Mesh.MergeMeshes(parts, true, true);
    if (!merged) return;
    merged.name = 'carts';
    merged.material = this.sceneMat;
    merged.alwaysSelectAsActiveMesh = true;
    merged.isPickable = false;
    merged.setEnabled(false);
    this.cartMesh = merged;
    this.cartShadow = this.shadowQuad('cartShadow');
  }

  /** Seed carts onto the trunk roads — roughly one per 70km of road, capped —
   *  each with a deterministic phase, speed and travel direction. */
  private buildCarts() {
    this.buildCartModel();
    this.carts = [];
    let seed = 0;
    for (const r of this.roadPaths) {
      const n = Math.max(1, Math.round(r.len / 70));
      for (let k = 0; k < n && this.carts.length < 160; k++) {
        const hp = hash2(seed * 2 + 1, k * 5 + 3);
        const hs = hash2(seed * 3 + 7, k * 2 + 1);
        this.carts.push({
          path: r.path,
          cum: r.cum,
          len: r.len,
          speed: 2.8 + hs * 3.4, // km/s — a steady crawl at gameplay zoom
          phase: hp * r.len,
          dir: hash2(seed + k, 9) < 0.5 ? 1 : -1,
        });
        seed++;
      }
    }
    if (this.cartMesh && this.carts.length) {
      this.cartMesh.thinInstanceSetBuffer('matrix', new Float32Array(this.carts.length * 16), 16, false);
      this.cartMesh.thinInstanceSetBuffer('iColor', new Float32Array(this.carts.length * 4), 4, true);
      this.cartShadow?.thinInstanceSetBuffer('matrix', new Float32Array(this.carts.length * 16), 16, false);
    }
  }

  /** Reposition every cart along its road from the shared clock; called each
   *  frame before draw. Hidden under fog where the player has no sight. */
  private updateCarts(time: number, fogOfWar: boolean) {
    const m = this.cartMesh;
    if (!m || !this.carts.length) return;
    const buf = new Float32Array(this.carts.length * 16);
    const shad = new Float32Array(this.carts.length * 16);
    for (let ci = 0; ci < this.carts.length; ci++) {
      const c = this.carts[ci];
      let d = (c.phase + time * c.speed) % c.len;
      if (c.dir < 0) d = c.len - d;
      // locate the segment holding arc-length d
      let lo = 0;
      while (lo + 1 < c.cum.length && c.cum[lo + 1] < d) lo++;
      const segLen = (c.cum[lo + 1] ?? c.cum[lo]) - c.cum[lo] || 1;
      const t = (d - c.cum[lo]) / segLen;
      const a = c.path[lo];
      const b = c.path[Math.min(lo + 1, c.path.length - 1)];
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      let tx = (b[0] - a[0]) * c.dir;
      let ty = (b[1] - a[1]) * c.dir;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const o = ci * 16;
      if (fogOfWar && this.visibleAt(x, y) < 0.35) {
        // degenerate transform → nothing rasterises for unseen carts
        buf[o + 15] = 1;
        shad[o + 15] = 1;
        continue;
      }
      const z = Math.max(0, this.field.heightAt(x, y)) + 0.12;
      buf[o] = tx; buf[o + 1] = ty; buf[o + 4] = -ty; buf[o + 5] = tx; buf[o + 10] = 1;
      buf[o + 12] = x; buf[o + 13] = y; buf[o + 14] = z; buf[o + 15] = 1;
      this.shadowMatrix(shad, o, x, y, z, 1.0);
    }
    m.thinInstanceSetBuffer('matrix', buf, 16, false);
    this.cartShadow?.thinInstanceSetBuffer('matrix', shad, 16, false);
  }

  /** One settlement — a walled knot of terracotta-roofed buildings under a
   *  faction standard — merged once and thin-instanced per city: static
   *  positions, tier-scaled, owner color set by setCityOwners. */
  private buildCityModel(data: CampaignData) {
    const parts: Mesh[] = [];
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
      parts.push(this.paint(roof, 0.66, 0.4, 0.3, 0)); // neutral terracotta — every city alike
    };
    building(0, 0, 2.4, 2.4, 3.0); // the forum/temple at the center
    let s = 2654435761 | 0;
    const rand = () => (s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x80000000;
    for (let i = 0; i < 18; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.9 + rand() * 3.0;
      building(Math.cos(a) * r, Math.sin(a) * r, 0.8 + rand() * 1.0, 0.8 + rand() * 1.0, 1.1 + rand() * 1.4);
    }
    // The standard: a tall mast flying a big rectangular banner. The banner is
    // the only livery part (alpha 1), so its per-city iColor — set to the
    // allegiance colour (friend/neutral/foe) in setCityOwners — is what tells
    // the player whose town this is at a glance.
    const pole = CreateBox('cp', { width: 0.22, depth: 0.22, height: 9.5 }, this.scene);
    pole.rotation.x = Math.PI / 2;
    pole.position.set(0, 0, 4.75);
    parts.push(this.paint(pole, 0.45, 0.36, 0.28, 0)); // timber, neutral
    const flag = CreateBox('cf', { width: 5.4, depth: 0.18, height: 3.2 }, this.scene);
    flag.rotation.x = Math.PI / 2;
    flag.position.set(2.7, 0, 7.7);
    parts.push(this.paint(flag, 1, 1, 1, 1)); // livery: takes the allegiance colour

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
    this.cityModelMats = mats;
    this.cityShadowMats = shadows;
    this.cityPos = cityList.map((c) => [c.n.pos[0], c.n.pos[1]] as [number, number]);
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
    this.cityPosByNode = new Map(cityList.map((c, k) => [c.i, [
      c.n.pos[0], c.n.pos[1], (mats[k * 16 + 14]), c.n.tier,
    ] as [number, number, number, number]]));

    // Green selection ring — a flat torus laid on the ground under the ONE
    // city whose panel is open (positioned in setSelectedCity), hidden
    // otherwise. The ONLY ring on the map, and it is always green.
    const sel = CreateTorus('csel', { diameter: 9.5, thickness: 0.7, tessellation: 36 }, this.scene);
    sel.rotation.x = Math.PI / 2;
    this.paint(sel, 0.2, 0.95, 0.35, 0); // bright green
    sel.material = this.modelMat;
    sel.alwaysSelectAsActiveMesh = true;
    sel.setEnabled(false);
    this.citySelRing = sel;
  }

  /** Place the green ring under the selected city (or hide it). Called each
   *  frame with the open-panel node index; -1 clears it. */
  setSelectedCity(node: number) {
    const ring = this.citySelRing;
    if (!ring) return;
    const p = node >= 0 ? this.cityPosByNode.get(node) : undefined;
    if (!p) {
      ring.thinInstanceCount = 0;
      ring.setEnabled(false);
      return;
    }
    const S = p[3] >= 3 ? 1.9 : p[3] === 2 ? 1.35 : 0.95; // match the town scale
    ring.thinInstanceSetBuffer('matrix', new Float32Array([
      S, 0, 0, 0, 0, S, 0, 0, 0, 0, S, 0, p[0], p[1], p[2] + 0.12, 1,
    ]), 16, false);
    ring.thinInstanceSetBuffer('iColor', new Float32Array([0, 0, 0, 0]), 4, false);
    ring.setEnabled(true);
  }

  /** Recolour each settlement's banner to its OWNER's faction colour — the
   *  flag flies the realm's livery (the allegiance read lives in the 2D name
   *  icon instead). Called when ownership changes. */
  setCityOwners(cities: Map<number, { owner: number }>, _playerFaction: number) {
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

  /** Fog of war for the 3D settlements: collapse (zero-scale) any city the
   *  player can't see, so unseen enemy towns leave nothing on the map. Restores
   *  the full transforms the moment fog turns off. */
  private applyCityFog(fogOfWar: boolean) {
    const m = this.cityMesh;
    if (!m || this.cityModelMats.length === 0) return;
    if (!fogOfWar) {
      if (!this.cityFogged) return; // already showing the full set
      m.thinInstanceSetBuffer('matrix', this.cityModelMats, 16, true);
      this.cityShadow?.thinInstanceSetBuffer('matrix', this.cityShadowMats, 16, true);
      this.cityFogged = false;
      return;
    }
    const mats = this.cityModelMats.slice();
    const shad = this.cityShadowMats.slice();
    for (let k = 0; k < this.cityPos.length; k++) {
      const [x, y] = this.cityPos[k];
      if (this.visibleAt(x, y) >= 0.35) continue;
      const o = k * 16;
      mats[o] = mats[o + 5] = mats[o + 10] = 0; // degenerate → nothing rasterises
      shad[o] = shad[o + 5] = 0;
    }
    m.thinInstanceSetBuffer('matrix', mats, 16, true);
    this.cityShadow?.thinInstanceSetBuffer('matrix', shad, 16, true);
    this.cityFogged = true;
  }

  /** Reposition the army models from the live army list (called each frame
   *  before draw). Cheap: a few dozen instances, two small buffers. */
  setArmies(
    armies: { id: number; x: number; y: number; faction: number; soldiers: number; roster: number[]; mine?: boolean }[],
    scale: number,
    selected = -1,
    hover = -1,
    fogOfWar = false,
  ) {
    const baseM = this.armyBase;
    if (!baseM) return;
    // Under fog of war an army the player can't see leaves no model on the map
    // (their own armies light their own sight, so always survive the filter).
    if (fogOfWar) armies = armies.filter((a) => this.visibleAt(a.x, a.y) >= 0.35);
    const n = armies.length;
    this.armyCount = n;
    if (n === 0) {
      baseM.thinInstanceCount = 0;
      if (this.armyShadow) this.armyShadow.thinInstanceCount = 0;
      for (const m of this.classMeshes) if (m) m.thinInstanceCount = 0;
      return;
    }
    // Hold a roughly constant on-screen footprint (scale is CSS px/km) so
    // armies read at play zoom without ballooning up close.
    const S = Math.min(13, Math.max(5, 80 / (3.2 * scale)));
    const figScale = S * 1.25;
    const baseMats = new Float32Array(n * 16);
    const baseCols = new Float32Array(n * 4);
    const shadows = new Float32Array(n * 16);
    // Per-class figure instances, accumulated across all armies.
    const fmats: number[][] = Array.from({ length: 9 }, () => []);
    const fcols: number[][] = Array.from({ length: 9 }, () => []);
    const clock = performance.now() / 1000;
    let selPos: [number, number, number] | null = null;
    for (let i = 0; i < n; i++) {
      const a = armies[i];
      const z = Math.max(0, this.field.heightAt(a.x, a.y));
      if (a.id === selected) selPos = [a.x, a.y, z];
      // Soldiers AND the pennant fly the faction's livery; the allegiance read
      // lives in the 2D army-name icon instead.
      const c = this.factionColors[a.faction] ?? [0.6, 0.6, 0.6];
      // iColor.a is the highlight flag the shader reads (not opacity).
      const hi = a.id === selected ? 1 : a.id === hover ? 0.5 : 0;
      // March bob: ease the amplitude toward 1 when the army crept forward this
      // frame, 0 when it halted. A big jump (a teleport/place) is NOT marching.
      const m0 = this.armyMarch.get(a.id);
      const moved = m0 ? Math.hypot(a.x - m0.px, a.y - m0.py) : 0;
      const marching = moved > 1e-4 && moved < 3 ? 1 : 0;
      const amp = (m0 ? m0.amp : 0) + (marching - (m0 ? m0.amp : 0)) * 0.18;
      this.armyMarch.set(a.id, { px: a.x, py: a.y, amp });
      const bobH = amp * 0.16 * figScale; // metres of bounce at full march
      const o = i * 16;
      baseMats[o] = S; baseMats[o + 5] = S; baseMats[o + 10] = S; baseMats[o + 15] = 1;
      baseMats[o + 12] = a.x; baseMats[o + 13] = a.y; baseMats[o + 14] = z;
      baseCols[i * 4] = c[0]; baseCols[i * 4 + 1] = c[1]; baseCols[i * 4 + 2] = c[2]; baseCols[i * 4 + 3] = hi;
      this.shadowMatrix(shadows, o, a.x, a.y, z, 1.9 * S);
      // Figures: count by size, classes by composition, placed in the slots.
      const alloc = allocFigures(a.roster, figureCount(a.soldiers));
      let slot = 0;
      for (let cls = 0; cls < 9; cls++) {
        for (let k = 0; k < alloc[cls] && slot < ARMY_SLOTS.length; k++, slot++) {
          const [ox, oy] = ARMY_SLOTS[slot];
          // Each figure bobs on its own phase so the file ripples, not pumps.
          const bob = bobH > 0 ? Math.max(0, Math.sin(clock * 9 + slot * 1.6)) * bobH : 0;
          fmats[cls].push(
            figScale, 0, 0, 0, 0, figScale, 0, 0, 0, 0, figScale, 0,
            a.x + ox * S, a.y + oy * S, z + bob, 1,
          );
          fcols[cls].push(c[0], c[1], c[2], hi);
        }
      }
    }
    baseM.thinInstanceSetBuffer('matrix', baseMats, 16, false);
    baseM.thinInstanceSetBuffer('iColor', baseCols, 4, false);
    this.armyShadow?.thinInstanceSetBuffer('matrix', shadows, 16, false);
    // Green selection ring: one instance under the selected army, else hidden.
    const ring = this.armySelRing;
    if (ring) {
      if (selPos) {
        const rs = 0.62 * S; // torus diameter 7.5 → roughly the army footprint
        ring.thinInstanceSetBuffer('matrix', new Float32Array([
          rs, 0, 0, 0, 0, rs, 0, 0, 0, 0, rs, 0, selPos[0], selPos[1], selPos[2] + 0.12, 1,
        ]), 16, false);
        ring.thinInstanceSetBuffer('iColor', new Float32Array([0, 0, 0, 0]), 4, false);
        ring.setEnabled(true);
      } else {
        ring.thinInstanceCount = 0;
        ring.setEnabled(false);
      }
    }
    for (let cls = 0; cls < 9; cls++) {
      const m = this.classMeshes[cls];
      if (!m) continue;
      if (fmats[cls].length) {
        m.thinInstanceSetBuffer('matrix', new Float32Array(fmats[cls]), 16, false);
        m.thinInstanceSetBuffer('iColor', new Float32Array(fcols[cls]), 4, false);
      } else {
        m.thinInstanceCount = 0;
      }
    }
  }

  updateTerritory(rgba: Uint8Array) {
    this.terrTex.update(rgba);
  }

  /** How visible a world point is to the player (0 hidden … 1 seen), read from
   *  the current sight mask — lets the overlay drop fogged enemy markers. */
  visibleAt(wx: number, wy: number): number {
    if (this.visW === 0) return 1;
    const [minX, minY, maxX, maxY] = this.bgRect;
    const gx = Math.floor((wx - minX) / (maxX - minX) * this.visW);
    const gy = Math.floor((maxY - wy) / (maxY - minY) * this.visH);
    if (gx < 0 || gy < 0 || gx >= this.visW || gy >= this.visH) return 0;
    return this.visBuf[(gy * this.visW + gx) * 4] / 255;
  }

  /** Rebuild the fog-of-war sight mask from the player's vision sources (their
   *  cities and armies). Each is a soft disc of radius `r` km; the union is the
   *  seen area. Cheap: a low-res grid, a handful of bounded disc fills. */
  setVision(sources: { x: number; y: number; r: number }[]) {
    const buf = this.visBuf;
    buf.fill(0);
    const [minX, minY, maxX, maxY] = this.bgRect;
    const sx = this.visW / (maxX - minX);
    const sy = this.visH / (maxY - minY);
    for (const s of sources) {
      const r = s.r;
      // grid bbox of the disc (y flips: world +y north = row 0 at top)
      const gx0 = Math.max(0, Math.floor((s.x - r - minX) * sx));
      const gx1 = Math.min(this.visW - 1, Math.ceil((s.x + r - minX) * sx));
      const gy0 = Math.max(0, Math.floor((maxY - (s.y + r)) * sy));
      const gy1 = Math.min(this.visH - 1, Math.ceil((maxY - (s.y - r)) * sy));
      for (let gy = gy0; gy <= gy1; gy++) {
        const wy = maxY - (gy + 0.5) / sy;
        for (let gx = gx0; gx <= gx1; gx++) {
          const wx = minX + (gx + 0.5) / sx;
          const d = Math.hypot(wx - s.x, wy - s.y);
          if (d >= r) continue;
          // soft edge over the outer 35% of the radius
          const v = Math.min(1, (1 - d / r) / 0.35);
          const o = (gy * this.visW + gx) * 4;
          const cur = buf[o] / 255;
          buf[o] = Math.max(buf[o], Math.round(Math.max(cur, v) * 255));
        }
      }
    }
    this.visTex.update(buf);
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

  /** Territory overlay strength: full and saturated across the political and
   *  regional zooms, only thinning to a faint tint once you dive into the 3D
   *  terrain (so the political colours stay rich until you're really close). */
  territoryAlpha(scale: number): number {
    const t = Math.min(1, Math.max(0, (scale - 0.55) / (1.0 - 0.55)));
    const s = t * t * (3 - 2 * t);
    return 0.9 - s * 0.74;
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

  draw(cam: CamView, factionView = true, fogOfWar = false) {
    this.updateCamera(cam);
    const tilt = (Math.PI / 2 - this.pitch) / (Math.PI / 2 - MIN_PITCH);
    const time = this.fixedTime ?? performance.now() / 1000;
    // Political overlay strength: zoom-faded when on, fully off in natural view.
    const terrAlpha = factionView ? this.territoryAlpha(cam.scale) : 0;

    const coarseView = cam.scale < 0.5;
    this.coarse.setEnabled(coarseView);
    for (const c of this.chunks) c.setEnabled(!coarseView);
    for (const t of this.treeMeshes) t.setEnabled(cam.scale >= TREE_MIN_SCALE);
    const armiesOn = cam.scale >= ARMY_MIN_SCALE && this.armyCount > 0;
    this.armyBase?.setEnabled(armiesOn);
    this.armyShadow?.setEnabled(armiesOn);
    for (const m of this.classMeshes) m?.setEnabled(armiesOn);
    // The selection ring follows the armies-visible gate AND its own selection
    // state (it has no instance when nothing is picked).
    if (this.armySelRing) this.armySelRing.setEnabled(armiesOn && this.armySelRing.thinInstanceCount > 0);
    const citiesOn = cam.scale >= CITY_MODEL_MIN_SCALE;
    this.cityMesh?.setEnabled(citiesOn);
    this.cityShadow?.setEnabled(citiesOn);
    if (this.citySelRing) this.citySelRing.setEnabled(citiesOn && this.citySelRing.thinInstanceCount > 0);
    if (citiesOn) this.applyCityFog(fogOfWar);
    // Roads show once off the political overview, fading in as the land does.
    this.roadMesh?.setEnabled(cam.scale >= 0.4);
    this.roadMat.setFloat('uFogD', 1 / (this.dist * 4.5));
    this.roadMat.setFloat('uFogStr', tilt * 0.85);
    // Relief props: mountains read from a fair way out; rocks join the trees.
    this.mountainMesh?.setEnabled(cam.scale >= 0.28);
    this.mtnShadow?.setEnabled(cam.scale >= 0.28);
    this.rockMesh?.setEnabled(cam.scale >= TREE_MIN_SCALE);
    // Cart traffic crawls the roads once the world is tilted into 3D.
    const cartsOn = cam.scale >= 0.6 && this.carts.length > 0;
    this.cartMesh?.setEnabled(cartsOn);
    this.cartShadow?.setEnabled(cartsOn);
    if (cartsOn) this.updateCarts(time, fogOfWar);
    this.sceneMat.setFloat('uFogD', 1 / (this.dist * 4.5));
    this.sceneMat.setFloat('uFogStr', tilt * 0.85);

    this.terrainMat.setVector3('uEyePos', this.camera.position);
    this.terrainMat.setVector2('uFx', new Vector2(terrAlpha, tilt * 0.85));
    this.terrainMat.setFloat('uFogD', 1 / (this.dist * 4.5));
    this.terrainMat.setFloat('uTime', time);
    // Decorative rim clouds frame the chart at the overview; suppress them under
    // gameplay fog of war (the fog's own cloud bank carries the edges instead).
    this.terrainMat.setFloat('uCloud', fogOfWar ? 0 : Math.min(1, Math.max(0, (0.46 - cam.scale) / 0.3)));
    this.terrainMat.setFloat('uFow', fogOfWar ? 1 : 0);
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
