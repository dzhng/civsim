// crowdLayer — the VAT crowd on the photoreal substrate: per-class meshes,
// shared VAT bake, corpse roll/desaturation, and faction accents. Soldiers use
// a standard-material response with a NEUTRAL albedo; the sun + IBL light the
// skinned normals. The layer consumes the SAME buildCrowdInstances output and
// casts/receives REAL sun shadows; the shadow pass re-skins the same VAT
// positionNode per cascade.
import * as THREE from 'three/webgpu';
import {
  abs, attribute, clamp, dot, float, floor, fract, int, ivec2, max, mix, normalize, sin, smoothstep, step, textureLoad, varying, vec3, vec4,
} from 'three/tsl';
import type { CrowdInstance } from '../../../crowd-runtime/src/instanceData';
import type { LodCamera, LodCounts } from '../../../crowd-runtime/src/lod';
import {
  SOLDIER_MATERIAL_MASKS,
  SOLDIER_PBR_VALUES,
  soldierMaterialIdentity,
  type SoldierMeshData,
} from '../../../soldier-assets/src/soldierMesh';
import { factionForTeam } from '../../../game-renderer/src/battle/factionColors';
import type { SoldierKitManifest, VatBake } from '../../../soldier-assets/src/schema';
import { createVatLayout, resolveVatClip, type VatLayout } from '../../../renderer-core/src/vatLayout';
import { linearAlbedo, viewNormalNode } from './battleTsl';
import { createSoldierImpostorAtlas, OctahedralImpostorLayer } from './impostorLayer';
import { planPhotorealCrowdLods } from './crowdLod';
import { RENDER_ORDER } from './terrainLayer';

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
  private buckets: ClassBucket[][] = [];
  private readonly impostors: OctahedralImpostorLayer;
  private readonly textures = new Set<THREE.DataTexture>();
  private instanceCount = 0;
  private readonly materialIdentity: ReturnType<typeof soldierMaterialIdentity>;
  private previousLevels: number[] = [];
  private assignedCounts = emptyLodCounts();
  private visibleCounts = emptyLodCounts();
  private culling: CrowdCullingStats = { input: 0, visible: 0, culled: 0, viewFrusta: 0, shadowFrusta: 0 };
  private sourceInstances: CrowdInstance[] = [];
  private readonly cullCenter = new THREE.Vector3();
  private readonly cullSphere = new THREE.Sphere();

  constructor(
    scene: THREE.Scene,
    meshes: SoldierMeshData[][],
    vats: VatBake[],
    kit: SoldierKitManifest,
  ) {
    this.materialIdentity = soldierMaterialIdentity(kit);
    // One VAT texture per distinct bake (the all-placeholder case → one).
    const textures = new Map<VatBake, THREE.DataTexture>();
    const textureFor = (vat: VatBake): THREE.DataTexture => {
      let tex = textures.get(vat);
      if (!tex) {
        tex = new THREE.DataTexture(new Float32Array(vat.data), vat.width, vat.height, THREE.RGBAFormat, THREE.FloatType);
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        textures.set(vat, tex);
        this.textures.add(tex);
      }
      return tex;
    };
    for (let classId = 0; classId < meshes.length; classId++) {
      const vat = vats[classId] ?? vats[vats.length - 1] ?? vats[0];
      const tiers = meshes[classId];
      this.buckets[classId] = tiers.map((tierMesh, lod) => {
        const geometry = crowdGeometry(tierMesh);
        const mesh = new THREE.Mesh(geometry, crowdMaterial(textureFor(vat)));
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
          layout: createVatLayout(vat, kit),
          capacity: 0,
          inst0: new Float32Array(0),
          inst1: new Float32Array(0),
          inst2: new Float32Array(0),
          count: 0,
          pending: [],
        };
      });
    }
    const sharedAtlas = createSoldierImpostorAtlas(meshes[0][0], vats[0]);
    this.impostors = new OctahedralImpostorLayer(scene, sharedAtlas);
  }

  upload(instances: CrowdInstance[], scope?: CrowdVisibilityScope): void {
    this.instanceCount = instances.length;
    this.sourceInstances = instances;
    for (const bucketSet of this.buckets) {
      for (const bucket of bucketSet) bucket.pending.length = 0;
    }
    const plan = scope
      ? planPhotorealCrowdLods(instances, scope.lodCamera, this.previousLevels)
      : { assignments: instances.map(() => ({ level: 0 as const, screenSize: 999 })), counts: { l0: instances.length, l1: 0, l2: 0, l3: 0 }, policy: undefined };
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
    const impostors: CrowdInstance[] = [];
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const level = plan.assignments[i]?.level ?? 0;
      inst.lod = level;
      if (scope && !this.instanceIntersectsAnyFrustum(inst, scope.frusta)) {
        this.culling.culled++;
        continue;
      }
      this.culling.visible++;
      this.visibleCounts[`l${level}` as keyof LodCounts]++;
      if (level === 3) {
        impostors.push(inst);
        continue;
      }
      const classId = Math.max(0, Math.min(this.buckets.length - 1, Math.floor(inst.classId || 0)));
      const tier = Math.max(0, Math.min(this.buckets[classId].length - 1, level));
      this.buckets[classId][tier].pending.push(inst);
    }
    for (const bucketSet of this.buckets) {
      for (const bucket of bucketSet) this.uploadBucket(bucket);
    }
    this.impostors.upload(impostors);
    if (scope) this.impostors.setCamera(scope.camera);
  }

  debugSoldierAnim(index: number): { clip: string; phase: number; frame: number } | null {
    const inst = this.sourceInstances[index];
    if (!inst) return null;
    return { clip: inst.clip, phase: inst.phase, frame: inst.frame };
  }

  refreshCamera(camera: THREE.Camera): void {
    this.impostors.setCamera(camera);
  }

  private instanceIntersectsAnyFrustum(inst: CrowdInstance, frusta: THREE.Frustum[]): boolean {
    if (frusta.length === 0) return true;
    const height = inst.mounted ? 2.8 : 2.2;
    this.cullCenter.set(inst.x, inst.y, (inst.elevation ?? 0) + height * 0.5);
    this.cullSphere.set(this.cullCenter, inst.mounted ? 1.7 : 1.25);
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
      bucket.geometry.setAttribute('inst0', new THREE.InstancedBufferAttribute(bucket.inst0, 4));
      bucket.geometry.setAttribute('inst1', new THREE.InstancedBufferAttribute(bucket.inst1, 4));
      bucket.geometry.setAttribute('inst2', new THREE.InstancedBufferAttribute(bucket.inst2, 4));
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
      bucket.inst1[o + 3] = ((inst.phase % 1) + 1) % 1;
      bucket.inst2[o] = inst.elevation ?? 0;
      bucket.inst2[o + 1] = inst.deathVariant ?? 0;
      bucket.inst2[o + 2] = inst.alive ? 0 : 1;
      bucket.inst2[o + 3] = (inst.seed % 104729) / 104729;
    }
    for (const name of ['inst0', 'inst1', 'inst2'] as const) {
      const attr = bucket.geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
      attr.needsUpdate = true;
    }
    bucket.geometry.instanceCount = list.length;
  }

  stats() {
    const meshDrawCalls = this.buckets.flat().filter((bucket) => bucket.count > 0).length;
    const impostors = this.impostors.stats();
    return {
      instances: this.instanceCount,
      visible: this.culling.visible,
      culled: this.culling.culled,
      drawCalls: meshDrawCalls + impostors.impostorDrawCalls,
      meshDrawCalls,
      impostorDrawCalls: impostors.impostorDrawCalls,
      meshVariants: this.buckets.reduce((sum, bucketSet) => sum + bucketSet.length, 0),
      tierHistogram: { ...this.assignedCounts },
      visibleTierHistogram: { ...this.visibleCounts },
      culling: { ...this.culling },
      impostors,
      material: this.materialIdentity,
    };
  }

  dispose(): void {
    for (const bucket of this.buckets.flat()) {
      bucket.mesh.removeFromParent();
      bucket.geometry.dispose();
      (bucket.mesh.material as THREE.Material).dispose();
    }
    this.impostors.dispose();
    for (const texture of this.textures) texture.dispose();
  }
}

function crowdGeometry(mesh: SoldierMeshData): THREE.InstancedBufferGeometry {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geo.setAttribute('cNormal', new THREE.BufferAttribute(mesh.normals, 3));
  // Alias the same buffer as the standard 'normal' attribute: three's shadow
  // receiver offset (shadow.normalBias → normalWorld) reads it by name — with
  // only the custom attribute present the offset is silently zero.
  geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geo.setAttribute('cColor', new THREE.BufferAttribute(mesh.colors, 4));
  geo.setAttribute('bone', new THREE.BufferAttribute(mesh.bones, 1));
  geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geo.instanceCount = 0;
  return geo;
}

// SkinnedCrowdPipeline SKINNED_WGSL's VAT skinning + material-channel contract
// on MeshStandardNodeMaterial: albedo = cColor,
// normal = skinned cNormal, ORM = occlusion/roughness/metalness in the canonical
// order, factionMask = high-blue armband locator. The environment lights the
// skinned, yaw/roll-rotated normal.
function crowdMaterial(vatTex: THREE.DataTexture): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: SOLDIER_PBR_VALUES.roughness.default, metalness: 0 });
  // fog stays ON: the shared aerial-perspective hook (scene.fogNode, 10b)
  // hazes the crowd like every other world surface.
  const position = attribute<'vec3'>('position', 'vec3');
  const normal = attribute<'vec3'>('cNormal', 'vec3');
  const color = attribute<'vec4'>('cColor', 'vec4');
  const bone = attribute<'float'>('bone', 'float');
  const inst0 = attribute<'vec4'>('inst0', 'vec4');
  const inst1 = attribute<'vec4'>('inst1', 'vec4');
  const inst2 = attribute<'vec4'>('inst2', 'vec4');

  const clipStart = inst1.y;
  const clipFrames = max(inst1.z, 1.0);
  const phase = clamp(inst1.w, 0.0, 0.9999);
  const frame = clipStart.add(floor(phase.mul(max(clipFrames.sub(1.0), 1.0)))).toVar();
  const col = int(frame);
  const row0 = int(bone.round()).mul(4);
  // 4 consecutive texel rows = the 4 columns of the bone's mat4 at this frame.
  const c0 = textureLoad(vatTex, ivec2(col, row0)).toVar();
  const c1 = textureLoad(vatTex, ivec2(col, row0.add(1))).toVar();
  const c2 = textureLoad(vatTex, ivec2(col, row0.add(2))).toVar();
  const c3 = textureLoad(vatTex, ivec2(col, row0.add(3))).toVar();
  const local = c0.mul(position.x).add(c1.mul(position.y)).add(c2.mul(position.z)).add(c3).toVar();
  const n = normalize(c0.mul(normal.x).add(c1.mul(normal.y)).add(c2.mul(normal.z)).xyz).toVar();

  // Corpses roll by a per-variant angle so the fallen field reads as varied.
  const corpse = inst2.z.toVar();
  const variant = inst2.y;
  const roll = corpse.mul(variant.sub(1.0).mul(0.42).add(sin(variant.mul(2.3)).mul(0.18))).toVar();
  const rc = roll.cos().toVar();
  const rs = roll.sin().toVar();
  const rolled = vec3(local.x, local.y.mul(rc).sub(local.z.mul(rs)), local.y.mul(rs).add(local.z.mul(rc)));
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
  material.receivedShadowPositionNode = varying(worldPosition);

  // The environment lights the FULLY posed normal: skinned, corpse-rolled,
  // then yaw-rotated into world space.
  const rolledN = vec3(n.x, n.y.mul(rc).sub(n.z.mul(rs)), n.y.mul(rs).add(n.z.mul(rc)));
  const worldN = vec3(
    rolledN.x.mul(c).sub(rolledN.y.mul(s)),
    rolledN.x.mul(s).add(rolledN.y.mul(c)),
    rolledN.z,
  );
  material.normalNode = viewNormalNode(worldN);

  const faction = varying(inst0.w).toVar();
  const vCorpse = varying(corpse).toVar();
  const vColor = varying(color).toVar();

  // Material-led albedo composition: class-authored linen/leather/bronze/iron
  // vertex colors plus per-soldier seed variation make the body. Faction color
  // is a tiny authored upper sword-arm band only; shields, crests, tunics, and
  // armor remain real materials.
  const blue = vec3(...factionForTeam(0).primary);
  const red = vec3(...factionForTeam(1).primary);
  const neutral = vec3(...factionForTeam(2).primary);
  let accent = mix(blue, red, step(0.5, faction)).toVar();
  accent = mix(accent, neutral, step(1.5, faction)).toVar();
  const masks = SOLDIER_MATERIAL_MASKS;
  const teamMask = smoothstep(
    masks.factionMask.blueDelta[0],
    masks.factionMask.blueDelta[1],
    max(vColor.b.sub(max(vColor.r, vColor.g)), 0.0),
  ).toVar();
  const bronzeMask = smoothstep(masks.bronze.r[0], masks.bronze.r[1], vColor.r)
    .mul(smoothstep(masks.bronze.g[0], masks.bronze.g[1], vColor.g))
    .mul(float(1.0).sub(smoothstep(masks.bronze.maxB[0], masks.bronze.maxB[1], vColor.b)));
  const greySpread = max(max(abs(vColor.r.sub(vColor.g)), abs(vColor.g.sub(vColor.b))), abs(vColor.r.sub(vColor.b))).toVar();
  const ironMask = clamp(float(1.0).sub(greySpread.mul(masks.iron.greySpreadScale)), 0.0, 1.0)
    .mul(smoothstep(masks.iron.brightness[0], masks.iron.brightness[1], vColor.r.add(vColor.g).add(vColor.b).div(3.0)));
  const linenMask = smoothstep(masks.linen.r[0], masks.linen.r[1], vColor.r)
    .mul(smoothstep(masks.linen.g[0], masks.linen.g[1], vColor.g))
    .mul(smoothstep(masks.linen.b[0], masks.linen.b[1], vColor.b))
    .mul(float(1.0).sub(bronzeMask));
  const leatherMask = smoothstep(masks.leather.r[0], masks.leather.r[1], vColor.r)
    .mul(smoothstep(masks.leather.g[0], masks.leather.g[1], vColor.g))
    .mul(float(1.0).sub(smoothstep(masks.leather.maxB[0], masks.leather.maxB[1], vColor.b)));
  const skinMask = smoothstep(masks.skin.r[0], masks.skin.r[1], vColor.r)
    .mul(smoothstep(masks.skin.g[0], masks.skin.g[1], vColor.g))
    .mul(smoothstep(masks.skin.b[0], masks.skin.b[1], vColor.b))
    .mul(float(1.0).sub(bronzeMask));
  const seed = varying(inst2.w).toVar();
  const seedA = fract(seed.mul(7.13)).toVar();
  const seedB = fract(seed.mul(11.71).add(0.23)).toVar();
  const seedC = fract(seed.mul(17.19).add(0.41)).toVar();
  const value = float(0.86).add(seedA.mul(0.14));
  const warmth = seedB.sub(0.5);
  const armBand = mix(accent, vec3(0.42, 0.34, 0.26), 0.35);
  let albedo = vColor.rgb.toVar();
  albedo = albedo.mul(value).add(vec3(warmth.mul(0.035), warmth.mul(0.018), warmth.mul(-0.025))).toVar();
  albedo = mix(albedo, vec3(0.64, 0.43, 0.18), bronzeMask.mul(0.35)).toVar();
  albedo = mix(albedo, vec3(0.47, 0.47, 0.44), ironMask.mul(0.28)).toVar();
  albedo = mix(albedo, vec3(0.66, 0.60, 0.48), linenMask.mul(seedC.mul(0.20))).toVar();
  albedo = mix(albedo, armBand, teamMask).toVar();
  albedo = albedo.add(vec3(0.05, 0.028, 0.006).mul(bronzeMask)).toVar();
  albedo = albedo.add(vec3(0.035, 0.030, 0.014).mul(linenMask).mul(0.55)).toVar();
  albedo = albedo.add(vec3(0.025, 0.026, 0.024).mul(ironMask).mul(0.45)).toVar();
  const roughness = mix(
    mix(
      mix(
        mix(
          float(SOLDIER_PBR_VALUES.roughness.default),
          float(SOLDIER_PBR_VALUES.roughness.linen),
          linenMask,
        ),
        float(SOLDIER_PBR_VALUES.roughness.leather),
        leatherMask,
      ),
      float(SOLDIER_PBR_VALUES.roughness.skin),
      skinMask,
    ),
    float(SOLDIER_PBR_VALUES.roughness.bronze),
    bronzeMask,
  );
  material.roughnessNode = clamp(mix(roughness, float(SOLDIER_PBR_VALUES.roughness.iron), ironMask), 0.32, 0.94);
  material.metalnessNode = clamp(
    bronzeMask.mul(SOLDIER_PBR_VALUES.metalness.bronze)
      .add(ironMask.mul(SOLDIER_PBR_VALUES.metalness.iron)),
    0.0,
    0.95,
  );
  // Grounding/contact AO darkens the ambient light
  // over the bottom `band` world units of the LOCAL (pre-scale) mesh height, so
  // feet/ankles read as sitting in ground-occluded skylight rather than pasted
  // onto the terrain. It rides aoNode (indirect/IBL only) — the sun's direct
  // cast shadow is a separate owner. Living soldiers only: a prone
  // corpse's whole body is low, so gating by corpse keeps the fallen from
  // blackening wholesale.
  const contactRise = smoothstep(float(0.0), float(SOLDIER_PBR_VALUES.contactAo.band), rolled.z);
  const contactAo = mix(float(1.0 - SOLDIER_PBR_VALUES.contactAo.strength), float(1.0), contactRise);
  material.aoNode = varying(mix(float(1.0), contactAo, float(1.0).sub(corpse)));

  // Corpses desaturate and darken so the fallen read as dead, not living.
  const lum = dot(albedo, vec3(0.30, 0.59, 0.11));
  albedo = mix(albedo, vec3(lum).mul(0.62).add(vec3(0.06, 0.04, 0.03)), vCorpse.mul(0.7)).toVar();
  material.colorNode = vec4(linearAlbedo(clamp(albedo, vec3(0.0), vec3(1.0))), vColor.a);
  return material;
}
