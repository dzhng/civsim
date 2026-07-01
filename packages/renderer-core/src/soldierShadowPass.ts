import type { RawFrameShell, WorldRenderPass } from './frameShell';
import { WORLD_CAMERA_WGSL } from './cameraWgsl';
import { compileShader } from './compileShader';
import { gpuAlphaBlendColorTarget, gpuMultisample, gpuWorldDepthStencil } from './pipelineContracts';
import type { SoldierCrowdDepthScene } from './skinnedPipeline';
import type { CrowdInstance } from '../../crowd-runtime/src/instanceData';

// A grounding shadow per soldier: a soft dark ellipse on the terrain surface at
// the soldier's (x, y, elevation), so each figure is anchored to the ground
// beneath it. Shared by battle and campaign — the crowd instances drive it, and
// the world-depth function is selected per scene so the decal sorts on the same
// relief the skinned soldiers use.

export interface SoldierShadowStats {
  shadows: number;
  cameraContract: 'shared-world-camera-wgsl';
}

const SHADOW_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut { @builtin(position) pos: vec4f, @location(0) local: vec2f };
@vertex
fn vs(@location(0) quad: vec2f, @location(1) inst: vec4f) -> VsOut {
  // inst = (x, y, radius, elevation)
  let world = vec3f(inst.x + quad.x * inst.z, inst.y + quad.y * inst.z * 0.72, inst.w + 0.015);
  var out: VsOut;
  out.pos = projectWorld3d(world, civsimBattleWorldDepth3d(world));
  out.local = quad;
  return out;
}
@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let d = length(in.local);
  if (d > 1.0) { discard; }
  let alpha = (1.0 - d * d) * 0.34;
  return vec4f(0.06, 0.05, 0.04, alpha);
}`;

export class SoldierShadowDecalPass {
  private pipeline: GPURenderPipeline;
  private quadBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer;
  private capacity = 0;
  private count = 0;

  constructor(private shell: RawFrameShell, opts: { worldDepth?: SoldierCrowdDepthScene } = {}) {
    const device = shell.device;
    // Campaign soldiers sort against campaign geometry, which weights ground vs
    // height differently than battle. Swap only the depth function; battle keeps
    // the unchanged WGSL.
    const wgsl = opts.worldDepth === 'campaign'
      ? SHADOW_WGSL.replace('civsimBattleWorldDepth3d(world)', 'civsimCampaignWorldDepth3d(world)')
      : SHADOW_WGSL;
    const module = compileShader(device, wgsl, `soldier-shadow-${opts.worldDepth ?? 'battle'}`);
    this.pipeline = device.createRenderPipeline({
      label: 'soldier-shadow-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
          { arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }] },
        ],
      },
      fragment: { module, entryPoint: 'fs', targets: [gpuAlphaBlendColorTarget(shell.info.format)] },
      primitive: { topology: 'triangle-strip' },
      depthStencil: gpuWorldDepthStencil('read'),
      multisample: gpuMultisample(shell.sampleCount),
    });
    this.quadBuffer = device.createBuffer({ label: 'soldier-shadow-quad', size: 8 * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.quadBuffer, 0, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    this.instanceBuffer = device.createBuffer({ label: 'soldier-shadow-empty', size: 4 * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }

  upload(instances: CrowdInstance[], opts: { radius?: number } = {}) {
    this.count = instances.length;
    if (instances.length > this.capacity) {
      this.capacity = Math.max(instances.length, this.capacity * 2, 256);
      this.instanceBuffer = this.shell.device.createBuffer({
        label: 'soldier-shadow-instances',
        size: this.capacity * 4 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (instances.length === 0) return;
    const radius = opts.radius ?? 0.62;
    const data = new Float32Array(instances.length * 4);
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const o = i * 4;
      data[o] = inst.x;
      data[o + 1] = inst.y;
      data[o + 2] = radius * (inst.mounted ? 1.5 : 1) * (inst.alive ? 1 : 1.25);
      data[o + 3] = inst.elevation ?? 0;
    }
    this.shell.device.queue.writeBuffer(this.instanceBuffer, 0, data);
  }

  draw(pass: WorldRenderPass) {
    if (this.count === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.draw(4, this.count);
  }

  stats(): SoldierShadowStats {
    return { shadows: this.count, cameraContract: 'shared-world-camera-wgsl' };
  }
}
