// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  ActionTimeline,
  evaluatePlaybackPose,
  type ActionObservation,
  type SoldierPlayback,
} from "@packages/crowd-runtime/src/actionTimeline";
import {
  blendLocalPoses,
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

test("speed correction keeps the old composed interruption source while the unmasked gait follows measured distance", () => {
  const timeline = new ActionTimeline({ 0: appearance });
  timeline.update(0, [observation({ speedMps: 0.8 })]);
  timeline.update(1, [observation({ speedMps: 0.8 })]);
  const before = pose(timeline.sample(2)[0]);
  timeline.update(2, [observation({ speedMps: 1.2, releaseTtl: 0.5 })]);
  const playback = timeline.sample()[0];
  assert.equal(playback.riderUpperBody!.source.kind, "frozen");
  if (playback.riderUpperBody!.source.kind !== "frozen") throw new Error("expected owned pose");
  close(playback.riderUpperBody!.source.locals, before, "complete frozen composed source");
  const after = pose(playback);
  close(after.slice(20), before.slice(20), "interrupted upper mask");
  const correctedBase = pose({ ...playback, riderUpperBody: undefined });
  close(after.slice(0, 20), correctedBase.slice(0, 20), "measured unmasked gait");
  assert.notDeepEqual(Array.from(after.slice(0, 20)), Array.from(before.slice(0, 20)));
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
  timeline.update(6, [observation({ alive: false })]);
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
