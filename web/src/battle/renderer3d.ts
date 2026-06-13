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
    col = mix(vec3(0.42, 0.35, 0.24), vec3(0.52, 0.44, 0.30), n);
    col += 0.05 * smoothstep(0.6, 0.9, noise(vWorld * 0.33));
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
  if (rock > 0.0 && tint != 1.0 && !outside) {
    vec3 stone = mix(vec3(0.42, 0.40, 0.34), vec3(0.30, 0.28, 0.24), min(rock - 1.0, 1.0));
    col = mix(col, stone, 0.85);
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

/** A low-poly soldier: tapered body, head, and a front nub so facing reads. */
function soldierVertexData(): VertexData {
  const positions: number[] = [];
  const indices: number[] = [];
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    const b = positions.length / 3;
    const c = [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
    ];
    for (const v of c) positions.push(v[0], v[1], v[2]);
    const f = [
      [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [3, 2, 6, 7], [1, 5, 6, 2], [0, 3, 7, 4],
    ];
    for (const [a, bb, cc, d] of f) indices.push(b + a, b + bb, b + cc, b + a, b + cc, b + d);
  };
  box(-0.17, -0.11, 0.0, 0.17, 0.11, 1.12); // body
  box(-0.1, -0.1, 1.12, 0.1, 0.1, 1.5); // head
  box(-0.05, 0.08, 1.18, 0.05, 0.2, 1.34); // facing nub
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  vd.normals = normals;
  return vd;
}

export class BattleRenderer3D {
  private engine: Engine;
  private scene: Scene;
  private camera: FreeCamera;
  // 3D path: one mesh per team. 2D path: one atlas-textured sprite mesh.
  private teamMesh: Mesh[] = [];
  private teamMats: Float32Array[] = [new Float32Array(0), new Float32Array(0)];
  private sprite!: Mesh;
  private spriteMats = new Float32Array(0);
  private spriteCells = new Float32Array(0);
  private ground: Mesh;
  private groundMat!: ShaderMaterial;
  private terrTex: RawTexture | null = null;
  private start = performance.now();
  private cap = 0;
  // Per-soldier static data (indexed by soldier id).
  private teamOf: Uint8Array = new Uint8Array(0);
  private scaleOf = new Float32Array(0); // 3D mesh scale
  private rowOf = new Float32Array(0); // atlas row (class+team)
  private sizeOf = new Float32Array(0); // sprite world size
  private mapRect: [number, number, number, number] = [0, 0, 1, 1];
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
      uniforms: ['viewProjection', 'uMapRect', 'uTime'],
      samplers: ['uTerrain'],
    });
    this.groundMat.backFaceCulling = false;
    this.ground.material = this.groundMat;
    this.ground.freezeWorldMatrix();

    // 3D soldier meshes (one per team).
    const geom = soldierVertexData();
    for (let t = 0; t < 2; t++) {
      const mesh = new Mesh(`soldier${t}`, this.scene);
      geom.applyToMesh(mesh);
      const mat = new StandardMaterial(`soldier${t}`, this.scene);
      const c = TEAM_COLOR[t];
      mat.diffuseColor = new Color3(c[0], c[1], c[2]);
      mat.specularColor = new Color3(0.05, 0.05, 0.05);
      mesh.material = mat;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.isVisible = false;
      this.teamMesh.push(mesh);
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
  }

  private soldierRowOf: (cls: number, team: number) => number = () => 0;

  resize() {
    this.engine.resize();
  }

  setStatic(soldierUnit: Uint32Array, teams: number[], classes: number[], radii: Float32Array) {
    const n = soldierUnit.length;
    this.teamOf = new Uint8Array(n);
    this.scaleOf = new Float32Array(n);
    this.rowOf = new Float32Array(n);
    this.sizeOf = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = soldierUnit[i];
      const cls = classes[u];
      const team = teams[u];
      this.teamOf[i] = team === 1 ? 1 : 0;
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
    const M = WILDS_MARGIN;
    this.mapRect = [ox, oy, w * cell, h * cell];
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
    this.teamMats = [new Float32Array(this.cap * 16), new Float32Array(this.cap * 16)];
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
    this.pitch = MAX_PITCH * smoothstep(ZOOM_FLAT, ZOOM_3D, zoom);
    camera.pitch = this.pitch; // keep picking/overlays in sync
    this.syncCamera(camera);
    const use3D = zoom >= ZOOM_SWAP;

    if (use3D) {
      this.sprite.isVisible = false;
      this.drawMeshes(positions, facings, alive, count);
    } else {
      this.teamMesh[0].isVisible = false;
      this.teamMesh[1].isVisible = false;
      this.drawSprites(positions, facings, frames, alive, count);
    }
    this.groundMat.setFloat('uTime', this.fixedTime ?? (performance.now() - this.start) / 1000);
    this.scene.render();
  }

  private drawMeshes(positions: Float32Array, facings: Float32Array, alive: Float32Array, count: number) {
    const m0 = this.teamMats[0], m1 = this.teamMats[1];
    let n0 = 0, n1 = 0;
    for (let i = 0; i < count; i++) {
      const team = this.teamOf[i];
      const buf = team === 1 ? m1 : m0;
      const o = (team === 1 ? n1++ : n0++) * 16;
      const x = positions[2 * i], y = positions[2 * i + 1], s = this.scaleOf[i] || 1;
      const a = facings[i] - Math.PI / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      if (alive[i] < 0.5) {
        buf[o] = ca * s; buf[o + 1] = sa * s; buf[o + 2] = 0; buf[o + 3] = 0;
        buf[o + 4] = 0; buf[o + 5] = 0; buf[o + 6] = s; buf[o + 7] = 0;
        buf[o + 8] = sa * 0.25 * s; buf[o + 9] = -ca * 0.25 * s; buf[o + 10] = 0.25 * s; buf[o + 11] = 0;
        buf[o + 12] = x; buf[o + 13] = y; buf[o + 14] = 0.05; buf[o + 15] = 1;
      } else {
        buf[o] = ca * s; buf[o + 1] = sa * s; buf[o + 2] = 0; buf[o + 3] = 0;
        buf[o + 4] = -sa * s; buf[o + 5] = ca * s; buf[o + 6] = 0; buf[o + 7] = 0;
        buf[o + 8] = 0; buf[o + 9] = 0; buf[o + 10] = s; buf[o + 11] = 0;
        buf[o + 12] = x; buf[o + 13] = y; buf[o + 14] = 0; buf[o + 15] = 1;
      }
    }
    this.commitMesh(0, n0);
    this.commitMesh(1, n1);
  }

  private commitMesh(t: number, n: number) {
    const mesh = this.teamMesh[t];
    mesh.isVisible = n > 0;
    if (n > 0) mesh.thinInstanceSetBuffer('matrix', this.teamMats[t].subarray(0, n * 16), 16, false);
    mesh.thinInstanceCount = n;
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

  // --- overlays — Phase: ported next (wedges, paths, selection, banners).
  drawTris(_verts: Float32Array, _camera: Camera) {}
  drawOverlay(_verts: Float32Array, _camera: Camera) {}
}
