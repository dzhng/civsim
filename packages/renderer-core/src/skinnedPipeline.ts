import type { CrowdInstance } from '../../crowd-runtime/src/instanceData';
import type { SoldierMeshData } from '../../soldier-assets/src/soldierMesh';
import type { SoldierKitManifest, VatBake } from '../../soldier-assets/src/schema';
import { assertStorageBufferFits } from './capabilities';
import { compileShader } from './compileShader';
import { createVatLayout, resolveVatClip, type VatLayout } from './vatLayout';
import type { RawFrameShell, WorldRenderPass } from './frameShell';
import { WORLD_CAMERA_WGSL } from './cameraWgsl';
import { gpuMultisample, gpuOpaqueColorTarget, gpuWorldDepthStencil } from './pipelineContracts';

export interface SkinnedCrowdStats {
  instances: number;
  drawCalls: number;
  vertices: number;
  clips: string[];
  meshVariants: number;
  vatVariants: number;
  lighting: SkinnedLightingStats;
  cameraContract: 'shared-world-camera-wgsl';
}

export interface SkinnedLightingEnvironment {
  source: string;
  sunAzimuth: number;
  sunElevation: number;
  keyColor: [number, number, number];
  fillColor: [number, number, number];
  exposure: number;
}

export interface SkinnedLightingStats {
  source: string;
  sunAzimuth: number;
  sunElevation: number;
  keyColor: [number, number, number];
  fillColor: [number, number, number];
  exposure: number;
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
  index: number;
  classId: number;
  lod: number;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  instanceBuffer: GPUBuffer;
  instanceCapacity: number;
  instanceCount: number;
}

/** A per-class VAT registry: index by classId. A single VatBake applies to all. */
export type SkinnedVatInput = VatBake | VatBake[];

/** Meshes: one (L0), per-class (`[classId]`), or per-class-per-lod (`[classId][lod]`). */
export type SkinnedMeshInput = SoldierMeshData | SoldierMeshData[] | SoldierMeshData[][];

const DEFAULT_SKINNED_LIGHTING: SkinnedLightingEnvironment = {
  source: 'skinned-default',
  sunAzimuth: Math.PI / 2,
  sunElevation: 0.5,
  keyColor: [1.12, 1.0, 0.78],
  fillColor: [0.70, 0.78, 0.92],
  exposure: 1,
};

function skinnedLightingWgsl(lighting: SkinnedLightingEnvironment): string {
  return `
const SKINNED_KEY = ${wgslVec3(lighting.keyColor)};
const SKINNED_FILL = ${wgslVec3(lighting.fillColor)};
const SKINNED_EXPOSURE = ${lighting.exposure.toFixed(3)};
`;
}

function skinnedLightingStats(lighting: SkinnedLightingEnvironment): SkinnedLightingStats {
  return {
    source: lighting.source,
    sunAzimuth: roundLighting(lighting.sunAzimuth),
    sunElevation: roundLighting(lighting.sunElevation),
    keyColor: lighting.keyColor,
    fillColor: lighting.fillColor,
    exposure: lighting.exposure,
  };
}

function wgslVec3(c: readonly [number, number, number]): string {
  return `vec3f(${c[0].toFixed(3)}, ${c[1].toFixed(3)}, ${c[2].toFixed(3)})`;
}

function roundLighting(value: number): number {
  return Number(value.toFixed(4));
}

const SKINNED_WGSL = (lighting: SkinnedLightingEnvironment) => `
${WORLD_CAMERA_WGSL}
${skinnedLightingWgsl(lighting)}
struct Vat { width:f32, height:f32, bones:f32, pad:f32, data: array<f32> };
@group(1) @binding(0) var<storage, read> vat: Vat;

// Shared material bind group: albedo/normal/orm/factionMask textures + sampler,
// and the faction-mask strength. strength = 0 keeps the legacy broad team tint
// (default render unchanged); strength = 1 localizes faction color to the mask.
struct Material { factionMaskStrength: f32, pad0: f32, pad1: f32, pad2: f32 };
@group(2) @binding(0) var matSampler: sampler;
@group(2) @binding(1) var albedoTex: texture_2d<f32>;
@group(2) @binding(2) var normalTex: texture_2d<f32>;
@group(2) @binding(3) var ormTex: texture_2d<f32>;
@group(2) @binding(4) var maskTex: texture_2d<f32>;
@group(2) @binding(5) var<uniform> mat: Material;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) light: f32,
  @location(2) faction: f32,
  @location(3) rim: f32,
  @location(4) height: f32,
  @location(5) corpse: f32,
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
  @location(6) inst2: vec4f,
) -> VsOut {
  let clipStart = inst1.y;
  let clipFrames = max(inst1.z, 1.0);
  let phase = clamp(inst1.w, 0.0, 0.9999);
  let frame = clipStart + floor(phase * max(clipFrames - 1.0, 1.0));
  let joint = jointMatrix(round(bone), frame);
  let local = joint * vec4f(position, 1.0);
  let n = normalize((joint * vec4f(normal, 0.0)).xyz);

  // Corpses (inst2.z) roll by a per-variant angle (inst2.y) so the fallen field
  // reads as varied poses, not one frozen death animation.
  let corpse = inst2.z;
  let variant = inst2.y;
  let roll = corpse * ((variant - 1.0) * 0.42 + sin(variant * 2.3) * 0.18);
  let rc = cos(roll);
  let rs = sin(roll);
  let rolled = vec3f(local.x, local.y * rc - local.z * rs, local.y * rs + local.z * rc);
  let a = inst0.z - 1.5707964;
  let c = cos(a);
  let s = sin(a);
  let p = rolled * inst1.x;
  // inst2.x = terrain elevation: soldiers sit on the surface and sort by it.
  let world = vec3f(inst0.x + p.x * c - p.y * s, inst0.y + p.x * s + p.y * c, p.z + inst2.x);

  var out: VsOut;
  out.pos = projectWorld(world);
  out.color = color;
  let sun = sunDirection();
  out.light = clamp(dot(n, sun) * 0.42 + 0.74, 0.34, 1.12);
  out.faction = inst0.w;
  out.rim = smoothstep(0.20, 0.92, 1.0 - abs(n.z));
  out.height = clamp(world.z / 2.1, 0.0, 1.0);
  out.corpse = corpse;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let blue = vec3f(0.20, 0.42, 0.88);
  let red = vec3f(0.84, 0.24, 0.20);
  // faction 0 = own/friend (blue), 1 = foe (red), 2 = neutral (amber). Battle only
  // ever sends 0/1, so its output is unchanged; campaign uses 2 for neutral stacks.
  let neutral = vec3f(0.82, 0.70, 0.34);
  var accent = select(blue, red, in.faction > 0.5);
  accent = select(accent, neutral, in.faction > 1.5);
  // Material channels. Placeholder textures are neutral, so albedo/mask keep the
  // default look exact; orm/normal effects are gated by factionMaskStrength.
  let uv = vec2f(0.5, 0.5);
  let albedo = textureSample(albedoTex, matSampler, uv).rgb;
  let orm = textureSample(ormTex, matSampler, uv).rgb;
  let nrm = textureSample(normalTex, matSampler, uv).xyz;
  let factionTexMask = textureSample(maskTex, matSampler, uv).r;
  let strength = mat.factionMaskStrength;
  // Per-pixel faction mask: accent-painted regions (high blue) refined by the
  // mask texture, instead of a global tint. strength=0 keeps the broad floor.
  let teamMask = smoothstep(0.18, 0.55, max(in.color.b - max(in.color.r, in.color.g), 0.0)) * factionTexMask;
  let teamMix = mix(mix(0.44, 0.0, strength), 0.90, teamMask);
  let base = mix(in.color.rgb * albedo, accent, teamMix);
  let light01 = clamp((in.light - 0.34) / 0.78, 0.0, 1.0);
  let grade = mix(SKINNED_FILL, SKINNED_KEY, light01);
  let bronzeMask = smoothstep(0.58, 0.78, in.color.r) * smoothstep(0.34, 0.52, in.color.g) * (1.0 - smoothstep(0.28, 0.46, in.color.b));
  let linenMask = smoothstep(0.58, 0.76, in.color.r) * smoothstep(0.48, 0.66, in.color.g) * smoothstep(0.32, 0.48, in.color.b);
  var shaded = base * (0.62 + light01 * 0.58) * grade * SKINNED_EXPOSURE;
  shaded += vec3f(0.10, 0.055, 0.012) * bronzeMask * (0.30 + light01 * 0.70);
  shaded += vec3f(0.055, 0.045, 0.020) * linenMask * (0.25 + light01 * 0.45);
  shaded += accent * in.rim * (0.06 + teamMask * 0.08);
  shaded = mix(shaded, vec3f(0.92, 0.84, 0.60), (1.0 - in.height) * 0.035);
  // ORM/normal material response, gated so the default render is byte-identical.
  let rough = orm.g;
  let metal = orm.b;
  let spec = pow(light01, mix(1.0, 6.0, rough)) * (0.10 + metal * 0.25);
  shaded += (spec + 0.02 * nrm.z * light01) * strength;
  shaded *= mix(1.0, orm.r, strength);
  // Corpses desaturate and darken so the fallen read as dead, not living.
  let lum = dot(shaded, vec3f(0.30, 0.59, 0.11));
  shaded = mix(shaded, vec3f(lum) * 0.62 + vec3f(0.06, 0.04, 0.03), in.corpse * 0.7);
  return vec4f(clamp(shaded, vec3f(0.0), vec3f(1.0)), in.color.a);
}`;

export class SkinnedCrowdPipeline {
  private pipeline: GPURenderPipeline;
  private resources: MeshResource[];
  private resourceLookup: MeshResource[][];
  private vatVariants: number;
  private materialBindGroup: GPUBindGroup;
  private materialUniform: GPUBuffer;
  private readonly lighting: SkinnedLightingEnvironment;

  constructor(private shell: RawFrameShell, meshes: SkinnedMeshInput, vats: SkinnedVatInput, kit?: SoldierKitManifest, opts: { lighting?: SkinnedLightingEnvironment } = {}) {
    this.lighting = opts.lighting ?? DEFAULT_SKINNED_LIGHTING;
    const device = shell.device;
    // Normalize to per-class tiers: classId → lod → mesh. A flat list is L0-only.
    const meshTiers: SoldierMeshData[][] = Array.isArray(meshes)
      ? (Array.isArray(meshes[0]) ? meshes as SoldierMeshData[][] : (meshes as SoldierMeshData[]).map((m) => [m]))
      : [[meshes]];
    if (meshTiers.length === 0 || meshTiers[0].length === 0) throw new Error('SkinnedCrowdPipeline requires at least one soldier mesh');
    const vatLayoutGroup = device.createBindGroupLayout({
      label: 'skinned-vat-bgl',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }],
    });
    const materialLayoutGroup = device.createBindGroupLayout({
      label: 'skinned-material-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    const material = this.createMaterial(materialLayoutGroup);
    this.materialBindGroup = material.bindGroup;
    this.materialUniform = material.uniform;
    this.pipeline = this.makePipeline(vatLayoutGroup, materialLayoutGroup);
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
    // One MeshResource per (classId, lod). Lower-detail tiers share the class's
    // VAT (skeleton is unchanged) and the lookup routes instances to their tier.
    this.resources = [];
    this.resourceLookup = meshTiers.map((tiers, classId) => {
      const vat = resourceFor(vatList[classId] ?? vatList[vatList.length - 1] ?? vatList[0]);
      return tiers.map((mesh, lod) => {
        const resource = this.createMeshResource(mesh, this.resources.length, vat, classId, lod);
        this.resources.push(resource);
        return resource;
      });
    });
    this.vatVariants = cache.size;
  }

  /** Localize faction color to the painted mask (1) vs the legacy broad tint (0). */
  setFactionMaskStrength(strength: number) {
    this.shell.device.queue.writeBuffer(this.materialUniform, 0, new Float32Array([Math.max(0, Math.min(1, strength)), 0, 0, 0]));
  }

  // Neutral 1x1 placeholder textures: albedo white (identity), normal flat, orm
  // (occlusion 1, roughness 0.55, metalness 0), mask 1. Real art swaps these for
  // painted maps; the bind group + sampling path is identical either way.
  private createMaterial(layout: GPUBindGroupLayout): { bindGroup: GPUBindGroup; uniform: GPUBuffer } {
    const device = this.shell.device;
    const texel = (rgba: [number, number, number, number]) => {
      const texture = device.createTexture({
        label: 'skinned-material-texel',
        size: { width: 1, height: 1 },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      device.queue.writeTexture({ texture }, new Uint8Array(rgba), { bytesPerRow: 4 }, { width: 1, height: 1 });
      return texture.createView();
    };
    const sampler = device.createSampler({ label: 'skinned-material-sampler', magFilter: 'linear', minFilter: 'linear' });
    const uniform = device.createBuffer({ label: 'skinned-material-uniform', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(uniform, 0, new Float32Array([0, 0, 0, 0]));
    const bindGroup = device.createBindGroup({
      label: 'skinned-material-bg',
      layout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: texel([255, 255, 255, 255]) },
        { binding: 2, resource: texel([128, 128, 255, 255]) },
        { binding: 3, resource: texel([255, 140, 0, 255]) },
        { binding: 4, resource: texel([255, 255, 255, 255]) },
        { binding: 5, resource: { buffer: uniform } },
      ],
    });
    return { bindGroup, uniform };
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
    pass.setBindGroup(2, this.materialBindGroup);
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
      lighting: skinnedLightingStats(this.lighting),
      cameraContract: 'shared-world-camera-wgsl',
    };
  }

  /** The clip layout VAT resolution uses for a given class (per-class clip table). */
  classClip(classId: number, name: string) {
    const resource = this.resources[Math.max(0, Math.min(this.resources.length - 1, Math.floor(classId)))];
    return resolveVatClip(resource.vat.layout, name);
  }

  private createMeshResource(mesh: SoldierMeshData, index: number, vat: VatResource, classId: number, lod: number): MeshResource {
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
      size: 12 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    return { mesh, vat, index, classId, lod, vertexBuffer, indexBuffer, instanceBuffer, instanceCapacity: 0, instanceCount: 0 };
  }

  // Route each instance to its (classId, lod) resource. A requested lod beyond
  // the class's available tiers clamps to the coarsest tier it has.
  private groupInstances(instances: CrowdInstance[]) {
    const groups = this.resources.map(() => [] as CrowdInstance[]);
    for (const inst of instances) {
      const classId = Math.max(0, Math.min(this.resourceLookup.length - 1, Math.floor(inst.classId || 0)));
      const tiers = this.resourceLookup[classId];
      const lod = Math.max(0, Math.min(tiers.length - 1, Math.floor(inst.lod || 0)));
      groups[tiers[lod].index].push(inst);
    }
    return groups;
  }

  private uploadGroup(resource: MeshResource, instances: CrowdInstance[], opts: { forcedClip?: string | null; phaseOffset?: number; size?: number }) {
    const stride = 12;
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
      data[o + 8] = inst.elevation ?? 0;          // inst2.x: terrain elevation
      data[o + 9] = inst.deathVariant ?? 0;       // inst2.y: corpse variant 0..2
      data[o + 10] = inst.alive ? 0 : 1;          // inst2.z: corpse flag
    }
    this.shell.device.queue.writeBuffer(resource.instanceBuffer, 0, data);
  }

  private makePipeline(vatLayout: GPUBindGroupLayout, materialLayout: GPUBindGroupLayout) {
    const device = this.shell.device;
    const module = compileShader(device, SKINNED_WGSL(this.lighting), 'skinned-crowd');
    return device.createRenderPipeline({
      label: 'skinned-crowd-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.shell.cameraBindGroupLayout, vatLayout, materialLayout] }),
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
            arrayStride: 48,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 4, offset: 0, format: 'float32x4' },
              { shaderLocation: 5, offset: 16, format: 'float32x4' },
              { shaderLocation: 6, offset: 32, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'fs', targets: [gpuOpaqueColorTarget(this.shell.info.format)] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: gpuWorldDepthStencil('read-write'),
      multisample: gpuMultisample(this.shell.sampleCount),
    });
  }
}
