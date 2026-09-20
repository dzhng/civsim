import type { BattleWorldIdentity } from "../../../../packages/battle-renderer/src/identity";

/** This candidate's own name. It writes its camera through the SAME shared
 * `frameCamera` owner the raw world does, so it declares the same single
 * projector — under its own substrate, never borrowed from that world. */
export const TYPEGPU_BATTLE_IDENTITY = {
  substrate: "typegpu",
  projection: "camera3d",
} as const satisfies BattleWorldIdentity;
