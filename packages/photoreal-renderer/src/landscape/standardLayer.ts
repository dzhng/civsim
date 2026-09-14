import * as THREE from "three/webgpu";
import { attribute, clamp, float, mix, normalize, sin, step, varying, vec3, vec4 } from "three/tsl";
import {
  buildStandardMesh,
  type StandardSizeTier,
  STANDARD_VERTEX_STRIDE_FLOATS,
  STANDARD_WAVE_BACK_LOBE,
  standardLiveryForFaction,
  standardSeed,
  standardWindPhase,
  standardWindStrength,
} from "../../../game-renderer/src/models/shared/standardAsset";
import type { BattleFactionId } from "../../../game-renderer/src/battle/factionColors";
import { linearAlbedo, viewNormalNode, type FloatNode } from "../landscape/shaderNodes";
import { RENDER_ORDER } from "../battle/terrainLayer";

export interface StandardDrawInstance {
  unitId: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  factionId: BattleFactionId;
  selected: boolean;
}

export class PhotorealStandardLayer {
  private readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private capacity = 0;
  private pose = new Float32Array(0);
  private meta = new Float32Array(0);
  private field = new Float32Array(0);
  private count = 0;
  private selected = 0;

  constructor(
    scene: THREE.Scene,
    time: FloatNode,
    private readonly tier: StandardSizeTier = "battle-unit",
  ) {
    this.geometry = standardGeometry(tier);
    this.mesh = new THREE.Mesh(this.geometry, standardMaterial(time));
    this.mesh.name = `${tier}-3d-standards`;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RENDER_ORDER.worldOpaque;
    // No shadows: at far zoom the legibility floor scales the standard well
    // past body size, and a building-length flag shadow betrays the trick.
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  upload(instances: readonly StandardDrawInstance[]): void {
    this.count = instances.length;
    this.selected = 0;
    this.mesh.visible = instances.length > 0;
    if (instances.length === 0) {
      this.geometry.instanceCount = 0;
      return;
    }
    // Attribute budget: WebGPU caps a pipeline at 8 vertex buffers and every
    // attribute costs one — livery gold is a material uniform (constant
    // across factions) and selected/wind-strength share one meta slot.
    if (instances.length > this.capacity) {
      this.capacity = Math.max(instances.length, this.capacity * 2, 32);
      this.pose = new Float32Array(this.capacity * 4);
      this.meta = new Float32Array(this.capacity * 4);
      this.field = new Float32Array(this.capacity * 3);
      this.geometry.setAttribute("standardPose", new THREE.InstancedBufferAttribute(this.pose, 4));
      this.geometry.setAttribute("standardMeta", new THREE.InstancedBufferAttribute(this.meta, 4));
      this.geometry.setAttribute(
        "standardField",
        new THREE.InstancedBufferAttribute(this.field, 3),
      );
    }
    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];
      const livery = standardLiveryForFaction(instance.factionId);
      const seed =
        standardSeed(this.tier, instance.factionId) ^ Math.imul(instance.unitId + 1, 0x9e3779b1);
      const o4 = i * 4;
      const o3 = i * 3;
      this.pose[o4] = instance.x;
      this.pose[o4 + 1] = instance.y;
      this.pose[o4 + 2] = instance.z;
      this.pose[o4 + 3] = instance.yaw;
      this.meta[o4] = instance.scale;
      this.meta[o4 + 1] = standardWindPhase(seed >>> 0);
      this.meta[o4 + 2] = standardWindStrength(this.tier);
      this.meta[o4 + 3] = instance.selected ? 1 : 0;
      this.field.set(livery.field, o3);
      if (instance.selected) this.selected++;
    }
    for (const name of ["standardPose", "standardMeta", "standardField"] as const) {
      (this.geometry.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    this.geometry.instanceCount = instances.length;
  }

  stats() {
    return {
      standards: this.count,
      selected: this.selected,
      tier: this.tier,
      layer:
        this.tier === "battle-unit"
          ? "photoreal-battle-3d-standards"
          : "photoreal-campaign-3d-standards",
      waveContract: "PhotorealWorld.uTime + deterministic per-unit phase + strength" as const,
      legibility: this.tier === "battle-unit" ? "measured cloth-width floor from battle scene standardScale" : "campaign tier dimensions and grounded per-object scale",
    };
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
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
    .add(gold.mul(mGoldHardware))
    .add(field.mul(mCloth))
    .add(gold.mul(mTrim))
    .add(gold.mul(mEmblem))
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
