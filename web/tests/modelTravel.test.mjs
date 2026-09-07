import assert from "node:assert/strict";
import test from "node:test";
import { travelInstances } from "../scenes/models/_travel-sample.mjs";
import { captureHeavyTravel } from "../scenes/models/_heavy-travel.mjs";
import { captureHeavyBackward } from "../scenes/models/_heavy-backward.mjs";
import { captureMediumTravel } from "../scenes/models/_medium-travel.mjs";

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
    await captureMediumTravel({}, null);
  } finally {
    if (previous === undefined) delete process.env.SNAP;
    else process.env.SNAP = previous;
  }
});
