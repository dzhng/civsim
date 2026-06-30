import type { RawFrameShell, WorldRenderPass } from '../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';
import { compileShader } from '../../../renderer-core/src/compileShader';
import { gpuOpaqueColorTarget, gpuWorldDepthStencil } from '../../../renderer-core/src/pipelineContracts';
import { terrainHeightAt, type TerrainHeightField } from '../terrain/heightField';
import type { BattleGroundCover, BattleTerrainGrid } from './terrainFeatures';
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

export interface BattleGrassFocus {
  x: number;
  y: number;
  radius: number;
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
  zoomT?: number;
  focus?: BattleGrassFocus;
}

export interface BattleGrassStats {
  layer: 'battle-grass-instanced-blades';
  cover: BattleGroundCover;
  terrainMasked: boolean;
  zoomT: number;
  focusRadius: number;
  tuftInstances: number;
  bladeInstances: number;
  cappedTufts: number;
  density: number;
  maxTufts: number;
  eligibleCells: number;
  blockedTintCells: number;
  openGrassCells: number;
  forestCells: number;
  roughCells: number;
  invalidTintTufts: number;
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
  @location(4) terrainT: f32,
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
  let terrainT = clamp(instStyle.w, 0.0, 1.0);
  let shade = mix(0.86 + instStyle.z * 0.22, 0.94 + instStyle.z * 0.12, terrainT);
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
  out.terrainT = terrainT;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let warmKey = vec3f(1.04, 1.00, 0.88);
  let coolFill = vec3f(0.76, 0.80, 0.78);
  let grade = mix(coolFill, warmKey, clamp((in.light - 0.58) / 0.52, 0.0, 1.0));
  let strawTip = vec3f(0.62, 0.59, 0.36);
  let tipDry = smoothstep(0.62, 1.0, in.heightT) * 0.055;
  let lit = mix(in.color * in.light * grade, strawTip, tipDry);
  let terrainRoot = vec3f(0.42, 0.47, 0.25);
  let terrainTip = vec3f(0.62, 0.59, 0.35);
  let terrainStubble = mix(terrainRoot, terrainTip, smoothstep(0.12, 1.0, in.heightT));
  let col = mix(lit, terrainStubble, in.terrainT * 0.58);
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
  private terrainMasked = false;
  private zoomT = 1;
  private focusRadius = 0;
  private eligibleCells = 0;
  private blockedTintCells = 0;
  private openGrassCells = 0;
  private forestCells = 0;
  private roughCells = 0;
  private invalidTintTufts = 0;
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
    this.terrainMasked = false;
    this.zoomT = clamp01(merged.zoomT ?? 1);
    this.focusRadius = 0;
    this.eligibleCells = 0;
    this.blockedTintCells = 0;
    this.openGrassCells = 0;
    this.forestCells = 0;
    this.roughCells = 0;
    this.invalidTintTufts = 0;
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

  setTerrain(grid: BattleTerrainGrid, field: TerrainHeightField, cover: BattleGroundCover, params: BattleGrassParams = {}) {
    const merged = { ...DEFAULT_GRASS_PARAMS, ...params };
    const zoomT = clamp01(params.zoomT ?? 0.55);
    const tune = terrainGrassTuning(cover, zoomT);
    this.cover = cover;
    this.terrainMasked = true;
    this.zoomT = zoomT;
    this.density = Math.max(0, merged.density * tune.density);
    this.maxTufts = clampInt(merged.maxTufts * tune.maxTufts, 0, 20000);
    this.bladesPerTuft = clampInt(merged.bladesPerTuft, 1, 96);
    this.windPhase = merged.windPhase;
    this.windStrength = Math.max(0, merged.windStrength * tune.wind);
    this.baseHeight = Math.max(0.05, merged.bladeHeight * tune.height);

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

    const focus = params.focus ?? defaultGrassFocus(grid);
    this.focusRadius = Math.max(0, focus.radius);
    const cells = collectTerrainGrassCells(grid, focus);
    this.eligibleCells = cells.eligibleCells;
    this.blockedTintCells = cells.blockedTintCells;
    this.openGrassCells = cells.openGrassCells;
    this.forestCells = cells.forestCells;
    this.roughCells = cells.roughCells;
    const requested = this.density > 0 && cells.weightedArea > 0 ? Math.max(1, Math.ceil(cells.weightedArea * this.density)) : 0;
    const count = Math.min(requested, this.maxTufts);
    this.cappedTufts = Math.max(0, requested - count);
    const scattered = scatterTerrainTufts(grid, field, cells.cells, count, merged.seed);
    this.invalidTintTufts = scattered.invalidTintTufts;
    this.uploadInstances(scattered.instances);
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
      terrainMasked: this.terrainMasked,
      zoomT: this.zoomT,
      focusRadius: this.focusRadius,
      tuftInstances: this.tuftCount,
      bladeInstances: this.tuftCount * this.bladesPerTuft,
      cappedTufts: this.cappedTufts,
      density: this.density,
      maxTufts: this.maxTufts,
      eligibleCells: this.eligibleCells,
      blockedTintCells: this.blockedTintCells,
      openGrassCells: this.openGrassCells,
      forestCells: this.forestCells,
      roughCells: this.roughCells,
      invalidTintTufts: this.invalidTintTufts,
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

interface TerrainGrassCell {
  cx: number;
  cy: number;
  tint: number;
  weight: number;
  lod: number;
}

interface TerrainGrassCells {
  cells: TerrainGrassCell[];
  weightedArea: number;
  eligibleCells: number;
  blockedTintCells: number;
  openGrassCells: number;
  forestCells: number;
  roughCells: number;
}

function collectTerrainGrassCells(grid: BattleTerrainGrid, focus: BattleGrassFocus): TerrainGrassCells {
  const cells: TerrainGrassCell[] = [];
  let weightedArea = 0;
  let eligibleCells = 0;
  let blockedTintCells = 0;
  let openGrassCells = 0;
  let forestCells = 0;
  let roughCells = 0;
  const radius = Math.max(0, focus.radius);
  const fadeStart = radius * 0.62;
  const fadeEnd = Math.max(fadeStart + grid.cell, radius);
  const cellArea = grid.cell * grid.cell;
  for (let cy = 0; cy < grid.h; cy++) {
    for (let cx = 0; cx < grid.w; cx++) {
      const tint = grid.tint[cy * grid.w + cx] ?? 0;
      if (isBlockedGrassTint(tint)) {
        blockedTintCells++;
        continue;
      }
      const tintWeight = grassTintWeight(tint);
      if (tintWeight <= 0) continue;
      eligibleCells++;
      if (tint === 0) openGrassCells++;
      else if (tint === 4) forestCells++;
      else if (tint === 6) roughCells++;

      const x = grid.ox + (cx + 0.5) * grid.cell;
      const y = grid.oy + (cy + 0.5) * grid.cell;
      const dist = Math.hypot(x - focus.x, y - focus.y);
      const lod = radius > 0 ? 1 - smoothstepRange(fadeStart, fadeEnd, dist) : 1;
      if (lod <= 0.03) continue;
      const weight = tintWeight * lod;
      cells.push({ cx, cy, tint, weight, lod });
      weightedArea += weight * cellArea;
    }
  }
  return { cells, weightedArea, eligibleCells, blockedTintCells, openGrassCells, forestCells, roughCells };
}

function scatterTerrainTufts(
  grid: BattleTerrainGrid,
  field: TerrainHeightField,
  cells: TerrainGrassCell[],
  count: number,
  seed: number,
): { instances: Float32Array; invalidTintTufts: number } {
  const data = new Float32Array(count * 8);
  if (count === 0 || cells.length === 0) return { instances: data, invalidTintTufts: 0 };
  const totalWeight = cells.reduce((sum, cell) => sum + cell.weight, 0);
  if (totalWeight <= 0) return { instances: new Float32Array(), invalidTintTufts: 0 };

  let cursor = 0;
  let cumulative = cells[0].weight;
  let invalidTintTufts = 0;
  for (let n = 0; n < count; n++) {
    const target = ((n + hash2(seed, n + 17)) / count) * totalWeight;
    while (cursor < cells.length - 1 && target > cumulative) {
      cursor++;
      cumulative += cells[cursor].weight;
    }
    const cell = cells[cursor];
    if (isBlockedGrassTint(cell.tint)) invalidTintTufts++;
    const salt = seed + n * 7919 + cell.cx * 151 + cell.cy * 313;
    const x = grid.ox + (cell.cx + 0.12 + hash2(salt, 1) * 0.76) * grid.cell;
    const y = grid.oy + (cell.cy + 0.12 + hash2(salt, 2) * 0.76) * grid.cell;
    const z = terrainHeightAt(field, x, y);
    const tintScale = cell.tint === 6 ? 0.64 : cell.tint === 4 ? 0.78 : 1;
    const distanceScale = 0.54 + cell.lod * 0.46;
    const scale = (0.76 + hash2(salt, 3) * 0.34) * tintScale * distanceScale;
    const yaw = hash2(salt, 4) * Math.PI * 2;
    const phase = hash2(salt, 5) * Math.PI * 2;
    const shade = 0.85 + hash2(salt, 6) * 0.85;
    const i = n * 8;
    data[i] = x;
    data[i + 1] = y;
    data[i + 2] = z;
    data[i + 3] = scale;
    data[i + 4] = yaw;
    data[i + 5] = phase;
    data[i + 6] = shade;
    data[i + 7] = 1;
  }
  return { instances: data, invalidTintTufts };
}

function defaultGrassFocus(grid: BattleTerrainGrid): BattleGrassFocus {
  const width = grid.w * grid.cell;
  const height = grid.h * grid.cell;
  return {
    x: grid.ox + width * 0.5,
    y: grid.oy + height * 0.5,
    radius: Math.max(width, height) * 0.75,
  };
}

function terrainGrassTuning(cover: BattleGroundCover, zoomT: number) {
  const coverTune = cover === 'green-grass'
    ? { density: 1, height: 1, maxTufts: 1, wind: 1 }
    : cover === 'yellow-grass'
      ? { density: 0.74, height: 0.84, maxTufts: 0.86, wind: 0.92 }
      : cover === 'scrub-grass'
        ? { density: 0.50, height: 0.72, maxTufts: 0.72, wind: 0.86 }
        : { density: 0.12, height: 0.48, maxTufts: 0.36, wind: 0.72 };
  return {
    density: coverTune.density * (0.20 + zoomT * 0.80),
    height: coverTune.height * (0.50 + zoomT * 0.50),
    maxTufts: coverTune.maxTufts * (0.34 + zoomT * 0.66),
    wind: coverTune.wind * (0.58 + zoomT * 0.42),
  };
}

function grassTintWeight(tint: number): number {
  if (tint === 0) return 1;
  if (tint === 4) return 0.40;
  if (tint === 6) return 0.16;
  return 0;
}

function isBlockedGrassTint(tint: number): boolean {
  return tint === 1 || tint === 2 || tint === 3 || tint === 5;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function smoothstepRange(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash2(x: number, y: number): number {
  let n = ((x * 374761393) | 0) + ((y * 668265263) | 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
