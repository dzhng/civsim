import type { OverlayRenderPass, RawFrameShell } from '../../../webgpu-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../webgpu-core/src/cameraWgsl';
import { compileShader } from '../../../webgpu-core/src/compileShader';
import { webGpuAlphaBlendColorTarget } from '../../../webgpu-core/src/pipelineContracts';

export interface BattleEffectLineStats {
  vertices: number;
  lineSegments: number;
  cameraContract: 'shared-world-camera-wgsl';
}

const EFFECT_LINE_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
};

@vertex
fn vs(@location(0) world: vec2f, @location(1) color: vec3f) -> VsOut {
  var out: VsOut;
  out.pos = projectGround(world, 0.0);
  out.color = color;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  return vec4f(in.color, 0.92);
}`;

export class BattleEffectLinePass {
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GPUBuffer;
  private capacity = 0;
  private vertexCount = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = compileShader(device, EFFECT_LINE_WGSL, 'battle-effect-line');
    this.pipeline = device.createRenderPipeline({
      label: 'battle-effect-line-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 20,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x3' },
          ],
        }],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [webGpuAlphaBlendColorTarget(shell.info.format)],
      },
      primitive: { topology: 'line-list' },
    });
    this.vertexBuffer = device.createBuffer({
      label: 'battle-effect-line-empty',
      size: 5 * 2 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(vertices: Float32Array) {
    this.vertexCount = Math.floor(vertices.length / 5);
    if (this.vertexCount > this.capacity) {
      this.capacity = Math.max(this.vertexCount, this.capacity * 2, 128);
      this.vertexBuffer = this.shell.device.createBuffer({
        label: 'battle-effect-line-vertices',
        size: this.capacity * 5 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (vertices.length > 0) this.shell.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
  }

  draw(pass: OverlayRenderPass) {
    if (this.vertexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount);
  }

  stats(): BattleEffectLineStats {
    return { vertices: this.vertexCount, lineSegments: Math.floor(this.vertexCount / 2), cameraContract: 'shared-world-camera-wgsl' };
  }
}
