// Army-wide readout for the bottom-left info card when nothing is selected — so
// the card is never empty (specs/done/hud-housings, slice 04). Pure over the same
// unit_info Float32Array the HUD already reads, via the shared UNIT_INFO field
// names. Men-weighted so a big battered unit counts more than a small fresh one —
// the doubling test: twice the men at the same morale must not change the average.
// No wasm/sim change; headless-testable (armySummary.test.mjs).

// The explicit .ts import keeps tests and production on the same source instead
// of maintaining a test-only JavaScript copy.
import { UNIT_INFO } from "../../../packages/game-renderer/src/battle/unitInfoLayout.ts";

export interface ArmySummary {
  unitsAlive: number;
  unitsTotal: number;
  /** Living men / total men across the player's army, 0..1. */
  strengthFrac: number;
  /** Men-weighted mean morale of the living, 0..1. */
  morale: number;
  /** Men-weighted mean cohesion of the living, 0..1. */
  cohesion: number;
  /** Living player soldiers (the men count in the HUD head). */
  aliveMen: number;
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
    if (info[o + UNIT_INFO.team] !== 0) continue; // player units only (team 0)
    unitsTotal++;
    const alive = info[o + UNIT_INFO.alive] || 0;
    totalMen += info[o + UNIT_INFO.total] || 0;
    if (alive > 0) {
      unitsAlive++;
      aliveMen += alive;
      moraleMen += (info[o + UNIT_INFO.morale] || 0) * alive;
      cohesionMen += (info[o + UNIT_INFO.cohesion] || 0) * alive;
      if (info[o + UNIT_INFO.routing] > 0.5) routing++;
    }
  }
  return {
    unitsAlive,
    unitsTotal,
    aliveMen,
    strengthFrac: totalMen > 0 ? aliveMen / totalMen : 0,
    morale: aliveMen > 0 ? moraleMen / aliveMen : 0,
    cohesion: aliveMen > 0 ? cohesionMen / aliveMen : 0,
    routing,
  };
}
