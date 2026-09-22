import { TREE_VARIANTS } from "../models/shared/sceneryPropModels";
import type { MeshData } from "../models/shared/meshBuilder";
import type { SceneryInstance } from "./scenery";
import { projectionDepth, type ProjectionFootprint } from "../../../renderer-core/src/camera3d";

/** Placement, not upload order, owns a tree's silhouette. */
export function sceneryVariant(inst: SceneryInstance): number {
  let h =
    Math.imul(Math.round(inst.x * 1000), 73856093) ^ Math.imul(Math.round(inst.y * 1000), 19349663);
  h ^= h >>> 16;
  return (h >>> 0) % TREE_VARIANTS;
}
export function sceneryPixels(
  inst: SceneryInstance,
  modelHeight: number,
  projection: ProjectionFootprint,
): number {
  const depth = projectionDepth(projection, inst.x, inst.y, inst.z ?? 0);
  return depth > 0
    ? ((inst.height ?? inst.size) * modelHeight * projection.pixelsPerViewUnit) /
        Math.max(0.01, depth)
    : 0;
}
export interface SceneryDetailProfile {
  enterPixels: number;
  leavePixels: number;
  fadeStartPixels: number;
  fadeSpanPixels: number;
}
export const CAMPAIGN_SCENERY_DETAIL: SceneryDetailProfile = {
  enterPixels: 70,
  leavePixels: 55,
  fadeStartPixels: 50,
  fadeSpanPixels: 70,
};
/** Battle silhouettes keep leaf edges at smaller projected sizes. */
export const BATTLE_SCENERY_DETAIL: SceneryDetailProfile = {
  enterPixels: 28,
  leavePixels: 22,
  fadeStartPixels: 20,
  fadeSpanPixels: 28,
};
export function sceneryDetailActive(
  pixels: number,
  active: boolean,
  profile: SceneryDetailProfile,
): boolean {
  return pixels > (active ? profile.leavePixels : profile.enterPixels);
}
export function sceneryLeafFade(pixels: number, profile: SceneryDetailProfile): number {
  return Math.min(1, Math.max(0, (pixels - profile.fadeStartPixels) / profile.fadeSpanPixels));
}
/** Same topology across variants; only positions and normals vary. */
export function sceneryShapes(models: MeshData["opaque"][]) {
  const count = models[0].vertices.length / 10;
  const stride = (TREE_VARIANTS - 1) * 6;
  const data = new Float32Array(count * stride);
  for (let variant = 1; variant < TREE_VARIANTS; variant++) {
    const model = models[variant] ?? models[0];
    for (let i = 0; i < count; i++)
      data.set(model.vertices.subarray(i * 10, i * 10 + 6), i * stride + (variant - 1) * 6);
  }
  return data;
}
export function sceneryLeafIndices(model: MeshData["opaque"]) {
  const indices: number[] = [];
  for (let i = 0; i < model.indices.length; i += 3)
    if ((model.uvs?.[model.indices[i] * 2] ?? -1) >= 0)
      indices.push(model.indices[i], model.indices[i + 1], model.indices[i + 2]);
  return new Uint16Array(indices);
}
