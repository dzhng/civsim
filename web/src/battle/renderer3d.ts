// Babylon.js battle renderer. The battlefield runs on the same engine as
// the campaign map. Soldiers are real 3D meshes thin-instanced from the
// same zero-copy wasm buffers the sim exposes, with a zoom-driven level of
// detail: zoomed out the view flattens to the classic top-down 2D sprites
// (readable, cheap at 30k); zoomed in the camera tilts and the 3D models
// take over. The ground is the ported battle shader — tint palettes,
// wildflowers, animated water, the micro-terrain rocks (the GLSL twin of
// sim terrain.rs::micro_rough), and the map-edge border.

import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Camera as BCamera } from '@babylonjs/core/Cameras/camera';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import {
  MODEL_LOOK_COUNT,
  SHOCK_CAV_SIDEARM_LOOK,
  classGeometry,
  classGeometryDetailed,
  modelLookForClass,
  type Pose,
} from '../shared/soldierModel';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector2, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Constants } from '@babylonjs/core/Engines/constants';
import '@babylonjs/core/Meshes/thinInstanceMesh';

import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';

import type { Camera } from '../shared/camera';
import { WILDS_MARGIN } from './renderer';
import { buildAtlas, COLS, ROWS } from './atlas';
import {
  drawBannerCanvas, BANNER_DESIGN_W, BANNER_DESIGN_H, type BannerState,
} from './unitBanner';

const TEAM_COLOR: [number, number, number][] = [
  [0.22, 0.41, 0.78], // player blue
  [0.78, 0.25, 0.23], // enemy red
];
// Faction accent for the detailed models: realistic soldiers, told apart by a
// coloured crest/plume, shield emblem and sash (NOT a whole-body tint). Indexed
// by team for now; a per-unit faction id can route here later.
const FACTION_ACCENT: [number, number, number][] = [
  [0.20, 0.42, 0.88], // player — deep blue
  [0.84, 0.24, 0.20], // enemy — crimson
];
// The detailed-model pose ladder. Each entry is baked into one mesh per
// (class, faction); the renderer routes every soldier to the rung his sim frame
// asks for. Order matters — the indices below name the rungs.
const POSES: Partial<Pose>[] = [
  { rest: 0 },                                  // 0 IDLE / alert guard
  { rest: 0.25 }, { rest: 0.5 }, { rest: 0.75 }, { rest: 1 }, // 1-4 at-ease ladder (pikes rise)
  { legPhase: 1, stride: 1 }, { legPhase: -1, stride: 1 },    // 5-6 march beats
  { legPhase: 1, stride: 1.5, lean: 0.32 }, { legPhase: -1, stride: 1.5, lean: 0.32 }, // 7-8 run beats
  { windup: 1 },                                // 9 attack windup (review harness)
  { attack: 1 },                                // 10 attack strike
  { recoil: 1.2 },                              // 11 hit recoil
  { crumple: 1, recoil: 0.45 },                 // 12 death crumple
];
const P_IDLE = 0, P_EASE_TOP = 4, P_MARCH_A = 5, P_RUN_A = 7;
const P_ATTACK_WIND = 9, P_ATTACK = 10, P_HIT = 11, P_CRUMPLE = 12;
// Below ZOOM_FLAT: pure top-down 2D sprites. Above ZOOM_3D: full tilt + 3D
// meshes. Between, the camera tilts and the renderer switches at ZOOM_SWAP.
// The band sits just above the fully-zoomed-out strategic view (minZoom ≈ 1.5–2
// for a whole battlefield): 2D is ONLY for that all-the-way-out look; any closer
// and you're in 3D models. (zoom = device px per metre; battle default ≈ 6.)
const ZOOM_FLAT = 2;
const ZOOM_3D = 7;
const ZOOM_SWAP = 2.4;
const MAX_PITCH = 0.42; // zoom-driven auto tilt (top-down → this when zoomed in)
const MAX_PITCH_USER = 1.18; // how far down the user can tilt (Total War low angle)
// Pose meshes are built per (class, team) at each rung of a ladder and the
// renderer routes each soldier to the rung his state asks for. Block mode uses
// a 6-step rest ladder (geometry lerped from fighting to at-ease, for the pike
// raise); detailed mode uses the richer POSES table (rest ladder + march/run/
// attack/hit/death). Buckets: rung*POSE_BUCKET + look*2 + team.
const POSE_STEPS_BLOCK = 6;
const POSE_BUCKET = MODEL_LOOK_COUNT * 2;
const REST_FULL_SECS = 0.8; // wall-clock time for a full raise/lower
const DEATH_SECS = 0.55; // wall-clock time for a fallen man to crumple + topple
const FRAME_REST = 6; // sim frame value the scene tags an at-ease (standing) man with
// A pikeman who has drawn his side-arm: pike stowed UPRIGHT, but snapped there at
// once (not the slow at-ease sweep) — so a flank fighter never shows a half-
// leveled pike pointing aside, and the fast-forward vibe harness reads true.
const FRAME_STOW = 7;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// --- Ground shader (ported from the 2D battle ground) ---------------------
ShaderStore.ShadersStore['battleGroundVertexShader'] = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 viewProjection;
uniform vec4 uMapRect;
varying vec2 vUV;
varying vec2 vWorld;
varying vec3 vNormal;
void main() {
  gl_Position = viewProjection * vec4(position, 1.0);
  vWorld = position.xy;
  vNormal = normal;
  vUV = (position.xy - uMapRect.xy) / uMapRect.zw;
}`;
ShaderStore.ShadersStore['battleGroundFragmentShader'] = `
precision highp float;
varying vec2 vUV;
varying vec2 vWorld;
varying vec3 vNormal;
uniform sampler2D uTerrain;
uniform float uTime;
uniform float uFlatRock; // 1 = paint flat micro-rocks (far view), 0 = the 3D props carry them (near)
uniform float uElevated; // 1 = hills (shade the slopes), 0 = flat stage (no slope term)
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
uint microHash(int x, int y) {
  uint h = uint(x) * 2246822507u ^ uint(y) * 3266489917u;
  h ^= h >> 13; h *= 668265263u; h ^= h >> 16; return h;
}
float microRock(vec2 w) {
  vec2 c = floor(w / 3.0);
  uint h = microHash(int(c.x), int(c.y));
  if ((h & 255u) < 89u) {
    float r = 0.4 + 0.35 * float((h >> 8) & 255u) / 255.0;
    float jx = float((h >> 16) & 255u) / 255.0 * (3.0 - 2.0 * r) + r;
    float jy = float((h >> 24) & 255u) / 255.0 * (3.0 - 2.0 * r) + r;
    vec2 d = w - (c * 3.0 + vec2(jx, jy));
    float dd = dot(d, d);
    if (dd < r * r) return 2.0 - dd / (r * r);
  }
  return 0.0;
}
void main() {
  bool outside = vUV.x < 0.0 || vUV.x > 1.0 || vUV.y < 0.0 || vUV.y > 1.0;
  vec3 t = outside ? vec3(1.0, 0.6, 0.0) : texture2D(uTerrain, vUV).rgb;
  float tint = outside ? 99.0 : floor(t.b * 8.0 + 0.5);
  float n1 = noise(vWorld * 0.11);
  float n2 = noise(vWorld * 0.45);
  float n = n1 * 0.7 + n2 * 0.3;
  vec3 col;
  if (tint < 0.5) {
    col = mix(vec3(0.435, 0.561, 0.290), vec3(0.545, 0.682, 0.333), n);
    col *= 0.94 + 0.06 * noise(vWorld * 1.7);
    float fl = noise(vWorld * 2.9 + 7.3);
    if (fl > 0.935) {
      float pick = hash(floor(vWorld * 2.9 + 7.3));
      vec3 flower = pick > 0.66 ? vec3(0.95, 0.62, 0.78)
                  : pick > 0.33 ? vec3(0.98, 0.95, 0.85) : vec3(0.99, 0.83, 0.38);
      col = mix(col, flower, smoothstep(0.935, 0.97, fl));
    }
  } else if (tint < 1.5) {
    float w = noise(vWorld * 0.22 + vec2(uTime * 0.25, uTime * 0.18));
    col = mix(vec3(0.235, 0.455, 0.604), vec3(0.337, 0.580, 0.722), w);
    float sp = noise(vWorld * 0.9 + vec2(-uTime * 0.7, uTime * 0.2));
    col += vec3(0.35) * smoothstep(0.88, 0.97, sp);
  } else if (tint < 2.5) {
    float ridge = abs(noise(vWorld * 0.18) - 0.5) * 2.0;
    col = mix(vec3(0.45, 0.43, 0.41), vec3(0.68, 0.65, 0.61), ridge);
    col *= 0.88 + 0.12 * n2;
  } else if (tint < 3.5) {
    vec2 brick = fract(vWorld * vec2(0.24, 0.5));
    float mortar = step(0.92, brick.x) + step(0.9, brick.y);
    col = mix(vec3(0.72, 0.62, 0.48), vec3(0.55, 0.47, 0.37), clamp(mortar, 0.0, 1.0));
    col *= 0.92 + 0.08 * n2;
  } else if (tint < 4.5) {
    col = mix(vec3(0.290, 0.420, 0.235), vec3(0.365, 0.490, 0.270), n);
  } else if (tint < 5.5) {
    // Churned wet earth: dark mottled browns, with puddles that turn the
    // ground slate-grey and catch a sheen, and boot-churned streaks.
    float churn = noise(vWorld * 0.5);
    col = mix(vec3(0.30, 0.24, 0.17), vec3(0.45, 0.37, 0.26), churn);
    col *= 0.84 + 0.16 * noise(vWorld * 1.3 + 4.1);
    float streak = noise(vWorld * vec2(0.18, 0.9) + 2.7);
    col *= 0.9 + 0.1 * smoothstep(0.4, 0.7, streak);
    float puddle = smoothstep(0.60, 0.80, noise(vWorld * 0.27 + 2.1));
    vec3 wet = mix(vec3(0.20, 0.19, 0.17), vec3(0.38, 0.39, 0.37), n2);
    col = mix(col, wet, puddle * 0.7);
    col += vec3(0.12) * smoothstep(0.86, 0.96, noise(vWorld * 0.85 + vec2(0.0, 1.7))) * puddle;
  } else if (tint > 90.0) {
    float wild = noise(vWorld * 0.06);
    col = mix(vec3(0.30, 0.40, 0.22), vec3(0.22, 0.31, 0.18), wild);
    col *= 0.85 + 0.15 * n2;
    col = mix(col, vec3(0.16, 0.24, 0.13), smoothstep(0.62, 0.85, noise(vWorld * 0.18 + 3.7)));
  } else {
    col = mix(vec3(0.60, 0.55, 0.38), vec3(0.70, 0.64, 0.44), n2);
  }
  col *= 0.90 + 0.10 * t.r;
  // Slope shading: hillsides toward the sun brighten, away darken — what makes
  // the elevation read as hills and not a flat painted swirl. Only on the
  // elevated battlefield; the flat debug/vibe stage keeps the plain ground tone.
  float sun = clamp(dot(normalize(vNormal), normalize(vec3(0.4, -0.5, 0.78))), 0.0, 1.0);
  col *= mix(1.0, 0.80 + 0.34 * sun, uElevated);
  float rock = microRock(vWorld);
  if (rock > 0.0 && tint != 1.0 && !outside && uFlatRock > 0.01) {
    vec3 stone = mix(vec3(0.42, 0.40, 0.34), vec3(0.30, 0.28, 0.24), min(rock - 1.0, 1.0));
    col = mix(col, stone, 0.85 * uFlatRock);
  }
  vec2 du = fwidth(vUV) * 2.0;
  float bx = min(smoothstep(0.0, du.x, abs(vUV.x)), smoothstep(0.0, du.x, abs(vUV.x - 1.0)));
  float by = min(smoothstep(0.0, du.y, abs(vUV.y)), smoothstep(0.0, du.y, abs(vUV.y - 1.0)));
  float border = 1.0 - min(bx, by);
  col = mix(col, vec3(0.92, 0.86, 0.62), border * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`;

// --- Sprite shader: flat ground billboards from the procedural atlas, the
// zoomed-out 2D look. Per-instance world matrix (rotate by facing + scale)
// and atlas cell (frame, row).
ShaderStore.ShadersStore['battleSpriteVertexShader'] = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 world0; attribute vec4 world1; attribute vec4 world2; attribute vec4 world3;
attribute vec2 cell;
uniform mat4 viewProjection;
uniform vec2 uSheet;
varying vec2 vUV;
void main() {
  mat4 world = mat4(world0, world1, world2, world3);
  gl_Position = viewProjection * world * vec4(position, 1.0);
  vUV = vec2((cell.x + uv.x) / uSheet.x, 1.0 - (cell.y + 1.0 - uv.y) / uSheet.y);
}`;
ShaderStore.ShadersStore['battleSpriteFragmentShader'] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D uAtlas;
void main() {
  vec4 c = texture2D(uAtlas, vUV);
  // The atlas is straight-alpha with a wide transparent margin around each
  // figure. The mip chain box-filters those (0,0,0,0) texels into RGB, so a
  // minified soldier samples near-black even though the man isn't — and with an
  // opaque alpha-test that black is what gets written, collapsing a zoomed-out
  // block of men into a solid black slab. Divide by coverage to recover the
  // figure's true (alpha-weighted) colour. A low cutoff keeps the block solid;
  // a high one makes thin sprites blink out as the camera drifts.
  if (c.a < 0.04) discard;
  gl_FragColor = vec4(c.rgb / c.a, 1.0);
}`;

// --- Overlay shader: world-space vertex-coloured tris/lines for attack-arc
// wedges, paths, selection rings and ghosts, drawn flat on the field.
ShaderStore.ShadersStore['battleOverlayVertexShader'] = `
precision highp float;
attribute vec3 position;
attribute vec4 color;
uniform mat4 viewProjection;
varying vec4 vColor;
void main() {
  gl_Position = viewProjection * vec4(position, 1.0);
  vColor = color;
}`;
ShaderStore.ShadersStore['battleOverlayFragmentShader'] = `
precision highp float;
varying vec4 vColor;
void main() { gl_FragColor = vColor; }`;

// Full-frame colour grade — the SAME warm tone the campaign map wears
// (terrain3d.ts), so the two views feel like one game: a touch of warm tone
// tilt, a saturation lift, gentle contrast. Run as a post-process so it
// covers the custom ground shader, the StandardMaterial soldiers, and the
// sprites uniformly.
ShaderStore.ShadersStore['battleGradeFragmentShader'] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
void main() {
  vec3 c = texture2D(textureSampler, vUV).rgb;
  c = pow(max(c, 0.0), vec3(0.93, 0.97, 1.04));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.22);
  gl_FragColor = vec4(clamp(c * 1.08 - 0.015, 0.0, 1.0), 1.0);
}`;


// Box accumulator for low-poly props; optional per-vertex colour.
function pushBox(
  pos: number[], idx: number[], col: number[] | null,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  c?: [number, number, number],
) {
  const b = pos.length / 3;
  const cs = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  for (const v of cs) { pos.push(v[0], v[1], v[2]); if (col && c) col.push(c[0], c[1], c[2], 1); }
  for (const [a, bb, cc, d] of [
    [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [3, 2, 6, 7], [1, 5, 6, 2], [0, 3, 7, 4],
  ]) idx.push(b + a, b + bb, b + cc, b + a, b + cc, b + d);
}
function finishGeom(pos: number[], idx: number[], col: number[] | null): VertexData {
  const vd = new VertexData();
  vd.positions = pos; vd.indices = idx;
  const normals: number[] = [];
  VertexData.ComputeNormals(pos, idx, normals);
  vd.normals = normals;
  if (col) vd.colors = col;
  return vd;
}
// A boulder: a squat tapered block. A bush: a clump of leafy boxes. A short
// tree: brown stem + a green canopy (vertex-coloured). Unit-ish scale (~1m);
// per-instance matrix sizes them to the micro-pocket radius.
// A small half-buried stone — a knee-high stumble rock, not a boulder.
function rockGeom(): VertexData {
  const p: number[] = [], i: number[] = [];
  pushBox(p, i, null, -0.32, -0.26, 0, 0.28, 0.3, 0.2);
  pushBox(p, i, null, -0.18, -0.14, 0.16, 0.16, 0.16, 0.32);
  return finishGeom(p, i, null);
}
// A low grass/scrub clump — vertex-coloured leafy tufts, greener and shorter
// than the old "bush" so the common scatter reads as meadow growth, not stones.
function grassGeom(): VertexData {
  const p: number[] = [], i: number[] = [], c: number[] = [];
  const G1: [number, number, number] = [0.32, 0.46, 0.21];
  const G2: [number, number, number] = [0.40, 0.54, 0.25];
  pushBox(p, i, c, -0.32, -0.28, 0, 0.18, 0.22, 0.26, G1);
  pushBox(p, i, c, -0.06, -0.2, 0.0, 0.34, 0.3, 0.4, G2); // a taller tuft
  pushBox(p, i, c, -0.2, 0.04, 0.0, 0.12, 0.36, 0.3, G1);
  return finishGeom(p, i, c);
}
// A short tree/sapling — brown stem, layered green canopy. Smaller than before.
function treeGeom(): VertexData {
  const p: number[] = [], i: number[] = [], c: number[] = [];
  pushBox(p, i, c, -0.07, -0.07, 0, 0.07, 0.07, 0.62, [0.32, 0.22, 0.13]); // stem
  pushBox(p, i, c, -0.34, -0.34, 0.48, 0.34, 0.34, 1.18, [0.20, 0.34, 0.15]); // canopy
  pushBox(p, i, c, -0.21, -0.21, 1.08, 0.21, 0.21, 1.46, [0.24, 0.40, 0.18]); // crown
  return finishGeom(p, i, c);
}
// A big jagged boulder — a pile of tilted blocks for the impassable rock /
// rocky cliffs, so an "impassable" feature reads as a crag, not a flat disc.
function boulderGeom(): VertexData {
  const p: number[] = [], i: number[] = [];
  pushBox(p, i, null, -0.7, -0.6, 0, 0.6, 0.55, 0.7);
  pushBox(p, i, null, -0.4, -0.5, 0.5, 0.55, 0.3, 1.15);
  pushBox(p, i, null, -0.55, 0.0, 0.2, 0.1, 0.6, 0.95);
  pushBox(p, i, null, 0.1, -0.3, 0.6, 0.65, 0.35, 1.35); // a spur reaching up
  return finishGeom(p, i, null);
}
// The sim/ground-shader micro hash, in JS, so the scattered props land on
// the SAME 3m discs the sim trips on and the shader speckles.
function microHashJS(x: number, y: number): number {
  let h = (Math.imul(x >>> 0, 0x85ebca6b) ^ Math.imul(y >>> 0, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}

// --- Visual terrain elevation -------------------------------------------------
// The sim is flat (combat is 2D), so elevation is PURELY visual: a smooth
// heightfield that bows the ground into rolling hills and lifts the soldiers,
// props and banners that stand on it. Gentle by design (a few metres) so the
// z=0 picking plane stays close to where a man is drawn. One JS function is the
// single source of truth — the ground grid, its normals, and every entity's
// lift all read it, so nothing floats or sinks.
function hgrad(ix: number, iy: number): number {
  let h = (Math.imul(ix | 0, 0x27d4eb2f) ^ Math.imul(iy | 0, 0x165667b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13;
  return (h & 0xffff) / 0xffff * 2 - 1;
}
function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hgrad(ix, iy), b = hgrad(ix + 1, iy), c = hgrad(ix, iy + 1), d = hgrad(ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}
// A few octaves: a broad long-wavelength swell (big hills, but GENTLE slopes so
// the z=0 picking offset stays small) plus finer rolls and bumps.
export function terrainHeightJS(x: number, y: number): number {
  return valueNoise(x / 310 + 3, y / 310 + 5) * 13
    + valueNoise(x / 135, y / 135) * 7
    + valueNoise(x / 46 + 11, y / 46 + 7) * 2.2
    + valueNoise(x / 17 + 23, y / 17 + 19) * 0.7;
}

// One world-space banner above a unit: a camera-facing quad textured with the
// standard + HP/cohesion bars + status chips, drawn fresh only when the unit's
// state changes (keyed like the DOM component's chipKey). The plane sits at the
// unit's world point and is billboarded, so it tracks the block perfectly in 3D
// — no screen projection, and it depth-sorts/occludes against terrain & ranks.
export interface BannerSlot {
  team: 0 | 1;
  x: number; // centroid world-x
  y: number; // centroid world-y (the pole foot is planted here)
  hp: number;
  cohesion: number;
  chips: { text: string; kind?: 'plain' | 'hot' | 'bad' }[];
  selected: boolean;
}

// Texture DPI: the design box is 56x56 CSS units; render it this many device
// px wide so the bars/text stay crisp zoomed in.
const BANNER_TEX_W = 256;
const BANNER_DPI = BANNER_TEX_W / BANNER_DESIGN_W;
const BANNER_TEX_H = Math.round(BANNER_DESIGN_H * BANNER_DPI);
// World height the banner spans at zoom 1 (meters), tuned so it reads as a
// standard planted in the ranks. Scaled by 1/zoom each frame so it stays a
// roughly constant size on screen (mirrors the old DOM banner, which was fixed
// CSS pixels). Always shown — a banner marks its unit at every zoom.
const BANNER_WORLD_H = 64;

class UnitBannerLayer {
  private meshes: Mesh[] = [];
  private textures: DynamicTexture[] = [];
  private ctxs: CanvasRenderingContext2D[] = [];
  private keys: string[] = [];

  constructor(private scene: Scene) {}

  private ensure(n: number) {
    while (this.meshes.length < n) {
      const i = this.meshes.length;
      const tex = new DynamicTexture(
        `banner_${i}`, { width: BANNER_TEX_W, height: BANNER_TEX_H }, this.scene, true,
      );
      tex.hasAlpha = true;
      const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
      const mat = new StandardMaterial(`bannerMat_${i}`, this.scene);
      mat.diffuseTexture = tex;
      mat.opacityTexture = tex;
      mat.emissiveColor = new Color3(1, 1, 1); // unlit: read at any sun angle
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      // The banner is HUD-like signage: draw it on top of soldiers/terrain so it
      // is never buried in a deep block, while still tracking its world point.
      mat.disableDepthWrite = true;
      const aspect = BANNER_TEX_W / BANNER_TEX_H;
      const plane = CreatePlane(`banner_${i}`, { width: aspect, height: 1 }, this.scene);
      plane.material = mat;
      plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
      plane.isPickable = false;
      plane.alwaysSelectAsActiveMesh = true;
      plane.renderingGroupId = 1; // after the world (group 0): always on top
      plane.isVisible = false;
      this.meshes.push(plane);
      this.textures.push(tex);
      this.ctxs.push(ctx);
      this.keys.push('');
    }
  }

  /** Place + texture every live banner; hide the rest. `zoom` scales the world
   *  size so the banner stays roughly constant on screen at every zoom. */
  update(slots: (BannerSlot | null)[], zoom: number, gz: (x: number, y: number) => number) {
    this.ensure(slots.length);
    const worldH = BANNER_WORLD_H / zoom;
    for (let u = 0; u < this.meshes.length; u++) {
      const m = this.meshes[u];
      const slot = u < slots.length ? slots[u] : null;
      if (!slot) { m.isVisible = false; continue; }
      m.isVisible = true;
      m.scaling.set(worldH, worldH, 1);
      // The texture is bottom-anchored on the pole foot; lift the plane by half
      // its height so the foot sits at the unit's top edge (z just above ground).
      m.position.set(slot.x, slot.y, gz(slot.x, slot.y) + worldH * 0.5 + 0.2);
      // Redraw the texture only when the unit's state actually changes (quantise
      // the bars so a sub-pixel cohesion drift doesn't churn the canvas), like
      // the DOM component's chipKey.
      const key = `${slot.team}|${(slot.hp * 64) | 0}|${(slot.cohesion * 64) | 0}|${slot.selected ? 1 : 0}|`
        + slot.chips.map((c) => (c.kind ?? '') + c.text).join('|');
      if (key !== this.keys[u]) {
        this.keys[u] = key;
        const state: BannerState = {
          team: slot.team, hp: slot.hp, cohesion: slot.cohesion, chips: slot.chips, selected: slot.selected,
        };
        const ctx = this.ctxs[u];
        ctx.clearRect(0, 0, BANNER_TEX_W, BANNER_TEX_H);
        drawBannerCanvas(ctx, state, BANNER_DPI);
        this.textures[u].update();
      }
    }
  }
}

export class BattleRenderer3D {
  private engine: Engine;
  private scene: Scene;
  private camera: FreeCamera;
  // 3D path: one mesh per (model look, team) so campaign unit variants can
  // share a tactical class while wearing different models. 2D path: one
  // atlas-textured sprite mesh.
  private classMesh: Mesh[] = [];
  private classMats: Float32Array[] = [];
  private classN: number[] = [];
  private sprite!: Mesh;
  private spriteMats = new Float32Array(0);
  private spriteCells = new Float32Array(0);
  private ground: Mesh;
  private groundMat!: ShaderMaterial;
  private terrTex: RawTexture | null = null;
  private overlayMesh!: Mesh; // path/selection/ghost line work
  private triMesh!: Mesh;     // attack-arc wedges (translucent fill)
  private banners!: UnitBannerLayer; // world-space unit standards (billboards)
  // Scatter props standing on the micro-pockets: 0 rock, 1 bush, 2 tree.
  // Thin-instanced from whatever 3m discs fall in the visible AABB.
  private scatterMesh: Mesh[] = [];
  private scatterMats: Float32Array[] = Array.from({ length: 4 }, () => new Float32Array(0));
  // The tint grid + dims, kept so updateScatter can read the ground type
  // under each pocket and pick rock vs bush vs tree.
  private tintGrid: Uint8Array = new Uint8Array(0);
  private terrW = 0;
  private terrH = 0;
  private terrCell = 1;
  private terrOx = 0;
  private terrOy = 0;
  private start = performance.now();
  private cap = 0;
  // Per-soldier static data (indexed by soldier id).
  private teamOf: Uint8Array = new Uint8Array(0);
  private lookOf: Uint8Array = new Uint8Array(0);
  private scaleOf = new Float32Array(0); // 3D mesh scale
  private rowOf = new Float32Array(0); // atlas row (class+team)
  private sizeOf = new Float32Array(0); // sprite world size
  // Per-soldier weapon-variant flag (1 = drawn sidearm), set per frame by the
  // scene from the sim's cur_weapon: a shock lancer grinding with its sabre is
  // routed to the render-only sidearm pseudo-class so the mesh shows a sword.
  private sidearmOf: Uint8Array = new Uint8Array(0);
  // Per-soldier at-ease blend in [0,1], eased toward its target (1 when the
  // sim tags the man at-ease, else 0) each frame so the pose sweeps, not snaps.
  private restFrac = new Float32Array(0);
  private lastPoseT = 0; // wall-clock of the last pose-blend step, for dt
  /** Live view tilt (camera.ts mirrors it for picking). */
  pitch = 0;
  /** Debug turntable: force a fixed view tilt instead of the zoom-driven one
   *  (model-review harness, ?test=models). null = normal zoom-coupled pitch. */
  pitchOverride: number | null = null;
  /** Scattered grass/trees/boulders. Off on the flat debug/vibe stage
   *  (?debug=blocks) so the field-wide props don't churn the behaviour
   *  baselines, and dropped by the turntable for a clean model stage. */
  enableScatter = new URLSearchParams(location.search).get('debug') !== 'blocks';
  fixedTime: number | null = null;
  /** `?debug=blocks`: render the flat team-coloured BLOCK soldiers (the vibe /
   *  debug model) instead of the detailed faction-accented figures. Vibe shots
   *  force this so their baselines never churn while the real models evolve. */
  blockMode = new URLSearchParams(location.search).get('debug') === 'blocks';
  /** Visual hill elevation. On for the real game; OFF for the flat vibe stage
   *  (?debug=blocks) so behaviour baselines stay stable, and for the turntable. */
  elevation = new URLSearchParams(location.search).get('debug') !== 'blocks';
  /** Heightfield sample, gated by `elevation` so the flat stages stay flat. */
  private gz(x: number, y: number): number {
    return this.elevation ? terrainHeightJS(x, y) : 0;
  }

  /** Extra elevation over impassable ROCK/WALL cells, so a "rock" feature rises
   *  into a jagged rocky cliff instead of sitting as a flat grey disc. Reads the
   *  tint grid: the 3×3 rock fraction makes a smooth mound, a noise jitters its
   *  crest into crags. Off when `elevation` is off (flat stages). */
  private tintHeight(x: number, y: number): number {
    if (!this.elevation || this.terrW === 0) return 0;
    const gx = Math.floor((x - this.terrOx) / this.terrCell);
    const gy = Math.floor((y - this.terrOy) / this.terrCell);
    let rock = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ix = gx + dx, iy = gy + dy;
        if (ix < 0 || iy < 0 || ix >= this.terrW || iy >= this.terrH) continue;
        const t = this.tintGrid[iy * this.terrW + ix];
        if (t === 2 || t === 3) rock++;
      }
    }
    if (rock === 0) return 0;
    const frac = rock / 9;
    return frac * 14 * (0.6 + 0.7 * valueNoise(x / 11 + 5, y / 11 + 2) ** 2 + 0.4 * valueNoise(x / 4, y / 4));
  }
  private nPose = POSES.length; // pose rungs per (class, team); set in the ctor
  // Per-soldier death-collapse blend in [0,1], eased up once a man falls so he
  // crumples and tips over a beat instead of snapping flat.
  private deathFrac = new Float32Array(0);

  constructor(private canvas: HTMLCanvasElement) {
    // adaptToDeviceRatio = true: size the backing store to device pixels
    // (clientWidth * dpr), the same convention the old 2D renderer used and
    // that camera.ts / input.ts assume (zoom is device-px-per-metre, picks
    // multiply clientX by dpr). With it false the canvas stayed CSS-sized, so on
    // a Retina screen every click mapped to the wrong world point and selected
    // nothing. It also renders the field at full resolution instead of upscaled.
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
    this.scene = new Scene(this.engine);
    this.scene.useRightHandedSystem = true; // x east, y north, z up
    this.scene.clearColor = new Color4(0.06, 0.07, 0.06, 1);
    this.scene.skipPointerMovePicking = true;
    // We do all selection/camera input ourselves off the legacy mouse events
    // (see input.ts). Babylon's scene input preventDefault()s every pointerdown/
    // up, which suppresses the compatibility mouse events those handlers rely on
    // — so left-click select and right-drag pan would silently die. Let the
    // pointer events through; Babylon does no picking of its own here.
    this.scene.preventDefaultOnPointerDown = false;
    this.scene.preventDefaultOnPointerUp = false;

    this.camera = new FreeCamera('battle', new Vector3(0, 0, 1000), this.scene);
    this.camera.mode = BCamera.ORTHOGRAPHIC_CAMERA;
    this.camera.minZ = -5000;
    this.camera.maxZ = 5000;
    // Cohesion with the campaign map: the same warm grade over the whole frame.
    new PostProcess('grade', 'battleGrade', null, null, 1.0, this.camera);

    const sky = new HemisphericLight('sky', new Vector3(0, 0, 1), this.scene);
    sky.intensity = 0.78;
    sky.groundColor = new Color3(0.34, 0.36, 0.32);
    const sun = new DirectionalLight('sun', new Vector3(-0.4, 0.5, -0.78), this.scene);
    sun.intensity = 0.8;

    // Ground.
    this.ground = new Mesh('ground', this.scene);
    this.groundMat = new ShaderMaterial('ground', this.scene, 'battleGround', {
      attributes: ['position', 'normal'],
      uniforms: ['viewProjection', 'uMapRect', 'uTime', 'uFlatRock', 'uElevated'],
      samplers: ['uTerrain'],
    });
    this.groundMat.backFaceCulling = false;
    this.ground.material = this.groundMat;
    this.ground.freezeWorldMatrix();

    // 3D soldier meshes: one per (class, team) at each rung of the pose ladder.
    // Detailed mode bakes the full POSES table (rest ladder + march/run/attack/
    // hit/death) with per-vertex realistic colours and a per-faction accent;
    // block mode bakes a 6-rung rest ladder of the flat team-coloured boxes.
    this.nPose = this.blockMode ? POSE_STEPS_BLOCK : POSES.length;
    // Share materials across ALL soldier meshes — every detailed figure carries
    // its colour in vertex colours, so one white material serves them all; block
    // mode needs just one per team. (Per-mesh materials — 288 of them — were
    // enough GPU state to fail boot on concurrent software-GL pages.)
    const detailMat = new StandardMaterial('soldierDetail', this.scene);
    detailMat.diffuseColor = new Color3(1, 1, 1);
    detailMat.specularColor = new Color3(0.08, 0.08, 0.08);
    // A shared procedural GRAIN texture (woven cloth + fine speckle) tiled over
    // the figures by their planar UVs — it MULTIPLIES the vertex colours, so cloth
    // reads as cloth and bronze gets a faint hammered grain instead of a flat
    // fill, without per-class texture atlases. Block mode stays untextured.
    if (!this.blockMode) {
      const grain = new DynamicTexture('soldierGrain', { width: 64, height: 64 }, this.scene, false);
      const gctx = grain.getContext() as unknown as CanvasRenderingContext2D;
      const img = gctx.createImageData(64, 64);
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          // A woven over-under (threads brighten where warp crosses weft) plus a
          // per-texel speckle, centred near white so the multiply keeps the vertex
          // hue but gives cloth a weave and metal a hammered grain.
          const warp = Math.sin(x * 1.05) * 0.5 + 0.5;
          const weft = Math.sin(y * 1.05) * 0.5 + 0.5;
          const weave = (warp * weft - 0.25) * 0.22;
          const speck = hgrad(x * 7 + 1, y * 13 + 3) * 0.16; // deterministic, so snapshots are stable
          const v = Math.max(0, Math.min(1, 0.9 + weave + speck));
          const o = (y * 64 + x) * 4;
          img.data[o] = img.data[o + 1] = img.data[o + 2] = (v * 255) | 0;
          img.data[o + 3] = 255;
        }
      }
      gctx.putImageData(img, 0, 0);
      grain.update();
      grain.wrapU = Texture.WRAP_ADDRESSMODE;
      grain.wrapV = Texture.WRAP_ADDRESSMODE;
      detailMat.diffuseTexture = grain;
    }
    const teamMat = TEAM_COLOR.map((c, t) => {
      const m = new StandardMaterial(`soldierTeam${t}`, this.scene);
      m.diffuseColor = new Color3(c[0], c[1], c[2]);
      m.specularColor = new Color3(0.05, 0.05, 0.05);
      return m;
    });
    for (let pose = 0; pose < this.nPose; pose++) {
      for (let look = 0; look < MODEL_LOOK_COUNT; look++) {
        // Block geometry is team-independent (the material carries the colour);
        // detailed geometry bakes the faction accent into its vertex colours, so
        // it differs per team and is rebuilt for each.
        const blockGeom = this.blockMode ? classGeometry(look, pose / (POSE_STEPS_BLOCK - 1)) : null;
        for (let t = 0; t < 2; t++) {
          const bucket = pose * POSE_BUCKET + look * 2 + t;
          const mesh = new Mesh(`soldier_${pose}_${look}_${t}`, this.scene);
          if (this.blockMode) {
            blockGeom!.applyToMesh(mesh);
            mesh.material = teamMat[t];
          } else {
            classGeometryDetailed(look, POSES[pose], FACTION_ACCENT[t]).applyToMesh(mesh);
            mesh.material = detailMat;
          }
          mesh.alwaysSelectAsActiveMesh = true;
          mesh.isVisible = false;
          this.classMesh[bucket] = mesh;
          this.classMats[bucket] = new Float32Array(0);
          this.classN[bucket] = 0;
        }
      }
    }

    // Scatter props for the micro-pockets. Rock & bush carry one flat colour
    // (the material's diffuse); the tree is vertex-coloured (brown stem, green
    // canopy). All three lit by the same sun/sky as the soldiers.
    const scatterGeom = [rockGeom(), grassGeom(), treeGeom(), boulderGeom()];
    const scatterCol: [number, number, number][] = [
      [0.5, 0.48, 0.44], // small rock grey
      [1, 1, 1], // grass clump: vertex colours carry the greens
      [1, 1, 1], // tree: vertex colours carry the real hue
      [0.46, 0.44, 0.41], // boulder grey-brown
    ];
    for (let s = 0; s < scatterGeom.length; s++) {
      const mesh = new Mesh(`scatter_${s}`, this.scene);
      scatterGeom[s].applyToMesh(mesh);
      const mat = new StandardMaterial(`scatter_${s}`, this.scene);
      mat.diffuseColor = new Color3(...scatterCol[s]);
      mat.specularColor = new Color3(0.04, 0.04, 0.04);
      mesh.material = mat; // tree's vertex colours apply automatically (mesh.useVertexColors)
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.isVisible = false;
      this.scatterMesh[s] = mesh;
    }

    // 2D sprite billboard (unit quad in xy, atlas-textured).
    const atlas = buildAtlas();
    this.soldierRowOf = atlas.soldierRow;
    const aimg = atlas.canvas.getContext('2d')!.getImageData(0, 0, atlas.canvas.width, atlas.canvas.height);
    const atlasTex = new RawTexture(
      new Uint8Array(aimg.data.buffer), atlas.canvas.width, atlas.canvas.height,
      Constants.TEXTUREFORMAT_RGBA, this.scene, true, true, Texture.TRILINEAR_SAMPLINGMODE,
    );
    atlasTex.hasAlpha = true;
    this.sprite = new Mesh('sprites', this.scene);
    const qv = new VertexData();
    qv.positions = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0];
    qv.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    qv.indices = [0, 1, 2, 0, 2, 3];
    qv.applyToMesh(this.sprite);
    const spriteMat = new ShaderMaterial('sprites', this.scene, 'battleSprite', {
      attributes: ['position', 'uv', 'world0', 'world1', 'world2', 'world3', 'cell'],
      uniforms: ['viewProjection', 'uSheet'],
      samplers: ['uAtlas'],
    });
    spriteMat.setTexture('uAtlas', atlasTex);
    spriteMat.setVector2('uSheet', new Vector2(COLS, ROWS));
    spriteMat.backFaceCulling = false;
    this.sprite.material = spriteMat;
    this.sprite.alwaysSelectAsActiveMesh = true;
    this.sprite.isVisible = false;
    this.sprite.position.z = 0.12;

    // Overlay meshes: rebuilt per frame from world-space vertex-coloured
    // verts. Triangles for the attack-arc wedges, a line list for paths,
    // selection rings and ghost outlines.
    const overlayMat = (lineList: boolean) => {
      const m = new ShaderMaterial('overlay', this.scene, 'battleOverlay', {
        attributes: ['position', 'color'],
        uniforms: ['viewProjection'],
      });
      m.backFaceCulling = false;
      m.alpha = 0.999; // mark transparent so the vertex alpha blends
      m.disableDepthWrite = true;
      if (lineList) m.fillMode = Constants.MATERIAL_LineListDrawMode;
      return m;
    };
    this.triMesh = new Mesh('wedges', this.scene);
    this.triMesh.material = overlayMat(false);
    this.triMesh.alwaysSelectAsActiveMesh = true;
    this.triMesh.isVisible = false;
    this.overlayMesh = new Mesh('overlay', this.scene);
    this.overlayMesh.material = overlayMat(true);
    this.overlayMesh.alwaysSelectAsActiveMesh = true;
    this.overlayMesh.isVisible = false;

    this.banners = new UnitBannerLayer(this.scene);
  }

  /** Place + draw the per-unit standards as world-space billboards. Called by
   *  the scene each frame with one slot per unit (null = hidden/dead). */
  updateBanners(slots: (BannerSlot | null)[], zoom: number) {
    this.banners.update(slots, zoom, (x, y) => this.gz(x, y));
  }

  /** Rebuild a dynamic overlay mesh from packed [x,y, r,g,b(,a)] verts. */
  private fillOverlay(mesh: Mesh, verts: Float32Array, stride: number, z: number) {
    const n = (verts.length / stride) | 0;
    if (n === 0) { mesh.isVisible = false; return; }
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 4);
    const idx = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const o = i * stride;
      pos[i * 3] = verts[o]; pos[i * 3 + 1] = verts[o + 1];
      pos[i * 3 + 2] = this.gz(verts[o], verts[o + 1]) + z; // ride the hillside
      col[i * 4] = verts[o + 2]; col[i * 4 + 1] = verts[o + 3]; col[i * 4 + 2] = verts[o + 4];
      col[i * 4 + 3] = stride > 5 ? verts[o + 5] : 0.9;
      idx[i] = i;
    }
    const vd = new VertexData();
    vd.positions = pos; vd.colors = col; vd.indices = idx;
    vd.applyToMesh(mesh, true);
    mesh.isVisible = true;
  }

  private soldierRowOf: (cls: number, team: number) => number = () => 0;

  resize() {
    this.engine.resize();
  }

  setStatic(
    soldierUnit: Uint32Array,
    teams: number[],
    classes: number[],
    renderLooks: number[],
    radii: Float32Array,
  ) {
    const n = soldierUnit.length;
    this.teamOf = new Uint8Array(n);
    this.lookOf = new Uint8Array(n);
    this.scaleOf = new Float32Array(n);
    this.rowOf = new Float32Array(n);
    this.sizeOf = new Float32Array(n);
    this.restFrac = new Float32Array(n);
    this.deathFrac = new Float32Array(n);
    this.sidearmOf = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const u = soldierUnit[i];
      const cls = classes[u];
      const look = renderLooks[u] ?? modelLookForClass(cls);
      const team = teams[u];
      this.teamOf[i] = team === 1 ? 1 : 0;
      this.lookOf[i] = Math.min(look, MODEL_LOOK_COUNT - 1);
      this.scaleOf[i] = Math.max(0.6, radii[i] / 0.33);
      this.rowOf[i] = this.soldierRowOf(cls, team);
      const mounted = cls === 6 || cls === 7;
      this.sizeOf[i] = mounted ? 4.6 : Math.max(2.2, radii[i] * 6.8);
    }
  }

  /** Per-frame weapon-variant flags from the scene (1 = the soldier has drawn his
   *  sidearm). Only the shock lancer reads this — a grinding lancer routes to the
   *  sabre pseudo-class. The buffer is borrowed, not copied; the scene owns it. */
  setSidearm(flags: Uint8Array) {
    this.sidearmOf = flags;
  }

  setTerrain(
    w: number, h: number, cell: number, ox: number, oy: number,
    speed: Float32Array, rough: Float32Array, tint: Uint8Array,
  ) {
    // Copy: `tint` is a view over wasm memory, which detaches the moment the
    // sim grows its heap — by the time updateScatter samples it, the view
    // would be empty. The scatter needs a stable snapshot.
    this.tintGrid = new Uint8Array(tint);
    this.terrW = w; this.terrH = h; this.terrCell = cell; this.terrOx = ox; this.terrOy = oy;
    this.scatterKey = ''; // a new terrain invalidates the cached scatter
    const M = WILDS_MARGIN;
    const x0 = ox - M, y0 = oy - M, x1 = ox + w * cell + M, y1 = oy + h * cell + M;
    // Subdivided ground grid, each vertex raised to the heightfield so the field
    // rolls into hills; per-vertex normals (from the height gradient) let the
    // ground shader shade the slopes. ~8 m cells read smooth without a huge mesh.
    const STEP = 8;
    const nx = Math.max(2, Math.ceil((x1 - x0) / STEP) + 1);
    const ny = Math.max(2, Math.ceil((y1 - y0) / STEP) + 1);
    const positions = new Float32Array(nx * ny * 3);
    const normals = new Float32Array(nx * ny * 3);
    const H = (hx: number, hy: number) => this.gz(hx, hy) + this.tintHeight(hx, hy);
    for (let j = 0; j < ny; j++) {
      const wy = y0 + (j / (ny - 1)) * (y1 - y0);
      for (let i = 0; i < nx; i++) {
        const wx = x0 + (i / (nx - 1)) * (x1 - x0);
        const o = (j * nx + i) * 3;
        positions[o] = wx; positions[o + 1] = wy; positions[o + 2] = H(wx, wy);
        // Normal from the height gradient (central differences, e=4 m).
        const e = 4;
        const dzdx = (H(wx + e, wy) - H(wx - e, wy)) / (2 * e);
        const dzdy = (H(wx, wy + e) - H(wx, wy - e)) / (2 * e);
        const nlen = Math.hypot(dzdx, dzdy, 1);
        normals[o] = -dzdx / nlen; normals[o + 1] = -dzdy / nlen; normals[o + 2] = 1 / nlen;
      }
    }
    const indices = new Uint32Array((nx - 1) * (ny - 1) * 6);
    let k = 0;
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        indices[k++] = a; indices[k++] = b; indices[k++] = d;
        indices[k++] = a; indices[k++] = d; indices[k++] = c;
      }
    }
    const vd = new VertexData();
    vd.positions = positions; vd.indices = indices; vd.normals = normals;
    vd.applyToMesh(this.ground);

    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = Math.round(speed[i] * 255);
      data[i * 4 + 1] = Math.round(rough[i] * 255);
      data[i * 4 + 2] = Math.round((tint[i] / 8) * 255);
      data[i * 4 + 3] = 255;
    }
    this.terrTex?.dispose();
    this.terrTex = new RawTexture(
      data, w, h, Constants.TEXTUREFORMAT_RGBA, this.scene, false, false, Texture.NEAREST_SAMPLINGMODE,
    );
    this.groundMat.setTexture('uTerrain', this.terrTex);
    this.groundMat.setVector4('uMapRect', new Vector4(ox, oy, w * cell, h * cell));
    this.groundMat.setFloat('uElevated', this.elevation ? 1 : 0);
  }

  private ensureCapacity(count: number) {
    if (count <= this.cap) return;
    this.cap = Math.max(count, Math.ceil(this.cap * 1.5), 1024);
    this.spriteMats = new Float32Array(this.cap * 16);
    this.spriteCells = new Float32Array(this.cap * 2);
  }

  draw(
    positions: Float32Array,
    facings: Float32Array,
    frames: Float32Array,
    alive: Float32Array,
    count: number,
    camera: Camera,
    _selectedPrimary: number,
    _banners: { x: number; y: number; team: number; unit: number }[],
    _bannerSize = 11,
  ) {
    this.ensureCapacity(count);
    // LOD: flatten + sprites when zoomed out, tilt + 3D meshes when in.
    const zoom = camera.zoom;
    // Auto pitch from zoom (top-down when far, tilted when near) PLUS the user's
    // tilt bias (middle-drag vertical), clamped from straight-down to a low
    // Total War angle that shows the soldiers side-on.
    const auto = MAX_PITCH * smoothstep(ZOOM_FLAT, ZOOM_3D, zoom);
    this.pitch = this.pitchOverride ?? Math.min(MAX_PITCH_USER, Math.max(0, auto + camera.pitchBias));
    camera.pitch = this.pitch; // keep picking/overlays in sync
    this.syncCamera(camera);
    const use3D = zoom >= ZOOM_SWAP;
    const time = this.fixedTime ?? (performance.now() - this.start) / 1000;

    if (use3D) {
      this.sprite.isVisible = false;
      this.drawMeshes(positions, facings, frames, alive, count);
      if (this.enableScatter) this.updateScatter(camera);
      else for (const m of this.scatterMesh) m.isVisible = false;
    } else {
      for (const m of this.classMesh) m.isVisible = false;
      for (const m of this.scatterMesh) m.isVisible = false;
      this.scatterKey = ''; // force a rebuild when we tilt back in
      this.drawSprites(positions, facings, frames, alive, count);
    }
    this.groundMat.setFloat('uTime', time);
    // Fade the flat speckle out as the 3D props fade in, so the pockets aren't
    // painted twice.
    this.groundMat.setFloat('uFlatRock', 1 - smoothstep(ZOOM_SWAP - 1, ZOOM_SWAP + 3, zoom));
    this.triMesh.isVisible = false; // repopulated by drawTris, if any
  }

  private drawMeshes(
    positions: Float32Array, facings: Float32Array, frames: Float32Array, alive: Float32Array, count: number,
  ) {
    for (let k = 0; k < this.classN.length; k++) this.classN[k] = 0;
    // Ease two per-soldier blends toward their targets by a wall-clock step:
    // the at-ease blend (pike raise/lower over REST_FULL_SECS) and the
    // death-collapse blend (a fallen man crumples and tips over ~DEATH_SECS).
    // Frozen frames hold the clock, so neither drifts and snapshots stay stable.
    const nowT = this.fixedTime ?? (performance.now() - this.start) / 1000;
    const dt = Math.min(0.1, Math.max(0, nowT - this.lastPoseT));
    this.lastPoseT = nowT;
    const restStep = dt / REST_FULL_SECS;
    const deathStep = dt / DEATH_SECS;
    const rf = this.restFrac, df = this.deathFrac;
    for (let i = 0; i < count; i++) {
      const dead = alive[i] < 0.5;
      df[i] = dead ? Math.min(1, df[i] + deathStep) : 0;
      if (frames[i] === FRAME_STOW) { rf[i] = 1; continue; } // pike snaps upright, no sweep
      const target = frames[i] === FRAME_REST ? 1 : 0;
      const d = target - rf[i];
      rf[i] += d > restStep ? restStep : d < -restStep ? -restStep : d;
    }
    for (let i = 0; i < count; i++) {
      // A shock lancer grinding with its sabre renders as the sidearm pseudo-class
      // (same horse+rider, sword in hand) — the visual twin of the pike-stow swap.
      const look = this.sidearmOf[i] ? SHOCK_CAV_SIDEARM_LOOK : this.lookOf[i];
      const bucket = this.poseOf(i, frames[i]) * POSE_BUCKET + look * 2 + this.teamOf[i];
      let buf = this.classMats[bucket];
      const n = this.classN[bucket];
      if ((n + 1) * 16 > buf.length) {
        const grown = new Float32Array(Math.max((n + 1) * 16, buf.length * 2, 256 * 16));
        grown.set(buf);
        this.classMats[bucket] = grown;
        buf = grown;
      }
      this.classN[bucket] = n + 1;
      const o = n * 16;
      const x = positions[2 * i], y = positions[2 * i + 1], s = this.scaleOf[i] || 1;
      const gz = this.gz(x, y); // stand the man on the hillside
      const f = facings[i];
      const a = f - Math.PI / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      if (alive[i] < 0.5) {
        // Fallen: the crumple pose folds the man; the matrix topples him onto
        // the ground along his facing. Keep local +y (weapon-forward) horizontal
        // while flattening local +z, otherwise pikes rotate upright halfway
        // through the fall and read like planted poles.
        const k = this.blockMode ? 1 : smoothstep(0, 1, df[i]);
        buf[o] = ca * s; buf[o + 1] = sa * s; buf[o + 2] = 0; buf[o + 3] = 0;
        buf[o + 4] = -sa * s; buf[o + 5] = ca * s; buf[o + 6] = 0; buf[o + 7] = 0;
        buf[o + 8] = -sa * 0.32 * k * s; buf[o + 9] = ca * 0.32 * k * s;
        buf[o + 10] = ((1 - k) + 0.18 * k) * s; buf[o + 11] = 0;
        buf[o + 12] = x; buf[o + 13] = y; buf[o + 14] = gz + 0.03; buf[o + 15] = 1;
      } else {
        // A little bob/lurch on top of the limb poses: marching rises, a strike
        // lunges the body forward. The detailed poses carry the limb motion;
        // this keeps the block model (no limbs) lively too.
        const fr = frames[i];
        const bob = fr === 1 || fr === 8 ? 0.06 : fr === 3 ? 0.04 : 0;
        const lurch = fr === 3 ? 0.16 : 0;
        buf[o] = ca * s; buf[o + 1] = sa * s; buf[o + 2] = 0; buf[o + 3] = 0;
        buf[o + 4] = -sa * s; buf[o + 5] = ca * s; buf[o + 6] = 0; buf[o + 7] = 0;
        buf[o + 8] = 0; buf[o + 9] = 0; buf[o + 10] = s; buf[o + 11] = 0;
        buf[o + 12] = x + lurch * Math.cos(f); buf[o + 13] = y + lurch * Math.sin(f);
        buf[o + 14] = gz + bob; buf[o + 15] = 1;
      }
    }
    for (let k = 0; k < this.classMesh.length; k++) {
      const mesh = this.classMesh[k];
      const n = this.classN[k];
      mesh.isVisible = n > 0;
      if (n > 0) mesh.thinInstanceSetBuffer('matrix', this.classMats[k].subarray(0, n * 16), 16, false);
      mesh.thinInstanceCount = n;
    }
  }

  /** Route a soldier to a pose-ladder rung. Block mode keeps the 6-rung rest
   *  ladder (only the pike posture differs); detailed mode maps the sim frame
   *  to the matching limb pose, and a fallen man to a hit→crumple sequence. */
  private poseOf(i: number, frame: number): number {
    if (this.blockMode) {
      const stow = frame === FRAME_STOW;
      return Math.round((stow ? 1 : this.restFrac[i]) * (POSE_STEPS_BLOCK - 1));
    }
    if (this.deathFrac[i] > 0) return this.deathFrac[i] < 0.4 ? P_HIT : P_CRUMPLE;
    switch (frame) {
      case 1: return P_MARCH_A;      // march beat A
      case 2: return P_MARCH_A + 1;  // march beat B
      case 8: return P_RUN_A;        // run beat A
      case 9: return P_RUN_A + 1;    // run beat B
      case 3: return P_ATTACK;       // strike
      case 11: return P_ATTACK_WIND; // review-harness windup
      case 10: return P_HIT;         // flinch
      case 5: return P_IDLE;         // weapon fumble
      case 6: return Math.round(this.restFrac[i] * P_EASE_TOP); // at-ease ladder
      case 7: return P_EASE_TOP;     // stowed pike: upright
      default: return P_IDLE;        // 0 alert guard
    }
  }

  private drawSprites(
    positions: Float32Array, facings: Float32Array, frames: Float32Array, alive: Float32Array, count: number,
  ) {
    const m = this.spriteMats, cells = this.spriteCells;
    for (let i = 0; i < count; i++) {
      const x = positions[2 * i], y = positions[2 * i + 1], s = this.sizeOf[i] || 2.2;
      // Sprites face +x at facing 0 (atlas authored that way).
      const f = facings[i];
      const ca = Math.cos(f), sa = Math.sin(f);
      const o = i * 16;
      // Corpses sit just under the living so the line reads on top.
      m[o] = ca * s; m[o + 1] = sa * s; m[o + 2] = 0; m[o + 3] = 0;
      m[o + 4] = -sa * s; m[o + 5] = ca * s; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = s; m[o + 11] = 0;
      m[o + 12] = x; m[o + 13] = y; m[o + 14] = this.gz(x, y) + (alive[i] < 0.5 ? -0.05 : 0); m[o + 15] = 1;
      // The atlas has no at-ease/run/flinch frames (you can't read a raised pike
      // or a stride from afar); fold them onto the cells it does have: rest/stow
      // → stand, run → march, flinch → fighting.
      const fr = frames[i];
      cells[2 * i] = fr === FRAME_REST || fr === FRAME_STOW ? 0
        : fr === 8 || fr === 9 ? 1 + (fr & 1)
          : fr === 10 ? 3 : fr;
      cells[2 * i + 1] = this.rowOf[i];
    }
    this.sprite.isVisible = count > 0;
    if (count > 0) {
      this.sprite.thinInstanceSetBuffer('matrix', m.subarray(0, count * 16), 16, false);
      this.sprite.thinInstanceSetBuffer('cell', cells.subarray(0, count * 2), 2, false);
    }
    this.sprite.thinInstanceCount = count;
  }

  // Scatter cache: only rebuild the prop instances when the view actually
  // moves, otherwise re-iterating thousands of cells every frame is waste.
  private scatterKey = '';

  /** Stand rocks/bushes/short trees on the visible micro-pockets — the same
   *  3m discs the sim trips on and the ground shader speckles. Type is chosen
   *  from the tint beneath each pocket (forest→tree, crag/scree→rock,
   *  mud→bush, meadow→a mix), so the scatter reads as the terrain it sits on. */
  private updateScatter(c: Camera) {
    const W = this.canvas.width, H = this.canvas.height;
    // Visible world AABB: map the four screen corners through the tilt and
    // bound them. Quantise the key so tiny pans don't force a rebuild.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of [[0, 0], [W, 0], [0, H], [W, H]] as const) {
      const [wx, wy] = c.screenToWorld(px, py);
      minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
      minY = Math.min(minY, wy); maxY = Math.max(maxY, wy);
    }
    const key = `${Math.round(minX / 6)},${Math.round(minY / 6)},${Math.round(maxX / 6)},${Math.round(maxY / 6)}`;
    if (key === this.scatterKey) return;
    this.scatterKey = key;

    const CAP = 4000;
    const counts = [0, 0, 0, 0];
    const mats = this.scatterMats;
    for (let s = 0; s < 4; s++) if (mats[s].length < CAP * 16) mats[s] = new Float32Array(CAP * 16);

    const cx0 = Math.floor(minX / 3) - 1, cx1 = Math.ceil(maxX / 3) + 1;
    const cy0 = Math.floor(minY / 3) - 1, cy1 = Math.ceil(maxY / 3) + 1;
    let placed = 0;
    for (let cy = cy0; cy <= cy1 && placed < CAP; cy++) {
      for (let cx = cx0; cx <= cx1 && placed < CAP; cx++) {
        const h = microHashJS(cx, cy);
        if ((h & 255) >= 89) continue; // no disc here (matches the shader)
        const r = 0.4 + 0.35 * ((h >> 8) & 255) / 255;
        const jx = ((h >> 16) & 255) / 255 * (3 - 2 * r) + r;
        const jy = ((h >> 24) & 255) / 255 * (3 - 2 * r) + r;
        const wx = cx * 3 + jx, wy = cy * 3 + jy;

        // Ground type under the pocket.
        const gx = Math.floor((wx - this.terrOx) / this.terrCell);
        const gy = Math.floor((wy - this.terrOy) / this.terrCell);
        const inMap = gx >= 0 && gx < this.terrW && gy >= 0 && gy < this.terrH;
        const tint = inMap ? this.tintGrid[gy * this.terrW + gx] : 99;
        if (tint === 1) continue; // no props on water (matches the shader)

        // Choose rock / grass / tree / boulder from the tint, with a
        // deterministic per-disc roll so each ground type gets a believable mix.
        // Types: 0 small rock, 1 grass/scrub clump, 2 short tree, 3 big boulder.
        const roll = (h >> 5) & 15;
        let type: number;
        if (tint === 2 || tint === 3) type = roll < 11 ? 3 : 0; // impassable crag/wall: boulders (a few small stones)
        else if (tint === 6) type = roll < 6 ? 3 : roll < 12 ? 0 : 1; // scree field: boulders + stones + scrub
        else if (tint === 4 || tint === 99) type = roll < 10 ? 2 : 1; // forest/wilds: mostly trees, some scrub
        else if (tint === 5) type = roll < 12 ? 1 : 2; // mud: reedy scrub, the odd sapling
        else type = roll < 9 ? 1 : roll < 13 ? 2 : 0; // meadow: mostly grass tufts, some trees, a rare stone

        const n = counts[type];
        const m = mats[type];
        const o = n * 16;
        // Scale to the pocket radius. Boulders are big (the crag); small stones
        // stay knee-high; grass/trees a touch taller than wide.
        const sx = type === 3 ? 1.1 + r * 1.5 : type === 0 ? r * 0.8 : r * 1.25;
        const sz = type === 3 ? 1.0 + r * 1.6 : type === 0 ? r * 0.7 : type === 2 ? r * 1.5 : r * 1.2;
        const yaw = ((h >> 3) & 255) / 255 * Math.PI * 2;
        const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
        m[o] = cyaw * sx; m[o + 1] = syaw * sx; m[o + 2] = 0; m[o + 3] = 0;
        m[o + 4] = -syaw * sx; m[o + 5] = cyaw * sx; m[o + 6] = 0; m[o + 7] = 0;
        m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = sz; m[o + 11] = 0;
        m[o + 12] = wx; m[o + 13] = wy; m[o + 14] = this.gz(wx, wy) + this.tintHeight(wx, wy); m[o + 15] = 1;
        counts[type] = n + 1;
        placed++;
      }
    }
    for (let s = 0; s < 4; s++) {
      const mesh = this.scatterMesh[s];
      const n = counts[s];
      mesh.isVisible = n > 0;
      if (n > 0) mesh.thinInstanceSetBuffer('matrix', mats[s].subarray(0, n * 16), 16, false);
      mesh.thinInstanceCount = n;
    }
  }

  /** Match the Babylon ortho camera to the 2D Camera (center, zoom, tilt). */
  private syncCamera(c: Camera) {
    const W = this.canvas.width, H = this.canvas.height, z = c.zoom;
    this.camera.orthoLeft = -W / (2 * z);
    this.camera.orthoRight = W / (2 * z);
    this.camera.orthoTop = H / (2 * z);
    this.camera.orthoBottom = -H / (2 * z);
    const p = this.pitch, yaw = c.yaw;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const dist = 2000;
    // Orbit the camera about the target by yaw and tilt it by pitch, matching the
    // affine ground map in camera.ts exactly (screen-right = (cos yaw, sin yaw),
    // screen-up ground projection = (-sin yaw, cos yaw)) so picking stays exact.
    this.camera.position.set(
      c.x + dist * Math.sin(p) * sy,
      c.y - dist * Math.sin(p) * cy,
      dist * Math.cos(p),
    );
    this.camera.setTarget(new Vector3(c.x, c.y, 0));
    this.camera.upVector.set(-Math.cos(p) * sy, Math.cos(p) * cy, Math.sin(p));
  }

  // Attack-arc wedges: [x,y, r,g,b,a] triangles.
  drawTris(verts: Float32Array, _camera: Camera) {
    this.fillOverlay(this.triMesh, verts, 6, 0.18);
  }

  // Paths, selection rings, ghost outlines: [x,y, r,g,b] line pairs. This is
  // the last renderer call each frame, so it commits the scene.
  drawOverlay(verts: Float32Array, _camera: Camera) {
    this.fillOverlay(this.overlayMesh, verts, 5, 0.16);
    this.scene.render();
  }
}
