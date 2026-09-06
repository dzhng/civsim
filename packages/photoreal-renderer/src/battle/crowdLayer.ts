// crowdLayer — the VAT crowd on the photoreal substrate: per-class meshes,
// shared VAT bake, corpse roll/desaturation, and faction accents. Soldiers use
// a standard-material response with a NEUTRAL albedo; the sun + IBL light the
// skinned normals. The layer consumes the SAME buildCrowdInstances output and
// casts/receives REAL sun shadows; the shadow pass re-skins the same VAT
// positionNode per cascade.
import * as THREE from "three/webgpu";
import {
  attribute,
  clamp,
  dot,
  float,
  floor,
  int,
  max,
  mix,
  normalize,
  sin,
  transformNormalToView,
  varying,
  vec3,
  vec4,
} from "three/tsl";
import type { CrowdInstance } from "../../../crowd-runtime/src/instanceData";
import type { LodCamera, LodCounts } from "../../../crowd-runtime/src/lod";
import { soldierMaterialIdentity } from "../../../soldier-assets/src/material";
import type { AppearanceBundle } from "../../../soldier-assets/src/appearanceBundle";
import type { VatBake } from "../../../soldier-assets/src/schema";
import {
  createVatLayout,
  resolveVatClip,
  sampleVatPhase,
  type VatLayout,
} from "../../../renderer-core/src/vatLayout";
import { viewNormalNode } from "./battleTsl";
import { createSoldierImpostorAtlas, OctahedralImpostorLayer } from "./impostorLayer";
import { planPhotorealCrowdLods } from "./crowdLod";
import { RENDER_ORDER } from "./terrainLayer";
import { weightedVatColumns } from "./skinNodes";
import { soldierGeometry } from "./meshGeometry";
import {
  prepareSoldierSurface,
  type PreparedSoldierSurface,
  soldierFactionAccent,
  soldierSurfaceNodes,
  soldierContactOcclusion,
  soldierUnitDirection,
} from "./soldierSurface";

interface ClassBucket {
  mesh: THREE.Mesh;
  geometry: THREE.InstancedBufferGeometry;
  layout: VatLayout;
  capacity: number;
  inst0: Float32Array;
  inst1: Float32Array;
  inst2: Float32Array;
  count: number;
  pending: CrowdInstance[];
}

export interface CrowdVisibilityScope {
  camera: THREE.Camera;
  lodCamera: LodCamera;
  frusta: THREE.Frustum[];
  viewFrusta: number;
  shadowFrusta: number;
}

interface CrowdCullingStats {
  input: number;
  visible: number;
  culled: number;
  viewFrusta: number;
  shadowFrusta: number;
}

function emptyLodCounts(): LodCounts {
  return { l0: 0, l1: 0, l2: 0, l3: 0 };
}

/** Per-class instanced VAT crowd used by production. */
export class PhotorealCrowd {
  private buckets: Record<number, ClassBucket[]> = {};
  private readonly impostors: Record<number, OctahedralImpostorLayer> = {};
  private readonly textures = new Set<THREE.DataTexture>();
  private readonly surfaces = new Set<PreparedSoldierSurface>();
  private instanceCount = 0;
  private readonly materialIdentity = soldierMaterialIdentity();
  private previousLevels: number[] = [];
  private assignedCounts = emptyLodCounts();
  private visibleCounts = emptyLodCounts();
  private culling: CrowdCullingStats = {
    input: 0,
    visible: 0,
    culled: 0,
    viewFrusta: 0,
    shadowFrusta: 0,
  };
  private sourceInstances: CrowdInstance[] = [];
  private readonly cullCenter = new THREE.Vector3();
  private readonly cullSphere = new THREE.Sphere();

  private constructor(private readonly assets: Record<number, AppearanceBundle>) {}

  static async create(
    renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    assets: Record<number, AppearanceBundle>,
  ): Promise<PhotorealCrowd> {
    const crowd = new PhotorealCrowd(assets);
    await crowd.initialize(renderer, scene);
    return crowd;
  }

  private async initialize(renderer: THREE.WebGPURenderer, scene: THREE.Scene): Promise<void> {
    // One VAT texture per distinct bake (the all-placeholder case → one).
    const textures = new Map<VatBake, THREE.DataTexture>();
    await renderer.init();
    const surfaces = new Map<AppearanceBundle["surface"], PreparedSoldierSurface>();
    const surfaceFor = async (
      source: AppearanceBundle["surface"],
    ): Promise<PreparedSoldierSurface> => {
      let surface = surfaces.get(source);
      if (!surface) {
        surface = await prepareSoldierSurface(renderer, source);
        surfaces.set(source, surface);
        this.surfaces.add(surface);
      }
      return surface;
    };
    const textureFor = (vat: VatBake): THREE.DataTexture => {
      let tex = textures.get(vat);
      if (!tex) {
        tex = new THREE.DataTexture(
          new Float32Array(vat.data),
          vat.width,
          vat.height,
          THREE.RGBAFormat,
          THREE.FloatType,
        );
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        textures.set(vat, tex);
        this.textures.add(tex);
      }
      return tex;
    };
    // Local bake reloads may fail after some tiers have allocated resources.
    // Track allocations independently of buckets: a throwing map has no result.
    const created: THREE.Mesh[] = [];
    let atlas: Awaited<ReturnType<typeof createSoldierImpostorAtlas>> | null = null;
    try {
      for (const [id, bundle] of Object.entries(this.assets)) {
        const classId = Number(id);
        const vat = bundle.animation;
        const tiers = bundle.tiers;
        const surface = await surfaceFor(bundle.surface);
        this.buckets[classId] = tiers.map((tierMesh, lod) => {
          const geometry = soldierGeometry(tierMesh);
          const mesh = new THREE.Mesh(geometry, crowdMaterial(textureFor(vat), surface));
          created.push(mesh);
          mesh.name = `battle-crowd-${classId}-lod${lod}`;
          mesh.frustumCulled = false;
          mesh.renderOrder = RENDER_ORDER.worldOpaque;
          // Soldiers cast from the DETAILED tiers only: LOD2 impostor-distance
          // men re-rendered per cascade cost too much for shadows nobody can see
          // at that range. All tiers still receive.
          mesh.castShadow = lod < 2;
          mesh.receiveShadow = true;
          mesh.visible = false;
          scene.add(mesh);
          return {
            mesh,
            geometry,
            layout: createVatLayout(vat),
            capacity: 0,
            inst0: new Float32Array(0),
            inst1: new Float32Array(0),
            inst2: new Float32Array(0),
            count: 0,
            pending: [],
          };
        });
        atlas = await createSoldierImpostorAtlas(renderer, bundle.farMesh, vat, surface, {
          clip: bundle.manifest.far.clip,
          phase: bundle.manifest.far.phase,
        });
        this.impostors[classId] = new OctahedralImpostorLayer(scene, atlas);
        atlas = null;
      }
    } catch (error) {
      for (const mesh of created) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      for (const texture of this.textures) texture.dispose();
      for (const surface of this.surfaces) surface.dispose();
      for (const layer of Object.values(this.impostors)) layer.dispose();
      atlas?.dispose();
      throw error;
    }
  }

  upload(instances: CrowdInstance[], scope?: CrowdVisibilityScope): void {
    this.instanceCount = instances.length;
    this.sourceInstances = instances;
    for (const bucketSet of Object.values(this.buckets)) {
      for (const bucket of bucketSet) bucket.pending.length = 0;
    }
    const plan = scope
      ? planPhotorealCrowdLods(instances, scope.lodCamera, this.previousLevels)
      : {
          assignments: instances.map(() => ({ level: 0 as const, screenSize: 999 })),
          counts: { l0: instances.length, l1: 0, l2: 0, l3: 0 },
          policy: undefined,
        };
    this.previousLevels = plan.assignments.map((assignment) => assignment.level);
    this.assignedCounts = plan.counts;
    this.visibleCounts = emptyLodCounts();
    this.culling = {
      input: instances.length,
      visible: 0,
      culled: 0,
      viewFrusta: scope?.viewFrusta ?? 0,
      shadowFrusta: scope?.shadowFrusta ?? 0,
    };
    const impostors = Object.fromEntries(
      Object.keys(this.assets).map((id) => [id, [] as CrowdInstance[]]),
    );
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      if (!this.assets[inst.classId]) throw new Error(`Missing appearance ${inst.classId}`);
      const level = plan.assignments[i]?.level ?? 0;
      inst.lod = level;
      if (scope && !this.instanceIntersectsAnyFrustum(inst, scope.frusta)) {
        this.culling.culled++;
        continue;
      }
      this.culling.visible++;
      this.visibleCounts[`l${level}` as keyof LodCounts]++;
      if (level === 3) {
        impostors[inst.classId].push(inst);
        continue;
      }
      this.buckets[inst.classId][level].pending.push(inst);
    }
    for (const bucketSet of Object.values(this.buckets)) {
      for (const bucket of bucketSet) this.uploadBucket(bucket);
    }
    for (const [id, layer] of Object.entries(this.impostors)) {
      layer.upload(impostors[id]);
      if (scope) layer.setCamera(scope.camera);
    }
  }

  debugSoldierAnim(index: number): { clip: string; phase: number; frame: number } | null {
    const inst = this.sourceInstances[index];
    if (!inst) return null;
    return { clip: inst.clip, phase: inst.phase, frame: inst.frame };
  }

  refreshCamera(camera: THREE.Camera): void {
    for (const layer of Object.values(this.impostors)) layer.setCamera(camera);
  }

  private instanceIntersectsAnyFrustum(inst: CrowdInstance, frusta: THREE.Frustum[]): boolean {
    if (frusta.length === 0) return true;
    const { center, radius } = this.assets[inst.classId].manifest.bounds;
    const angle = inst.facing - Math.PI / 2;
    const variant = inst.deathVariant ?? 0;
    const roll = inst.alive ? 0 : (variant - 1) * 0.42 + Math.sin(variant * 2.3) * 0.18;
    const y = center[1] * Math.cos(roll) - center[2] * Math.sin(roll);
    const z = center[1] * Math.sin(roll) + center[2] * Math.cos(roll);
    this.cullCenter.set(
      inst.x + center[0] * Math.cos(angle) - y * Math.sin(angle),
      inst.y + center[0] * Math.sin(angle) + y * Math.cos(angle),
      (inst.elevation ?? 0) + z,
    );
    this.cullSphere.set(this.cullCenter, radius);
    return frusta.some((frustum) => frustum.intersectsSphere(this.cullSphere));
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
      const clip = resolveVatClip(bucket.layout, inst.clip);
      const o = i * 4;
      bucket.inst0[o] = inst.x;
      bucket.inst0[o + 1] = inst.y;
      bucket.inst0[o + 2] = inst.facing;
      bucket.inst0[o + 3] = inst.faction;
      bucket.inst1[o] = 1; // size
      bucket.inst1[o + 1] = clip.start;
      bucket.inst1[o + 2] = clip.frames;
      bucket.inst1[o + 3] = sampleVatPhase(inst.phase, clip.loop);
      bucket.inst2[o] = inst.elevation ?? 0;
      bucket.inst2[o + 1] = inst.deathVariant ?? 0;
      bucket.inst2[o + 2] = inst.alive ? 0 : 1;
      bucket.inst2[o + 3] = 0;
    }
    for (const name of ["inst0", "inst1", "inst2"] as const) {
      const attr = bucket.geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
      attr.needsUpdate = true;
    }
    bucket.geometry.instanceCount = list.length;
  }

  stats() {
    const meshDrawCalls = Object.values(this.buckets)
      .flat()
      .filter((bucket) => bucket.count > 0).length;
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
      visible: this.culling.visible,
      culled: this.culling.culled,
      drawCalls: meshDrawCalls + impostors.impostorDrawCalls,
      meshDrawCalls,
      impostorDrawCalls: impostors.impostorDrawCalls,
      meshVariants: Object.values(this.buckets).reduce(
        (sum, bucketSet) => sum + bucketSet.length,
        0,
      ),
      tierHistogram: { ...this.assignedCounts },
      visibleTierHistogram: { ...this.visibleCounts },
      culling: { ...this.culling },
      impostors,
      material: this.materialIdentity,
      surfaceImages: [...this.surfaces].flatMap((surface) => surface.stats),
    };
  }

  dispose(): void {
    for (const bucket of Object.values(this.buckets).flat()) {
      bucket.mesh.removeFromParent();
      bucket.geometry.dispose();
      (bucket.mesh.material as THREE.Material).dispose();
    }
    for (const layer of Object.values(this.impostors)) layer.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const surface of this.surfaces) surface.dispose();
  }
}

function crowdMaterial(
  vatTex: THREE.DataTexture,
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

  const clipStart = inst1.y;
  const clipFrames = max(inst1.z, 1.0);
  const phase = clamp(inst1.w, 0.0, 1.0);
  const frame = clipStart.add(floor(phase.mul(max(clipFrames.sub(1.0), 0.0)))).toVar();
  const [c0, c1, c2, c3] = weightedVatColumns(vatTex, int(frame));
  const local = c0.mul(position.x).add(c1.mul(position.y)).add(c2.mul(position.z)).add(c3).toVar();
  const n = normalize(c0.mul(normal.x).add(c1.mul(normal.y)).add(c2.mul(normal.z)).xyz).toVar();

  // Corpses roll by a per-variant angle so the fallen field reads as varied.
  const corpse = inst2.z.toVar();
  const variant = inst2.y;
  const roll = corpse
    .mul(
      variant
        .sub(1.0)
        .mul(0.42)
        .add(sin(variant.mul(2.3)).mul(0.18)),
    )
    .toVar();
  const rc = roll.cos().toVar();
  const rs = roll.sin().toVar();
  const rolled = vec3(
    local.x,
    local.y.mul(rc).sub(local.z.mul(rs)),
    local.y.mul(rs).add(local.z.mul(rc)),
  );
  const a = inst0.z.sub(1.5707964).toVar();
  const c = a.cos().toVar();
  const s = a.sin().toVar();
  const p = rolled.mul(inst1.x).toVar();
  // inst2.x = terrain elevation: soldiers sit on the surface and sort by it.
  const worldPosition = vec3(
    inst0.x.add(p.x.mul(c)).sub(p.y.mul(s)),
    inst0.y.add(p.x.mul(s)).add(p.y.mul(c)),
    p.z.add(inst2.x),
  );
  material.positionNode = worldPosition;
  const vWorldPosition = varying(worldPosition);
  material.receivedShadowPositionNode = vWorldPosition;

  // The environment lights the FULLY posed normal: skinned, corpse-rolled,
  // then yaw-rotated into world space.
  const rolledN = vec3(n.x, n.y.mul(rc).sub(n.z.mul(rs)), n.y.mul(rs).add(n.z.mul(rc)));
  const worldN = vec3(
    rolledN.x.mul(c).sub(rolledN.y.mul(s)),
    rolledN.x.mul(s).add(rolledN.y.mul(c)),
    rolledN.z,
  );
  material.normalNode = viewNormalNode(worldN);

  // Pack scalar instance/contact properties into one varying location so mapped
  // surfaces fit baseline WebGPU's inter-stage limit alongside production shadows.
  const contactAo = soldierContactOcclusion(rolled.z);
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
    const rolledT = vec3(t.x, t.y.mul(rc).sub(t.z.mul(rs)), t.y.mul(rs).add(t.z.mul(rc)));
    const worldT = vec3(
      rolledT.x.mul(c).sub(rolledT.y.mul(s)),
      rolledT.x.mul(s).add(rolledT.y.mul(c)),
      rolledT.z,
    );
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
