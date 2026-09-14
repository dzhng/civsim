import { PhotorealBattleWorld as ProductionWorld } from "../../../packages/photoreal-renderer/src/battle/battleWorld";
import { registerCaptureWorld } from "./captureWorldRegistry";
export * from "../../../packages/photoreal-renderer/src/battle/battleWorld";
export type PhotorealBattleWorld = ProductionWorld;

/** Transparent factory substitution at the lab build's renderer import only. */
export const PhotorealBattleWorld = {
  async create(...args: Parameters<typeof ProductionWorld.create>) {
    const world = await ProductionWorld.create(...args);
    registerCaptureWorld(args[0], world);
    return world;
  },
};
