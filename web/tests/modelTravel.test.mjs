import assert from "node:assert/strict";
import test from "node:test";
import { travelInstances } from "../scenes/models/_travel-sample.mjs";
import { captureHeavyTravel } from "../scenes/models/_heavy-travel.mjs";
import { captureHeavyBackward } from "../scenes/models/_heavy-backward.mjs";
import { captureMediumMotion } from "../scenes/models/_medium-motion.mjs";

test("absolute-time travel continues across clip wrap and survives out-of-order seeking", () => {
  const source = [{ x: 2, y: -1, facing: Math.PI / 2, clip: "walk", phase: 0 }];
  const sample = (seconds) => travelInstances(source, seconds, 2, 0.8);
  const before = sample(0.7)[0],
    after = sample(0.9)[0];
  assert.ok(after.phase < before.phase);
  assert.ok(Math.abs(after.y - before.y - 0.4) < 1e-12);
  const first = sample(0.7);
  sample(4);
  assert.deepEqual(sample(0.7), first);
  assert.deepEqual(source, [{ x: 2, y: -1, facing: Math.PI / 2, clip: "walk", phase: 0 }]);
  assert.ok(Math.abs(sample(2)[0].y - sample(0)[0].y - 4) < 1e-12);
});

test("selecting an existing static sheet does not access the travel page", async () => {
  const previous = process.env.SNAP;
  process.env.SNAP = "garment-poses";
  try {
    await captureHeavyTravel({}, null);
    await captureHeavyBackward({}, null);
    await captureMediumMotion({}, null);
  } finally {
    if (previous === undefined) delete process.env.SNAP;
    else process.env.SNAP = previous;
  }
});

for (const [direction, offset, expectedRightward] of [
  ["left", Math.PI / 2, -1.4],
  ["right", -Math.PI / 2, 1.4],
])
  test(`${direction}ward travel preserves threat facing across wrap and out-of-order seeking`, () => {
    const clip = `guarded-${direction}-walk`;
    const source = [{ x: 2, y: -1, facing: 0.7, clip, phase: 0 }];
    const sample = (seconds) => travelInstances(source, seconds, 2, 0.6, offset)[0];
    const first = sample(0.7);
    const dx = first.x - source[0].x,
      dy = first.y - source[0].y;
    const rightward = dx * Math.sin(0.7) - dy * Math.cos(0.7);
    const forward = dx * Math.cos(0.7) + dy * Math.sin(0.7);
    assert.ok(Math.abs(rightward - expectedRightward) < 1e-12);
    assert.ok(Math.abs(forward) < 1e-12);
    assert.equal(first.facing, source[0].facing);
    assert.ok(first.phase < sample(0.5).phase);
    sample(4);
    assert.deepEqual(sample(0.7), first);
    assert.deepEqual(source, [{ x: 2, y: -1, facing: 0.7, clip, phase: 0 }]);
  });
