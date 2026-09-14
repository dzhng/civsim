import type { MeshData } from "../../../game-renderer/src/models/shared/meshBuilder";
// foliageLayer — battle scenery on the photoreal substrate. Production grass
// belongs to the blade-field layer. Scenery uses the CampaignSceneryPass pose
// over the shared prop meshes (SCENERY_PROP_MODELS).
import {
  TREE_VARIANTS,
  type TreeDetail,
} from "../../../game-renderer/src/models/shared/sceneryPropModels";
import * as THREE from "three/webgpu";
import {
  attribute,
  clamp,
  float,
  mix,
  max,
  normalize,
  step,
  texture,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
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
import { linearAlbedo, rotateYawN, viewNormalNode } from "../landscape/shaderNodes";
import { RENDER_ORDER } from "./terrainLayer";

// Battle scenery is trees and rocks; mountains and carts stay campaign-only.
const SCENERY_KINDS: SceneryPropId[] = SCENERY_PROP_IDS.filter((id) => {
  const family = SCENERY_PROP_MODELS[id].family;
  return family === "tree" || family === "rock";
});

interface SceneryBucket {
  opaque: THREE.Mesh;
  count: number;
  kind: SceneryPropId;
  detail: TreeDetail;
  sourceIndices: number[];
}

/** The battle scenery (trees/rocks from featuresToBattleScenery), instanced on
 *  the shared prop meshes with sceneryPass shading expressed in TSL. */
export class PhotorealScenery {
  private buckets: SceneryBucket[] = [];
  private instances: readonly CampaignSceneryInstance[] = [];
  private detailActive: boolean[] = [];
  private leafFade: number[] = [];
  private readonly modelHeights = new Map<SceneryPropId, number>();
  private readonly center = new THREE.Vector3();
  private readonly leafMap: THREE.DataTexture;
  private readonly material: THREE.MeshStandardNodeMaterial;
  private total = 0;

  constructor(
    scene: THREE.Scene,
    private readonly detail?: TreeDetail,
  ) {
    this.leafMap = leafAtlasTexture();
    this.material = sceneryMaterial(this.leafMap);
    for (const kind of SCENERY_KINDS) {
      const tree = SCENERY_PROP_MODELS[kind].family === "tree";
      const levels: TreeDetail[] = tree ? (detail ? [detail] : ["canopy", "leaves"]) : ["canopy"];
      for (const level of levels) {
        const models = Array.from(
          { length: tree ? TREE_VARIANTS : 1 },
          (_, variant) => SCENERY_PROP_MODELS[kind].build(level, variant).opaque,
        );
        let modelHeight = 0;
        for (const model of models)
          for (let i = 2; i < model.vertices.length; i += 10)
            modelHeight = Math.max(modelHeight, model.vertices[i]);
        this.modelHeights.set(kind, Math.max(this.modelHeights.get(kind) ?? 0, modelHeight));
        const opaque = new THREE.Mesh(
          sceneryGeometry(models, level === "leaves" && !detail),
          this.material,
        );
        opaque.name = `battle-scenery-${kind}-${level}`;
        opaque.renderOrder = RENDER_ORDER.worldOpaque;
        opaque.castShadow = true;
        opaque.receiveShadow = true;
        opaque.frustumCulled = false;
        opaque.visible = false;
        scene.add(opaque);
        this.buckets.push({ opaque, count: 0, kind, detail: level, sourceIndices: [] });
      }
    }
  }

  upload(instances: readonly CampaignSceneryInstance[]): void {
    this.instances = instances;
    this.detailActive = instances.map(() => false);
    this.leafFade = instances.map(() => 0);
    this.refresh();
  }

  /** Project each tree independently; keep the crown under close leaf detail.
   * A return through the threshold band retains the same representation. */
  prepareRender(camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    if (this.detail) return;
    const pixelsPerUnit = viewportHeight * camera.projectionMatrix.elements[5] * 0.5;
    let changed = false;
    for (let i = 0; i < this.instances.length; i++) {
      const inst = this.instances[i];
      if (SCENERY_PROP_MODELS[inst.kind].family !== "tree") continue;
      this.center.set(inst.x, inst.y, inst.z ?? 0).applyMatrix4(camera.matrixWorldInverse);
      const pixels =
        this.center.z < 0
          ? ((inst.height ?? inst.size) * this.modelHeights.get(inst.kind)! * pixelsPerUnit) /
            Math.max(0.01, -this.center.z)
          : 0;
      const next = pixels > (this.detailActive[i] ? 55 : 70);
      this.leafFade[i] = Math.min(1, Math.max(0, (pixels - 50) / 70));
      if (next !== this.detailActive[i]) {
        this.detailActive[i] = next;
        changed = true;
      }
    }
    if (changed) this.refresh();
    for (const bucket of this.buckets) {
      if (bucket.detail !== "leaves") continue;
      const style = bucket.opaque.geometry.getAttribute(
        "instStyle",
      ) as THREE.InstancedBufferAttribute;
      let dirty = false;
      for (let i = 0; i < bucket.sourceIndices.length; i++) {
        const fade = this.leafFade[bucket.sourceIndices[i]];
        if (style.getW(i) !== Math.fround(fade)) {
          style.setW(i, fade);
          dirty = true;
        }
      }
      if (dirty) style.needsUpdate = true;
      bucket.opaque.visible = bucket.sourceIndices.some((i) => this.leafFade[i] > 0.5);
    }
  }

  private refresh(): void {
    this.total = this.instances.length;
    for (const bucket of this.buckets) {
      bucket.sourceIndices = [];
      const list = this.instances.filter((inst, i) => {
        if (inst.kind !== bucket.kind) return false;
        const included = !!(this.detail || bucket.detail === "canopy" || this.detailActive[i]);
        if (included) bucket.sourceIndices.push(i);
        return included;
      });
      bucket.count = list.length;
      const geo = bucket.opaque.geometry as THREE.InstancedBufferGeometry;
      const capacity = this.instances.filter((inst) => inst.kind === bucket.kind).length;
      let pose = geo.getAttribute("instPose") as THREE.InstancedBufferAttribute | undefined;
      let style = geo.getAttribute("instStyle") as THREE.InstancedBufferAttribute | undefined;
      let shape = geo.getAttribute("instShape") as THREE.InstancedBufferAttribute | undefined;
      if (!pose || !style || !shape || pose.count !== capacity) {
        // Geometry disposal releases retired attribute buffers before a new
        // source upload replaces them. Camera-only LOD reuses the allocation.
        if (pose) geo.dispose();
        pose = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
        style = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
        shape = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
        geo.setAttribute("instShape", shape);
        geo.setAttribute("instPose", pose);
        geo.setAttribute("instStyle", style);
      }
      for (let i = 0; i < list.length; i++) {
        const inst = list[i];
        shape.setX(i, sceneryVariant(inst));
        pose.setXYZW(i, inst.x, inst.y, inst.size, inst.z ?? 0);
        style.setXYZW(
          i,
          inst.shade ?? 0.5,
          inst.height ?? inst.size,
          inst.yaw ?? 0,
          this.detail ? 1 : (this.leafFade[bucket.sourceIndices[i]] ?? 0),
        );
      }
      shape.needsUpdate = true;
      pose.needsUpdate = true;
      style.needsUpdate = true;
      geo.instanceCount = list.length;
      bucket.opaque.visible = list.length > 0;
    }
  }

  stats() {
    return {
      scenery: this.total,
      sceneryDrawCalls: this.buckets.filter((b) => b.opaque.visible).length,
      scenerySubmitted: this.buckets.reduce((n, b) => n + (b.opaque.visible ? b.count : 0), 0),
      sceneryTriangles: this.buckets.reduce(
        (n, b) =>
          n + ((b.opaque.visible ? b.count : 0) * (b.opaque.geometry.index?.count ?? 0)) / 3,
        0,
      ),
      sceneryDetailed: this.detailActive.filter((active, i) => active && this.leafFade[i] > 0.5)
        .length,
    };
  }

  dispose(): void {
    for (const { opaque } of this.buckets) {
      opaque.removeFromParent();
      opaque.geometry.dispose();
    }
    this.material.dispose();
    this.leafMap.dispose();
  }
}

/** Identity comes from the placed tree, never its current tile-array index. */
function sceneryVariant(inst: CampaignSceneryInstance): number {
  let h =
    Math.imul(Math.round(inst.x * 1000), 73856093) ^ Math.imul(Math.round(inst.y * 1000), 19349663);
  h ^= h >>> 16;
  return (h >>> 0) % TREE_VARIANTS;
}

function sceneryGeometry(
  models: MeshData["opaque"][],
  leavesOnly = false,
): THREE.InstancedBufferGeometry {
  const { vertices, uvs } = models[0];
  let { indices } = models[0];
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
  const shapeStride = (TREE_VARIANTS - 1) * 6;
  const shapeData = new THREE.InterleavedBuffer(new Float32Array(count * shapeStride), shapeStride);
  for (let variant = 1; variant < TREE_VARIANTS; variant++) {
    const model = models[variant] ?? models[0];
    const offset = (variant - 1) * 6;
    for (let i = 0; i < count; i++)
      shapeData.array.set(model.vertices.subarray(i * 10, i * 10 + 6), i * shapeStride + offset);
    geo.setAttribute(
      `shapePosition${variant}`,
      new THREE.InterleavedBufferAttribute(shapeData, 3, offset),
    );
    geo.setAttribute(
      `shapeNormal${variant}`,
      new THREE.InterleavedBufferAttribute(shapeData, 3, offset + 3),
    );
  }
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const normalAttribute = new THREE.BufferAttribute(normals, 3);
  geo.setAttribute("sNormal", normalAttribute);
  // 'normal' aliases the buffer for shadow.normalBias (see crowdLayer).
  geo.setAttribute("normal", normalAttribute);
  geo.setAttribute("sColor", new THREE.BufferAttribute(colors, 4));
  // Leaf-atlas UVs; u=-1 marks untextured vertices (see meshBuilder contract).
  geo.setAttribute(
    "sUv",
    new THREE.BufferAttribute(uvs ?? new Float32Array(count * 2).fill(-1), 2),
  );
  if (leavesOnly) {
    const leafIndices: number[] = [];
    for (let i = 0; i < indices.length; i += 3)
      if ((uvs?.[indices[i] * 2] ?? -1) >= 0)
        leafIndices.push(indices[i], indices[i + 1], indices[i + 2]);
    indices = new Uint16Array(leafIndices);
  }
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
    side: THREE.FrontSide,
    shadowSide: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
  });
  const shape = attribute<"float">("instShape", "float");
  let local: THREE.Node<"vec3"> = attribute<"vec3">("position", "vec3");
  let normal: THREE.Node<"vec3"> = attribute<"vec3">("sNormal", "vec3");
  for (let variant = 1; variant < TREE_VARIANTS; variant++) {
    const select = step(variant - 0.5, shape);
    local = mix(local, attribute<"vec3">(`shapePosition${variant}`, "vec3"), select);
    normal = mix(normal, attribute<"vec3">(`shapeNormal${variant}`, "vec3"), select);
  }
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
  const detail = mix(
    vec3(1.0),
    texel.rgb.div(max(texel.a, 0.001)).mul(LEAF_ATLAS_RGB_GAIN),
    leafMask,
  );
  const leafPresence = varying(instStyle.w);
  // The WebGPU shadow override inherits maskNode, not opacityNode. One mask
  // keeps hidden leaf detail from casting an opaque card-shaped shadow.
  material.maskNode = mix(float(1.0), texel.a.mul(leafPresence), leafMask).greaterThan(0.5);

  const variation = shade.mul(0.18).add(0.88);
  const albedo = clamp(vColor.mul(variation).mul(detail), vec3(0.0), vec3(1.0));
  material.colorNode = vec4(linearAlbedo(albedo), vAlpha);
  return material;
}
