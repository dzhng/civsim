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
const WATER_DEEP: [number, number, number] = [0.16, 0.30, 0.44];
const WATER_SHALLOW: [number, number, number] = [0.30, 0.46, 0.55];

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
    if (role === 'ocean') {
      // A wide water plane beyond the edge, sloping away.
      const near = edgeX;
      const far = edgeX + outward * 1400;
      const z = baseZ - 4;
      this.quad(builder,
        [near, y0 - 200, z], [far, y0 - 200, z - 6], [far, y1 + 200, z - 6], [near, y1 + 200, z],
        WATER_SHALLOW, WATER_DEEP);
      return;
    }
    if (role === 'wall') {
      // A solid coursed rampart with crenellations — man-made, flat-faced, and
      // continuous (so no sky shows between blocks), distinct from a crag ridge.
      const wallX = edgeX + outward * 55;
      const wallH = 95;
      const midY = (y0 + y1) * 0.5;
      builder.box([wallX, midY, baseZ - 4 + wallH / 2], [70, span + 200, wallH], WALL, 1);
      // Battlements: alternating merlons along the top.
      const merlons = Math.max(10, Math.round(span / 90));
      for (let k = 0; k <= merlons; k += 2) {
        const y = y0 - 80 + ((span + 160) * k) / merlons;
        builder.box([wallX, y, baseZ - 4 + wallH + 14], [78, 42, 30], WALL_TOP, 1);
      }
      return;
    }
    // Cliff / mountain: a ridge of blocky stone peaks just outside the edge,
    // dense enough that the ridge reads continuous against the sky.
    const stepN = Math.max(12, Math.round(span / 90));
    for (let k = 0; k <= stepN; k++) {
      const y = y0 - 60 + ((span + 120) * k) / stepN;
      const jx = hash(k, side === 'west' ? 11 : 23);
      const cx = edgeX + outward * (30 + jx * 50);
      const radius = 95 + hash(k, 7) * 95;
      const height = 90 + hash(k, 5) * 140;
      builder.peak([cx, y, baseZ - 6], radius, height, 7, STONE, STONE_TOP, k * 7 + 3);
    }
  }

  private quad(builder: MeshBuilder, a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number], near: [number, number, number], far: [number, number, number]) {
    builder.panel3d([a, b, c, d], near, 1);
    void far;
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

function hash(k: number, salt: number): number {
  let n = Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
