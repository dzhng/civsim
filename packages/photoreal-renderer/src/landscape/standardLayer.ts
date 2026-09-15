import {
  standardInstanceAppearance,
  type StandardInstance,
} from "../../../game-renderer/src/models/shared/standardInstance";
import * as THREE from "three/webgpu";
import { attribute, clamp, float, mix, normalize, sin, step, varying, vec3, vec4 } from "three/tsl";
import {
  buildStandardMesh,
  type StandardSizeTier,
  STANDARD_VERTEX_STRIDE_FLOATS,
  STANDARD_WAVE_BACK_LOBE,
  standardLiveryForFaction,
} from "../../../game-renderer/src/models/shared/standardAsset";
import { linearAlbedo, viewNormalNode, type FloatNode } from "../landscape/shaderNodes";
import { RENDER_ORDER } from "../renderOrder";

type StandardBucket = {
  mesh: THREE.Mesh;
  geometry: THREE.InstancedBufferGeometry;
  capacity: number;
};

export class PhotorealStandardLayer {
  private readonly buckets = new Map<StandardSizeTier, StandardBucket>();
  private readonly material: THREE.MeshStandardNodeMaterial;
  private count = 0;
  private selected = 0;

  constructor(
    private readonly scene: THREE.Scene,
    time: FloatNode,
  ) {
    this.material = standardMaterial(time);
  }

  upload(instances: readonly StandardInstance[]): void {
    this.count = instances.length;
    this.selected = instances.filter((instance) => instance.selected).length;
    const byTier = new Map<StandardSizeTier, StandardInstance[]>();
    for (const instance of instances) {
      const bucket = byTier.get(instance.tier) ?? [];
      bucket.push(instance);
      byTier.set(instance.tier, bucket);
    }
    for (const [tier, values] of byTier) {
      let bucket = this.buckets.get(tier);
      if (!bucket) {
        const geometry = standardGeometry(tier);
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.name = `${tier}-3d-standards`;
        mesh.frustumCulled = false;
        mesh.renderOrder = RENDER_ORDER.worldOpaque;
        // Standards use a screen legibility floor; exaggerated shadows expose it.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        this.scene.add(mesh);
        bucket = { mesh, geometry, capacity: 0 };
        this.buckets.set(tier, bucket);
      }
      if (values.length > bucket.capacity) {
        const previous = bucket.geometry;
        bucket.geometry = previous.clone();
        bucket.capacity = Math.max(values.length, bucket.capacity * 2, 32);
        for (const [name, size] of [
          ["standardPose", 4],
          ["standardMeta", 4],
          ["standardField", 3],
          ["standardTrim", 3],
          ["standardEmblem", 3],
        ] as const)
          bucket.geometry.setAttribute(
            name,
            new THREE.InstancedBufferAttribute(new Float32Array(bucket.capacity * size), size),
          );
        bucket.mesh.geometry = bucket.geometry;
        previous.dispose();
      }
      const geometry = bucket.geometry;
      const pose = geometry.getAttribute("standardPose") as THREE.InstancedBufferAttribute;
      const meta = geometry.getAttribute("standardMeta") as THREE.InstancedBufferAttribute;
      const field = geometry.getAttribute("standardField") as THREE.InstancedBufferAttribute;
      const trim = geometry.getAttribute("standardTrim") as THREE.InstancedBufferAttribute;
      const emblem = geometry.getAttribute("standardEmblem") as THREE.InstancedBufferAttribute;
      for (let i = 0; i < values.length; i++) {
        const instance = values[i],
          appearance = standardInstanceAppearance(instance);
        pose.setXYZW(i, instance.x, instance.y, instance.z ?? 0, instance.yaw ?? 0);
        meta.setXYZW(
          i,
          instance.scale ?? 1,
          appearance.windPhase,
          appearance.windStrength,
          instance.selected ? 1 : 0,
        );
        field.setXYZ(i, ...appearance.field);
        trim.setXYZ(i, ...appearance.trim);
        emblem.setXYZ(i, ...appearance.emblem);
      }
      for (const attribute of [pose, meta, field, trim, emblem]) attribute.needsUpdate = true;
      geometry.instanceCount = values.length;
    }
    for (const [tier, bucket] of this.buckets) {
      bucket.mesh.visible = byTier.has(tier);
      if (!bucket.mesh.visible) bucket.geometry.instanceCount = 0;
    }
  }

  stats() {
    const tiers = [...this.buckets.keys()];
    const tier = tiers.length === 1 ? tiers[0] : "mixed";
    return {
      standards: this.count,
      selected: this.selected,
      tier,
      layer:
        tier === "battle-unit"
          ? "photoreal-battle-3d-standards"
          : "photoreal-campaign-3d-standards",
      waveContract: "PhotorealWorld.uTime + deterministic per-unit phase + strength" as const,
      legibility:
        tier === "battle-unit"
          ? "measured cloth-width floor from battle scene standardScale"
          : "campaign tier dimensions and grounded per-object scale",
    };
  }

  dispose(): void {
    for (const bucket of this.buckets.values()) {
      bucket.mesh.removeFromParent();
      bucket.geometry.dispose();
    }
    this.buckets.clear();
    this.material.dispose();
  }
}

function standardGeometry(tier: StandardSizeTier): THREE.InstancedBufferGeometry {
  const mesh = buildStandardMesh(tier);
  const src = mesh.opaque.vertices;
  const count = src.length / STANDARD_VERTEX_STRIDE_FLOATS;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uvWeightMaterial = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const srcOffset = i * STANDARD_VERTEX_STRIDE_FLOATS;
    const dst3 = i * 3;
    const dst4 = i * 4;
    position[dst3] = src[srcOffset];
    position[dst3 + 1] = src[srcOffset + 1];
    position[dst3 + 2] = src[srcOffset + 2];
    normal[dst3] = src[srcOffset + 3];
    normal[dst3 + 1] = src[srcOffset + 4];
    normal[dst3 + 2] = src[srcOffset + 5];
    uvWeightMaterial[dst4] = src[srcOffset + 6];
    uvWeightMaterial[dst4 + 1] = src[srcOffset + 7];
    uvWeightMaterial[dst4 + 2] = src[srcOffset + 8];
    uvWeightMaterial[dst4 + 3] = src[srcOffset + 9];
  }

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("uvWeightMaterial", new THREE.BufferAttribute(uvWeightMaterial, 4));
  geometry.setIndex(new THREE.BufferAttribute(mesh.opaque.indices, 1));
  geometry.instanceCount = 0;
  return geometry;
}

function standardMaterial(time: FloatNode): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({
    side: THREE.DoubleSide,
    roughness: 0.74,
    metalness: 0.0,
  });
  const local0 = attribute<"vec3">("position", "vec3");
  const normal0 = attribute<"vec3">("normal", "vec3");
  const uvwm = attribute<"vec4">("uvWeightMaterial", "vec4");
  const pose = attribute<"vec4">("standardPose", "vec4");
  const meta = attribute<"vec4">("standardMeta", "vec4");

  const weight = uvwm.z;
  // meta = (scale, windPhase, windStrength, selected).
  const primary = sin(time.mul(2.15).add(meta.y).add(local0.x.mul(5.2)).add(local0.z.mul(1.25)));
  const secondary = sin(
    time.mul(3.1).add(meta.y.mul(0.71)).add(local0.x.mul(9.4)).sub(local0.z.mul(0.52)),
  );
  const wave = primary.mul(0.74).add(secondary.mul(0.26)).toVar();
  const shaped = mix(wave, wave.mul(STANDARD_WAVE_BACK_LOBE), step(0.0, wave));
  const local = vec3(local0.x, local0.y.add(weight.mul(meta.z).mul(shaped)), local0.z)
    .mul(meta.x)
    .toVar();
  const cy = pose.w.cos().toVar();
  const sy = pose.w.sin().toVar();
  material.positionNode = vec3(
    pose.x.add(local.x.mul(cy)).sub(local.y.mul(sy)),
    pose.y.add(local.x.mul(sy)).add(local.y.mul(cy)),
    pose.z.add(local.z),
  );

  const rnormal = normalize(
    vec3(
      normal0.x.mul(cy).sub(normal0.y.mul(sy)),
      normal0.x.mul(sy).add(normal0.y.mul(cy)),
      normal0.z,
    ),
  );
  material.normalNode = viewNormalNode(rnormal);

  const materialId = varying(uvwm.w);
  const selected = varying(meta.w);
  const field = varying(attribute<"vec3">("standardField", "vec3"));
  const trim = varying(attribute<"vec3">("standardTrim", "vec3")).setInterpolation("flat");
  const emblem = varying(attribute<"vec3">("standardEmblem", "vec3")).setInterpolation("flat");
  const goldRgb = standardLiveryForFaction("azure").trim;
  const gold = vec3(goldRgb[0], goldRgb[1], goldRgb[2]);
  const pole = vec3(0.34, 0.22, 0.12);

  const mPole = float(1.0).sub(step(0.5, materialId));
  const mGoldHardware = step(0.5, materialId).mul(float(1.0).sub(step(1.5, materialId)));
  const mCloth = step(1.5, materialId).mul(float(1.0).sub(step(2.5, materialId)));
  const mTrim = step(2.5, materialId).mul(float(1.0).sub(step(3.5, materialId)));
  const mEmblem = step(3.5, materialId).mul(float(1.0).sub(step(4.5, materialId)));
  const clothMask = clamp(mCloth.add(mTrim).add(mEmblem), 0.0, 1.0);
  const base = pole
    .mul(mPole)
    .add(trim.mul(mGoldHardware))
    .add(field.mul(mCloth))
    .add(trim.mul(mTrim))
    .add(emblem.mul(mEmblem))
    .toVar();
  const selectedLift = selected.mul(clothMask);
  const albedo = clamp(
    base.mul(float(1.0).add(selectedLift.mul(0.18))).add(gold.mul(selectedLift).mul(0.12)),
    vec3(0.0),
    vec3(1.0),
  );
  material.colorNode = vec4(linearAlbedo(albedo), 1.0);
  // A constant field-colored emissive floor keeps the cloth saturated against
  // distance haze — a hazed-out banner carries no faction identity, which is
  // the flag's whole job.
  material.emissiveNode = linearAlbedo(
    field.mul(clothMask).mul(0.12).add(gold.mul(selectedLift).mul(0.22)),
  );
  material.roughnessNode = mix(
    float(0.72),
    float(0.48),
    clamp(mGoldHardware.add(mTrim).add(mEmblem), 0.0, 1.0),
  );
  material.metalnessNode = clamp(mGoldHardware.add(mTrim).add(mEmblem).mul(0.32), 0.0, 0.42);
  return material;
}
