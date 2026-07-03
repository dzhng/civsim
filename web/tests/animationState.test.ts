import assert from "node:assert/strict";
import test from "node:test";
import {
  animationForFrame,
  animationForSoldierFrame,
  fightingFrameForTick,
} from "../../packages/crowd-runtime/src/animationState.ts";

test("soldier gait animation phase advances at a readable cadence", () => {
  const march0 = animationForFrame(1, 0, 0);
  const march1s = animationForFrame(1, 30, 0);
  const run0 = animationForFrame(8, 0, 0);
  const run1s = animationForFrame(8, 30, 0);

  assert.equal(march0.clip, "march");
  assert.equal(run0.clip, "run");
  assert.ok(march1s.phase - march0.phase < 0.35, `march phase in 1s: ${march1s.phase}`);
  assert.ok(run1s.phase - run0.phase < 0.5, `run phase in 1s: ${run1s.phase}`);
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
