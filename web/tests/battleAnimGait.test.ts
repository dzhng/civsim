// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
// @ts-expect-error Node scene scripts have no declaration module.
import { phaseCadence, clipStability } from "../scenes/battle/battle-anim-gait.mjs";

test("gait cadence follows measured motor distance through variable speed and phase wrap", () => {
  let path = 100,
    phase = 0.9;
  const samples = [0, 0.2, 0, 0.4, 0.1, 0.7].map((distance, tick) => {
    path += distance;
    phase = (phase + distance / 2) % 1;
    return {
      tick,
      soldiers: [
        {
          index: 3,
          motorPath: path,
          walk: { clip: "loaded-step", strideMeters: 2 },
          anim: { clip: "loaded-step", phase, duration: 99 },
        },
      ],
    };
  });
  const [metric] = phaseCadence(samples, [3]);
  assert.ok(Math.abs(metric.expectedCycles - 0.7) < 1e-12);
  assert.ok(Math.abs(metric.actualCycles - 0.7) < 1e-12);
  assert.ok(metric.maxCycleError < 1e-12);
  samples[2].soldiers[0].anim.phase += 0.03;
  assert.ok(phaseCadence(samples, [3])[0].maxCycleError > 0.029);
});

test("gait stability accepts the manifest walk name and detects an appearance change", () => {
  const samples = [0, 1].map((tick) => ({
    tick,
    soldiers: [
      {
        index: 2,
        walk: { clip: "carried-pike" },
        anim: { clip: "carried-pike", playback: { appearanceId: 17 } },
      },
    ],
  }));
  assert.deepEqual(clipStability(samples, [2]), {
    transitions: 0,
    nonMarch: 0,
    appearanceChanges: 0,
    soldiers: 1,
    frames: 2,
  });
  samples[1].soldiers[0].anim.playback.appearanceId = 14;
  assert.equal(clipStability(samples, [2]).appearanceChanges, 1);
  samples[1].soldiers[0].anim.clip = "march";
  assert.equal(clipStability(samples, [2]).nonMarch, 1);
});
