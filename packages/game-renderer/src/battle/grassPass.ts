import type { RawFrameShell, WorldRenderPass } from '../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';
import { compileShader } from '../../../renderer-core/src/compileShader';
import { gpuOpaqueColorTarget, gpuWorldDepthStencil } from '../../../renderer-core/src/pipelineContracts';
import { terrainHeightAt, type TerrainHeightField } from '../terrain/heightField';
import type { BattleGroundCover } from './terrainFeatures';
import {
  DEFAULT_GRASS_TUFT_BLADES,
  buildGrassTuftMesh,
  grassTuftStats,
  type GrassTuftOptions,
} from '../models/shared/grassModels';

export interface BattleGrassBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BattleGrassParams {
  seed?: number;
  density?: number;
  maxTufts?: number;
  bladesPerTuft?: number;
  bladeHeight?: number;
  bladeWidth?: number;
  bend?: number;
  spread?: number;
  windPhase?: number;
  windStrength?: number;
}

export interface BattleGrassStats {
  layer: 'battle-grass-instanced-blades';
  cover: BattleGroundCover;
  tuftInstances: number;
  bladeInstances: number;
  cappedTufts: number;
  density: number;
  maxTufts: number;
  meshVertices: number;
  meshTriangles: number;
  windPhase: number;
  windStrength: number;
  cameraContract: 'shared-world-camera-wgsl';
}

const DEFAULT_GRASS_PARAMS = {
  seed: 0x6a55,
  density: 0.55,
  maxTufts: 1400,
  bladesPerTuft: DEFAULT_GRASS_TUFT_BLADES,
  bladeHeight: 0.72,
  bladeWidth: 0.055,
  bend: 0.24,
  spread: 0.16,
  windPhase: 0,
  windStrength: 0.075,
};

const GRASS_WGSL = `
${WORLD_CAMERA_WGSL}
struct GrassUniform {
  windPhase: f32,
  windStrength: f32,
  baseHeight: f32,
  _pad: f32,
};
@group(1) @binding(0) var<uniform> grass: GrassUniform;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
  @location(1) alpha: f32,
  @location(2) light: f32,
  @location(3) heightT: f32,
};

@vertex
fn vs(
  @location(0) local: vec3f,
  @location(1) normal: vec3f,
  @location(2) colorAndAlpha: vec4f,
  @location(3) instPose: vec4f,
  @location(4) instStyle: vec4f,
) -> VsOut {
  let yaw = instStyle.x;
  let phase = instStyle.y;
  let shade = 0.86 + instStyle.z * 0.22;
  let cy = cos(yaw);
  let sy = sin(yaw);
  let scale = instPose.w;
  let heightT = clamp(local.z / max(grass.baseHeight, 0.001), 0.0, 1.0);
  let wind = sin(grass.windPhase + phase + local.z * 4.7 + instPose.x * 0.045 + instPose.y * 0.036);
  let sway = wind * grass.windStrength * heightT * heightT * scale;
  let lx = local.x * scale;
  let ly = local.y * scale;
  let rlx = lx * cy - ly * sy;
  let rly = lx * sy + ly * cy;
  let world = vec3f(instPose.x + rlx + sway * 0.72, instPose.y + rly + sway * 0.24, instPose.z + local.z * scale);
  let rnormal = normalize(vec3f(normal.x * cy - normal.y * sy, normal.x * sy + normal.y * cy, normal.z));
  var out: VsOut;
  out.pos = projectWorld3d(world, civsimBattleWorldDepth3d(world));
  let sun = normalize(vec3f(-0.38, -0.26, 0.89));
  out.light = clamp(dot(rnormal, sun) * 0.28 + 0.82, 0.58, 1.10);
  out.color = colorAndAlpha.rgb * shade;
  out.alpha = colorAndAlpha.a;
  out.heightT = heightT;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let warmKey = vec3f(1.04, 1.00, 0.88);
  let coolFill = vec3f(0.76, 0.80, 0.78);
  let grade = mix(coolFill, warmKey, clamp((in.light - 0.58) / 0.52, 0.0, 1.0));
  let strawTip = vec3f(0.62, 0.59, 0.36);
  let tipDry = smoothstep(0.62, 1.0, in.heightT) * 0.055;
  let col = mix(in.color * in.light * grade, strawTip, tipDry);
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), in.alpha);
}`;

export class BattleGrassPass {
  private pipeline: GPURenderPipeline;
  private grassBindGroupLayout: GPUBindGroupLayout;
  private grassBindGroup: GPUBindGroup;
  private uniformBuffer: GPUBuffer;
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private instanceBuffer: GPUBuffer;
  private instanceCapacity = 0;
  private indexCount = 0;
  private tuftCount = 0;
  private bladesPerTuft = DEFAULT_GRASS_PARAMS.bladesPerTuft;
  private meshVertices = 0;
  private meshTriangles = 0;
  private cappedTufts = 0;
  private density = DEFAULT_GRASS_PARAMS.density;
  private maxTufts = DEFAULT_GRASS_PARAMS.maxTufts;
  private cover: BattleGroundCover = 'green-grass';
  private windPhase = DEFAULT_GRASS_PARAMS.windPhase;
  private windStrength = DEFAULT_GRASS_PARAMS.windStrength;
  private baseHeight = DEFAULT_GRASS_PARAMS.bladeHeight;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = compileShader(device, GRASS_WGSL, 'battle-grass');
    this.grassBindGroupLayout = device.createBindGroupLayout({
      label: 'battle-grass-uniform-layout',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    this.pipeline = device.createRenderPipeline({
      label: 'battle-grass-instanced-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout, this.grassBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: 40,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32x4' },
            ],
          },
          {
            arrayStride: 32,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 3, offset: 0, format: 'float32x4' },
              { shaderLocation: 4, offset: 16, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'fs', targets: [gpuOpaqueColorTarget(shell.info.format)] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: gpuWorldDepthStencil('read-write', 'less-equal'),
    });
    this.uniformBuffer = device.createBuffer({
      label: 'battle-grass-uniforms',
      size: 4 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.grassBindGroup = device.createBindGroup({
      label: 'battle-grass-uniform-bind-group',
      layout: this.grassBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
    this.instanceBuffer = device.createBuffer({
      label: 'battle-grass-empty-instances',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.writeUniforms();
  }

  setField(field: TerrainHeightField, bounds: BattleGrassBounds, cover: BattleGroundCover, params: BattleGrassParams = {}) {
    const merged = { ...DEFAULT_GRASS_PARAMS, ...params };
    this.cover = cover;
    this.density = Math.max(0, merged.density);
    this.maxTufts = clampInt(merged.maxTufts, 0, 20000);
    this.bladesPerTuft = clampInt(merged.bladesPerTuft, 1, 96);
    this.windPhase = merged.windPhase;
    this.windStrength = Math.max(0, merged.windStrength);
    this.baseHeight = Math.max(0.05, merged.bladeHeight);

    const meshOptions: GrassTuftOptions = {
      seed: merged.seed,
      blades: this.bladesPerTuft,
      height: this.baseHeight,
      width: merged.bladeWidth,
      bend: merged.bend,
      spread: merged.spread,
      palette: cover,
    };
    const mesh = buildGrassTuftMesh(meshOptions);
    const meshStats = grassTuftStats(mesh, this.bladesPerTuft);
    this.meshVertices = meshStats.opaqueVertices;
    this.meshTriangles = meshStats.opaqueTriangles;
    this.uploadMesh(mesh.opaque.vertices, mesh.opaque.indices);

    const area = Math.max(0, bounds.width) * Math.max(0, bounds.height);
    const requested = this.density > 0 && area > 0 ? Math.max(1, Math.ceil(area * this.density)) : 0;
    const count = Math.min(requested, this.maxTufts);
    this.cappedTufts = Math.max(0, requested - count);
    this.uploadInstances(scatterTufts(field, bounds, count, merged.seed));
    this.writeUniforms();
  }

  setWindPhase(phase: number) {
    this.windPhase = phase;
    this.writeUniforms();
  }

  draw(pass: WorldRenderPass) {
    if (!this.vertexBuffer || !this.indexBuffer || this.indexCount === 0 || this.tuftCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setBindGroup(1, this.grassBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint16');
    pass.drawIndexed(this.indexCount, this.tuftCount);
  }

  stats(): BattleGrassStats {
    return {
      layer: 'battle-grass-instanced-blades',
      cover: this.cover,
      tuftInstances: this.tuftCount,
      bladeInstances: this.tuftCount * this.bladesPerTuft,
      cappedTufts: this.cappedTufts,
      density: this.density,
      maxTufts: this.maxTufts,
      meshVertices: this.meshVertices,
      meshTriangles: this.meshTriangles,
      windPhase: this.windPhase,
      windStrength: this.windStrength,
      cameraContract: 'shared-world-camera-wgsl',
    };
  }

  private uploadMesh(vertices: Float32Array, indices: Uint16Array) {
    const device = this.shell.device;
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.vertexBuffer = device.createBuffer({
      label: 'battle-grass-tuft-vertices',
      size: Math.max(4, vertices.byteLength),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    if (vertices.byteLength > 0) device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
    this.indexBuffer = device.createBuffer({
      label: 'battle-grass-tuft-indices',
      size: Math.max(4, indices.byteLength),
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    if (indices.byteLength > 0) device.queue.writeBuffer(this.indexBuffer, 0, indices);
    this.indexCount = indices.length;
  }

  private uploadInstances(instances: Float32Array) {
    const count = instances.length / 8;
    this.tuftCount = count;
    if (count > this.instanceCapacity) {
      this.instanceCapacity = Math.max(count, this.instanceCapacity * 2, 128);
      this.instanceBuffer = this.shell.device.createBuffer({
        label: 'battle-grass-instances',
        size: this.instanceCapacity * 8 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (instances.byteLength > 0) this.shell.device.queue.writeBuffer(this.instanceBuffer, 0, instances);
  }

  private writeUniforms() {
    this.shell.device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array([
      this.windPhase,
      this.windStrength,
      this.baseHeight,
      0,
    ]));
  }
}

function scatterTufts(field: TerrainHeightField, bounds: BattleGrassBounds, count: number, seed: number): Float32Array {
  const data = new Float32Array(count * 8);
  if (count === 0) return data;
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * (bounds.width / Math.max(bounds.height, 0.001)))));
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = bounds.width / cols;
  const cellH = bounds.height / rows;
  let n = 0;
  for (let row = 0; row < rows && n < count; row++) {
    for (let col = 0; col < cols && n < count; col++) {
      const salt = seed + row * 4099 + col * 131;
      const x = bounds.x + (col + 0.16 + hash2(salt, 1) * 0.68) * cellW;
      const y = bounds.y + (row + 0.16 + hash2(salt, 2) * 0.68) * cellH;
      const z = terrainHeightAt(field, x, y);
      const scale = 0.82 + hash2(salt, 3) * 0.36;
      const yaw = hash2(salt, 4) * Math.PI * 2;
      const phase = hash2(salt, 5) * Math.PI * 2;
      const shade = hash2(salt, 6);
      const i = n * 8;
      data[i] = x;
      data[i + 1] = y;
      data[i + 2] = z;
      data[i + 3] = scale;
      data[i + 4] = yaw;
      data[i + 5] = phase;
      data[i + 6] = shade;
      data[i + 7] = 0;
      n++;
    }
  }
  return data;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

function hash2(x: number, y: number): number {
  let n = ((x * 374761393) | 0) + ((y * 668265263) | 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
