import type { RawFrameShell } from '../../../webgpu-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../webgpu-core/src/cameraWgsl';

export interface CampaignSelectionInstance {
  x: number;
  y: number;
  radius: number;
  color: [number, number, number];
  kind: 'city' | 'army';
  emphasis?: number;
}

const SELECTION_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) kind: f32,
  @location(3) emphasis: f32,
};

fn campaignDepth(ry: f32, z: f32) -> f32 {
  return clamp(0.50 + ry * 0.0012 - z * 0.0030, 0.02, 0.98);
}

@vertex
fn vs(@location(0) quad: vec2f, @location(1) inst0: vec4f, @location(2) inst1: vec4f) -> VsOut {
  let axisScale = select(0.76, 0.64, inst0.w > 0.5);
  let world = inst0.xy + vec2f(quad.x * inst0.z, quad.y * inst0.z * axisScale);
  var out: VsOut;
  let axes = cameraSpace(world);
  out.pos = projectGround(world, campaignDepth(axes.y, 0.06));
  out.local = quad;
  out.color = inst1.rgb;
  out.kind = inst0.w;
  out.emphasis = inst1.a;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let d = length(in.local);
  let strongArmy = in.kind > 0.5 && in.emphasis > 0.5;
  let innerCut = select(0.928, 0.900, strongArmy);
  let innerFade = select(0.942, 0.916, strongArmy);
  if (d > 1.0 || d < innerCut) { discard; }
  let outer = smoothstep(1.0, 0.988, d);
  let inner = smoothstep(innerCut, innerFade, d);
  let ring = outer * inner;
  let fill = smoothstep(0.990, 0.968, d) * smoothstep(innerCut - 0.010, innerCut + 0.006, d) * 0.018;
  let armyMix = select(0.20, 0.08, strongArmy);
  let groundTint = mix(in.color, vec3f(0.74, 0.66, 0.36), select(0.52, armyMix, in.kind > 0.5));
  let armyBoost = select(0.0, select(0.12, 0.16, strongArmy), in.kind > 0.5);
  let ringAlpha = select(0.58, select(0.68, 0.82, strongArmy), in.kind > 0.5);
  return vec4f(groundTint * (0.84 + armyBoost), max(ring * ringAlpha, fill));
}`;

export class CampaignSelectionPass {
  private pipeline: GPURenderPipeline;
  private depthPipeline: GPURenderPipeline;
  private quadBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer;
  private capacity = 0;
  private count = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-selection-wgsl', code: SELECTION_WGSL });
    this.pipeline = this.makePipeline(module, false);
    this.depthPipeline = this.makePipeline(module, true);
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

  private makePipeline(module: GPUShaderModule, depth: boolean) {
    const device = this.shell.device;
    return device.createRenderPipeline({
      label: depth ? 'campaign-selection-depth-pipeline' : 'campaign-selection-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.shell.cameraBindGroupLayout] }),
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
          format: this.shell.info.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'triangle-strip' },
      ...(depth ? {
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: true,
          depthCompare: 'less',
        },
      } : {}),
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
      data[o + 7] = inst.emphasis ?? 0;
    }
    this.shell.device.queue.writeBuffer(this.instanceBuffer, 0, data);
  }

  draw(pass: GPURenderPassEncoder) {
    this.drawWithPipeline(pass, this.pipeline);
  }

  drawDepth(pass: GPURenderPassEncoder) {
    this.drawWithPipeline(pass, this.depthPipeline);
  }

  private drawWithPipeline(pass: GPURenderPassEncoder, pipeline: GPURenderPipeline) {
    if (this.count === 0) return;
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.draw(4, this.count);
  }

  stats() {
    return { selections: this.count };
  }
}
