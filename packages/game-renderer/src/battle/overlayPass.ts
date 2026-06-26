import type { RawFrameShell } from '../../../webgpu-core/src/frameShell';

export interface BattleOverlayStats {
  vertices: number;
  lineSegments: number;
}

const OVERLAY_WGSL = `
struct Camera { x:f32, y:f32, zoom:f32, cosP:f32, width:f32, height:f32, cosYaw:f32, sinYaw:f32 };
@group(0) @binding(0) var<uniform> cam: Camera;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vs(@location(0) world: vec2f, @location(1) color: vec4f) -> VsOut {
  let dx = world.x - cam.x;
  let dy = world.y - cam.y;
  let rx = dx * cam.cosYaw + dy * cam.sinYaw;
  let ry = -dx * cam.sinYaw + dy * cam.cosYaw;
  var out: VsOut;
  out.pos = vec4f((rx * cam.zoom) / (cam.width * 0.5), (ry * cam.zoom * cam.cosP) / (cam.height * 0.5), 0.0, 1.0);
  out.color = color;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  return in.color;
}`;

export class BattleOverlayPass {
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GPUBuffer;
  private capacity = 0;
  private vertexCount = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'battle-overlay-wgsl', code: OVERLAY_WGSL });
    this.pipeline = device.createRenderPipeline({
      label: 'battle-overlay-line-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x4' },
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
      primitive: { topology: 'line-list' },
    });
    this.vertexBuffer = device.createBuffer({
      label: 'battle-overlay-empty',
      size: 6 * 2 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(vertices: Float32Array) {
    this.vertexCount = Math.floor(vertices.length / 6);
    if (this.vertexCount > this.capacity) {
      this.capacity = Math.max(this.vertexCount, this.capacity * 2, 128);
      this.vertexBuffer = this.shell.device.createBuffer({
        label: 'battle-overlay-vertices',
        size: this.capacity * 6 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (vertices.length > 0) this.shell.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
  }

  draw(pass: GPURenderPassEncoder) {
    if (this.vertexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount);
  }

  stats(): BattleOverlayStats {
    return { vertices: this.vertexCount, lineSegments: Math.floor(this.vertexCount / 2) };
  }
}

export function selectedUnitOverlayVertices(opts: {
  x: number;
  y: number;
  facing: number;
  width: number;
  depth: number;
  selected?: boolean;
}): Float32Array {
  const verts: number[] = [];
  const gold: [number, number, number, number] = [1.0, 0.78, 0.22, 0.92];
  const ghost: [number, number, number, number] = [1.0, 0.92, 0.58, 0.70];
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

function pushRing(verts: number[], x: number, y: number, radius: number, segs: number, color: [number, number, number, number]) {
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
  color: [number, number, number, number],
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

function pushLine(verts: number[], x0: number, y0: number, x1: number, y1: number, color: [number, number, number, number]) {
  verts.push(x0, y0, ...color, x1, y1, ...color);
}
