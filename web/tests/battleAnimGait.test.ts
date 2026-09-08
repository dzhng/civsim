// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
// @ts-expect-error Node scene scripts have no declaration module.
import { phaseCadence, clipStability } from "../scenes/battle/battle-anim-gait.mjs";

test("gait switches assign completed distance to the preceding unequal stride", () => {
  const gaits = [
    { clip: "loaded-step", strideMeters: 2 },
    { clip: "catch-up", strideMeters: 4 },
  ];
  // Each 0.2m interval finishes on the old gait, then changes destination.
  const samples = [
    { clip: "loaded-step", phase: 0.95, path: 100 },
    { clip: "catch-up", phase: 0.05, path: 100.2 },
    { clip: "loaded-step", phase: 0.1, path: 100.4 },
  ].map(({ clip, phase, path }, tick) => ({
    tick,
    soldiers: [
      {
        index: 3,
        motorPath: path,
        gaits,
        anim: { clip, phase, duration: 1, playback: { appearanceId: 0 } },
      },
    ],
  }));
  const metric = phaseCadence(samples, [3])[0];
  assert.ok(metric.maxCycleError < 1e-12);
  assert.ok(Math.abs(metric.actualCycles - 0.15) < 1e-12);
  assert.equal(metric.negativeSteps, 0);
  assert.equal(clipStability(samples, [3]).nonMarch, 0);
  assert.equal(clipStability(samples, [3]).transitions, 2);
  // Either wrong denominator misses a different boundary by 0.05 cycles.
  const walkOnly = structuredClone(samples);
  walkOnly.forEach((s) =>
    s.soldiers[0].gaits.forEach((g) => {
      g.strideMeters = 2;
    }),
  );
  assert.ok(phaseCadence(walkOnly, [3])[0].maxCycleError > 0.049);
  const currentInsteadOfPrior = structuredClone(samples);
  currentInsteadOfPrior[0].soldiers[0].gaits[0].strideMeters = 4;
  currentInsteadOfPrior[1].soldiers[0].gaits[1].strideMeters = 2;
  assert.ok(phaseCadence(currentInsteadOfPrior, [3])[0].maxCycleError > 0.049);
});

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
          gaits: [{ clip: "loaded-step", strideMeters: 2 }],
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
        gaits: [{ clip: "carried-pike" }],
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
