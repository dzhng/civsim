// crowdLayer — the VAT crowd on the photoreal substrate (born slice 08a as a
// literal port of the production SkinnedCrowdPipeline: per-class placeholder
// meshes, shared VAT bake, corpse roll/desaturation, faction accents). Since
// slice 09 soldiers are a standard-material response with a NEUTRAL albedo —
// the baked skinned-lighting grade (lambert/key-fill/exposure/rim) is
// extracted and the sun + IBL light the skinned normals. Fed by the SAME
// buildCrowdInstances output, plus the blob-shadow decal replica of
// SoldierShadowDecalPass. SCAFFOLD per the README ledger: blob shadows die at
// slice 11 (real CSM).
import * as THREE from 'three/webgpu';
import {
  attribute, clamp, dot, float, floor, int, ivec2, length, max, mix, normalize, sin, smoothstep, step, textureLoad, varying, vec3, vec4,
} from 'three/tsl';
import type { CrowdInstance } from '../../../crowd-runtime/src/instanceData';
import type { SoldierMeshData } from '../../../soldier-assets/src/soldierMesh';
import type { SoldierKitManifest, VatBake } from '../../../soldier-assets/src/schema';
import { createVatLayout, resolveVatClip, type VatLayout } from '../../../renderer-core/src/vatLayout';
import { linearAlbedo, viewNormalNode } from './battleTsl';
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

/** Per-class instanced VAT crowd at production parity. */
export class PhotorealCrowd {
  private buckets: ClassBucket[] = [];
  private instanceCount = 0;

  constructor(
    scene: THREE.Scene,
    meshes: SoldierMeshData[],
    vats: VatBake[],
    kit: SoldierKitManifest,
  ) {
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
      }
      return tex;
    };
    for (let classId = 0; classId < meshes.length; classId++) {
      const vat = vats[classId] ?? vats[vats.length - 1] ?? vats[0];
      const geometry = crowdGeometry(meshes[classId]);
      const mesh = new THREE.Mesh(geometry, crowdMaterial(textureFor(vat)));
      mesh.name = `battle-crowd-${classId}`;
      mesh.frustumCulled = false;
      mesh.renderOrder = RENDER_ORDER.worldOpaque;
      mesh.visible = false;
      scene.add(mesh);
      this.buckets.push({
        mesh,
        geometry,
        layout: createVatLayout(vat, kit),
        capacity: 0,
        inst0: new Float32Array(0),
        inst1: new Float32Array(0),
        inst2: new Float32Array(0),
        count: 0,
        pending: [],
      });
    }
  }

  upload(instances: CrowdInstance[]): void {
    this.instanceCount = instances.length;
    for (const bucket of this.buckets) bucket.pending.length = 0;
    for (const inst of instances) {
      const classId = Math.max(0, Math.min(this.buckets.length - 1, Math.floor(inst.classId || 0)));
      this.buckets[classId].pending.push(inst);
    }
    for (const bucket of this.buckets) this.uploadBucket(bucket);
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
    }
    for (const name of ['inst0', 'inst1', 'inst2'] as const) {
      const attr = bucket.geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
      attr.needsUpdate = true;
    }
    bucket.geometry.instanceCount = list.length;
  }

  stats() {
    return {
      instances: this.instanceCount,
      drawCalls: this.buckets.filter((bucket) => bucket.count > 0).length,
      meshVariants: this.buckets.length,
    };
  }
}

function crowdGeometry(mesh: SoldierMeshData): THREE.InstancedBufferGeometry {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geo.setAttribute('cNormal', new THREE.BufferAttribute(mesh.normals, 3));
  geo.setAttribute('cColor', new THREE.BufferAttribute(mesh.colors, 4));
  geo.setAttribute('bone', new THREE.BufferAttribute(mesh.bones, 1));
  geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geo.instanceCount = 0;
  return geo;
}

// SkinnedCrowdPipeline SKINNED_WGSL's VAT skinning + albedo composition,
// ported at factionMaskStrength = 0 (the production battle default; the
// ORM/normal texture terms it gates vanish and the neutral 1×1 placeholder
// textures reduce to identities). Slice 09: the skinned lighting grade is
// gone — the environment lights the skinned, yaw/roll-rotated normal.
function crowdMaterial(vatTex: THREE.DataTexture): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
  // fog stays ON: the scene THREE.Fog haze stand-in (dies at 10b) covers the
  // surfaces that carry no ported bespoke haze term (crowd + scenery).
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
  material.positionNode = vec3(
    inst0.x.add(p.x.mul(c)).sub(p.y.mul(s)),
    inst0.y.add(p.x.mul(s)).add(p.y.mul(c)),
    p.z.add(inst2.x),
  );

  // The environment lights the FULLY posed normal: skinned, corpse-rolled,
  // then yaw-rotated into world space (the parity port lit the raw skinned
  // normal — a bespoke quirk that dies with the baked grade).
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

  // NEUTRAL albedo composition: faction accents + bronze/linen material
  // character + corpse desaturation stay (they are what the soldier IS); the
  // baked lambert/key-fill/exposure/rim grade is gone.
  const blue = vec3(0.20, 0.42, 0.88);
  const red = vec3(0.84, 0.24, 0.20);
  const neutral = vec3(0.82, 0.70, 0.34);
  let accent = mix(blue, red, step(0.5, faction)).toVar();
  accent = mix(accent, neutral, step(1.5, faction)).toVar();
  const teamMask = smoothstep(0.18, 0.55, max(vColor.b.sub(max(vColor.r, vColor.g)), 0.0)).toVar();
  const teamMix = mix(float(0.44), float(0.90), teamMask);
  const bronzeMask = smoothstep(0.58, 0.78, vColor.r).mul(smoothstep(0.34, 0.52, vColor.g)).mul(float(1.0).sub(smoothstep(0.28, 0.46, vColor.b)));
  const linenMask = smoothstep(0.58, 0.76, vColor.r).mul(smoothstep(0.48, 0.66, vColor.g)).mul(smoothstep(0.32, 0.48, vColor.b));
  let albedo = mix(vColor.rgb, accent, teamMix).toVar();
  albedo = albedo.add(vec3(0.10, 0.055, 0.012).mul(bronzeMask).mul(0.6)).toVar();
  albedo = albedo.add(vec3(0.055, 0.045, 0.020).mul(linenMask).mul(0.4)).toVar();
  // Corpses desaturate and darken so the fallen read as dead, not living.
  const lum = dot(albedo, vec3(0.30, 0.59, 0.11));
  albedo = mix(albedo, vec3(lum).mul(0.62).add(vec3(0.06, 0.04, 0.03)), vCorpse.mul(0.7)).toVar();
  material.colorNode = vec4(linearAlbedo(clamp(albedo, vec3(0.0), vec3(1.0))), vColor.a);
  return material;
}

/** Blob-shadow decal replica of SoldierShadowDecalPass — a soft dark ellipse
 *  seated at each soldier's (x, y, elevation). Dies at slice 11 (CSM). */
export class PhotorealSoldierShadows {
  private mesh: THREE.Mesh;
  private geometry: THREE.InstancedBufferGeometry;
  private capacity = 0;
  private data = new Float32Array(0);
  private count = 0;

  constructor(scene: THREE.Scene) {
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0,
    ]), 3));
    this.geometry.setIndex([0, 1, 2, 2, 1, 3]);
    this.geometry.instanceCount = 0;

    const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true });
    material.depthWrite = false;
    material.fog = false;
    const quad = attribute<'vec3'>('position', 'vec3');
    const inst = attribute<'vec4'>('shadowInst', 'vec4'); // (x, y, radius, elevation)
    material.positionNode = vec3(inst.x.add(quad.x.mul(inst.z)), inst.y.add(quad.y.mul(inst.z)), inst.w.add(0.015));
    const local = varying(quad.xy).toVar();
    const d = length(local).toVar();
    // The WGSL discards d > 1; an alpha-zero fragment on a non-depth-writing
    // decal is the same pixel result.
    const inside = float(1.0).sub(step(1.0, d));
    const alpha = float(1.0).sub(d.mul(d)).mul(0.34).mul(inside);
    material.colorNode = vec4(vec3(0.06, 0.05, 0.04), alpha);

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = 'battle-soldier-shadows';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RENDER_ORDER.soldierShadows;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  upload(instances: CrowdInstance[], opts: { radius?: number } = {}): void {
    this.count = instances.length;
    this.mesh.visible = instances.length > 0;
    if (instances.length === 0) {
      this.geometry.instanceCount = 0;
      return;
    }
    if (instances.length > this.capacity) {
      this.capacity = Math.max(instances.length, this.capacity * 2, 256);
      this.data = new Float32Array(this.capacity * 4);
      this.geometry.setAttribute('shadowInst', new THREE.InstancedBufferAttribute(this.data, 4));
    }
    const radius = opts.radius ?? 0.62;
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const o = i * 4;
      this.data[o] = inst.x;
      this.data[o + 1] = inst.y;
      this.data[o + 2] = radius * (inst.mounted ? 1.5 : 1) * (inst.alive ? 1 : 1.25);
      this.data[o + 3] = inst.elevation ?? 0;
    }
    (this.geometry.getAttribute('shadowInst') as THREE.InstancedBufferAttribute).needsUpdate = true;
    this.geometry.instanceCount = instances.length;
  }

  stats() {
    return { shadows: this.count };
  }
}
