// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  ActionTimeline,
  evaluatePlaybackPose,
  type ActionObservation,
} from "@packages/crowd-runtime/src/actionTimeline";
import type { ImportedRig } from "@packages/soldier-assets/src/rig";
import type { AppearancePresentation } from "@packages/soldier-assets/src/presentation";
import type { LocalAnimationClip } from "@packages/soldier-assets/src/localAnimation";
import {
  buildCrowdInstances,
  corpsePresentationStrength,
  generatedFormation,
} from "@packages/crowd-runtime/src/instanceData";

const actions: AppearancePresentation["actions"] = {
  ready: { clip: "rest", layer: "fullBody" },
  atEase: { clip: "rest", layer: "fullBody" },
  walk: { clip: "walk", layer: "fullBody" },
  run: { clip: "run", layer: "fullBody" },
  melee: { clip: "swing", layer: "fullBody" },
  release: null,
  hit: { clip: "recoil", layer: "fullBody" },
  death: { clip: "fall", layer: "fullBody" },
  pikeReady: null,
  guardedBackwardWalk: null,
  guardedLeftWalk: null,
  guardedRightWalk: null,
};
const clips: Pick<LocalAnimationClip, "name" | "duration" | "loop" | "strideMeters">[] = [
  ["rest", 4, true],
  ["walk", 2, true],
  ["run", 1, true],
  ["swing", 2, false],
  ["recoil", 0.5, false],
  ["fall", 1, false],
].map(([name, duration, loop]) => ({
  name: name as string,
  duration: duration as number,
  loop: loop as boolean,
  ...(["walk", "run"].includes(name as string) ? { strideMeters: 2 } : {}),
}));
const rig: ImportedRig = {
  bones: [
    {
      name: "spine",
      parent: -1,
      bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] },
      inverseBind: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
  ],
  clips: clips.map((clip, index) => ({
    name: clip.name,
    duration: clip.duration,
    loop: clip.loop,
    tracks: { 0: { T: { times: [0, clip.duration], values: [index, 0, 0, index + 1, 0, 0] } } },
  })),
};
const appearances = {
  0: {
    manifest: { presentation: { actions, riderUpperBodyJoints: null } },
    animation: { clips },
    rig,
  },
};
const soldier = (changes: Partial<ActionObservation> = {}): ActionObservation => ({
  appearanceId: 0,
  alive: true,
  health: 100,
  mountHealth: 0,
  speedMps: 0,
  forwardMps: changes.speedMps ?? 0,
  routing: false,
  incapacitated: false,
  guardedFacing: false,
  lateralMps: 0,
  atEase: false,
  pikeReady: false,
  fighting: false,
  releaseTtl: 0,
  releaseAgeSeconds: 0,
  ...changes,
});

const guardedActions = {
  guardedBackwardWalk: { clip: "backward", layer: "fullBody" as const },
  guardedLeftWalk: { clip: "left", layer: "fullBody" as const },
  guardedRightWalk: { clip: "right", layer: "fullBody" as const },
};
const guardedClips = ["backward", "left", "right"].map((name, i) => ({
  name,
  duration: 1,
  loop: true,
  strideMeters: i + 1,
}));
const guardedAppearance = {
  manifest: {
    presentation: { actions: { ...actions, ...guardedActions }, riderUpperBodyJoints: null },
  },
  animation: { clips: [...clips, ...guardedClips] },
  rig: {
    ...rig,
    clips: [
      ...rig.clips,
      ...guardedClips.map((clip, i) => ({
        ...clip,
        tracks: { 0: { T: { times: [0, 1], values: [10 + i, 0, 0, 11 + i, 0, 0] } } },
      })),
    ],
  },
};

test("completed gait uses observed interval distance at midpoint and exact hit boundary", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier({ speedMps: 1 })]);
  timeline.update(12, [soldier({ speedMps: 0.5, health: 90 })]);
  // 0.5 m/s for 0.2 s, divided by the authored 2 m stride.
  assert.equal(timeline.sample(6)[0].base.destination.phase, 0.05);
  assert.equal(evaluatePlaybackPose(appearances[0], timeline.sample(6)[0])[0], 1.05);
  // The hit begins from completed 0.2 m of travel, not the old 1 m/s prediction.
  assert.equal(evaluatePlaybackPose(appearances[0], timeline.sample(12)[0])[0], 1.1);
  assert.equal(timeline.sample(12)[0].base.destination.clip, "recoil");
  assert.deepEqual(timeline.sample(12, "before")[0].base.destination, { clip: "walk", phase: 0.1 });
  assert.deepEqual(
    evaluatePlaybackPose(appearances[0], timeline.sample(12, "before")[0]),
    evaluatePlaybackPose(appearances[0], timeline.sample(12, "after")[0]),
  );
  assert.throws(() => timeline.sample(6, "before"), /latest completed observation/);
  assert.throws(() => timeline.sample(13, "before"), /latest completed observation/);
});

test("completed idle entry blends from prior rest at inferred onset, not the observation endpoint", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier()]);
  timeline.update(6, [soldier({ speedMps: 1 })]);
  assert.equal(evaluatePlaybackPose(appearances[0], timeline.sample(0)[0])[0], 0);
  const middle = timeline.sample(2.25)[0];
  assert.equal(middle.base.destination.clip, "walk");
  assert.equal(middle.base.weight, 0.5);
  assert.equal(middle.base.destination.phase, 0.0375);
  assert.equal(evaluatePlaybackPose(appearances[0], middle)[0], 1.0375 / 2);
  assert.equal(timeline.sample()[0].base.destination.phase, 0.1);
  assert.equal(timeline.sample()[0].base.weight, 1);
});

test("completed disabled recovery holds prior gait and never catches up unassigned path", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier({ speedMps: 1 })]);
  timeline.update(6, [soldier({ speedMps: 1, incapacitated: true })]);
  assert.equal(timeline.sample(3)[0].base.destination.phase, 0.05);
  assert.equal(timeline.sample()[0].base.destination.phase, 0.1);
  timeline.update(12, [soldier({ speedMps: 1 })]);
  assert.equal(timeline.sample(9)[0].base.destination.phase, 0.1);
  assert.equal(timeline.sample()[0].base.destination.phase, 0.1);
  timeline.update(18, [soldier({ speedMps: 1 })]);
  assert.ok(Math.abs(timeline.sample()[0].base.destination.phase - 0.2) < 1e-12);
});

test("inferred entry holds its completed phase at a disabled endpoint and resumes without replay", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier()]);
  timeline.update(6, [soldier({ speedMps: 1, incapacitated: true })]);
  const held = { clip: "walk", phase: 0.1 };
  assert.deepEqual(timeline.sample(6, "before")[0].base.destination, held);
  assert.deepEqual(timeline.sample()[0].base.destination, held);
  assert.deepEqual(timeline.sample(6.75)[0].base.destination, held);
  timeline.update(12, [soldier({ speedMps: 1 })]);
  assert.deepEqual(timeline.sample()[0].base.destination, held);
  timeline.update(18, [soldier({ speedMps: 1 })]);
  assert.ok(Math.abs(timeline.sample()[0].base.destination.phase - 0.2) < 1e-12);
});

test("completed death history remains sampleable until its interval retires", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier()]);
  timeline.update(3, [soldier({ alive: false })]);
  const previous = timeline.sample(4);
  timeline.update(6, [soldier({ alive: false })]);
  assert.deepEqual(timeline.sample(4), previous);
  assert.ok(Math.abs(timeline.sample(4)[0].base.weight - 1 / 30 / 0.15) < 1e-12);
  assert.throws(() => timeline.sample(2), /before.*observation/);
});

test("retained clip sources and caller observations cannot mutate past eligibility or output", () => {
  const timeline = new ActionTimeline(appearances);
  const input = soldier({ incapacitated: true });
  timeline.update(0, [input]);
  const output = timeline.sample()[0];
  assert.equal(output.base.source.kind, "clip");
  if (output.base.source.kind !== "clip") throw new Error("expected clip source");
  output.base.source.sample.phase = 0.9;
  const reread = timeline.sample()[0].base.source;
  assert.equal(reread.kind === "clip" && reread.sample.phase, 0);
  input.incapacitated = false;
  input.speedMps = 1;
  timeline.update(6, [input]);
  assert.equal(timeline.sample(3)[0].base.destination.clip, "rest");
  assert.equal(timeline.sample()[0].base.destination.phase, 0);
});

test("completed entry respects disabled, combat, posture and appearance boundaries", () => {
  for (const left of [
    soldier({ incapacitated: true }),
    soldier({ fighting: true }),
    soldier({ alive: false }),
  ]) {
    const timeline = new ActionTimeline(appearances);
    timeline.update(0, [left]);
    const before = timeline.sample(3);
    timeline.update(6, [soldier({ speedMps: 1 })]);
    assert.deepEqual(timeline.sample(3), before);
  }
  for (const changed of [
    { atEase: true },
    { pikeReady: true },
    { guardedFacing: true },
    { routing: true },
    { appearanceId: 1 },
  ]) {
    const timeline = new ActionTimeline({ ...appearances, 1: appearances[0] });
    timeline.update(0, [soldier()]);
    timeline.update(6, [soldier({ speedMps: 1, ...changed })]);
    assert.equal(timeline.sample(3)[0].base.destination.clip, "rest");
    assert.equal(timeline.sample(3)[0].appearanceId, 0);
    assert.equal(timeline.sample()[0].base.destination.phase, 0);
    assert.equal(timeline.sample()[0].appearanceId, changed.appearanceId ?? 0);
  }
  const hit = new ActionTimeline(appearances);
  hit.update(0, [soldier()]);
  hit.update(3, [soldier({ health: 90 })]);
  const before = hit.sample(12);
  hit.update(30, [soldier({ health: 90, speedMps: 1 })]);
  assert.deepEqual(hit.sample(12), before);
  assert.deepEqual(hit.sample()[0].base.destination, { clip: "walk", phase: 0 });
  for (const layer of ["fullBody", "riderUpperBody"] as const) {
    const releaseAppearance = {
      ...appearances[0],
      manifest: {
        presentation: {
          actions: { ...actions, release: { clip: "swing", layer } },
          riderUpperBodyJoints: layer === "riderUpperBody" ? ["spine"] : null,
        },
      },
      animation: {
        clips: clips.map((clip) =>
          clip.name === "swing" ? { ...clip, markers: { release: 0.6 } } : clip,
        ),
      },
    };
    const released = new ActionTimeline({ 0: releaseAppearance });
    released.update(0, [soldier()]);
    released.update(3, [soldier({ releaseTtl: 0.75 })]);
    const beforeTravel = released.sample(6);
    released.update(30, [soldier({ speedMps: 1 })]);
    assert.deepEqual(released.sample(6), beforeTravel, `no inferred entry over ${layer} release`);
    assert.deepEqual(released.sample()[0].base.destination, { clip: "walk", phase: 0 });
  }
});

test("completed masked interruption freezes independently calibrated base and rider endpoint", () => {
  const mounted = {
    ...appearances[0],
    manifest: {
      presentation: {
        actions: { ...actions, melee: { clip: "swing", layer: "riderUpperBody" as const } },
        riderUpperBodyJoints: ["spine"],
      },
    },
    rig: {
      bones: [rig.bones[0], { ...rig.bones[0], name: "legs" }],
      clips: rig.clips.map((clip, index) => ({
        ...clip,
        tracks: {
          ...clip.tracks,
          1: {
            T: { times: [0, clip.duration], values: [index * 10, 0, 0, (index + 1) * 10, 0, 0] },
          },
        },
      })),
    },
  };
  const timeline = new ActionTimeline({ 0: mounted });
  timeline.update(0, [soldier({ speedMps: 1 })]);
  timeline.update(3, [soldier({ speedMps: 1, fighting: true })]);
  const retained = timeline.sample(4);
  const retainedBytes = JSON.stringify(retained);
  timeline.update(6, [soldier({ speedMps: 0.5, health: 90 })]);
  const phase = 0.1 / 2 + (0.5 * 0.1) / 2;
  const expected = evaluatePlaybackPose(mounted, {
    appearanceId: 0,
    base: {
      source: { kind: "clip", sample: { clip: "walk", phase } },
      destination: { clip: "walk", phase },
      weight: 1,
    },
    riderUpperBody: {
      source: { kind: "clip", sample: { clip: "walk", phase: 0.1 / 2 } },
      destination: { clip: "swing", phase: 0.1 / 2 },
      weight: 0.1 / 0.15,
    },
  });
  const actual = evaluatePlaybackPose(mounted, timeline.sample()[0]);
  assert.deepEqual(actual, expected);
  assert.equal(actual[10], 10.75, "unmasked legs include completed path, not old predicted speed");
  assert.equal(timeline.sample()[0].riderUpperBody, undefined);
  assert.equal(
    JSON.stringify(retained),
    retainedBytes,
    "retained output remains immutable across correction",
  );
});

test("completed lifecycle retains one interval through append and discards it on rewind or shrink", () => {
  const timeline = new ActionTimeline(appearances);
  const moving = soldier({ speedMps: 1 });
  timeline.update(0, [moving]);
  assert.throws(() => timeline.sample(0, "before"), /latest completed observation/);
  timeline.update(6, [moving]);
  const middle = timeline.sample(3)[0];
  timeline.update(6, [soldier({ speedMps: 20 }), soldier({ fighting: true })]);
  assert.deepEqual(timeline.sample(3)[0], middle);
  assert.equal(
    timeline.sample(3)[1].base.destination.phase,
    0,
    "append anchors at first known pose",
  );
  const past = timeline.sample(3);
  timeline.sample(7);
  assert.deepEqual(timeline.sample(3), past, "out-of-order sampling does not consume history");
  timeline.update(12, [moving, soldier({ fighting: true })]);
  assert.throws(() => timeline.sample(3), /before.*observation/);
  timeline.update(12, [moving]);
  assert.throws(() => timeline.sample(11), /before.*observation/);
  assert.equal(timeline.sample()[0].base.destination.phase, 0);
  timeline.update(2, [moving]);
  assert.throws(() => timeline.sample(1), /before.*observation/);
  assert.equal(timeline.sample()[0].base.destination.phase, 0);
  timeline.reset();
  assert.deepEqual(timeline.sample(), []);
  assert.equal(timeline.snapshotBytes, 0);
});

test("protected gait uses nearest cardinal with longitudinal ties and canonical eligibility", () => {
  for (const [forwardMps, lateralMps, expected] of [
    [-1, 0, "backward"],
    [0, -1, "left"],
    [0, 1, "right"],
    [-1, -1, "backward"],
    [-1, 1, "backward"],
    [1, -1, "walk"],
    [1, 1, "walk"],
    [1, -1.01, "left"],
    [-1, 1.01, "right"],
    [0, 0, "walk"],
  ] as const) {
    const timeline = new ActionTimeline({ 0: guardedAppearance });
    timeline.update(0, [soldier({ speedMps: 1, forwardMps, lateralMps, guardedFacing: true })]);
    assert.equal(timeline.sample()[0].base.destination.clip, expected);
    const pose = timeline.sample(10)[0];
    assert.equal(
      evaluatePlaybackPose(guardedAppearance, pose)[0],
      expected === "walk"
        ? 1 + pose.base.destination.phase
        : 10 +
            guardedClips.findIndex((clip) => clip.name === expected) +
            pose.base.destination.phase,
    );
  }
  for (const changes of [{ atEase: true }, { routing: true }, { guardedFacing: false }]) {
    const timeline = new ActionTimeline({ 0: guardedAppearance });
    timeline.update(0, [soldier({ speedMps: 1, forwardMps: -1, guardedFacing: true, ...changes })]);
    assert.equal(timeline.sample()[0].base.destination.clip, "walk");
  }
  const missing = new ActionTimeline(appearances);
  missing.update(0, [soldier({ speedMps: 1, forwardMps: -1, guardedFacing: true })]);
  assert.equal(missing.sample()[0].base.destination.clip, "walk");
});

test("direction changes transport normalized phase and disabled endpoints retain their compatible gait", () => {
  const timeline = new ActionTimeline({ 0: guardedAppearance, 1: guardedAppearance });
  const motion = soldier({ speedMps: 1, forwardMps: -1, guardedFacing: true });
  timeline.update(0, [motion]);
  timeline.update(15, [{ ...motion, forwardMps: 0, lateralMps: -1 }]);
  // The completed backward interval owns its 1 m stride; left owns future 2 m strides.
  assert.deepEqual(timeline.sample(7.5)[0].base.destination, { clip: "backward", phase: 0.25 });
  assert.deepEqual(timeline.sample()[0].base.destination, { clip: "left", phase: 0.5 });
  timeline.update(30, [{ ...motion, incapacitated: true }]);
  assert.deepEqual(timeline.sample(30.9)[0].base.destination, { clip: "left", phase: 0.75 });
  timeline.update(45, [{ ...motion, incapacitated: true }]);
  assert.deepEqual(timeline.sample(45.9)[0].base.destination, { clip: "left", phase: 0.75 });
  const paused = timeline.sample(45.9);
  timeline.update(45, [{ ...motion, speedMps: 20 }]);
  assert.deepEqual(timeline.sample(45.9), paused);
  timeline.update(60, [{ ...motion, forwardMps: 0, lateralMps: 1 }]);
  assert.deepEqual(timeline.sample()[0].base.destination, { clip: "right", phase: 0.75 });
  timeline.update(75, [{ ...motion, appearanceId: 1, incapacitated: true, atEase: true }]);
  assert.deepEqual(timeline.sample()[0].base.destination, { clip: "rest", phase: 0 });
  timeline.update(0, [motion]);
  assert.deepEqual(timeline.sample()[0].base.destination, { clip: "backward", phase: 0 });
  timeline.reset();
  timeline.update(30, [soldier({ incapacitated: true, atEase: true })]);
  assert.deepEqual(timeline.sample()[0].base.destination, { clip: "rest", phase: 0 });
});

test("protected direction changes and time-driven combat preserve exact interruption sources", () => {
  for (const change of [
    { forwardMps: 0, lateralMps: -1 },
    { health: 90 },
    { alive: false },
    { fighting: true },
  ]) {
    const timeline = new ActionTimeline({ 0: guardedAppearance });
    const motion = soldier({ speedMps: 1, forwardMps: -1, guardedFacing: true });
    timeline.update(0, [motion]);
    const completed = 10 + (0.5 * (10 / 30)) / 1;
    timeline.update(10, [{ ...motion, speedMps: 0.5, ...change }]);
    assert.equal(evaluatePlaybackPose(guardedAppearance, timeline.sample()[0])[0], completed);
    const clip =
      "health" in change
        ? "recoil"
        : "alive" in change
          ? "fall"
          : "fighting" in change
            ? "swing"
            : "left";
    assert.equal(timeline.sample()[0].base.destination.clip, clip);
    if (clip !== "left") {
      const duration = clips.find((c) => c.name === clip)!.duration;
      assert.ok(
        Math.abs(timeline.sample(13)[0].base.destination.phase - 3 / 30 / duration) < 1e-12,
      );
    }
  }
});

test("corpse presentation leaves live instances unchanged and keeps manual corpses terminal", () => {
  const [manual] = generatedFormation(1);
  assert.equal(corpsePresentationStrength(manual), 0);
  assert.equal(corpsePresentationStrength({ ...manual, alive: false }), 1);
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier()]);
  const playback = timeline.sample();
  const [live] = buildCrowdInstances({ positions: new Float32Array(2), playback }).instances;
  assert.equal(corpsePresentationStrength(live), 0);
});

test("corpse presentation follows submitted death blend independently of fall clip progress", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier({ speedMps: 1 })]);
  timeline.update(30, [soldier({ alive: false })]);
  for (const [tick, strength] of [
    [30, 0],
    [32.25, 0.5],
    [34.5, 1],
  ]) {
    const playback = timeline.sample(tick);
    const [dead] = buildCrowdInstances({
      positions: new Float32Array(2),
      alive: new Uint8Array([0]),
      playback,
    }).instances;
    assert.ok(Math.abs(corpsePresentationStrength(dead) - strength) < 1e-12);
    assert.ok(dead.phase < 0.2, "corpse effects settle before the one-second fall clip ends");
    assert.equal(corpsePresentationStrength({ ...dead, alive: true }), 0);
  }
});

test("corpse presentation is terminal for initially dead and reset histories", () => {
  const timeline = new ActionTimeline(appearances);
  const submittedStrength = (tick: number) => {
    timeline.update(tick, [soldier({ alive: false })]);
    const playback = timeline.sample();
    const [dead] = buildCrowdInstances({
      positions: new Float32Array(2),
      alive: new Uint8Array([0]),
      playback,
    }).instances;
    return corpsePresentationStrength(dead);
  };
  assert.equal(submittedStrength(0), 1);
  timeline.reset();
  timeline.update(0, [soldier()]);
  assert.equal(submittedStrength(30), 0);
  timeline.reset();
  assert.equal(submittedStrength(30), 1);
  // A rebuilt catalog/controller intentionally starts without prior visual history.
  const replacement = new ActionTimeline(appearances);
  replacement.update(30, [soldier({ alive: false })]);
  const playback = replacement.sample();
  const [dead] = buildCrowdInstances({
    positions: new Float32Array(2),
    alive: new Uint8Array([0]),
    playback,
  }).instances;
  assert.equal(corpsePresentationStrength(dead), 1);
});

test("final incapacity preserves completed travel but stops prospective gait", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier({ speedMps: 1 })]);
  timeline.update(15, [soldier({ speedMps: 1, incapacitated: true })]);
  const held = timeline.sample(15)[0];
  assert.equal(held.base.destination.phase, 0.25);
  assert.equal(timeline.sample(15.75)[0].base.destination.phase, 0.25);
  assert.deepEqual(
    evaluatePlaybackPose(appearances[0], timeline.sample(15.75)[0]),
    evaluatePlaybackPose(appearances[0], held),
  );
});

test("locomotion cadence follows measured interval distance through speed changes", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier({ speedMps: 1 })]);
  timeline.update(15, [soldier({ speedMps: 0.5 })]);
  assert.equal(timeline.sample()[0].base.destination.phase, 0.125);
  timeline.update(30, [soldier({ speedMps: 1 })]);
  assert.equal(timeline.sample()[0].base.destination.phase, 0.375);
});

test("a disabled-left interval does not assign hidden qualified travel to its held gait", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier({ speedMps: 1 })]);
  timeline.update(15, [soldier({ speedMps: 1, incapacitated: true })]);
  timeline.update(30, [soldier({ speedMps: 0.5, incapacitated: true })]);
  assert.equal(timeline.sample()[0].base.destination.phase, 0.25);
  assert.equal(timeline.sample(30.75)[0].base.destination.phase, 0.25);
});

test("incapacity holds the compatible gait through zero travel and recovers without replay", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier({ speedMps: 2 })]);
  timeline.update(15, [soldier({ speedMps: 0.5, incapacitated: true })]);
  assert.deepEqual(timeline.sample()[0].base.destination, { clip: "run", phase: 0.125 });
  timeline.update(45, [soldier({ incapacitated: true, atEase: true })]);
  assert.deepEqual(timeline.sample(45.5)[0].base.destination, { clip: "run", phase: 0.125 });
  const paused = timeline.sample(45.5);
  timeline.update(45, [soldier({ speedMps: 9 })]);
  assert.deepEqual(timeline.sample(45.5), paused);
  timeline.update(60, [soldier({ speedMps: 1 })]);
  assert.deepEqual(timeline.sample()[0].base.destination, { clip: "walk", phase: 0.125 });
  assert.ok(Math.abs(timeline.sample(60.75)[0].base.destination.phase - 0.1375) < 1e-12);
});

test("disabled fresh, reset and replaced appearances preserve canonical time-driven standing", () => {
  const pike = {
    ...appearances[0],
    manifest: {
      presentation: {
        actions: {
          ...actions,
          atEase: { clip: "held", layer: "fullBody" as const },
          pikeReady: { clip: "held", layer: "fullBody" as const },
        },
        riderUpperBodyJoints: null,
      },
    },
    animation: { clips: [...clips, { name: "held", duration: 4, loop: true }] },
    rig: { ...rig, clips: [...rig.clips, { ...rig.clips[0], name: "held" }] },
  };
  const timeline = new ActionTimeline({ 0: pike, 1: pike });
  const disabled = soldier({ incapacitated: true, speedMps: 2, atEase: true });
  timeline.update(0, [disabled]);
  assert.equal(timeline.sample()[0].base.destination.clip, "held");
  assert.equal(timeline.sample(15)[0].base.destination.phase, 0.125);
  timeline.reset();
  timeline.update(0, [soldier({ speedMps: 1 })]);
  timeline.update(15, [{ ...disabled, atEase: false, appearanceId: 1, pikeReady: true }]);
  assert.equal(timeline.sample()[0].base.destination.clip, "held");
  assert.equal(timeline.sample()[0].base.destination.phase, 0);
  assert.equal(timeline.sample(30)[0].base.destination.phase, 0.125);
  timeline.update(0, [disabled]);
  assert.equal(timeline.sample()[0].base.destination.clip, "held");
  assert.equal(timeline.sample()[0].base.destination.phase, 0);
  timeline.update(15, [soldier({ speedMps: 1 })]);
  timeline.reset();
  timeline.update(30, [{ ...disabled, atEase: false }]);
  assert.deepEqual(timeline.sample()[0].base.destination, { clip: "rest", phase: 0 });
});

test("disabling and interrupting gait keeps exact full-body source and event timing", () => {
  for (const event of [{ health: 90 }, { alive: false }, { fighting: true }]) {
    const timeline = new ActionTimeline(appearances);
    timeline.update(0, [soldier({ speedMps: 1 })]);
    timeline.update(15, [soldier({ speedMps: 0.5, incapacitated: true, ...event })]);
    assert.equal(
      evaluatePlaybackPose(appearances[0], timeline.sample()[0])[0],
      1 + (0.5 * 0.5) / 2,
    );
    assert.equal(
      timeline.sample()[0].base.destination.clip,
      "alive" in event ? "fall" : "health" in event ? "recoil" : "swing",
    );
    assert.equal(timeline.sample()[0].base.destination.phase, 0);
    assert.ok(timeline.sample(15.75)[0].base.destination.phase > 0);
  }
});

test("disabled gait phase holds while an existing transition still settles by time", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier()]);
  timeline.update(3, [soldier({ speedMps: 1 })]);
  timeline.update(4, [soldier({ speedMps: 1, incapacitated: true })]);
  const first = timeline.sample(4)[0],
    later = timeline.sample(4.25)[0];
  assert.deepEqual(later.base.destination, first.base.destination);
  assert.ok(first.base.weight > 0 && first.base.weight < later.base.weight);
  assert.ok(later.base.weight < 1);
  assert.notDeepEqual(
    evaluatePlaybackPose(appearances[0], later),
    evaluatePlaybackPose(appearances[0], first),
  );
  assert.deepEqual(timeline.sample(4.25)[0], later);
});

test("measured speed chooses gait and preserves phase through rapid crossovers", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier({ speedMps: 1 })]);
  assert.equal(timeline.sample()[0].base.destination.clip, "walk");
  timeline.update(1, [soldier({ speedMps: 2 })]);
  assert.equal(timeline.sample()[0].base.destination.clip, "run");
  assert.equal(timeline.sample()[0].base.destination.phase, 1 / 30);
  timeline.update(2, [soldier({ speedMps: 1 })]);
  assert.equal(timeline.sample()[0].base.destination.clip, "walk");
  assert.equal(timeline.sample()[0].base.destination.phase, 0.05);
});

test("invalid measured speeds hold the current gait and cannot poison playback phases", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier({ speedMps: 2 })]);
  timeline.update(1, [soldier({ speedMps: 2 })]);
  const phase = timeline.sample()[0].base.destination.phase;
  for (const [i, speedMps] of [NaN, Infinity, -1].entries()) {
    timeline.update(i + 2, [soldier({ speedMps })]);
    assert.equal(timeline.sample()[0].base.destination.clip, "run");
    assert.equal(timeline.sample()[0].base.destination.phase, phase);
    assert.ok(
      Array.from(evaluatePlaybackPose(appearances[0], timeline.sample()[0])).every(Number.isFinite),
    );
  }
});

test("equal observed travel yields equal gait phase despite elapsed time, reversal, or external displacement", () => {
  const fast = new ActionTimeline(appearances),
    slow = new ActionTimeline(appearances);
  fast.update(0, [soldier({ speedMps: 1 })]);
  slow.update(0, [soldier({ speedMps: 0.5 })]);
  fast.update(30, [soldier({ speedMps: 1, forwardMps: -1, guardedFacing: true })]);
  slow.update(60, [
    soldier({ speedMps: 0.5, forwardMps: 0, lateralMps: 0.5, incapacitated: true }),
  ]);
  assert.equal(fast.sample()[0].base.destination.phase, 0.5);
  assert.equal(slow.sample()[0].base.destination.phase, 0.5);
  // Displacement drives this seam; neither test claims the shove is a voluntary step.
});

test("render extrapolation never double-counts measured travel and pause or reset is exact", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier({ speedMps: 1 })]);
  const extrapolated = timeline.sample(15);
  assert.equal(extrapolated[0].base.destination.phase, 0.25);
  assert.deepEqual(timeline.sample(15), extrapolated);
  timeline.update(15, [soldier({ speedMps: 0.5 })]);
  assert.equal(timeline.sample()[0].base.destination.phase, 0.125);
  const paused = timeline.sample();
  timeline.update(15, [soldier({ speedMps: 99, health: 1 })]);
  assert.deepEqual(timeline.sample(), paused);
  timeline.update(1, [soldier({ speedMps: 1 })]);
  assert.equal(timeline.sample()[0].base.destination.phase, 0);
  timeline.reset();
  assert.deepEqual(timeline.sample(), []);
  timeline.update(500, [soldier({ speedMps: 1 })]);
  assert.equal(timeline.sample()[0].base.destination.phase, 0);
});

test("gait entry counts its observed interval while blending from the exact prior rest pose", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(900, [soldier()]);
  timeline.update(930, [soldier({ speedMps: 1 })]);
  const entered = timeline.sample()[0];
  assert.equal(entered.base.destination.clip, "walk");
  assert.equal(entered.base.destination.phase, 0.5);
  assert.equal(evaluatePlaybackPose(appearances[0], timeline.sample(900)[0])[0], 0);
  assert.equal(evaluatePlaybackPose(appearances[0], entered)[0], 1.5);
  assert.equal(entered.base.weight, 1);
  timeline.update(945, [soldier({ speedMps: 1 })]);
  const later = timeline.sample()[0];
  assert.equal(later.base.destination.phase, 0.75);
  assert.equal(later.base.weight, 1);
  timeline.update(945, [soldier({ speedMps: 1 })]);
  assert.deepEqual(timeline.sample()[0], later);
});

test("held pike readiness selects its authored rest action only while stationary and not at ease", () => {
  const pike = {
    manifest: {
      presentation: {
        actions: { ...actions, pikeReady: { clip: "held-pike", layer: "fullBody" as const } },
        riderUpperBodyJoints: null,
      },
    },
    animation: { clips: [...clips, { ...clips[0], name: "held-pike" }] },
    rig: { ...rig, clips: [...rig.clips, { ...rig.clips[0], name: "held-pike" }] },
  };
  const timeline = new ActionTimeline({ 0: pike });
  timeline.update(0, [soldier()]);
  assert.equal(timeline.sample()[0].base.destination.clip, "rest");
  timeline.update(30, [soldier({ pikeReady: true })]);
  const held = timeline.sample()[0];
  assert.deepEqual(held.base.destination, { clip: "held-pike", phase: 0 });
  timeline.update(60, [soldier({ pikeReady: true })]);
  assert.equal(timeline.sample()[0].base.destination.phase, 0.25);
  timeline.update(90, [soldier({ pikeReady: true, speedMps: 1 })]);
  assert.equal(timeline.sample()[0].base.destination.clip, "walk");
  timeline.update(120, [soldier({ pikeReady: true, atEase: true })]);
  assert.equal(timeline.sample()[0].base.destination.clip, "rest");
  const ordinary = new ActionTimeline(appearances);
  ordinary.update(0, [soldier({ pikeReady: true })]);
  assert.equal(ordinary.sample()[0].base.destination.clip, "rest");
});

test("death starts at observation, holds its last pose and freezes equipment until reset", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier()]);
  timeline.update(90, [soldier({ alive: false })]);
  const death = timeline.sample()[0];
  assert.equal(death.base.destination.clip, "fall");
  assert.equal(death.base.destination.phase, 0);
  timeline.update(180, [soldier({ appearanceId: 99, fighting: true })]);
  const terminal = timeline.sample()[0];
  assert.equal(terminal.appearanceId, 0);
  assert.equal(terminal.base.destination.clip, "fall");
  assert.equal(terminal.base.destination.phase, 1);
  timeline.reset();
  timeline.update(180, [soldier()]);
  assert.equal(timeline.sample()[0].base.destination.clip, "rest");
});

test("only observed injury starts recoil, which completes before returning to movement", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier({ health: 40, speedMps: 1 })]);
  timeline.update(30, [soldier({ health: 40, speedMps: 1 })]);
  assert.equal(timeline.sample()[0].base.destination.clip, "walk");
  timeline.update(31, [soldier({ health: 39, speedMps: 1 })]);
  const hit = timeline.sample()[0];
  assert.equal(hit.base.destination.clip, "recoil");
  assert.equal(hit.base.destination.phase, 0);
  timeline.update(37, [soldier({ health: 39, speedMps: 1 })]);
  const held = timeline.sample()[0];
  assert.ok(Math.abs(held.base.destination.phase - 0.4) < 1e-10);
  timeline.update(46, [soldier({ health: 39, speedMps: 1 })]);
  assert.equal(timeline.sample()[0].base.destination.clip, "walk");
  timeline.update(47, [soldier({ health: 39, mountHealth: 30 })]);
  assert.equal(timeline.sample()[0].base.destination.clip, "rest");
  timeline.update(48, [soldier({ health: 39, mountHealth: 29 })]);
  assert.equal(timeline.sample()[0].base.destination.clip, "recoil");
});

test("paused observations cannot replay events; growth retains histories and backwards time resets", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier()]);
  timeline.update(30, [soldier({ health: 90 })]);
  const before = timeline.sample()[0];
  timeline.update(30, [soldier({ health: 80 }), soldier({ health: 2 })]);
  const grown = timeline.sample();
  assert.deepEqual(grown[0], before);
  assert.equal(grown[1].base.destination.clip, "rest");
  timeline.update(33, [soldier({ health: 90 }), soldier({ health: 2 })]);
  const next = timeline.sample();
  assert.ok(Math.abs(next[0].base.destination.phase - 0.2) < 1e-10);
  assert.equal(next[1].base.destination.clip, "rest");
  timeline.update(0, [soldier({ health: 1 })]);
  const reset = timeline.sample()[0];
  assert.equal(reset.base.destination.clip, "rest");
  assert.equal(reset.base.destination.phase, 0);
});

test("engagement repeats complete authored melee efforts without fabricating hits", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier()]);
  timeline.update(15, [soldier({ fighting: true })]);
  assert.equal(timeline.sample()[0].base.destination.clip, "swing");
  timeline.update(45, [soldier({ fighting: true })]);
  assert.equal(timeline.sample()[0].base.destination.phase, 0.5);
  // Ending engagement lets the already-started effort finish, without starting another.
  timeline.update(60, [soldier()]);
  assert.equal(timeline.sample()[0].base.destination.clip, "swing");
  timeline.update(75, [soldier()]);
  assert.equal(timeline.sample()[0].base.destination.clip, "rest");
  timeline.update(90, [soldier({ fighting: true })]);
  timeline.update(150, [soldier({ fighting: true })]);
  assert.equal(timeline.sample()[0].base.destination.phase, 0);
  timeline.update(165, [soldier({ fighting: true })]);
  assert.equal(timeline.sample()[0].base.destination.phase, 0.25);
});

test("firing enters the authored release marker once per observed onset or refresh", () => {
  const bow = {
    rig: { ...rig, clips: [...rig.clips, { name: "loose", duration: 1, tracks: {} }] },
    manifest: {
      presentation: {
        actions: { ...actions, release: { clip: "loose", layer: "fullBody" as const } },
        riderUpperBodyJoints: null,
      },
    },
    animation: {
      clips: [
        ...clips,
        {
          name: "loose",
          start: 60,
          frames: 10,
          duration: 1,
          loop: false,
          markers: { release: 0.6 },
        },
      ],
    },
  };
  const timeline = new ActionTimeline({ 0: bow });
  timeline.update(0, [soldier()]);
  timeline.update(3, [soldier({ releaseTtl: 0.75 })]);
  const released = timeline.sample()[0];
  assert.equal(released.base.destination.clip, "loose");
  assert.equal(released.base.destination.phase, 0.6);
  timeline.update(6, [soldier({ releaseTtl: 0.65 })]);
  assert.ok(Math.abs(timeline.sample()[0].base.destination.phase - 0.7) < 1e-10);
  timeline.update(9, [soldier({ releaseTtl: 0.75 })]);
  assert.equal(timeline.sample()[0].base.destination.phase, 0.6);
  timeline.update(24, [soldier({ releaseTtl: 0.25 })]);
  assert.equal(timeline.sample()[0].base.destination.clip, "rest");
  timeline.update(25, [soldier({ releaseTtl: 0.75, health: 90 })]);
  assert.equal(timeline.sample()[0].base.destination.clip, "recoil");
});

test("render sampling advances clip time without advancing observation or consuming injury", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier()]);
  timeline.update(3, [soldier({ health: 90 })]);
  assert.ok(Math.abs(timeline.sample(3.5)[0].base.destination.phase - 1 / 30) < 1e-10);
  assert.equal(timeline.sample(3)[0].base.destination.phase, 0);
  timeline.update(6, [soldier({ health: 90 })]);
  assert.ok(Math.abs(timeline.sample()[0].base.destination.phase - 0.2) < 1e-10);
  assert.ok(Math.abs(timeline.sample(5)[0].base.destination.phase - 2 / 15) < 1e-12);
  assert.throws(() => timeline.sample(2), /before.*observation/);
});

test("mounted effort overlays ongoing gait and full-body injury clears that overlay", () => {
  const mounted = {
    rig,
    manifest: {
      presentation: {
        actions: { ...actions, melee: { clip: "swing", layer: "riderUpperBody" as const } },
        riderUpperBodyJoints: ["spine"],
      },
    },
    animation: { clips },
  };
  const timeline = new ActionTimeline({ 0: mounted });
  timeline.update(0, [soldier({ speedMps: 2 })]);
  timeline.update(9, [soldier({ speedMps: 2, fighting: true })]);
  const acting = timeline.sample()[0];
  assert.equal(acting.base.destination.clip, "run");
  assert.equal(acting.base.destination.phase, 0.3);
  assert.deepEqual(acting.riderUpperBody?.destination, { clip: "swing", phase: 0 });
  timeline.update(12, [soldier({ speedMps: 2, health: 90 })]);
  const hit = timeline.sample()[0];
  assert.equal(hit.base.destination.clip, "recoil");
  assert.equal(hit.riderUpperBody, undefined);
});

test("completed mounted action fades back to the current gait without resetting its phase", () => {
  const mounted = {
    rig,
    manifest: {
      presentation: {
        actions: { ...actions, melee: { clip: "swing", layer: "riderUpperBody" as const } },
        riderUpperBodyJoints: ["spine"],
      },
    },
    animation: { clips },
  };
  const timeline = new ActionTimeline({ 0: mounted });
  timeline.update(0, [soldier({ speedMps: 2, fighting: true })]);
  timeline.update(63, [soldier({ speedMps: 2 })]);
  const leaving = timeline.sample()[0];
  assert.equal(evaluatePlaybackPose(mounted, leaving)[0], 4);
  assert.deepEqual(leaving.riderUpperBody?.destination, { kind: "base" });
  assert.ok(Math.abs(leaving.base.destination.phase - 0.1) < 1e-10);
  timeline.update(69, [soldier({ speedMps: 2 })]);
  const finished = timeline.sample()[0];
  assert.equal(finished.riderUpperBody, undefined);
  assert.ok(Math.abs(finished.base.destination.phase - 0.3) < 1e-10);
});

test("equipment changes retain injury history but never mix old and new clip indices", () => {
  const renamed = clips.map((clip) => ({ ...clip, name: `other_${clip.name}` }));
  const otherActions = Object.fromEntries(
    Object.entries(actions).map(([role, binding]) => [
      role,
      binding ? { ...binding, clip: `other_${binding.clip}` } : null,
    ]),
  ) as AppearancePresentation["actions"];
  const timeline = new ActionTimeline({
    ...appearances,
    1: {
      rig: { ...rig, clips: rig.clips.map((clip) => ({ ...clip, name: `other_${clip.name}` })) },
      manifest: { presentation: { actions: otherActions, riderUpperBodyJoints: null } },
      animation: { clips: renamed },
    },
  });
  timeline.update(0, [soldier()]);
  timeline.update(3, [soldier({ appearanceId: 1, health: 90 })]);
  const changed = timeline.sample()[0];
  assert.equal(changed.appearanceId, 1);
  assert.deepEqual(changed.base.source, {
    kind: "clip",
    sample: { clip: "other_recoil", phase: 0 },
  });
  assert.equal(changed.base.destination.clip, "other_recoil");
  assert.equal(changed.base.destination.phase, 0);
});

test("death beats simultaneous release, injury and engagement; inapplicable release stays absent", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier()]);
  timeline.update(1, [soldier({ releaseTtl: 0.75 })]);
  assert.equal(timeline.sample()[0].base.destination.clip, "rest");
  timeline.update(2, [soldier({ alive: false, health: 0, releaseTtl: 0.75, fighting: true })]);
  const dead = timeline.sample()[0];
  assert.equal(dead.base.destination.clip, "fall");
  assert.equal(dead.base.destination.phase, 0);
  assert.equal(dead.riderUpperBody, undefined);
});

test("interruptions preserve the exact blended pose, including repeated early and late interruption", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier()]);
  timeline.update(3, [soldier({ speedMps: 1 })]);
  for (const tick of [4, 7, 8, 12]) {
    const before = evaluatePlaybackPose(appearances[0], timeline.sample(tick)[0]);
    timeline.update(tick, [soldier({ speedMps: 1, health: 100 - tick })]);
    const interrupted = timeline.sample()[0];
    const after = evaluatePlaybackPose(appearances[0], interrupted);
    assert.deepEqual(after, before);
    assert.equal(interrupted.base.weight, 0);
  }
});

test("snapshot storage stays bounded through repeated interruptions and releases after death blend", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier()]);
  for (let tick = 1; tick < 20; tick++) {
    timeline.update(tick, [soldier({ health: 100 - tick })]);
    assert.equal(
      timeline.snapshotBytes,
      (tick === 1 ? 1 : 2) * rig.bones.length * 10 * Float64Array.BYTES_PER_ELEMENT,
    );
  }
  timeline.update(20, [soldier({ alive: false })]);
  timeline.update(60, [soldier({ alive: false })]);
  assert.equal(timeline.snapshotBytes, rig.bones.length * 10 * 8);
  timeline.update(61, [soldier({ alive: false })]);
  assert.equal(timeline.snapshotBytes, 0);
  assert.equal(timeline.sample(60)[0].base.destination.phase, 1);
});

test("consumers cannot mutate controller-owned interruption snapshots", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier()]);
  timeline.update(3, [soldier({ health: 90 })]);
  const value = timeline.sample()[0];
  const before = evaluatePlaybackPose(appearances[0], timeline.sample(4)[0]);
  assert.equal(value.base.source.kind, "frozen");
  if (value.base.source.kind !== "frozen") throw new Error("expected an interruption source");
  Reflect.set(value.base.source.locals, "0", 999);
  Reflect.set(value.base.source, "locals", [999]);
  assert.deepEqual(evaluatePlaybackPose(appearances[0], timeline.sample(4)[0]), before);
});

test("identical interrupted poses share one immutable numeric snapshot without synchronizing later actions", () => {
  const timeline = new ActionTimeline(appearances);
  const observations = Array.from({ length: 32 }, () => soldier());
  timeline.update(0, observations);
  observations.forEach((o) => {
    o.speedMps = 1;
  });
  timeline.update(3, observations);
  observations.forEach((o) => {
    o.health = 90;
  });
  timeline.update(4, observations);
  const interrupted = timeline.sample();
  const sources = new Set(interrupted.map((p) => p.base.source));
  assert.equal(sources.size, 1);
  assert.equal(timeline.snapshotBytes, 2 * rig.bones.length * 10 * 8);
  const source = interrupted[0].base.source;
  assert.equal(source.kind, "frozen");
  if (source.kind !== "frozen") throw new Error("expected frozen source");
  assert.ok(Object.isFrozen(source) && Object.isFrozen(source.locals));
  assert.equal(Reflect.set(source.locals, "0", 999), false);
  observations[0].alive = false;
  timeline.update(5, observations);
  const independent = timeline.sample();
  assert.equal(independent[0].base.destination.clip, "fall");
  assert.equal(independent[1].base.destination.clip, "recoil");
  assert.deepEqual(independent[1].base.source, source);
});

test("batched mixed mounted histories exactly match isolated soldiers through masked exits and interruptions", () => {
  const mountedRig: ImportedRig = {
    bones: [...rig.bones, { ...structuredClone(rig.bones[0]), name: "legs", parent: 0 }],
    clips: rig.clips.map((clip) => ({
      ...structuredClone(clip),
      tracks: {
        ...structuredClone(clip.tracks),
        1: { T: { times: [0, clip.duration], values: [0, 0, 0, 0, 2, 0] } },
      },
    })),
  };
  const mounted = (mask: string[]) => ({
    rig: mountedRig,
    manifest: {
      presentation: {
        actions: { ...actions, melee: { clip: "swing", layer: "riderUpperBody" as const } },
        riderUpperBodyJoints: mask,
      },
    },
    animation: { clips },
  });
  const catalog = { 0: mounted(["spine"]), 1: mounted(["legs"]) };
  const batch = new ActionTimeline(catalog);
  const individuals = Array.from({ length: 24 }, () => new ActionTimeline(catalog));
  let sawBaseDestination = false,
    sawTwoFrozenSources = false;
  const weights = new Set<number>();
  for (let tick = 0; tick <= 82; tick++) {
    const observations = individuals.map((_, index) => {
      const offset = index % 4;
      return soldier({
        appearanceId: index % 2,
        speedMps: tick >= offset ? 2 : 0,
        fighting: tick === 1 + offset,
        health: tick >= 78 + offset ? 90 : 100,
        alive: tick < 81 + offset,
      });
    });
    batch.update(tick, observations);
    individuals.forEach((timeline, index) => timeline.update(tick, [observations[index]]));
    for (const phase of [tick, tick + 0.5]) {
      const actual = batch.sample(phase);
      for (let i = 0; i < individuals.length; i++) {
        const expected = individuals[i].sample(phase)[0];
        assert.deepEqual(actual[i], expected);
        assert.deepEqual(
          evaluatePlaybackPose(catalog[actual[i].appearanceId as 0 | 1], actual[i]),
          evaluatePlaybackPose(catalog[expected.appearanceId as 0 | 1], expected),
        );
        const upper = actual[i].riderUpperBody;
        sawBaseDestination ||= !!upper && "kind" in upper.destination;
        sawTwoFrozenSources ||=
          actual[i].base.source.kind === "frozen" && upper?.source.kind === "frozen";
        weights.add(actual[i].base.weight);
        if (upper) weights.add(upper.weight);
      }
    }
  }
  assert.ok(sawBaseDestination, "exercise an overlay fading toward the current base, not a clip");
  assert.ok(
    sawTwoFrozenSources,
    "exercise simultaneous independently captured base and overlay sources",
  );
  assert.ok(weights.has(0) && weights.has(1) && [...weights].some((w) => w > 0 && w < 1));
});

test("snapshot reuse ends at reset, rewind, and replacement catalog boundaries", () => {
  const timeline = new ActionTimeline(appearances);
  const enter = (controller: ActionTimeline) => {
    controller.update(0, [soldier(), soldier()]);
    controller.update(3, [soldier({ speedMps: 1 }), soldier({ speedMps: 1 })]);
    return controller.sample();
  };
  const first = enter(timeline)[0].base.source;
  const rewound = enter(timeline);
  assert.notEqual(rewound[0].base.source, first);
  assert.deepEqual(rewound[0].base.source, first);
  assert.equal(rewound[0].base.source, rewound[1].base.source);
  timeline.reset();
  assert.equal(timeline.snapshotBytes, 0);
  assert.notEqual(enter(timeline)[0].base.source, rewound[0].base.source);
  const replacement = structuredClone(appearances);
  replacement[0].rig.clips[0].tracks[0].T!.values[0] += 10;
  const reloaded = enter(new ActionTimeline(replacement));
  assert.notDeepEqual(reloaded[0].base.source, first);
  assert.equal(reloaded[0].base.source, reloaded[1].base.source);
});

test("nearly equal release phases stay distinct while an exact repeated pose can reuse its snapshot", () => {
  const bow = {
    rig,
    manifest: {
      presentation: {
        actions: { ...actions, release: { clip: "swing", layer: "fullBody" as const } },
        riderUpperBodyJoints: null,
      },
    },
    animation: {
      clips: clips.map((clip) =>
        clip.name === "swing" ? { ...clip, markers: { release: 0.2 } } : clip,
      ),
    },
  };
  const timeline = new ActionTimeline({ 0: bow });
  timeline.update(
    0,
    [0, 1e-10, 0].map((age) => soldier({ releaseTtl: 0.5, releaseAgeSeconds: age })),
  );
  const before = timeline.sample(3).map((p) => evaluatePlaybackPose(bow, p));
  timeline.update(3, [soldier({ health: 90 }), soldier({ health: 90 }), soldier({ health: 90 })]);
  const interrupted = timeline.sample();
  assert.notDeepEqual(before[0], before[1]);
  assert.deepEqual(
    interrupted.map((p) => evaluatePlaybackPose(bow, p)),
    before,
  );
  assert.equal(interrupted[0].base.source, interrupted[2].base.source);
  assert.notEqual(interrupted[0].base.source, interrupted[1].base.source);
});

test("a rejected batch cannot commit a partial terminal death or reset existing histories", () => {
  const timeline = new ActionTimeline(appearances);
  timeline.update(0, [soldier(), soldier()]);
  assert.throws(
    () => timeline.update(3, [soldier({ alive: false }), soldier({ appearanceId: 99 })]),
    /missing/,
  );
  timeline.update(3, [soldier(), soldier()]);
  const retry = timeline.sample();
  assert.equal(retry[0].base.destination.clip, "rest");
  timeline.update(6, [soldier({ health: 90 }), soldier()]);
  const previous = timeline.sample(6);
  assert.throws(() => timeline.update(0, [soldier({ appearanceId: 99 })]), /missing/);
  assert.deepEqual(timeline.sample(6), previous);
});

test("an already-decayed firing observation starts after its marker and clamps spent recovery", () => {
  const releaseClip: Pick<LocalAnimationClip, "name" | "duration" | "loop" | "markers"> = {
    name: "loose",
    duration: 1,
    loop: false,
    markers: { release: 0.6 },
  };
  const bow = {
    rig: { ...rig, clips: [...rig.clips, { name: "loose", duration: 1, tracks: {} }] },
    manifest: {
      presentation: {
        actions: { ...actions, release: { clip: "loose", layer: "fullBody" as const } },
        riderUpperBodyJoints: null,
      },
    },
    animation: { clips: [...clips, releaseClip] },
  };
  const timeline = new ActionTimeline({ 0: bow });
  timeline.update(30, [soldier({ releaseTtl: 0.45, releaseAgeSeconds: 0.3 })]);
  const late = timeline.sample()[0];
  assert.ok(Math.abs(late.base.destination.phase - 0.9) < 1e-10);
  assert.equal(late.base.destination.clip, "loose");
  timeline.reset();
  timeline.update(30, [soldier({ releaseTtl: 0.15, releaseAgeSeconds: 0.6 })]);
  const spent = timeline.sample()[0];
  assert.equal(spent.base.destination.phase, 1);
});
