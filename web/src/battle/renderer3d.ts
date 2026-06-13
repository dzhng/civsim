// Babylon.js battle renderer — Phase 1 of the 3D conversion (the campaign
// map already runs Babylon; this brings the battlefield onto the same
// engine). Soldiers are real 3D meshes, thin-instanced from the same
// zero-copy wasm buffers the 2D renderer reads. Same public surface as
// the GL `Renderer`, so the battle scene swaps with a one-line change and
// the 2D path stays the default fallback during the migration.
//
// Phase 1 scope: engine + tilted orthographic camera (matched to the 2D
// Camera so picking stays exact), a lit 3D ground, and team-coloured,
// facing-oriented low-poly soldiers. Banners, attack-arc wedges, path and
// selection overlays (drawTris/drawOverlay) come in Phase 2.

import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Camera as BCamera } from '@babylonjs/core/Cameras/camera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Meshes/thinInstanceMesh';

import type { Camera } from '../shared/camera';
import { WILDS_MARGIN } from './renderer';

const TEAM_COLOR: [number, number, number][] = [
  [0.22, 0.41, 0.78], // player blue
  [0.78, 0.25, 0.23], // enemy red
];

/** A low-poly soldier: tapered body, head, and a front nub so facing reads.
 *  Built once, thin-instanced per soldier. Local +y is forward, +z up. */
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
  box(-0.17, -0.11, 0.0, 0.17, 0.11, 1.12); // body (legs + torso)
  box(-0.1, -0.1, 1.12, 0.1, 0.1, 1.5); // head
  box(-0.05, 0.08, 1.18, 0.05, 0.2, 1.34); // facing nub (nose/visor, +y front)
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
  // One mesh per team: a solid team material is far more reliable than
  // Babylon's per-thin-instance colour buffer, and gives each team (later,
  // each class) its own look. Soldiers route to their team's matrix buffer
  // each frame.
  private teamMesh: Mesh[] = [];
  private teamMats: Float32Array[] = [new Float32Array(0), new Float32Array(0)];
  private ground: Mesh;
  private cap = 0; // per-team instance-buffer capacity (each holds up to all)
  private scaleOf = new Float32Array(0);
  private teamOf: number[] = [];
  private mapRect: [number, number, number, number] = [0, 0, 1, 1];
  /** Tilt of the view from straight-down, radians (camera.ts mirrors it). */
  readonly pitch = 0.35;
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
    sky.intensity = 0.7;
    sky.groundColor = new Color3(0.32, 0.34, 0.3);
    const sun = new DirectionalLight('sun', new Vector3(-0.4, 0.5, -0.78), this.scene);
    sun.intensity = 0.85;

    // Ground: a flat lit plane spanning the painted world; the tint/micro-
    // terrain shader port comes with Phase 3.
    this.ground = new Mesh('ground', this.scene);
    const gmat = new StandardMaterial('ground', this.scene);
    gmat.diffuseColor = new Color3(0.34, 0.43, 0.26);
    gmat.specularColor = new Color3(0, 0, 0);
    gmat.backFaceCulling = false; // a single quad; never cull the field
    this.ground.material = gmat;

    const geom = soldierVertexData();
    for (let t = 0; t < 2; t++) {
      const mesh = new Mesh(`soldier${t}`, this.scene);
      geom.applyToMesh(mesh);
      const mat = new StandardMaterial(`soldier${t}`, this.scene);
      const c = TEAM_COLOR[t];
      mat.diffuseColor = new Color3(c[0], c[1], c[2]);
      mat.specularColor = new Color3(0.05, 0.05, 0.05);
      mesh.material = mat;
      mesh.alwaysSelectAsActiveMesh = true; // culling driven by the camera
      mesh.isVisible = false;
      this.teamMesh.push(mesh);
    }
  }

  resize() {
    this.engine.resize();
  }

  setStatic(_soldierUnit: Uint32Array, teams: number[], _classes: number[], radii: Float32Array) {
    const n = teams.length;
    this.teamOf = teams;
    this.scaleOf = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.scaleOf[i] = Math.max(0.6, radii[i] / 0.33); // ~human; radius 0.33 = baseline
    }
  }

  setTerrain(
    w: number, h: number, cell: number, ox: number, oy: number,
    _speed: Float32Array, _rough: Float32Array, _tint: Uint8Array,
  ) {
    const M = WILDS_MARGIN;
    this.mapRect = [ox, oy, w * cell, h * cell];
    const x0 = ox - M;
    const y0 = oy - M;
    const x1 = ox + w * cell + M;
    const y1 = oy + h * cell + M;
    const vd = new VertexData();
    vd.positions = [x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0];
    vd.indices = [0, 1, 2, 0, 2, 3];
    vd.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    vd.applyToMesh(this.ground);
  }

  private ensureCapacity(count: number) {
    if (count <= this.cap) return;
    this.cap = Math.max(count, Math.ceil(this.cap * 1.5), 1024);
    this.teamMats = [new Float32Array(this.cap * 16), new Float32Array(this.cap * 16)];
  }

  draw(
    positions: Float32Array,
    facings: Float32Array,
    _frames: Float32Array,
    alive: Float32Array,
    count: number,
    camera: Camera,
    _selectedPrimary: number,
    _banners: { x: number; y: number; team: number; unit: number }[],
    _bannerSize = 11,
  ) {
    this.syncCamera(camera);
    this.ensureCapacity(count);
    const m0 = this.teamMats[0];
    const m1 = this.teamMats[1];
    let n0 = 0;
    let n1 = 0;
    for (let i = 0; i < count; i++) {
      const team = this.teamOf[i];
      const buf = team === 1 ? m1 : m0;
      const o = (team === 1 ? n1 : n0) * 16;
      if (team === 1) n1++; else n0++;
      const x = positions[2 * i];
      const y = positions[2 * i + 1];
      const s = this.scaleOf[i] || 1;
      // Rotate the +y-forward mesh to the sim facing (about z), scale,
      // translate to the soldier's ground position. The dead lie flat.
      const a = facings[i] - Math.PI / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      if (alive[i] < 0.5) {
        // Tip the body onto the ground along its facing, flattened.
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
    this.commitTeam(0, n0);
    this.commitTeam(1, n1);
    this.scene.render();
  }

  private commitTeam(t: number, n: number) {
    const mesh = this.teamMesh[t];
    mesh.isVisible = n > 0;
    if (n > 0) mesh.thinInstanceSetBuffer('matrix', this.teamMats[t].subarray(0, n * 16), 16, false);
    mesh.thinInstanceCount = n;
  }

  /** Match the Babylon ortho camera to the 2D Camera (center, zoom, tilt). */
  private syncCamera(c: Camera) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const z = c.zoom;
    this.camera.orthoLeft = -W / (2 * z);
    this.camera.orthoRight = W / (2 * z);
    this.camera.orthoTop = H / (2 * z);
    this.camera.orthoBottom = -H / (2 * z);
    const p = this.pitch; // tilt from vertical
    // Look at (cx, cy, 0) from the south and above; screen-up = north+up.
    const dist = 2000;
    this.camera.position.set(c.x, c.y - dist * Math.sin(p), dist * Math.cos(p));
    this.camera.setTarget(new Vector3(c.x, c.y, 0));
    this.camera.upVector.set(0, Math.cos(p), Math.sin(p));
  }

  // --- Phase 2 (overlays) — no-ops for now so the scene's calls are safe.
  drawTris(_verts: Float32Array, _camera: Camera) {}
  drawOverlay(_verts: Float32Array, _camera: Camera) {}
}
