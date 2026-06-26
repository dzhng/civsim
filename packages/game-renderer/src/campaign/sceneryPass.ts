import type { RawFrameShell } from '../../../webgpu-core/src/frameShell';

export type CampaignSceneryKind = 'mountain' | 'tree' | 'rock';

export interface CampaignSceneryInstance {
  x: number;
  y: number;
  size: number;
  kind: CampaignSceneryKind;
  shade?: number;
}

const SCENERY_WGSL = `
struct Camera { x:f32, y:f32, zoom:f32, cosP:f32, width:f32, height:f32, cosYaw:f32, sinYaw:f32 };
@group(0) @binding(0) var<uniform> cam: Camera;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) kind: f32,
  @location(2) shade: f32,
};

@vertex
fn vs(@location(0) quad: vec2f, @location(1) inst: vec4f) -> VsOut {
  let dx = inst.x - cam.x;
  let dy = inst.y - cam.y;
  let rx = dx * cam.cosYaw + dy * cam.sinYaw;
  let ry = -dx * cam.sinYaw + dy * cam.cosYaw;
  let size = inst.z;
  let screenX = rx * cam.zoom + quad.x * size * cam.zoom;
  let vertical = (quad.y + 1.0) * 0.5 * size * cam.zoom * 1.42;
  let foot = -0.10 * size * cam.zoom;
  let screenY = ry * cam.zoom * cam.cosP + vertical + foot;
  var out: VsOut;
  out.pos = vec4f(screenX / (cam.width * 0.5), screenY / (cam.height * 0.5), 0.04, 1.0);
  out.local = quad;
  out.kind = inst.w;
  out.shade = inst.z;
  return out;
}

fn tri(p: vec2f, c: vec2f, s: vec2f) -> f32 {
  let q = (p - c) / s;
  let inside = step(abs(q.x), 1.0 - q.y) * step(-1.0, q.y) * step(q.y, 1.0);
  return inside;
}

fn ellipse(p: vec2f, c: vec2f, r: vec2f) -> f32 {
  return 1.0 - smoothstep(0.76, 1.0, length((p - c) / r));
}

fn rockShape(p: vec2f) -> f32 {
  let a = ellipse(p, vec2f(-0.15, -0.56), vec2f(0.72, 0.36));
  let b = tri(p, vec2f(0.10, -0.12), vec2f(0.72, 0.72));
  let c = tri(p, vec2f(-0.46, -0.22), vec2f(0.42, 0.54));
  return max(a * 0.72, max(b, c));
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let p = in.local;
  let shadow = ellipse(p, vec2f(0.05, -0.82), vec2f(0.80, 0.18)) * 0.30;

  if (in.kind < 0.5) {
    let peakA = tri(p, vec2f(-0.15, -0.12), vec2f(0.78, 0.98));
    let peakB = tri(p, vec2f(0.42, -0.28), vec2f(0.52, 0.74));
    let peakC = tri(p, vec2f(-0.58, -0.34), vec2f(0.42, 0.62));
    let body = max(peakA, max(peakB, peakC));
    if (body <= 0.01 && shadow <= 0.01) { discard; }
    let side = smoothstep(-0.72, 0.82, p.x + p.y * 0.28);
    let stone = mix(vec3f(0.23, 0.21, 0.17), vec3f(0.42, 0.39, 0.32), side);
    let cap = smoothstep(0.18, 0.72, p.y) * body;
    let col = mix(stone, vec3f(0.56, 0.54, 0.47), cap * 0.26);
    return vec4f(mix(vec3f(0.06, 0.05, 0.04), col, body), max(body, shadow));
  }

  if (in.kind < 1.5) {
    let trunk = (1.0 - smoothstep(0.06, 0.12, abs(p.x))) * smoothstep(-0.98, -0.60, p.y);
    let coneA = tri(p, vec2f(0.0, -0.30), vec2f(0.52, 0.70));
    let coneB = tri(p, vec2f(0.0, 0.10), vec2f(0.42, 0.58));
    let crown = max(coneA, coneB);
    if (crown <= 0.01 && trunk <= 0.01 && shadow <= 0.01) { discard; }
    let leaf = mix(vec3f(0.10, 0.18, 0.10), vec3f(0.23, 0.29, 0.15), smoothstep(-0.8, 0.9, p.y));
    let col = mix(vec3f(0.30, 0.20, 0.12), leaf, crown);
    return vec4f(col, max(max(crown, trunk), shadow));
  }

  let body = rockShape(p);
  if (body <= 0.01 && shadow <= 0.01) { discard; }
  let stone = mix(vec3f(0.26, 0.24, 0.20), vec3f(0.42, 0.39, 0.32), smoothstep(-0.9, 0.8, p.x - p.y * 0.35));
  return vec4f(stone, max(body, shadow));
}`;

export class CampaignSceneryPass {
  private pipeline: GPURenderPipeline;
  private quadBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer;
  private capacity = 0;
  private count = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-scenery-wgsl', code: SCENERY_WGSL });
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-scenery-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
          {
            arrayStride: 16,
            stepMode: 'instance',
            attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }],
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
      label: 'campaign-scenery-quad',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.quadBuffer, 0, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    this.instanceBuffer = device.createBuffer({
      label: 'campaign-scenery-empty',
      size: 4 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(instances: CampaignSceneryInstance[]) {
    const sorted = [...instances].sort((a, b) => b.y - a.y);
    this.count = sorted.length;
    if (sorted.length > this.capacity) {
      this.capacity = Math.max(sorted.length, this.capacity * 2, 128);
      this.instanceBuffer = this.shell.device.createBuffer({
        label: 'campaign-scenery-instances',
        size: this.capacity * 4 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (sorted.length === 0) return;
    const data = new Float32Array(sorted.length * 4);
    for (let i = 0; i < sorted.length; i++) {
      const inst = sorted[i];
      const o = i * 4;
      data[o] = inst.x;
      data[o + 1] = inst.y;
      data[o + 2] = inst.size;
      data[o + 3] = kindCode(inst.kind);
    }
    this.shell.device.queue.writeBuffer(this.instanceBuffer, 0, data);
  }

  draw(pass: GPURenderPassEncoder) {
    if (this.count === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.draw(4, this.count);
  }

  stats() {
    return { scenery: this.count };
  }
}

function kindCode(kind: CampaignSceneryKind) {
  if (kind === 'mountain') return 0;
  if (kind === 'tree') return 1;
  return 2;
}
