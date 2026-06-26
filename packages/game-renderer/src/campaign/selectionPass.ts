import type { RawFrameShell } from '../../../webgpu-core/src/frameShell';

export interface CampaignSelectionInstance {
  x: number;
  y: number;
  radius: number;
  color: [number, number, number];
  kind: 'city' | 'army';
}

const SELECTION_WGSL = `
struct Camera { x:f32, y:f32, zoom:f32, cosP:f32, width:f32, height:f32, cosYaw:f32, sinYaw:f32 };
@group(0) @binding(0) var<uniform> cam: Camera;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) kind: f32,
};

@vertex
fn vs(@location(0) quad: vec2f, @location(1) inst0: vec4f, @location(2) inst1: vec4f) -> VsOut {
  let world = inst0.xy + quad * inst0.z;
  let dx = world.x - cam.x;
  let dy = world.y - cam.y;
  let rx = dx * cam.cosYaw + dy * cam.sinYaw;
  let ry = -dx * cam.sinYaw + dy * cam.cosYaw;
  var out: VsOut;
  out.pos = vec4f((rx * cam.zoom) / (cam.width * 0.5), (ry * cam.zoom * cam.cosP) / (cam.height * 0.5), 0.06, 1.0);
  out.local = quad;
  out.color = inst1.rgb;
  out.kind = inst0.w;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let d = length(in.local);
  if (d > 1.0 || d < 0.68) { discard; }
  let edge = smoothstep(1.0, 0.88, d) * smoothstep(0.68, 0.78, d);
  let glow = smoothstep(1.0, 0.72, d) * smoothstep(0.64, 0.78, d);
  let armyBoost = select(0.0, 0.12, in.kind > 0.5);
  return vec4f(in.color * (0.86 + armyBoost), max(edge, glow * 0.34) * 0.72);
}`;

export class CampaignSelectionPass {
  private pipeline: GPURenderPipeline;
  private quadBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer;
  private capacity = 0;
  private count = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-selection-wgsl', code: SELECTION_WGSL });
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-selection-pipeline',
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
      label: 'campaign-selection-quad',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.quadBuffer, 0, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    this.instanceBuffer = device.createBuffer({
      label: 'campaign-selection-empty',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(instances: CampaignSelectionInstance[]) {
    this.count = instances.length;
    if (instances.length > this.capacity) {
      this.capacity = Math.max(instances.length, this.capacity * 2, 8);
      this.instanceBuffer = this.shell.device.createBuffer({
        label: 'campaign-selection-instances',
        size: this.capacity * 8 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (instances.length === 0) return;
    const data = new Float32Array(instances.length * 8);
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const o = i * 8;
      data[o] = inst.x;
      data[o + 1] = inst.y;
      data[o + 2] = inst.radius;
      data[o + 3] = inst.kind === 'army' ? 1 : 0;
      data.set(inst.color, o + 4);
      data[o + 7] = 1;
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
    return { selections: this.count };
  }
}
