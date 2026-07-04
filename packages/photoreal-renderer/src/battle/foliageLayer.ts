// foliageLayer — battle scenery on the photoreal substrate. The old
// render-side tuft grass path died in BMS11-SLICE-E9C4; production grass is
// the blade-field layer. Scenery remains the TSL port of CampaignSceneryPass
// over the shared prop meshes (SCENERY_PROP_MODELS).
import * as THREE from "three/webgpu";
import { attribute, clamp, normalize, varying, vec3, vec4 } from "three/tsl";
import type { CampaignSceneryInstance } from "../../../game-renderer/src/campaign/sceneryPass";
import { SCENERY_PROP_MODELS } from "../../../game-renderer/src/models/shared/sceneryPropRegistry";
import { linearAlbedo, rotateYawN, viewNormalNode } from "./battleTsl";
import { RENDER_ORDER } from "./terrainLayer";

type SceneryKind = "conifer" | "broadleaf" | "rock";
const SCENERY_KINDS: SceneryKind[] = ["conifer", "broadleaf", "rock"];

interface SceneryBucket {
  opaque: THREE.Mesh;
  count: number;
}

/** The battle scenery (trees/rocks from featuresToBattleScenery), instanced on
 *  the shared prop meshes with the sceneryPass shading ported to TSL. */
export class PhotorealScenery {
  private buckets = new Map<SceneryKind, SceneryBucket>();
  private total = 0;

  constructor(scene: THREE.Scene) {
    for (const kind of SCENERY_KINDS) {
      const model = SCENERY_PROP_MODELS[kind].build();
      const opaque = new THREE.Mesh(
        sceneryGeometry(model.opaque.vertices, model.opaque.indices),
        sceneryMaterial(),
      );
      opaque.name = `battle-scenery-${kind}`;
      opaque.renderOrder = RENDER_ORDER.worldOpaque;
      // Slice 11: props cast REAL sun shadows and receive them (canopy
      // self-shading, cliff shade) — the baked shadow-decal mesh is deleted.
      opaque.castShadow = true;
      opaque.receiveShadow = true;
      opaque.frustumCulled = false;
      opaque.visible = false;
      scene.add(opaque);
      this.buckets.set(kind, { opaque, count: 0 });
    }
  }

  upload(instances: CampaignSceneryInstance[]): void {
    this.total = 0;
    for (const kind of SCENERY_KINDS) {
      const list = instances.filter(
        (inst) => (inst.kind === "tree" ? "conifer" : inst.kind) === kind,
      );
      const bucket = this.buckets.get(kind)!;
      bucket.count = list.length;
      this.total += list.length;
      const pose = new Float32Array(list.length * 4);
      const style = new Float32Array(list.length * 4);
      for (let i = 0; i < list.length; i++) {
        const inst = list[i];
        pose[i * 4] = inst.x;
        pose[i * 4 + 1] = inst.y;
        pose[i * 4 + 2] = inst.size;
        pose[i * 4 + 3] = inst.z ?? 0;
        style[i * 4] = inst.shade ?? 0.5;
        style[i * 4 + 1] = inst.height ?? inst.size;
        style[i * 4 + 2] = inst.yaw ?? 0;
      }
      const geo = bucket.opaque.geometry as THREE.InstancedBufferGeometry;
      geo.setAttribute("instPose", new THREE.InstancedBufferAttribute(pose, 4));
      geo.setAttribute("instStyle", new THREE.InstancedBufferAttribute(style, 4));
      geo.instanceCount = list.length;
      bucket.opaque.visible = list.length > 0;
    }
  }

  stats() {
    return { scenery: this.total };
  }
}

function sceneryGeometry(
  vertices: Float32Array,
  indices: Uint16Array,
): THREE.InstancedBufferGeometry {
  const geo = new THREE.InstancedBufferGeometry();
  const count = vertices.length / 10;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const o = i * 10;
    positions.set(vertices.subarray(o, o + 3), i * 3);
    normals.set(vertices.subarray(o + 3, o + 6), i * 3);
    colors.set(vertices.subarray(o + 6, o + 10), i * 4);
  }
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("sNormal", new THREE.BufferAttribute(normals, 3));
  // 'normal' alias for shadow.normalBias (see crowdLayer note, slice 11).
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("sColor", new THREE.BufferAttribute(colors, 4));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.instanceCount = 0;
  return geo;
}

// sceneryPass SCENERY_WGSL pose port; since slice 09 the opaque props are a
// standard-material response — the pass-private fixed sun and warm-key/
// cool-fill grade are DELETED (no parallel lighting constants), the scene sun
// + IBL light the rotated normals. Per-instance shade variation stays as
// albedo character. (The unlit shadow-decal variant died at 11 — props cast
// real sun shadows through this same positionNode now.)
function sceneryMaterial(): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
  });
  const local = attribute<"vec3">("position", "vec3");
  const normal = attribute<"vec3">("sNormal", "vec3");
  const colorAndAlpha = attribute<"vec4">("sColor", "vec4");
  const instPose = attribute<"vec4">("instPose", "vec4");
  const instStyle = attribute<"vec4">("instStyle", "vec4");
  const scale = instPose.z;
  const baseZ = instPose.w;
  const heightScale = instStyle.y;
  const yaw = instStyle.z;
  const { rx, ry, cy, sy } = rotateYawN(local.x, local.y, yaw);
  material.positionNode = vec3(
    instPose.x.add(rx.mul(scale)),
    instPose.y.add(ry.mul(scale)),
    baseZ.add(local.z.mul(heightScale)),
  );
  const rnormal = vec3(
    normal.x.mul(cy).sub(normal.y.mul(sy)),
    normal.x.mul(sy).add(normal.y.mul(cy)),
    normal.z,
  );
  material.normalNode = viewNormalNode(normalize(rnormal));
  const vColor = varying(colorAndAlpha.rgb);
  const vAlpha = varying(colorAndAlpha.a);
  const shade = varying(clamp(instStyle.x, 0.0, 1.0));

  const variation = shade.mul(0.18).add(0.88);
  const albedo = clamp(vColor.mul(variation), vec3(0.0), vec3(1.0));
  material.colorNode = vec4(linearAlbedo(albedo), vAlpha);
  return material;
}
