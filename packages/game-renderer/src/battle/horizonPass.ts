import type { RawFrameShell, WorldRenderPass } from '../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';
import { gpuOpaqueColorTarget, gpuWorldDepthStencil } from '../../../renderer-core/src/pipelineContracts';
import { MeshBuilder } from '../models/shared/meshBuilder';
import type { BattleEdgeRole, BattleEdgeRoles } from './terrainFeatures';
import { terrainHeightAt, type TerrainHeightField } from '../terrain/heightField';

// The sealed-side backdrop: the west/east edges read at a glance as the blocker
// the sim already enforces — cliffs/mountains as a tall stone ridge, a wall as a
// crenellated rampart, ocean as open water — while the open north/south edges
// dissolve into distance haze (the scene's clear colour). Presentation only; the
// passability lives in the terrain masks.

const STONE: [number, number, number] = [0.47, 0.44, 0.39];
const STONE_TOP: [number, number, number] = [0.60, 0.57, 0.51];
const WALL: [number, number, number] = [0.55, 0.52, 0.47];
const WALL_TOP: [number, number, number] = [0.64, 0.61, 0.55];
// Near-shore colour matches the ground pass's own water tint (a river/lake on
// the field reads the same as the open sea continuing past the edge, so there is
// no stripe where field water meets horizon water); it deepens with distance.
const WATER_DEEP: [number, number, number] = [0.14, 0.26, 0.40];
const WATER_SHALLOW: [number, number, number] = [0.29, 0.43, 0.48];
// Neutral light-grey atmospheric haze the distant blockers dissolve into. Kept
// off-blue so far peaks read as hazy stone, not as slivers of water or sky.
const HAZE: [number, number, number] = [0.80, 0.81, 0.83];

const HORIZON_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
  @location(1) light: f32,
};

@vertex
fn vs(@location(0) world: vec3f, @location(1) normal: vec3f, @location(2) color: vec3f) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld3d(world, civsimBattleWorldDepth3d(world));
  let sun = normalize(vec3f(-0.40, -0.28, 0.87));
  out.light = clamp(dot(normalize(normal), sun) * 0.5 + 0.7, 0.42, 1.2);
  out.color = color;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  // Push the blocker slightly toward the cool haze with height so it reads as
  // standing off in the distance behind the field.
  let haze = vec3f(0.74, 0.79, 0.84);
  let col = clamp(mix(in.color * in.light, haze, 0.10), vec3f(0.0), vec3f(1.0));
  return vec4f(col, 1.0);
}`;

export class BattleHorizonPass {
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private indexCount = 0;
  private builtEdges: Array<{ side: keyof BattleEdgeRoles; role: BattleEdgeRole }> = [];

  constructor(private shell: RawFrameShell) {
    const module = shell.device.createShaderModule({ label: 'battle-horizon-wgsl', code: HORIZON_WGSL });
    this.pipeline = shell.device.createRenderPipeline({
      label: 'battle-horizon-pipeline',
      layout: shell.device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 40,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' },
          ],
        }],
      },
      fragment: { module, entryPoint: 'fs', targets: [gpuOpaqueColorTarget(shell.info.format)] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: gpuWorldDepthStencil('read-write'),
    });
  }

  /** Build the blocker geometry just outside each sealed edge. `bounds` is the
   *  playable rect; the field height datum seats the bases. */
  setEdges(bounds: { ox: number; oy: number; w: number; h: number; cell: number }, edges: BattleEdgeRoles, field: TerrainHeightField) {
    const builder = new MeshBuilder();
    this.builtEdges = [];
    const x0 = bounds.ox;
    const x1 = bounds.ox + bounds.w * bounds.cell;
    const y0 = bounds.oy;
    const y1 = bounds.oy + bounds.h * bounds.cell;
    const midY = (y0 + y1) * 0.5;
    this.buildEdge(builder, edges.west, 'west', x0, y0, y1, field, terrainHeightAt(field, x0, midY));
    this.buildEdge(builder, edges.east, 'east', x1, y0, y1, field, terrainHeightAt(field, x1, midY));
    // North/south stay open — they read as fog against the scene clear colour.
    const mesh = builder.finish('battle horizon');
    this.upload(mesh.opaque.vertices, mesh.opaque.indices);
  }

  private buildEdge(
    builder: MeshBuilder,
    role: BattleEdgeRole,
    side: keyof BattleEdgeRoles,
    edgeX: number,
    y0: number,
    y1: number,
    field: TerrainHeightField,
    baseZ: number,
  ) {
    if (role === 'open-fog') return;
    this.builtEdges.push({ side, role });
    const outward = side === 'west' ? -1 : 1;
    const span = y1 - y0;
    const midY = (y0 + y1) * 0.5;
    const yLo = y0 - 400;
    const yHi = y1 + 400;

    if (role === 'ocean') {
      // One continuous sea from the shoreline out past the horizon: shallow green
      // near, deepening and hazing with distance. A single graded plane — no
      // stacked stripes, no bright seam — lapping the turf so no gap shows at the
      // shore.
      const near = edgeX - outward * 24;
      const far = edgeX + outward * 4000;
      builder.gradQuad(
        [near, yLo, baseZ - 4], [far, yLo, baseZ - 80], [far, yHi, baseZ - 80], [near, yHi, baseZ - 4],
        WATER_SHALLOW, mix3(WATER_DEEP, HAZE, 0.55));
      return;
    }

    // Every land/wall edge first fills the world beyond it with a receding apron
    // that drops away and hazes into the horizon, so the boundary reads as ground
    // falling off — never a white void or see-through gaps behind the blocker.
    const apronNear = edgeX + outward * 12;
    const apronFar = edgeX + outward * 2600;

    if (role === 'wall') {
      builder.gradQuad(
        [apronNear, yLo, baseZ - 2], [apronFar, yLo, baseZ - 120], [apronFar, yHi, baseZ - 120], [apronNear, yHi, baseZ - 2],
        mix3(STONE, HAZE, 0.4), HAZE);
      // A solid coursed rampart lapping the turf edge: a darker base course under
      // a lighter wall face so it reads as masonry with depth, capped by merlons —
      // a wall you cannot cross, not a flat band with a dotted edge.
      const wallX = edgeX + outward * 20;
      const wallH = 120;
      builder.box([wallX, midY, baseZ - 4 + wallH * 0.18], [70, span + 220, wallH * 0.36], mix3(WALL, [0, 0, 0], 0.34), 1);
      builder.box([wallX, midY, baseZ - 4 + wallH / 2], [62, span + 220, wallH], WALL, 1);
      const merlons = Math.max(10, Math.round(span / 90));
      for (let k = 0; k <= merlons; k += 2) {
        const y = y0 - 80 + ((span + 160) * k) / merlons;
        builder.box([wallX, y, baseZ - 4 + wallH + 16], [72, 44, 34], WALL_TOP, 1);
      }
      return;
    }

    // Cliff / mountain: the apron is bare rock falling away; over it a continuous
    // hazed back ridge seals the silhouette (no sky showing between peaks) and
    // sharp near peaks break it, so the range reads with real depth — not a flat
    // sawtooth fence.
    builder.gradQuad(
      [apronNear, yLo, baseZ - 6], [apronFar, yLo, baseZ - 200], [apronFar, yHi, baseZ - 200], [apronNear, yHi, baseZ - 6],
      mix3(STONE, HAZE, 0.25), HAZE);
    const sideSalt = side === 'west' ? 11 : 23;
    // `gap` sets spacing as a multiple of radius: near row sparse for a varied
    // skyline, far row dense so its overlapping peaks form an unbroken seal.
    const rows = [
      { dist: 6, radius: 80, height: 86, fog: 0.0, gap: 1.25, salt: 3 },
      { dist: 90, radius: 120, height: 150, fog: 0.28, gap: 0.85, salt: 31 },
      { dist: 210, radius: 170, height: 226, fog: 0.55, gap: 0.5, salt: 57 },
    ];
    for (const row of rows) {
      const stepN = Math.max(10, Math.round(span / (row.radius * row.gap)));
      const baseC = mix3(STONE, HAZE, row.fog);
      const topC = mix3(STONE_TOP, HAZE, row.fog);
      for (let k = 0; k <= stepN; k++) {
        const y = y0 - 100 + ((span + 200) * k) / stepN;
        const jx = hash(k, sideSalt + row.salt);
        const cx = edgeX + outward * (row.dist + jx * row.radius * 0.5);
        const radius = row.radius * (0.78 + hash(k, 7 + row.salt) * 0.5);
        const height = row.height * (0.74 + hash(k, 5 + row.salt) * 0.55);
        builder.peak([cx, y, baseZ - 6], radius, height, 7, baseC, topC, k * 7 + 3 + row.salt);
      }
    }
  }

  private upload(verts: Float32Array, indices: Uint16Array) {
    const device = this.shell.device;
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.vertexBuffer = device.createBuffer({ label: 'battle-horizon-vertices', size: Math.max(4, verts.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    if (verts.byteLength > 0) device.queue.writeBuffer(this.vertexBuffer, 0, verts);
    const padded = indices.byteLength % 4 === 0 ? indices : new Uint16Array(indices.length + 1);
    if (padded !== indices) padded.set(indices);
    this.indexBuffer = device.createBuffer({ label: 'battle-horizon-indices', size: Math.max(4, padded.byteLength), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    if (padded.byteLength > 0) device.queue.writeBuffer(this.indexBuffer, 0, padded);
    this.indexCount = indices.length;
  }

  draw(pass: WorldRenderPass) {
    if (!this.vertexBuffer || !this.indexBuffer || this.indexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint16');
    pass.drawIndexed(this.indexCount);
  }

  stats() {
    return { sealedEdges: this.builtEdges.map((e) => `${e.side}:${e.role}`), layer: 'battle-horizon-blockers' as const };
  }
}

function mix3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function hash(k: number, salt: number): number {
  let n = Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
