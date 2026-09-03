import type { RawFrameShell, WorldRenderPass } from '../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';
import { gpuAlphaBlendColorTarget, gpuOpaqueColorTarget, gpuWorldDepthStencil } from '../../../renderer-core/src/pipelineContracts';
import { buildCityMesh } from '../models/campaign/campaignEntityModels';
import { campaignPassSunDirectionWgsl } from './environment';

export interface CampaignEntityInstance {
  x: number;
  y: number;
  z?: number;
  radius: number;
  faction: [number, number, number];
  allegiance: [number, number, number];
  kind: 'city';
  strength?: number;
}

const ENTITY_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
  @location(1) light: f32,
  @location(2) livery: f32,
  @location(3) faction: vec3f,
  @location(4) allegiance: vec3f,
  @location(5) shade: f32,
  @location(6) alpha: f32,
};

@vertex
fn vs(
  @location(0) local: vec3f,
  @location(1) normal: vec3f,
  @location(2) colorAndAlpha: vec4f,
  @location(3) inst0: vec4f,
  @location(4) inst1: vec4f,
  @location(5) inst2: vec4f,
) -> VsOut {
  let scale = inst0.z;
  let world = vec3f(inst0.x + local.x * scale, inst0.y + local.y * scale, inst0.w + local.z * scale);
  var out: VsOut;
  out.pos = projectWorld(world);
  out.color = colorAndAlpha.rgb;
  out.livery = smoothstep(0.94, 0.99, min(colorAndAlpha.r, min(colorAndAlpha.g, colorAndAlpha.b)));
  out.alpha = colorAndAlpha.a;
  out.faction = inst1.rgb;
  out.allegiance = vec3f(inst1.a, inst2.r, inst2.g);
  let sun = ${campaignPassSunDirectionWgsl()};
  let n = normalize(normal);
  out.light = clamp(dot(n, sun) * 0.38 + 0.76, 0.42, 1.12);
  out.shade = clamp(world.z / max(scale * 8.5, 0.001), 0.0, 1.0);
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let ownership = mix(in.color, in.faction, in.livery);
  let bronze = vec3f(0.84, 0.66, 0.34);
  let warmKey = vec3f(1.10, 1.00, 0.80);
  let coolFill = vec3f(0.70, 0.76, 0.86);
  let grade = mix(coolFill, warmKey, clamp((in.light - 0.42) / 0.70, 0.0, 1.0));
  var shaded = ownership * in.light * grade;
  shaded += bronze * smoothstep(0.64, 0.82, ownership.r) * smoothstep(0.42, 0.62, ownership.g) * 0.05;
  shaded = mix(shaded, vec3f(0.92, 0.82, 0.58), (1.0 - in.shade) * 0.025);
  return vec4f(clamp(shaded, vec3f(0.0), vec3f(1.0)), in.alpha);
}`;

export class CampaignEntityPass {
  private opaquePipeline: GPURenderPipeline;
  private shadowPipeline: GPURenderPipeline;
  private cityVertexBuffer: GPUBuffer;
  private cityIndexBuffer: GPUBuffer;
  private cityShadowVertexBuffer: GPUBuffer;
  private cityShadowIndexBuffer: GPUBuffer;
  private cityInstanceBuffer: GPUBuffer;
  private cityCapacity = 0;
  private cityCount = 0;
  private cityMesh = buildCityMesh();

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-entity-mesh-wgsl', code: ENTITY_WGSL });
    this.opaquePipeline = this.makePipeline(module, 'opaque');
    this.shadowPipeline = this.makePipeline(module, 'shadow');
    this.cityVertexBuffer = makeVertexBuffer(device, 'campaign-city-model-vertices', this.cityMesh.opaque.vertices);
    this.cityIndexBuffer = makeIndexBuffer(device, 'campaign-city-model-indices', this.cityMesh.opaque.indices);
    this.cityShadowVertexBuffer = makeVertexBuffer(device, 'campaign-city-shadow-vertices', this.cityMesh.shadow.vertices);
    this.cityShadowIndexBuffer = makeIndexBuffer(device, 'campaign-city-shadow-indices', this.cityMesh.shadow.indices);
    this.cityInstanceBuffer = makeEmptyInstanceBuffer(device, 'campaign-city-empty-instances');
  }

  private makePipeline(module: GPUShaderModule, material: 'opaque' | 'shadow') {
    const device = this.shell.device;
    return device.createRenderPipeline({
      label: material === 'opaque' ? 'campaign-entity-opaque-depth-pipeline' : 'campaign-entity-shadow-decal-pipeline',
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
            arrayStride: 48,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 3, offset: 0, format: 'float32x4' },
              { shaderLocation: 4, offset: 16, format: 'float32x4' },
              { shaderLocation: 5, offset: 32, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          material === 'opaque'
            ? gpuOpaqueColorTarget(this.shell.info.format)
            : gpuAlphaBlendColorTarget(this.shell.info.format),
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: gpuWorldDepthStencil(material === 'opaque' ? 'read-write' : 'read'),
    });
  }

  upload(instances: CampaignEntityInstance[]) {
    this.cityCount = instances.length;
    this.cityInstanceBuffer = this.ensureInstanceBuffer(this.cityInstanceBuffer, 'campaign-city-instances', instances.length);
    if (instances.length > 0) this.shell.device.queue.writeBuffer(this.cityInstanceBuffer, 0, packInstances(instances, 5.0));
  }

  drawShadows(pass: WorldRenderPass) {
    if (this.cityCount === 0) return;
    pass.setPipeline(this.shadowPipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.cityShadowVertexBuffer);
    pass.setVertexBuffer(1, this.cityInstanceBuffer);
    pass.setIndexBuffer(this.cityShadowIndexBuffer, 'uint16');
    pass.drawIndexed(this.cityMesh.shadow.indexCount, this.cityCount);
  }

  drawOpaque(pass: WorldRenderPass) {
    if (this.cityCount === 0) return;
    pass.setPipeline(this.opaquePipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.cityVertexBuffer);
    pass.setVertexBuffer(1, this.cityInstanceBuffer);
    pass.setIndexBuffer(this.cityIndexBuffer, 'uint16');
    pass.drawIndexed(this.cityMesh.opaque.indexCount, this.cityCount);
  }

  stats() {
    return {
      entities: this.cityCount,
      cityMeshes: this.cityCount,
      cityModelVertices: (this.cityMesh.opaque.vertices.length + this.cityMesh.shadow.vertices.length) / 10,
      materialClasses: ['opaque-depth-write', 'shadow-depth-read'] as const,
      layer: 'raw-gpu-city-model-meshes',
    };
  }

  private ensureInstanceBuffer(buffer: GPUBuffer, label: string, count: number) {
    if (count <= this.cityCapacity) return buffer;
    const next = Math.max(count, this.cityCapacity * 2, 64);
    this.cityCapacity = next;
    return this.shell.device.createBuffer({
      label,
      size: next * 12 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }
}

function packInstances(instances: CampaignEntityInstance[], radiusToScale: number) {
  const data = new Float32Array(instances.length * 12);
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    const o = i * 12;
    data[o] = inst.x;
    data[o + 1] = inst.y;
    data[o + 2] = inst.radius / radiusToScale;
    data[o + 3] = inst.z ?? 0;
    data.set(inst.faction, o + 4);
    data[o + 7] = inst.allegiance[0];
    data[o + 8] = inst.allegiance[1];
    data[o + 9] = inst.allegiance[2];
    data[o + 10] = inst.strength ?? 1;
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
  return device.createBuffer({ label, size: 12 * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
}
