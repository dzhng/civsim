import type { RawFrameShell, WorldRenderPass } from '../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';
import { compileShader } from '../../../renderer-core/src/compileShader';
import { gpuOpaqueColorTarget, gpuWorldDepthStencil } from '../../../renderer-core/src/pipelineContracts';
import { terrainHeightAt, type TerrainHeightField } from '../terrain/heightField';
import { battleGrassTintWeight, isBattleGrassBlockedTint, type BattleGroundCover, type BattleTerrainGrid } from './terrainFeatures';
import type { GrassFieldRecord, GrassFieldSnapshot } from './grassField';
import {
  DEFAULT_GRASS_TUFT_BLADES,
  SLICE00_GRASS_ALBEDO,
  buildGrassTuftMesh,
  grassTuftStats,
  type GrassAccentStyle,
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
  yaw?: number;
  depthNear?: number;
  depthFar?: number;
  nearBoost?: number;
  farWeight?: number;
}

export type GrassAccentAggregation = 'record' | 'clump' | 'field-cell' | 'field-near' | 'field-subcell';
export type GrassFiberShellVariant = 'off' | 'normal' | 'visibility' | 'width' | 'lift' | 'view-thickness';
export type TextureVolumeProfile = 'current' | 'seated-soft' | 'overlap-stagger' | 'broken-lattice';
export type TextureVolumeRenderModel = 'opaque-card' | 'alpha-cutout' | 'hard-cutout' | 'dither-cutout' | 'sparse-dither';
export type GrassPrimitiveFamily =
  | 'legacy-tuft'
  | 'root-shadow'
  | 'soft-root-mass'
  | 'soft-root-fiber'
  | 'field-fiber-shell'
  | 'field-fiber-body'
  | 'field-fiber-bundle'
  | 'alpha-impostor'
  | 'billboard-cluster'
  | 'volume-card'
  | 'texture-volume'
  | 'texture-carrier'
  | 'texture-micro-carrier'
  | 'fiber-ribbon'
  | 'hybrid-root-fiber';

export interface BattleGrassParams {
  seed?: number;
  density?: number;
  maxTufts?: number;
  accentMaxClumps?: number;
  bladesPerTuft?: number;
  bladeHeight?: number;
  bladeWidth?: number;
  bend?: number;
  spread?: number;
  windPhase?: number;
  windStrength?: number;
  zoomT?: number;
  focus?: BattleGrassFocus;
  accentDepthNear?: number;
  accentDepthFar?: number;
  surfaceBlend?: number;
  accentStyle?: GrassAccentStyle;
  accentAggregation?: GrassAccentAggregation;
  accentClumpFootprint?: number;
  accentMicroSourcesPerCell?: number;
  fiberShellVariant?: GrassFiberShellVariant;
  grassPrimitiveFamily?: GrassPrimitiveFamily;
  grassPrimitiveBaseline?: string;
  textureVolumeProfile?: TextureVolumeProfile;
  textureVolumeRenderModel?: TextureVolumeRenderModel;
}

export interface BattleGrassStats {
  layer: 'battle-grass-instanced-blades';
  prepMode: 'legacy-scatter' | 'packed-field';
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
  submittedTriangles: number;
  drawCalls: number;
  packedStrideFloats: number;
  fieldRecordStrideFloats: number;
  instanceBytes: number;
  fieldRecords: number;
  fieldRejectedSlopeCells: number;
  accentTufts: number;
  accentRibbons: number;
  accentRibbonDepthNear: number;
  accentRibbonDepthFar: number;
  accentDepthNear: number;
  accentDepthFar: number;
  accentSurfaceBlend: number;
  accentStyle: GrassAccentStyle;
  accentAggregation: GrassAccentAggregation;
  accentSourceRecords: number;
  accentClumps: number;
  accentClumpFootprint: number;
  fiberShellSourceRecords: number;
  fiberShellRecords: number;
  fiberShellRibbons: number;
  fiberShellDepthNear: number;
  fiberShellDepthFar: number;
  fiberShellSelectedRatio: number;
  fiberShellSubmittedTriangles: number;
  fiberShellVariant: GrassFiberShellVariant;
  grassPrimitiveFamily: GrassPrimitiveFamily;
  grassPrimitiveSourceRecords: number;
  grassPrimitiveSourceTopology: GrassAccentAggregation;
  grassPrimitiveSourceCells: number;
  grassPrimitiveSourcesPerCell: number;
  grassPrimitiveSourceFixedLab: boolean;
  grassPrimitiveRecords: number;
  grassPrimitiveClumps: number;
  grassPrimitiveDepthNear: number;
  grassPrimitiveDepthFar: number;
  grassPrimitiveTextureWidth: number;
  grassPrimitiveTextureHeight: number;
  grassPrimitiveTextureTiles: number;
  grassPrimitiveTextureBytes: number;
  grassPrimitiveMicroCards: number;
  textureVolumeProfile: TextureVolumeProfile;
  textureVolumeRenderModel: TextureVolumeRenderModel;
  grassPrimitiveBaseline: string;
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

const GRASS_ALBEDO_ROOT = wgslVec3(SLICE00_GRASS_ALBEDO.root);
const GRASS_ALBEDO_SHADOW = wgslVec3(SLICE00_GRASS_ALBEDO.shadow);
const GRASS_ALBEDO_NEAR = wgslVec3(SLICE00_GRASS_ALBEDO.near);
const GRASS_INSTANCE_STRIDE_FLOATS = 16;
const GRASS_INSTANCE_STRIDE_BYTES = GRASS_INSTANCE_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const GRASS_UNIFORM_FLOATS = 8;
const GRASS_VOLUME_ATLAS_TILE_SIZE = 64;
const GRASS_VOLUME_ATLAS_TILES = 4;
const GRASS_VOLUME_ATLAS_WIDTH = GRASS_VOLUME_ATLAS_TILE_SIZE * GRASS_VOLUME_ATLAS_TILES;
const GRASS_VOLUME_ATLAS_HEIGHT = GRASS_VOLUME_ATLAS_TILE_SIZE;

const GRASS_WGSL = `
${WORLD_CAMERA_WGSL}
struct GrassUniform {
  windPhase: f32,
  windStrength: f32,
  baseHeight: f32,
  baseWidth: f32,
  textureRenderModel: f32,
  textureCutoutBias: f32,
  textureDitherScale: f32,
  texturePadding: f32,
};
@group(1) @binding(0) var<uniform> grass: GrassUniform;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
  @location(1) alpha: f32,
  @location(2) light: f32,
  @location(3) heightT: f32,
  @location(4) terrainT: f32,
  @location(5) fog: f32,
};

@vertex
fn vs(
  @location(0) local: vec3f,
  @location(1) normal: vec3f,
  @location(2) colorAndAlpha: vec4f,
  @location(3) instPose: vec4f,
  @location(4) instBlade: vec4f,
  @location(5) instOrient: vec4f,
  @location(6) instNormal: vec4f,
) -> VsOut {
  let terrainT = clamp(instPose.w, 0.0, 1.0);
  let bladeWidth = max(instBlade.x, 0.001);
  let bladeHeight = max(instBlade.y, 0.001);
  let yaw = instOrient.x;
  let phase = instBlade.w;
  let terrainN = normalize(vec3f(instNormal.x, instNormal.y, max(instNormal.z, 0.0001)));
  let slopeAlive = clamp(instNormal.w, 0.0, 1.0);
  let shade = mix(0.86 + instOrient.w * 0.22, 0.94 + instOrient.w * 0.12, terrainT);
  let cy = cos(yaw);
  let sy = sin(yaw);
  let heightT = clamp(local.z / max(grass.baseHeight, 0.001), 0.0, 1.0);
  let wind = sin(grass.windPhase + phase + local.z * 4.7 + instPose.x * 0.045 + instPose.y * 0.036);
  let sway = wind * grass.windStrength * heightT * heightT * bladeHeight * slopeAlive;
  let lx = local.x * (bladeWidth / max(grass.baseWidth, 0.001)) * slopeAlive;
  let ly = local.y * (bladeWidth / max(grass.baseWidth, 0.001)) * slopeAlive;
  let rlx = lx * cy - ly * sy;
  let rly = lx * sy + ly * cy;
  let slopeZ = -(terrainN.x * rlx + terrainN.y * rly) / max(terrainN.z, 0.18);
  let growthT = smoothstep(0.08, 1.0, heightT);
  let growthDir = normalize(mix(terrainN, vec3f(0.0, 0.0, 1.0), growthT * 0.86));
  let world = vec3f(instPose.x + rlx + sway * 0.72, instPose.y + rly + sway * 0.24, instPose.z + slopeZ) + growthDir * (local.z * bladeHeight / max(grass.baseHeight, 0.001) * slopeAlive);
  let rnormal = normalize(vec3f(normal.x * cy - normal.y * sy, normal.x * sy + normal.y * cy, normal.z));
  let tiltedNormal = normalize(mix(terrainN, rnormal, 0.38 + heightT * 0.48));
  var out: VsOut;
  out.pos = projectWorld3d(world, civsimBattleWorldDepth3d(world));
  let sun = normalize(vec3f(-0.38, -0.26, 0.89));
  out.light = clamp(dot(tiltedNormal, sun) * 0.28 + 0.82, 0.58, 1.10);
  out.color = colorAndAlpha.rgb * shade;
  out.alpha = colorAndAlpha.a;
  out.heightT = heightT;
  out.terrainT = terrainT;
  let axes = cameraSpace(world.xy);
  out.fog = smoothstep(620.0, 1650.0, axes.y) * 0.64;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let warmKey = vec3f(1.04, 1.00, 0.88);
  let coolFill = vec3f(0.76, 0.80, 0.78);
  let grade = mix(coolFill, warmKey, clamp((in.light - 0.58) / 0.52, 0.0, 1.0));
  let strawTip = ${GRASS_ALBEDO_NEAR};
  let tipDry = smoothstep(0.62, 1.0, in.heightT) * 0.055 * (1.0 - in.terrainT * 0.82);
  let lit = mix(in.color * in.light * grade, strawTip, tipDry);
  let terrainRoot = ${GRASS_ALBEDO_ROOT};
  let terrainMid = ${GRASS_ALBEDO_SHADOW};
  let terrainTip = ${GRASS_ALBEDO_NEAR};
  var terrainStubble = mix(terrainRoot, terrainTip, smoothstep(0.12, 1.0, in.heightT));
  terrainStubble = mix(terrainStubble, terrainMid, 0.18);
  var col = mix(lit, terrainStubble, in.terrainT * 0.58);
  let overcastMeadow = vec3f(0.58, 0.66, 0.48);
  col = mix(col, overcastMeadow, 0.20 + in.terrainT * 0.55);
  let haze = vec3f(0.78, 0.82, 0.78);
  col = mix(col, haze, in.fog);
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), in.alpha);
}`;

const TEXTURED_GRASS_WGSL = `
${WORLD_CAMERA_WGSL}
struct GrassUniform {
  windPhase: f32,
  windStrength: f32,
  baseHeight: f32,
  baseWidth: f32,
  textureRenderModel: f32,
  textureCutoutBias: f32,
  textureDitherScale: f32,
  texturePadding: f32,
};
@group(1) @binding(0) var<uniform> grass: GrassUniform;
@group(1) @binding(1) var grassSampler: sampler;
@group(1) @binding(2) var grassAtlas: texture_2d<f32>;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) tile: f32,
  @location(2) alpha: f32,
  @location(3) light: f32,
  @location(4) heightT: f32,
  @location(5) terrainT: f32,
  @location(6) fog: f32,
  @location(7) dither: f32,
  @location(8) carrierT: f32,
};

fn hash31(p: vec3f) -> f32 {
  let q = fract(p * 0.1031);
  let r = q + dot(q, q.yzx + vec3f(33.33));
  return fract((r.x + r.y) * r.z);
}

@vertex
fn vs(
  @location(0) local: vec3f,
  @location(1) normal: vec3f,
  @location(2) uvTileAlpha: vec4f,
  @location(3) instPose: vec4f,
  @location(4) instBlade: vec4f,
  @location(5) instOrient: vec4f,
  @location(6) instNormal: vec4f,
) -> VsOut {
  let terrainT = clamp(instPose.w, 0.0, 1.0);
  let bladeWidth = max(instBlade.x, 0.001);
  let bladeHeight = max(instBlade.y, 0.001);
  let yaw = instOrient.x;
  let phase = instBlade.w;
  let terrainN = normalize(vec3f(instNormal.x, instNormal.y, max(instNormal.z, 0.0001)));
  let slopeAlive = clamp(instNormal.w, 0.0, 1.0);
  let cy = cos(yaw);
  let sy = sin(yaw);
  let heightT = clamp(local.z / max(grass.baseHeight, 0.001), 0.0, 1.0);
  let wind = sin(grass.windPhase + phase + local.z * 3.2 + instPose.x * 0.034 + instPose.y * 0.041);
  let sway = wind * grass.windStrength * heightT * heightT * bladeHeight * slopeAlive;
  let lx = local.x * (bladeWidth / max(grass.baseWidth, 0.001)) * slopeAlive;
  let ly = local.y * (bladeWidth / max(grass.baseWidth, 0.001)) * slopeAlive;
  let rlx = lx * cy - ly * sy;
  let rly = lx * sy + ly * cy;
  let slopeZ = -(terrainN.x * rlx + terrainN.y * rly) / max(terrainN.z, 0.20);
  let growthT = smoothstep(0.05, 1.0, heightT);
  let growthDir = normalize(mix(terrainN, vec3f(0.0, 0.0, 1.0), 0.55 + growthT * 0.38));
  let world = vec3f(instPose.x + rlx + sway * 0.55, instPose.y + rly + sway * 0.18, instPose.z + slopeZ)
    + growthDir * (local.z * bladeHeight / max(grass.baseHeight, 0.001) * slopeAlive);
  let rnormal = normalize(vec3f(normal.x * cy - normal.y * sy, normal.x * sy + normal.y * cy, normal.z));
  let tiltedNormal = normalize(mix(terrainN, rnormal, 0.40 + heightT * 0.42));
  var out: VsOut;
  out.pos = projectWorld3d(world, civsimBattleWorldDepth3d(world));
  let tileWidth = 1.0 / ${GRASS_VOLUME_ATLAS_TILES.toFixed(1)};
  let tileRaw = floor(uvTileAlpha.z + instOrient.y);
  let tile = clamp(tileRaw - floor(tileRaw / ${GRASS_VOLUME_ATLAS_TILES.toFixed(1)}) * ${GRASS_VOLUME_ATLAS_TILES.toFixed(1)}, 0.0, ${Math.max(0, GRASS_VOLUME_ATLAS_TILES - 1).toFixed(1)});
  out.uv = vec2f((tile + clamp(uvTileAlpha.x, 0.0, 1.0)) * tileWidth, clamp(uvTileAlpha.y, 0.0, 1.0));
  out.tile = tile;
  out.alpha = uvTileAlpha.w;
  let sun = normalize(vec3f(-0.38, -0.26, 0.89));
  out.light = clamp(dot(tiltedNormal, sun) * 0.24 + 0.84, 0.62, 1.08);
  out.heightT = heightT;
  out.terrainT = terrainT;
  let axes = cameraSpace(world.xy);
  out.fog = smoothstep(620.0, 1650.0, axes.y) * 0.64;
  out.dither = hash31(vec3f(world.xy * 0.47, instOrient.z * 0.00017 + uvTileAlpha.z));
  out.carrierT = smoothstep(0.82, 0.96, instOrient.w);
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let tex = textureSample(grassAtlas, grassSampler, in.uv);
  let alpha = tex.a * in.alpha * mix(1.0, 1.18, in.carrierT);
  let model = grass.textureRenderModel;
  let coverageLow = mix(0.012 + in.dither * 0.010, 0.006 + in.dither * 0.006, in.carrierT);
  let coverageHigh = mix(0.20 + in.dither * 0.035, 0.115 + in.dither * 0.020, in.carrierT);
  var coverage = smoothstep(coverageLow, coverageHigh, alpha);
  var cutoutThreshold = mix(0.012, 0.006, in.carrierT);
  if (model > 0.5 && model < 1.5) {
    cutoutThreshold = mix(0.050, 0.034, in.carrierT) + grass.textureCutoutBias;
    coverage = smoothstep(cutoutThreshold, cutoutThreshold + 0.095, alpha);
  }
  if (model >= 1.5 && model < 2.5) {
    cutoutThreshold = mix(0.120, 0.082, in.carrierT) + grass.textureCutoutBias;
    coverage = smoothstep(cutoutThreshold, cutoutThreshold + 0.070, alpha);
  }
  if (model >= 2.5 && model < 3.5) {
    cutoutThreshold = mix(0.012, 0.008, in.carrierT) + in.dither * grass.textureDitherScale + grass.textureCutoutBias;
    coverage = smoothstep(0.018, 0.145, alpha);
  }
  if (model >= 3.5) {
    cutoutThreshold = mix(0.028, 0.018, in.carrierT) + in.dither * grass.textureDitherScale + grass.textureCutoutBias;
    coverage = smoothstep(0.035, 0.165, alpha);
  }
  if (alpha < cutoutThreshold || coverage < mix(0.012, 0.006, in.carrierT)) {
    discard;
  }
  let rootShade = smoothstep(0.0, 0.34, in.heightT);
  let warmKey = vec3f(1.03, 1.00, 0.90);
  let coolFill = vec3f(0.78, 0.82, 0.79);
  let grade = mix(coolFill, warmKey, clamp((in.light - 0.62) / 0.46, 0.0, 1.0));
  let overcastMeadow = vec3f(0.58, 0.66, 0.48);
  var grassCol = tex.rgb * in.light * grade;
  grassCol = mix(grassCol * vec3f(0.55, 0.62, 0.48), grassCol, rootShade);
  let cardBase = overcastMeadow * (0.80 + rootShade * 0.10);
  var col = mix(cardBase, grassCol, coverage);
  if (model > 0.5) {
    let cutoutRoot = mix(overcastMeadow * 0.64, grassCol, rootShade);
    col = mix(cutoutRoot, grassCol, coverage);
  }
  col = mix(col, overcastMeadow, select((1.0 - coverage) * (0.10 + in.terrainT * 0.18), 0.0, model > 0.5) + in.terrainT * mix(0.18, 0.30, in.carrierT));
  let haze = vec3f(0.78, 0.82, 0.78);
  col = mix(col, haze, in.fog);
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}`;

export class BattleGrassPass {
  private pipeline: GPURenderPipeline;
  private grassBindGroupLayout: GPUBindGroupLayout;
  private grassBindGroup: GPUBindGroup;
  private texturedPipeline: GPURenderPipeline;
  private texturedBindGroupLayout: GPUBindGroupLayout;
  private texturedBindGroup: GPUBindGroup;
  private atlasTexture: GPUTexture;
  private atlasSampler: GPUSampler;
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
  private prepMode: BattleGrassStats['prepMode'] = 'legacy-scatter';
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
  private baseWidth = DEFAULT_GRASS_PARAMS.bladeWidth;
  private fieldRecordStrideFloats = 0;
  private fieldRecords = 0;
  private fieldRejectedSlopeCells = 0;
  private accentTufts = 0;
  private accentRibbons = 0;
  private accentDepthNear = 0;
  private accentDepthFar = 0;
  private accentSurfaceBlend = 0;
  private accentStyle: GrassAccentStyle = 'tuft';
  private accentAggregation: GrassAccentAggregation = 'record';
  private accentSourceRecords = 0;
  private accentClumps = 0;
  private accentClumpFootprint = 1;
  private fiberShellSourceRecords = 0;
  private fiberShellRecords = 0;
  private fiberShellRibbons = 0;
  private fiberShellDepthNear = 0;
  private fiberShellDepthFar = 0;
  private fiberShellSelectedRatio = 0;
  private fiberShellVariant: GrassFiberShellVariant = 'off';
  private grassPrimitiveFamily: GrassPrimitiveFamily = 'legacy-tuft';
  private grassPrimitiveBaseline = 'none';
  private grassPrimitiveSourceTopology: GrassAccentAggregation = 'record';
  private grassPrimitiveSourceCells = 0;
  private grassPrimitiveSourcesPerCell = 1;
  private grassPrimitiveSourceFixedLab = false;
  private grassPrimitiveTextureWidth = 0;
  private grassPrimitiveTextureHeight = 0;
  private grassPrimitiveTextureTiles = 0;
  private grassPrimitiveTextureBytes = 0;
  private textureVolumeProfile: TextureVolumeProfile = 'current';
  private textureVolumeRenderModel: TextureVolumeRenderModel = 'opaque-card';

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = compileShader(device, GRASS_WGSL, 'battle-grass');
    const texturedModule = compileShader(device, TEXTURED_GRASS_WGSL, 'battle-grass-texture-volume');
    this.grassBindGroupLayout = device.createBindGroupLayout({
      label: 'battle-grass-uniform-layout',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    this.texturedBindGroupLayout = device.createBindGroupLayout({
      label: 'battle-grass-texture-volume-layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
      ],
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
            arrayStride: GRASS_INSTANCE_STRIDE_BYTES,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 3, offset: 0, format: 'float32x4' },
              { shaderLocation: 4, offset: 16, format: 'float32x4' },
              { shaderLocation: 5, offset: 32, format: 'float32x4' },
              { shaderLocation: 6, offset: 48, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'fs', targets: [gpuOpaqueColorTarget(shell.info.format)] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: gpuWorldDepthStencil('read-write', 'less-equal'),
    });
    this.texturedPipeline = device.createRenderPipeline({
      label: 'battle-grass-texture-volume-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout, this.texturedBindGroupLayout] }),
      vertex: {
        module: texturedModule,
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
            arrayStride: GRASS_INSTANCE_STRIDE_BYTES,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 3, offset: 0, format: 'float32x4' },
              { shaderLocation: 4, offset: 16, format: 'float32x4' },
              { shaderLocation: 5, offset: 32, format: 'float32x4' },
              { shaderLocation: 6, offset: 48, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: { module: texturedModule, entryPoint: 'fs', targets: [gpuOpaqueColorTarget(shell.info.format)] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: gpuWorldDepthStencil('read-write', 'less-equal'),
    });
    this.uniformBuffer = device.createBuffer({
      label: 'battle-grass-uniforms',
      size: GRASS_UNIFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const atlas = generateGrassVolumeAtlas(0x6a551);
    this.atlasTexture = device.createTexture({
      label: 'battle-grass-volume-atlas',
      size: { width: atlas.width, height: atlas.height, depthOrArrayLayers: 1 },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: this.atlasTexture },
      atlas.data,
      { bytesPerRow: atlas.width * 4, rowsPerImage: atlas.height },
      { width: atlas.width, height: atlas.height, depthOrArrayLayers: 1 },
    );
    this.atlasSampler = device.createSampler({
      label: 'battle-grass-volume-atlas-sampler',
      minFilter: 'linear',
      magFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.grassBindGroup = device.createBindGroup({
      label: 'battle-grass-uniform-bind-group',
      layout: this.grassBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
    this.texturedBindGroup = device.createBindGroup({
      label: 'battle-grass-texture-volume-bind-group',
      layout: this.texturedBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.atlasSampler },
        { binding: 2, resource: this.atlasTexture.createView() },
      ],
    });
    this.instanceBuffer = device.createBuffer({
      label: 'battle-grass-empty-instances',
      size: GRASS_INSTANCE_STRIDE_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.writeUniforms();
  }

  setField(field: TerrainHeightField, bounds: BattleGrassBounds, cover: BattleGroundCover, params: BattleGrassParams = {}) {
    const merged = { ...DEFAULT_GRASS_PARAMS, ...params };
    this.cover = cover;
    this.prepMode = 'legacy-scatter';
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
    this.bladesPerTuft = clampInt(merged.bladesPerTuft, 0, 96);
    this.windPhase = merged.windPhase;
    this.windStrength = Math.max(0, merged.windStrength);
    this.baseHeight = Math.max(0.05, merged.bladeHeight);
    this.baseWidth = Math.max(0.001, merged.bladeWidth);
    this.fieldRecordStrideFloats = 0;
    this.fieldRecords = 0;
    this.fieldRejectedSlopeCells = 0;
    this.accentTufts = 0;
    this.accentRibbons = 0;
    this.accentDepthNear = 0;
    this.accentDepthFar = 0;
    this.accentSurfaceBlend = 0;
    this.accentStyle = 'tuft';
    this.accentAggregation = 'record';
    this.accentSourceRecords = 0;
    this.accentClumps = 0;
    this.accentClumpFootprint = 1;
    this.fiberShellSourceRecords = 0;
    this.fiberShellRecords = 0;
    this.fiberShellRibbons = 0;
    this.fiberShellDepthNear = 0;
    this.fiberShellDepthFar = 0;
    this.fiberShellSelectedRatio = 0;
    this.fiberShellVariant = 'off';
    this.grassPrimitiveFamily = 'legacy-tuft';
    this.grassPrimitiveBaseline = 'none';
    this.grassPrimitiveSourceTopology = 'record';
    this.grassPrimitiveSourceCells = 0;
    this.grassPrimitiveSourcesPerCell = 1;
    this.grassPrimitiveSourceFixedLab = false;
    this.clearGrassPrimitiveTextureStats();
    this.textureVolumeProfile = 'current';
    this.textureVolumeRenderModel = 'opaque-card';

    const meshOptions: GrassTuftOptions = {
      seed: merged.seed,
      blades: this.bladesPerTuft,
      height: this.baseHeight,
      width: merged.bladeWidth,
      bend: merged.bend,
      spread: merged.spread,
      palette: cover,
      accentStyle: 'tuft',
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
    this.uploadInstances(scatterTufts(field, bounds, count, merged.seed, {
      baseHeight: this.baseHeight,
      baseWidth: this.baseWidth,
      baseBend: merged.bend,
      terrainT: 0,
    }));
    this.writeUniforms();
  }

  setTerrain(grid: BattleTerrainGrid, field: TerrainHeightField, cover: BattleGroundCover, params: BattleGrassParams = {}) {
    const merged = { ...DEFAULT_GRASS_PARAMS, ...params };
    const zoomT = clamp01(params.zoomT ?? 0.55);
    const tune = terrainGrassTuning(cover, zoomT);
    this.cover = cover;
    this.prepMode = 'legacy-scatter';
    this.terrainMasked = true;
    this.zoomT = zoomT;
    this.density = Math.max(0, merged.density * tune.density);
    this.maxTufts = clampInt(merged.maxTufts * tune.maxTufts, 0, 96000);
    this.bladesPerTuft = clampInt(merged.bladesPerTuft * tune.bladesPerTuft, 1, 96);
    this.windPhase = merged.windPhase;
    this.windStrength = Math.max(0, merged.windStrength * tune.wind);
    this.baseHeight = Math.max(0.05, merged.bladeHeight * tune.height);
    this.baseWidth = Math.max(0.001, merged.bladeWidth * tune.width);
    this.fieldRecordStrideFloats = 0;
    this.fieldRecords = 0;
    this.fieldRejectedSlopeCells = 0;
    this.accentTufts = 0;
    this.accentRibbons = 0;
    this.accentDepthNear = 0;
    this.accentDepthFar = 0;
    this.accentSurfaceBlend = 0;
    this.accentStyle = 'tuft';
    this.accentAggregation = 'record';
    this.accentSourceRecords = 0;
    this.accentClumps = 0;
    this.accentClumpFootprint = 1;
    this.fiberShellSourceRecords = 0;
    this.fiberShellRecords = 0;
    this.fiberShellRibbons = 0;
    this.fiberShellDepthNear = 0;
    this.fiberShellDepthFar = 0;
    this.fiberShellSelectedRatio = 0;
    this.fiberShellVariant = 'off';
    this.grassPrimitiveFamily = 'legacy-tuft';
    this.grassPrimitiveBaseline = 'none';
    this.grassPrimitiveSourceTopology = 'record';
    this.grassPrimitiveSourceCells = 0;
    this.grassPrimitiveSourcesPerCell = 1;
    this.grassPrimitiveSourceFixedLab = false;
    this.clearGrassPrimitiveTextureStats();
    this.textureVolumeProfile = 'current';
    this.textureVolumeRenderModel = 'opaque-card';

    const meshOptions: GrassTuftOptions = {
      seed: merged.seed,
      blades: this.bladesPerTuft,
      height: this.baseHeight,
      width: this.baseWidth,
      bend: merged.bend,
      spread: merged.spread * tune.spread,
      palette: cover,
      accentStyle: 'tuft',
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
    const scattered = scatterTerrainTufts(grid, field, cells.cells, count, merged.seed, tune, {
      baseHeight: this.baseHeight,
      baseWidth: this.baseWidth,
      baseBend: merged.bend,
      terrainT: tune.surfaceBlend,
    });
    this.invalidTintTufts = scattered.invalidTintTufts;
    this.uploadInstances(scattered.instances);
    this.writeUniforms();
  }

  setGrassFieldSnapshot(snapshot: GrassFieldSnapshot, cover: BattleGroundCover, params: BattleGrassParams = {}) {
    const merged = { ...DEFAULT_GRASS_PARAMS, ...params };
    this.cover = cover;
    this.prepMode = 'packed-field';
    this.terrainMasked = true;
    this.zoomT = clamp01(merged.zoomT ?? 1);
    this.focusRadius = Math.max(0, merged.focus?.radius ?? snapshot.stats.snapCellSize);
    this.density = snapshot.stats.acceptedRecords / Math.max(1, snapshot.stats.candidateCells);
    this.maxTufts = snapshot.stats.recordCapacity;
    this.bladesPerTuft = clampInt(merged.bladesPerTuft, 0, 96);
    this.windPhase = merged.windPhase;
    this.windStrength = Math.max(0, merged.windStrength);
    this.baseHeight = Math.max(0.05, merged.bladeHeight);
    this.baseWidth = Math.max(0.001, merged.bladeWidth);
    this.eligibleCells = snapshot.stats.candidateCells;
    this.blockedTintCells = snapshot.stats.rejectedTintCells;
    this.openGrassCells = snapshot.stats.openGrassCells;
    this.forestCells = snapshot.stats.forestCells;
    this.roughCells = snapshot.stats.roughCells;
    this.invalidTintTufts = 0;
    this.cappedTufts = snapshot.stats.cappedRecords;
    this.fieldRecordStrideFloats = snapshot.stats.packedStrideFloats;
    this.fieldRecords = snapshot.records.length;
    this.fieldRejectedSlopeCells = snapshot.stats.rejectedSlopeCells;
    this.accentDepthNear = Number.isFinite(params.accentDepthNear)
      ? params.accentDepthNear!
      : Number.isFinite(merged.focus?.depthNear)
        ? merged.focus!.depthNear!
        : 0;
    this.accentDepthFar = Number.isFinite(params.accentDepthFar)
      ? params.accentDepthFar!
      : Number.isFinite(merged.focus?.depthFar)
        ? merged.focus!.depthFar!
        : 0;
    this.accentSurfaceBlend = clamp01(Number.isFinite(params.surfaceBlend) ? params.surfaceBlend! : 0);
    const requestedAccentStyle = params.accentStyle ?? 'tuft';
    const requestedFiberShellVariant = params.fiberShellVariant ?? (requestedAccentStyle === 'field-fiber-shell-visibility' ? 'visibility' : 'normal');
    this.accentStyle = requestedFiberShellVariant === 'visibility' && requestedAccentStyle === 'field-fiber-shell'
      ? 'field-fiber-shell-visibility'
      : requestedAccentStyle;
    const fieldFiberShell = isFieldFiberShellStyle(this.accentStyle);
    this.grassPrimitiveFamily = params.grassPrimitiveFamily ?? grassPrimitiveFamilyForStyle(this.accentStyle);
    this.grassPrimitiveBaseline = params.grassPrimitiveBaseline ?? (this.grassPrimitiveFamily === 'field-fiber-shell' ? 'none' : 'field-fiber-shell-normal');
    this.textureVolumeProfile = this.grassPrimitiveFamily === 'texture-volume' ? params.textureVolumeProfile ?? 'current' : 'current';
    this.textureVolumeRenderModel = this.grassPrimitiveFamily === 'texture-volume'
      ? params.textureVolumeRenderModel ?? 'opaque-card'
      : 'opaque-card';
    this.fiberShellVariant = fieldFiberShell
      ? requestedFiberShellVariant === 'off'
        ? 'off'
        : this.accentStyle === 'field-fiber-shell-visibility' || requestedFiberShellVariant === 'visibility'
          ? 'visibility'
          : requestedFiberShellVariant
      : 'off';
    this.clearGrassPrimitiveTextureStats();
    const requestedAggregation = params.accentAggregation === 'field-cell'
      ? 'field-cell'
      : params.accentAggregation === 'clump'
      ? 'clump'
      : params.accentAggregation === 'field-subcell'
      ? 'field-subcell'
      : params.accentAggregation === 'field-near'
        ? 'field-near'
        : 'record';
    const canAggregateClumps = this.bladesPerTuft > 0
      && isClumpAccentStyle(this.accentStyle)
      && requestedAggregation === 'clump';
    const textureFamily = isTextureGrassPrimitiveFamily(this.grassPrimitiveFamily);
    const bodyFiberFamily = isFieldFiberBodyPrimitiveFamily(this.grassPrimitiveFamily);
    const canAggregateFieldCells = this.bladesPerTuft > 0
      && textureFamily
      && requestedAggregation === 'field-cell';
    const canAggregateFieldSubcells = this.bladesPerTuft > 0
      && bodyFiberFamily
      && requestedAggregation === 'field-subcell';
    this.accentAggregation = fieldFiberShell && this.bladesPerTuft > 0
      ? 'field-near'
      : canAggregateFieldCells
        ? 'field-cell'
        : canAggregateFieldSubcells
          ? 'field-subcell'
        : canAggregateClumps
          ? 'clump'
          : 'record';
    this.accentClumpFootprint = Math.max(0.25, Number.isFinite(params.accentClumpFootprint) ? params.accentClumpFootprint! : 1);
    this.fiberShellSourceRecords = 0;
    this.fiberShellRecords = 0;
    this.fiberShellRibbons = 0;
    this.fiberShellDepthNear = 0;
    this.fiberShellDepthFar = 0;
    this.fiberShellSelectedRatio = 0;
    this.grassPrimitiveSourceTopology = this.accentAggregation;
    this.grassPrimitiveSourceCells = 0;
    this.grassPrimitiveSourcesPerCell = 1;
    this.grassPrimitiveSourceFixedLab = false;
    const requestedBudget = Number.isFinite(params.maxTufts)
      ? clampInt(params.maxTufts!, 0, 96000)
      : snapshot.records.length;
    const explicitBudget = this.accentAggregation === 'field-subcell'
      ? requestedBudget
      : Math.min(requestedBudget, snapshot.records.length);
    if (this.accentAggregation === 'field-subcell') this.maxTufts = requestedBudget;
    let selectedRecords: GrassFieldRecord[];
    if (this.bladesPerTuft <= 0) {
      selectedRecords = snapshot.records;
      this.accentTufts = 0;
      this.accentSourceRecords = 0;
      this.accentClumps = 0;
      this.accentAggregation = 'record';
      this.accentClumpFootprint = 1;
    } else if (fieldFiberShell) {
      const sourceRecords = accentRecordCandidates(snapshot.records, merged.focus, params);
      const shellSourceRecords = this.fiberShellVariant === 'off'
        ? []
        : selectAccentRecords(sourceRecords, merged.focus, explicitBudget, params);
      selectedRecords = fieldFiberShellRecords(shellSourceRecords, merged.focus, this.accentDepthNear, this.accentDepthFar, this.fiberShellVariant);
      this.accentTufts = selectedRecords.length;
      this.accentSourceRecords = sourceRecords.length;
      this.accentClumps = 0;
      this.accentClumpFootprint = 1;
      this.fiberShellSourceRecords = sourceRecords.length;
      this.fiberShellRecords = selectedRecords.length;
      this.fiberShellRibbons = selectedRecords.length * fieldFiberShellRibbonCount(this.bladesPerTuft);
      this.fiberShellDepthNear = this.accentDepthNear;
      this.fiberShellDepthFar = this.accentDepthFar;
      this.fiberShellSelectedRatio = sourceRecords.length > 0 ? selectedRecords.length / sourceRecords.length : 0;
    } else if (canAggregateFieldSubcells) {
      const sourceRecords = accentRecordCandidates(snapshot.records, merged.focus, params);
      const maxCells = Number.isFinite(params.accentMaxClumps)
        ? clampInt(params.accentMaxClumps!, 0, sourceRecords.length)
        : Math.min(sourceRecords.length, Math.max(1, Math.ceil(explicitBudget / 8)));
      const microSourcesPerCell = clampInt(params.accentMicroSourcesPerCell ?? 7, 1, 12);
      const recordBudget = Math.min(explicitBudget, maxCells * microSourcesPerCell);
      const aggregated = aggregateFieldCellAccentRecords(sourceRecords, merged.focus, params, maxCells, {
        baseHeight: this.baseHeight,
        baseWidth: this.baseWidth,
        baseBend: merged.bend,
        footprint: this.accentClumpFootprint,
        footprintScale: this.grassPrimitiveFamily === 'field-fiber-bundle' ? 0.82 : 0.70,
        vertical: true,
        jitter: this.accentClumpFootprint * (this.grassPrimitiveFamily === 'field-fiber-bundle' ? 0.42 : 0.58),
        jitterMin: 0.18,
        yawJitter: this.grassPrimitiveFamily === 'field-fiber-bundle' ? 1.20 : 1.80,
        widthScale: this.grassPrimitiveFamily === 'field-fiber-bundle' ? 0.72 : 0.62,
        heightScale: this.grassPrimitiveFamily === 'field-fiber-bundle' ? 0.78 : 0.72,
        copyOffsetScale: this.grassPrimitiveFamily === 'field-fiber-bundle' ? 1.10 : 1.38,
        maxCopies: microSourcesPerCell,
        recordBudget,
        fixedCopies: true,
      });
      selectedRecords = aggregated.records;
      this.accentTufts = selectedRecords.length;
      this.accentSourceRecords = sourceRecords.length;
      this.accentClumps = aggregated.clumps;
      this.grassPrimitiveSourceCells = aggregated.clumps;
      this.grassPrimitiveSourcesPerCell = microSourcesPerCell;
      this.grassPrimitiveSourceFixedLab = true;
    } else if (canAggregateFieldCells) {
      const sourceRecords = accentRecordCandidates(snapshot.records, merged.focus, params);
      const maxCells = Number.isFinite(params.accentMaxClumps)
        ? clampInt(params.accentMaxClumps!, 0, sourceRecords.length)
        : explicitBudget;
      const carrier = this.grassPrimitiveFamily === 'texture-carrier';
      const microCarrier = this.grassPrimitiveFamily === 'texture-micro-carrier';
      const aggregated = aggregateFieldCellAccentRecords(sourceRecords, merged.focus, params, maxCells, {
        baseHeight: this.baseHeight,
        baseWidth: this.baseWidth,
        baseBend: merged.bend,
        footprint: this.accentClumpFootprint,
        footprintScale: microCarrier ? 0.58 : carrier ? 1.52 : textureVolumeProfileFootprintScale(this.textureVolumeProfile),
        vertical: true,
        jitter: this.accentClumpFootprint * (microCarrier ? 0.66 : carrier ? 0.31 : textureVolumeProfileJitter(this.textureVolumeProfile)),
        jitterMin: microCarrier ? 0.12 : carrier ? 0.05 : textureVolumeProfileJitterMin(this.textureVolumeProfile),
        yawJitter: microCarrier ? 1.75 : carrier ? 0.54 : textureVolumeProfileYawJitter(this.textureVolumeProfile),
        widthScale: microCarrier ? 0.58 : carrier ? 1.32 : textureVolumeProfileWidthScale(this.textureVolumeProfile),
        heightScale: microCarrier ? 0.62 : carrier ? 0.54 : textureVolumeProfileHeightScale(this.textureVolumeProfile),
        copyOffsetScale: microCarrier ? 1.55 : carrier ? 0.38 : textureVolumeProfileCopyOffsetScale(this.textureVolumeProfile),
        maxCopies: microCarrier ? 4 : carrier ? 1 : textureVolumeProfileMaxCopies(this.textureVolumeProfile),
        recordBudget: Math.min(explicitBudget, maxCells * (microCarrier ? 4 : carrier ? 1 : textureVolumeProfileMaxCopies(this.textureVolumeProfile))),
        carrier: carrier || microCarrier,
        microCarrier,
      });
      selectedRecords = aggregated.records;
      this.accentTufts = selectedRecords.length;
      this.accentSourceRecords = sourceRecords.length;
      this.accentClumps = aggregated.clumps;
    } else if (canAggregateClumps) {
      const sourceRecords = accentRecordCandidates(snapshot.records, merged.focus, params);
      const maxClumps = Number.isFinite(params.accentMaxClumps)
        ? clampInt(params.accentMaxClumps!, 0, sourceRecords.length)
        : explicitBudget;
      const aggregated = aggregateClumpAccentRecords(sourceRecords, merged.focus, params, maxClumps, {
        baseHeight: this.baseHeight,
        baseWidth: this.baseWidth,
        baseBend: merged.bend,
        footprint: this.accentClumpFootprint,
        vertical: isVerticalClumpAccentStyle(this.accentStyle),
      });
      selectedRecords = aggregated.records;
      this.accentTufts = selectedRecords.length;
      this.accentSourceRecords = sourceRecords.length;
      this.accentClumps = aggregated.clumps;
    } else {
      selectedRecords = selectAccentRecords(snapshot.records, merged.focus, explicitBudget, params);
      this.accentTufts = selectedRecords.length;
      this.accentSourceRecords = selectedRecords.length;
      this.accentClumps = 0;
      this.accentClumpFootprint = 1;
    }
    this.accentRibbons = this.bladesPerTuft > 0 && this.accentStyle === 'soft-root-fiber'
      ? selectedRecords.length * softRootFiberRibbonCount(this.bladesPerTuft)
      : this.bladesPerTuft > 0 && fieldFiberShell
        ? this.fiberShellRibbons
      : 0;

    if (this.bladesPerTuft > 0) {
      const meshOptions: GrassTuftOptions = {
        seed: merged.seed,
        blades: this.bladesPerTuft,
        height: this.baseHeight,
        width: this.baseWidth,
        bend: merged.bend,
        spread: merged.spread,
        palette: cover,
        accentStyle: this.accentStyle,
      };
      const mesh = textureFamily
        ? buildTextureBackedGrassVolumeMesh(this.baseHeight, this.baseWidth, merged.seed, this.bladesPerTuft, textureGrassVolumeMode(this.grassPrimitiveFamily), this.textureVolumeProfile)
        : buildGrassTuftMesh(meshOptions);
      const meshStats = grassTuftStats(mesh, this.bladesPerTuft);
      this.meshVertices = meshStats.opaqueVertices;
      this.meshTriangles = meshStats.opaqueTriangles;
      this.uploadMesh(mesh.opaque.vertices, mesh.opaque.indices);
      if (textureFamily) this.setGrassPrimitiveTextureStats();
    } else {
      this.meshVertices = 0;
      this.meshTriangles = 0;
      this.indexCount = 0;
      this.clearGrassPrimitiveTextureStats();
    }
    this.uploadInstances(grassFieldInstances(selectedRecords, this.baseHeight, this.baseWidth, merged.bend, {
      focus: merged.focus,
      accentDepthNear: this.accentDepthNear,
      accentDepthFar: this.accentDepthFar,
      surfaceBlend: this.accentSurfaceBlend,
      fadeWithDepth: this.bladesPerTuft > 0,
    }));
    this.writeUniforms();
  }

  setWindPhase(phase: number) {
    this.windPhase = phase;
    this.writeUniforms();
  }

  draw(pass: WorldRenderPass) {
    if (!this.vertexBuffer || !this.indexBuffer || this.indexCount === 0 || this.tuftCount === 0) return;
    const textured = isTextureGrassPrimitiveFamily(this.grassPrimitiveFamily);
    pass.setPipeline(textured ? this.texturedPipeline : this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setBindGroup(1, textured ? this.texturedBindGroup : this.grassBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint16');
    pass.drawIndexed(this.indexCount, this.tuftCount);
  }

  stats(): BattleGrassStats {
    return {
      layer: 'battle-grass-instanced-blades',
      prepMode: this.prepMode,
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
      submittedTriangles: this.meshTriangles * this.tuftCount,
      drawCalls: this.tuftCount > 0 && this.indexCount > 0 ? 1 : 0,
      packedStrideFloats: GRASS_INSTANCE_STRIDE_FLOATS,
      fieldRecordStrideFloats: this.fieldRecordStrideFloats,
      instanceBytes: this.tuftCount * GRASS_INSTANCE_STRIDE_BYTES,
      fieldRecords: this.fieldRecords,
      fieldRejectedSlopeCells: this.fieldRejectedSlopeCells,
      accentTufts: this.accentTufts,
      accentRibbons: this.accentRibbons,
      accentRibbonDepthNear: this.accentRibbons > 0 ? this.accentDepthNear : 0,
      accentRibbonDepthFar: this.accentRibbons > 0 ? this.accentDepthFar : 0,
      accentDepthNear: this.accentDepthNear,
      accentDepthFar: this.accentDepthFar,
      accentSurfaceBlend: this.accentSurfaceBlend,
      accentStyle: this.accentStyle,
      accentAggregation: this.accentAggregation,
      accentSourceRecords: this.accentSourceRecords,
      accentClumps: this.accentClumps,
      accentClumpFootprint: this.accentClumpFootprint,
      fiberShellSourceRecords: this.fiberShellSourceRecords,
      fiberShellRecords: this.fiberShellRecords,
      fiberShellRibbons: this.fiberShellRibbons,
      fiberShellDepthNear: this.fiberShellSourceRecords > 0 ? this.fiberShellDepthNear : 0,
      fiberShellDepthFar: this.fiberShellSourceRecords > 0 ? this.fiberShellDepthFar : 0,
      fiberShellSelectedRatio: this.fiberShellSelectedRatio,
      fiberShellSubmittedTriangles: this.fiberShellRecords * this.meshTriangles,
      fiberShellVariant: this.fiberShellVariant,
      grassPrimitiveFamily: this.grassPrimitiveFamily,
      grassPrimitiveSourceRecords: this.accentSourceRecords,
      grassPrimitiveSourceTopology: this.grassPrimitiveSourceTopology,
      grassPrimitiveSourceCells: this.grassPrimitiveSourceCells,
      grassPrimitiveSourcesPerCell: this.grassPrimitiveSourcesPerCell,
      grassPrimitiveSourceFixedLab: this.grassPrimitiveSourceFixedLab,
      grassPrimitiveRecords: this.accentTufts,
      grassPrimitiveClumps: this.accentClumps,
      grassPrimitiveDepthNear: this.accentTufts > 0 ? this.accentDepthNear : 0,
      grassPrimitiveDepthFar: this.accentTufts > 0 ? this.accentDepthFar : 0,
      grassPrimitiveTextureWidth: this.grassPrimitiveTextureWidth,
      grassPrimitiveTextureHeight: this.grassPrimitiveTextureHeight,
      grassPrimitiveTextureTiles: this.grassPrimitiveTextureTiles,
      grassPrimitiveTextureBytes: this.grassPrimitiveTextureBytes,
      grassPrimitiveMicroCards: this.grassPrimitiveFamily === 'texture-micro-carrier'
        ? this.tuftCount * Math.floor(this.meshTriangles / 2)
        : 0,
      textureVolumeProfile: this.textureVolumeProfile,
      textureVolumeRenderModel: this.textureVolumeRenderModel,
      grassPrimitiveBaseline: this.grassPrimitiveBaseline,
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
    const count = instances.length / GRASS_INSTANCE_STRIDE_FLOATS;
    this.tuftCount = count;
    if (count > this.instanceCapacity) {
      this.instanceCapacity = Math.max(count, this.instanceCapacity * 2, 128);
      this.instanceBuffer = this.shell.device.createBuffer({
        label: 'battle-grass-instances',
        size: this.instanceCapacity * GRASS_INSTANCE_STRIDE_BYTES,
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
      this.baseWidth,
      textureVolumeRenderModelCode(this.textureVolumeRenderModel),
      textureVolumeRenderModelCutoutBias(this.textureVolumeRenderModel),
      textureVolumeRenderModelDitherScale(this.textureVolumeRenderModel),
      0,
    ]));
  }

  private setGrassPrimitiveTextureStats() {
    this.grassPrimitiveTextureWidth = GRASS_VOLUME_ATLAS_WIDTH;
    this.grassPrimitiveTextureHeight = GRASS_VOLUME_ATLAS_HEIGHT;
    this.grassPrimitiveTextureTiles = GRASS_VOLUME_ATLAS_TILES;
    this.grassPrimitiveTextureBytes = GRASS_VOLUME_ATLAS_WIDTH * GRASS_VOLUME_ATLAS_HEIGHT * 4;
  }

  private clearGrassPrimitiveTextureStats() {
    this.grassPrimitiveTextureWidth = 0;
    this.grassPrimitiveTextureHeight = 0;
    this.grassPrimitiveTextureTiles = 0;
    this.grassPrimitiveTextureBytes = 0;
  }
}

interface GrassInstanceDefaults {
  baseHeight: number;
  baseWidth: number;
  baseBend: number;
  terrainT: number;
}

type TextureGrassVolumeMode = 'volume' | 'carrier' | 'micro-carrier';

function textureGrassVolumeMode(family: GrassPrimitiveFamily): TextureGrassVolumeMode {
  if (family === 'texture-micro-carrier') return 'micro-carrier';
  if (family === 'texture-carrier') return 'carrier';
  return 'volume';
}

function buildTextureBackedGrassVolumeMesh(
  baseHeight: number,
  baseWidth: number,
  seed: number,
  blades: number,
  mode: TextureGrassVolumeMode = 'volume',
  profile: TextureVolumeProfile = 'current',
) {
  const carrier = mode === 'carrier';
  const microCarrier = mode === 'micro-carrier';
  const repairedVolume = !carrier && !microCarrier && profile !== 'current';
  const cards = microCarrier
    ? Math.max(3, Math.min(4, blades + 2))
    : carrier
      ? Math.max(6, Math.min(8, blades + 4))
      : repairedVolume
        ? textureVolumeProfileCards(profile, blades)
        : Math.max(8, Math.min(10, blades * 2 + 2));
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < cards; i++) {
    const groups = microCarrier ? 4 : carrier ? 3 : textureVolumeProfileGroups(profile);
    const group = i % groups;
    const localYaw = (group / groups) * Math.PI + (hash2(seed + i * 17, 3) - 0.5) * (
      microCarrier ? 0.80 : carrier ? 0.28 : textureVolumeProfileLocalYawJitter(profile)
    );
    const rightX = Math.cos(localYaw);
    const rightY = Math.sin(localYaw);
    const normal: [number, number, number] = [-rightY, rightX, microCarrier ? 0.28 : carrier ? 0.38 : textureVolumeProfileNormalZ(profile)];
    const normalLen = Math.hypot(normal[0], normal[1], normal[2]) || 1;
    normal[0] /= normalLen;
    normal[1] /= normalLen;
    normal[2] /= normalLen;
    const centerOffset = (i - (cards - 1) * 0.5) / Math.max(1, cards - 1);
    const widthNoise = hash2(seed + i, 5);
    const halfWidth = baseWidth
      * (microCarrier ? 2.1 + widthNoise * 0.9 : carrier ? 8.8 + widthNoise * 3.2 : textureVolumeProfileMeshWidth(profile, widthNoise))
      * (1 - Math.abs(centerOffset) * (microCarrier ? 0.22 : carrier ? 0.08 : 0.14));
    const height = baseHeight * (microCarrier ? 0.54 + hash2(seed + i, 7) * 0.22 : carrier ? 0.44 + hash2(seed + i, 7) * 0.20 : textureVolumeProfileMeshHeight(profile, hash2(seed + i, 7)));
    const zLift = baseHeight * (microCarrier ? 0.004 + hash2(seed + i, 11) * 0.010 : carrier ? 0.006 + hash2(seed + i, 11) * 0.016 : textureVolumeProfileZLift(profile, hash2(seed + i, 11)));
    const lateral = baseWidth * centerOffset * (microCarrier ? 1.55 : carrier ? 6.9 : 4.8);
    const forward = baseWidth * (hash2(seed + i, 13) - 0.5) * (microCarrier ? 1.35 : carrier ? 3.6 : 2.2);
    const centerX = -rightY * forward + rightX * lateral;
    const centerY = rightX * forward + rightY * lateral;
    const leanX = (hash2(seed + i, 19) - 0.5) * baseWidth * (microCarrier ? 1.65 : carrier ? 1.4 : 2.1);
    const leanY = (hash2(seed + i, 23) - 0.5) * baseWidth * (microCarrier ? 1.35 : carrier ? 1.0 : 1.45);
    const p0: [number, number, number] = [centerX - rightX * halfWidth, centerY - rightY * halfWidth, zLift];
    const p1: [number, number, number] = [centerX + rightX * halfWidth, centerY + rightY * halfWidth, zLift];
    const topWidthScale = microCarrier ? 0.48 : carrier ? 0.90 : textureVolumeProfileTopWidth(profile, hash2(seed + i, 31));
    const p2: [number, number, number] = [centerX + rightX * halfWidth * topWidthScale + leanX, centerY + rightY * halfWidth * topWidthScale + leanY, zLift + height];
    const p3: [number, number, number] = [centerX - rightX * halfWidth * topWidthScale + leanX, centerY - rightY * halfWidth * topWidthScale + leanY, zLift + height];
    const tile = i % GRASS_VOLUME_ATLAS_TILES;
    const alpha = microCarrier ? 0.84 + hash2(seed + i, 29) * 0.12 : carrier ? 0.56 + hash2(seed + i, 29) * 0.16 : textureVolumeProfileAlpha(profile, hash2(seed + i, 29));
    const rootAlpha = repairedVolume ? alpha * textureVolumeProfileRootAlpha(profile) : alpha;
    const topAlpha = repairedVolume ? alpha * textureVolumeProfileTopAlpha(profile, hash2(seed + i, 37)) : alpha;
    const base = vertices.length / 10;
    pushTextureVertex(vertices, p0, normal, 0.02, 0.98, tile, rootAlpha);
    pushTextureVertex(vertices, p1, normal, 0.98, 0.98, tile, rootAlpha);
    pushTextureVertex(vertices, p2, normal, 0.98, 0.02, tile, topAlpha);
    pushTextureVertex(vertices, p3, normal, 0.02, 0.02, tile, topAlpha);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    opaque: { vertices: new Float32Array(vertices), indices: new Uint16Array(indices), indexCount: indices.length },
    shadow: { vertices: new Float32Array(), indices: new Uint16Array(), indexCount: 0 },
  };
}

function textureVolumeProfileMaxCopies(profile: TextureVolumeProfile): number {
  if (profile === 'broken-lattice') return 3;
  return 2;
}

function textureVolumeProfileFootprintScale(profile: TextureVolumeProfile): number {
  if (profile === 'seated-soft') return 1.10;
  if (profile === 'overlap-stagger') return 1.28;
  if (profile === 'broken-lattice') return 0.92;
  return 0.78;
}

function textureVolumeProfileJitter(profile: TextureVolumeProfile): number {
  if (profile === 'seated-soft') return 0.14;
  if (profile === 'overlap-stagger') return 0.18;
  if (profile === 'broken-lattice') return 0.12;
  return 0.42;
}

function textureVolumeProfileJitterMin(profile: TextureVolumeProfile): number {
  if (profile === 'seated-soft') return 0.06;
  if (profile === 'overlap-stagger') return 0.10;
  if (profile === 'broken-lattice') return 0.04;
  return 0.18;
}

function textureVolumeProfileYawJitter(profile: TextureVolumeProfile): number {
  if (profile === 'seated-soft') return 0.84;
  if (profile === 'overlap-stagger') return 1.12;
  if (profile === 'broken-lattice') return 1.46;
  return 1.15;
}

function textureVolumeProfileWidthScale(profile: TextureVolumeProfile): number {
  if (profile === 'seated-soft') return 0.76;
  if (profile === 'overlap-stagger') return 0.84;
  if (profile === 'broken-lattice') return 0.64;
  return 0.60;
}

function textureVolumeProfileHeightScale(profile: TextureVolumeProfile): number {
  if (profile === 'seated-soft') return 0.62;
  if (profile === 'overlap-stagger') return 0.66;
  if (profile === 'broken-lattice') return 0.54;
  return 0.96;
}

function textureVolumeProfileCopyOffsetScale(profile: TextureVolumeProfile): number {
  if (profile === 'seated-soft') return 0.28;
  if (profile === 'overlap-stagger') return 0.52;
  if (profile === 'broken-lattice') return 0.42;
  return 0.95;
}

function textureVolumeProfileCards(profile: TextureVolumeProfile, blades: number): number {
  if (profile === 'seated-soft') return Math.max(10, Math.min(12, blades * 2 + 4));
  if (profile === 'overlap-stagger') return Math.max(12, Math.min(14, blades * 3 + 2));
  if (profile === 'broken-lattice') return Math.max(12, Math.min(16, blades * 3 + 4));
  return Math.max(8, Math.min(10, blades * 2 + 2));
}

function textureVolumeProfileGroups(profile: TextureVolumeProfile): number {
  if (profile === 'broken-lattice') return 7;
  if (profile === 'overlap-stagger') return 6;
  return 4;
}

function textureVolumeProfileLocalYawJitter(profile: TextureVolumeProfile): number {
  if (profile === 'seated-soft') return 0.62;
  if (profile === 'overlap-stagger') return 0.92;
  if (profile === 'broken-lattice') return 1.18;
  return 0.46;
}

function textureVolumeProfileNormalZ(profile: TextureVolumeProfile): number {
  if (profile === 'seated-soft') return 0.24;
  if (profile === 'overlap-stagger') return 0.20;
  if (profile === 'broken-lattice') return 0.18;
  return 0.16;
}

function textureVolumeProfileMeshWidth(profile: TextureVolumeProfile, noise: number): number {
  if (profile === 'seated-soft') return 4.6 + noise * 1.8;
  if (profile === 'overlap-stagger') return 5.2 + noise * 2.4;
  if (profile === 'broken-lattice') return 3.8 + noise * 1.8;
  return 4.8 + noise * 2.1;
}

function textureVolumeProfileMeshHeight(profile: TextureVolumeProfile, noise: number): number {
  if (profile === 'seated-soft') return 0.48 + noise * 0.18;
  if (profile === 'overlap-stagger') return 0.44 + noise * 0.24;
  if (profile === 'broken-lattice') return 0.36 + noise * 0.20;
  return 0.68 + noise * 0.32;
}

function textureVolumeProfileZLift(profile: TextureVolumeProfile, noise: number): number {
  if (profile === 'seated-soft') return noise * 0.006;
  if (profile === 'overlap-stagger') return noise * 0.010;
  if (profile === 'broken-lattice') return noise * 0.004;
  return 0.014 + noise * 0.026;
}

function textureVolumeProfileTopWidth(profile: TextureVolumeProfile, noise: number): number {
  if (profile === 'seated-soft') return 0.54 + noise * 0.16;
  if (profile === 'overlap-stagger') return 0.42 + noise * 0.20;
  if (profile === 'broken-lattice') return 0.34 + noise * 0.18;
  return 0.72;
}

function textureVolumeProfileAlpha(profile: TextureVolumeProfile, noise: number): number {
  if (profile === 'seated-soft') return 0.86 + noise * 0.10;
  if (profile === 'overlap-stagger') return 0.84 + noise * 0.12;
  if (profile === 'broken-lattice') return 0.78 + noise * 0.12;
  return 0.82 + noise * 0.16;
}

function textureVolumeProfileRootAlpha(profile: TextureVolumeProfile): number {
  if (profile === 'broken-lattice') return 0.82;
  return 0.90;
}

function textureVolumeProfileTopAlpha(profile: TextureVolumeProfile, noise: number): number {
  if (profile === 'seated-soft') return 0.76 + noise * 0.14;
  if (profile === 'overlap-stagger') return 0.66 + noise * 0.18;
  if (profile === 'broken-lattice') return 0.58 + noise * 0.18;
  return 1;
}

function textureVolumeRenderModelCode(model: TextureVolumeRenderModel): number {
  if (model === 'alpha-cutout') return 1;
  if (model === 'hard-cutout') return 2;
  if (model === 'dither-cutout') return 3;
  if (model === 'sparse-dither') return 4;
  return 0;
}

function textureVolumeRenderModelCutoutBias(model: TextureVolumeRenderModel): number {
  if (model === 'alpha-cutout') return 0.006;
  if (model === 'hard-cutout') return 0.006;
  if (model === 'dither-cutout') return 0.002;
  if (model === 'sparse-dither') return 0.006;
  return 0;
}

function textureVolumeRenderModelDitherScale(model: TextureVolumeRenderModel): number {
  if (model === 'dither-cutout') return 0.080;
  if (model === 'sparse-dither') return 0.180;
  return 0;
}

function pushTextureVertex(
  vertices: number[],
  point: [number, number, number],
  normal: [number, number, number],
  u: number,
  v: number,
  tile: number,
  alpha: number,
) {
  vertices.push(point[0], point[1], point[2], normal[0], normal[1], normal[2], u, v, tile, alpha);
}

function generateGrassVolumeAtlas(seed: number): { data: Uint8Array; width: number; height: number; tiles: number } {
  const width = GRASS_VOLUME_ATLAS_WIDTH;
  const height = GRASS_VOLUME_ATLAS_HEIGHT;
  const data = new Uint8Array(width * height * 4);
  for (let tile = 0; tile < GRASS_VOLUME_ATLAS_TILES; tile++) {
    const ox = tile * GRASS_VOLUME_ATLAS_TILE_SIZE;
    const tileSeed = seed + tile * 0x1f4d;
    paintRootMist(data, width, ox, tileSeed);
    const washColor = mixRgb(SLICE00_GRASS_ALBEDO.shadow, SLICE00_GRASS_ALBEDO.near, 0.58 + hash2(tileSeed, 101) * 0.16);
    for (let y = 5; y < GRASS_VOLUME_ATLAS_TILE_SIZE - 2; y++) {
      const heightT = 1 - y / (GRASS_VOLUME_ATLAS_TILE_SIZE - 1);
      const body = smoothstepNumber(0.08, 0.72, heightT) * (1 - smoothstepNumber(0.82, 1.0, heightT));
      for (let x = 1; x < GRASS_VOLUME_ATLAS_TILE_SIZE - 1; x++) {
        const noise = hash2(tileSeed + x * 37, y * 53);
        if (noise < 0.67) continue;
        const lateralFade = 1 - Math.abs(x / (GRASS_VOLUME_ATLAS_TILE_SIZE - 1) - 0.5) * 0.34;
        const alpha = body * lateralFade * (0.006 + noise * 0.014);
        blendAtlasPixel(data, width, ox + x, y, scaleRgb(washColor, 0.78 + noise * 0.14), alpha);
      }
    }
    const strokes = 138 + Math.floor(hash2(tileSeed, 1) * 50);
    for (let i = 0; i < strokes; i++) {
      const salt = tileSeed + i * 7919;
      const rootX = ox + 2.5 + hash2(salt, 2) * (GRASS_VOLUME_ATLAS_TILE_SIZE - 5);
      const rootY = GRASS_VOLUME_ATLAS_TILE_SIZE - 1 - hash2(salt, 3) * 15;
      const reach = 18 + hash2(salt, 4) * 33;
      const tipY = Math.max(2, rootY - reach);
      const curve = (hash2(salt, 5) - 0.5) * (5.0 + hash2(salt, 6) * 11.0);
      const tipX = Math.max(ox + 1.5, Math.min(ox + GRASS_VOLUME_ATLAS_TILE_SIZE - 1.5, rootX + curve));
      const widthPx = 0.34 + hash2(salt, 7) * 0.86;
      const rootColor = scaleRgb(mixRgb(SLICE00_GRASS_ALBEDO.root, SLICE00_GRASS_ALBEDO.shadow, 0.22 + hash2(salt, 8) * 0.18), 0.58 + hash2(salt, 9) * 0.16);
      const tipMix = 0.26 + hash2(salt, 10) * 0.24;
      const tipColor = scaleRgb(mixRgb(SLICE00_GRASS_ALBEDO.shadow, SLICE00_GRASS_ALBEDO.near, tipMix), 0.64 + hash2(salt, 11) * 0.16);
      drawBladeStroke(data, width, height, rootX, rootY, tipX, tipY, widthPx, rootColor, tipColor, 0.13 + hash2(salt, 12) * 0.19);
      if (hash2(salt, 13) > 0.68) {
        const branchT = 0.34 + hash2(salt, 14) * 0.32;
        const branchX = rootX + (tipX - rootX) * branchT;
        const branchY = rootY + (tipY - rootY) * branchT;
        const side = hash2(salt, 15) > 0.5 ? 1 : -1;
        drawBladeStroke(
          data,
          width,
          height,
          branchX,
          branchY,
          Math.max(ox + 1.5, Math.min(ox + GRASS_VOLUME_ATLAS_TILE_SIZE - 1.5, branchX + side * (2.5 + hash2(salt, 16) * 5.0))),
          Math.max(3, branchY - (7 + hash2(salt, 17) * 11)),
          widthPx * 0.62,
          rootColor,
          tipColor,
          0.065 + hash2(salt, 18) * 0.075,
        );
      }
    }
  }
  return { data, width, height, tiles: GRASS_VOLUME_ATLAS_TILES };
}

function paintRootMist(data: Uint8Array, atlasWidth: number, ox: number, seed: number) {
  for (let y = 30; y < GRASS_VOLUME_ATLAS_TILE_SIZE; y++) {
    const ty = (y - 30) / (GRASS_VOLUME_ATLAS_TILE_SIZE - 30);
    for (let x = 0; x < GRASS_VOLUME_ATLAS_TILE_SIZE; x++) {
      const noise = hash2(seed + x * 17, y * 31);
      const lateral = 1 - Math.abs(x / GRASS_VOLUME_ATLAS_TILE_SIZE - 0.5) * 0.72;
      const alpha = lateral * ty * ty * (0.030 + noise * 0.038);
      const color = scaleRgb(mixRgb(SLICE00_GRASS_ALBEDO.root, SLICE00_GRASS_ALBEDO.shadow, 0.34), 0.52 + noise * 0.12);
      blendAtlasPixel(data, atlasWidth, ox + x, y, color, alpha);
    }
  }
}

function drawBladeStroke(
  data: Uint8Array,
  atlasWidth: number,
  atlasHeight: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  rootColor: readonly [number, number, number],
  tipColor: readonly [number, number, number],
  alpha: number,
) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - radius * 2));
  const maxX = Math.min(atlasWidth - 1, Math.ceil(Math.max(x0, x1) + radius * 2));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - radius * 2));
  const maxY = Math.min(atlasHeight - 1, Math.ceil(Math.max(y0, y1) + radius * 2));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = Math.max(0.0001, dx * dx + dy * dy);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = clamp01Number(((px - x0) * dx + (py - y0) * dy) / lenSq);
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      const dist = Math.hypot(px - cx, py - cy);
      const tipNarrow = 0.28 + (1 - t) * 0.72;
      const edge = 1 - smoothstepNumber(radius * tipNarrow, radius * tipNarrow + 0.92, dist);
      if (edge <= 0) continue;
      const color = mixRgb(rootColor, tipColor, t);
      const fade = Math.sin(t * Math.PI) * 0.32 + (1 - t) * 0.42 + 0.18;
      blendAtlasPixel(data, atlasWidth, x, y, color, alpha * edge * fade);
    }
  }
}

function blendAtlasPixel(data: Uint8Array, width: number, x: number, y: number, color: readonly [number, number, number], alpha: number) {
  const a = clamp01Number(alpha);
  if (a <= 0) return;
  const i = (y * width + x) * 4;
  const dstA = data[i + 3] / 255;
  const outA = a + dstA * (1 - a);
  const inv = outA > 0.0001 ? 1 / outA : 0;
  data[i] = Math.round(((color[0] * a + (data[i] / 255) * dstA * (1 - a)) * inv) * 255);
  data[i + 1] = Math.round(((color[1] * a + (data[i + 1] / 255) * dstA * (1 - a)) * inv) * 255);
  data[i + 2] = Math.round(((color[2] * a + (data[i + 2] / 255) * dstA * (1 - a)) * inv) * 255);
  data[i + 3] = Math.round(outA * 255);
}

function mixRgb(a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number] {
  const f = clamp01Number(t);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function scaleRgb(color: readonly [number, number, number], scale: number): [number, number, number] {
  return [
    clamp01Number(color[0] * scale),
    clamp01Number(color[1] * scale),
    clamp01Number(color[2] * scale),
  ];
}

function smoothstepNumber(edge0: number, edge1: number, value: number): number {
  const t = clamp01Number((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01Number(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

interface PackedGrassInstance {
  x: number;
  y: number;
  z: number;
  terrainT: number;
  width: number;
  height: number;
  bend: number;
  windPhase: number;
  yaw: number;
  clumpSeed: number;
  bladeSeed: number;
  shade: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  slopeMask: number;
}

function scatterTufts(field: TerrainHeightField, bounds: BattleGrassBounds, count: number, seed: number, defaults: GrassInstanceDefaults): Float32Array {
  const data = new Float32Array(count * GRASS_INSTANCE_STRIDE_FLOATS);
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
      writeGrassInstance(data, n, {
        x,
        y,
        z,
        terrainT: defaults.terrainT,
        width: defaults.baseWidth * scale,
        height: defaults.baseHeight * scale,
        bend: defaults.baseBend,
        windPhase: phase,
        yaw,
        clumpSeed: 0,
        bladeSeed: salt & 0x00ff_ffff,
        shade,
        normalX: 0,
        normalY: 0,
        normalZ: 1,
        slopeMask: 1,
      });
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
      if (isBattleGrassBlockedTint(tint)) {
        blockedTintCells++;
        continue;
      }
      const tintWeight = battleGrassTintWeight(tint);
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
      const weight = tintWeight * lod * depthDensityWeight(focus, x, y);
      cells.push({ cx, cy, tint, weight, lod });
      weightedArea += weight * cellArea;
    }
  }
  return { cells, weightedArea, eligibleCells, blockedTintCells, openGrassCells, forestCells, roughCells };
}

function depthDensityWeight(focus: BattleGrassFocus, x: number, y: number): number {
  if (
    focus.yaw === undefined
    || focus.depthNear === undefined
    || focus.depthFar === undefined
    || !Number.isFinite(focus.yaw)
    || !Number.isFinite(focus.depthNear)
    || !Number.isFinite(focus.depthFar)
    || focus.depthFar <= focus.depthNear
  ) {
    return 1;
  }
  const dx = x - focus.x;
  const dy = y - focus.y;
  const depth = -dx * Math.sin(focus.yaw) + dy * Math.cos(focus.yaw);
  const t = smoothstepRange(focus.depthNear, focus.depthFar, depth);
  const farWeight = Math.max(0, Math.min(1, focus.farWeight ?? 0.35));
  const nearBoost = Math.max(0, focus.nearBoost ?? 0.75);
  return (farWeight + (1 - farWeight) * (1 - t)) * (1 + nearBoost * (1 - t));
}

function scatterTerrainTufts(
  grid: BattleTerrainGrid,
  field: TerrainHeightField,
  cells: TerrainGrassCell[],
  count: number,
  seed: number,
  style: TerrainGrassTuning,
  defaults: GrassInstanceDefaults,
): { instances: Float32Array; invalidTintTufts: number } {
  const data = new Float32Array(count * GRASS_INSTANCE_STRIDE_FLOATS);
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
    if (isBattleGrassBlockedTint(cell.tint)) invalidTintTufts++;
    const salt = seed + n * 7919 + cell.cx * 151 + cell.cy * 313;
    const x = grid.ox + (cell.cx + 0.12 + hash2(salt, 1) * 0.76) * grid.cell;
    const y = grid.oy + (cell.cy + 0.12 + hash2(salt, 2) * 0.76) * grid.cell;
    const z = terrainHeightAt(field, x, y);
    const tintScale = cell.tint === 6 ? 0.64 : cell.tint === 4 ? 0.78 : 1;
    const distanceScale = 0.54 + cell.lod * 0.46;
    const vistaNear = style.vistaT * cell.lod;
    const scale = (0.76 + hash2(salt, 3) * 0.34) * tintScale * distanceScale * (1 + vistaNear * 0.42);
    const yaw = hash2(salt, 4) * Math.PI * 2;
    const phase = hash2(salt, 5) * Math.PI * 2;
    const shade = 0.85 + hash2(salt, 6) * 0.85;
    writeGrassInstance(data, n, {
      x,
      y,
      z,
      terrainT: defaults.terrainT,
      width: defaults.baseWidth * scale,
      height: defaults.baseHeight * scale,
      bend: defaults.baseBend,
      windPhase: phase,
      yaw,
      clumpSeed: cell.tint,
      bladeSeed: salt & 0x00ff_ffff,
      shade,
      normalX: 0,
      normalY: 0,
      normalZ: 1,
      slopeMask: 1,
    });
  }
  return { instances: data, invalidTintTufts };
}

interface GrassFieldInstanceOptions {
  focus?: BattleGrassFocus;
  accentDepthNear: number;
  accentDepthFar: number;
  surfaceBlend: number;
  fadeWithDepth: boolean;
}

interface ClumpAccentOptions {
  baseHeight: number;
  baseWidth: number;
  baseBend: number;
  footprint: number;
  footprintScale?: number;
  vertical?: boolean;
  jitter?: number;
  jitterMin?: number;
  yawJitter?: number;
  widthScale?: number;
  heightScale?: number;
  copyOffsetScale?: number;
  maxCopies?: number;
  recordBudget?: number;
  carrier?: boolean;
  microCarrier?: boolean;
  fixedCopies?: boolean;
}

interface ClumpAccumulator {
  key: string;
  seed: number;
  depthBin: number;
  count: number;
  weightSum: number;
  clumpWeightSum: number;
  x: number;
  y: number;
  z: number;
  worldCellX: number;
  worldCellY: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  width: number;
  height: number;
  bend: number;
  yawSin: number;
  yawCos: number;
  windSin: number;
  windCos: number;
  depthFadeSum: number;
  depthSum: number;
  lateralSum: number;
  lateralSignedSum: number;
  tint: number;
  lodTier: GrassFieldRecord['lodTier'];
}

interface ScoredFieldCell {
  acc: ClumpAccumulator;
  score: number;
  depthT: number;
  signedLateral: number;
}

function grassFieldInstances(records: readonly GrassFieldRecord[], baseHeight: number, baseWidth: number, baseBend: number, options: GrassFieldInstanceOptions): Float32Array {
  const data = new Float32Array(records.length * GRASS_INSTANCE_STRIDE_FLOATS);
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const depthFade = options.fadeWithDepth ? accentDepthFade(record, options.focus, options.accentDepthNear, options.accentDepthFar) : 1;
    const widthScale = 0.74 + depthFade * 0.26;
    const heightScale = 0.48 + depthFade * 0.52;
    writeGrassInstance(data, i, {
      x: record.x,
      y: record.y,
      z: record.z,
      terrainT: options.surfaceBlend,
      width: Math.max(0.001, (Number.isFinite(record.width) ? record.width : baseWidth) * widthScale),
      height: Math.max(0.01, (Number.isFinite(record.height) ? record.height : baseHeight) * heightScale),
      bend: Math.max(0, Number.isFinite(record.bend) ? record.bend : baseBend),
      windPhase: record.windPhase,
      yaw: record.yaw,
      clumpSeed: record.clumpSeed,
      bladeSeed: record.bladeSeed,
      shade: record.clumpWeight,
      normalX: record.normalX,
      normalY: record.normalY,
      normalZ: record.normalZ,
      slopeMask: smoothstepRange(0.48, 0.62, record.normalZ),
    });
  }
  return data;
}

function aggregateClumpAccentRecords(
  records: readonly GrassFieldRecord[],
  focus: BattleGrassFocus | undefined,
  params: BattleGrassParams,
  maxClumps: number,
  options: ClumpAccentOptions,
): { records: GrassFieldRecord[]; clumps: number } {
  if (records.length === 0 || maxClumps <= 0) return { records: [], clumps: 0 };
  const { depthNear, depthFar } = accentDepthBounds(focus, params);
  const hasDepthBins = focus && Number.isFinite(depthNear) && Number.isFinite(depthFar) && depthFar > depthNear;
  const clumps = new Map<string, ClumpAccumulator>();
  for (const record of records) {
    const depth = focusDepth(record, focus);
    const depthBin = hasDepthBins ? Math.floor(depth / 72) : 0;
    const key = `${record.clumpSeed}:${depthBin}`;
    const depthFade = accentDepthFade(record, focus, depthNear, depthFar);
    const weight = Math.max(0.05, record.clumpWeight) * (0.30 + depthFade * 0.70);
    const lateral = focus ? Math.hypot(record.x - focus.x, record.y - focus.y) / Math.max(1, focus.radius) : 0;
    let acc = clumps.get(key);
    if (!acc) {
      acc = {
        key,
        seed: record.clumpSeed,
        depthBin,
        count: 0,
        weightSum: 0,
        clumpWeightSum: 0,
        x: 0,
        y: 0,
        z: 0,
        worldCellX: 0,
        worldCellY: 0,
        normalX: 0,
        normalY: 0,
        normalZ: 0,
        width: 0,
        height: 0,
        bend: 0,
        yawSin: 0,
        yawCos: 0,
        windSin: 0,
        windCos: 0,
        depthFadeSum: 0,
        depthSum: 0,
        lateralSum: 0,
        lateralSignedSum: 0,
        tint: record.tint,
        lodTier: record.lodTier,
      };
      clumps.set(key, acc);
    }
    acc.count++;
    acc.weightSum += weight;
    acc.clumpWeightSum += record.clumpWeight;
    acc.x += record.x * weight;
    acc.y += record.y * weight;
    acc.z += record.z * weight;
    acc.worldCellX += record.worldCellX * weight;
    acc.worldCellY += record.worldCellY * weight;
    acc.normalX += record.normalX * weight;
    acc.normalY += record.normalY * weight;
    acc.normalZ += record.normalZ * weight;
    acc.width += record.width * weight;
    acc.height += record.height * weight;
    acc.bend += record.bend * weight;
    acc.yawSin += Math.sin(record.yaw) * weight;
    acc.yawCos += Math.cos(record.yaw) * weight;
    acc.windSin += Math.sin(record.windPhase) * weight;
    acc.windCos += Math.cos(record.windPhase) * weight;
    acc.depthFadeSum += depthFade;
    acc.depthSum += depth;
    acc.lateralSum += lateral;
    acc.lateralSignedSum += focusLateral(record, focus);
    if (record.lodTier < acc.lodTier) acc.lodTier = record.lodTier;
  }

  const scored = [...clumps.values()]
    .map((acc) => {
      const avgDepthFade = acc.depthFadeSum / Math.max(1, acc.count);
      const avgDepth = acc.depthSum / Math.max(1, acc.count);
      const depthT = Number.isFinite(depthNear) && Number.isFinite(depthFar) && depthFar > depthNear
        ? clamp01((avgDepth - depthNear) / Math.max(0.001, depthFar - depthNear))
        : 0;
      const lateral = acc.lateralSum / Math.max(1, acc.count);
      const score = acc.weightSum * 1.18
        + Math.sqrt(acc.count) * 0.82
        + avgDepthFade * 1.10
        - depthT * 0.32
        - lateral * 0.18
        + hash2(acc.seed, acc.depthBin + acc.count * 17) * 0.05;
      return { acc, score };
    })
    .sort((a, b) => (b.score - a.score) || (a.acc.seed - b.acc.seed) || a.acc.key.localeCompare(b.acc.key));

  const chosen = scored.slice(0, maxClumps);
  const out: GrassFieldRecord[] = [];
  for (const { acc } of chosen) {
    const copies = acc.count >= 8 ? 3 : acc.count >= 3 ? 2 : 1;
    for (let copy = 0; copy < copies; copy++) out.push(clumpAccumulatorRecord(acc, options, copy, copies));
  }
  return { records: out, clumps: chosen.length };
}

function aggregateFieldCellAccentRecords(
  records: readonly GrassFieldRecord[],
  focus: BattleGrassFocus | undefined,
  params: BattleGrassParams,
  maxCells: number,
  options: ClumpAccentOptions,
): { records: GrassFieldRecord[]; clumps: number } {
  if (records.length === 0 || maxCells <= 0) return { records: [], clumps: 0 };
  const { depthNear, depthFar } = accentDepthBounds(focus, params);
  const hasDepthBins = focus && Number.isFinite(depthNear) && Number.isFinite(depthFar) && depthFar > depthNear;
  const cellSize = Math.max(1.25, options.footprint);
  const cells = new Map<string, ClumpAccumulator>();
  for (const record of records) {
    const depth = focusDepth(record, focus);
    const cellX = Math.floor(record.x / cellSize);
    const cellY = Math.floor(record.y / cellSize);
    const depthBin = hasDepthBins ? Math.floor(depth / 34) : 0;
    const key = `${cellX}:${cellY}:${depthBin}`;
    const depthFade = accentDepthFade(record, focus, depthNear, depthFar);
    const nearWeight = 0.18 + depthFade * 0.82;
    const weight = Math.max(0.04, record.clumpWeight) * nearWeight;
    let acc = cells.get(key);
    if (!acc) {
      acc = {
        key,
        seed: ((cellX * 73856093) ^ (cellY * 19349663) ^ (depthBin * 83492791)) >>> 0,
        depthBin,
        count: 0,
        weightSum: 0,
        clumpWeightSum: 0,
        x: 0,
        y: 0,
        z: 0,
        worldCellX: 0,
        worldCellY: 0,
        normalX: 0,
        normalY: 0,
        normalZ: 0,
        width: 0,
        height: 0,
        bend: 0,
        yawSin: 0,
        yawCos: 0,
        windSin: 0,
        windCos: 0,
        depthFadeSum: 0,
        depthSum: 0,
        lateralSum: 0,
        lateralSignedSum: 0,
        tint: record.tint,
        lodTier: record.lodTier,
      };
      cells.set(key, acc);
    }
    const viewYaw = focus && Number.isFinite(focus.yaw) ? focus.yaw! + Math.PI * 0.5 : record.yaw;
    const yawSin = Math.sin(viewYaw) * 0.58 + Math.sin(record.yaw) * 0.42;
    const yawCos = Math.cos(viewYaw) * 0.58 + Math.cos(record.yaw) * 0.42;
    const lateral = focus ? Math.hypot(record.x - focus.x, record.y - focus.y) / Math.max(1, focus.radius) : 0;
    acc.count++;
    acc.weightSum += weight;
    acc.clumpWeightSum += record.clumpWeight;
    acc.x += record.x * weight;
    acc.y += record.y * weight;
    acc.z += record.z * weight;
    acc.worldCellX += record.worldCellX * weight;
    acc.worldCellY += record.worldCellY * weight;
    acc.normalX += record.normalX * weight;
    acc.normalY += record.normalY * weight;
    acc.normalZ += record.normalZ * weight;
    acc.width += record.width * weight;
    acc.height += record.height * weight;
    acc.bend += record.bend * weight;
    acc.yawSin += yawSin * weight;
    acc.yawCos += yawCos * weight;
    acc.windSin += Math.sin(record.windPhase) * weight;
    acc.windCos += Math.cos(record.windPhase) * weight;
    acc.depthFadeSum += depthFade;
    acc.depthSum += depth;
    acc.lateralSum += lateral;
    acc.lateralSignedSum += focusLateral(record, focus);
    if (record.lodTier < acc.lodTier) acc.lodTier = record.lodTier;
  }

  const scored: ScoredFieldCell[] = [...cells.values()]
    .map((acc) => {
      const avgDepthFade = acc.depthFadeSum / Math.max(1, acc.count);
      const avgDepth = acc.depthSum / Math.max(1, acc.count);
      const depthT = Number.isFinite(depthNear) && Number.isFinite(depthFar) && depthFar > depthNear
        ? clamp01((avgDepth - depthNear) / Math.max(0.001, depthFar - depthNear))
        : 0;
      const lateral = acc.lateralSum / Math.max(1, acc.count);
      const score = acc.weightSum * 1.45
        + Math.sqrt(acc.count) * 0.44
        + avgDepthFade * 0.82
        - depthT * 0.26
        - lateral * 0.12
        + hash2(acc.seed, acc.depthBin + acc.count * 11) * 0.04;
      return { acc, score, depthT, signedLateral: acc.lateralSignedSum / Math.max(1, acc.count) };
    })
    .sort((a, b) => (b.score - a.score) || (a.acc.seed - b.acc.seed) || a.acc.key.localeCompare(b.acc.key));

  const chosen = selectDistributedFieldCells(scored, maxCells, focus);
  const maxCopies = Math.max(1, Math.min(12, clampInt(options.maxCopies ?? 1, 1, 12)));
  const recordBudget = Math.max(0, clampInt(options.recordBudget ?? chosen.length * maxCopies, 0, chosen.length * maxCopies));
  const out: GrassFieldRecord[] = [];
  for (const { acc } of chosen) {
    if (out.length >= recordBudget) break;
    const avgDepthFade = acc.depthFadeSum / Math.max(1, acc.count);
    const copies = options.fixedCopies
      ? maxCopies
      : options.microCarrier
      ? Math.min(maxCopies,
        1
        + (acc.count >= 2 ? 1 : 0)
        + (acc.count >= 4 || avgDepthFade > 0.48 ? 1 : 0)
        + (acc.count >= 7 && avgDepthFade > 0.28 ? 1 : 0))
      : maxCopies >= 2 && acc.count >= 2 && avgDepthFade > 0.16 ? 2 : 1;
    for (let copy = 0; copy < copies && out.length < recordBudget; copy++) {
      out.push(clumpAccumulatorRecord(acc, options, copy, copies));
    }
  }
  return { records: out, clumps: chosen.length };
}

function selectDistributedFieldCells(scored: readonly ScoredFieldCell[], maxCells: number, focus: BattleGrassFocus | undefined): ScoredFieldCell[] {
  if (maxCells <= 0) return [];
  if (scored.length <= maxCells || !focus || !Number.isFinite(focus.radius) || focus.radius <= 0) {
    return scored.slice(0, maxCells);
  }
  const depthBands = 5;
  const lateralBands = 14;
  const softLimit = Math.max(6, Math.ceil((maxCells / (depthBands * lateralBands)) * 1.34));
  const chosen: ScoredFieldCell[] = [];
  const selected = new Set<ClumpAccumulator>();
  const buckets = new Map<string, number>();
  for (const item of scored) {
    const depthBand = clampInt(Math.floor(clamp01(item.depthT) * depthBands), 0, depthBands - 1);
    const lateralT = clamp01(item.signedLateral / Math.max(1, focus.radius) * 0.5 + 0.5);
    const lateralBand = clampInt(Math.floor(lateralT * lateralBands), 0, lateralBands - 1);
    const key = `${depthBand}:${lateralBand}`;
    const depthBoost = depthBand === 0 ? 1.65 : depthBand === 1 ? 1.30 : 1.0;
    const bucketLimit = Math.ceil(softLimit * depthBoost);
    const used = buckets.get(key) ?? 0;
    if (used >= bucketLimit) continue;
    chosen.push(item);
    selected.add(item.acc);
    buckets.set(key, used + 1);
    if (chosen.length >= maxCells) return chosen;
  }
  for (const item of scored) {
    if (selected.has(item.acc)) continue;
    chosen.push(item);
    if (chosen.length >= maxCells) break;
  }
  return chosen;
}

function clumpAccumulatorRecord(acc: ClumpAccumulator, options: ClumpAccentOptions, copy: number, copies: number): GrassFieldRecord {
  const invWeight = 1 / Math.max(0.0001, acc.weightSum);
  const invCount = 1 / Math.max(1, acc.count);
  const normalLength = Math.hypot(acc.normalX, acc.normalY, acc.normalZ);
  const normalScale = normalLength > 0.0001 ? 1 / normalLength : 1;
  const avgDepthFade = clamp01(acc.depthFadeSum * invCount);
  const avgClumpWeight = clamp01(acc.clumpWeightSum * invCount);
  const countBoost = clamp01(Math.sqrt(acc.count) / 5.5);
  const footprint = Math.max(0.25, options.footprint)
    * Math.max(0.10, Number.isFinite(options.footprintScale) ? options.footprintScale! : 1)
    * (0.74 + countBoost * 0.46 + avgClumpWeight * 0.28)
    * (0.76 + avgDepthFade * 0.34);
  const baseYaw = Math.atan2(acc.yawSin, acc.yawCos);
  const copyJitter = copies <= 1 ? 0 : (copy - (copies - 1) * 0.5);
  const yawJitter = Number.isFinite(options.yawJitter) ? options.yawJitter! : 0.30;
  const yaw = (Number.isFinite(baseYaw) ? baseYaw : hash2(acc.seed, 4) * Math.PI * 2)
    + copyJitter * 0.64
    + (hash2(acc.seed ^ 0x95c1, copy + acc.depthBin * 13) - 0.5) * yawJitter;
  const windPhaseBase = Math.atan2(acc.windSin, acc.windCos);
  const windPhase = (Number.isFinite(windPhaseBase) ? windPhaseBase : hash2(acc.seed, 3) * Math.PI * 2) + copy * 0.47;
  const bladeSeed = Math.floor(hash2(acc.seed ^ 0x4b1d, acc.count + acc.depthBin * 131 + copy * 17) * 0x00ff_ffff);
  const centerX = acc.x * invWeight;
  const centerY = acc.y * invWeight;
  const copyOffsetScale = Math.max(0, Number.isFinite(options.copyOffsetScale) ? options.copyOffsetScale! : 1);
  const offset = copies <= 1 ? 0 : (acc.width * invWeight || options.baseWidth) * footprint * 1.85 * copyOffsetScale * copyJitter;
  const jitter = Math.max(0, Number.isFinite(options.jitter) ? options.jitter! : 0);
  const jitterAngle = hash2(acc.seed ^ 0x7379, acc.count * 31 + acc.depthBin * 7 + copy) * Math.PI * 2;
  const jitterMin = clamp01(Number.isFinite(options.jitterMin) ? options.jitterMin! : 0);
  const jitterT = Math.sqrt(hash2(acc.seed ^ 0x24bf, acc.depthBin * 19 + copy * 23));
  const jitterRadius = jitter * (jitterMin + (1 - jitterMin) * jitterT);
  const jitterX = Math.cos(jitterAngle) * jitterRadius;
  const jitterY = Math.sin(jitterAngle) * jitterRadius;
  const widthScale = Math.max(0.05, Number.isFinite(options.widthScale) ? options.widthScale! : 1);
  const heightScale = Math.max(0.05, Number.isFinite(options.heightScale) ? options.heightScale! : 1);
  const carrier = options.carrier === true;
  const microCarrier = options.microCarrier === true;
  return {
    x: centerX + Math.cos(yaw + Math.PI * 0.5) * offset + jitterX,
    y: centerY + Math.sin(yaw + Math.PI * 0.5) * offset + jitterY,
    z: acc.z * invWeight,
    worldCellX: Math.round(acc.worldCellX * invWeight),
    worldCellY: Math.round(acc.worldCellY * invWeight),
    tint: acc.tint,
    lodTier: acc.lodTier,
    normalX: acc.normalX * normalScale,
    normalY: acc.normalY * normalScale,
    normalZ: Math.max(0.0001, acc.normalZ * normalScale),
    width: Math.max(0.001, (acc.width * invWeight || options.baseWidth) * footprint * widthScale),
    height: Math.max(0.01, (acc.height * invWeight || options.baseHeight) * heightScale * (
      options.vertical
        ? 0.74 + avgDepthFade * 0.24 + countBoost * 0.12
        : 0.18 + avgDepthFade * 0.12 + countBoost * 0.05
    )),
    bend: Math.max(0, (acc.bend * invWeight || options.baseBend) * (
      options.vertical
        ? 0.34 + avgDepthFade * 0.18
        : 0.20 + avgDepthFade * 0.12
    )),
    windPhase,
    yaw,
    clumpSeed: acc.seed,
    bladeSeed,
    clumpWeight: carrier
      ? clamp01((microCarrier ? 0.86 : 0.88) + avgDepthFade * (microCarrier ? 0.10 : 0.08) + countBoost * (microCarrier ? 0.03 : 0.04))
      : clamp01(0.16 + avgClumpWeight * 0.36 + countBoost * 0.14 + avgDepthFade * 0.08),
  };
}

function softRootFiberRibbonCount(blades: number): number {
  return Math.max(4, Math.min(5, clampInt(blades, 0, 96) + 1));
}

function fieldFiberShellRibbonCount(blades: number): number {
  return Math.max(1, Math.min(2, clampInt(blades, 0, 96)));
}

function accentRecordCandidates(records: readonly GrassFieldRecord[], focus: BattleGrassFocus | undefined, params: BattleGrassParams): GrassFieldRecord[] {
  const { depthNear, depthFar } = accentDepthBounds(focus, params);
  if (!Number.isFinite(depthNear) || !Number.isFinite(depthFar) || depthFar <= depthNear) return [...records];
  const inDepth = records.filter((record) => {
    const depth = focusDepth(record, focus);
    return depth >= depthNear && depth <= depthFar;
  });
  return inDepth.length > 0 ? inDepth : [...records];
}

function selectAccentRecords(records: readonly GrassFieldRecord[], focus: BattleGrassFocus | undefined, budget: number, params: BattleGrassParams): GrassFieldRecord[] {
  if (budget <= 0 || records.length === 0) return [];
  const sourceRecords = accentRecordCandidates(records, focus, params);
  if (budget >= sourceRecords.length) return sourceRecords;
  const { depthNear, depthFar } = accentDepthBounds(focus, params);
  const scored = sourceRecords
    .map((record, index) => {
      const depth = focusDepth(record, focus);
      const lateral = focus ? Math.hypot(record.x - focus.x, record.y - focus.y) / Math.max(1, focus.radius) : 0;
      const inDepth = depth >= depthNear && depth <= depthFar;
      const hash = hash2(record.bladeSeed, record.clumpSeed & 0x00ff_ffff);
      const depthT = Number.isFinite(depthNear) && Number.isFinite(depthFar) && depthFar > depthNear
        ? clamp01((depth - depthNear) / Math.max(0.001, depthFar - depthNear))
        : 0;
      const score = (inDepth ? 0 : 10)
        + depthT * 1.6
        + lateral * 0.55
        - record.clumpWeight * 0.32
        + hash * 0.08
        + index * 0.0000001;
      return { record, score, inDepth };
    })
    .sort((a, b) => a.score - b.score);
  const inDepth = scored.filter((entry) => entry.inDepth);
  const source = inDepth.length > 0 ? inDepth : scored;
  return source.slice(0, budget).map((entry) => entry.record);
}

function fieldFiberShellRecords(records: readonly GrassFieldRecord[], focus: BattleGrassFocus | undefined, depthNear: number, depthFar: number, variant: GrassFiberShellVariant): GrassFieldRecord[] {
  return records.map((record, index) => {
    const depthFade = accentDepthFade(record, focus, depthNear, depthFar);
    const viewYaw = focus && Number.isFinite(focus.yaw) ? focus.yaw! + Math.PI * 0.5 : record.yaw;
    const alternating = index % 2 === 0 ? -1 : 1;
    const visible = variant === 'visibility';
    const widthOnly = variant === 'width';
    const liftOnly = variant === 'lift';
    const viewThickness = variant === 'view-thickness';
    const yaw = viewYaw
      + alternating * (
        viewThickness
          ? 0.018 + hash2(record.bladeSeed, index + 13) * 0.026
          : visible
            ? 0.10 + hash2(record.bladeSeed, index + 13) * 0.08
            : 0.16 + hash2(record.bladeSeed, index + 13) * 0.14
      )
      + (hash2(record.bladeSeed ^ 0x5c9d, record.clumpSeed + index * 7) - 0.5) * (
        viewThickness
          ? 0.075
          : visible
            ? 0.20
            : 0.34
      );
    const nearT = 0.42 + depthFade * 0.58;
    const widthJitter = 0.82 + hash2(record.bladeSeed, index + 31) * 0.28;
    const heightJitter = 0.86 + hash2(record.bladeSeed, index + 47) * 0.24;
    const widthFactor = visible
      ? 0.86 + depthFade * 0.28
      : widthOnly
        ? 0.82 + depthFade * 0.24
        : viewThickness
          ? 0.62 + depthFade * 0.18
          : 0.42 + depthFade * 0.20;
    const heightFactor = visible
      ? 0.82 + depthFade * 0.42
      : liftOnly
        ? 0.78 + depthFade * 0.34
        : 0.36 + depthFade * 0.34;
    const bendFactor = visible
      ? 0.04 + depthFade * 0.08
      : liftOnly
        ? 0.05 + depthFade * 0.10
        : 0.10 + depthFade * 0.18;
    return {
      ...record,
      yaw,
      width: Math.max(0.004, record.width * widthFactor * widthJitter),
      height: Math.max(0.08, record.height * heightFactor * heightJitter),
      bend: Math.max(0, record.bend * bendFactor),
      windPhase: record.windPhase + (hash2(record.bladeSeed, index + 59) - 0.5) * 0.42,
      clumpWeight: clamp01(visible ? 0.68 + record.clumpWeight * 0.12 + nearT * 0.20 : 0.24 + record.clumpWeight * 0.18 + nearT * 0.40),
    };
  });
}

function isFieldFiberShellStyle(style: GrassAccentStyle): boolean {
  return style === 'field-fiber-shell' || style === 'field-fiber-shell-visibility';
}

function isClumpAccentStyle(style: GrassAccentStyle): boolean {
  return style === 'root-shadow'
    || style === 'soft-root-mass'
    || style === 'soft-root-fiber'
    || style === 'alpha-impostor'
    || style === 'billboard-cluster'
    || style === 'volume-card';
}

function isVerticalClumpAccentStyle(style: GrassAccentStyle): boolean {
  return style === 'soft-root-fiber'
    || style === 'alpha-impostor'
    || style === 'billboard-cluster'
    || style === 'volume-card';
}

function grassPrimitiveFamilyForStyle(style: GrassAccentStyle): GrassPrimitiveFamily {
  if (style === 'field-fiber-shell' || style === 'field-fiber-shell-visibility') return 'field-fiber-shell';
  if (style === 'field-fiber-body') return 'field-fiber-body';
  if (style === 'field-fiber-bundle') return 'field-fiber-bundle';
  if (style === 'alpha-impostor') return 'alpha-impostor';
  if (style === 'billboard-cluster') return 'billboard-cluster';
  if (style === 'volume-card') return 'volume-card';
  if (style === 'root-shadow') return 'root-shadow';
  if (style === 'soft-root-mass') return 'soft-root-mass';
  if (style === 'soft-root-fiber') return 'soft-root-fiber';
  if (style === 'fiber-ribbon') return 'fiber-ribbon';
  if (style === 'hybrid-root-fiber') return 'hybrid-root-fiber';
  return 'legacy-tuft';
}

function isTextureGrassPrimitiveFamily(family: GrassPrimitiveFamily): boolean {
  return family === 'texture-volume' || family === 'texture-carrier' || family === 'texture-micro-carrier';
}

function isFieldFiberBodyPrimitiveFamily(family: GrassPrimitiveFamily): boolean {
  return family === 'field-fiber-body' || family === 'field-fiber-bundle';
}

function accentDepthBounds(focus: BattleGrassFocus | undefined, params: BattleGrassParams): { depthNear: number; depthFar: number } {
  const depthNear = Number.isFinite(params.accentDepthNear)
    ? params.accentDepthNear!
    : Number.isFinite(focus?.depthNear)
      ? focus!.depthNear!
      : -Infinity;
  const depthFar = Number.isFinite(params.accentDepthFar)
    ? params.accentDepthFar!
    : Number.isFinite(focus?.depthFar)
      ? focus!.depthFar!
      : Infinity;
  return { depthNear, depthFar };
}

function accentDepthFade(record: GrassFieldRecord, focus: BattleGrassFocus | undefined, depthNear: number, depthFar: number): number {
  if (!focus || !Number.isFinite(depthNear) || !Number.isFinite(depthFar) || depthFar <= depthNear) return 1;
  const depth = focusDepth(record, focus);
  return 1 - smoothstepRange(depthNear, depthFar, depth);
}

function focusDepth(record: GrassFieldRecord, focus: BattleGrassFocus | undefined): number {
  if (!focus || !Number.isFinite(focus.yaw)) return Math.hypot(record.x - (focus?.x ?? 0), record.y - (focus?.y ?? 0));
  const dx = record.x - focus.x;
  const dy = record.y - focus.y;
  return -dx * Math.sin(focus.yaw!) + dy * Math.cos(focus.yaw!);
}

function focusLateral(record: GrassFieldRecord, focus: BattleGrassFocus | undefined): number {
  if (!focus || !Number.isFinite(focus.yaw)) return 0;
  const dx = record.x - focus.x;
  const dy = record.y - focus.y;
  return dx * Math.cos(focus.yaw!) + dy * Math.sin(focus.yaw!);
}

function writeGrassInstance(out: Float32Array, n: number, record: PackedGrassInstance): void {
  const i = n * GRASS_INSTANCE_STRIDE_FLOATS;
  out[i] = record.x;
  out[i + 1] = record.y;
  out[i + 2] = record.z;
  out[i + 3] = record.terrainT;
  out[i + 4] = record.width;
  out[i + 5] = record.height;
  out[i + 6] = record.bend;
  out[i + 7] = record.windPhase;
  out[i + 8] = record.yaw;
  out[i + 9] = record.clumpSeed;
  out[i + 10] = record.bladeSeed;
  out[i + 11] = record.shade;
  out[i + 12] = record.normalX;
  out[i + 13] = record.normalY;
  out[i + 14] = record.normalZ;
  out[i + 15] = record.slopeMask;
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

interface TerrainGrassTuning {
  density: number;
  height: number;
  maxTufts: number;
  wind: number;
  width: number;
  spread: number;
  bladesPerTuft: number;
  vistaT: number;
  surfaceBlend: number;
}

function terrainGrassTuning(cover: BattleGroundCover, zoomT: number): TerrainGrassTuning {
  const coverTune = cover === 'green-grass'
    ? { density: 1, height: 1, maxTufts: 1, wind: 1 }
    : cover === 'yellow-grass'
      ? { density: 0.74, height: 0.84, maxTufts: 0.86, wind: 0.92 }
      : cover === 'scrub-grass'
        ? { density: 0.50, height: 0.72, maxTufts: 0.72, wind: 0.86 }
        : { density: 0.12, height: 0.48, maxTufts: 0.36, wind: 0.72 };
  const vistaT = smoothstepRange(0.86, 1.0, zoomT);
  return {
    density: coverTune.density * (0.20 + zoomT * 0.80 + vistaT * 3.80),
    height: coverTune.height * (0.50 + zoomT * 0.50 + vistaT * 0.35),
    maxTufts: coverTune.maxTufts * (0.34 + zoomT * 0.66 + vistaT * 3.00),
    wind: coverTune.wind * (0.58 + zoomT * 0.42),
    width: 1 + vistaT * 0.26,
    spread: 1 + vistaT * 0.18,
    bladesPerTuft: 1 + vistaT * 0.25,
    vistaT,
    surfaceBlend: 1 - vistaT * 0.50,
  };
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

function wgslVec3(rgb: readonly [number, number, number]): string {
  return `vec3f(${rgb.map((v) => v.toFixed(3)).join(', ')})`;
}
