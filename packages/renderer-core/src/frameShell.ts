import { chartCamera3d } from './camera3d';
import { cameraUniformData, CAMERA_UNIFORM_BYTES, PROJECTION_IDENTITY, type CameraSnapshot } from './cameraUniform';
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
  /** Environment-owned initial sun; the shell does not choose a visual default. */
  sun: Required<Pick<CameraSnapshot, 'sunAzimuth' | 'sunElevation'>>;
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
  frame: number;
  device: string;
  atmosphere: string;
  cameraContract: 'shared-world-camera-wgsl';
  /** The engine-wide projection/depth identity (camera3d viewProj, reverse-Z). */
  projection: typeof PROJECTION_IDENTITY;
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

export async function createFrameShell(canvas: HTMLCanvasElement, options: FrameShellOptions): Promise<RawFrameShell> {
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
  private cameraBuffer: GPUBuffer;
  private depthTexture: GPUTexture | null = null;
  private depthWidth = 0;
  private depthHeight = 0;
  // Every route/renderer sets its own camera before drawing; this default only
  // keeps a freshly-created shell renderable (a chart-framed origin view).
  private camera: Omit<CameraSnapshot, 'width' | 'height'> = { x: 0, y: 0, zoom: 12, camera3d: chartCamera3d({ x: 0, y: 0, zoom: 12, pitch: 0.35 }, 600) };
  private time = 0;
  private sunAzimuth: number;
  private sunElevation: number;
  private width = 1;
  private height = 1;
  private dpr = 1;
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

  constructor(readonly canvas: HTMLCanvasElement, readonly info: GpuDeviceInfo, options: FrameShellOptions) {
    this.device = info.device;
    this.sunAzimuth = options.sun.sunAzimuth;
    this.sunElevation = options.sun.sunElevation;
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

  /** Set the environment-owned frame sun direction (radians). */
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
    for (const graphPass of backgroundPasses) graphPass.draw(pass as BackgroundRenderPass, this);
    pass.end();
    this.recordPhase({
      kind: 'background',
      label: 'consumer-owned background surfaces',
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
      frame: this.frame,
      device: [this.info.vendor, this.info.architecture, this.info.description].filter(Boolean).join(' / ') || 'unknown',
      atmosphere: 'aegean-sky-haze',
      cameraContract: 'shared-world-camera-wgsl',
      projection: PROJECTION_IDENTITY,
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
}
