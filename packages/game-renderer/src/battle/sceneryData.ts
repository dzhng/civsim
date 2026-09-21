import {
  SCENERY_PROP_IDS,
  SCENERY_PROP_MODELS,
  type SceneryPropId,
} from "../models/shared/sceneryPropRegistry";
import type { SceneryInstance } from "../terrain/scenery";

/** Shared battle prop audience and exact placement packing; rendering owns buffers. */
export const BATTLE_SCENERY_KINDS = SCENERY_PROP_IDS.filter((id) => {
  const family = SCENERY_PROP_MODELS[id].family;
  return family === "tree" || family === "rock";
});
export function packBattleScenery(kind: SceneryPropId, instances: readonly SceneryInstance[]) {
  const list = instances.filter((instance) => instance.kind === kind);
  const pose = new Float32Array(list.length * 4),
    style = new Float32Array(list.length * 4);
  for (let i = 0; i < list.length; i++) {
    const instance = list[i];
    pose.set([instance.x, instance.y, instance.size, instance.z ?? 0], i * 4);
    style.set(
      [instance.shade ?? 0.5, instance.height ?? instance.size, instance.yaw ?? 0, 0],
      i * 4,
    );
  }
  return { pose, style, count: list.length };
}
