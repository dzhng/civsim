import type { BattleWorldIdentity } from "../identity";

/** The TypeGPU world uses camera3d for every pass. */
export const TYPEGPU_BATTLE_IDENTITY = {
  substrate: "typegpu",
  projection: "camera3d",
} as const satisfies BattleWorldIdentity;
