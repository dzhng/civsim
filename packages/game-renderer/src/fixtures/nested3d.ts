import type { RawFrameShell } from '../../../webgpu-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../webgpu-core/src/cameraWgsl';

export interface Nested3dFixtureStats {
  layer: 'depth-tested-nested-3d-fixture';
  vertices: number;
  drawCalls: number;
  depthFormat: 'depth24plus';
  fixtures: string[];
  drawOrder: string;
}

const NESTED_3D_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) shade: f32,
};

fn projectWorld(world: vec3f) -> vec4f {
  return projectWorld3d(world, worldDepth3d(world, 0.48, 0.028, 0.003));
}

@vertex
fn vs(@location(0) world: vec3f, @location(1) color: vec4f) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld(world);
  out.color = color;
  out.shade = clamp(world.z / 5.2, 0.0, 1.0);
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let warm = vec3f(1.08, 1.02, 0.86);
  let cool = vec3f(0.72, 0.78, 0.86);
  let lit = mix(cool, warm, in.shade) * in.color.rgb;
  return vec4f(lit, in.color.a);
}`;

export class Nested3dFixturePass {
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GPUBuffer;
  private vertexCount: number;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'nested-3d-fixture-wgsl', code: NESTED_3D_WGSL });
    this.pipeline = device.createRenderPipeline({
      label: 'nested-3d-fixture-depth-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 28,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x4' },
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
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });
    const vertices = buildNestedFixtureVertices();
    this.vertexCount = vertices.length / 7;
    this.vertexBuffer = device.createBuffer({
      label: 'nested-3d-fixture-vertices',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
  }

  draw(pass: GPURenderPassEncoder) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount);
  }

  stats(): Nested3dFixtureStats {
    return {
      layer: 'depth-tested-nested-3d-fixture',
      vertices: this.vertexCount,
      drawCalls: 1,
      depthFormat: 'depth24plus',
      fixtures: ['flag-in-city', 'garrison-in-city-stub', 'rank-overlap', 'ground-ring-occlusion'],
      drawOrder: 'occluders are submitted before late flag/ring geometry; depth test must still hide covered pixels',
    };
  }
}

type Rgba = [number, number, number, number];
type Vec3 = [number, number, number];

function buildNestedFixtureVertices() {
  const mesh = new FixtureMesh();
  const sandstone: Rgba = [0.78, 0.66, 0.43, 1];
  const roof: Rgba = [0.62, 0.32, 0.22, 1];
  const wallShade: Rgba = [0.60, 0.49, 0.34, 1];
  const redFlag: Rgba = [0.82, 0.10, 0.09, 0.96];
  const timber: Rgba = [0.28, 0.20, 0.12, 1];
  const playerBlue: Rgba = [0.16, 0.34, 0.78, 1];
  const enemyRed: Rgba = [0.70, 0.16, 0.12, 1];
  const selection: Rgba = [0.18, 0.88, 0.32, 0.72];

  mesh.groundRing([-2.2, -0.55], 3.25, 1.28, 0.11, selection);

  // Settlement occluders are submitted before the standard. If depth is absent,
  // the later red cloth paints through the wall.
  mesh.panel([[-5.0, -1.25, 0.0], [1.0, -1.25, 0.0], [1.0, -1.25, 2.85], [-5.0, -1.25, 2.85]], sandstone);
  mesh.panel([[-4.7, -1.32, 2.85], [0.6, -1.32, 2.85], [0.15, -1.32, 3.55], [-4.2, -1.32, 3.55]], roof);
  mesh.panel([[-4.9, -0.15, 0.0], [-3.7, -0.15, 0.0], [-3.7, -0.15, 2.25], [-4.9, -0.15, 2.25]], wallShade);
  mesh.panel([[-1.8, -0.05, 0.0], [-0.4, -0.05, 0.0], [-0.4, -0.05, 2.2], [-1.8, -0.05, 2.2]], wallShade);
  mesh.panel([[-1.95, -0.12, 2.2], [-0.25, -0.12, 2.2], [-0.48, -0.12, 2.82], [-1.72, -0.12, 2.82]], roof);
  mesh.panel([[-3.1, -1.36, 0.02], [-2.1, -1.36, 0.02], [-2.1, -1.36, 1.65], [-3.1, -1.36, 1.65]], [0.46, 0.36, 0.24, 1]);

  // Late-submitted standard planted behind the front city wall.
  mesh.panel([[-2.70, 0.08, 0.0], [-2.54, 0.08, 0.0], [-2.54, 0.08, 5.1], [-2.70, 0.08, 5.1]], timber);
  mesh.panel([[-2.54, 0.10, 2.38], [0.10, 0.10, 2.36], [-0.24, 0.10, 3.18], [0.10, 0.10, 4.02], [-2.54, 0.10, 4.20]], redFlag);

  // Future garrison case: a small army token partly inside the settlement.
  mesh.panel([[-3.48, -0.72, 0.06], [-3.08, -0.72, 0.06], [-3.08, -0.72, 1.20], [-3.48, -0.72, 1.20]], playerBlue);
  mesh.panel([[-2.92, -0.52, 0.06], [-2.52, -0.52, 0.06], [-2.52, -0.52, 1.20], [-2.92, -0.52, 1.20]], playerBlue);

  // Battle rank overlap: rear red rank is submitted after the front blue rank.
  mesh.panel([[2.45, -1.20, 0.0], [5.55, -1.20, 0.0], [5.55, -1.20, 1.85], [2.45, -1.20, 1.85]], playerBlue);
  mesh.panel([[3.05, 0.05, 0.08], [6.15, 0.05, 0.08], [6.15, 0.05, 1.95], [3.05, 0.05, 1.95]], enemyRed);
  mesh.panel([[2.70, -1.32, 1.85], [5.30, -1.32, 1.85], [5.05, -1.32, 2.22], [2.95, -1.32, 2.22]], [0.83, 0.72, 0.45, 1]);

  return new Float32Array(mesh.vertices);
}

class FixtureMesh {
  readonly vertices: number[] = [];

  panel(points: Vec3[], color: Rgba) {
    if (points.length < 3) return;
    for (let i = 1; i < points.length - 1; i++) {
      this.vertex(points[0], color);
      this.vertex(points[i], color);
      this.vertex(points[i + 1], color);
    }
  }

  groundRing(center: [number, number], rx: number, ry: number, thickness: number, color: Rgba) {
    const segments = 48;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const outer0: Vec3 = [center[0] + Math.cos(a0) * rx, center[1] + Math.sin(a0) * ry, 0.035];
      const outer1: Vec3 = [center[0] + Math.cos(a1) * rx, center[1] + Math.sin(a1) * ry, 0.035];
      const inner0: Vec3 = [center[0] + Math.cos(a0) * (rx - thickness), center[1] + Math.sin(a0) * (ry - thickness), 0.035];
      const inner1: Vec3 = [center[0] + Math.cos(a1) * (rx - thickness), center[1] + Math.sin(a1) * (ry - thickness), 0.035];
      this.panel([outer0, outer1, inner1, inner0], color);
    }
  }

  private vertex(point: Vec3, color: Rgba) {
    this.vertices.push(...point, ...color);
  }
}
