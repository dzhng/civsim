import type { CrowdInstance } from "../../crowd-runtime/src/instanceData";
import {
  packSoldierVertices,
  SOLDIER_VERTEX_LAYOUT,
  type SoldierMeshData,
} from "../../soldier-assets/src/mesh";
import type { VatBake } from "../../soldier-assets/src/schema";
import type { AppearanceBundle } from "../../soldier-assets/src/appearanceBundle";
import { packSoldierMaterials, type SoldierMaterial } from "../../soldier-assets/src/material";
import { assertStorageBufferFits } from "./capabilities";
import { compileShader } from "./compileShader";
import { GrowableBuffer, makeIndexBuffer, makeVertexBuffer } from "./gpuBuffers";
import { createVatLayout, resolveVatClip, sampleVatPhase, type VatLayout } from "./vatLayout";
import type { RawFrameShell, WorldRenderPass } from "./frameShell";
import { WORLD_CAMERA_WGSL } from "./cameraWgsl";
import { cameraOnlyPipeline } from "./pipelineContracts";

interface SkinnedCrowdStats {
  instances: number;
  drawCalls: number;
  vertices: number;
  clips: string[];
  meshVariants: number;
  vatVariants: number;
  materialVariants: number;
  materialTableBytes: number;
  lighting: SkinnedLightingStats;
  cameraContract: "shared-world-camera-wgsl";
}

export interface SkinnedLightingEnvironment {
  source: string;
  sunAzimuth: number;
  sunElevation: number;
  keyColor: [number, number, number];
  fillColor: [number, number, number];
  exposure: number;
}

interface SkinnedLightingStats {
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
  material: GPUBindGroup;
  index: number;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  instanceBuffer: GrowableBuffer;
  instanceCount: number;
}

const DEFAULT_SKINNED_LIGHTING: SkinnedLightingEnvironment = {
  source: "skinned-default",
  sunAzimuth: Math.PI / 2,
  sunElevation: 0.5,
  keyColor: [1.12, 1.0, 0.78],
  fillColor: [0.7, 0.78, 0.92],
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

// Explicit slots: linear base RGBA, then roughness/metallic/occlusion.
struct Material { factionMaskStrength: f32, pad0: f32, pad1: f32, pad2: f32 };
@group(2) @binding(0) var materialTable: texture_2d<f32>;
@group(2) @binding(1) var<uniform> mat: Material;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) light: f32,
  @location(2) faction: f32,
  @location(3) rim: f32,
  @location(4) height: f32,
  @location(5) corpse: f32,
  @location(6) @interpolate(flat) materialId: u32,
  @location(7) factionMask: f32,
  @location(8) worldNormal: vec3f,
  @location(9) worldPosition: vec3f,
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
  @location(3) joints: vec4f,
  @location(4) weights: vec4f,
  @location(5) inst0: vec4f,
  @location(6) inst1: vec4f,
  @location(7) inst2: vec4f,
  @location(8) materialId: f32,
  @location(9) factionMask: f32,
) -> VsOut {
  let clipStart = inst1.y;
  let clipFrames = max(inst1.z, 1.0);
  let phase = clamp(inst1.w, 0.0, 1.0);
  let frame = clipStart + floor(phase * max(clipFrames - 1.0, 0.0));
  let joint = jointMatrix(joints.x, frame) * weights.x
    + jointMatrix(joints.y, frame) * weights.y
    + jointMatrix(joints.z, frame) * weights.z
    + jointMatrix(joints.w, frame) * weights.w;
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
  let rolledNormal = vec3f(n.x, n.y * rc - n.z * rs, n.y * rs + n.z * rc);
  let worldNormal = vec3f(rolledNormal.x * c - rolledNormal.y * s, rolledNormal.x * s + rolledNormal.y * c, rolledNormal.z);
  let p = rolled * inst1.x;
  // inst2.x = terrain elevation: soldiers sit on the surface and sort by it.
  let world = vec3f(inst0.x + p.x * c - p.y * s, inst0.y + p.x * s + p.y * c, p.z + inst2.x);

  var out: VsOut;
  out.pos = projectWorld(world);
  out.color = color;
  out.materialId = u32(materialId);
  out.factionMask = factionMask;
  out.worldNormal = worldNormal;
  out.worldPosition = world;
  let sun = sunDirection();
  out.light = clamp(dot(worldNormal, sun) * 0.42 + 0.74, 0.34, 1.12);
  out.faction = inst0.w;
  out.rim = smoothstep(0.20, 0.92, 1.0 - abs(worldNormal.z));
  out.height = clamp(world.z / 2.1, 0.0, 1.0);
  out.corpse = corpse;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  // The shared bespoke-light presets are display-referred; surfaces are linear.
  let key = srgbToLinear(SKINNED_KEY);
  let fill = srgbToLinear(SKINNED_FILL);
  let blue = vec3f(0.20, 0.42, 0.88);
  let red = vec3f(0.84, 0.24, 0.20);
  // faction 0 = own/friend (blue), 1 = foe (red), 2 = neutral (amber). Battle only
  // ever sends 0/1, so its output is unchanged; campaign uses 2 for neutral stacks.
  let neutral = vec3f(0.82, 0.70, 0.34);
  var accent = select(blue, red, in.faction > 0.5);
  accent = select(accent, neutral, in.faction > 1.5);
  let surface = textureLoad(materialTable, vec2i(i32(in.materialId), 0), 0);
  let factors = textureLoad(materialTable, vec2i(i32(in.materialId), 1), 0);
  let teamMask = clamp(in.factionMask, 0.0, 1.0) * mat.factionMaskStrength;
  let armBand = srgbToLinear(mix(accent, vec3f(0.42, 0.34, 0.26), 0.35));
  let base = mix(in.color.rgb * surface.rgb, armBand, teamMask);
  let light01 = clamp((in.light - 0.34) / 0.78, 0.0, 1.0);
  let grade = mix(fill, key, light01);
  let rough = factors.r;
  let metal = factors.g;
  var shaded = base * (1.0 - metal) * (0.62 + light01 * 0.58) * grade;
  let n = normalize(in.worldNormal);
  let view = normalize(cam.eye - in.worldPosition);
  let halfDirection = normalize(view + sunDirection());
  let spec = pow(max(dot(n, halfDirection), 0.0), mix(128.0, 2.0, rough));
  let f0 = mix(vec3f(0.04), base, metal);
  let fresnel = f0 + (1.0 - f0) * pow(1.0 - max(dot(n, view), 0.0), 5.0);
  // A hemispheric reflection of the shared fill approximates the environment
  // in this retained raw lighting style. Roughness blurs it toward its mean;
  // unlike a constant fill, the reflection preserves surface-facing cues.
  let reflection = reflect(-view, n);
  let reflectedFill = fill * mix(0.2, 1.0, reflection.z * 0.5 + 0.5);
  let environmentSpec = mix(reflectedFill, fill * 0.6, rough);
  shaded += fresnel * environmentSpec + f0 * spec * key * max(dot(n, sunDirection()), 0.0);
  shaded += vec3f(0.055, 0.045, 0.026) * in.rim * (0.06 + teamMask * 0.08);
  shaded = mix(shaded, vec3f(0.92, 0.84, 0.60), (1.0 - in.height) * 0.035);
  shaded *= factors.b * SKINNED_EXPOSURE;
  // Corpses desaturate and darken so the fallen read as dead, not living.
  let lum = dot(shaded, vec3f(0.30, 0.59, 0.11));
  shaded = mix(shaded, vec3f(lum) * 0.62 + vec3f(0.06, 0.04, 0.03), in.corpse * 0.7);
  return vec4f(linearToSrgb(clamp(shaded, vec3f(0.0), vec3f(1.0))), in.color.a * surface.a);
}
fn srgbToLinear(value: vec3f) -> vec3f {
  return select(pow((value + 0.055) / 1.055, vec3f(2.4)), value / 12.92, value <= vec3f(0.04045));
}
fn linearToSrgb(value: vec3f) -> vec3f {
  return select(1.055 * pow(value, vec3f(1.0 / 2.4)) - 0.055, value * 12.92, value <= vec3f(0.0031308));
}`;

export class SkinnedCrowdPipeline {
  private pipeline: GPURenderPipeline;
  private resources: MeshResource[] = [];
  private resourceLookup = new Map<number, MeshResource[]>();
  private vatVariants: number;
  private materialUniform: GPUBuffer;
  private materialVariants = 0;
  private materialTableBytes = 0;
  private owned = new Set<GPUBuffer | GPUTexture>();
  private disposed = false;
  private readonly lighting: SkinnedLightingEnvironment;

  constructor(
    private shell: RawFrameShell,
    appearances: Record<number, AppearanceBundle>,
    opts: { lighting?: SkinnedLightingEnvironment } = {},
  ) {
    this.lighting = opts.lighting ?? DEFAULT_SKINNED_LIGHTING;
    const device = shell.device;
    const entries = Object.entries(appearances);
    if (entries.length === 0)
      throw new Error("SkinnedCrowdPipeline requires at least one appearance");
    try {
      const vatLayoutGroup = device.createBindGroupLayout({
        label: "skinned-vat-bgl",
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        ],
      });
      const materialLayoutGroup = device.createBindGroupLayout({
        label: "skinned-material-bgl",
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "unfilterable-float" },
          },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        ],
      });
      this.materialUniform = this.own(
        device.createBuffer({
          label: "skinned-material-uniform",
          size: 16,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
      );
      this.setFactionMaskStrength(1);
      this.pipeline = this.makePipeline(vatLayoutGroup, materialLayoutGroup);
      // Build one VatResource per distinct VatBake and reuse it for every class
      // that points at it (the all-placeholder case → a single resource).
      const cache = new Map<VatBake, VatResource>();
      const materialCache = new Map<SoldierMaterial[], GPUBindGroup>();
      const resourceFor = (vat: VatBake): VatResource => {
        const existing = cache.get(vat);
        if (existing) return existing;
        const resource = this.createVatResource(vat, vatLayoutGroup, cache.size);
        cache.set(vat, resource);
        return resource;
      };
      // One MeshResource per (classId, lod). Lower-detail tiers share the class's
      // VAT (skeleton is unchanged) and the lookup routes instances to their tier.
      this.resources = [];
      for (const [id, bundle] of entries) {
        const classId = Number(id);
        const vat = resourceFor(bundle.animation);
        let material = materialCache.get(bundle.materials);
        if (!material) {
          material = this.createMaterial(bundle.materials, materialLayoutGroup, materialCache.size);
          materialCache.set(bundle.materials, material);
        }
        this.resourceLookup.set(
          classId,
          bundle.tiers.map((mesh) => {
            const resource = this.createMeshResource(mesh, this.resources.length, vat, material);
            this.resources.push(resource);
            return resource;
          }),
        );
      }
      this.vatVariants = cache.size;
      this.materialVariants = materialCache.size;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /** Tune faction color strength on the authored upper sword-arm band. */
  setFactionMaskStrength(strength: number) {
    this.assertLive();
    this.shell.device.queue.writeBuffer(
      this.materialUniform,
      0,
      new Float32Array([Math.max(0, Math.min(1, strength)), 0, 0, 0]),
    );
  }

  private createMaterial(
    materials: SoldierMaterial[],
    layout: GPUBindGroupLayout,
    index: number,
  ): GPUBindGroup {
    const device = this.shell.device;
    const data = packSoldierMaterials(materials);
    const texture = this.own(
      device.createTexture({
        label: `skinned-material-table-${index}`,
        size: { width: materials.length, height: 2 },
        format: "rgba32float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      }),
    );
    device.queue.writeTexture(
      { texture },
      data,
      { bytesPerRow: materials.length * 16 },
      { width: materials.length, height: 2 },
    );
    this.materialTableBytes += data.byteLength;
    return device.createBindGroup({
      label: `skinned-material-bg-${index}`,
      layout,
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: { buffer: this.materialUniform } },
      ],
    });
  }

  private createVatResource(
    vat: VatBake,
    vatLayoutGroup: GPUBindGroupLayout,
    index: number,
  ): VatResource {
    const device = this.shell.device;
    const vatData = new Float32Array(4 + vat.data.length);
    vatData[0] = vat.width;
    vatData[1] = vat.height;
    vatData[2] = vat.bones;
    vatData.set(vat.data, 4);
    assertStorageBufferFits(vatData.byteLength, this.shell.info.caps, `skinned-vat-${index}`);
    const vatBuffer = this.own(
      device.createBuffer({
        label: `skinned-vat-buffer-${index}`,
        size: vatData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    );
    device.queue.writeBuffer(vatBuffer, 0, vatData);
    const bindGroup = device.createBindGroup({
      label: `skinned-vat-bg-${index}`,
      layout: vatLayoutGroup,
      entries: [{ binding: 0, resource: { buffer: vatBuffer } }],
    });
    return { bindGroup, layout: createVatLayout(vat) };
  }

  upload(
    instances: CrowdInstance[],
    opts: { forcedClip?: string | null; phaseOffset?: number; size?: number } = {},
  ) {
    this.assertLive();
    const groups = this.groupInstances(instances);
    for (let i = 0; i < this.resources.length; i++) {
      const resource = this.resources[i];
      const group = groups[i] ?? [];
      resource.instanceCount = group.length;
      this.uploadGroup(resource, group, opts);
    }
  }

  draw(pass: WorldRenderPass) {
    this.assertLive();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    for (const resource of this.resources) {
      if (resource.instanceCount === 0) continue;
      pass.setBindGroup(1, resource.vat.bindGroup);
      pass.setBindGroup(2, resource.material);
      pass.setVertexBuffer(0, resource.vertexBuffer);
      pass.setVertexBuffer(1, resource.instanceBuffer.buffer);
      pass.setIndexBuffer(
        resource.indexBuffer,
        resource.mesh.indices instanceof Uint32Array ? "uint32" : "uint16",
      );
      pass.drawIndexed(resource.mesh.indices.length, resource.instanceCount);
    }
  }

  stats(): SkinnedCrowdStats {
    const instances = this.resources.reduce((sum, resource) => sum + resource.instanceCount, 0);
    const clips = new Set<string>();
    for (const resource of this.resources)
      for (const name of resource.vat.layout.clips.keys()) clips.add(name);
    return {
      instances,
      drawCalls: this.resources.filter((resource) => resource.instanceCount > 0).length,
      vertices: this.resources.reduce(
        (sum, resource) => sum + resource.mesh.positions.length / 3,
        0,
      ),
      clips: Array.from(clips),
      meshVariants: this.resources.length,
      vatVariants: this.vatVariants,
      materialVariants: this.materialVariants,
      materialTableBytes: this.materialTableBytes,
      lighting: skinnedLightingStats(this.lighting),
      cameraContract: "shared-world-camera-wgsl",
    };
  }

  /** The clip layout VAT resolution uses for a given class (per-class clip table). */
  classClip(classId: number, name: string) {
    const resource = this.appearanceResources(classId)[0];
    return resolveVatClip(resource.vat.layout, name);
  }

  private createMeshResource(
    mesh: SoldierMeshData,
    index: number,
    vat: VatResource,
    material: GPUBindGroup,
  ): MeshResource {
    const device = this.shell.device;
    const vertexBuffer = this.own(
      makeVertexBuffer(device, `skinned-soldier-${index}-vertices`, packSoldierVertices(mesh)),
    );
    const indexBuffer = this.own(
      makeIndexBuffer(device, `skinned-soldier-${index}-indices`, mesh.indices),
    );
    const instanceBuffer = new GrowableBuffer(
      device,
      `skinned-crowd-${index}-instances`,
      GPUBufferUsage.VERTEX,
      256 * 12 * 4,
    );
    return {
      mesh,
      vat,
      material,
      index,
      vertexBuffer,
      indexBuffer,
      instanceBuffer,
      instanceCount: 0,
    };
  }

  private own<T extends GPUBuffer | GPUTexture>(resource: T): T {
    this.owned.add(resource);
    return resource;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const resource of this.resources) resource.instanceBuffer.dispose();
    for (const resource of this.owned) resource.destroy();
    this.owned.clear();
  }

  private assertLive(): void {
    if (this.disposed) throw new Error("SkinnedCrowdPipeline is disposed");
  }

  private appearanceResources(classId: number) {
    const resources = this.resourceLookup.get(classId);
    if (!resources) throw new Error(`soldier appearance ${classId} is not loaded`);
    return resources;
  }

  // Route each instance to its (classId, lod) resource. A requested lod beyond
  // the class's available tiers clamps to the coarsest tier it has.
  private groupInstances(instances: CrowdInstance[]) {
    const groups = this.resources.map(() => [] as CrowdInstance[]);
    for (const inst of instances) {
      const tiers = this.appearanceResources(inst.classId);
      const lod = Math.max(0, Math.min(tiers.length - 1, Math.floor(inst.lod || 0)));
      groups[tiers[lod].index].push(inst);
    }
    return groups;
  }

  private uploadGroup(
    resource: MeshResource,
    instances: CrowdInstance[],
    opts: { forcedClip?: string | null; phaseOffset?: number; size?: number },
  ) {
    const stride = 12;
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
      const phase = inst.phase + (opts.phaseOffset ?? 0);
      data[o + 7] = sampleVatPhase(phase, clip.loop);
      data[o + 8] = inst.elevation ?? 0; // inst2.x: terrain elevation
      data[o + 9] = inst.deathVariant ?? 0; // inst2.y: corpse variant 0..2
      data[o + 10] = inst.alive ? 0 : 1; // inst2.z: corpse flag
    }
    resource.instanceBuffer.write(data);
  }

  private makePipeline(vatLayout: GPUBindGroupLayout, materialLayout: GPUBindGroupLayout) {
    const device = this.shell.device;
    const module = compileShader(device, SKINNED_WGSL(this.lighting), "skinned-crowd");
    return cameraOnlyPipeline(this.shell, {
      label: "skinned-crowd-pipeline",
      module,
      buffers: [
        {
          arrayStride: SOLDIER_VERTEX_LAYOUT.strideFloats * Float32Array.BYTES_PER_ELEMENT,
          attributes: [
            {
              shaderLocation: 0,
              offset: SOLDIER_VERTEX_LAYOUT.offsets.position * 4,
              format: "float32x3",
            },
            {
              shaderLocation: 1,
              offset: SOLDIER_VERTEX_LAYOUT.offsets.normal * 4,
              format: "float32x3",
            },
            {
              shaderLocation: 2,
              offset: SOLDIER_VERTEX_LAYOUT.offsets.color * 4,
              format: "float32x4",
            },
            {
              shaderLocation: 3,
              offset: SOLDIER_VERTEX_LAYOUT.offsets.joints * 4,
              format: "float32x4",
            },
            {
              shaderLocation: 4,
              offset: SOLDIER_VERTEX_LAYOUT.offsets.weights * 4,
              format: "float32x4",
            },
            {
              shaderLocation: 8,
              offset: SOLDIER_VERTEX_LAYOUT.offsets.material * 4,
              format: "float32",
            },
            {
              shaderLocation: 9,
              offset: SOLDIER_VERTEX_LAYOUT.offsets.faction * 4,
              format: "float32",
            },
          ],
        },
        {
          arrayStride: 48,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 5, offset: 0, format: "float32x4" },
            { shaderLocation: 6, offset: 16, format: "float32x4" },
            { shaderLocation: 7, offset: 32, format: "float32x4" },
          ],
        },
      ],
      target: "opaque",
      depth: "read-write",
      extraBindGroupLayouts: [vatLayout, materialLayout],
    });
  }
}
