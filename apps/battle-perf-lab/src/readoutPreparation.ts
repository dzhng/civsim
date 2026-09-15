import {
  layoutReadout,
  buildChipAtlas,
  packReadoutChips,
  type BattleReadoutInstance,
  type ChipInstance,
  type AtlasEntry,
} from "../../../packages/game-renderer/src/battle/readoutData";
/** CPU staging only: caller publishes resources after GPU admission succeeds. */
export function prepareReadouts(
  instances: readonly BattleReadoutInstance[],
  previous?: { key: string; canvas: HTMLCanvasElement; entries: Map<string, AtlasEntry> },
) {
  const chips: ChipInstance[] = [];
  for (const r of instances) layoutReadout(r, chips);
  const keys = [...new Set(chips.map((c) => c.key))].sort(),
    key = keys.join("|");
  const canvas = previous?.key === key ? previous.canvas : document.createElement("canvas");
  const entries = previous?.key === key ? previous.entries : buildChipAtlas(keys, canvas);
  return {
    key,
    canvas,
    entries,
    count: chips.length,
    readouts: instances.length,
    ...packReadoutChips(chips, entries),
  };
}
