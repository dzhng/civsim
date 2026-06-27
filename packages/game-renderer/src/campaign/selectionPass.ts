import type { RawFrameShell, WorldRenderPass } from '../../../webgpu-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../webgpu-core/src/cameraWgsl';
import { WEBGPU_DEPTH_FORMAT } from '../../../webgpu-core/src/depthContract';

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

@vertex
fn vs(@location(0) quad: vec2f, @location(1) inst0: vec4f, @location(2) inst1: vec4f) -> VsOut {
  let axisScale = select(0.76, 0.64, inst0.w > 0.5);
  let world = inst0.xy + vec2f(quad.x * inst0.z, quad.y * inst0.z * axisScale);
  var out: VsOut;
  out.pos = projectGround(world, civsimCampaignGroundDepth(world, 0.012));
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
  let innerCut = select(0.918, 0.894, strongArmy);
  let innerFade = select(0.936, 0.914, strongArmy);
  if (d > 1.0 || d < innerCut) { discard; }
  let outer = smoothstep(1.0, 0.988, d);
  let inner = smoothstep(innerCut, innerFade, d);
  let ring = outer * inner;
  let fill = smoothstep(0.990, 0.966, d) * smoothstep(innerCut - 0.012, innerCut + 0.008, d) * 0.024;
  let armyMix = select(0.18, 0.10, strongArmy);
  let groundTint = mix(in.color, vec3f(0.74, 0.66, 0.36), select(0.40, armyMix, in.kind > 0.5));
  let armyBoost = select(0.0, select(0.08, 0.14, strongArmy), in.kind > 0.5);
  let ringAlpha = select(0.68, select(0.72, 0.80, strongArmy), in.kind > 0.5);
  return vec4f(groundTint * (0.86 + armyBoost), max(ring * ringAlpha, fill));
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
    this.pipeline = this.makePipeline(module);
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

  private makePipeline(module: GPUShaderModule) {
    const device = this.shell.device;
    return device.createRenderPipeline({
      label: 'campaign-selection-depth-pipeline',
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
      depthStencil: {
        format: WEBGPU_DEPTH_FORMAT,
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
      },
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

  draw(pass: WorldRenderPass) {
    this.drawWithPipeline(pass, this.pipeline);
  }

  private drawWithPipeline(pass: WorldRenderPass, pipeline: GPURenderPipeline) {
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
