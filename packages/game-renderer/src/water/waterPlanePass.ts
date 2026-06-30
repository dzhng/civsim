import type { RawFrameShell, WorldRenderPass } from '../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';
import { compileShader } from '../../../renderer-core/src/compileShader';
import { gpuMultisample, gpuOpaqueColorTarget, gpuWorldDepthStencil } from '../../../renderer-core/src/pipelineContracts';
import type { WaterFieldSource } from './waterField';

// The candidate-agnostic open-sea pass: one tessellated plane at the battle
// horizon camera, displaced and shaded entirely through a `WaterFieldSource`.
// It calls `field.wgslSample()` to inline the field into its shader and binds
// `field.bindGroup()` at group(1) when the field has one — it never branches on
// which technique is live. Shading here is deliberately neutral grey (albedo and
// the env-preset grade arrive in later slices); this slice judges geometry, foam
// and glint, not colour.

export interface WaterPlaneRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Grid cells per side; the plane has (res+1)² vertices. */
  res: number;
}

export const DEFAULT_WATER_PLANE: WaterPlaneRect = { x0: -360, y0: -160, x1: 360, y1: 1000, res: 240 };

export class WaterPlanePass {
  private readonly shell: RawFrameShell;
  private readonly field: WaterFieldSource;
  private readonly pipeline: GPURenderPipeline;
  private readonly vertexBuffer: GPUBuffer;
  private readonly indexBuffer: GPUBuffer;
  private readonly indexCount: number;

  constructor(shell: RawFrameShell, field: WaterFieldSource, rect: WaterPlaneRect = DEFAULT_WATER_PLANE) {
    this.shell = shell;
    this.field = field;
    const device = shell.device;

    const { vertices, indices } = buildGrid(rect);
    this.indexCount = indices.length;
    this.vertexBuffer = device.createBuffer({ label: 'water-plane-verts', size: vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
    this.indexBuffer = device.createBuffer({ label: 'water-plane-indices', size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.indexBuffer, 0, indices);

    const fieldLayout = field.bindGroupLayout();
    const bindGroupLayouts = fieldLayout ? [shell.cameraBindGroupLayout, fieldLayout] : [shell.cameraBindGroupLayout];
    const module = compileShader(device, waterPlaneWgsl(field.wgslSample()), `water-plane-${field.id}`);
    this.pipeline = device.createRenderPipeline({
      label: `water-plane-${field.id}-pipeline`,
      layout: device.createPipelineLayout({ bindGroupLayouts }),
      vertex: { module, entryPoint: 'vs', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
      fragment: { module, entryPoint: 'fs', targets: [gpuOpaqueColorTarget(shell.info.format)] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: gpuWorldDepthStencil('read-write'),
      multisample: gpuMultisample(shell.sampleCount),
    });
  }

  draw(pass: WorldRenderPass) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    const group = this.field.bindGroup();
    if (group) pass.setBindGroup(1, group);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint32');
    pass.drawIndexed(this.indexCount);
  }

  destroy() {
    this.vertexBuffer.destroy();
    this.indexBuffer.destroy();
  }
}

function buildGrid(rect: WaterPlaneRect): { vertices: Float32Array; indices: Uint32Array } {
  const { x0, y0, x1, y1, res } = rect;
  const side = res + 1;
  const vertices = new Float32Array(side * side * 2);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const o = (j * side + i) * 2;
      vertices[o] = x0 + ((x1 - x0) * i) / res;
      vertices[o + 1] = y0 + ((y1 - y0) * j) / res;
    }
  }
  const indices = new Uint32Array(res * res * 6);
  let k = 0;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }
  return { vertices, indices };
}

function waterPlaneWgsl(fieldWgsl: string): string {
  return `
${WORLD_CAMERA_WGSL}
${fieldWgsl}

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) world: vec2f,
  @location(1) normal: vec3f,
  @location(2) foam: f32,
};

@vertex
fn vs(@location(0) world: vec2f) -> VsOut {
  let s = waterField(world, cam.time);
  let p3 = vec3f(world, s.height);
  var out: VsOut;
  out.pos = projectWorld3d(p3, civsimBattleWorldDepth3d(p3));
  out.world = world;
  out.normal = s.normal;
  out.foam = s.foam;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let sun = normalize(vec3f(-0.40, -0.28, 0.87));
  let n = normalize(in.normal);
  let lambert = clamp(dot(n, sun), 0.0, 1.0);
  // Neutral grey water albedo — colour/depth grade is a later slice. The shape,
  // glint and foam are what this slice judges.
  let base = vec3f(0.32, 0.35, 0.38);
  var col = base * (0.42 + 0.58 * lambert);
  // Specular sun glint along the reflection of the low sun.
  let viewUp = vec3f(0.0, 0.0, 1.0);
  let half = normalize(sun + viewUp);
  let spec = pow(clamp(dot(n, half), 0.0, 1.0), 64.0);
  col = col + vec3f(0.85, 0.86, 0.82) * spec * 0.35;
  // Grazing sky reflection.
  let fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
  col = mix(col, vec3f(0.55, 0.58, 0.62), fres * 0.30);
  // Whitecaps.
  col = mix(col, vec3f(0.92, 0.93, 0.95), clamp(in.foam, 0.0, 1.0));
  return vec4f(col, 1.0);
}`;
}
