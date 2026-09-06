// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import * as packing from "@packages/renderer-core/src/playbackPacking";
import { PlaybackPacker } from "@packages/renderer-core/src/playbackPacking";
import {
  bakeLocalAnimation,
  decodeLocalSample,
  packLocalPose,
  type LocalAnimation,
} from "@packages/soldier-assets/src/localAnimation";
import type { ImportedRig } from "@packages/soldier-assets/src/rig";
import {
  ActionTimeline,
  evaluatePlaybackPose,
  type ActionObservation,
  type SoldierPlayback,
} from "@packages/crowd-runtime/src/actionTimeline";
import {
  blendLocalPoses,
  composeMaskedLocals,
  localPoseToJointMatrices,
  type LocalPose,
} from "@packages/soldier-assets/src/localPose";
import { decodeSoldierMesh } from "@packages/soldier-assets/src/appearanceBundle";
import { poseSoldierMesh } from "@packages/soldier-assets/src/skin";
import type { AppearancePresentation } from "@packages/soldier-assets/src/presentation";
import { readFileSync } from "node:fs";

const rig: ImportedRig = {
  bones: [
    {
      name: "root",
      parent: -1,
      bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] },
      inverseBind: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
  ],
  clips: [
    {
      name: "move",
      duration: 1,
      tracks: { 0: { T: { times: [0, 1], values: [0, 0, 0, 2, 0, 0] } } },
    },
  ],
};
const frozen = (x: number) => Object.freeze([x, 0, 0, 0, 0, 0, 1, 1, 1, 1]);

test("indexed manual samples retain endpoint semantics without timeline or snapshot allocation", () => {
  const animation = bakeLocalAnimation(rig);
  const packer = new PlaybackPacker(rig, animation);
  const samples = [
    { clip: "move", phase: 0.25 },
    { clip: "move", phase: 1 },
  ];
  const frame = packer.prepare(
    samples.length,
    (index) => samples[index],
    () => {
      throw new Error("manual samples have no upper-body mask");
    },
  );
  assert.deepEqual(frame.uploads, []);
  assert.equal(frame.requiredSnapshotSlots, 0);
  assert.equal(decodeRecord(animation, frame.controls, new Map(), [], 0)[0], 0.5);
  assert.equal(decodeRecord(animation, frame.controls, new Map(), [], 1)[0], 2);
});

test("direct immutable and Float64 locals produce identical packed bytes with valid rotations", () => {
  const immutable = Object.freeze([-0, 1 / 3, -2, 0.1, 0.2, 0.3, Math.sqrt(0.86), 2, 3, 4]);
  const typed: LocalPose = Float64Array.from(immutable);
  assert.deepEqual(
    Buffer.from(packLocalPose(immutable).buffer),
    Buffer.from(packLocalPose(typed).buffer),
  );
  assert.throws(() => packLocalPose(Object.freeze([1, 2, 3])), /T3\/R4\/S3/);
  assert.throws(
    () => packLocalPose(Object.freeze([1e300, ...immutable.slice(1)])),
    /finite in Float32/,
  );
  assert.throws(
    () => packLocalPose(Object.freeze([-0, 1 / 3, -2, 0, 0, 0, 1.0001, 2, 3, 4])),
    /near-unit quaternion.*Float32/,
  );
});
const playback = (locals: readonly number[]): SoldierPlayback => ({
  appearanceId: 0,
  base: {
    source: { kind: "frozen", locals },
    destination: { clip: "move", phase: 0.5 },
    weight: 0.25,
  },
});

test("unsubmitted preparation does not suppress required snapshot uploads on retry", () => {
  const packer = new PlaybackPacker(rig, bakeLocalAnimation(rig)),
    locals = frozen(3),
    input = [playback(locals)];
  const first = packer.prepare(
    input.length,
    (index) => input[index],
    () => 0,
  );
  assert.equal(first.uploads[0].data[0], 3);
  packer.discardPrepared(first);
  const retry = packer.prepare(
    input.length,
    (index) => input[index],
    () => 0,
  );
  assert.equal(retry.uploads[0].data[0], 3);
  packer.commitPrepared(retry);
  const retained = packer.prepare(
    input.length,
    (index) => input[index],
    () => 0,
  );
  assert.deepEqual(retained.uploads, []);
  assert.equal(retained.residentSnapshotCount, 1);
});

test("fresh snapshot-buffer generation reuploads active sources without old-buffer copies", () => {
  const animation = bakeLocalAnimation(rig);
  const packer = new PlaybackPacker(rig, animation);
  const values = [playback(frozen(10)), playback(frozen(20))];
  const prepare = () =>
    packer.prepare(
      values.length,
      (index) => values[index],
      () => 0,
    );
  const initial = prepare();
  packer.commitPrepared(initial);
  assert.deepEqual(prepare().uploads, []);
  packer.reset(); // Adapter has allocated a fresh empty GPU buffer.
  assert.equal(packer.peakCommittedSnapshotSlots, 0);
  const grown = prepare();
  const freshBank = new Map(grown.uploads.map((upload) => [upload.slot, upload.data]));
  assert.equal(decodeRecord(animation, grown.controls, freshBank, [], 0)[0], 7.75);
  assert.equal(decodeRecord(animation, grown.controls, freshBank, [], 1)[0], 15.25);
  packer.commitPrepared(grown);
  assert.deepEqual(prepare().uploads, []);
  assert.equal(packer.peakCommittedSnapshotSlots, 2);
});

test("snapshot identity is shared only while visible, with reusable holes and bounded slot high water", () => {
  const packer = new PlaybackPacker(rig, bakeLocalAnimation(rig));
  const a = frozen(1),
    b = frozen(2),
    c = frozen(3);
  const submit = (sources: readonly (readonly number[])[]) => {
    const values = sources.map(playback);
    const frame = packer.prepare(
      values.length,
      (index) => values[index],
      () => 0,
    );
    assert.ok(frame.residentSnapshotCount <= sources.length * 2);
    packer.commitPrepared(frame);
    return frame;
  };
  const first = submit([a, b, a]);
  assert.deepEqual(
    first.uploads.map((upload) => [upload.slot, upload.data[0]]),
    [
      [0, 1],
      [1, 2],
    ],
  );
  const hole = submit([b]);
  assert.equal(hole.residentSnapshotCount, 1);
  assert.equal(
    hole.requiredSnapshotSlots,
    2,
    "retained slot is stable; live count is not allocated span",
  );
  assert.deepEqual(hole.uploads, []);
  const reused = submit([b, c]);
  assert.deepEqual(
    reused.uploads.map((upload) => [upload.slot, upload.data[0]]),
    [[0, 3]],
  );
  for (let i = 0; i < 100; i++) submit([frozen(i)]);
  assert.equal(
    packer.peakCommittedSnapshotSlots,
    2,
    "historical identities do not grow the slot address space",
  );
  submit([]);
  assert.equal(packer.residentSnapshotCount, 0);
  assert.deepEqual(
    submit([b]).uploads.map((upload) => [upload.slot, upload.data[0]]),
    [[0, 2]],
    "invisible re-entry uploads again",
  );
});

test("superseded/reset plans cannot commit and rig generations never share residency", () => {
  const animation = bakeLocalAnimation(rig),
    packer = new PlaybackPacker(rig, animation);
  const input = [playback(frozen(5))];
  const stale = packer.prepare(
      input.length,
      (index) => input[index],
      () => 0,
    ),
    current = packer.prepare(
      input.length,
      (index) => input[index],
      () => 0,
    );
  assert.throws(() => packer.commitPrepared(stale), /no longer pending/);
  packer.commitPrepared(current);
  const resetPlan = packer.prepare(
    input.length,
    (index) => input[index],
    () => 0,
  );
  packer.reset();
  assert.throws(() => packer.commitPrepared(resetPlan), /no longer pending/);
  assert.equal(
    packer.prepare(
      input.length,
      (index) => input[index],
      () => 0,
    ).uploads[0].data[0],
    5,
  );
  const replacement = new PlaybackPacker(structuredClone(rig), animation);
  assert.equal(
    replacement.prepare(
      input.length,
      (index) => input[index],
      () => 0,
    ).uploads[0].data[0],
    5,
  );
  assert.throws(
    () =>
      replacement.commitPrepared(
        packer.prepare(
          input.length,
          (index) => input[index],
          () => 0,
        ),
      ),
    /no longer pending/,
  );
});

test("invalid replacement preparation preserves committed snapshots without admitting partial uploads", () => {
  const packer = new PlaybackPacker(rig, bakeLocalAnimation(rig)),
    a = frozen(1),
    b = frozen(2);
  const first = packer.prepare(
    1,
    () => playback(a),
    () => 0,
  );
  packer.commitPrepared(first);
  const bad = playback(b);
  bad.base.destination.clip = "missing";
  assert.throws(
    () =>
      packer.prepare(
        1,
        () => bad,
        () => 0,
      ),
    /missing local clip/,
  );
  assert.equal(packer.residentSnapshotCount, 1);
  assert.deepEqual(
    packer.prepare(
      1,
      () => playback(a),
      () => 0,
    ).uploads,
    [],
  );
  assert.equal(
    packer.prepare(
      1,
      () => playback(b),
      () => 0,
    ).uploads[0].data[0],
    2,
  );
});

test("abandoned partial uploads invalidate overwritten committed slots before retry", () => {
  for (const abort of ["discard", "supersede"] as const) {
    const animation = bakeLocalAnimation(rig),
      packer = new PlaybackPacker(rig, animation),
      bank = new Map<number, Float32Array>();
    const a = frozen(10),
      b = frozen(20),
      c = frozen(30);
    const original = [playback(a), playback(b)];
    const replacement = [original[1], playback(c)];
    const initial = packer.prepare(
      2,
      (index) => original[index],
      () => 0,
    );
    for (const upload of initial.uploads) bank.set(upload.slot, upload.data);
    packer.commitPrepared(initial);
    const abandoned = packer.prepare(
      2,
      (index) => replacement[index],
      () => 0,
    );
    for (const upload of abandoned.uploads) bank.set(upload.slot, upload.data); // Queue writes landed, later submission failed.
    if (abort === "discard") packer.discardPrepared(abandoned);
    const retry = packer.prepare(
      2,
      (index) => original[index],
      () => 0,
    );
    for (const upload of retry.uploads) bank.set(upload.slot, upload.data);
    assert.equal(
      decodeRecord(animation, retry.controls, bank, [], 0)[0],
      7.75,
      `${abort}: retry must restore A, not render C from overwritten slot0`,
    );
    assert.deepEqual(
      retry.uploads.map((upload) => upload.data[0]),
      [10],
      "unaffected B stays resident while overwritten A uploads again",
    );
    packer.commitPrepared(retry);
  }
});

// Decode the actual transport words with the shared source decoder/composer.
// This is a CPU transport oracle, not a substitute for the kernel's GPU proof.
function decodeRecord(
  animation: LocalAnimation,
  words: Uint32Array,
  bank: Map<number, Float32Array>,
  mask: number[],
  index = 0,
): LocalPose {
  const offset = index * packing.PLAYBACK_WORDS,
    floats = new Float32Array(words.buffer, words.byteOffset, words.length);
  const flags = words[offset + packing.PLAYBACK_HEADER_FLAGS];
  const read = (descriptor: number, frozen: boolean) => {
    const start = offset + descriptor;
    return frozen
      ? decodeLocalSample(
          { ...animation, data: bank.get(words[start])! },
          { sampleA: 0, sampleB: 0, fraction: 0, stepMaskOffset: 0 },
        )
      : decodeLocalSample(animation, {
          sampleA: words[start],
          sampleB: words[start + 1],
          fraction: floats[start + 2],
          stepMaskOffset: words[start + 3],
        });
  };
  const base = blendLocalPoses(
    read(packing.PLAYBACK_BASE_SOURCE, !!(flags & packing.PLAYBACK_BASE_FROZEN)),
    read(packing.PLAYBACK_BASE_DESTINATION, false),
    floats[offset + packing.PLAYBACK_HEADER_BASE_WEIGHT],
  );
  if (!(flags & packing.PLAYBACK_UPPER_PRESENT)) return base;
  const destination =
    flags & packing.PLAYBACK_UPPER_DEST_BASE
      ? base
      : read(packing.PLAYBACK_UPPER_DESTINATION, false);
  return composeMaskedLocals(
    base,
    blendLocalPoses(
      read(packing.PLAYBACK_UPPER_SOURCE, !!(flags & packing.PLAYBACK_UPPER_FROZEN)),
      destination,
      floats[offset + packing.PLAYBACK_HEADER_UPPER_WEIGHT],
    ),
    mask,
  );
}

test("upper exit targets the evaluated crossfading base, with two independent frozen lane sources", () => {
  const animation = bakeLocalAnimation(rig),
    packer = new PlaybackPacker(rig, animation);
  const value = playback(frozen(10));
  value.riderUpperBody = {
    source: { kind: "frozen", locals: frozen(20) },
    destination: { kind: "base" },
    weight: 0.5,
  };
  const frame = packer.prepare(
    1,
    () => value,
    () => 7,
  );
  const bank = new Map(frame.uploads.map((upload) => [upload.slot, upload.data]));
  assert.equal(
    decodeRecord(animation, frame.controls, bank, [0])[0],
    13.875,
    "base=7.75, upper halfway20→7.75; using base destination1 would incorrectly yield10.5",
  );
  assert.equal(frame.residentSnapshotCount, 2);
  assert.equal(
    frame.controls[packing.PLAYBACK_HEADER_FLAGS],
    packing.PLAYBACK_BASE_FROZEN |
      packing.PLAYBACK_UPPER_PRESENT |
      packing.PLAYBACK_UPPER_FROZEN |
      packing.PLAYBACK_UPPER_DEST_BASE,
  );
  packer.commitPrepared(frame);
  value.riderUpperBody.source = value.base.source;
  const shared = packer.prepare(
    1,
    () => value,
    () => 7,
  );
  assert.equal(shared.residentSnapshotCount, 1);
  assert.deepEqual(shared.uploads, []);
  value.riderUpperBody.source = { kind: "frozen", locals: frozen(10) };
  const distinct = packer.prepare(
    1,
    () => value,
    () => 7,
  );
  assert.equal(
    distinct.residentSnapshotCount,
    2,
    "equal values in different immutable objects are distinct source identities",
  );
});

test("compact record order preserves per-instance clips, weights and integer descriptors", () => {
  const animation = bakeLocalAnimation(rig),
    packer = new PlaybackPacker(rig, animation);
  const first = playback(frozen(10));
  const second: SoldierPlayback = {
    appearanceId: 0,
    base: {
      source: { kind: "clip", sample: { clip: "move", phase: 0.25 } },
      destination: { clip: "move", phase: 1 },
      weight: 0.5,
    },
  };
  const values = [first, second];
  const frame = packer.prepare(
    values.length,
    (index) => values[index],
    () => 0,
  );
  const bank = new Map(frame.uploads.map((upload) => [upload.slot, upload.data]));
  assert.equal(decodeRecord(animation, frame.controls, bank, [], 0)[0], 7.75);
  assert.equal(decodeRecord(animation, frame.controls, bank, [], 1)[0], 1.25);
  assert.equal(frame.controls.byteLength, 160);
  assert.equal(frame.controls[packing.PLAYBACK_WORDS + packing.PLAYBACK_HEADER_FLAGS], 0);
});

test("real action timeline interruptions and upper exit pack the same composed mounted pose", () => {
  const json = (path: string) =>
    JSON.parse(
      readFileSync(
        new URL(
          `../../packages/soldier-assets/assets/candidates/blender-reference/mounted/${path}`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
  const mountedRig: ImportedRig = json("skeleton.json"),
    animation = bakeLocalAnimation(mountedRig);
  const mesh = decodeSoldierMesh(json("tier-0.mesh.json"));
  const presentation: AppearancePresentation = {
    actions: {
      ready: { clip: "gait", layer: "fullBody" },
      atEase: { clip: "gait", layer: "fullBody" },
      walk: { clip: "gait", layer: "fullBody" },
      run: { clip: "gait", layer: "fullBody" },
      melee: { clip: "rider-action", layer: "riderUpperBody" },
      release: null,
      hit: { clip: "rider-action", layer: "fullBody" },
      death: { clip: "rider-action", layer: "fullBody" },
      pikeReady: null,
    },
    riderUpperBodyJoints: ["rider-spine", "rider-arm", "rider-head"],
  };
  const appearance = {
    rig: mountedRig,
    animation: json("animation.json"),
    manifest: { presentation },
  };
  const timeline = new ActionTimeline({ 41: appearance }),
    packer = new PlaybackPacker(mountedRig, animation),
    bank = new Map<number, Float32Array>();
  const mask = presentation.riderUpperBodyJoints!.map((name) =>
    mountedRig.bones.findIndex((bone) => bone.name === name),
  );
  const base: ActionObservation = {
    appearanceId: 41,
    alive: true,
    health: 100,
    mountHealth: 100,
    speedMps: 1,
    running: false,
    atEase: false,
    pikeReady: false,
    fighting: false,
    releaseTtl: 0,
    releaseAgeSeconds: 0,
  };
  let maximumError = 0;
  const check = (playback: SoldierPlayback) => {
    const frame = packer.prepare(
      1,
      () => playback,
      () => 0xf1234567,
    );
    for (const upload of frame.uploads) bank.set(upload.slot, upload.data);
    const decoded = decodeRecord(animation, frame.controls, bank, mask),
      expected = evaluatePlaybackPose(appearance, playback);
    const actualPositions = poseSoldierMesh(
      mesh,
      localPoseToJointMatrices(mountedRig, decoded),
    ).positions;
    const expectedPositions = poseSoldierMesh(
      mesh,
      localPoseToJointMatrices(mountedRig, expected),
    ).positions;
    for (let vertex = 0; vertex < actualPositions.length; vertex += 3) {
      const error = Math.hypot(
        ...[0, 1, 2].map(
          (axis) => actualPositions[vertex + axis] - expectedPositions[vertex + axis],
        ),
      );
      maximumError = Math.max(maximumError, error);
      assert.ok(error < 1e-5, `resolved control deformation differs by ${error}m`);
    }
    assert.equal(frame.controls.byteLength, 80);
    if (playback.riderUpperBody)
      assert.equal(
        frame.controls[packing.PLAYBACK_HEADER_UPPER_MASK],
        0xf1234567,
        "integer metadata never passes through Float32 conversion",
      );
    else
      assert.deepEqual(
        Array.from(frame.controls.slice(packing.PLAYBACK_UPPER_SOURCE)),
        Array(8).fill(0),
      );
    assert.ok(frame.residentSnapshotCount <= 2);
    packer.commitPrepared(frame);
    return frame;
  };
  timeline.update(0, [base]);
  check(timeline.sample()[0]);
  timeline.update(1, [{ ...base, fighting: true }]);
  check(timeline.sample()[0]);
  check(timeline.sample(2)[0]);
  timeline.update(32, [{ ...base, running: true }]);
  const exit = check(timeline.sample()[0]);
  assert.ok(exit.controls[packing.PLAYBACK_HEADER_FLAGS] & packing.PLAYBACK_UPPER_DEST_BASE);
  assert.ok(exit.controls[packing.PLAYBACK_HEADER_FLAGS] & packing.PLAYBACK_BASE_FROZEN);
  assert.deepEqual(
    Array.from(exit.controls.slice(packing.PLAYBACK_UPPER_DESTINATION)),
    [0, 0, 0, 0],
  );
  check(timeline.sample(33)[0]); // Upper exit follows a moving base which is itself crossfading.
  timeline.update(34, [{ ...base, running: true, health: 99 }]);
  check(timeline.sample()[0]);
  timeline.update(35, [{ ...base, alive: false, health: 0 }]);
  check(timeline.sample()[0]);
  check(timeline.sample(70)[0]);
  assert.equal(
    packer.residentSnapshotCount,
    0,
    "completed terminal blend releases frozen references",
  );
  assert.ok(maximumError < 1e-5);
});
