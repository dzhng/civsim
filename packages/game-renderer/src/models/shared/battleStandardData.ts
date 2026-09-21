import type { BattleFactionId } from "../../battle/factionColors";
import {
  standardLiveryForFaction,
  standardSeed,
  standardWindPhase,
  standardWindStrength,
} from "./standardAsset";
export interface BattleStandardInstance {
  unitId: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  factionId: BattleFactionId;
  selected: boolean;
}
export const BATTLE_STANDARD_TIER = "battle-unit";
export const STANDARD_SURFACE = {
  pole: [0.34, 0.22, 0.12] as const,
  gold: standardLiveryForFaction("azure").trim,
  selectedAlbedo: 0.18,
  selectedGold: 0.12,
  clothEmission: 0.12,
  selectedEmission: 0.22,
  roughness: 0.72,
  metalRoughness: 0.48,
  metalness: 0.32,
  maxMetalness: 0.42,
};
/** One exact CPU packing policy; destinations may be planar source attributes or interleaved native records. */
export function writeBattleStandard(
  instance: BattleStandardInstance,
  pose: Float32Array,
  po: number,
  meta: Float32Array,
  mo: number,
  field: Float32Array,
  fo: number,
) {
  const livery = standardLiveryForFaction(instance.factionId);
  const seed =
    standardSeed(BATTLE_STANDARD_TIER, instance.factionId) ^
    Math.imul(instance.unitId + 1, 0x9e3779b1);
  pose[po] = instance.x;
  pose[po + 1] = instance.y;
  pose[po + 2] = instance.z;
  pose[po + 3] = instance.yaw;
  meta[mo] = instance.scale;
  meta[mo + 1] = standardWindPhase(seed >>> 0);
  meta[mo + 2] = standardWindStrength(BATTLE_STANDARD_TIER);
  meta[mo + 3] = instance.selected ? 1 : 0;
  field.set(livery.field, fo);
}
export function battleStandardCapacity(count: number, capacity: number) {
  return count > capacity ? Math.max(count, capacity * 2, 32) : capacity;
}
export class BattleStandardRecords {
  capacity = 0;
  count = 0;
  selected = 0;
  data = new Float32Array();
  write(instances: readonly BattleStandardInstance[]) {
    this.count = instances.length;
    this.selected = 0;
    if (this.count > this.capacity) {
      this.capacity = battleStandardCapacity(this.count, this.capacity);
      this.data = new Float32Array(this.capacity * 11);
    }
    instances.forEach((instance, i) => {
      writeBattleStandard(
        instance,
        this.data,
        i * 11,
        this.data,
        i * 11 + 4,
        this.data,
        i * 11 + 8,
      );
      if (instance.selected) this.selected++;
    });
    return this.data.subarray(0, this.count * 11);
  }
}
