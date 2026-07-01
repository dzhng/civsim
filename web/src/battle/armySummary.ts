// Army-wide readout for the bottom-left info card when nothing is selected — so
// the card is never empty (specs/done/hud-housings, slice 04). Pure over the same
// unit_info Float32Array the HUD already reads, using the same raw field offsets
// as scene.ts (team +6, total +7, cohesion +4, alive +15, morale +20, routing
// +21). Men-weighted so a big battered unit counts more than a small fresh one —
// the doubling test: twice the men at the same morale must not change the average.
// No wasm/sim change; headless-testable (armySummary.test.mjs).

export interface ArmySummary {
  unitsAlive: number;
  unitsTotal: number;
  /** Living men / total men across the player's army, 0..1. */
  strengthFrac: number;
  /** Men-weighted mean morale of the living, 0..1. */
  morale: number;
  /** Men-weighted mean cohesion of the living, 0..1. */
  cohesion: number;
  /** Player units currently routing. */
  routing: number;
}

export function armySummary(info: Float32Array, count: number, stride: number): ArmySummary {
  let unitsAlive = 0;
  let unitsTotal = 0;
  let aliveMen = 0;
  let totalMen = 0;
  let moraleMen = 0;
  let cohesionMen = 0;
  let routing = 0;
  for (let u = 0; u < count; u++) {
    const o = u * stride;
    if (info[o + 6] !== 0) continue; // player units only (team 0)
    unitsTotal++;
    const alive = info[o + 15] || 0;
    totalMen += info[o + 7] || 0;
    if (alive > 0) {
      unitsAlive++;
      aliveMen += alive;
      moraleMen += (info[o + 20] || 0) * alive;
      cohesionMen += (info[o + 4] || 0) * alive;
      if (info[o + 21] > 0.5) routing++;
    }
  }
  return {
    unitsAlive,
    unitsTotal,
    strengthFrac: totalMen > 0 ? aliveMen / totalMen : 0,
    morale: aliveMen > 0 ? moraleMen / aliveMen : 0,
    cohesion: aliveMen > 0 ? cohesionMen / aliveMen : 0,
    routing,
  };
}
