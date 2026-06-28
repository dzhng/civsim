import type { CrowdInstance } from '../../crowd-runtime/src/instanceData';
import type { SoldierMeshData } from '../../soldier-assets/src/soldierMesh';
import type { SoldierKitManifest, VatBake } from '../../soldier-assets/src/schema';
import { assertStorageBufferFits } from './capabilities';
import { compileShader } from './compileShader';
import { createVatLayout, resolveVatClip, type VatLayout } from './vatLayout';
import type { RawFrameShell, WorldRenderPass } from './frameShell';
import { WORLD_CAMERA_WGSL } from './cameraWgsl';
import { webGpuMultisample, webGpuOpaqueColorTarget, webGpuWorldDepthStencil } from './pipelineContracts';

export interface SkinnedCrowdStats {
  instances: number;
  drawCalls: number;
  vertices: number;
  clips: string[];
  meshVariants: number;
  vatVariants: number;
  cameraContract: 'shared-world-camera-wgsl';
}

// One GPU VAT resource (storage buffer + bind group + clip layout). Classes that
// share the same VatBake share one of these, so the common all-placeholder case
// allocates exactly one — no per-class memory or draw regression.
interface VatResource {
  bindGroup: GPUBindGroup;
  layout: VatLayout;
}

interface MeshResource {
  mesh: SoldierMeshData;
  vat: VatResource;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  instanceBuffer: GPUBuffer;
  instanceCapacity: number;
  instanceCount: number;
}

/** A per-class VAT registry: index by classId. A single VatBake applies to all. */
export type SkinnedVatInput = VatBake | VatBake[];

const SKINNED_WGSL = `
${WORLD_CAMERA_WGSL}
struct Vat { width:f32, height:f32, bones:f32, pad:f32, data: array<f32> };
@group(1) @binding(0) var<storage, read> vat: Vat;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) light: f32,
  @location(2) faction: f32,
  @location(3) rim: f32,
  @location(4) height: f32,
};

fn vatTexel(frame: f32, row: f32) -> vec4f {
  let base = (u32(row) * u32(vat.width) + u32(frame)) * 4u;
  return vec4f(vat.data[base], vat.data[base + 1u], vat.data[base + 2u], vat.data[base + 3u]);
}

fn jointMatrix(bone: f32, frame: f32) -> mat4x4f {
  let row = bone * 4.0;
  return mat4x4f(vatTexel(frame, row), vatTexel(frame, row + 1.0), vatTexel(frame, row + 2.0), vatTexel(frame, row + 3.0));
}

@vertex
fn vs(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec4f,
  @location(3) bone: f32,
  @location(4) inst0: vec4f,
  @location(5) inst1: vec4f,
) -> VsOut {
  let clipStart = inst1.y;
  let clipFrames = max(inst1.z, 1.0);
  let phase = clamp(inst1.w, 0.0, 0.9999);
  let frame = clipStart + floor(phase * max(clipFrames - 1.0, 1.0));
  let joint = jointMatrix(round(bone), frame);
  let local = joint * vec4f(position, 1.0);
  let n = normalize((joint * vec4f(normal, 0.0)).xyz);

  let a = inst0.z - 1.5707964;
  let c = cos(a);
  let s = sin(a);
  let p = local.xyz * inst1.x;
  let world = vec3f(inst0.x + p.x * c - p.y * s, inst0.y + p.x * s + p.y * c, p.z);

  var out: VsOut;
  out.pos = projectWorld3d(world, civsimBattleWorldDepth3d(world));
  out.color = color;
  let sun = normalize(vec3f(-0.35, -0.45, 0.82));
  out.light = clamp(dot(n, sun) * 0.42 + 0.74, 0.34, 1.12);
  out.faction = inst0.w;
  out.rim = smoothstep(0.20, 0.92, 1.0 - abs(n.z));
  out.height = clamp(world.z / 2.1, 0.0, 1.0);
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let blue = vec3f(0.20, 0.42, 0.88);
  let red = vec3f(0.84, 0.24, 0.20);
  let accent = select(blue, red, in.faction > 0.5);
  let teamMask = smoothstep(0.18, 0.55, max(in.color.b - max(in.color.r, in.color.g), 0.0));
  let teamMix = mix(0.44, 0.90, teamMask);
  let base = mix(in.color.rgb, accent, teamMix);
  let light01 = clamp((in.light - 0.34) / 0.78, 0.0, 1.0);
  let warmKey = vec3f(1.12, 1.00, 0.78);
  let coolFill = vec3f(0.70, 0.78, 0.92);
  let grade = mix(coolFill, warmKey, light01);
  let bronzeMask = smoothstep(0.58, 0.78, in.color.r) * smoothstep(0.34, 0.52, in.color.g) * (1.0 - smoothstep(0.28, 0.46, in.color.b));
  let linenMask = smoothstep(0.58, 0.76, in.color.r) * smoothstep(0.48, 0.66, in.color.g) * smoothstep(0.32, 0.48, in.color.b);
  var shaded = base * (0.62 + light01 * 0.58) * grade;
  shaded += vec3f(0.10, 0.055, 0.012) * bronzeMask * (0.30 + light01 * 0.70);
  shaded += vec3f(0.055, 0.045, 0.020) * linenMask * (0.25 + light01 * 0.45);
  shaded += accent * in.rim * (0.06 + teamMask * 0.08);
  shaded = mix(shaded, vec3f(0.92, 0.84, 0.60), (1.0 - in.height) * 0.035);
  return vec4f(clamp(shaded, vec3f(0.0), vec3f(1.0)), in.color.a);
}`;

export class SkinnedCrowdPipeline {
  private pipeline: GPURenderPipeline;
  private resources: MeshResource[];
  private vatVariants: number;

  constructor(private shell: RawFrameShell, meshes: SoldierMeshData | SoldierMeshData[], vats: SkinnedVatInput, kit?: SoldierKitManifest) {
    const device = shell.device;
    const meshList = Array.isArray(meshes) ? meshes : [meshes];
    if (meshList.length === 0) throw new Error('SkinnedCrowdPipeline requires at least one soldier mesh');
    const vatLayoutGroup = device.createBindGroupLayout({
      label: 'skinned-vat-bgl',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }],
    });
    this.pipeline = this.makePipeline(vatLayoutGroup);
    // Build one VatResource per distinct VatBake and reuse it for every class
    // that points at it (the all-placeholder case → a single resource).
    const vatList = Array.isArray(vats) ? vats : [vats];
    const cache = new Map<VatBake, VatResource>();
    const resourceFor = (vat: VatBake): VatResource => {
      const existing = cache.get(vat);
      if (existing) return existing;
      const resource = this.createVatResource(vat, vatLayoutGroup, kit, cache.size);
      cache.set(vat, resource);
      return resource;
    };
    this.resources = meshList.map((mesh, index) => {
      const vat = vatList[index] ?? vatList[vatList.length - 1] ?? vatList[0];
      return this.createMeshResource(mesh, index, resourceFor(vat));
    });
    this.vatVariants = cache.size;
  }

  private createVatResource(vat: VatBake, vatLayoutGroup: GPUBindGroupLayout, kit: SoldierKitManifest | undefined, index: number): VatResource {
    const device = this.shell.device;
    const vatData = new Float32Array(4 + vat.data.length);
    vatData[0] = vat.width;
    vatData[1] = vat.height;
    vatData[2] = vat.bones;
    vatData.set(vat.data, 4);
    assertStorageBufferFits(vatData.byteLength, this.shell.info.caps, `skinned-vat-${index}`);
    const vatBuffer = device.createBuffer({
      label: `skinned-vat-buffer-${index}`,
      size: vatData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vatBuffer, 0, vatData);
    const bindGroup = device.createBindGroup({
      label: `skinned-vat-bg-${index}`,
      layout: vatLayoutGroup,
      entries: [{ binding: 0, resource: { buffer: vatBuffer } }],
    });
    return { bindGroup, layout: createVatLayout(vat, kit) };
  }

  upload(instances: CrowdInstance[], opts: { forcedClip?: string | null; phaseOffset?: number; size?: number } = {}) {
    const groups = this.groupInstances(instances);
    for (let i = 0; i < this.resources.length; i++) {
      const resource = this.resources[i];
      const group = groups[i] ?? [];
      resource.instanceCount = group.length;
      this.uploadGroup(resource, group, opts);
    }
  }

  draw(pass: WorldRenderPass) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    for (const resource of this.resources) {
      if (resource.instanceCount === 0) continue;
      pass.setBindGroup(1, resource.vat.bindGroup);
      pass.setVertexBuffer(0, resource.vertexBuffer);
      pass.setVertexBuffer(1, resource.instanceBuffer);
      pass.setIndexBuffer(resource.indexBuffer, 'uint16');
      pass.drawIndexed(resource.mesh.indices.length, resource.instanceCount);
    }
  }

  stats(): SkinnedCrowdStats {
    const instances = this.resources.reduce((sum, resource) => sum + resource.instanceCount, 0);
    const clips = new Set<string>();
    for (const resource of this.resources) for (const name of resource.vat.layout.clips.keys()) clips.add(name);
    return {
      instances,
      drawCalls: this.resources.filter((resource) => resource.instanceCount > 0).length,
      vertices: this.resources.reduce((sum, resource) => sum + resource.mesh.positions.length / 3, 0),
      clips: Array.from(clips),
      meshVariants: this.resources.length,
      vatVariants: this.vatVariants,
      cameraContract: 'shared-world-camera-wgsl',
    };
  }

  /** The clip layout VAT resolution uses for a given class (per-class clip table). */
  classClip(classId: number, name: string) {
    const resource = this.resources[Math.max(0, Math.min(this.resources.length - 1, Math.floor(classId)))];
    return resolveVatClip(resource.vat.layout, name);
  }

  private createMeshResource(mesh: SoldierMeshData, index: number, vat: VatResource): MeshResource {
    const device = this.shell.device;
    const vertexBuffer = device.createBuffer({
      label: `skinned-soldier-${index}-vertices`,
      size: mesh.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, mesh.vertices);
    const indexBuffer = device.createBuffer({
      label: `skinned-soldier-${index}-indices`,
      size: mesh.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(indexBuffer, 0, mesh.indices);
    const instanceBuffer = device.createBuffer({
      label: `skinned-empty-${index}-instances`,
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    return { mesh, vat, vertexBuffer, indexBuffer, instanceBuffer, instanceCapacity: 0, instanceCount: 0 };
  }

  private groupInstances(instances: CrowdInstance[]) {
    const groups = Array.from({ length: this.resources.length }, () => [] as CrowdInstance[]);
    for (const inst of instances) {
      const classId = Math.max(0, Math.min(this.resources.length - 1, Math.floor(inst.classId || 0)));
      groups[classId].push(inst);
    }
    return groups;
  }

  private uploadGroup(resource: MeshResource, instances: CrowdInstance[], opts: { forcedClip?: string | null; phaseOffset?: number; size?: number }) {
    const stride = 8;
    if (instances.length > resource.instanceCapacity) {
      resource.instanceCapacity = Math.max(instances.length, resource.instanceCapacity * 2, 256);
      resource.instanceBuffer = this.shell.device.createBuffer({
        label: 'skinned-crowd-instances',
        size: resource.instanceCapacity * stride * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (instances.length === 0) return;
    const data = new Float32Array(instances.length * stride);
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const clip = resolveVatClip(resource.vat.layout, opts.forcedClip ?? inst.clip);
      const o = i * stride;
      data[o] = inst.x;
      data[o + 1] = inst.y;
      data[o + 2] = inst.facing;
      data[o + 3] = inst.faction;
      data[o + 4] = opts.size ?? 1;
      data[o + 5] = clip.start;
      data[o + 6] = clip.frames;
      data[o + 7] = ((inst.phase + (opts.phaseOffset ?? 0)) % 1 + 1) % 1;
    }
    this.shell.device.queue.writeBuffer(resource.instanceBuffer, 0, data);
  }

  private makePipeline(vatLayout: GPUBindGroupLayout) {
    const device = this.shell.device;
    const module = compileShader(device, SKINNED_WGSL, 'skinned-crowd');
    return device.createRenderPipeline({
      label: 'skinned-crowd-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.shell.cameraBindGroupLayout, vatLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: 44,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32x4' },
              { shaderLocation: 3, offset: 40, format: 'float32' },
            ],
          },
          {
            arrayStride: 32,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 4, offset: 0, format: 'float32x4' },
              { shaderLocation: 5, offset: 16, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'fs', targets: [webGpuOpaqueColorTarget(this.shell.info.format)] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: webGpuWorldDepthStencil('read-write'),
      multisample: webGpuMultisample(this.shell.sampleCount),
    });
  }
}
