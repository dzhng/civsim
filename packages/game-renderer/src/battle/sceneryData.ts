import { SCENERY_PROP_IDS, SCENERY_PROP_MODELS } from "../models/shared/sceneryPropRegistry";

/** Shared battle prop audience; rendering owns instance storage. */
export const BATTLE_SCENERY_KINDS = SCENERY_PROP_IDS.filter((id) => {
  const family = SCENERY_PROP_MODELS[id].family;
  return family === "tree" || family === "rock";
});
