import type { RawFrameShell } from '../../../webgpu-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../webgpu-core/src/cameraWgsl';

export interface CampaignAtmosphereRect {
  min: [number, number];
  max: [number, number];
}

export interface CampaignWaterFeature {
  x: number;
  y: number;
  rx: number;
  ry: number;
  angle: number;
  alpha: number;
}

const CLOUD_WGSL = `
${WORLD_CAMERA_WGSL}

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) world: vec2f,
};

@vertex
fn vs(@location(0) world: vec2f, @location(1) uv: vec2f) -> VsOut {
  var out: VsOut;
  out.pos = projectGround(world, 0.12);
  out.uv = uv;
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
  let u = f * f * (vec2f(3.0) - 2.0 * f);
  let a = hash(i);
  let b = hash(i + vec2f(1.0, 0.0));
  let c = hash(i + vec2f(0.0, 1.0));
  let d = hash(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p: vec2f) -> f32 {
  return vnoise(p) * 0.54 + vnoise(p * 2.17 + vec2f(7.1, 3.4)) * 0.31 + vnoise(p * 4.31 + vec2f(1.8, 9.2)) * 0.15;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let edge = min(min(in.uv.x, 1.0 - in.uv.x), min(in.uv.y, 1.0 - in.uv.y));
  let rim = 1.0 - smoothstep(0.0, 0.26, edge);
  let topBias = smoothstep(0.24, 0.0, in.uv.y) * 0.72;
  let bottomBias = smoothstep(0.26, 0.0, 1.0 - in.uv.y) * 0.82;
  let cornerBias = smoothstep(0.44, 0.12, distance(in.uv, vec2f(0.05, 0.09))) * 0.7
    + smoothstep(0.42, 0.12, distance(in.uv, vec2f(0.88, 0.92))) * 0.45
    + smoothstep(0.42, 0.12, distance(in.uv, vec2f(0.18, 0.94))) * 0.52;
  let n = fbm(in.world * 0.0018 + vec2f(2.7, 8.2));
  let veil = smoothstep(0.42 - rim * 0.34, 0.86 - rim * 0.26, n);
  let body = clamp((rim * 0.82 + topBias + bottomBias + cornerBias) * veil, 0.0, 1.0);
  let color = mix(vec3f(0.80, 0.84, 0.83), vec3f(0.97, 0.98, 0.96), smoothstep(0.35, 0.82, n));
  return vec4f(color, body * 0.40 * __CLOUD_ALPHA_SCALE__);
}`;

const WATER_WGSL = `
${WORLD_CAMERA_WGSL}

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) alpha: f32,
  @location(2) world: vec2f,
};

@vertex
fn vs(@location(0) quad: vec2f, @location(1) inst0: vec4f, @location(2) inst1: vec4f) -> VsOut {
  let c = cos(inst0.w);
  let s = sin(inst0.w);
  let localWorld = vec2f(quad.x * inst0.z, quad.y * inst1.x);
  let world = inst0.xy + vec2f(localWorld.x * c - localWorld.y * s, localWorld.x * s + localWorld.y * c);
  var out: VsOut;
  out.pos = projectGround(world, 0.10);
  out.local = quad;
  out.alpha = inst1.y;
  out.world = world;
  return out;
}

fn hash(p: vec2f) -> f32 {
  let p3 = fract(vec3f(p.xyx) * 0.1031);
  let q = p3 + dot(p3, p3.yzx + vec3f(33.33));
  return fract((q.x + q.y) * q.z);
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let d = dot(in.local, in.local);
  if (d > 1.0) { discard; }
  let feather = smoothstep(1.0, 0.18, d);
  let stripe = 0.5 + 0.5 * sin(in.local.x * 18.0 + in.local.y * 7.0 + hash(floor(in.world * 0.018)) * 2.4);
  let glint = pow(max(0.0, 1.0 - abs(in.local.y + 0.12)), 5.0) * smoothstep(0.45, 0.92, stripe);
  let foam = smoothstep(0.55, 0.98, stripe) * smoothstep(0.86, 0.45, abs(in.local.y)) * 0.18;
  let water = mix(vec3f(0.17, 0.33, 0.45), vec3f(0.54, 0.67, 0.72), glint * 0.62 + foam);
  return vec4f(water, feather * in.alpha * (0.23 + glint * 0.34 + foam));
}`;

export class CampaignCloudPass {
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GPUBuffer;

  constructor(private shell: RawFrameShell, rect: CampaignAtmosphereRect, alphaScale = 1) {
    const device = shell.device;
    const code = CLOUD_WGSL.replace('__CLOUD_ALPHA_SCALE__', alphaScale.toFixed(3));
    const module = device.createShaderModule({ label: 'campaign-cloud-wgsl', code });
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-cloud-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 16,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x2' },
          ],
        }],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{
          format: shell.info.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'triangle-strip' },
    });
    const [x0, y0] = rect.min;
    const [x1, y1] = rect.max;
    const vertices = new Float32Array([
      x0, y0, 0, 1,
      x1, y0, 1, 1,
      x0, y1, 0, 0,
      x1, y1, 1, 0,
    ]);
    this.vertexBuffer = device.createBuffer({
      label: 'campaign-cloud-quad',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
  }

  draw(pass: GPURenderPassEncoder) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(4);
  }

  stats() {
    return { cloudQuads: 1 };
  }
}

export class CampaignWaterPass {
  private pipeline: GPURenderPipeline;
  private quadBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer;
  private capacity = 0;
  private featureCount = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-water-wgsl', code: WATER_WGSL });
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-water-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
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
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{
          format: shell.info.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'triangle-strip' },
    });
    this.quadBuffer = device.createBuffer({
      label: 'campaign-water-quad',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.quadBuffer, 0, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    this.instanceBuffer = device.createBuffer({
      label: 'campaign-water-empty',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(features: CampaignWaterFeature[]) {
    this.featureCount = features.length;
    if (features.length > this.capacity) {
      this.capacity = Math.max(features.length, this.capacity * 2, 8);
      this.instanceBuffer = this.shell.device.createBuffer({
        label: 'campaign-water-instances',
        size: this.capacity * 8 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (features.length === 0) return;
    const data = new Float32Array(features.length * 8);
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      const o = i * 8;
      data[o] = feature.x;
      data[o + 1] = feature.y;
      data[o + 2] = feature.rx;
      data[o + 3] = feature.angle;
      data[o + 4] = feature.ry;
      data[o + 5] = feature.alpha;
    }
    this.shell.device.queue.writeBuffer(this.instanceBuffer, 0, data);
  }

  draw(pass: GPURenderPassEncoder) {
    if (this.featureCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.draw(4, this.featureCount);
  }

  stats() {
    return { waterFeatures: this.featureCount };
  }
}

export function campaignWaterFeatures(): CampaignWaterFeature[] {
  return [
    { x: 210, y: -520, rx: 900, ry: 170, angle: -0.05, alpha: 0.42 },
    { x: -300, y: 40, rx: 360, ry: 150, angle: -0.48, alpha: 0.32 },
    { x: 60, y: -140, rx: 260, ry: 110, angle: -0.78, alpha: 0.30 },
    { x: 605, y: 150, rx: 330, ry: 126, angle: -0.62, alpha: 0.33 },
    { x: 1080, y: 1120, rx: 480, ry: 120, angle: 0.08, alpha: 0.30 },
    { x: 85, y: 680, rx: 280, ry: 92, angle: -0.68, alpha: 0.24 },
  ];
}
