import type { OverlayRenderPass, RawFrameShell } from '../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';
import { compileShader } from '../../../renderer-core/src/compileShader';
import { gpuAlphaBlendColorTarget, gpuMultisample } from '../../../renderer-core/src/pipelineContracts';

// Short-lived impact particles — dust on a footfall/hit, blood on a wound —
// driven by the battle event stream. Instanced soft quads that fade and rise
// with age. Capped so peak combat stays in budget; the cap is logged in stats.

export type ParticleKind = 'dust' | 'blood';

export interface BattleParticle {
  x: number;
  y: number;
  z: number;
  /** 0 = just spawned, 1 = expired (culled). */
  age: number;
  kind: ParticleKind;
  size: number;
}

export interface BattleParticleStats {
  particles: number;
  capped: number;
  cameraContract: 'shared-world-camera-wgsl';
}

const MAX_PARTICLES = 4096;

const PARTICLE_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut { @builtin(position) pos: vec4f, @location(0) local: vec2f, @location(1) color: vec3f, @location(2) alpha: f32 };
@vertex
fn vs(@location(0) quad: vec2f, @location(1) inst: vec4f, @location(2) instMeta: vec4f) -> VsOut {
  // inst = (x, y, z, age); meta = (size, kind, 0, 0)
  let age = inst.w;
  let rise = age * 0.9;
  let grow = mix(0.6, 1.4, age);
  let world = vec3f(inst.x + quad.x * instMeta.x * grow, inst.y, inst.z + rise + quad.y * instMeta.x * grow);
  var out: VsOut;
  out.pos = projectWorld3d(world, 0.05);
  out.local = quad;
  let dust = vec3f(0.74, 0.66, 0.49);
  let blood = vec3f(0.42, 0.06, 0.05);
  out.color = select(dust, blood, instMeta.y > 0.5);
  out.alpha = (1.0 - age) * select(0.5, 0.8, instMeta.y > 0.5);
  return out;
}
@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let d = length(in.local);
  if (d > 1.0) { discard; }
  return vec4f(in.color, in.alpha * (1.0 - d * d));
}`;

export class BattleParticlePass {
  private pipeline: GPURenderPipeline;
  private quadBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer;
  private metaBuffer: GPUBuffer;
  private capacity = 0;
  private count = 0;
  private cappedLast = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = compileShader(device, PARTICLE_WGSL, 'battle-particle');
    this.pipeline = device.createRenderPipeline({
      label: 'battle-particle-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
          { arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }] },
          { arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x4' }] },
        ],
      },
      fragment: { module, entryPoint: 'fs', targets: [gpuAlphaBlendColorTarget(shell.info.format)] },
      primitive: { topology: 'triangle-strip' },
      multisample: gpuMultisample(shell.sampleCount),
    });
    this.quadBuffer = device.createBuffer({ label: 'battle-particle-quad', size: 8 * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.quadBuffer, 0, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    this.instanceBuffer = device.createBuffer({ label: 'battle-particle-empty', size: 4 * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.metaBuffer = device.createBuffer({ label: 'battle-particle-meta-empty', size: 4 * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }

  upload(particles: BattleParticle[]) {
    const live = particles.filter((p) => p.age < 1);
    this.cappedLast = Math.max(0, live.length - MAX_PARTICLES);
    const used = live.slice(0, MAX_PARTICLES);
    this.count = used.length;
    if (this.count > this.capacity) {
      this.capacity = Math.max(this.count, this.capacity * 2, 256);
      this.instanceBuffer = this.shell.device.createBuffer({ label: 'battle-particle-instances', size: this.capacity * 16, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      this.metaBuffer = this.shell.device.createBuffer({ label: 'battle-particle-meta', size: this.capacity * 16, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    if (this.count === 0) return;
    const inst = new Float32Array(this.count * 4);
    const meta = new Float32Array(this.count * 4);
    for (let i = 0; i < this.count; i++) {
      const p = used[i];
      inst[i * 4] = p.x; inst[i * 4 + 1] = p.y; inst[i * 4 + 2] = p.z; inst[i * 4 + 3] = p.age;
      meta[i * 4] = p.size; meta[i * 4 + 1] = p.kind === 'blood' ? 1 : 0;
    }
    this.shell.device.queue.writeBuffer(this.instanceBuffer, 0, inst);
    this.shell.device.queue.writeBuffer(this.metaBuffer, 0, meta);
    if (this.cappedLast > 0) {
      console.warn(`battle particles capped: ${this.cappedLast} over ${MAX_PARTICLES}`);
    }
  }

  draw(pass: OverlayRenderPass) {
    if (this.count === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.setVertexBuffer(2, this.metaBuffer);
    pass.draw(4, this.count);
  }

  stats(): BattleParticleStats {
    return { particles: this.count, capped: this.cappedLast, cameraContract: 'shared-world-camera-wgsl' };
  }
}
