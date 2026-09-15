import type { BattleFactionId } from "../../battle/factionColors";
import {
  standardLiveryForFaction,
  standardSeed,
  standardWindPhase,
  standardWindStrength,
  type StandardSizeTier,
} from "./standardAsset";

/** Presentation data shared by campaign and battle standard renderers. */
export interface StandardInstance {
  x: number;
  y: number;
  z?: number;
  tier: StandardSizeTier;
  factionId: BattleFactionId;
  unitId?: number;
  selected?: boolean;
  livery?: {
    field: readonly [number, number, number];
    trim?: readonly [number, number, number];
    emblem?: readonly [number, number, number];
  };
  yaw?: number;
  scale?: number;
  windPhase?: number;
  windStrength?: number;
}

export function standardInstanceAppearance(instance: StandardInstance) {
  const fallback = standardLiveryForFaction(instance.factionId);
  let seed = standardSeed(instance.tier, instance.factionId);
  if (instance.unitId !== undefined) seed ^= Math.imul(instance.unitId + 1, 0x9e3779b1);
  return {
    field: instance.livery?.field ?? fallback.field,
    trim: instance.livery?.trim ?? fallback.trim,
    emblem: instance.livery?.emblem ?? fallback.emblem,
    windPhase: instance.windPhase ?? standardWindPhase(seed >>> 0),
    windStrength: instance.windStrength ?? standardWindStrength(instance.tier),
  };
}
