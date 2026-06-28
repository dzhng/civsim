import type { RawFrameShell, WorldRenderPass } from '../../../webgpu-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../webgpu-core/src/cameraWgsl';
import { webGpuAlphaBlendColorTarget, webGpuOpaqueColorTarget, webGpuWorldDepthStencil } from '../../../webgpu-core/src/pipelineContracts';
import { buildBroadleafTreeMesh, buildConiferTreeMesh, buildMountainMesh, buildRockMesh } from '../models/shared/sceneryPropModels';

export type CampaignSceneryKind = 'mountain' | 'tree' | 'conifer' | 'broadleaf' | 'rock';

export interface CampaignSceneryInstance {
  x: number;
  y: number;
  z?: number;
  size: number;
  height?: number;
  kind: CampaignSceneryKind;
  shade?: number;
  /** per-instance yaw (radians) so cloned meshes don't all face the same way */
  yaw?: number;
}

const SCENERY_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
  @location(1) alpha: f32,
  @location(2) light: f32,
  @location(3) shade: f32,
};

@vertex
fn vs(
  @location(0) local: vec3f,
  @location(1) normal: vec3f,
  @location(2) colorAndAlpha: vec4f,
  @location(3) instPose: vec4f,
  @location(4) instStyle: vec4f,
) -> VsOut {
  let scale = instPose.z;
  let baseZ = instPose.w;
  let heightScale = instStyle.y;
  // Per-instance yaw so a few cloned meshes read as a varied range, not a field
  // of identical props all facing the same way.
  let yaw = instStyle.z;
  let cy = cos(yaw);
  let sy = sin(yaw);
  let rlx = local.x * cy - local.y * sy;
  let rly = local.x * sy + local.y * cy;
  let world = vec3f(instPose.x + rlx * scale, instPose.y + rly * scale, baseZ + local.z * heightScale);
  var out: VsOut;
  out.pos = projectWorld3d(world, civsimCampaignWorldDepth3d(world));
  let sun = normalize(vec3f(-0.42, -0.34, 0.84));
  let rnormal = vec3f(normal.x * cy - normal.y * sy, normal.x * sy + normal.y * cy, normal.z);
  out.color = colorAndAlpha.rgb;
  out.alpha = colorAndAlpha.a;
  out.light = clamp(dot(normalize(rnormal), sun) * 0.34 + 0.78, 0.48, 1.14);
  out.shade = clamp(instStyle.x, 0.0, 1.0);
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let warmKey = vec3f(1.08, 1.00, 0.82);
  let coolFill = vec3f(0.72, 0.77, 0.82);
  let grade = mix(coolFill, warmKey, clamp((in.light - 0.48) / 0.66, 0.0, 1.0));
  let variation = 0.88 + in.shade * 0.18;
  let col = clamp(in.color * in.light * grade * variation, vec3f(0.0), vec3f(1.0));
  return vec4f(col, in.alpha);
}`;

export class CampaignSceneryPass {
  private opaquePipeline: GPURenderPipeline;
  private shadowPipeline: GPURenderPipeline;
  private mountainMesh = buildMountainMesh();
  private coniferMesh = buildConiferTreeMesh();
  private broadleafMesh = buildBroadleafTreeMesh();
  private rockMesh = buildRockMesh();
  private mountainVertexBuffer: GPUBuffer;
  private mountainIndexBuffer: GPUBuffer;
  private mountainShadowVertexBuffer: GPUBuffer;
  private mountainShadowIndexBuffer: GPUBuffer;
  private coniferVertexBuffer: GPUBuffer;
  private coniferIndexBuffer: GPUBuffer;
  private coniferShadowVertexBuffer: GPUBuffer;
  private coniferShadowIndexBuffer: GPUBuffer;
  private broadleafVertexBuffer: GPUBuffer;
  private broadleafIndexBuffer: GPUBuffer;
  private broadleafShadowVertexBuffer: GPUBuffer;
  private broadleafShadowIndexBuffer: GPUBuffer;
  private rockVertexBuffer: GPUBuffer;
  private rockIndexBuffer: GPUBuffer;
  private rockShadowVertexBuffer: GPUBuffer;
  private rockShadowIndexBuffer: GPUBuffer;
  private mountainInstanceBuffer: GPUBuffer;
  private coniferInstanceBuffer: GPUBuffer;
  private broadleafInstanceBuffer: GPUBuffer;
  private rockInstanceBuffer: GPUBuffer;
  private mountainCapacity = 0;
  private coniferCapacity = 0;
  private broadleafCapacity = 0;
  private rockCapacity = 0;
  private mountainCount = 0;
  private coniferCount = 0;
  private broadleafCount = 0;
  private rockCount = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-scenery-mesh-wgsl', code: SCENERY_WGSL });
    this.opaquePipeline = this.makePipeline(module, 'opaque');
    this.shadowPipeline = this.makePipeline(module, 'shadow');
    this.mountainVertexBuffer = makeVertexBuffer(device, 'campaign-mountain-vertices', this.mountainMesh.opaque.vertices);
    this.mountainIndexBuffer = makeIndexBuffer(device, 'campaign-mountain-indices', this.mountainMesh.opaque.indices);
    this.mountainShadowVertexBuffer = makeVertexBuffer(device, 'campaign-mountain-shadow-vertices', this.mountainMesh.shadow.vertices);
    this.mountainShadowIndexBuffer = makeIndexBuffer(device, 'campaign-mountain-shadow-indices', this.mountainMesh.shadow.indices);
    this.coniferVertexBuffer = makeVertexBuffer(device, 'campaign-conifer-vertices', this.coniferMesh.opaque.vertices);
    this.coniferIndexBuffer = makeIndexBuffer(device, 'campaign-conifer-indices', this.coniferMesh.opaque.indices);
    this.coniferShadowVertexBuffer = makeVertexBuffer(device, 'campaign-conifer-shadow-vertices', this.coniferMesh.shadow.vertices);
    this.coniferShadowIndexBuffer = makeIndexBuffer(device, 'campaign-conifer-shadow-indices', this.coniferMesh.shadow.indices);
    this.broadleafVertexBuffer = makeVertexBuffer(device, 'campaign-broadleaf-vertices', this.broadleafMesh.opaque.vertices);
    this.broadleafIndexBuffer = makeIndexBuffer(device, 'campaign-broadleaf-indices', this.broadleafMesh.opaque.indices);
    this.broadleafShadowVertexBuffer = makeVertexBuffer(device, 'campaign-broadleaf-shadow-vertices', this.broadleafMesh.shadow.vertices);
    this.broadleafShadowIndexBuffer = makeIndexBuffer(device, 'campaign-broadleaf-shadow-indices', this.broadleafMesh.shadow.indices);
    this.rockVertexBuffer = makeVertexBuffer(device, 'campaign-rock-vertices', this.rockMesh.opaque.vertices);
    this.rockIndexBuffer = makeIndexBuffer(device, 'campaign-rock-indices', this.rockMesh.opaque.indices);
    this.rockShadowVertexBuffer = makeVertexBuffer(device, 'campaign-rock-shadow-vertices', this.rockMesh.shadow.vertices);
    this.rockShadowIndexBuffer = makeIndexBuffer(device, 'campaign-rock-shadow-indices', this.rockMesh.shadow.indices);
    this.mountainInstanceBuffer = makeEmptyInstanceBuffer(device, 'campaign-mountain-empty-instances');
    this.coniferInstanceBuffer = makeEmptyInstanceBuffer(device, 'campaign-conifer-empty-instances');
    this.broadleafInstanceBuffer = makeEmptyInstanceBuffer(device, 'campaign-broadleaf-empty-instances');
    this.rockInstanceBuffer = makeEmptyInstanceBuffer(device, 'campaign-rock-empty-instances');
  }

  private makePipeline(module: GPUShaderModule, material: 'opaque' | 'shadow') {
    const device = this.shell.device;
    return device.createRenderPipeline({
      label: material === 'opaque' ? 'campaign-scenery-opaque-depth-pipeline' : 'campaign-scenery-shadow-decal-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: 40,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32x4' },
            ],
          },
          {
            arrayStride: 32,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 3, offset: 0, format: 'float32x4' },
              { shaderLocation: 4, offset: 16, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          material === 'opaque'
            ? webGpuOpaqueColorTarget(this.shell.info.format)
            : webGpuAlphaBlendColorTarget(this.shell.info.format),
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: webGpuWorldDepthStencil(material === 'opaque' ? 'read-write' : 'read'),
    });
  }

  upload(instances: CampaignSceneryInstance[]) {
    const mountains = instances.filter((inst) => inst.kind === 'mountain');
    const conifers = instances.filter((inst) => inst.kind === 'tree' || inst.kind === 'conifer');
    const broadleafs = instances.filter((inst) => inst.kind === 'broadleaf');
    const rocks = instances.filter((inst) => inst.kind === 'rock');
    this.mountainCount = mountains.length;
    this.coniferCount = conifers.length;
    this.broadleafCount = broadleafs.length;
    this.rockCount = rocks.length;
    this.mountainInstanceBuffer = this.ensureInstanceBuffer(this.mountainInstanceBuffer, 'campaign-mountain-instances', mountains.length, 'mountain');
    this.coniferInstanceBuffer = this.ensureInstanceBuffer(this.coniferInstanceBuffer, 'campaign-conifer-instances', conifers.length, 'conifer');
    this.broadleafInstanceBuffer = this.ensureInstanceBuffer(this.broadleafInstanceBuffer, 'campaign-broadleaf-instances', broadleafs.length, 'broadleaf');
    this.rockInstanceBuffer = this.ensureInstanceBuffer(this.rockInstanceBuffer, 'campaign-rock-instances', rocks.length, 'rock');
    if (mountains.length > 0) this.shell.device.queue.writeBuffer(this.mountainInstanceBuffer, 0, packInstances(mountains));
    if (conifers.length > 0) this.shell.device.queue.writeBuffer(this.coniferInstanceBuffer, 0, packInstances(conifers));
    if (broadleafs.length > 0) this.shell.device.queue.writeBuffer(this.broadleafInstanceBuffer, 0, packInstances(broadleafs));
    if (rocks.length > 0) this.shell.device.queue.writeBuffer(this.rockInstanceBuffer, 0, packInstances(rocks));
  }

  drawShadows(pass: WorldRenderPass) {
    if (this.mountainCount + this.coniferCount + this.broadleafCount + this.rockCount === 0) return;
    pass.setPipeline(this.shadowPipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    if (this.mountainCount > 0) {
      pass.setVertexBuffer(0, this.mountainShadowVertexBuffer);
      pass.setVertexBuffer(1, this.mountainInstanceBuffer);
      pass.setIndexBuffer(this.mountainShadowIndexBuffer, 'uint16');
      pass.drawIndexed(this.mountainMesh.shadow.indexCount, this.mountainCount);
    }
    if (this.coniferCount > 0) {
      pass.setVertexBuffer(0, this.coniferShadowVertexBuffer);
      pass.setVertexBuffer(1, this.coniferInstanceBuffer);
      pass.setIndexBuffer(this.coniferShadowIndexBuffer, 'uint16');
      pass.drawIndexed(this.coniferMesh.shadow.indexCount, this.coniferCount);
    }
    if (this.broadleafCount > 0) {
      pass.setVertexBuffer(0, this.broadleafShadowVertexBuffer);
      pass.setVertexBuffer(1, this.broadleafInstanceBuffer);
      pass.setIndexBuffer(this.broadleafShadowIndexBuffer, 'uint16');
      pass.drawIndexed(this.broadleafMesh.shadow.indexCount, this.broadleafCount);
    }
    if (this.rockCount > 0) {
      pass.setVertexBuffer(0, this.rockShadowVertexBuffer);
      pass.setVertexBuffer(1, this.rockInstanceBuffer);
      pass.setIndexBuffer(this.rockShadowIndexBuffer, 'uint16');
      pass.drawIndexed(this.rockMesh.shadow.indexCount, this.rockCount);
    }
  }

  drawOpaque(pass: WorldRenderPass) {
    if (this.mountainCount + this.coniferCount + this.broadleafCount + this.rockCount === 0) return;
    pass.setPipeline(this.opaquePipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    if (this.mountainCount > 0) {
      pass.setVertexBuffer(0, this.mountainVertexBuffer);
      pass.setVertexBuffer(1, this.mountainInstanceBuffer);
      pass.setIndexBuffer(this.mountainIndexBuffer, 'uint16');
      pass.drawIndexed(this.mountainMesh.opaque.indexCount, this.mountainCount);
    }
    if (this.coniferCount > 0) {
      pass.setVertexBuffer(0, this.coniferVertexBuffer);
      pass.setVertexBuffer(1, this.coniferInstanceBuffer);
      pass.setIndexBuffer(this.coniferIndexBuffer, 'uint16');
      pass.drawIndexed(this.coniferMesh.opaque.indexCount, this.coniferCount);
    }
    if (this.broadleafCount > 0) {
      pass.setVertexBuffer(0, this.broadleafVertexBuffer);
      pass.setVertexBuffer(1, this.broadleafInstanceBuffer);
      pass.setIndexBuffer(this.broadleafIndexBuffer, 'uint16');
      pass.drawIndexed(this.broadleafMesh.opaque.indexCount, this.broadleafCount);
    }
    if (this.rockCount > 0) {
      pass.setVertexBuffer(0, this.rockVertexBuffer);
      pass.setVertexBuffer(1, this.rockInstanceBuffer);
      pass.setIndexBuffer(this.rockIndexBuffer, 'uint16');
      pass.drawIndexed(this.rockMesh.opaque.indexCount, this.rockCount);
    }
  }

  stats() {
    return {
      scenery: this.mountainCount + this.coniferCount + this.broadleafCount + this.rockCount,
      mountains: this.mountainCount,
      trees: this.coniferCount + this.broadleafCount,
      conifers: this.coniferCount,
      broadleafs: this.broadleafCount,
      rocks: this.rockCount,
      mountainModelVertices: (this.mountainMesh.opaque.vertices.length + this.mountainMesh.shadow.vertices.length) / 10,
      coniferModelVertices: (this.coniferMesh.opaque.vertices.length + this.coniferMesh.shadow.vertices.length) / 10,
      broadleafModelVertices: (this.broadleafMesh.opaque.vertices.length + this.broadleafMesh.shadow.vertices.length) / 10,
      rockModelVertices: (this.rockMesh.opaque.vertices.length + this.rockMesh.shadow.vertices.length) / 10,
      materialClasses: ['opaque-depth-write', 'shadow-depth-read'] as const,
      layer: 'raw-webgpu-scenery-library-meshes',
    };
  }

  private ensureInstanceBuffer(buffer: GPUBuffer, label: string, count: number, bucket: CampaignSceneryKind) {
    const current = bucket === 'mountain'
      ? this.mountainCapacity
      : bucket === 'broadleaf'
        ? this.broadleafCapacity
        : bucket === 'tree' || bucket === 'conifer'
          ? this.coniferCapacity
          : this.rockCapacity;
    if (count <= current) return buffer;
    const next = Math.max(count, current * 2, 128);
    if (bucket === 'mountain') this.mountainCapacity = next;
    else if (bucket === 'broadleaf') this.broadleafCapacity = next;
    else if (bucket === 'tree' || bucket === 'conifer') this.coniferCapacity = next;
    else this.rockCapacity = next;
    return this.shell.device.createBuffer({
      label,
      size: next * 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }
}

function packInstances(instances: CampaignSceneryInstance[]) {
  const data = new Float32Array(instances.length * 8);
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    const o = i * 8;
    data[o] = inst.x;
    data[o + 1] = inst.y;
    data[o + 2] = inst.size;
    data[o + 3] = inst.z ?? 0;
    data[o + 4] = inst.shade ?? hash2(inst.x, inst.y);
    data[o + 5] = inst.height ?? inst.size;
    data[o + 6] = inst.yaw ?? 0;
  }
  return data;
}

function makeVertexBuffer(device: GPUDevice, label: string, data: Float32Array) {
  const buffer = device.createBuffer({ label, size: Math.max(4, data.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  if (data.byteLength > 0) device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function makeIndexBuffer(device: GPUDevice, label: string, data: Uint16Array) {
  const upload = data.byteLength % 4 === 0 ? data : new Uint16Array(data.length + 1);
  if (upload !== data) upload.set(data);
  const buffer = device.createBuffer({ label, size: Math.max(4, upload.byteLength), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  if (upload.byteLength > 0) device.queue.writeBuffer(buffer, 0, upload);
  return buffer;
}

function makeEmptyInstanceBuffer(device: GPUDevice, label: string) {
  return device.createBuffer({ label, size: 8 * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
}

function hash2(x: number, y: number): number {
  let n = ((x * 374761393) | 0) + ((y * 668265263) | 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
