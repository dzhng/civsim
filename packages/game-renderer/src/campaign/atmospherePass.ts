import type { BackgroundRenderPass, OverlayRenderPass, RawFrameShell } from '../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';

export interface CampaignAtmosphereRect {
  min: [number, number];
  max: [number, number];
}

export interface CampaignFogSource {
  x: number;
  y: number;
  radius: number;
}

// The overlay atmosphere quads (cloud veil / fog-of-war) sit on the ground
// plane and project through the one real camera3d projector like every other
// campaign pass.
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
  out.pos = projectWorld(vec3f(world, 0.0));
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

const MAX_FOG_SOURCES = 64;

const FOG_WGSL = `
${WORLD_CAMERA_WGSL}

struct FogUniform {
  params: vec4f,
  sources: array<vec4f, ${MAX_FOG_SOURCES}>,
};

@group(1) @binding(0) var<uniform> fog: FogUniform;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) world: vec2f,
};

@vertex
fn vs(@location(0) world: vec2f, @location(1) uv: vec2f) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld(vec3f(world, 0.0));
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
  return vnoise(p) * 0.52 + vnoise(p * 2.03 + vec2f(4.9, 7.1)) * 0.32 + vnoise(p * 4.21 + vec2f(12.7, 1.9)) * 0.16;
}

fn visibilityAt(world: vec2f) -> f32 {
  var vis = 0.0;
  let count = min(u32(fog.params.x), ${MAX_FOG_SOURCES}u);
  for (var i = 0u; i < count; i = i + 1u) {
    let src = fog.sources[i];
    let d = distance(world, src.xy);
    let radius = max(1.0, src.z);
    let sourceVis = 1.0 - smoothstep(radius * 0.72, radius * 1.08, d);
    vis = max(vis, sourceVis);
  }
  return vis;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  if (fog.params.y < 0.5) {
    discard;
  }
  let vis = visibilityAt(in.world);
  let hidden = 1.0 - vis;
  if (hidden <= 0.015) {
    discard;
  }
  let n = fbm(in.world * 0.0022 + vec2f(3.1, 8.7));
  let cloud = smoothstep(0.44, 0.86, n);
  let edge = min(min(in.uv.x, 1.0 - in.uv.x), min(in.uv.y, 1.0 - in.uv.y));
  let rim = 1.0 - smoothstep(0.02, 0.20, edge);
  let veil = clamp(hidden * (0.58 + cloud * 0.26 + rim * 0.16), 0.0, 0.88);
  let color = mix(vec3f(0.035, 0.045, 0.045), vec3f(0.80, 0.82, 0.80), cloud * hidden);
  return vec4f(color, veil);
}`;

export class CampaignFogPass {
  private pipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private bindGroup: GPUBindGroup;
  private uniformBuffer: GPUBuffer;
  private vertexBuffer: GPUBuffer;
  private sourceCount = 0;
  private enabled = false;

  constructor(private shell: RawFrameShell, rect: CampaignAtmosphereRect) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-fog-wgsl', code: FOG_WGSL });
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'campaign-fog-bgl',
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-fog-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout, this.bindGroupLayout] }),
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
    const uniformFloats = 4 + MAX_FOG_SOURCES * 4;
    this.uniformBuffer = device.createBuffer({
      label: 'campaign-fog-uniforms',
      size: uniformFloats * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      label: 'campaign-fog-bg',
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
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
      label: 'campaign-fog-quad',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
    this.upload([], false);
  }

  upload(sources: CampaignFogSource[], enabled: boolean) {
    this.enabled = enabled;
    this.sourceCount = Math.min(sources.length, MAX_FOG_SOURCES);
    const data = new Float32Array(4 + MAX_FOG_SOURCES * 4);
    data[0] = this.sourceCount;
    data[1] = enabled ? 1 : 0;
    for (let i = 0; i < this.sourceCount; i++) {
      const source = sources[i];
      const o = 4 + i * 4;
      data[o] = source.x;
      data[o + 1] = source.y;
      data[o + 2] = source.radius;
    }
    this.shell.device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  draw(pass: OverlayRenderPass) {
    if (!this.enabled || this.sourceCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setBindGroup(1, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(4);
  }

  stats() {
    return { fogSources: this.sourceCount, fogEnabled: this.enabled };
  }
}

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

  draw(pass: OverlayRenderPass) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(4);
  }

  stats() {
    return { cloudQuads: 1 };
  }
}
