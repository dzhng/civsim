import * as THREE from "three/webgpu";
import {
  attribute,
  clamp,
  float,
  max,
  mix,
  smoothstep,
  step,
  texture,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";
import type { CrowdInstance } from "../../../crowd-runtime/src/instanceData";
import { factionForTeam } from "../../../game-renderer/src/battle/factionColors";
import type { VatBake } from "../../../soldier-assets/src/schema";
import type { SoldierMeshData } from "../../../soldier-assets/src/mesh";
import { poseSoldierMesh } from "../../../soldier-assets/src/skin";
import { linearAlbedo } from "./battleTsl";
import { RENDER_ORDER } from "./terrainLayer";

interface ImpostorAtlas {
  texture: THREE.Texture;
  tileSize: number;
  columns: number;
  rows: number;
  directions: THREE.Vector3[];
  center: THREE.Vector3;
  worldSpan: number;
}

interface PosedMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint16Array | Uint32Array;
}

interface Bounds2 {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const LIGHT_DIR = new THREE.Vector3(-0.34, -0.42, 0.84).normalize();

export function createSoldierImpostorAtlas(
  mesh: SoldierMeshData,
  vat: VatBake,
  opts: { columns?: number; rows?: number; tileSize?: number; clip: string; phase: number },
): ImpostorAtlas {
  const columns = opts.columns ?? 8;
  const rows = opts.rows ?? 8;
  const tileSize = opts.tileSize ?? 96;
  const posedMesh = poseMeshWithVat(mesh, vat, opts.clip, opts.phase);
  const directions = hemiOctDirections(columns, rows);
  const canvas = document.createElement("canvas");
  canvas.width = columns * tileSize;
  canvas.height = rows * tileSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for impostor atlas bake");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const projectedBounds = directions.map((dir) => projectedMeshBounds(posedMesh, viewBasis(dir)));
  const box = new THREE.Box3().setFromArray(posedMesh.positions);
  const center = box.getCenter(new THREE.Vector3());
  // Every view shares a model-space anchor. Per-tile recentering would make
  // long weapons shift the body when the selected view changes.
  for (let i = 0; i < directions.length; i++) {
    const basis = viewBasis(directions[i]);
    const cx = center.dot(basis.right),
      cy = center.dot(basis.up);
    const bounds = projectedBounds[i];
    const halfX = Math.max(cx - bounds.minX, bounds.maxX - cx);
    const halfY = Math.max(cy - bounds.minY, bounds.maxY - cy);
    projectedBounds[i] = { minX: cx - halfX, maxX: cx + halfX, minY: cy - halfY, maxY: cy + halfY };
  }
  const maxSpan = Math.max(
    ...projectedBounds.map((b) => Math.max(b.maxX - b.minX, b.maxY - b.minY)),
    1e-3,
  );
  for (let tile = 0; tile < directions.length; tile++) {
    const col = tile % columns;
    const row = Math.floor(tile / columns);
    bakeTile(ctx, posedMesh, directions[tile], projectedBounds[tile], {
      x: col * tileSize,
      y: row * tileSize,
      tileSize,
      maxSpan,
    });
  }

  const textureAtlas = new THREE.CanvasTexture(canvas);
  textureAtlas.name = "battle-crowd-shared-soldier-impostor-atlas";
  textureAtlas.colorSpace = THREE.SRGBColorSpace;
  textureAtlas.minFilter = THREE.LinearMipmapLinearFilter;
  textureAtlas.magFilter = THREE.LinearFilter;
  textureAtlas.generateMipmaps = true;
  textureAtlas.needsUpdate = true;
  return {
    texture: textureAtlas,
    tileSize,
    columns,
    rows,
    directions,
    center,
    worldSpan: maxSpan / 0.78,
  };
}

// Minimum on-screen billboard height as a fraction of viewport height. The
// battle rig's eye parks hundreds of metres up at max zoom-out, so a fixed
// world-space sprite projects to ~2 px — small enough that the mipmapped,
// alpha-tested atlas averages the soldier silhouette into its transparent
// margin and the whole sprite fails alphaTest at once (the army vanishing over
// one scroll tick). Flooring the projected size keeps the crowd readable as at
// least a small blob at any zoom. ~0.008 ≈ 6-9 px on typical viewports.
const IMPOSTOR_MIN_SCREEN_FRACTION = 0.008;

export class OctahedralImpostorLayer {
  private readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly camRight = uniform(new THREE.Vector3(1, 0, 0));
  private readonly camUp = uniform(new THREE.Vector3(0, 0, 1));
  private capacity = 0;
  private inst = new Float32Array(0);
  private meta = new Float32Array(0);
  private source: CrowdInstance[] = [];

  constructor(
    scene: THREE.Scene,
    private readonly atlas: ImpostorAtlas,
  ) {
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3),
    );
    this.geometry.setIndex([0, 1, 2, 2, 1, 3]);
    this.geometry.instanceCount = 0;

    const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    material.alphaTest = 0.08;
    material.depthWrite = true;
    material.fog = true;
    const quad = attribute<"vec3">("position", "vec3");
    const inst = attribute<"vec4">("impostorInst", "vec4"); // x, y, elevation, faction
    const meta = attribute<"vec4">("impostorMeta", "vec4"); // tile, width, height, shade
    const right = vec3(this.camRight).mul(quad.x.mul(meta.y).mul(0.5));
    const up = vec3(this.camUp).mul(quad.y.mul(meta.z).mul(0.5));
    material.positionNode = vec3(inst.x, inst.y, inst.z).add(right).add(up);

    const tile = varying(meta.x).toVar();
    const localUv = varying(quad.xy.mul(0.5).add(vec2(0.5))).toVar();
    const row = tile.div(float(this.atlas.columns)).floor().toVar();
    const col = tile.sub(row.mul(float(this.atlas.columns))).toVar();
    const atlasUv = vec2(
      col.add(localUv.x).div(float(this.atlas.columns)),
      // Canvas rows count from the top; texture V counts from the bottom.
      float(this.atlas.rows - 1)
        .sub(row)
        .add(localUv.y)
        .div(float(this.atlas.rows)),
    );
    const sample = texture(this.atlas.texture, atlasUv).toVar();
    const faction = varying(inst.w).toVar();
    const shade = varying(meta.w).toVar();
    // Far impostors obey the same policy as mesh tiers: no broad team wash,
    // only the authored upper sword-arm band receives faction color.
    const mask = smoothstep(0.05, 0.28, sample.b.sub(max(sample.r, sample.g))).toVar();
    const color = sampledFactionAccentNode(vec4(sample.rgb, sample.a), faction, mask).mul(
      vec4(vec3(shade), 1.0),
    );
    material.colorNode = vec4(color.rgb, sample.a);

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = "battle-crowd-far-impostors";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RENDER_ORDER.worldOpaque;
    this.mesh.castShadow = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  upload(instances: CrowdInstance[]): void {
    this.source = instances;
    this.mesh.visible = instances.length > 0;
    if (instances.length === 0) {
      this.geometry.instanceCount = 0;
      return;
    }
    if (instances.length > this.capacity) {
      this.capacity = Math.max(instances.length, this.capacity * 2, 512);
      this.inst = new Float32Array(this.capacity * 4);
      this.meta = new Float32Array(this.capacity * 4);
      this.geometry.setAttribute("impostorInst", new THREE.InstancedBufferAttribute(this.inst, 4));
      this.geometry.setAttribute("impostorMeta", new THREE.InstancedBufferAttribute(this.meta, 4));
    }
    for (let i = 0; i < instances.length; i++) {
      const src = instances[i];
      const o = i * 4;
      const angle = src.facing - Math.PI / 2;
      const center = this.atlas.center;
      this.inst[o] = src.x + center.x * Math.cos(angle) - center.y * Math.sin(angle);
      this.inst[o + 1] = src.y + center.x * Math.sin(angle) + center.y * Math.cos(angle);
      this.inst[o + 2] = (src.elevation ?? 0) + center.z;
      this.inst[o + 3] = src.faction;
      this.meta[o] = 0;
      this.meta[o + 1] = this.atlas.worldSpan;
      this.meta[o + 2] = this.atlas.worldSpan;
      this.meta[o + 3] = 1;
    }
    (this.geometry.getAttribute("impostorInst") as THREE.InstancedBufferAttribute).needsUpdate =
      true;
    (this.geometry.getAttribute("impostorMeta") as THREE.InstancedBufferAttribute).needsUpdate =
      true;
    this.geometry.instanceCount = instances.length;
  }

  setCamera(camera: THREE.Camera): void {
    const m = camera.matrixWorld.elements;
    this.camRight.value.set(m[0], m[1], m[2]).normalize();
    this.camUp.value.set(m[4], m[5], m[6]).normalize();
    const eye = new THREE.Vector3();
    camera.getWorldPosition(eye);
    // Half-angle of the vertical FOV, for the projected screen-size floor below.
    const fovY = "fov" in camera ? ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180 : 0;
    const tanHalfFov = fovY > 0 ? Math.tan(fovY / 2) : 0;
    const localDir = new THREE.Vector3();
    for (let i = 0; i < this.source.length; i++) {
      const src = this.source[i];
      localDir.set(eye.x - src.x, eye.y - src.y, eye.z - (src.elevation ?? 0));
      const dist = localDir.length();
      localDir.normalize();
      rotateViewDirectionIntoSoldierLocal(localDir, src.facing);
      const o = i * 4;
      this.meta[o] = nearestTile(localDir, this.atlas.directions);
      // Screen-size floor: enlarge the world-space billboard whenever it would
      // project below the minimum viewport fraction, so a far crowd stays a
      // visible blob instead of sub-pixel-vanishing through the alpha-tested
      // mip chain. screenFraction is the projected height as a fraction of the
      // viewport (perspective: worldHeight / (2 · depth · tan(fovY/2))).
      let scale = 1;
      if (tanHalfFov > 0 && dist > 0) {
        const screenFraction = this.atlas.worldSpan / (2 * dist * tanHalfFov);
        if (screenFraction < IMPOSTOR_MIN_SCREEN_FRACTION)
          scale = IMPOSTOR_MIN_SCREEN_FRACTION / screenFraction;
      }
      this.meta[o + 1] = this.atlas.worldSpan * scale;
      this.meta[o + 2] = this.atlas.worldSpan * scale;
      this.meta[o + 3] = clampShade(0.72 + 0.28 * Math.max(0, localDir.dot(LIGHT_DIR)));
    }
    const attr = this.geometry.getAttribute("impostorMeta") as
      | THREE.InstancedBufferAttribute
      | undefined;
    if (attr) attr.needsUpdate = true;
  }

  stats() {
    return {
      impostorInstances: this.source.length,
      impostorDrawCalls: this.source.length > 0 ? 1 : 0,
      atlas: `${this.atlas.columns}x${this.atlas.rows}x${this.atlas.tileSize}`,
      tileSelection: "nearest",
      factionMask: "sampled armband locator; no shield/crest/body faction tint",
    };
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.atlas.texture.dispose();
  }
}

function sampledFactionAccentNode(
  color: Node<"vec4">,
  faction: Node<"float">,
  mask: Node<"float">,
) {
  const blue = linearAlbedo(vec3(...factionForTeam(0).primary));
  const red = linearAlbedo(vec3(...factionForTeam(1).primary));
  const neutral = linearAlbedo(vec3(...factionForTeam(2).primary));
  let accent = mix(blue, red, step(0.5, faction));
  accent = mix(accent, neutral, step(1.5, faction));
  const armBand = mix(accent, linearAlbedo(vec3(0.42, 0.34, 0.26)), 0.35);
  // texture() has already put the sRGB-tagged atlas sample into material color
  // space. Re-running linearAlbedo on that sample double-linearizes it to black.
  const rgb = mix(color.rgb, armBand, mask);
  return vec4(clamp(rgb, vec3(0.0), vec3(1.0)), color.a);
}

function poseMeshWithVat(
  mesh: SoldierMeshData,
  vat: VatBake,
  clipName: string,
  phase: number,
): PosedMeshData {
  const clip = vat.clips.find((c) => c.name === clipName)!;
  const frame = Math.min(
    clip.start + clip.frames - 1,
    clip.start + Math.floor(phase * Math.max(clip.frames - 1, 1)),
  );
  const { positions, normals } = poseSoldierMesh(mesh, vat, frame);
  return { positions, normals, colors: mesh.colors, indices: mesh.indices };
}

function hemiOctDirections(columns: number, rows: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const ox = ((x + 0.5) / columns) * 2 - 1;
      const oy = ((y + 0.5) / rows) * 2 - 1;
      let dx = ox;
      let dy = oy;
      let dz = 1 - Math.abs(dx) - Math.abs(dy);
      if (dz < 0) {
        const px = dx;
        dx = (1 - Math.abs(dy)) * Math.sign(px || 1);
        dy = (1 - Math.abs(px)) * Math.sign(dy || 1);
        dz = -dz;
      }
      out.push(new THREE.Vector3(dx, dy, Math.abs(dz)).normalize());
    }
  }
  return out;
}

function viewBasis(dir: THREE.Vector3) {
  const forward = dir.clone().normalize();
  const fallback =
    Math.abs(forward.z) > 0.96 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3().crossVectors(fallback, forward).normalize();
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();
  return { forward, right, up };
}

function projectedMeshBounds(mesh: PosedMeshData, basis: ReturnType<typeof viewBasis>): Bounds2 {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const p = new THREE.Vector3(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
    const x = p.dot(basis.right);
    const y = p.dot(basis.up);
    b.minX = Math.min(b.minX, x);
    b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y);
    b.maxY = Math.max(b.maxY, y);
  }
  return b;
}

function bakeTile(
  ctx: CanvasRenderingContext2D,
  mesh: PosedMeshData,
  dir: THREE.Vector3,
  bounds: Bounds2,
  tile: { x: number; y: number; tileSize: number; maxSpan: number },
): void {
  const basis = viewBasis(dir);
  const scale = (tile.tileSize * 0.78) / tile.maxSpan;
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  const tris: { i0: number; i1: number; i2: number; depth: number }[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const i0 = mesh.indices[i];
    const i1 = mesh.indices[i + 1];
    const i2 = mesh.indices[i + 2];
    tris.push({
      i0,
      i1,
      i2,
      depth:
        vertexDepth(mesh, i0, basis.forward) +
        vertexDepth(mesh, i1, basis.forward) +
        vertexDepth(mesh, i2, basis.forward),
    });
  }
  tris.sort((a, b) => a.depth - b.depth);
  for (const tri of tris) {
    const p0 = projectedVertex(mesh, tri.i0, basis, cx, cy, tile, scale);
    const p1 = projectedVertex(mesh, tri.i1, basis, cx, cy, tile, scale);
    const p2 = projectedVertex(mesh, tri.i2, basis, cx, cy, tile, scale);
    const rgb = shadedTriangleColor(mesh, tri.i0, tri.i1, tri.i2, dir);
    ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 1)`;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();
    ctx.fill();
  }
}

function vertexDepth(mesh: PosedMeshData, i: number, forward: THREE.Vector3): number {
  return (
    mesh.positions[i * 3] * forward.x +
    mesh.positions[i * 3 + 1] * forward.y +
    mesh.positions[i * 3 + 2] * forward.z
  );
}

function projectedVertex(
  mesh: PosedMeshData,
  i: number,
  basis: ReturnType<typeof viewBasis>,
  cx: number,
  cy: number,
  tile: { x: number; y: number; tileSize: number },
  scale: number,
): [number, number] {
  const p = new THREE.Vector3(
    mesh.positions[i * 3],
    mesh.positions[i * 3 + 1],
    mesh.positions[i * 3 + 2],
  );
  const x = (p.dot(basis.right) - cx) * scale;
  const y = (p.dot(basis.up) - cy) * scale;
  return [tile.x + tile.tileSize * 0.5 + x, tile.y + tile.tileSize * 0.5 - y];
}

function shadedTriangleColor(
  mesh: PosedMeshData,
  i0: number,
  i1: number,
  i2: number,
  viewDir: THREE.Vector3,
): [number, number, number] {
  const rgb = [0, 0, 0];
  const n = new THREE.Vector3();
  for (const i of [i0, i1, i2]) {
    rgb[0] += mesh.colors[i * 4];
    rgb[1] += mesh.colors[i * 4 + 1];
    rgb[2] += mesh.colors[i * 4 + 2];
    n.x += mesh.normals[i * 3];
    n.y += mesh.normals[i * 3 + 1];
    n.z += mesh.normals[i * 3 + 2];
  }
  n.normalize();
  const lambert = Math.max(0, n.dot(LIGHT_DIR));
  const rim = Math.max(0, 1 - Math.max(0, n.dot(viewDir))) * 0.16;
  const shade = Math.min(1.15, 0.58 + lambert * 0.42 + rim);
  return [
    Math.round(Math.min(255, (rgb[0] / 3) * shade * 255)),
    Math.round(Math.min(255, (rgb[1] / 3) * shade * 255)),
    Math.round(Math.min(255, (rgb[2] / 3) * shade * 255)),
  ];
}

function rotateViewDirectionIntoSoldierLocal(dir: THREE.Vector3, facing: number): void {
  const angle = Math.PI / 2 - facing;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = dir.x * c - dir.y * s;
  const y = dir.x * s + dir.y * c;
  dir.x = x;
  dir.y = y;
  dir.normalize();
}

function nearestTile(dir: THREE.Vector3, directions: THREE.Vector3[]): number {
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < directions.length; i++) {
    const d = dir.dot(directions[i]);
    if (d > bestDot) {
      bestDot = d;
      best = i;
    }
  }
  return best;
}

function clampShade(x: number): number {
  return Math.max(0.65, Math.min(1.05, x));
}
