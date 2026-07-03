import assert from "node:assert/strict";
import test from "node:test";
import { animationForFrame } from "../../packages/crowd-runtime/src/animationState.ts";

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
