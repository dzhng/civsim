import type { RawFrameShell, WorldRenderPass } from '../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';
import { compileShader } from '../../../renderer-core/src/compileShader';
import { gpuAlphaBlendColorTarget, gpuMultisample, gpuWorldDepthStencil } from '../../../renderer-core/src/pipelineContracts';

export interface BattleGroundCueStats {
  vertices: number;
  lineSegments: number;
  cameraContract: 'shared-world-camera-wgsl';
}

const GROUND_CUE_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
};

@vertex
fn vs(@location(0) world: vec2f, @location(1) color: vec3f) -> VsOut {
  var out: VsOut;
  out.pos = projectGround(world, civsimBattleWorldDepth3d(vec3f(world, 0.02)));
  out.color = color;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  return vec4f(in.color, 0.88);
}`;

export class BattleGroundCuePass {
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GPUBuffer;
  private capacity = 0;
  private vertexCount = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = compileShader(device, GROUND_CUE_WGSL, 'battle-ground-cue');
    this.pipeline = device.createRenderPipeline({
      label: 'battle-ground-cue-line-pipeline',
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
        targets: [gpuAlphaBlendColorTarget(shell.info.format)],
      },
      primitive: { topology: 'line-list' },
      depthStencil: gpuWorldDepthStencil('read'),
      multisample: gpuMultisample(shell.sampleCount),
    });
    this.vertexBuffer = device.createBuffer({
      label: 'battle-ground-cue-empty',
      size: 5 * 2 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(vertices: Float32Array) {
    this.vertexCount = Math.floor(vertices.length / 5);
    if (this.vertexCount > this.capacity) {
      this.capacity = Math.max(this.vertexCount, this.capacity * 2, 128);
      this.vertexBuffer = this.shell.device.createBuffer({
        label: 'battle-ground-cue-vertices',
        size: this.capacity * 5 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (vertices.length > 0) this.shell.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
  }

  draw(pass: WorldRenderPass) {
    if (this.vertexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount);
  }

  stats(): BattleGroundCueStats {
    return { vertices: this.vertexCount, lineSegments: Math.floor(this.vertexCount / 2), cameraContract: 'shared-world-camera-wgsl' };
  }
}

export function selectedUnitGroundCueVertices(opts: {
  x: number;
  y: number;
  facing: number;
  width: number;
  depth: number;
  selected?: boolean;
}): Float32Array {
  const verts: number[] = [];
  const gold: [number, number, number] = [1.0, 0.78, 0.22];
  const ghost: [number, number, number] = [1.0, 0.92, 0.58];
  pushRing(verts, opts.x, opts.y, Math.max(8, Math.min(24, opts.width * 0.48)), 24, gold);
  pushGhost(
    verts,
    opts.x + Math.cos(opts.facing) * Math.max(28, opts.depth * 1.35),
    opts.y + Math.sin(opts.facing) * Math.max(28, opts.depth * 1.35),
    opts.facing,
    opts.width,
    opts.depth,
    ghost,
  );
  return new Float32Array(verts);
}

function pushRing(verts: number[], x: number, y: number, radius: number, segs: number, color: [number, number, number]) {
  for (let s = 0; s < segs; s++) {
    const a0 = (s / segs) * Math.PI * 2;
    const a1 = ((s + 1) / segs) * Math.PI * 2;
    pushLine(verts, x + Math.cos(a0) * radius, y + Math.sin(a0) * radius, x + Math.cos(a1) * radius, y + Math.sin(a1) * radius, color);
  }
}

function pushGhost(
  verts: number[],
  x: number,
  y: number,
  facing: number,
  width: number,
  depth: number,
  color: [number, number, number],
) {
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  const rx = fy;
  const ry = -fx;
  const hw = width * 0.5;
  const corners: [number, number][] = [
    [x + rx * hw, y + ry * hw],
    [x - rx * hw, y - ry * hw],
    [x - rx * hw - fx * depth, y - ry * hw - fy * depth],
    [x + rx * hw - fx * depth, y + ry * hw - fy * depth],
  ];
  for (let k = 0; k < 4; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % 4];
    pushLine(verts, a[0], a[1], b[0], b[1], color);
  }
  pushLine(verts, x, y, x + fx * 9, y + fy * 9, color);
}

function pushLine(verts: number[], x0: number, y0: number, x1: number, y1: number, color: [number, number, number]) {
  verts.push(x0, y0, ...color, x1, y1, ...color);
}
