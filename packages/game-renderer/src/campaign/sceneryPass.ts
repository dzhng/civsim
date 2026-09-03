import type { RawFrameShell, WorldRenderPass } from '../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';
import { gpuAlphaBlendColorTarget, gpuOpaqueColorTarget, gpuWorldDepthStencil } from '../../../renderer-core/src/pipelineContracts';
import { buildLeafAtlas, LEAF_ATLAS_RGB_GAIN } from '../models/shared/leafAtlas';
import type { MeshData } from '../models/shared/meshBuilder';
import { SCENERY_PROP_IDS, SCENERY_PROP_MODELS, type SceneryPropId } from '../models/shared/sceneryPropRegistry';
import { campaignPassSunDirectionWgsl } from './environment';

export type CampaignSceneryKind = SceneryPropId;

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
  @location(4) uv: vec2f,
};

@group(1) @binding(0) var leafTexture: texture_2d<f32>;
@group(1) @binding(1) var leafSampler: sampler;

@vertex
fn vs(
  @location(0) local: vec3f,
  @location(1) normal: vec3f,
  @location(2) colorAndAlpha: vec4f,
  @location(3) instPose: vec4f,
  @location(4) instStyle: vec4f,
  @location(5) uv: vec2f,
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
  out.pos = projectWorld(world);
  let sun = ${campaignPassSunDirectionWgsl()};
  let rnormal = vec3f(normal.x * cy - normal.y * sy, normal.x * sy + normal.y * cy, normal.z);
  out.color = colorAndAlpha.rgb;
  out.alpha = colorAndAlpha.a;
  out.light = clamp(dot(normalize(rnormal), sun) * 0.34 + 0.78, 0.48, 1.14);
  out.shade = clamp(instStyle.x, 0.0, 1.0);
  out.uv = uv;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  // u < 0 marks untextured geometry; leaf quads alpha-cut through the leaf
  // atlas so one quad reads as a cluster of small leaves, not a solid card.
  let textured = in.uv.x >= 0.0;
  let texel = textureSample(leafTexture, leafSampler, max(in.uv, vec2f(0.0)));
  if (textured && texel.a < 0.5) { discard; }
  let detail = select(vec3f(1.0), texel.rgb * ${LEAF_ATLAS_RGB_GAIN}, textured);
  let warmKey = vec3f(1.08, 1.00, 0.82);
  let coolFill = vec3f(0.72, 0.77, 0.82);
  let grade = mix(coolFill, warmKey, clamp((in.light - 0.48) / 0.66, 0.0, 1.0));
  let variation = 0.88 + in.shade * 0.18;
  let col = clamp(in.color * detail * in.light * grade * variation, vec3f(0.0), vec3f(1.0));
  return vec4f(col, in.alpha);
}`;

interface SceneryBucket {
  mesh: MeshData;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  uvBuffer: GPUBuffer;
  shadowVertexBuffer: GPUBuffer;
  shadowIndexBuffer: GPUBuffer;
  shadowUvBuffer: GPUBuffer;
  instanceBuffer: GPUBuffer;
  capacity: number;
  count: number;
}

export class CampaignSceneryPass {
  private opaquePipeline: GPURenderPipeline;
  private shadowPipeline: GPURenderPipeline;
  private leafTextureBindGroup: GPUBindGroup;
  private leafBindGroupLayout: GPUBindGroupLayout;
  private buckets = new Map<SceneryPropId, SceneryBucket>();

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'scenery-mesh-wgsl', code: SCENERY_WGSL });
    this.leafBindGroupLayout = device.createBindGroupLayout({
      label: 'campaign-scenery-leaf-atlas-layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.leafTextureBindGroup = makeLeafAtlasBindGroup(device, this.leafBindGroupLayout);
    this.opaquePipeline = this.makePipeline(module, 'opaque');
    this.shadowPipeline = this.makePipeline(module, 'shadow');
    for (const id of SCENERY_PROP_IDS) {
      const mesh = SCENERY_PROP_MODELS[id].build();
      this.buckets.set(id, {
        mesh,
        vertexBuffer: makeVertexBuffer(device, `campaign-${id}-vertices`, mesh.opaque.vertices),
        indexBuffer: makeIndexBuffer(device, `campaign-${id}-indices`, mesh.opaque.indices),
        uvBuffer: makeUvBuffer(device, `campaign-${id}-uvs`, mesh.opaque.vertices.length / 10, mesh.opaque.uvs),
        shadowVertexBuffer: makeVertexBuffer(device, `campaign-${id}-shadow-vertices`, mesh.shadow.vertices),
        shadowIndexBuffer: makeIndexBuffer(device, `campaign-${id}-shadow-indices`, mesh.shadow.indices),
        shadowUvBuffer: makeUvBuffer(device, `campaign-${id}-shadow-uvs`, mesh.shadow.vertices.length / 10, mesh.shadow.uvs),
        instanceBuffer: makeEmptyInstanceBuffer(device, `campaign-${id}-empty-instances`),
        capacity: 0,
        count: 0,
      });
    }
  }

  private makePipeline(module: GPUShaderModule, material: 'opaque' | 'shadow') {
    const device = this.shell.device;
    return device.createRenderPipeline({
      label: material === 'opaque' ? 'campaign-scenery-opaque-depth-pipeline' : 'campaign-scenery-shadow-decal-pipeline',
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.shell.cameraBindGroupLayout, this.leafBindGroupLayout],
      }),
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
          {
            arrayStride: 8,
            attributes: [{ shaderLocation: 5, offset: 0, format: 'float32x2' }],
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

  upload(instances: CampaignSceneryInstance[]) {
    const grouped = new Map<SceneryPropId, CampaignSceneryInstance[]>();
    for (const inst of instances) {
      const list = grouped.get(inst.kind);
      if (list) list.push(inst);
      else grouped.set(inst.kind, [inst]);
    }
    for (const [id, bucket] of this.buckets) {
      const list = grouped.get(id) ?? [];
      bucket.count = list.length;
      if (list.length > bucket.capacity) {
        bucket.capacity = Math.max(list.length, bucket.capacity * 2, 128);
        bucket.instanceBuffer = this.shell.device.createBuffer({
          label: `campaign-${id}-instances`,
          size: bucket.capacity * 8 * 4,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
      if (list.length > 0) this.shell.device.queue.writeBuffer(bucket.instanceBuffer, 0, packInstances(list));
    }
  }

  drawShadows(pass: WorldRenderPass) {
    this.draw(pass, this.shadowPipeline, 'shadow');
  }

  drawOpaque(pass: WorldRenderPass) {
    this.draw(pass, this.opaquePipeline, 'opaque');
  }

  private draw(pass: WorldRenderPass, pipeline: GPURenderPipeline, layer: 'opaque' | 'shadow') {
    let total = 0;
    for (const bucket of this.buckets.values()) total += bucket.count;
    if (total === 0) return;
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setBindGroup(1, this.leafTextureBindGroup);
    for (const bucket of this.buckets.values()) {
      if (bucket.count === 0) continue;
      const part = bucket.mesh[layer];
      if (part.indexCount === 0) continue;
      pass.setVertexBuffer(0, layer === 'opaque' ? bucket.vertexBuffer : bucket.shadowVertexBuffer);
      pass.setVertexBuffer(1, bucket.instanceBuffer);
      pass.setVertexBuffer(2, layer === 'opaque' ? bucket.uvBuffer : bucket.shadowUvBuffer);
      pass.setIndexBuffer(layer === 'opaque' ? bucket.indexBuffer : bucket.shadowIndexBuffer, 'uint16');
      pass.drawIndexed(part.indexCount, bucket.count);
    }
  }

  stats() {
    const kinds: Partial<Record<SceneryPropId, number>> = {};
    const byFamily = { tree: 0, rock: 0, mountain: 0, cart: 0 };
    let total = 0;
    for (const [id, bucket] of this.buckets) {
      kinds[id] = bucket.count;
      byFamily[SCENERY_PROP_MODELS[id].family] += bucket.count;
      total += bucket.count;
    }
    return {
      scenery: total,
      mountains: byFamily.mountain,
      trees: byFamily.tree,
      rocks: byFamily.rock,
      carts: byFamily.cart,
      kinds,
      materialClasses: ['opaque-depth-write', 'shadow-depth-read'] as const,
      layer: 'raw-gpu-scenery-library-meshes',
    };
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

/** Per-vertex leaf-atlas UVs; vertices without UVs get the u=-1 sentinel. */
function makeUvBuffer(device: GPUDevice, label: string, vertexCount: number, uvs?: Float32Array) {
  const data = uvs ?? new Float32Array(vertexCount * 2).fill(-1);
  return makeVertexBuffer(device, label, data);
}

function makeLeafAtlasBindGroup(device: GPUDevice, layout: GPUBindGroupLayout) {
  const atlas = buildLeafAtlas();
  const texture = device.createTexture({
    label: 'campaign-scenery-leaf-atlas',
    size: { width: atlas.width, height: atlas.height },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    atlas.rgba,
    { bytesPerRow: atlas.width * 4 },
    { width: atlas.width, height: atlas.height },
  );
  const sampler = device.createSampler({
    label: 'campaign-scenery-leaf-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  return device.createBindGroup({
    label: 'campaign-scenery-leaf-atlas-binds',
    layout,
    entries: [
      { binding: 0, resource: texture.createView() },
      { binding: 1, resource: sampler },
    ],
  });
}

function makeEmptyInstanceBuffer(device: GPUDevice, label: string) {
  return device.createBuffer({ label, size: 8 * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
}

function hash2(x: number, y: number): number {
  let n = ((x * 374761393) | 0) + ((y * 668265263) | 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
