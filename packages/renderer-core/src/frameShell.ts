import { chartCamera3d } from './camera3d';
import { cameraUniformData, CAMERA_UNIFORM_BYTES, DEFAULT_SUN_AZIMUTH, DEFAULT_SUN_ELEVATION, PROJECTION_IDENTITY, type CameraSnapshot } from './cameraUniform';
import { WORLD_CAMERA_WGSL } from './cameraWgsl';
import { compileShader } from './compileShader';
import { GPU_DEPTH_CLEAR, GPU_DEPTH_FORMAT, isGpuDepthMode, type GpuDepthMode } from './depthContract';
import { requestGpuDevice, type DeviceLostReport, type UncapturedErrorReport, type GpuDeviceInfo } from './device';
import {
  frameGraphDepthRole,
  frameGraphPhaseOrder,
  frameGraphRolePhase,
  isFrameGraphPassRole,
  isFramePhaseKind,
  isTopLevelTypeBucketPass,
  type FrameGraphBatching,
  type FrameGraphPassRole,
  type FramePhaseKind,
} from './frameGraphContract';

export interface MarkerInstance {
  x: number;
  y: number;
  facing?: number;
  faction?: 0 | 1 | 2;
  size?: number;
  lod?: number;
}

export type MarkerLayerIntent = 'none' | 'lab-placeholder' | 'far-lod-impostor';

export type FrameShellFatalPhase = 'device-lost' | 'submission' | 'context';

export interface FrameShellFatalReport {
  phase: FrameShellFatalPhase;
  message: string;
}

export interface FrameShellHealth {
  fatal: boolean;
  deviceLost: boolean;
  lastError: FrameShellFatalReport | null;
}

export interface FrameShellOptions {
  /** Called once when the device is lost; the shell stops submitting frames. */
  onDeviceLost?: (report: DeviceLostReport) => void;
  /** Called when any GPU fault makes the shell unrenderable (device loss, bad submit). */
  onFatalError?: (report: FrameShellFatalReport) => void;
  /** Measure per-frame GPU time via a timestamp QuerySet (when supported). Off by default. */
  enableGpuTimer?: boolean;
  /** MSAA sample count (1 = off). Battle edges use 4; campaign stays at 1. */
  sampleCount?: number;
}

export interface RawFrameShell {
  info: GpuDeviceInfo;
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  sampleCount: number;
  cameraBindGroupLayout: GPUBindGroupLayout;
  cameraBindGroup: GPUBindGroup;
  resize(size?: { width: number; height: number; dpr?: number }): void;
  setCamera(camera: Omit<CameraSnapshot, 'width' | 'height'>): void;
  /** Advance the animation clock (seconds) written into the camera uniform. Use
   *  a fixed value for deterministic snapshots, free-running wall time for the eye. */
  setTime(seconds: number): void;
  /** Set the frame sun direction (azimuth, elevation in radians). */
  setSun(azimuth: number, elevation: number): void;
  drawFrame(commands?: FrameGraphCommands): void;
  destroy(): void;
  stats(): FrameShellStats;
  health(): FrameShellHealth;
}

declare const framePassPhase: unique symbol;

export type BackgroundRenderPass = GPURenderPassEncoder & {
  readonly [framePassPhase]: 'background';
};

export type WorldRenderPass = GPURenderPassEncoder & {
  readonly [framePassPhase]: 'world-depth';
};

export type OverlayRenderPass = GPURenderPassEncoder & {
  readonly [framePassPhase]: 'overlay';
};

export type FrameGraphDepthMode = GpuDepthMode;
export type FrameGraphPass =
  | {
    id: string;
    label?: string;
    role: 'background-underpaint';
    phase: 'background';
    batching?: FrameGraphBatching;
    draw: (pass: BackgroundRenderPass, shell: RawFrameShell) => void;
  }
  | {
    id: string;
    label?: string;
    role: 'world-depth-fill' | 'world-opaque' | 'world-decal';
    phase: 'world-depth';
    depth: FrameGraphDepthMode;
    batching?: FrameGraphBatching;
    draw: (pass: WorldRenderPass, shell: RawFrameShell) => void;
  }
  | {
    id: string;
    label?: string;
    role: 'overlay-ui' | 'overlay-effect' | 'overlay-debug';
    phase: 'overlay';
    batching?: FrameGraphBatching;
    draw: (pass: OverlayRenderPass, shell: RawFrameShell) => void;
  };

export interface FrameGraphCommands {
  markers?: MarkerInstance[];
  markerLayer?: Exclude<MarkerLayerIntent, 'none'>;
  terrainRect?: [number, number, number, number];
  terrainBackdropRect?: [number, number, number, number];
  terrainStyle?: 'default' | 'wide-detail';
  clear?: GPUColor;
  passes?: FrameGraphPass[];
  /** Optional pre-render compute work (e.g. an IFFT ocean dispatch) recorded
   *  into the frame's single command encoder before any render pass. Producers
   *  that need no compute (analytic fields) simply omit it. */
  precompute?: (encoder: GPUCommandEncoder) => void;
}

export interface FramePhaseStats {
  kind: FramePhaseKind;
  label: string;
  passIds: string[];
  passRoles: Array<{ id: string; role: FrameGraphPassRole }>;
  depthPasses: Array<{ id: string; mode: FrameGraphDepthMode }>;
  depth: 'none' | 'depth32float-reverse-z-clear';
  loadOp: 'clear' | 'load';
}

export interface FrameShellStats {
  width: number;
  height: number;
  dpr: number;
  markerCount: number;
  frame: number;
  device: string;
  atmosphere: string;
  cameraContract: 'shared-world-camera-wgsl';
  /** The engine-wide projection/depth identity (camera3d viewProj, reverse-Z). */
  projection: typeof PROJECTION_IDENTITY;
  markerLayer: MarkerLayerIntent;
  phases: FramePhaseStats[];
  sampleCount: number;
  gpuTimeMs: number | null;
  depth: {
    format: GPUTextureFormat;
    width: number;
    height: number;
    allocated: boolean;
  };
}

interface TerrainShaderStyle {
  oliveLow: string;
  oliveHigh: string;
  dry: string;
  lightFleckLow: string;
  lightFleckHigh: string;
  darkFleckLow: string;
  darkFleckHigh: string;
  stoneFleckLow: string;
  stoneFleckHigh: string;
  speckleStrength: string;
  dryMixBase: string;
  trampleMix: string;
  stubbleColor: string;
  stubbleStrength: string;
  darkFleckColor: string;
  darkFleckStrength: string;
  stoneFleckStrength: string;
  dustStrength: string;
  aerialStrength: string;
}

const DEFAULT_TERRAIN_STYLE: TerrainShaderStyle = {
  oliveLow: 'vec3f(0.43, 0.56, 0.22)',
  oliveHigh: 'vec3f(0.66, 0.69, 0.33)',
  dry: 'vec3f(0.76, 0.67, 0.39)',
  lightFleckLow: '0.884',
  lightFleckHigh: '0.990',
  darkFleckLow: '0.820',
  darkFleckHigh: '0.982',
  stoneFleckLow: '0.924',
  stoneFleckHigh: '0.996',
  speckleStrength: '0.315',
  dryMixBase: '0.22',
  trampleMix: '0.15',
  stubbleColor: 'vec3f(0.53, 0.48, 0.25)',
  stubbleStrength: '0.055',
  darkFleckColor: 'vec3f(0.47, 0.43, 0.32)',
  darkFleckStrength: '0.38',
  stoneFleckStrength: '0.30',
  dustStrength: '0.14',
  aerialStrength: '0.22',
};

const WIDE_DETAIL_TERRAIN_STYLE: TerrainShaderStyle = {
  oliveLow: 'vec3f(0.44, 0.58, 0.22)',
  oliveHigh: 'vec3f(0.68, 0.71, 0.33)',
  dry: 'vec3f(0.75, 0.67, 0.39)',
  lightFleckLow: '0.876',
  lightFleckHigh: '0.988',
  darkFleckLow: '0.800',
  darkFleckHigh: '0.976',
  stoneFleckLow: '0.916',
  stoneFleckHigh: '0.995',
  speckleStrength: '0.325',
  dryMixBase: '0.20',
  trampleMix: '0.14',
  stubbleColor: 'vec3f(0.52, 0.47, 0.25)',
  stubbleStrength: '0.063',
  darkFleckColor: 'vec3f(0.45, 0.42, 0.31)',
  darkFleckStrength: '0.42',
  stoneFleckStrength: '0.32',
  dustStrength: '0.12',
  aerialStrength: '0.19',
};

function terrainWgsl(style: TerrainShaderStyle) {
  return `
${WORLD_CAMERA_WGSL}
struct VsOut { @builtin(position) pos: vec4f, @location(0) world: vec2f, @location(1) dist: f32 };
@vertex
fn vs(@location(0) world: vec2f) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld(vec3f(world, 0.0));
  out.world = world;
  out.dist = length(world - cam.focus);
  return out;
}
fn hash(p: vec2f) -> f32 {
  let p3 = fract(vec3f(p.xyx) * 0.1031);
  let q = p3 + dot(p3, p3.yzx + vec3f(33.33));
  return fract((q.x + q.y) * q.z);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
    mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x),
    u.y,
  );
}
fn ridged(p: vec2f) -> f32 {
  let r = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
  return r * r;
}
fn groundHeight(p: vec2f) -> f32 {
  let broad = vnoise(p * 0.018 + vec2f(8.1, 2.4)) * 0.58;
  let folds = ridged(vec2f(p.x * 0.052 + p.y * 0.018, p.y * 0.038 - p.x * 0.012)) * 0.26;
  let scratch = ridged(vec2f(p.x * 0.42 + p.y * 0.09, p.y * 0.26)) * 0.16;
  return broad + folds + scratch;
}
@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let fine = vnoise(in.world * 2.2);
  let mid = vnoise(in.world * 0.47 + vec2f(5.2, 1.8));
  let broad = vnoise(in.world * 0.085 + vec2f(0.7, 9.3));
  let relief = groundHeight(in.world);
  let hx = groundHeight(in.world + vec2f(1.8, 0.0)) - relief;
  let hy = groundHeight(in.world + vec2f(0.0, 1.8)) - relief;
  let sun = normalize(vec3f(-0.46, -0.34, 0.82));
  let normal = normalize(vec3f(-hx * 1.45, -hy * 1.45, 1.0));
  let lambert = clamp(dot(normal, sun), 0.0, 1.0);
  let grazing = smoothstep(0.16, 0.86, ridged(vec2f(in.world.x * 0.12 + in.world.y * 0.03, in.world.y * 0.09)));
  let olive = mix(${style.oliveLow}, ${style.oliveHigh}, mid * 0.66 + fine * 0.16 + relief * 0.18);
  let dry = ${style.dry};
  let scrubPatch = smoothstep(0.50, 0.86, broad) * (1.0 - smoothstep(0.86, 0.98, fine));
  let trample = smoothstep(0.72, 0.98, vnoise((in.world + vec2f(13.0, -7.0)) * 0.18));
  let rakedDust = smoothstep(0.58, 0.92, grazing) * (0.08 + relief * 0.08);
  let seed = floor(in.world * 6.8);
  let fleck = hash(seed);
  let blade = hash(seed + vec2f(19.0, 41.0));
  let pebble = hash(seed + vec2f(73.0, 11.0));
  let stubble = smoothstep(0.66, 0.95, ridged(vec2f(in.world.x * 1.26 + in.world.y * 0.18, in.world.y * 0.84)));
  let lightFleck = smoothstep(${style.lightFleckLow}, ${style.lightFleckHigh}, fleck) * (0.46 + 0.54 * fine);
  let darkFleck = smoothstep(${style.darkFleckLow}, ${style.darkFleckHigh}, blade) * (1.0 - smoothstep(0.76, 0.98, broad));
  let stoneFleck = smoothstep(${style.stoneFleckLow}, ${style.stoneFleckHigh}, pebble) * (0.36 + relief * 0.46);
  let speckle = lightFleck * ${style.speckleStrength};
  var grass = mix(olive, dry, ${style.dryMixBase} + trample * ${style.trampleMix});
  grass = mix(grass, vec3f(0.31, 0.39, 0.18), scrubPatch * 0.34);
  grass = mix(grass, vec3f(0.88, 0.75, 0.47), rakedDust);
  grass *= 0.70 + lambert * 0.34;
  grass += vec3f(0.13, 0.12, 0.055) * speckle;
  grass = mix(grass, ${style.stubbleColor}, stubble * ${style.stubbleStrength});
  grass = mix(grass, grass * ${style.darkFleckColor}, darkFleck * ${style.darkFleckStrength});
  grass = mix(grass, vec3f(0.46, 0.43, 0.32), stoneFleck * ${style.stoneFleckStrength});
  let dust = ${style.dustStrength} * smoothstep(18.0, 96.0, in.dist);
  let aerial = smoothstep(120.0, 420.0, in.dist);
  let sunBleached = mix(grass, vec3f(0.86, 0.72, 0.46), dust);
  let haze = vec3f(0.78, 0.75, 0.64);
  return vec4f(mix(sunBleached, haze, aerial * ${style.aerialStrength}), 1.0);
}`;
}

function terrainBackdropWgsl() {
  return `
${WORLD_CAMERA_WGSL}
struct VsOut { @builtin(position) pos: vec4f, @location(0) world: vec2f };
@vertex
fn vs(@location(0) world: vec2f) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld(vec3f(world, 0.0));
  out.world = world;
  return out;
}
fn hash(p: vec2f) -> f32 {
  let p3 = fract(vec3f(p.xyx) * 0.1031);
  let q = p3 + dot(p3, p3.yzx + vec3f(33.33));
  return fract((q.x + q.y) * q.z);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
    mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x),
    u.y,
  );
}
@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let broad = vnoise(in.world * 0.055 + vec2f(4.7, 8.1));
  let mid = vnoise(in.world * 0.42 + vec2f(11.3, 1.9));
  let speck = smoothstep(0.78, 0.98, vnoise(in.world * 2.8));
  var grass = mix(vec3f(0.16, 0.25, 0.12), vec3f(0.30, 0.42, 0.20), broad);
  grass = mix(grass, vec3f(0.11, 0.18, 0.10), smoothstep(0.62, 0.94, mid) * 0.38);
  grass += vec3f(0.10, 0.12, 0.04) * speck;
  return vec4f(grass, 1.0);
}`;
}

function markerWgsl() {
  return `
${WORLD_CAMERA_WGSL}
struct Inst { xy:f32, yy:f32, facing:f32, faction:f32, size:f32, lod:f32, pad0:f32, pad1:f32 };
struct VsOut { @builtin(position) pos: vec4f, @location(0) faction:f32, @location(1) local: vec2f, @location(2) lod:f32 };
@vertex
fn vs(@location(0) quad: vec2f, @location(1) inst: vec4f, @location(2) instMeta: vec4f) -> VsOut {
  let a = inst.z - 1.5707964;
  let c = cos(a);
  let s = sin(a);
  let p = vec2f(quad.x * instMeta.x * 0.34, quad.y * instMeta.x * 0.58);
  let world = vec2f(inst.x, inst.y) + vec2f(p.x * c - p.y * s, p.x * s + p.y * c);
  var out: VsOut;
  out.pos = projectWorld(vec3f(world, 0.0));
  out.faction = inst.w;
  out.local = quad;
  out.lod = instMeta.y;
  return out;
}
@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let blue = vec3f(0.20, 0.42, 0.88);
  let red = vec3f(0.84, 0.24, 0.20);
  let neutral = vec3f(0.76, 0.67, 0.42);
  var accent = select(blue, red, in.faction > 0.5);
  accent = select(accent, neutral, in.faction > 1.5);
  let d = length(in.local);
  if (d > 1.15) { discard; }
  let body = mix(vec3f(0.56, 0.41, 0.24), vec3f(0.78, 0.65, 0.42), clamp(1.0 - abs(in.local.y), 0.0, 1.0));
  let stripe = smoothstep(0.02, 0.0, abs(in.local.x + 0.32));
  let lodDim = 1.0 - in.lod * 0.08;
  return vec4f(mix(body, accent, max(stripe, 0.58)) * lodDim, 1.0);
}`;
}

interface FrameColorAttachment {
  view: GPUTextureView;
  resolveTarget?: GPUTextureView;
  loadOp: 'clear' | 'load';
  storeOp: 'store' | 'discard';
  clearValue?: GPUColor;
}

interface GpuTimestampWrites {
  querySet: GPUQuerySet;
  beginningOfPassWriteIndex?: number;
  endOfPassWriteIndex?: number;
}

interface GpuFrameTimer {
  readonly querySet: GPUQuerySet;
  recordResolve(encoder: GPUCommandEncoder): void;
  readback(): void;
  lastMs: number | null;
}

// Per-frame GPU time from a 2-entry timestamp QuerySet, read back without
// stalling the frame: at most one mapAsync is in flight, and the result lands a
// frame or two later. Timestamp values are nanoseconds.
function createGpuFrameTimer(device: GPUDevice): GpuFrameTimer {
  const querySet = device.createQuerySet({ type: 'timestamp', count: 2, label: 'frame-gpu-timer' });
  const resolveBuffer = device.createBuffer({ label: 'frame-gpu-timer-resolve', size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
  const readbackBuffer = device.createBuffer({ label: 'frame-gpu-timer-readback', size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  let mapping = false;
  let resolved = false;
  const timer: GpuFrameTimer = {
    querySet,
    lastMs: null,
    recordResolve(encoder) {
      if (mapping) { resolved = false; return; }
      encoder.resolveQuerySet(querySet, 0, 2, resolveBuffer, 0);
      encoder.copyBufferToBuffer(resolveBuffer, 0, readbackBuffer, 0, 16);
      resolved = true;
    },
    readback() {
      if (mapping || !resolved) return;
      mapping = true;
      const buffer = readbackBuffer as unknown as GPUMappableBuffer;
      void buffer.mapAsync(GPUMapMode.READ).then(() => {
        const stamps = new BigUint64Array(buffer.getMappedRange().slice(0));
        buffer.unmap();
        timer.lastMs = Number(stamps[1] - stamps[0]) / 1e6;
        mapping = false;
      }).catch(() => { mapping = false; });
    },
  };
  return timer;
}

export async function createFrameShell(canvas: HTMLCanvasElement, options: FrameShellOptions = {}): Promise<RawFrameShell> {
  let shell: RawFrameShellImpl | null = null;
  const info = await requestGpuDevice({
    callbacks: {
      onDeviceLost: (report) => shell?.handleDeviceLost(report),
      onUncapturedError: (report) => shell?.handleUncapturedError(report),
    },
  });
  shell = new RawFrameShellImpl(canvas, info, options);
  return shell;
}

export class RawFrameShellImpl implements RawFrameShell {
  readonly device: GPUDevice;
  readonly cameraBindGroupLayout: GPUBindGroupLayout;
  readonly cameraBindGroup: GPUBindGroup;

  private context: GPUCanvasContext;
  private terrainPipeline: GPURenderPipeline;
  private terrainWideDetailPipeline: GPURenderPipeline;
  private terrainBackdropPipeline: GPURenderPipeline;
  private markerPipeline: GPURenderPipeline;
  private cameraBuffer: GPUBuffer;
  private terrainBackdropVertexBuffer: GPUBuffer;
  private terrainVertexBuffer: GPUBuffer;
  private markerQuadBuffer: GPUBuffer;
  private markerInstanceBuffer: GPUBuffer;
  private depthTexture: GPUTexture | null = null;
  private depthWidth = 0;
  private depthHeight = 0;
  private markerCapacity = 0;
  private markerLayer: MarkerLayerIntent = 'none';
  // Every route/renderer sets its own camera before drawing; this default only
  // keeps a freshly-created shell renderable (a chart-framed origin view).
  private camera: Omit<CameraSnapshot, 'width' | 'height'> = { x: 0, y: 0, zoom: 12, camera3d: chartCamera3d({ x: 0, y: 0, zoom: 12, pitch: 0.35 }, 600) };
  private time = 0;
  private sunAzimuth = DEFAULT_SUN_AZIMUTH;
  private sunElevation = DEFAULT_SUN_ELEVATION;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private markerCount = 0;
  private frame = 0;
  private lastPhases: FramePhaseStats[] = [];
  private fatal = false;
  private deviceLost = false;
  private lastError: FrameShellFatalReport | null = null;
  private readonly onDeviceLost?: (report: DeviceLostReport) => void;
  private readonly onFatalError?: (report: FrameShellFatalReport) => void;
  readonly depthFormat: GPUTextureFormat;
  readonly sampleCount: number;
  private gpuTimer: GpuFrameTimer | null = null;
  private gpuTimeMs: number | null = null;
  private msaaTexture: GPUTexture | null = null;
  private msaaWidth = 0;
  private msaaHeight = 0;

  constructor(readonly canvas: HTMLCanvasElement, readonly info: GpuDeviceInfo, options: FrameShellOptions = {}) {
    this.device = info.device;
    this.onDeviceLost = options.onDeviceLost;
    this.onFatalError = options.onFatalError;
    this.depthFormat = GPU_DEPTH_FORMAT;
    this.sampleCount = Math.max(1, Math.floor(options.sampleCount ?? 1));
    if (options.enableGpuTimer && info.caps.timestampQuery) {
      this.gpuTimer = createGpuFrameTimer(this.device);
    }
    const context = canvas.getContext('webgpu');
    if (!context) {
      throw new Error('WebGPU canvas context unavailable: getContext("webgpu") returned null.');
    }
    this.context = context;
    this.cameraBindGroupLayout = this.device.createBindGroupLayout({
      label: 'raw-frame-camera-bgl',
      // VERTEX | FRAGMENT so fragment-stage effects (water foam/glint) can read
      // the clock/perspective from the same uniform the vertex projection uses.
      // Widening visibility changes no existing output: no current fragment
      // shader reads `cam`, and the clock pad is 0 until setTime() is called.
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    this.cameraBuffer = this.device.createBuffer({
      label: 'raw-frame-camera',
      size: CAMERA_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.cameraBindGroup = this.device.createBindGroup({
      label: 'raw-frame-camera-bg',
      layout: this.cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }],
    });
    this.terrainPipeline = this.makeTerrainPipeline('terrain', terrainWgsl(DEFAULT_TERRAIN_STYLE));
    this.terrainWideDetailPipeline = this.makeTerrainPipeline('terrain-wide-detail', terrainWgsl(WIDE_DETAIL_TERRAIN_STYLE));
    this.terrainBackdropPipeline = this.makeTerrainBackdropPipeline();
    this.markerPipeline = this.makeMarkerPipeline();
    this.terrainBackdropVertexBuffer = this.device.createBuffer({
      label: 'terrain-backdrop-quad',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.terrainVertexBuffer = this.device.createBuffer({
      label: 'terrain-quad',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.markerQuadBuffer = this.device.createBuffer({
      label: 'marker-quad',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.markerQuadBuffer, 0, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    this.markerInstanceBuffer = this.device.createBuffer({
      label: 'marker-instances-empty',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.resize();
  }

  resize(size?: { width: number; height: number; dpr?: number }) {
    this.dpr = size?.dpr ?? window.devicePixelRatio ?? 1;
    const cssW = (size?.width ?? this.canvas.clientWidth) || 1;
    const cssH = (size?.height ?? this.canvas.clientHeight) || 1;
    this.width = Math.max(1, Math.floor(cssW * this.dpr));
    this.height = Math.max(1, Math.floor(cssH * this.dpr));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.context.configure({ device: this.device, format: this.info.format, alphaMode: 'opaque' });
    this.writeCamera();
  }

  setCamera(camera: Omit<CameraSnapshot, 'width' | 'height'>) {
    this.camera = camera;
    this.writeCamera();
  }

  setTime(seconds: number) {
    this.time = seconds;
    this.writeCamera();
  }

  /** Set the frame sun direction (radians) — the light for water glint and future
   *  sky/effects. Defaults to the battle sun convention. */
  setSun(azimuth: number, elevation: number) {
    this.sunAzimuth = azimuth;
    this.sunElevation = elevation;
    this.writeCamera();
  }

  drawFrame(commands: FrameGraphCommands = {}) {
    const graphPasses = commands.passes ?? [];
    this.assertFrameGraphPasses(graphPasses);
    if (this.fatal) return;
    this.frame++;
    this.lastPhases = [];
    const backgroundPasses = graphPasses.filter((pass) => pass.phase === 'background');
    const worldPasses = graphPasses.filter((pass) => pass.phase === 'world-depth');
    const overlayPasses = graphPasses.filter((pass) => pass.phase === 'overlay');
    const terrainRect = commands.terrainRect ?? [-42, -28, 84, 56];
    const terrainBackdropRect = commands.terrainBackdropRect;
    if (terrainBackdropRect) this.uploadTerrain(this.terrainBackdropVertexBuffer, terrainBackdropRect);
    this.uploadTerrain(this.terrainVertexBuffer, terrainRect);
    const markers = commands.markers ?? [];
    if (markers.length > 0 && !commands.markerLayer) {
      throw new Error('background markers must declare markerLayer "lab-placeholder" or "far-lod-impostor"');
    }
    this.markerLayer = markers.length > 0 ? commands.markerLayer! : 'none';
    this.uploadMarkers(markers);
    const lastPhase: FramePhaseKind = overlayPasses.length > 0 ? 'overlay' : worldPasses.length > 0 ? 'world-depth' : 'background';
    const encoder = this.device.createCommandEncoder({ label: 'raw-frame-encoder' });
    commands.precompute?.(encoder);
    const colorView = this.context.getCurrentTexture().createView();
    const bgTimestamps = this.timestampWrites('background', lastPhase);
    const pass = encoder.beginRenderPass({
      label: 'raw-frame-background-pass',
      colorAttachments: [this.colorAttachment(colorView, 'clear', lastPhase === 'background', commands.clear ?? { r: 0.78, g: 0.82, b: 0.80, a: 1 })],
      ...(bgTimestamps ? { timestampWrites: bgTimestamps } : {}),
    });
    pass.setBindGroup(0, this.cameraBindGroup);
    if (terrainBackdropRect) {
      pass.setPipeline(this.terrainBackdropPipeline);
      pass.setVertexBuffer(0, this.terrainBackdropVertexBuffer);
      pass.draw(4);
    }
    pass.setPipeline(commands.terrainStyle === 'wide-detail' ? this.terrainWideDetailPipeline : this.terrainPipeline);
    pass.setVertexBuffer(0, this.terrainVertexBuffer);
    pass.draw(4);
    if (this.markerCount > 0) {
      pass.setPipeline(this.markerPipeline);
      pass.setBindGroup(0, this.cameraBindGroup);
      pass.setVertexBuffer(0, this.markerQuadBuffer);
      pass.setVertexBuffer(1, this.markerInstanceBuffer);
      pass.draw(4, this.markerCount);
    }
    for (const graphPass of backgroundPasses) graphPass.draw(pass as BackgroundRenderPass, this);
    pass.end();
    this.recordPhase({
      kind: 'background',
      label: 'terrain, backdrop, impostor markers, and background surfaces',
      passIds: ['builtin-background', ...backgroundPasses.map((pass) => pass.id)],
      passRoles: [
        { id: 'builtin-background', role: 'background-underpaint' },
        ...backgroundPasses.map((pass) => ({ id: pass.id, role: pass.role })),
      ],
      depthPasses: [],
      depth: 'none',
      loadOp: 'clear',
    });
    if (worldPasses.length > 0) {
      const worldTimestamps = this.timestampWrites('world-depth', lastPhase);
      const depthPass = encoder.beginRenderPass({
        label: 'raw-frame-depth-world-pass',
        colorAttachments: [this.colorAttachment(colorView, 'load', lastPhase === 'world-depth')],
        depthStencilAttachment: this.depthAttachment(),
        ...(worldTimestamps ? { timestampWrites: worldTimestamps } : {}),
      });
      depthPass.setBindGroup(0, this.cameraBindGroup);
      for (const graphPass of worldPasses) graphPass.draw(depthPass as WorldRenderPass, this);
      depthPass.end();
      this.recordPhase({
        kind: 'world-depth',
        label: 'depth-tested world geometry and ground decals',
        passIds: worldPasses.map((pass) => pass.id),
        passRoles: worldPasses.map((pass) => ({ id: pass.id, role: pass.role })),
        depthPasses: worldPasses.map((pass) => ({ id: pass.id, mode: pass.depth })),
        depth: 'depth32float-reverse-z-clear',
        loadOp: 'load',
      });
    }
    if (overlayPasses.length > 0) {
      const overlayTimestamps = this.timestampWrites('overlay', lastPhase);
      const overlayPass = encoder.beginRenderPass({
        label: 'raw-frame-overlay-pass',
        colorAttachments: [this.colorAttachment(colorView, 'load', lastPhase === 'overlay')],
        ...(overlayTimestamps ? { timestampWrites: overlayTimestamps } : {}),
      });
      overlayPass.setBindGroup(0, this.cameraBindGroup);
      for (const graphPass of overlayPasses) graphPass.draw(overlayPass as OverlayRenderPass, this);
      overlayPass.end();
      this.recordPhase({
        kind: 'overlay',
        label: 'labels, HUD, minimap, atmosphere, and debug overlays',
        passIds: overlayPasses.map((pass) => pass.id),
        passRoles: overlayPasses.map((pass) => ({ id: pass.id, role: pass.role })),
        depthPasses: [],
        depth: 'none',
        loadOp: 'load',
      });
    }
    this.gpuTimer?.recordResolve(encoder);
    let commandBuffer: unknown;
    try {
      commandBuffer = encoder.finish();
    } catch (error) {
      this.handleFatal('submission', error);
      return;
    }
    try {
      this.device.queue.submit([commandBuffer]);
    } catch (error) {
      this.handleFatal('submission', error);
      return;
    }
    if (this.gpuTimer) {
      this.gpuTimer.readback();
      this.gpuTimeMs = this.gpuTimer.lastMs;
    }
  }

  /** Color attachment for one phase; resolves MSAA to the canvas on the last phase. */
  private colorAttachment(canvasView: GPUTextureView, loadOp: 'clear' | 'load', isLastPhase: boolean, clearValue?: GPUColor): FrameColorAttachment {
    const attachment: FrameColorAttachment = {
      view: this.msaaView(canvasView),
      loadOp,
      storeOp: 'store',
    };
    if (clearValue) attachment.clearValue = clearValue;
    if (this.sampleCount > 1 && isLastPhase) attachment.resolveTarget = canvasView;
    return attachment;
  }

  private timestampWrites(phase: FramePhaseKind, lastPhase: FramePhaseKind): GpuTimestampWrites | undefined {
    if (!this.gpuTimer) return undefined;
    const writes: GpuTimestampWrites = { querySet: this.gpuTimer.querySet };
    if (phase === 'background') writes.beginningOfPassWriteIndex = 0;
    if (phase === lastPhase) writes.endOfPassWriteIndex = 1;
    // A middle phase (neither first nor last) writes no timestamps; an empty
    // timestampWrites descriptor is a WebGPU validation error.
    if (writes.beginningOfPassWriteIndex === undefined && writes.endOfPassWriteIndex === undefined) return undefined;
    return writes;
  }

  destroy() {
    this.depthTexture?.destroy();
    this.depthTexture = null;
    this.msaaTexture?.destroy();
    this.msaaTexture = null;
  }

  health(): FrameShellHealth {
    return { fatal: this.fatal, deviceLost: this.deviceLost, lastError: this.lastError ? { ...this.lastError } : null };
  }

  handleDeviceLost(report: DeviceLostReport) {
    this.deviceLost = true;
    this.markFatal({ phase: 'device-lost', message: `device lost (${report.reason}): ${report.message}` });
    this.onDeviceLost?.(report);
  }

  handleUncapturedError(report: UncapturedErrorReport) {
    this.markFatal({ phase: 'submission', message: report.message });
  }

  private handleFatal(phase: FrameShellFatalPhase, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.markFatal({ phase, message });
  }

  private markFatal(report: FrameShellFatalReport) {
    this.lastError = report;
    if (this.fatal) return;
    this.fatal = true;
    this.onFatalError?.(report);
  }

  stats(): FrameShellStats {
    return {
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      markerCount: this.markerCount,
      frame: this.frame,
      device: [this.info.vendor, this.info.architecture, this.info.description].filter(Boolean).join(' / ') || 'unknown',
      atmosphere: 'aegean-sky-haze',
      cameraContract: 'shared-world-camera-wgsl',
      projection: PROJECTION_IDENTITY,
      markerLayer: this.markerLayer,
      phases: this.lastPhases.map((phase) => ({ ...phase })),
      sampleCount: this.sampleCount,
      gpuTimeMs: this.gpuTimeMs,
      depth: {
        format: this.depthFormat,
        width: this.depthWidth,
        height: this.depthHeight,
        allocated: this.depthTexture !== null,
      },
    };
  }

  /** The render target view for this frame: a fresh MSAA texture when sampling, else the canvas. */
  private msaaView(canvasView: GPUTextureView): GPUTextureView {
    if (this.sampleCount <= 1) return canvasView;
    if (!this.msaaTexture || this.msaaWidth !== this.width || this.msaaHeight !== this.height) {
      this.msaaTexture?.destroy();
      this.msaaWidth = this.width;
      this.msaaHeight = this.height;
      this.msaaTexture = this.device.createTexture({
        label: 'raw-frame-msaa-color',
        size: { width: this.width, height: this.height },
        format: this.info.format,
        sampleCount: this.sampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    return this.msaaTexture.createView();
  }

  private writeCamera() {
    this.device.queue.writeBuffer(this.cameraBuffer, 0, cameraUniformData({ ...this.camera, width: this.width, height: this.height, time: this.time, sunAzimuth: this.sunAzimuth, sunElevation: this.sunElevation }));
  }

  private recordPhase(phase: FramePhaseStats) {
    this.lastPhases.push(phase);
  }

  private assertFrameGraphPasses(passes: FrameGraphPass[]) {
    const seen = new Set<string>();
    let lastPhaseOrder = -1;
    let readOnlyWorldDepthStarted = false;
    for (const pass of passes) {
      const candidate = pass as FrameGraphPass & { batching?: FrameGraphBatching; depth?: unknown; id?: unknown; label?: unknown; phase?: unknown; role?: unknown };
      const id = typeof candidate.id === 'string' && candidate.id.length > 0 ? candidate.id : '<unknown>';
      if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
        throw new Error('frame graph pass must declare a non-empty id');
      }
      if (isTopLevelTypeBucketPass(candidate.id)) {
        throw new Error(`frame graph pass "${id}" is a type bucket, not a semantic frame pass`);
      }
      if (typeof candidate.label === 'string' && /\bbucket\b/i.test(candidate.label)) {
        throw new Error(`frame graph pass "${id}" label describes a bucket; use batching metadata under a semantic pass instead`);
      }
      if (!isFramePhaseKind(candidate.phase)) {
        throw new Error(`frame graph pass "${id}" declares unsupported phase "${String(candidate.phase)}"`);
      }
      if (seen.has(id)) throw new Error(`duplicate frame graph pass id "${id}"`);
      seen.add(id);
      if (!isFrameGraphPassRole(candidate.role)) {
        throw new Error(`frame graph pass "${id}" must declare a semantic role`);
      }
      for (const bucket of candidate.batching?.buckets ?? []) {
        if (!bucket.trim()) {
          throw new Error(`frame graph pass "${id}" declares an empty batching bucket`);
        }
      }
      const hasDepth = Object.prototype.hasOwnProperty.call(candidate, 'depth');
      if (candidate.phase === 'world-depth') {
        if (!isGpuDepthMode(candidate.depth)) {
          throw new Error(`world-depth frame graph pass "${id}" must declare depth mode "read", "read-write", or "write"`);
        }
        if (readOnlyWorldDepthStarted && candidate.depth !== 'read') {
          throw new Error(`world-depth frame graph pass "${id}" writes depth after read-only world decals have started`);
        }
        if (candidate.depth === 'read') readOnlyWorldDepthStarted = true;
      } else if (hasDepth) {
        throw new Error(`non-world-depth frame graph pass "${id}" must not declare a depth mode`);
      }
      const order = frameGraphPhaseOrder(candidate.phase);
      if (order < lastPhaseOrder) {
        throw new Error(`frame graph pass "${id}" moves phase order backward to "${candidate.phase}"`);
      }
      const rolePhase = frameGraphRolePhase(candidate.role);
      if (rolePhase !== candidate.phase) {
        throw new Error(`frame graph pass "${id}" role "${candidate.role}" is incompatible with phase "${candidate.phase}"`);
      }
      if (candidate.phase === 'world-depth') {
        const depthRole = frameGraphDepthRole(candidate.depth);
        if (depthRole !== candidate.role) {
          throw new Error(`world-depth frame graph pass "${id}" depth mode "${candidate.depth}" requires role "${depthRole}", not "${candidate.role}"`);
        }
      }
      lastPhaseOrder = Math.max(lastPhaseOrder, order);
    }
  }

  private uploadTerrain(buffer: GPUBuffer, [x, y, w, h]: [number, number, number, number]) {
    this.device.queue.writeBuffer(buffer, 0, new Float32Array([x, y, x + w, y, x, y + h, x + w, y + h]));
  }

  private depthAttachment(): GPURenderPassDepthStencilAttachment {
    if (!this.depthTexture || this.depthWidth !== this.width || this.depthHeight !== this.height) {
      this.depthTexture?.destroy();
      this.depthWidth = this.width;
      this.depthHeight = this.height;
      this.depthTexture = this.device.createTexture({
        label: 'raw-frame-depth-world-texture',
        size: { width: this.width, height: this.height },
        format: this.depthFormat,
        sampleCount: this.sampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    return {
      view: this.depthTexture.createView(),
      depthClearValue: GPU_DEPTH_CLEAR,
      depthLoadOp: 'clear',
      depthStoreOp: 'discard',
    };
  }

  private uploadMarkers(markers: MarkerInstance[]) {
    this.markerCount = markers.length;
    if (markers.length > this.markerCapacity) {
      this.markerCapacity = Math.max(markers.length, this.markerCapacity * 2, 256);
      this.markerInstanceBuffer = this.device.createBuffer({
        label: 'marker-instances',
        size: this.markerCapacity * 8 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (markers.length === 0) return;
    const data = new Float32Array(markers.length * 8);
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      const o = i * 8;
      data[o] = m.x;
      data[o + 1] = m.y;
      data[o + 2] = m.facing ?? 0;
      data[o + 3] = m.faction ?? 0;
      data[o + 4] = m.size ?? 1;
      data[o + 5] = m.lod ?? 0;
    }
    this.device.queue.writeBuffer(this.markerInstanceBuffer, 0, data);
  }

  private makeTerrainPipeline(label: string, code: string) {
    const module = compileShader(this.device, code, label);
    return this.device.createRenderPipeline({
      label: `${label}-pipeline`,
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.cameraBindGroupLayout] }),
      vertex: { module, entryPoint: 'vs', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
      fragment: { module, entryPoint: 'fs', targets: [{ format: this.info.format }] },
      primitive: { topology: 'triangle-strip' },
      multisample: { count: this.sampleCount },
    });
  }

  private makeTerrainBackdropPipeline() {
    const module = compileShader(this.device, terrainBackdropWgsl(), 'terrain-backdrop');
    return this.device.createRenderPipeline({
      label: 'terrain-backdrop-pipeline',
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.cameraBindGroupLayout] }),
      vertex: { module, entryPoint: 'vs', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
      fragment: { module, entryPoint: 'fs', targets: [{ format: this.info.format }] },
      primitive: { topology: 'triangle-strip' },
      multisample: { count: this.sampleCount },
    });
  }

  private makeMarkerPipeline() {
    const module = compileShader(this.device, markerWgsl(), 'marker');
    return this.device.createRenderPipeline({
      label: 'marker-pipeline',
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
          {
            arrayStride: 32,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x4' },
              { shaderLocation: 2, offset: 16, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'fs', targets: [{ format: this.info.format }] },
      primitive: { topology: 'triangle-strip' },
      multisample: { count: this.sampleCount },
    });
  }
}
