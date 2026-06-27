import { cameraUniformData, type CameraSnapshot } from './cameraUniform';
import { requestWebGpuDevice, type WebGpuDeviceInfo } from './device';

export interface MarkerInstance {
  x: number;
  y: number;
  facing?: number;
  faction?: 0 | 1 | 2;
  size?: number;
  lod?: number;
}

export interface RawFrameShell {
  info: WebGpuDeviceInfo;
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  cameraBindGroupLayout: GPUBindGroupLayout;
  cameraBindGroup: GPUBindGroup;
  resize(size?: { width: number; height: number; dpr?: number }): void;
  setCamera(camera: Omit<CameraSnapshot, 'width' | 'height'>): void;
  drawFrame(commands?: FrameCommands): void;
  destroy(): void;
  stats(): FrameShellStats;
}

export interface FrameCommands {
  markers?: MarkerInstance[];
  terrainRect?: [number, number, number, number];
  terrainBackdropRect?: [number, number, number, number];
  terrainStyle?: 'default' | 'wide-detail';
  clear?: GPUColor;
  extra?: (pass: GPURenderPassEncoder, shell: RawFrameShellImpl) => void;
}

export interface FrameShellStats {
  width: number;
  height: number;
  dpr: number;
  markerCount: number;
  frame: number;
  device: string;
  atmosphere: string;
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
struct Camera { x:f32, y:f32, zoom:f32, cosP:f32, width:f32, height:f32, cosYaw:f32, sinYaw:f32, perspective:f32, pad0:f32, pad1:f32, pad2:f32 };
@group(0) @binding(0) var<uniform> cam: Camera;
struct VsOut { @builtin(position) pos: vec4f, @location(0) world: vec2f, @location(1) dist: f32 };
@vertex
fn vs(@location(0) world: vec2f) -> VsOut {
  let dx = world.x - cam.x;
  let dy = world.y - cam.y;
  let rx = dx * cam.cosYaw + dy * cam.sinYaw;
  let ry = -dx * cam.sinYaw + dy * cam.cosYaw;
  var out: VsOut;
  let depth = max(0.32, 1.0 + ry * cam.perspective);
  out.pos = vec4f((rx * cam.zoom) / (cam.width * 0.5), (ry * cam.zoom * cam.cosP) / (cam.height * 0.5), 0.8 * depth, depth);
  out.world = world;
  out.dist = length(world - vec2f(cam.x, cam.y));
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

const TERRAIN_WGSL = terrainWgsl(DEFAULT_TERRAIN_STYLE);
const TERRAIN_WIDE_DETAIL_WGSL = terrainWgsl(WIDE_DETAIL_TERRAIN_STYLE);

const TERRAIN_BACKDROP_WGSL = `
struct Camera { x:f32, y:f32, zoom:f32, cosP:f32, width:f32, height:f32, cosYaw:f32, sinYaw:f32, perspective:f32, pad0:f32, pad1:f32, pad2:f32 };
@group(0) @binding(0) var<uniform> cam: Camera;
struct VsOut { @builtin(position) pos: vec4f, @location(0) world: vec2f };
@vertex
fn vs(@location(0) world: vec2f) -> VsOut {
  let dx = world.x - cam.x;
  let dy = world.y - cam.y;
  let rx = dx * cam.cosYaw + dy * cam.sinYaw;
  let ry = -dx * cam.sinYaw + dy * cam.cosYaw;
  var out: VsOut;
  let depth = max(0.32, 1.0 + ry * cam.perspective);
  out.pos = vec4f((rx * cam.zoom) / (cam.width * 0.5), (ry * cam.zoom * cam.cosP) / (cam.height * 0.5), 0.9 * depth, depth);
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

const MARKER_WGSL = `
struct Camera { x:f32, y:f32, zoom:f32, cosP:f32, width:f32, height:f32, cosYaw:f32, sinYaw:f32, perspective:f32, pad0:f32, pad1:f32, pad2:f32 };
@group(0) @binding(0) var<uniform> cam: Camera;
struct Inst { xy:f32, yy:f32, facing:f32, faction:f32, size:f32, lod:f32, pad0:f32, pad1:f32 };
struct VsOut { @builtin(position) pos: vec4f, @location(0) faction:f32, @location(1) local: vec2f, @location(2) lod:f32 };
@vertex
fn vs(@location(0) quad: vec2f, @location(1) inst: vec4f, @location(2) instMeta: vec4f) -> VsOut {
  let a = inst.z - 1.5707964;
  let c = cos(a);
  let s = sin(a);
  let p = vec2f(quad.x * instMeta.x * 0.34, quad.y * instMeta.x * 0.58);
  let world = vec2f(inst.x, inst.y) + vec2f(p.x * c - p.y * s, p.x * s + p.y * c);
  let dx = world.x - cam.x;
  let dy = world.y - cam.y;
  let rx = dx * cam.cosYaw + dy * cam.sinYaw;
  let ry = -dx * cam.sinYaw + dy * cam.cosYaw;
  var out: VsOut;
  let depth = max(0.32, 1.0 + ry * cam.perspective);
  out.pos = vec4f((rx * cam.zoom) / (cam.width * 0.5), (ry * cam.zoom * cam.cosP) / (cam.height * 0.5), 0.2 * depth, depth);
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

export async function createFrameShell(canvas: HTMLCanvasElement): Promise<RawFrameShell> {
  const info = await requestWebGpuDevice();
  return new RawFrameShellImpl(canvas, info);
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
  private markerCapacity = 0;
  private camera: Omit<CameraSnapshot, 'width' | 'height'> = { x: 0, y: 0, zoom: 12, pitch: 0.35, yaw: 0 };
  private width = 1;
  private height = 1;
  private dpr = 1;
  private markerCount = 0;
  private frame = 0;

  constructor(readonly canvas: HTMLCanvasElement, readonly info: WebGpuDeviceInfo) {
    this.device = info.device;
    this.context = canvas.getContext('webgpu')!;
    this.cameraBindGroupLayout = this.device.createBindGroupLayout({
      label: 'raw-frame-camera-bgl',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });
    this.cameraBuffer = this.device.createBuffer({
      label: 'raw-frame-camera',
      size: 12 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.cameraBindGroup = this.device.createBindGroup({
      label: 'raw-frame-camera-bg',
      layout: this.cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }],
    });
    this.terrainPipeline = this.makeTerrainPipeline();
    this.terrainWideDetailPipeline = this.makeTerrainPipeline('terrain-wide-detail', TERRAIN_WIDE_DETAIL_WGSL);
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

  drawFrame(commands: FrameCommands = {}) {
    this.frame++;
    const terrainRect = commands.terrainRect ?? [-42, -28, 84, 56];
    const terrainBackdropRect = commands.terrainBackdropRect;
    if (terrainBackdropRect) this.uploadTerrain(this.terrainBackdropVertexBuffer, terrainBackdropRect);
    this.uploadTerrain(this.terrainVertexBuffer, terrainRect);
    this.uploadMarkers(commands.markers ?? []);
    const encoder = this.device.createCommandEncoder({ label: 'raw-frame-encoder' });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: commands.clear ?? { r: 0.78, g: 0.82, b: 0.80, a: 1 },
        storeOp: 'store',
      }],
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
    commands.extra?.(pass, this);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  destroy() {}

  stats(): FrameShellStats {
    return {
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      markerCount: this.markerCount,
      frame: this.frame,
      device: [this.info.vendor, this.info.architecture, this.info.description].filter(Boolean).join(' / ') || 'unknown',
      atmosphere: 'aegean-sky-haze',
    };
  }

  private writeCamera() {
    this.device.queue.writeBuffer(this.cameraBuffer, 0, cameraUniformData({ ...this.camera, width: this.width, height: this.height }));
  }

  private uploadTerrain(buffer: GPUBuffer, [x, y, w, h]: [number, number, number, number]) {
    this.device.queue.writeBuffer(buffer, 0, new Float32Array([x, y, x + w, y, x, y + h, x + w, y + h]));
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

  private makeTerrainPipeline(label = 'terrain', code = TERRAIN_WGSL) {
    const module = this.device.createShaderModule({ label: `${label}-wgsl`, code });
    return this.device.createRenderPipeline({
      label: `${label}-pipeline`,
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.cameraBindGroupLayout] }),
      vertex: { module, entryPoint: 'vs', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
      fragment: { module, entryPoint: 'fs', targets: [{ format: this.info.format }] },
      primitive: { topology: 'triangle-strip' },
    });
  }

  private makeTerrainBackdropPipeline() {
    const module = this.device.createShaderModule({ label: 'terrain-backdrop-wgsl', code: TERRAIN_BACKDROP_WGSL });
    return this.device.createRenderPipeline({
      label: 'terrain-backdrop-pipeline',
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.cameraBindGroupLayout] }),
      vertex: { module, entryPoint: 'vs', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
      fragment: { module, entryPoint: 'fs', targets: [{ format: this.info.format }] },
      primitive: { topology: 'triangle-strip' },
    });
  }

  private makeMarkerPipeline() {
    const module = this.device.createShaderModule({ label: 'marker-wgsl', code: MARKER_WGSL });
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
    });
  }
}
