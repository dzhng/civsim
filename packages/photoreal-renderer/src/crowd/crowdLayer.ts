import { RENDER_ORDER } from "../renderOrder";
// crowdLayer — the skinned crowd on the photoreal substrate: per-class meshes,
// shared computed joint palettes, corpse desaturation, and faction accents. Soldiers use
// a standard-material response with a NEUTRAL albedo; the sun + IBL light the
// skinned normals. The layer consumes the SAME buildCrowdInstances output and
// casts/receives REAL sun shadows; the shadow pass re-skins the same palette
// positionNode per cascade.
import * as THREE from "three/webgpu";
import {
  attribute,
  clamp,
  dot,
  float,
  Fn,
  uint,
  mix,
  normalize,
  normalLocal,
  transformNormalToView,
  varying,
  vec3,
  vec4,
} from "three/tsl";
import {
  corpsePresentationStrength,
  type CrowdInstance,
} from "../../../crowd-runtime/src/instanceData";
import {
  COARSEST_SHADOW_LOD,
  IMPOSTOR_LEVEL,
  emptyLodCounts,
  type LodCounts,
} from "../../../crowd-runtime/src/lod";
import { soldierMaterialIdentity } from "../../../soldier-assets/src/material";
import type { AppearanceBundle } from "../../../soldier-assets/src/appearanceBundle";
import { decodeLocalSample, resolveLocalSample } from "../../../soldier-assets/src/localAnimation";
import { localPoseToJointMatrices } from "../../../soldier-assets/src/localPose";
import { viewNormalNode } from "../landscape/shaderNodes";
import { OctahedralImpostorLayer } from "./impostorLayer";
import { createSoldierImpostorAtlas } from "../../../soldier-assets/bake/impostors/atlas";
import { createSoldierImageOwner } from "../../../soldier-assets/bake/impostors/soldierImages";
import { soldierFactionAccent } from "./factionAccent";
import {
  createCrowdLodBuffers,
  planCrowdLods,
  type CrowdProjectionView,
} from "../../../crowd-runtime/src/visibility";
import { CROWD_SHADOW_LAYER, type CrowdAudience } from "./crowdAudience";

import { weightedPaletteColumns } from "./skinNodes";
import { SoldierPosePalette, type PaletteColumns } from "./posePalette";
import { soldierGeometry } from "./meshGeometry";
import {
  prepareSoldierSurface,
  type PreparedSoldierSurface,
  soldierSurfaceNodes,
  soldierContactOcclusion,
  soldierUnitDirection,
} from "../../../soldier-assets/bake/impostors/soldierSurface";

interface ClassBucket {
  audience: CrowdAudience;
  mesh: THREE.Mesh;
  geometry: THREE.InstancedBufferGeometry;
  group: PaletteGroup;
  surface: PreparedSoldierSurface;
  paletteIndices: number[];
  capacity: number;
  inst0: Float32Array;
  inst1: Float32Array;
  inst2: Float32Array;
  count: number;
  pending: CrowdInstance[];
}

type CrowdDrawQueue = Pick<ClassBucket, "pending" | "paletteIndices"> & {
  group: Pick<PaletteGroup, "pending">;
};

/** Both draw audiences reference one computed pose, even when their tiers differ. */
export function queueCrowdInstance(
  instance: CrowdInstance,
  main?: CrowdDrawQueue,
  shadow?: CrowdDrawQueue,
): void {
  const group = (main ?? shadow)?.group;
  if (!group) return;
  const index = group.pending.length;
  group.pending.push(instance);
  if (main) {
    main.paletteIndices.push(index);
    main.pending.push(instance);
  }
  if (shadow) {
    shadow.paletteIndices.push(index);
    shadow.pending.push(instance);
  }
}

interface PaletteGroup {
  palette: SoldierPosePalette;
  pending: CrowdInstance[];
  buckets: ClassBucket[];
}

export interface CrowdVisibilityScope {
  camera: THREE.Camera;
  views: CrowdProjectionView[];
}

interface CrowdCullingStats {
  input: number;
  visible: number;
  culled: number;
  viewFrusta: number;
  shadowFrusta: number;
  viewVisible: number;
  shadowOnly: number;
}

/** Actual draw producer: shadow eligibility is shared with projected LOD planning. */
export function createCrowdDrawMesh(
  classId: number,
  lod: number,
  geometry: THREE.InstancedBufferGeometry,
  material: THREE.MeshStandardNodeMaterial,
  audience: CrowdAudience,
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `physical-crowd-${classId}-${audience}-lod${lod}`;
  mesh.frustumCulled = false;
  mesh.renderOrder = RENDER_ORDER.worldOpaque;
  mesh.castShadow = audience === "shadow" && lod <= COARSEST_SHADOW_LOD;
  mesh.receiveShadow = audience === "main";
  if (audience === "shadow") mesh.layers.set(CROWD_SHADOW_LAYER);
  mesh.visible = false;
  return mesh;
}

/** Per-class geometry with one derived palette per visible mesh instance. */
export class PhotorealCrowd {
  private buckets: Record<number, Record<CrowdAudience, ClassBucket[]>> = {};
  private readonly impostors: Record<number, OctahedralImpostorLayer> = {};
  private readonly groups: PaletteGroup[] = [];
  private readonly imageOwner = createSoldierImageOwner();
  private readonly surfaces = new Set<PreparedSoldierSurface>();
  private instanceCount = 0;
  private readonly materialIdentity = soldierMaterialIdentity();
  private lodBuffers = createCrowdLodBuffers(0);
  private previousLodBuffers = createCrowdLodBuffers(0);
  private previousLevels: Uint8Array = new Uint8Array(0);
  private previousShadowLevels: Uint8Array = new Uint8Array(0);
  private assignedCounts = emptyLodCounts();
  private visibleCounts = emptyLodCounts();
  private shadowCounts = emptyLodCounts();
  private culling: CrowdCullingStats = {
    input: 0,
    visible: 0,
    culled: 0,
    viewFrusta: 0,
    shadowFrusta: 0,
    viewVisible: 0,
    shadowOnly: 0,
  };
  private sourceInstances: CrowdInstance[] = [];
  private uploadFailed = false;

  private constructor(
    private readonly assets: Record<number, AppearanceBundle>,
    private readonly modelScale: number,
  ) {}

  /** A borrowed world/renderer must remain usable across preparation's async boundaries. */
  static async create(
    renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    assets: Record<number, AppearanceBundle>,
    assertUsable?: () => void,
    modelScale = 1,
  ): Promise<PhotorealCrowd> {
    const crowd = new PhotorealCrowd(assets, modelScale);
    await crowd.initialize(renderer, scene, assertUsable);
    return crowd;
  }

  private async initialize(
    renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    assertUsable?: () => void,
  ): Promise<void> {
    await renderer.init();
    assertUsable?.();
    const surfaces = new Map<AppearanceBundle["surface"], PreparedSoldierSurface>();
    const surfaceFor = async (
      source: AppearanceBundle["surface"],
    ): Promise<PreparedSoldierSurface> => {
      let surface = surfaces.get(source);
      if (!surface) {
        surface = await prepareSoldierSurface(renderer, source, assertUsable, this.imageOwner);
        surfaces.set(source, surface);
        this.surfaces.add(surface);
      }
      return surface;
    };
    // Local bake reloads may fail after some tiers have allocated resources.
    // Track allocations independently of buckets: a throwing map has no result.
    const created: THREE.Mesh[] = [];
    let atlas: Awaited<ReturnType<typeof createSoldierImpostorAtlas>> | null = null;
    try {
      for (const [id, bundle] of Object.entries(this.assets)) {
        const classId = Number(id);
        let group = this.groups.find(
          (candidate) =>
            candidate.palette.rig === bundle.rig &&
            candidate.palette.animation === bundle.animation,
        );
        if (!group) {
          const appearances = Object.fromEntries(
            Object.entries(this.assets).filter(
              ([, other]) => other.rig === bundle.rig && other.animation === bundle.animation,
            ),
          );
          const palette = new SoldierPosePalette(
            renderer,
            bundle.rig,
            bundle.animation,
            appearances,
          );
          group = { palette, pending: [], buckets: [] };
          this.groups.push(group);
          await palette.initialize(bundle.manifest.far);
          assertUsable?.();
        }
        const paletteGroup = group;
        const tiers = bundle.tiers;
        const surface = await surfaceFor(bundle.surface);
        assertUsable?.();
        const createBuckets = (audience: CrowdAudience) =>
          tiers.map((tierMesh, lod) => {
            const geometry = soldierGeometry(tierMesh);
            const mesh = createCrowdDrawMesh(
              classId,
              lod,
              geometry,
              crowdMaterial(paletteGroup.palette.columns, bundle.animation.bones, surface),
              audience,
            );
            created.push(mesh);
            scene.add(mesh);
            const bucket: ClassBucket = {
              audience,
              mesh,
              geometry,
              group: paletteGroup,
              surface,
              paletteIndices: [],
              capacity: 0,
              inst0: new Float32Array(0),
              inst1: new Float32Array(0),
              inst2: new Float32Array(0),
              count: 0,
              pending: [],
            };
            paletteGroup.buckets.push(bucket);
            return bucket;
          });
        // Independent geometry ownership avoids aliasing Three's disposal/upload caches.
        this.buckets[classId] = { main: createBuckets("main"), shadow: createBuckets("shadow") };
        const far = bundle.manifest.far;
        const farPalette = localPoseToJointMatrices(
          bundle.rig,
          decodeLocalSample(
            bundle.animation,
            resolveLocalSample(bundle.animation, far.clip, far.phase),
          ),
        );
        atlas = await createSoldierImpostorAtlas(renderer, bundle.farMesh, farPalette, surface, {
          assertUsable,
        });
        assertUsable?.();
        this.impostors[classId] = new OctahedralImpostorLayer(scene, atlas, this.modelScale);
        atlas = null;
      }
    } catch (error) {
      for (const mesh of created) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      for (const group of this.groups) group.palette.dispose();
      for (const surface of this.surfaces) surface.dispose();
      for (const layer of Object.values(this.impostors)) layer.dispose();
      atlas?.dispose();
      assertUsable?.();
      throw error;
    }
  }

  upload(instances: CrowdInstance[], scope?: CrowdVisibilityScope): void {
    try {
      this.uploadFrame(instances, scope);
      this.uploadFailed = false;
    } catch (error) {
      // No frame may mix newly prepared rig groups with old or missing palettes.
      // A later complete upload can recover; never hide the original error.
      this.uploadFailed = true;
      this.sourceInstances = [];
      this.visibleCounts = emptyLodCounts();
      this.shadowCounts = emptyLodCounts();
      this.culling.visible = 0;
      this.culling.viewVisible = 0;
      this.culling.shadowOnly = 0;
      for (const group of this.groups)
        for (const bucket of group.buckets) {
          bucket.mesh.visible = false;
          bucket.geometry.instanceCount = 0;
          bucket.count = 0;
        }
      for (const layer of Object.values(this.impostors)) layer.upload([]);
      throw error;
    }
  }

  private uploadFrame(instances: CrowdInstance[], scope?: CrowdVisibilityScope): void {
    this.instanceCount = instances.length;
    this.sourceInstances = instances;
    for (const group of this.groups) {
      for (const bucket of group.buckets) {
        bucket.pending.length = 0;
        bucket.paletteIndices.length = 0;
      }
    }
    for (const group of this.groups) group.pending.length = 0;
    if (this.lodBuffers.levels.length < instances.length)
      this.lodBuffers = createCrowdLodBuffers(
        Math.max(instances.length, this.lodBuffers.levels.length * 2),
      );
    // Separate output keeps a failed plan from partly replacing the preceding history.
    const plan = scope
      ? planCrowdLods(
          instances,
          scope.views,
          this.assets,
          this.previousLevels,
          undefined,
          this.previousShadowLevels,
          this.lodBuffers,
          this.modelScale,
        )
      : {
          levels: this.lodBuffers.levels.fill(0, 0, instances.length),
          shadowLevels: this.lodBuffers.shadowLevels,
          shadowCounts: emptyLodCounts(),
          counts: { ...emptyLodCounts(), l0: instances.length },
          visibility: this.lodBuffers.visibility.fill(1, 0, instances.length),
          viewVisible: instances.length,
          shadowOnly: 0,
        };
    this.previousLevels = plan.levels.subarray(0, instances.length);
    this.previousShadowLevels = plan.shadowLevels.subarray(0, scope ? instances.length : 0);
    const spare = this.previousLodBuffers;
    this.previousLodBuffers = this.lodBuffers;
    this.lodBuffers = spare;
    this.assignedCounts = plan.counts;
    this.visibleCounts = emptyLodCounts();
    this.shadowCounts = plan.shadowCounts;
    this.culling = {
      input: instances.length,
      visible: 0,
      culled: 0,
      viewFrusta: scope?.views.filter((view) => !view.shadow).length ?? 0,
      shadowFrusta: scope?.views.filter((view) => view.shadow).length ?? 0,
      viewVisible: plan.viewVisible,
      shadowOnly: plan.shadowOnly,
    };
    const impostors = Object.fromEntries(
      Object.keys(this.assets).map((id) => [id, [] as CrowdInstance[]]),
    );
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      if (!this.assets[inst.classId]) throw new Error(`Missing appearance ${inst.classId}`);
      const level = plan.levels[i];
      inst.lod = level;
      if (!plan.visibility[i]) {
        this.culling.culled++;
        continue;
      }
      this.culling.visible++;
      const mainVisible = (plan.visibility[i] & 1) !== 0;
      if (mainVisible) {
        this.visibleCounts[`l${level}` as keyof LodCounts]++;
        if (level === IMPOSTOR_LEVEL) impostors[inst.classId].push(inst);
      }
      queueCrowdInstance(
        inst,
        mainVisible && level !== IMPOSTOR_LEVEL
          ? this.buckets[inst.classId].main[level]
          : undefined,
        plan.visibility[i] & 2
          ? this.buckets[inst.classId].shadow[plan.shadowLevels[i]]
          : undefined,
      );
    }
    for (const group of this.groups) {
      group.palette.upload(
        group.pending.length,
        (index) => group.pending[index].playback ?? group.pending[index],
        (index) => group.palette.metadata.upperMaskOffsets.get(group.pending[index].classId)!,
        (columns) => {
          const replacements: THREE.MeshStandardNodeMaterial[] = [];
          try {
            for (const bucket of group.buckets)
              replacements.push(
                crowdMaterial(columns, group.palette.animation.bones, bucket.surface),
              );
          } catch (error) {
            for (const material of replacements) material.dispose();
            throw error;
          }
          for (const [index, bucket] of group.buckets.entries()) {
            const previous = bucket.mesh.material as THREE.Material;
            bucket.mesh.material = replacements[index];
            previous.dispose();
          }
        },
      );
    }
    for (const group of this.groups) {
      for (const bucket of group.buckets) this.uploadBucket(bucket);
    }
    for (const [id, layer] of Object.entries(this.impostors)) {
      layer.upload(impostors[id]);
      if (scope) layer.setCamera(scope.camera);
    }
  }

  debugSoldierAnim(index: number) {
    const inst = this.sourceInstances[index];
    if (!inst) return null;
    return {
      root: [inst.x, inst.y],
      clip: inst.clip,
      phase: inst.phase,
      playback: inst.playback,
      duration: this.assets[inst.classId].animation.clips.find((clip) => clip.name === inst.clip)!
        .duration,
    };
  }

  refreshCamera(camera: THREE.Camera): void {
    for (const layer of Object.values(this.impostors)) layer.setCamera(camera);
  }

  private uploadBucket(bucket: ClassBucket): void {
    const list = bucket.pending;
    bucket.count = list.length;
    bucket.mesh.visible = list.length > 0;
    if (list.length === 0) {
      bucket.geometry.instanceCount = 0;
      return;
    }
    if (list.length > bucket.capacity) {
      bucket.capacity = Math.max(list.length, bucket.capacity * 2, 256);
      bucket.inst0 = new Float32Array(bucket.capacity * 4);
      bucket.inst1 = new Float32Array(bucket.capacity * 4);
      bucket.inst2 = new Float32Array(bucket.capacity * 4);
      bucket.geometry.setAttribute("inst0", new THREE.InstancedBufferAttribute(bucket.inst0, 4));
      bucket.geometry.setAttribute("inst1", new THREE.InstancedBufferAttribute(bucket.inst1, 4));
      bucket.geometry.setAttribute("inst2", new THREE.InstancedBufferAttribute(bucket.inst2, 4));
    }
    for (let i = 0; i < list.length; i++) {
      const inst = list[i];
      const o = i * 4;
      bucket.inst0[o] = inst.x;
      bucket.inst0[o + 1] = inst.y;
      bucket.inst0[o + 2] = inst.facing;
      bucket.inst0[o + 3] = inst.faction;
      bucket.inst1[o] = this.modelScale;
      bucket.inst1[o + 1] = bucket.paletteIndices[i];
      bucket.inst1[o + 2] = 0;
      bucket.inst1[o + 3] = 0;
      bucket.inst2[o] = inst.elevation ?? 0;
      bucket.inst2[o + 1] = 0; // aligned padding
      bucket.inst2[o + 2] = corpsePresentationStrength(inst);
      bucket.inst2[o + 3] = 0;
    }
    for (const name of ["inst0", "inst1", "inst2"] as const) {
      const attr = bucket.geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
      attr.needsUpdate = true;
    }
    bucket.geometry.instanceCount = list.length;
  }

  stats() {
    const buckets = this.groups.flatMap((group) => group.buckets);
    const meshDrawCalls = buckets.filter(
      (bucket) => bucket.count > 0 && bucket.audience === "main",
    ).length;
    const shadowMeshDrawCalls = buckets.filter(
      (bucket) => bucket.count > 0 && bucket.audience === "shadow",
    ).length;
    const shadowGeometryBytes = buckets.reduce((sum, bucket) => {
      if (bucket.audience !== "shadow") return sum;
      const position = bucket.geometry.getAttribute("position") as THREE.InterleavedBufferAttribute;
      return sum + position.data.array.byteLength + (bucket.geometry.index?.array.byteLength ?? 0);
    }, 0);
    const far = Object.values(this.impostors).map((layer) => layer.stats());
    const impostors = {
      impostorInstances: far.reduce((sum, stats) => sum + stats.impostorInstances, 0),
      impostorDrawCalls: far.reduce((sum, stats) => sum + stats.impostorDrawCalls, 0),
      appearances: far.length,
      atlasAllocatedBytes: far.reduce((sum, stats) => sum + stats.atlasMetrics.allocatedBytes, 0),
      atlasBakeMs: far.reduce((sum, stats) => sum + stats.atlasMetrics.bakeMs, 0),
      atlasBakeDrawCalls: far.reduce((sum, stats) => sum + stats.atlasMetrics.drawCalls, 0),
    };
    return {
      instances: this.instanceCount,
      modelScale: this.modelScale,
      visible: this.culling.visible,
      culled: this.culling.culled,
      drawCalls: meshDrawCalls + impostors.impostorDrawCalls,
      meshDrawCalls,
      shadowMeshDrawCalls,
      // Additional static buffer payload, allocated on first use by Three (not per-frame traffic).
      shadowGeometryBytes,
      impostorDrawCalls: impostors.impostorDrawCalls,
      meshVariants: buckets.filter((bucket) => bucket.audience === "main").length,
      shadowMeshVariants: buckets.filter((bucket) => bucket.audience === "shadow").length,
      shadowTierHistogram: { ...this.shadowCounts },
      tierHistogram: { ...this.assignedCounts },
      visibleTierHistogram: { ...this.visibleCounts },
      culling: { ...this.culling },
      impostors,
      material: this.materialIdentity,
      surfaceImages: this.imageOwner.stats().allocated,
      palettes: this.groups.map((group) => group.palette.stats()),
      uploadFailed: this.uploadFailed,
    };
  }

  dispose(): void {
    for (const bucket of this.groups.flatMap((group) => group.buckets)) {
      bucket.mesh.removeFromParent();
      bucket.geometry.dispose();
      (bucket.mesh.material as THREE.Material).dispose();
    }
    for (const layer of Object.values(this.impostors)) layer.dispose();
    for (const group of this.groups) group.palette.dispose();
    for (const surface of this.surfaces) surface.dispose();
  }
}

function crowdMaterial(
  palette: PaletteColumns,
  bones: number,
  preparedSurface: PreparedSoldierSurface,
): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
  // fog stays ON: the shared aerial-perspective hook (scene.fogNode, 10b)
  // hazes the crowd like every other world surface.
  const position = attribute<"vec3">("position", "vec3");
  const normal = attribute<"vec3">("normal", "vec3");
  const inst0 = attribute<"vec4">("inst0", "vec4");
  const inst1 = attribute<"vec4">("inst1", "vec4");
  const inst2 = attribute<"vec4">("inst2", "vec4");

  const [c0, c1, c2, c3] = weightedPaletteColumns(palette, uint(inst1.y), bones);
  const local = c0.mul(position.x).add(c1.mul(position.y)).add(c2.mul(position.z)).add(c3).toVar();
  const n = normalize(c0.mul(normal.x).add(c1.mul(normal.y)).add(c2.mul(normal.z)).xyz).toVar();

  const corpse = inst2.z.toVar();
  const a = inst0.z.sub(1.5707964).toVar();
  const c = a.cos().toVar();
  const s = a.sin().toVar();
  const p = local.xyz.mul(inst1.x).toVar();
  // inst2.x = terrain elevation: soldiers sit on the surface and sort by it.
  const worldPosition = vec3(
    inst0.x.add(p.x.mul(c)).sub(p.y.mul(s)),
    inst0.y.add(p.x.mul(s)).add(p.y.mul(c)),
    p.z.add(inst2.x),
  );
  const vWorldPosition = varying(worldPosition);
  material.receivedShadowPositionNode = vWorldPosition;

  // Authored skinning owns body orientation; instance facing rotates into world space.
  const worldN = vec3(n.x.mul(c).sub(n.y.mul(s)), n.x.mul(s).add(n.y.mul(c)), n.z);
  material.positionNode = Fn(() => {
    // Three's geometric roughness also consumes normalLocal, independently of
    // normalNode. Both must follow the same posed, instance-facing normal.
    normalLocal.assign(worldN);
    return worldPosition;
  })();
  material.normalNode = viewNormalNode(worldN);

  // Pack scalar instance/contact properties into one varying location so mapped
  // surfaces fit baseline WebGPU's inter-stage limit alongside production shadows.
  const contactAo = soldierContactOcclusion(local.z);
  const instanceSurface = varying(
    vec3(inst0.w, corpse, mix(float(1), contactAo, float(1).sub(corpse))),
  );
  const faction = instanceSurface.x;
  const vCorpse = instanceSurface.y;
  const surface = soldierSurfaceNodes(preparedSurface);
  if (surface.normal) {
    const tangent = attribute<"vec4">("tangent", "vec4");
    const t = soldierUnitDirection(
      c0.mul(tangent.x).add(c1.mul(tangent.y)).add(c2.mul(tangent.z)).xyz,
      vec3(0),
    ).toVar();
    const worldT = vec3(t.x.mul(c).sub(t.y.mul(s)), t.x.mul(s).add(t.y.mul(c)), t.z);
    material.normalNode = transformNormalToView(
      surface.normal(
        varying(worldN),
        varying(worldT),
        varying(tangent.w).setInterpolation("flat"),
        vWorldPosition,
      ),
    );
  }
  let albedo = mix(surface.albedo, soldierFactionAccent(faction), surface.factionMask).toVar();
  material.roughnessNode = surface.roughness;
  material.metalnessNode = surface.metallic;
  // Grounding/contact AO darkens the ambient light
  // over the bottom `band` world units of the LOCAL (pre-scale) mesh height, so
  // feet/ankles read as sitting in ground-occluded skylight rather than pasted
  // onto the terrain. It rides aoNode (indirect/IBL only) — the sun's direct
  // cast shadow is a separate owner. Living soldiers only: a prone
  // corpse's whole body is low, so gating by corpse keeps the fallen from
  // blackening wholesale.
  material.aoNode = surface.occlusion.mul(instanceSurface.z);

  // Corpses desaturate and darken so the fallen read as dead, not living.
  const lum = dot(albedo, vec3(0.3, 0.59, 0.11));
  albedo = mix(
    albedo,
    vec3(lum)
      .mul(0.62)
      .add(vec3(0.06, 0.04, 0.03)),
    vCorpse.mul(0.7),
  ).toVar();
  material.colorNode = vec4(clamp(albedo, vec3(0.0), vec3(1.0)), 1);
  return material;
}
