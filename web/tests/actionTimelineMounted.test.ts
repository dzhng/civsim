// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  ActionTimeline,
  evaluatePlaybackPose,
  type ActionObservation,
  type ClipSample,
  type PoseSource,
  type SoldierPlayback,
} from "@packages/crowd-runtime/src/actionTimeline";
import {
  blendLocalPoses,
  composeMaskedLocals,
  localPoseToJointMatrices,
  mat4Identity,
  sampleRigLocalPose,
  transformPoint,
  type LocalPose,
} from "@packages/soldier-assets/src/localPose";
import type { ImportedRig } from "@packages/soldier-assets/src/rig";
import type { AppearancePresentation } from "@packages/soldier-assets/src/presentation";
import type { LocalAnimationClip } from "@packages/soldier-assets/src/localAnimation";

const clips: Pick<LocalAnimationClip, "name" | "duration" | "loop" | "markers" | "strideMeters">[] =
  ["ready", "walk", "run", "release", "hit", "death"].map((name, index) => ({
    name,
    duration: 1,
    loop: index < 3,
    ...(name === "walk" ? { strideMeters: 1 } : name === "run" ? { strideMeters: 2 } : {}),
    ...(name === "release" ? { markers: { release: 0.2 } } : {}),
  }));
const rig: ImportedRig = {
  bones: ["horse", "pelvis", "upper"].map((name, joint) => ({
    name,
    parent: joint - 1,
    inverseBind: mat4Identity(),
    bind: { T: [0, 0, joint], R: [0, 0, 0, 1], S: [1, 1, 1] },
  })),
  clips: clips.map((clip, index) => ({
    ...clip,
    tracks: Object.fromEntries(
      [0, 1, 2].map((joint) => {
        const angle = 0.13 * (index + 1) * (joint + 1);
        return [
          joint,
          {
            T: {
              times: [0, 1],
              values: [index + joint, joint * 0.3, 1, index + joint + 0.7, joint * 0.3 + 0.4, 1.2],
            },
            R: {
              times: [0, 1],
              values: [
                0,
                0,
                Math.sin(angle / 2),
                Math.cos(angle / 2),
                0,
                0,
                Math.sin((angle + 0.5) / 2),
                Math.cos((angle + 0.5) / 2),
              ],
            },
          },
        ];
      }),
    ),
  })),
};
const presentation: AppearancePresentation = {
  riderUpperBodyJoints: ["upper"],
  actions: {
    ready: { clip: "ready", layer: "fullBody" },
    atEase: { clip: "ready", layer: "fullBody" },
    walk: { clip: "walk", layer: "fullBody" },
    run: { clip: "run", layer: "fullBody" },
    release: { clip: "release", layer: "riderUpperBody" },
    melee: null,
    hit: { clip: "hit", layer: "fullBody" },
    death: { clip: "death", layer: "fullBody" },
    pikeReady: null,
    guardedBackwardWalk: null,
    guardedLeftWalk: null,
    guardedRightWalk: null,
  },
};
const appearance = { manifest: { presentation }, animation: { clips }, rig };
const observation = (changes: Partial<ActionObservation> = {}): ActionObservation => ({
  appearanceId: 0,
  alive: true,
  health: 100,
  mountHealth: 100,
  speedMps: 1,
  forwardMps: changes.speedMps ?? 1,
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
const pose = (sample: SoldierPlayback) => evaluatePlaybackPose(appearance, sample);

test("equipment changes freeze the complete rider overlay, including simultaneous release or death", () => {
  for (const next of [{}, { releaseTtl: 0.8 }, { alive: false }]) {
    const other = structuredClone(appearance);
    const catalog = { 0: appearance, 1: other };
    const timeline = new ActionTimeline(catalog);
    timeline.update(0, [observation()]);
    timeline.update(4, [observation({ releaseTtl: 0.5 })]);
    const before = timeline.sample(6)[0];
    assert.ok(before.riderUpperBody);
    const expected = pose(before);
    timeline.update(6, [observation({ appearanceId: 1, ...next })]);
    const after = timeline.sample()[0];
    assert.equal(after.appearanceId, 1);
    assert.deepEqual(evaluatePlaybackPose(other, after), expected);
    if (next.alive === false) assert.equal(after.base.destination.clip, "death");
  }
});

test("matching names with different ancestry do not permit equipment pose reuse", () => {
  const other = structuredClone(appearance);
  other.rig.bones[2].parent = 0;
  const timeline = new ActionTimeline({ 0: appearance, 1: other });
  timeline.update(0, [observation()]);
  timeline.update(4, [observation({ appearanceId: 1 })]);
  assert.equal(timeline.sample()[0].base.source.kind, "clip");
  assert.equal(timeline.sample()[0].base.weight, 1);
});

function close(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  label: string,
  tolerance = 1e-10,
) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++)
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= tolerance,
      `${label}[${i}]: ${actual[i]} != ${expected[i]}`,
    );
}
function continuous(actual: LocalPose, expected: LocalPose) {
  close(actual, expected, "local TRS");
  const a = localPoseToJointMatrices(rig, actual),
    b = localPoseToJointMatrices(rig, expected);
  // An asymmetric triangle per joint exposes rotation as well as joint-origin translation.
  for (let joint = 0; joint < 3; joint++)
    for (const vertex of [
      [0, 0, 0],
      [0.3, 0.1, 0],
      [0, 0.2, 0.4],
    ])
      close(
        transformPoint(a.subarray(joint * 16, joint * 16 + 16), vertex),
        transformPoint(b.subarray(joint * 16, joint * 16 + 16), vertex),
        `joint ${joint} vertex`,
        1e-6,
      );
}
function moving() {
  const timeline = new ActionTimeline({ 0: appearance });
  timeline.update(0, [observation()]);
  timeline.update(3, [observation({ speedMps: 2 })]);
  return timeline;
}

test("speed correction completes the composed interruption source and unmasked gait from measured distance", () => {
  const timeline = new ActionTimeline({ 0: appearance });
  timeline.update(0, [observation({ speedMps: 0.8 })]);
  timeline.update(1, [observation({ speedMps: 0.8 })]);
  const before = pose(timeline.sample(2)[0]);
  const completed = sampleRigLocalPose(rig, "walk", 0.8 * (1 / 30) + 1.2 * (1 / 30));
  timeline.update(2, [observation({ speedMps: 1.2, releaseTtl: 0.5 })]);
  const playback = timeline.sample()[0];
  assert.equal(playback.riderUpperBody!.source.kind, "frozen");
  if (playback.riderUpperBody!.source.kind !== "frozen") throw new Error("expected owned pose");
  close(playback.riderUpperBody!.source.locals, completed, "complete frozen composed source");
  const after = pose(playback);
  close(after.slice(20), completed.slice(20), "interrupted upper mask");
  const correctedBase = pose({ ...playback, riderUpperBody: undefined });
  close(after.slice(0, 20), correctedBase.slice(0, 20), "measured unmasked gait");
  assert.notDeepEqual(Array.from(after.slice(0, 20)), Array.from(before.slice(0, 20)));
});

test("final incapacity holds corrected lower gait without freezing a masked release", () => {
  for (const guardedFacing of [false, true]) {
    const guardedAppearance = structuredClone(appearance);
    guardedAppearance.manifest.presentation.actions.guardedBackwardWalk = {
      clip: "walk",
      layer: "fullBody",
    };
    const timeline = new ActionTimeline({ 0: guardedAppearance });
    const motion = { speedMps: 0.8, forwardMps: -1, guardedFacing };
    timeline.update(0, [observation(motion)]);
    timeline.update(1, [observation(motion)]);
    const before = pose(timeline.sample(2)[0]);
    const completed = sampleRigLocalPose(rig, "walk", 0.8 * (1 / 30) + 1.2 * (1 / 30));
    timeline.update(2, [observation({ speedMps: 1.2, releaseTtl: 0.5, incapacitated: true })]);
    const playback = timeline.sample()[0];
    assert.equal(playback.riderUpperBody!.source.kind, "frozen");
    if (playback.riderUpperBody!.source.kind !== "frozen") throw new Error("expected owned pose");
    assert.deepEqual(playback.riderUpperBody!.source.locals, Array.from(completed));
    const after = pose(playback);
    assert.deepEqual(after.slice(20), completed.slice(20));
    assert.notDeepEqual(after.slice(0, 20), before.slice(0, 20));
    const later = timeline.sample(2.75)[0];
    assert.deepEqual(later.base.destination, playback.base.destination);
    assert.deepEqual(pose(later).slice(0, 20), after.slice(0, 20));
    assert.notDeepEqual(later.riderUpperBody!.destination, playback.riderUpperBody!.destination);
    assert.notDeepEqual(pose(later).slice(20), after.slice(20));
  }
});

test("mounted overlay enters from the displayed pose during a base crossfade", () => {
  const timeline = moving();
  const live = timeline.sample(4)[0];
  assert.ok(live.base.weight > 0 && live.base.weight < 1, "base must be crossfading");
  const before = pose(live);
  timeline.update(4, [observation({ speedMps: 2, releaseTtl: 0.5 })]);
  const after = pose(timeline.sample()[0]);
  continuous(after, before);
  const later = timeline.sample(6)[0];
  close(
    pose(later).subarray(0, 20),
    pose({ ...later, riderUpperBody: undefined }).subarray(0, 20),
    "horse/pelvis retain gait",
  );
});

test("mounted release restarts continuously before and after blend midpoint", () => {
  const timeline = moving();
  timeline.update(4, [observation({ speedMps: 2, releaseTtl: 0.5 })]);
  for (const tick of [5, 8]) {
    const before = pose(timeline.sample(tick)[0]);
    timeline.update(tick, [observation({ speedMps: 2, releaseTtl: 0.5 })]);
    const after = pose(timeline.sample()[0]);
    continuous(after, before);
  }
});

test("overlay exit converges toward evaluated advancing base, not its destination clip", () => {
  const timeline = moving();
  timeline.update(4, [observation({ speedMps: 2, releaseTtl: 0.5 })]);
  timeline.update(27, [observation()]);
  const before = pose(timeline.sample(29)[0]);
  timeline.update(29, [observation()]);
  continuous(pose(timeline.sample()[0]), before);
  timeline.update(30, [observation()]);
  const exiting = timeline.sample()[0];
  const base = pose({ ...exiting, riderUpperBody: undefined });
  const destination = sampleRigLocalPose(
    rig,
    exiting.base.destination.clip,
    exiting.base.destination.phase,
  );
  assert.ok(
    Math.abs(base[20] - destination[20]) > 0.05,
    "fixture must still be crossfading the base",
  );
  assert.ok(exiting.riderUpperBody, "overlay must be fading out");
  const expectedUpper = blendLocalPoses(before, base, exiting.riderUpperBody.weight);
  const expected = base.slice();
  expected.set(expectedUpper.subarray(20, 30), 20);
  continuous(pose(exiting), expected);
  timeline.update(36, [observation()]);
  const finished = timeline.sample()[0];
  continuous(pose(finished), pose({ ...finished, riderUpperBody: undefined }));
  assert.equal(finished.riderUpperBody, undefined, "completed overlay must be released");
});

test("mounted death captures the full composed pose during simultaneous base and rider blends", () => {
  const timeline = moving();
  timeline.update(4, [observation({ speedMps: 2, releaseTtl: 0.5 })]);
  const live = timeline.sample(6)[0];
  assert.ok(live.base.weight > 0 && live.base.weight < 1, "base must be crossfading");
  const before = pose(live);
  assert.ok(Math.abs(before[20] - pose({ ...live, riderUpperBody: undefined })[20]) > 0.1);
  timeline.update(6, [observation({ alive: false, speedMps: 2 })]);
  continuous(pose(timeline.sample()[0]), before);
  const terminal = pose(timeline.sample(60)[0]);
  continuous(terminal, sampleRigLocalPose(rig, "death", 1));
  continuous(pose(timeline.sample(90)[0]), terminal);
});

test("paused mounted playback sampling is deterministic and does not mutate retained poses", () => {
  const timeline = moving();
  timeline.update(4, [observation({ speedMps: 2, releaseTtl: 0.5 })]);
  const retained = timeline.sample(5)[0];
  const retainedValue = structuredClone(retained);
  const expected = pose(retained);
  const paused = pose(timeline.sample(4)[0]);
  for (let repeat = 0; repeat < 5; repeat++) {
    continuous(pose(timeline.sample(5)[0]), expected);
    timeline.update(4, [observation({ alive: false })]);
    continuous(pose(timeline.sample()[0]), paused);
  }
  timeline.update(6, [observation({ speedMps: 2, releaseTtl: 0.5 })]);
  continuous(pose(retained), expected);
  for (const tick of [40, 45, 46]) {
    timeline.update(tick, [observation({ alive: tick < 46 })]);
    timeline.sample(tick + 0.5);
    assert.deepEqual(retained, retainedValue);
    continuous(pose(retained), expected);
  }
});

test("mounted injury interrupts the composed pose and returns continuously to gait", () => {
  const timeline = moving();
  timeline.update(4, [observation({ speedMps: 2, releaseTtl: 0.5 })]);
  const live = timeline.sample(6)[0];
  assert.ok(live.base.weight > 0 && live.base.weight < 1);
  const injured = observation({ speedMps: 2, health: 90 });
  timeline.update(6, [injured]);
  const hit = timeline.sample()[0];
  continuous(pose(hit), pose(live));
  assert.equal(hit.riderUpperBody, undefined);
  const beforeRecovery = pose(timeline.sample(37)[0]);
  timeline.update(37, [injured]);
  continuous(pose(timeline.sample()[0]), beforeRecovery);
  timeline.update(45, [injured]);
  const recovered = timeline.sample()[0];
  continuous(pose(recovered), sampleRigLocalPose(rig, "run", recovered.base.destination.phase));
});

test("exact rider and injury boundaries keep authored joints and independently owned outputs", () => {
  const timeline = new ActionTimeline({ 0: appearance });
  timeline.update(0, [observation()]);
  timeline.update(3, [observation({ releaseTtl: 0.5 })]);
  const onset = timeline.sample()[0];
  assert.equal(onset.riderUpperBody!.weight, 0);
  assert.deepEqual(pose(onset), sampleRigLocalPose(rig, "walk", 3 / 30));

  timeline.update(8, [observation({ releaseTtl: 0.5 - 5 / 30 })]);
  const settled = timeline.sample()[0];
  assert.equal(settled.riderUpperBody!.weight, 1);
  const expected = sampleRigLocalPose(rig, "walk", 8 / 30);
  const released = sampleRigLocalPose(rig, "release", 0.2 + (8 / 30 - 3 / 30));
  expected.set(released.subarray(20, 30), 20);
  assert.deepEqual(pose(settled), expected, "only the upper joint takes the released pose");

  const interrupted = sampleRigLocalPose(rig, "walk", 9 / 30);
  const upper = sampleRigLocalPose(rig, "release", 0.2 + (9 / 30 - 3 / 30));
  interrupted.set(upper.subarray(20, 30), 20);
  timeline.update(9, [observation({ health: 90, releaseTtl: 0.3 })]);
  const injury = timeline.sample()[0];
  assert.equal(injury.base.weight, 0);
  assert.equal(injury.riderUpperBody, undefined);
  assert.deepEqual(pose(injury), interrupted, "injury starts at the complete composed endpoint");

  const retained = [onset, settled, injury];
  const retainedValues = structuredClone(retained);
  const retainedPoses = retained.map(pose);
  for (const playback of retained) pose(playback).fill(-1000);
  timeline.update(15, [observation({ health: 90 })]);
  for (let index = 0; index < retained.length; index++) {
    assert.deepEqual(retained[index], retainedValues[index]);
    assert.deepEqual(pose(retained[index]), retainedPoses[index]);
  }
});

/** The recipe endpoint evaluation replaced: blend both lanes unconditionally, then compose. */
function alwaysBlended(playback: SoldierPlayback): LocalPose {
  const sampled = (clip: ClipSample) => sampleRigLocalPose(rig, clip.clip, clip.phase);
  const source = (value: PoseSource) =>
    value.kind === "frozen" ? Float64Array.from(value.locals) : sampled(value.sample);
  const base = blendLocalPoses(
    source(playback.base.source),
    sampled(playback.base.destination),
    playback.base.weight,
  );
  const upper = playback.riderUpperBody;
  if (!upper) return base;
  const destination = "kind" in upper.destination ? base : sampled(upper.destination);
  return composeMaskedLocals(
    base,
    blendLocalPoses(source(upper.source), destination, upper.weight),
    presentation.riderUpperBodyJoints!.map((name) =>
      rig.bones.findIndex((bone) => bone.name === name),
    ),
  );
}
const frozenSource = (clip: string, phase: number) =>
  Object.freeze({
    kind: "frozen" as const,
    locals: Object.freeze(Array.from(sampleRigLocalPose(rig, clip, phase))),
  });
const sourceKinds: PoseSource[] = [
  { kind: "clip", sample: { clip: "ready", phase: 0.25 } },
  frozenSource("hit", 0.4),
];

test("endpoint evaluation reproduces the unconditional blend for every source kind and weight", () => {
  const overlays = [undefined, { clip: "release", phase: 0.6 }, { kind: "base" as const }];
  for (const baseSource of sourceKinds)
    for (const baseWeight of [0, 0.25, 0.5, 1])
      for (const upperSource of sourceKinds)
        for (const upperWeight of [0, 0.25, 0.5, 1])
          for (const destination of overlays) {
            const playback: SoldierPlayback = {
              appearanceId: 0,
              base: {
                source: baseSource,
                destination: { clip: "walk", phase: 0.7 },
                weight: baseWeight,
              },
              ...(destination && {
                riderUpperBody: { source: upperSource, destination, weight: upperWeight },
              }),
            };
            const label = `${baseSource.kind} ${baseWeight} over ${upperSource.kind} ${upperWeight} to ${
              destination ? ("kind" in destination ? "base" : "clip") : "none"
            }`;
            const observed = structuredClone(playback);
            assert.deepEqual(pose(playback), alwaysBlended(playback), label);
            assert.deepEqual(playback, observed, `${label} evaluates without editing its playback`);
          }
});

test("endpoint evaluation owns its result and never writes through a retained source", () => {
  const frozen = frozenSource("hit", 0.4);
  const captured = Array.from(frozen.locals);
  const walk: ClipSample = { clip: "walk", phase: 0.3 };
  const settled = { source: { kind: "clip" as const, sample: walk }, destination: walk, weight: 1 };
  const playbacks: SoldierPlayback[] = [
    { appearanceId: 0, base: { source: frozen, destination: walk, weight: 0 } },
    { appearanceId: 0, base: { source: frozen, destination: walk, weight: 1 } },
    // The exiting overlay aliases the evaluated base as its own destination.
    ...[0, 1].map((weight) => ({
      appearanceId: 0,
      base: settled,
      riderUpperBody: { source: frozen, destination: { kind: "base" as const }, weight },
    })),
    {
      appearanceId: 0,
      base: settled,
      riderUpperBody: { source: frozen, destination: { clip: "release", phase: 0.6 }, weight: 1 },
    },
  ];
  for (const playback of playbacks) {
    const first = pose(playback);
    const expected = Float64Array.from(first);
    first.fill(-1000);
    const second = pose(playback);
    assert.notEqual(second, first, "each evaluation returns its own storage");
    assert.deepEqual(second, expected, "a mutated result cannot reach a later evaluation");
    assert.deepEqual(Array.from(frozen.locals), captured, "the frozen source is never written to");
  }
});

test("a frozen source that does not fit the skeleton is refused wherever it is read", () => {
  const short = Object.freeze({ kind: "frozen" as const, locals: Object.freeze([1, 2, 3]) });
  const walk: ClipSample = { clip: "walk", phase: 0.3 };
  const refused = (playback: SoldierPlayback) => assert.throws(() => pose(playback), /skeleton/);
  // Weight one settles onto the destination, so the source is not a pose the output carries.
  for (const weight of [0, 0.5]) {
    refused({ appearanceId: 0, base: { source: short, destination: walk, weight } });
    refused({
      appearanceId: 0,
      base: { source: { kind: "clip", sample: walk }, destination: walk, weight: 1 },
      riderUpperBody: { source: short, destination: { kind: "base" }, weight },
    });
  }
});
