import type { CrowdInstance } from "../../crowd-runtime/src/instanceData";
import {
  packSoldierVertices,
  SOLDIER_VERTEX_LAYOUT,
  type SoldierMeshData,
} from "../../soldier-assets/src/mesh";
import type { AppearanceBundle } from "../../soldier-assets/src/appearanceBundle";
import { TANGENT_FRAME_EPSILON_SQUARED } from "../../soldier-assets/src/skin";
import {
  packSoldierMaterials,
  SOLDIER_MATERIAL_ROWS,
  SOLDIER_TEXTURE_COLOR_SPACES,
  type SoldierSurface,
  type SoldierTextureChannel,
} from "../../soldier-assets/src/material";
import { uploadImageTexture } from "./imageTexture";
import { compileShader } from "./compileShader";
import { GrowableBuffer, makeIndexBuffer, makeVertexBuffer } from "./gpuBuffers";
import { RawPosePalette } from "./rawPosePalette";
import type { RawFrameShell, WorldRenderPass } from "./frameShell";
import { WORLD_CAMERA_WGSL } from "./cameraWgsl";
import { cameraOnlyPipeline } from "./pipelineContracts";

interface SkinnedCrowdStats {
  submissionReady: boolean;
  instances: number;
  drawCalls: number;
  vertices: number;
  clips: string[];
  meshVariants: number;
  rigVariants: number;
  posePalettes: ReturnType<RawPosePalette["stats"]>[];
  materialVariants: number;
  materialTableBytes: number;
  imageTextures: {
    channel: SoldierTextureChannel;
    width: number;
    height: number;
    mipLevels: number;
  }[];
  normalMaps: "posed-tangent-frame";
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

interface MeshResource {
  mesh: SoldierMeshData;
  palette: RawPosePalette;
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
@group(1) @binding(0) var<storage, read> palette: array<mat4x4f>;

// Explicit slots: linear base RGBA, then roughness/metallic/occlusion.
struct Material { factionMaskStrength: f32, pad0: f32, pad1: f32, pad2: f32 };
@group(2) @binding(0) var materialTable: texture_2d<f32>;
@group(2) @binding(1) var<uniform> mat: Material;
@group(2) @binding(2) var baseMap: texture_2d<f32>;
@group(2) @binding(3) var baseSampler: sampler;
@group(2) @binding(4) var normalMap: texture_2d<f32>;
@group(2) @binding(5) var normalSampler: sampler;
@group(2) @binding(6) var ormMap: texture_2d<f32>;
@group(2) @binding(7) var ormSampler: sampler;

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
  @location(10) uv: vec2f,
  @location(11) worldTangent: vec3f,
  @location(12) @interpolate(flat) tangentSign: f32,
};

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
  @location(10) uv: vec2f,
  @location(11) tangent: vec4f,
) -> VsOut {
  let paletteBase = u32(inst1.y) * u32(inst1.z);
  let joint = palette[paletteBase + u32(joints.x)] * weights.x
    + palette[paletteBase + u32(joints.y)] * weights.y
    + palette[paletteBase + u32(joints.z)] * weights.z
    + palette[paletteBase + u32(joints.w)] * weights.w;
  let local = joint * vec4f(position, 1.0);
  let n = normalize((joint * vec4f(normal, 0.0)).xyz);
  let t = finiteNormal((joint * vec4f(tangent.xyz, 0.0)).xyz, vec3f(0));

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
  let rolledTangent = vec3f(t.x, t.y * rc - t.z * rs, t.y * rs + t.z * rc);
  let worldTangent = vec3f(rolledTangent.x * c - rolledTangent.y * s, rolledTangent.x * s + rolledTangent.y * c, rolledTangent.z);
  let p = rolled * inst1.x;
  // inst2.x = terrain elevation: soldiers sit on the surface and sort by it.
  let world = vec3f(inst0.x + p.x * c - p.y * s, inst0.y + p.x * s + p.y * c, p.z + inst2.x);

  var out: VsOut;
  out.pos = projectWorld(world);
  out.color = color;
  out.uv = uv;
  out.materialId = u32(materialId);
  out.factionMask = factionMask;
  out.worldNormal = worldNormal;
  out.worldTangent = worldTangent;
  out.tangentSign = tangent.w;
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
fn fs(in: VsOut, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {
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
  let uses = textureLoad(materialTable, vec2i(i32(in.materialId), 2), 0);
  // Sample outside slot-dependent control flow so implicit derivatives stay valid.
  let baseTexel = textureSample(baseMap, baseSampler, in.uv);
  let ormTexel = textureSample(ormMap, ormSampler, in.uv);
  let normalTexel = textureSample(normalMap, normalSampler, in.uv).rgb;
  let faceNormal = cross(dpdy(in.worldPosition), dpdx(in.worldPosition)) * select(-1.0, 1.0, frontFacing);
  var n = normalize(in.worldNormal);
  var light = in.light;
  var rim = in.rim;
  // Preserve the accepted unmapped path, including its vertex light interpolation.
  if (uses.y > 0.5) {
    let normalIsUsable = dot(in.worldNormal, in.worldNormal) > ${TANGENT_FRAME_EPSILON_SQUARED};
    let geometric = select(finiteNormal(faceNormal, vec3f(0, 0, 1)), finiteNormal(in.worldNormal, vec3f(0, 0, 1)), normalIsUsable);
    let tangentIsUsable = dot(in.worldTangent, in.worldTangent) > ${TANGENT_FRAME_EPSILON_SQUARED};
    let tangentDirection = finiteNormal(in.worldTangent, vec3f(0));
    let orthogonal = tangentDirection - geometric * dot(geometric, tangentDirection);
    let decoded = normalTexel * 2.0 - 1.0;
    let direction = finiteNormal(vec3f(decoded.xy * factors.a, decoded.z), vec3f(0));
    n = geometric;
    if (normalIsUsable && tangentIsUsable && dot(orthogonal, orthogonal) > ${TANGENT_FRAME_EPSILON_SQUARED} && dot(direction, direction) > 0.0) {
      let tangent = normalize(orthogonal);
      let bitangent = cross(geometric, tangent) * in.tangentSign;
      n = finiteNormal(tangent * direction.x + bitangent * direction.y + geometric * direction.z, geometric);
    }
    light = clamp(dot(n, sunDirection()) * 0.42 + 0.74, 0.34, 1.12);
    rim = smoothstep(0.20, 0.92, 1.0 - abs(n.z));
  }
  let mappedBase = surface * mix(vec4f(1), baseTexel, uses.x);
  let teamMask = clamp(in.factionMask, 0.0, 1.0) * mat.factionMaskStrength;
  let armBand = srgbToLinear(mix(accent, vec3f(0.42, 0.34, 0.26), 0.35));
  let base = mix(in.color.rgb * mappedBase.rgb, armBand, teamMask);
  let light01 = clamp((light - 0.34) / 0.78, 0.0, 1.0);
  let grade = mix(fill, key, light01);
  let rough = factors.r * mix(1.0, ormTexel.g, uses.z);
  let metal = factors.g * mix(1.0, ormTexel.b, uses.z);
  let occlusion = mix(1.0, mix(1.0, ormTexel.r, factors.b), uses.w);
  var shaded = base * (1.0 - metal) * (0.62 + light01 * 0.58) * grade;
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
  shaded += vec3f(0.055, 0.045, 0.026) * rim * (0.06 + teamMask * 0.08);
  shaded = mix(shaded, vec3f(0.92, 0.84, 0.60), (1.0 - in.height) * 0.035);
  shaded *= occlusion * SKINNED_EXPOSURE;
  // Corpses desaturate and darken so the fallen read as dead, not living.
  let lum = dot(shaded, vec3f(0.30, 0.59, 0.11));
  shaded = mix(shaded, vec3f(lum) * 0.62 + vec3f(0.06, 0.04, 0.03), in.corpse * 0.7);
  return vec4f(linearToSrgb(clamp(shaded, vec3f(0.0), vec3f(1.0))), in.color.a * mappedBase.a);
}
fn finiteNormal(direction: vec3f, fallback: vec3f) -> vec3f {
  // Authored normalScale may be large: normalize after bounding components so
  // a finite direction cannot overflow its squared length or TBN combination.
  let largest = max(abs(direction.x), max(abs(direction.y), abs(direction.z)));
  let scaled = direction / select(1.0, largest, largest > 0.0);
  if (largest > 0.0) { return scaled * inverseSqrt(dot(scaled, scaled)); }
  return fallback;
}
fn srgbToLinear(value: vec3f) -> vec3f {
  return select(pow((value + 0.055) / 1.055, vec3f(2.4)), value / 12.92, value <= vec3f(0.04045));
}
fn linearToSrgb(value: vec3f) -> vec3f {
  return select(1.055 * pow(value, vec3f(1.0 / 2.4)) - 0.055, value * 12.92, value <= vec3f(0.0031308));
}`;

export class SkinnedCrowdPipeline {
  private pipeline!: GPURenderPipeline;
  private resources: MeshResource[] = [];
  private resourceLookup = new Map<number, MeshResource[]>();
  private palettes: RawPosePalette[] = [];
  private appearances: Record<number, AppearanceBundle> = {};
  private materialUniform!: GPUBuffer;
  private materialVariants = 0;
  private materialTableBytes = 0;
  private owned = new Set<GPUBuffer | GPUTexture>();
  private disposed = false;
  private submissionReady = true;
  private readonly lighting: SkinnedLightingEnvironment;
  private images = new Map<SoldierSurface, Partial<Record<SoldierTextureChannel, GPUTexture>>>();
  private imageStats: SkinnedCrowdStats["imageTextures"] = [];
  private neutrals = new Map<SoldierTextureChannel, GPUTexture>();

  private constructor(
    private shell: RawFrameShell,
    opts: { lighting?: SkinnedLightingEnvironment } = {},
  ) {
    this.lighting = opts.lighting ?? DEFAULT_SKINNED_LIGHTING;
  }

  static async create(
    shell: RawFrameShell,
    appearances: Record<number, AppearanceBundle>,
    opts: { lighting?: SkinnedLightingEnvironment } = {},
  ): Promise<SkinnedCrowdPipeline> {
    const crowd = new SkinnedCrowdPipeline(shell, opts);
    try {
      for (const [classId, { surface }] of Object.entries(appearances)) {
        if (crowd.images.has(surface)) continue;
        const images: Partial<Record<SoldierTextureChannel, GPUTexture>> = {};
        crowd.images.set(surface, images);
        for (const channel of Object.keys(
          SOLDIER_TEXTURE_COLOR_SPACES,
        ) as SoldierTextureChannel[]) {
          const source = surface.textures[channel];
          if (!source) continue;
          let bitmap: ImageBitmap | undefined;
          try {
            bitmap = await createImageBitmap(new Blob([source.image], { type: source.mimeType }), {
              colorSpaceConversion: "none",
              premultiplyAlpha: "none",
              imageOrientation: "none",
            });
            const texture = crowd.own(
              await uploadImageTexture(shell.device, bitmap, {
                colorSpace: SOLDIER_TEXTURE_COLOR_SPACES[channel],
                generateMipmaps: source.sampler.mipmapFilter !== "none",
              }),
            );
            images[channel] = texture;
            crowd.imageStats.push({
              channel,
              width: texture.width,
              height: texture.height,
              mipLevels: texture.mipLevelCount,
            });
          } catch (error) {
            throw new Error(
              `Raw soldier appearance ${classId} ${channel} image preparation failed: ${String(error)}`,
              { cause: error },
            );
          } finally {
            bitmap?.close();
          }
        }
      }
      const device = shell.device;
      device.pushErrorScope("out-of-memory");
      device.pushErrorScope("internal");
      device.pushErrorScope("validation");
      let submissionError: unknown;
      let failed = false;
      try {
        crowd.initialize(appearances);
      } catch (error) {
        submissionError = error;
        failed = true;
      }
      const admission = await Promise.allSettled([
        device.popErrorScope(),
        device.popErrorScope(),
        device.popErrorScope(),
      ]);
      const failures = admission.flatMap((result) =>
        result.status === "rejected"
          ? [String(result.reason)]
          : result.value
            ? [result.value.message]
            : [],
      );
      if (failed || failures.length)
        throw new Error(
          `Raw soldier surface preparation failed: ${[
            ...(failed ? [String(submissionError)] : []),
            ...failures,
          ].join("; ")}`,
          { cause: submissionError },
        );
      return crowd;
    } catch (error) {
      crowd.dispose();
      throw error;
    }
  }

  private initialize(appearances: Record<number, AppearanceBundle>) {
    const device = this.shell.device;
    this.appearances = appearances;
    const entries = Object.entries(appearances);
    if (entries.length === 0)
      throw new Error("SkinnedCrowdPipeline requires at least one appearance");
    try {
      const paletteLayout = device.createBindGroupLayout({
        label: "skinned-palette-bgl",
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
          ...[2, 4, 6].flatMap((binding) => [
            {
              binding,
              visibility: GPUShaderStage.FRAGMENT,
              texture: { sampleType: "float" as const },
            },
            {
              binding: binding + 1,
              visibility: GPUShaderStage.FRAGMENT,
              sampler: { type: "filtering" as const },
            },
          ]),
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
      this.pipeline = this.makePipeline(paletteLayout, materialLayoutGroup);
      const rigGroups: Record<number, AppearanceBundle>[] = [];
      for (const [id, bundle] of entries) {
        let group = rigGroups.find((group) => {
          const first = Object.values(group)[0];
          return first.rig === bundle.rig && first.animation === bundle.animation;
        });
        if (!group) {
          group = {};
          rigGroups.push(group);
        }
        group[Number(id)] = bundle;
      }
      const paletteFor = new Map<number, RawPosePalette>();
      for (const group of rigGroups) {
        const first = Object.values(group)[0];
        const palette = new RawPosePalette(
          device,
          this.shell.info.caps,
          first.rig,
          first.animation,
          group,
          `skinned-pose-${this.palettes.length}`,
          paletteLayout,
        );
        this.palettes.push(palette);
        for (const id of Object.keys(group)) paletteFor.set(Number(id), palette);
      }
      const materialCache = new Map<SoldierSurface, GPUBindGroup>();
      // Mesh/material buckets share one prepared pose per submitted instance,
      // independent of which LOD receives it.
      this.resources = [];
      for (const [id, bundle] of entries) {
        const classId = Number(id);
        const palette = paletteFor.get(classId)!;
        let material = materialCache.get(bundle.surface);
        if (!material) {
          material = this.createMaterial(bundle.surface, materialLayoutGroup, materialCache.size);
          materialCache.set(bundle.surface, material);
        }
        this.resourceLookup.set(
          classId,
          bundle.tiers.map((mesh) => {
            const resource = this.createMeshResource(
              mesh,
              this.resources.length,
              palette,
              material,
            );
            this.resources.push(resource);
            return resource;
          }),
        );
      }
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
    surface: SoldierSurface,
    layout: GPUBindGroupLayout,
    index: number,
  ): GPUBindGroup {
    const device = this.shell.device;
    const { materials } = surface;
    const data = packSoldierMaterials(materials);
    const texture = this.own(
      device.createTexture({
        label: `skinned-material-table-${index}`,
        size: { width: materials.length, height: SOLDIER_MATERIAL_ROWS },
        format: "rgba32float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      }),
    );
    device.queue.writeTexture(
      { texture },
      data,
      { bytesPerRow: materials.length * 16 },
      { width: materials.length, height: SOLDIER_MATERIAL_ROWS },
    );
    this.materialTableBytes += data.byteLength;
    return device.createBindGroup({
      label: `skinned-material-bg-${index}`,
      layout,
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: { buffer: this.materialUniform } },
        ...(["baseColor", "normal", "orm"] as const).flatMap((channel, index) => {
          const image = this.images.get(surface)?.[channel] ?? this.neutralImage(channel);
          const sampler = surface.textures[channel]?.sampler;
          return [
            { binding: 2 + index * 2, resource: image.createView() },
            {
              binding: 3 + index * 2,
              resource: device.createSampler({
                addressModeU: sampler?.wrapS ?? "clamp-to-edge",
                addressModeV: sampler?.wrapT ?? "clamp-to-edge",
                magFilter: sampler?.magFilter ?? "nearest",
                minFilter: sampler?.minFilter ?? "nearest",
                mipmapFilter: sampler?.mipmapFilter === "linear" ? "linear" : "nearest",
                lodMaxClamp:
                  !sampler || sampler.mipmapFilter === "none" ? 0 : image.mipLevelCount - 1,
              }),
            },
          ];
        }),
      ],
    });
  }

  private neutralImage(channel: SoldierTextureChannel): GPUTexture {
    const existing = this.neutrals.get(channel);
    if (existing) return existing;
    const texture = this.own(
      this.shell.device.createTexture({
        label: `skinned-neutral-${channel}`,
        size: [1, 1],
        format: channel === "baseColor" ? "rgba8unorm-srgb" : "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      }),
    );
    this.shell.device.queue.writeTexture(
      { texture },
      new Uint8Array(channel === "normal" ? [128, 128, 255, 255] : [255, 255, 255, 255]),
      { bytesPerRow: 4 },
      [1, 1],
    );
    this.neutrals.set(channel, texture);
    return texture;
  }

  upload(instances: CrowdInstance[], opts: { size?: number } = {}) {
    this.assertLive();
    // A later rig/mesh upload can fail after an earlier one has queued writes.
    // The original error propagates; no partial crowd may be submitted afterward.
    this.submissionReady = false;
    const { groups, rigGroups, paletteIndices } = this.groupInstances(instances);
    for (const palette of this.palettes) {
      const group = rigGroups.get(palette) ?? [];
      palette.upload(
        group.length,
        (index) => instances[group[index]].playback ?? instances[group[index]],
        (index) => instances[group[index]].classId,
      );
    }
    for (let i = 0; i < this.resources.length; i++) {
      const resource = this.resources[i];
      const group = groups[i] ?? [];
      resource.instanceCount = group.length;
      this.uploadGroup(resource, group, instances, paletteIndices, opts);
    }
    this.submissionReady = true;
  }

  /** Record once before this frame's visible/depth draws through the owned shell. */
  precompute(encoder: GPUCommandEncoder): void {
    this.assertLive();
    if (!this.submissionReady) return;
    for (const palette of this.palettes) palette.precompute(encoder);
  }

  draw(pass: WorldRenderPass) {
    this.assertLive();
    if (!this.submissionReady) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    for (const resource of this.resources) {
      if (resource.instanceCount === 0) continue;
      pass.setBindGroup(1, resource.palette.bindGroup);
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
    for (const palette of this.palettes)
      for (const clip of palette.animation.clips) clips.add(clip.name);
    return {
      submissionReady: this.submissionReady,
      instances: this.submissionReady ? instances : 0,
      drawCalls: this.submissionReady
        ? this.resources.filter((resource) => resource.instanceCount > 0).length
        : 0,
      vertices: this.resources.reduce(
        (sum, resource) => sum + resource.mesh.positions.length / 3,
        0,
      ),
      clips: Array.from(clips),
      meshVariants: this.resources.length,
      rigVariants: this.palettes.length,
      posePalettes: this.palettes.map((palette) => palette.stats()),
      materialVariants: this.materialVariants,
      materialTableBytes: this.materialTableBytes,
      imageTextures: this.imageStats,
      normalMaps: "posed-tangent-frame",
      lighting: skinnedLightingStats(this.lighting),
      cameraContract: "shared-world-camera-wgsl",
    };
  }

  /** Authored local-animation metadata for manual inspection of this appearance. */
  classClip(classId: number, name: string) {
    this.appearanceResources(classId);
    const clip = this.appearances[classId].animation.clips.find((clip) => clip.name === name);
    if (!clip) throw new Error(`missing local clip ${name} for appearance ${classId}`);
    return clip;
  }

  private createMeshResource(
    mesh: SoldierMeshData,
    index: number,
    palette: RawPosePalette,
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
      palette,
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
    for (const palette of this.palettes) palette.dispose();
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
    const groups = this.resources.map(() => [] as number[]);
    const rigGroups = new Map<RawPosePalette, number[]>();
    const paletteIndices = new Uint32Array(instances.length);
    for (let index = 0; index < instances.length; index++) {
      const inst = instances[index];
      const tiers = this.appearanceResources(inst.classId);
      const lod = Math.max(0, Math.min(tiers.length - 1, Math.floor(inst.lod || 0)));
      const resource = tiers[lod];
      groups[resource.index].push(index);
      let group = rigGroups.get(resource.palette);
      if (!group) {
        group = [];
        rigGroups.set(resource.palette, group);
      }
      paletteIndices[index] = group.length;
      group.push(index);
    }
    return { groups, rigGroups, paletteIndices };
  }

  private uploadGroup(
    resource: MeshResource,
    group: number[],
    instances: CrowdInstance[],
    paletteIndices: Uint32Array,
    opts: { size?: number },
  ) {
    const stride = 12;
    if (group.length === 0) return;
    const data = new Float32Array(group.length * stride);
    for (let i = 0; i < group.length; i++) {
      const inst = instances[group[i]];
      const o = i * stride;
      data[o] = inst.x;
      data[o + 1] = inst.y;
      data[o + 2] = inst.facing;
      data[o + 3] = inst.faction;
      data[o + 4] = opts.size ?? 1;
      data[o + 5] = paletteIndices[group[i]];
      data[o + 6] = resource.palette.bones;
      data[o + 8] = inst.elevation ?? 0; // inst2.x: terrain elevation
      data[o + 9] = inst.deathVariant ?? 0; // inst2.y: corpse variant 0..2
      data[o + 10] = inst.alive ? 0 : 1; // inst2.z: corpse flag
    }
    resource.instanceBuffer.write(data);
  }

  private makePipeline(paletteLayout: GPUBindGroupLayout, materialLayout: GPUBindGroupLayout) {
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
            {
              shaderLocation: 10,
              offset: SOLDIER_VERTEX_LAYOUT.offsets.uv * 4,
              format: "float32x2",
            },
            {
              shaderLocation: 11,
              offset: SOLDIER_VERTEX_LAYOUT.offsets.tangent * 4,
              format: "float32x4",
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
      extraBindGroupLayouts: [paletteLayout, materialLayout],
    });
  }
}
