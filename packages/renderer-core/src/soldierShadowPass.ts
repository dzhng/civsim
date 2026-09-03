import type { RawFrameShell, WorldRenderPass } from './frameShell';
import { WORLD_CAMERA_WGSL } from './cameraWgsl';
import { compileShader } from './compileShader';
import { GrowableBuffer, makeVertexBuffer } from './gpuBuffers';
import { cameraOnlyPipeline } from './pipelineContracts';
import type { CrowdInstance } from '../../crowd-runtime/src/instanceData';

// A grounding shadow per soldier: a soft dark ellipse on the terrain surface at
// the soldier's (x, y, elevation), so each figure is anchored to the ground
// beneath it. Shared by battle and campaign — the crowd instances drive it.

interface SoldierShadowStats {
  shadows: number;
  cameraContract: 'shared-world-camera-wgsl';
}

const SHADOW_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut { @builtin(position) pos: vec4f, @location(0) local: vec2f };
@vertex
fn vs(@location(0) quad: vec2f, @location(1) inst: vec4f) -> VsOut {
  // inst = (x, y, radius, elevation)
  let world = vec3f(inst.x + quad.x * inst.z, inst.y + quad.y * inst.z, inst.w + 0.015);
  var out: VsOut;
  out.pos = projectWorld(world);
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
  private instanceBuffer: GrowableBuffer;
  private count = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = compileShader(device, SHADOW_WGSL, 'soldier-shadow');
    this.pipeline = cameraOnlyPipeline(shell, {
      label: 'soldier-shadow-pipeline',
      module,
      buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
          { arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }] },
      ],
      target: 'alpha',
      depth: 'read',
      topology: 'triangle-strip',
    });
    this.quadBuffer = makeVertexBuffer(device, 'soldier-shadow-quad', new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    this.instanceBuffer = new GrowableBuffer(device, 'soldier-shadow-instances', GPUBufferUsage.VERTEX, 256 * 4 * 4);
  }

  upload(instances: CrowdInstance[], opts: { radius?: number } = {}) {
    this.count = instances.length;
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
    this.instanceBuffer.write(data);
  }

  draw(pass: WorldRenderPass) {
    if (this.count === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer.buffer);
    pass.draw(4, this.count);
  }

  stats(): SoldierShadowStats {
    return { shadows: this.count, cameraContract: 'shared-world-camera-wgsl' };
  }
}
