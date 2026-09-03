// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  animationForFrame,
  animationForSoldierFrame,
  fightingFrameForTick,
  MARCH_CYCLES_PER_SECOND,
  marchingStateForSpeed,
  RUN_CYCLES_PER_SECOND,
} from "../../packages/crowd-runtime/src/animationState.ts";

function phaseAdvance(from: number, to: number): number {
  return (((to - from) % 1) + 1) % 1;
}

test("soldier gait animation phase advances at a readable cadence", () => {
  const march0 = animationForFrame(1, 0, 0);
  const marchQuarterSecond = animationForFrame(1, 7.5, 0);
  const marchHalfSecond = animationForFrame(1, 15, 0);
  const run0 = animationForFrame(8, 0, 0);
  const runQuarterSecond = animationForFrame(8, 7.5, 0);

  assert.equal(march0.clip, "march");
  assert.equal(run0.clip, "run");
  assert.equal(MARCH_CYCLES_PER_SECOND, 2.0);
  assert.equal(RUN_CYCLES_PER_SECOND, 2.6);
  assert.ok(
    Math.abs(phaseAdvance(march0.phase, marchQuarterSecond.phase) - 0.5) < 1e-6,
    `march phase advance after 250ms: ${phaseAdvance(march0.phase, marchQuarterSecond.phase)}`,
  );
  assert.ok(
    phaseAdvance(march0.phase, marchHalfSecond.phase) < 1e-6,
    `march phase advance after 500ms: ${phaseAdvance(march0.phase, marchHalfSecond.phase)}`,
  );
  assert.ok(
    Math.abs(phaseAdvance(run0.phase, runQuarterSecond.phase) - 0.65) < 1e-6,
    `run phase advance after 250ms: ${phaseAdvance(run0.phase, runQuarterSecond.phase)}`,
  );
});

test("marching speed state uses hysteresis instead of frame displacement flicker", () => {
  assert.equal(marchingStateForSpeed(0.39, false), false);
  assert.equal(marchingStateForSpeed(0.41, false), true);
  assert.equal(marchingStateForSpeed(0.16, true), true);
  assert.equal(marchingStateForSpeed(0.14, true), false);
});

test("soldiers in one gait pose keep a coherent readable phase", () => {
  const phases = Array.from(
    { length: 24 },
    (_, soldierIndex) =>
      animationForSoldierFrame(1, { soldierIndex, unitIndex: 0, simTick: 90 }).phase,
  );
  const anchor = phases[0];
  for (const phase of phases) {
    const distance = Math.abs(phase - anchor);
    assert.ok(Math.min(distance, 1 - distance) <= 0.05, `phase drift ${distance}`);
  }
});

test("fighting pose cadence is sim-tick owned", () => {
  const frame = fightingFrameForTick(42, 5);

  assert.equal(fightingFrameForTick(42, 5), frame);
  assert.equal(fightingFrameForTick(43, 5), frame);
  assert.notEqual(fightingFrameForTick(54, 5), frame);
});
