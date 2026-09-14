// foliageLayer — battle scenery on the photoreal substrate. Production grass
// belongs to the blade-field layer. Scenery uses the CampaignSceneryPass pose
// over the shared prop meshes (SCENERY_PROP_MODELS).
import type { TreeDetail } from "../../../game-renderer/src/models/shared/sceneryPropModels";
import * as THREE from "three/webgpu";
import { attribute, clamp, float, mix, normalize, step, texture, varying, vec2, vec3, vec4 } from "three/tsl";
import type { CampaignSceneryInstance } from "../../../game-renderer/src/campaign/sceneryPass";
import {
  buildLeafAtlas,
  LEAF_ATLAS_RGB_GAIN,
} from "../../../game-renderer/src/models/shared/leafAtlas";
import {
  SCENERY_PROP_IDS,
  SCENERY_PROP_MODELS,
  type SceneryPropId,
} from "../../../game-renderer/src/models/shared/sceneryPropRegistry";
import { linearAlbedo, rotateYawN, viewNormalNode } from "./battleTsl";
import { RENDER_ORDER } from "./terrainLayer";

// Battle scenery is trees and rocks; mountains and carts stay campaign-only.
const SCENERY_KINDS: SceneryPropId[] = SCENERY_PROP_IDS.filter((id) => {
  const family = SCENERY_PROP_MODELS[id].family;
  return family === "tree" || family === "rock";
});

interface SceneryBucket {
  opaque: THREE.Mesh;
  count: number;
}

/** The battle scenery (trees/rocks from featuresToBattleScenery), instanced on
 *  the shared prop meshes with sceneryPass shading expressed in TSL. */
export class PhotorealScenery {
  private buckets = new Map<SceneryPropId, SceneryBucket>();
  private readonly leafMap: THREE.DataTexture;
  private total = 0;

  constructor(scene: THREE.Scene, detail: TreeDetail = "leaves") {
    this.leafMap = leafAtlasTexture();
    for (const kind of SCENERY_KINDS) {
      const model = SCENERY_PROP_MODELS[kind].build(detail);
      const opaque = new THREE.Mesh(
        sceneryGeometry(model.opaque.vertices, model.opaque.indices, model.opaque.uvs),
        sceneryMaterial(this.leafMap),
      );
      opaque.name = `battle-scenery-${kind}`;
      opaque.renderOrder = RENDER_ORDER.worldOpaque;
      // Props cast REAL sun shadows and receive them for canopy self-shading
      // and cliff shade.
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
      const list = instances.filter((inst) => inst.kind === kind);
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

  dispose(): void {
    for (const { opaque } of this.buckets.values()) {
      opaque.removeFromParent();
      opaque.geometry.dispose();
      (opaque.material as THREE.Material).dispose();
    }
    this.leafMap.dispose();
  }
}

function sceneryGeometry(
  vertices: Float32Array,
  indices: Uint16Array,
  uvs?: Float32Array,
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
  // 'normal' aliases the buffer for shadow.normalBias (see crowdLayer).
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("sColor", new THREE.BufferAttribute(colors, 4));
  // Leaf-atlas UVs; u=-1 marks untextured vertices (see meshBuilder contract).
  geo.setAttribute(
    "sUv",
    new THREE.BufferAttribute(uvs ?? new Float32Array(count * 2).fill(-1), 2),
  );
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.instanceCount = 0;
  return geo;
}

function leafAtlasTexture(): THREE.DataTexture {
  const atlas = buildLeafAtlas();
  const map = new THREE.DataTexture(atlas.rgba, atlas.width, atlas.height, THREE.RGBAFormat);
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.needsUpdate = true;
  return map;
}

// Opaque props use a standard-material response: the scene sun + IBL light the
// rotated normals, with no parallel lighting constants. Per-instance shade
// variation stays as albedo character, and props cast real sun shadows through
// this same positionNode.
function sceneryMaterial(leafMap: THREE.DataTexture): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
  });
  const local = attribute<"vec3">("position", "vec3");
  const normal = attribute<"vec3">("sNormal", "vec3");
  const colorAndAlpha = attribute<"vec4">("sColor", "vec4");
  const uv = attribute<"vec2">("sUv", "vec2");
  const instPose = attribute<"vec4">("instPose", "vec4");
  const instStyle = attribute<"vec4">("instStyle", "vec4");
  const scale = instPose.z;
  const baseZ = instPose.w;
  const heightScale = instStyle.y;
  const yaw = instStyle.z;
  const { rx, ry, cy, sy } = rotateYawN(local.x, local.y, yaw);
  const worldPosition = vec3(
    instPose.x.add(rx.mul(scale)),
    instPose.y.add(ry.mul(scale)),
    baseZ.add(local.z.mul(heightScale)),
  );
  material.positionNode = worldPosition;
  material.receivedShadowPositionNode = varying(worldPosition);
  const rnormal = vec3(
    normal.x.mul(cy).sub(normal.y.mul(sy)),
    normal.x.mul(sy).add(normal.y.mul(cy)),
    normal.z,
  );
  material.normalNode = viewNormalNode(normalize(rnormal));
  const vColor = varying(colorAndAlpha.rgb);
  const vAlpha = varying(colorAndAlpha.a);
  const shade = varying(clamp(instStyle.x, 0.0, 1.0));

  // Leaf quads alpha-cut through the leaf atlas (u=-1 sentinel = untextured):
  // one quad reads as a cluster of small leaves, matching the campaign pass.
  const vUv = varying(uv);
  const leafMask = step(0.0, vUv.x);
  const texel = texture(leafMap, clamp(vUv, vec2(0.0), vec2(1.0)));
  const detail = mix(vec3(1.0), texel.rgb.mul(LEAF_ATLAS_RGB_GAIN), leafMask);
  material.opacityNode = mix(float(1.0), texel.a, leafMask);
  material.alphaTest = 0.5;

  const variation = shade.mul(0.18).add(0.88);
  const albedo = clamp(vColor.mul(variation).mul(detail), vec3(0.0), vec3(1.0));
  material.colorNode = vec4(linearAlbedo(albedo), vAlpha);
  return material;
}
