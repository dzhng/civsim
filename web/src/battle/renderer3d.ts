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

import type { Camera } from '../shared/camera';
import { WILDS_MARGIN } from './renderer';
import { buildAtlas, COLS, ROWS } from './atlas';

const TEAM_COLOR: [number, number, number][] = [
  [0.22, 0.41, 0.78], // player blue
  [0.78, 0.25, 0.23], // enemy red
];
// Below ZOOM_FLAT: pure top-down 2D sprites. Above ZOOM_3D: full tilt + 3D
// meshes. Between, the camera tilts and the renderer switches at ZOOM_SWAP.
const ZOOM_FLAT = 6;
const ZOOM_3D = 18;
const ZOOM_SWAP = 12;
const MAX_PITCH = 0.42;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// --- Ground shader (ported from the 2D battle ground) ---------------------
ShaderStore.ShadersStore['battleGroundVertexShader'] = `
precision highp float;
attribute vec3 position;
uniform mat4 viewProjection;
uniform vec4 uMapRect;
varying vec2 vUV;
varying vec2 vWorld;
void main() {
  gl_Position = viewProjection * vec4(position, 1.0);
  vWorld = position.xy;
  vUV = (position.xy - uMapRect.xy) / uMapRect.zw;
}`;
ShaderStore.ShadersStore['battleGroundFragmentShader'] = `
precision highp float;
varying vec2 vUV;
varying vec2 vWorld;
uniform sampler2D uTerrain;
uniform float uTime;
uniform float uFlatRock; // 1 = paint flat micro-rocks (far view), 0 = the 3D props carry them (near)
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
  if (c.a < 0.3) discard;
  gl_FragColor = c;


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


// Per-class look (local +y = forward, +z = up). A weapon length, a shield,
// and whether the trooper is mounted are enough to read every class apart
// in silhouette — the same distinctions the atlas sprites draw.
interface ClassLook {
  weapon: 'sword' | 'spear' | 'greatsword' | 'pike' | 'bow' | 'javelin' | 'lance' | 'none';
  shield: 'tall' | 'round' | 'small' | 'none';
  crest: boolean;
  mounted: boolean;
}
const CLASS_LOOK: ClassLook[] = [
  { weapon: 'sword', shield: 'tall', crest: true, mounted: false }, // 0 heavy
  { weapon: 'spear', shield: 'round', crest: false, mounted: false }, // 1 light
  { weapon: 'greatsword', shield: 'none', crest: false, mounted: false }, // 2 longswords
  { weapon: 'pike', shield: 'small', crest: true, mounted: false }, // 3 phalanx
  { weapon: 'bow', shield: 'none', crest: false, mounted: false }, // 4 archers
  { weapon: 'javelin', shield: 'small', crest: false, mounted: false }, // 5 skirmishers
  { weapon: 'lance', shield: 'round', crest: true, mounted: true }, // 6 shock cav
  { weapon: 'bow', shield: 'none', crest: false, mounted: true }, // 7 horse archers
  { weapon: 'none', shield: 'none', crest: false, mounted: false }, // 8 artillery crew
];

/** Low-poly per-class soldier (or rider on a horse). Built once per class,
 *  thin-instanced. */
function classGeometry(cls: number): VertexData {
  const L = CLASS_LOOK[cls] ?? CLASS_LOOK[0];
  const pos: number[] = [];
  const idx: number[] = [];
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    const b = pos.length / 3;
    const c = [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
    ];
    for (const v of c) pos.push(v[0], v[1], v[2]);
    for (const [a, bb, cc, d] of [
      [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [3, 2, 6, 7], [1, 5, 6, 2], [0, 3, 7, 4],
    ]) idx.push(b + a, b + bb, b + cc, b + a, b + cc, b + d);
  };

  // Rider sits higher when mounted; the horse goes under him.
  const foot = L.mounted ? 0.95 : 0.0;
  if (L.mounted) {
    box(-0.16, -0.7, 0.0, 0.16, 0.55, 0.92); // horse barrel
    box(-0.13, 0.5, 0.55, 0.13, 0.95, 0.78); // neck
    box(-0.11, 0.9, 0.66, 0.11, 1.18, 0.9); // head
    box(-0.16, -0.62, 0.0, -0.08, -0.5, 0.6); // a back leg hint
    box(0.08, 0.42, 0.0, 0.16, 0.54, 0.6); // a front leg hint
  }
  box(-0.16, -0.1, foot, 0.16, 0.1, foot + 1.0); // torso + legs
  box(-0.1, -0.09, foot + 1.0, 0.1, 0.11, foot + 1.34); // head
  if (L.crest) box(-0.03, -0.05, foot + 1.34, 0.03, 0.14, foot + 1.5); // helmet crest

  // Shield on the left arm (-x), facing forward.
  if (L.shield !== 'none') {
    const sh = { tall: [0.5, 0.78], round: [0.42, 0.55], small: [0.32, 0.4] }[L.shield];
    box(-0.27, 0.02, foot + 0.35, -0.19, 0.06 + sh[0] * 0.0 + 0.0, foot + 0.35 + sh[1]);
  }

  // Weapon on the right (+x), reaching forward (+y) for poles, upright for blades/bows.
  const wx = 0.2;
  switch (L.weapon) {
    case 'pike': box(wx - 0.02, -0.2, foot + 0.7, wx + 0.02, 3.0, foot + 0.78); break;
    case 'lance': box(wx - 0.02, -0.1, foot + 0.55, wx + 0.02, 2.0, foot + 0.62); break;
    case 'spear': box(wx - 0.02, -0.2, foot + 0.6, wx + 0.02, 1.4, foot + 0.66); break;
    case 'javelin': box(wx - 0.02, -0.1, foot + 0.7, wx + 0.02, 0.9, foot + 0.74); break;
    case 'sword': box(wx - 0.02, 0.0, foot + 0.5, wx + 0.03, 0.06, foot + 1.2); break;
    case 'greatsword': box(wx - 0.03, 0.0, foot + 0.4, wx + 0.04, 0.08, foot + 1.7); break;
    case 'bow': box(wx + 0.04, -0.02, foot + 0.4, wx + 0.1, 0.02, foot + 1.4); break;
    case 'none': break;
  }

  const vd = new VertexData();
  vd.positions = pos;
  vd.indices = idx;
  const normals: number[] = [];
  VertexData.ComputeNormals(pos, idx, normals);
  vd.normals = normals;
  return vd;
}

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
function rockGeom(): VertexData {
  const p: number[] = [], i: number[] = [];
  pushBox(p, i, null, -0.5, -0.4, 0, 0.4, 0.5, 0.42);
  pushBox(p, i, null, -0.3, -0.2, 0.38, 0.25, 0.28, 0.6);
  return finishGeom(p, i, null);
}
function bushGeom(): VertexData {
  const p: number[] = [], i: number[] = [];
  pushBox(p, i, null, -0.45, -0.4, 0, 0.4, 0.45, 0.5);
  pushBox(p, i, null, -0.25, -0.2, 0.4, 0.3, 0.3, 0.72);
  pushBox(p, i, null, 0.1, -0.35, 0.2, 0.5, 0.1, 0.6);
  return finishGeom(p, i, null);
}
function treeGeom(): VertexData {
  const p: number[] = [], i: number[] = [], c: number[] = [];
  pushBox(p, i, c, -0.08, -0.08, 0, 0.08, 0.08, 0.7, [0.32, 0.22, 0.13]); // stem
  pushBox(p, i, c, -0.4, -0.4, 0.55, 0.4, 0.4, 1.4, [0.20, 0.34, 0.15]); // canopy
  pushBox(p, i, c, -0.25, -0.25, 1.3, 0.25, 0.25, 1.7, [0.24, 0.40, 0.18]); // crown
  return finishGeom(p, i, c);
}
// A unit banner: a wooden pole topped by a team-coloured cloth, tall enough
// to read above the press. The cloth lies in the x-z plane so its broad face
// points along ±y — square to the camera, which always looks north from the
// south. Vertex-coloured (pole brown, cloth the team hue).
function bannerGeom(col: [number, number, number]): VertexData {
  const p: number[] = [], i: number[] = [], c: number[] = [];
  const wood: [number, number, number] = [0.30, 0.22, 0.13];
  pushBox(p, i, c, -0.06, -0.06, 0, 0.06, 0.06, 5.6, wood); // pole, tall enough to clear the ranks
  pushBox(p, i, c, -0.11, -0.11, 5.5, 0.11, 0.11, 5.74, wood); // finial
  pushBox(p, i, c, 0.06, -0.04, 4.0, 2.05, 0.04, 5.5, col); // the cloth, floating above the press
  return finishGeom(p, i, c);
}
// The sim/ground-shader micro hash, in JS, so the scattered props land on
// the SAME 3m discs the sim trips on and the shader speckles.
function microHashJS(x: number, y: number): number {
  let h = (Math.imul(x >>> 0, 0x85ebca6b) ^ Math.imul(y >>> 0, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}

export class BattleRenderer3D {
  private engine: Engine;
  private scene: Scene;
  private camera: FreeCamera;
  // 3D path: one mesh per (class, team) so each carries its own model and
  // team colour; soldiers route to bucket cls*2+team. 2D path: one
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
  // Scatter props standing on the micro-pockets: 0 rock, 1 bush, 2 tree.
  // Thin-instanced from whatever 3m discs fall in the visible AABB.
  private scatterMesh: Mesh[] = [];
  private scatterMats: Float32Array[] = [new Float32Array(0), new Float32Array(0), new Float32Array(0)];
  // Unit banners standing at each unit's centroid: one mesh per team.
  private bannerMesh: Mesh[] = [];
  private bannerMats: Float32Array[] = [new Float32Array(0), new Float32Array(0)];
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
  private classOf: Uint8Array = new Uint8Array(0);
  private scaleOf = new Float32Array(0); // 3D mesh scale
  private rowOf = new Float32Array(0); // atlas row (class+team)
  private sizeOf = new Float32Array(0); // sprite world size
  /** Live view tilt (camera.ts mirrors it for picking). */
  pitch = 0;
  fixedTime: number | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, false);
    this.scene = new Scene(this.engine);
    this.scene.useRightHandedSystem = true; // x east, y north, z up
    this.scene.clearColor = new Color4(0.06, 0.07, 0.06, 1);
    this.scene.skipPointerMovePicking = true;

    this.camera = new FreeCamera('battle', new Vector3(0, 0, 1000), this.scene);
    this.camera.mode = BCamera.ORTHOGRAPHIC_CAMERA;
    this.camera.minZ = -5000;
    this.camera.maxZ = 5000;

    const sky = new HemisphericLight('sky', new Vector3(0, 0, 1), this.scene);
    sky.intensity = 0.78;
    sky.groundColor = new Color3(0.34, 0.36, 0.32);
    const sun = new DirectionalLight('sun', new Vector3(-0.4, 0.5, -0.78), this.scene);
    sun.intensity = 0.8;

    // Ground.
    this.ground = new Mesh('ground', this.scene);
    this.groundMat = new ShaderMaterial('ground', this.scene, 'battleGround', {
      attributes: ['position'],
      uniforms: ['viewProjection', 'uMapRect', 'uTime', 'uFlatRock'],
      samplers: ['uTerrain'],
    });
    this.groundMat.backFaceCulling = false;
    this.ground.material = this.groundMat;
    this.ground.freezeWorldMatrix();

    // 3D soldier meshes: one per (class, team). Geometry is shared per
    // class (built once), applied to a blue and a red mesh.
    for (let cls = 0; cls < CLASS_LOOK.length; cls++) {
      const geom = classGeometry(cls);
      for (let t = 0; t < 2; t++) {
        const mesh = new Mesh(`soldier_${cls}_${t}`, this.scene);
        geom.applyToMesh(mesh);
        const mat = new StandardMaterial(`soldier_${cls}_${t}`, this.scene);
        const c = TEAM_COLOR[t];
        mat.diffuseColor = new Color3(c[0], c[1], c[2]);
        mat.specularColor = new Color3(0.05, 0.05, 0.05);
        mesh.material = mat;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.isVisible = false;
        this.classMesh[cls * 2 + t] = mesh;
        this.classMats[cls * 2 + t] = new Float32Array(0);
        this.classN[cls * 2 + t] = 0;
      }
    }

    // Scatter props for the micro-pockets. Rock & bush carry one flat colour
    // (the material's diffuse); the tree is vertex-coloured (brown stem, green
    // canopy). All three lit by the same sun/sky as the soldiers.
    const scatterGeom = [rockGeom(), bushGeom(), treeGeom()];
    const scatterCol: [number, number, number][] = [
      [0.45, 0.43, 0.40], // rock grey
      [0.26, 0.40, 0.20], // bush green
      [1, 1, 1], // tree: vertex colours carry the real hue
    ];
    for (let s = 0; s < 3; s++) {
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

    // Unit banners: a pole + team cloth, one mesh per team. A touch of
    // emissive keeps the cloth legible even in the soldiers' shadow.
    for (let t = 0; t < 2; t++) {
      const c = TEAM_COLOR[t];
      const mesh = new Mesh(`banner_${t}`, this.scene);
      bannerGeom([c[0], c[1], c[2]]).applyToMesh(mesh);
      const mat = new StandardMaterial(`banner_${t}`, this.scene);
      mat.diffuseColor = new Color3(1, 1, 1); // colour rides on the vertex colours
      mat.specularColor = new Color3(0.03, 0.03, 0.03);
      // The cloth hangs vertical, so the camera-facing face is back-lit; a
      // team-tinted emissive makes the standard read its colour from any angle.
      mat.emissiveColor = new Color3(c[0] * 0.5, c[1] * 0.5, c[2] * 0.5);
      mat.backFaceCulling = false;
      mesh.material = mat;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.isVisible = false;
      this.bannerMesh[t] = mesh;
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
      pos[i * 3] = verts[o]; pos[i * 3 + 1] = verts[o + 1]; pos[i * 3 + 2] = z;
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

  setStatic(soldierUnit: Uint32Array, teams: number[], classes: number[], radii: Float32Array) {
    const n = soldierUnit.length;
    this.teamOf = new Uint8Array(n);
    this.classOf = new Uint8Array(n);
    this.scaleOf = new Float32Array(n);
    this.rowOf = new Float32Array(n);
    this.sizeOf = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = soldierUnit[i];
      const cls = classes[u];
      const team = teams[u];
      this.teamOf[i] = team === 1 ? 1 : 0;
      this.classOf[i] = Math.min(cls, CLASS_LOOK.length - 1);
      this.scaleOf[i] = Math.max(0.6, radii[i] / 0.33);
      this.rowOf[i] = this.soldierRowOf(cls, team);
      const mounted = cls === 6 || cls === 7;
      this.sizeOf[i] = mounted ? 4.6 : Math.max(2.2, radii[i] * 6.8);
    }
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
    const vd = new VertexData();
    vd.positions = [x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0];
    vd.indices = [0, 1, 2, 0, 2, 3];
    vd.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
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
    selectedPrimary: number,
    banners: { x: number; y: number; team: number; unit: number }[],
    _bannerSize = 11,
  ) {
    this.ensureCapacity(count);
    // LOD: flatten + sprites when zoomed out, tilt + 3D meshes when in.
    const zoom = camera.zoom;
    this.pitch = MAX_PITCH * smoothstep(ZOOM_FLAT, ZOOM_3D, zoom);
    camera.pitch = this.pitch; // keep picking/overlays in sync
    this.syncCamera(camera);
    const use3D = zoom >= ZOOM_SWAP;
    const time = this.fixedTime ?? (performance.now() - this.start) / 1000;

    if (use3D) {
      this.sprite.isVisible = false;
      this.drawMeshes(positions, facings, frames, alive, count);
      this.updateScatter(camera);
      // In-world banners only make sense once the view has tilted — straight
      // down they'd be invisible poles; the DOM labels carry the flat view.
      this.drawBanners(banners, selectedPrimary, time);
    } else {
      for (const m of this.classMesh) m.isVisible = false;
      for (const m of this.scatterMesh) m.isVisible = false;
      for (const m of this.bannerMesh) m.isVisible = false;
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
    for (let i = 0; i < count; i++) {
      const bucket = this.classOf[i] * 2 + this.teamOf[i];
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
      const f = facings[i];
      const a = f - Math.PI / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      if (alive[i] < 0.5) {
        // Fallen: tipped onto the ground along the facing.
        buf[o] = ca * s; buf[o + 1] = sa * s; buf[o + 2] = 0; buf[o + 3] = 0;
        buf[o + 4] = 0; buf[o + 5] = 0; buf[o + 6] = s; buf[o + 7] = 0;
        buf[o + 8] = sa * 0.25 * s; buf[o + 9] = -ca * 0.25 * s; buf[o + 10] = 0.25 * s; buf[o + 11] = 0;
        buf[o + 12] = x; buf[o + 13] = y; buf[o + 14] = 0.05; buf[o + 15] = 1;
      } else {
        // Animation from the sim's frame: a marching bob (walk beats 1/2)
        // and a forward thrust (attack beat 3, alternating with 0).
        const fr = frames[i];
        const bob = fr === 1 ? 0.06 : fr === 3 ? 0.04 : 0;
        const lurch = fr === 3 ? 0.16 : 0;
        buf[o] = ca * s; buf[o + 1] = sa * s; buf[o + 2] = 0; buf[o + 3] = 0;
        buf[o + 4] = -sa * s; buf[o + 5] = ca * s; buf[o + 6] = 0; buf[o + 7] = 0;
        buf[o + 8] = 0; buf[o + 9] = 0; buf[o + 10] = s; buf[o + 11] = 0;
        buf[o + 12] = x + lurch * Math.cos(f); buf[o + 13] = y + lurch * Math.sin(f);
        buf[o + 14] = bob; buf[o + 15] = 1;
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
      m[o + 12] = x; m[o + 13] = y; m[o + 14] = alive[i] < 0.5 ? -0.05 : 0; m[o + 15] = 1;
      cells[2 * i] = frames[i];
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
    const counts = [0, 0, 0];
    const mats = this.scatterMats;
    for (let s = 0; s < 3; s++) if (mats[s].length < CAP * 16) mats[s] = new Float32Array(CAP * 16);

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

        // Choose rock / bush / tree from the tint, with a deterministic
        // per-disc roll so each ground type gets a believable mix.
        const roll = (h >> 5) & 7;
        let type: number;
        if (tint === 4 || tint === 99) type = roll < 5 ? 2 : 1; // forest/wilds: mostly trees
        else if (tint === 2 || tint === 6 || tint === 3) type = roll < 6 ? 0 : 1; // crag/scree/wall: rock
        else if (tint === 5) type = roll < 6 ? 1 : 0; // mud: scrubby bushes
        else type = roll < 4 ? 0 : roll < 7 ? 1 : 2; // meadow: rock/bush, a rare tree

        const n = counts[type];
        const m = mats[type];
        const o = n * 16;
        // Scale to the pocket radius; bushes/trees a touch taller than wide.
        const sx = r * 1.6, sz = type === 2 ? r * 1.5 : type === 1 ? r * 1.3 : r * 1.4;
        const yaw = ((h >> 3) & 255) / 255 * Math.PI * 2;
        const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
        m[o] = cyaw * sx; m[o + 1] = syaw * sx; m[o + 2] = 0; m[o + 3] = 0;
        m[o + 4] = -syaw * sx; m[o + 5] = cyaw * sx; m[o + 6] = 0; m[o + 7] = 0;
        m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = sz; m[o + 11] = 0;
        m[o + 12] = wx; m[o + 13] = wy; m[o + 14] = 0; m[o + 15] = 1;
        counts[type] = n + 1;
        placed++;
      }
    }
    for (let s = 0; s < 3; s++) {
      const mesh = this.scatterMesh[s];
      const n = counts[s];
      mesh.isVisible = n > 0;
      if (n > 0) mesh.thinInstanceSetBuffer('matrix', mats[s].subarray(0, n * 16), 16, false);
      mesh.thinInstanceCount = n;
    }
  }

  /** Stand a team-coloured standard at each unit's centroid. The cloth flutters
   *  on a cheap per-unit sway; the selected unit's banner stands taller. */
  private drawBanners(
    banners: { x: number; y: number; team: number; unit: number }[],
    selectedPrimary: number, time: number,
  ) {
    const counts = [0, 0];
    for (let t = 0; t < 2; t++) {
      const need = banners.length * 16;
      if (this.bannerMats[t].length < need) this.bannerMats[t] = new Float32Array(Math.max(need, 64 * 16));
    }
    for (const b of banners) {
      const t = b.team === 1 ? 1 : 0;
      const m = this.bannerMats[t];
      const n = counts[t];
      const o = n * 16;
      const s = b.unit === selectedPrimary ? 1.3 : 1.0;
      const yaw = 0.14 * Math.sin(time * 1.6 + b.unit * 0.9); // breeze
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      m[o] = cy * s; m[o + 1] = sy * s; m[o + 2] = 0; m[o + 3] = 0;
      m[o + 4] = -sy * s; m[o + 5] = cy * s; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = s; m[o + 11] = 0;
      m[o + 12] = b.x; m[o + 13] = b.y; m[o + 14] = 0; m[o + 15] = 1;
      counts[t] = n + 1;
    }
    for (let t = 0; t < 2; t++) {
      const mesh = this.bannerMesh[t];
      const n = counts[t];
      mesh.isVisible = n > 0;
      if (n > 0) mesh.thinInstanceSetBuffer('matrix', this.bannerMats[t].subarray(0, n * 16), 16, false);
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
    const p = this.pitch;
    const dist = 2000;
    this.camera.position.set(c.x, c.y - dist * Math.sin(p), dist * Math.cos(p));
    this.camera.setTarget(new Vector3(c.x, c.y, 0));
    this.camera.upVector.set(0, Math.cos(p), Math.sin(p));
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
