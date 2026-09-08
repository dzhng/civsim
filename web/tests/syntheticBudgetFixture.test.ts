// @vitest-environment node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, vi } from "vitest";
import { loadAppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";
import {
  syntheticBudgetFixture,
  staggeredBudgetObservations,
  synchronizedBudgetObservations,
} from "../scenes/models/_synthetic-budget-fixture";
import {
  localPoseToJointMatrices,
  sampleRigLocalPose,
} from "@packages/soldier-assets/src/localPose";
import { poseSoldierMesh } from "@packages/soldier-assets/src/skin";
import {
  BattleModelReplay,
  denseBattleModelReplayRecipe,
} from "../../apps/renderer-lab/src/battleModelReplay";
import { ActionTimeline, evaluatePlaybackPose } from "@packages/crowd-runtime/src/actionTimeline";
import { PlaybackPacker } from "@packages/renderer-core/src/playbackPacking";
import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";
import { decodeLocalSample, resolveLocalSample } from "@packages/soldier-assets/src/localAnimation";

vi.stubGlobal(
  "fetch",
  async (url: string) =>
    new Response(
      await readFile(
        new URL(
          `../../packages/soldier-assets/assets${new URL(String(url)).pathname}`,
          import.meta.url,
        ),
      ),
    ),
);
const source = await loadAppearanceBundle(
  "http://fixture/candidates/blender-reference/mounted/appearance.json",
);
vi.unstubAllGlobals();

test("timed mounted workload exercises measured walk/run and release interruptions", () => {
  const fixture = syntheticBudgetFixture(source);
  for (const mode of ["steady", "interruptions"] as const) {
    const timeline = new ActionTimeline({ 41: fixture });
    const workload = synchronizedBudgetObservations(1, 41, fixture);
    const clips = new Set<string>();
    let releaseSamples = 0;
    for (let tick = 0; tick < 60; tick++) {
      workload.update(tick, mode);
      timeline.update(tick, workload.observations);
      const value = timeline.sample(tick)[0];
      clips.add(value.base.destination.clip);
      if (value.riderUpperBody && "clip" in value.riderUpperBody.destination) releaseSamples++;
      const later = timeline.sample(tick + 0.5)[0];
      assert.notEqual(later.base.destination.phase, value.base.destination.phase);
    }
    assert.deepEqual(
      [...clips].sort(),
      mode === "steady" ? ["fixture-walk"] : ["fixture-run", "fixture-walk"],
    );
    assert.equal(releaseSamples > 0, mode === "interruptions");
  }
});

test("staggered mounted observations expose distinct weighted frozen poses without long setup", () => {
  const fixture = syntheticBudgetFixture(source);
  for (const count of [3, 9]) {
    const timeline = new ActionTimeline({ 41: fixture });
    const observations = (tick: number) => staggeredBudgetObservations(count, tick, 41);
    for (let tick = 0; tick <= 13; tick++) timeline.update(tick, observations(tick));
    const values = timeline.sample();
    const sources = values.flatMap((value) => [value.base.source, value.riderUpperBody!.source]);
    const posed = sources.map((value) => {
      assert.ok(value.kind === "frozen", "expected interrupted source");
      return Array.from(
        poseSoldierMesh(
          fixture.tiers[0],
          localPoseToJointMatrices(fixture.rig, Float64Array.from(value.locals)),
        ).positions,
      );
    });
    assert.equal(new Set(posed.map((positions) => JSON.stringify(positions))).size, 6);
    const packer = new PlaybackPacker(fixture.rig, fixture.animation);
    const frame = packer.prepare(
      count,
      (index) => values[index],
      () => 0,
    );
    assert.ok(frame.requiredSnapshotSlots >= 6 && frame.requiredSnapshotSlots <= count * 2);
    assert.equal(frame.residentSnapshotCount, new Set(sources).size);
    assert.equal(
      frame.uploads.reduce((bytes, upload) => bytes + upload.data.byteLength, 0),
      frame.residentSnapshotCount * fixture.animation.bones * 48,
    );
    process.stdout.write(
      JSON.stringify({
        bodies: count,
        distinctPosedMeshes: 6,
        snapshotSlots: frame.requiredSnapshotSlots,
        controllerSnapshotBytes: timeline.snapshotBytes,
      }) + "\n",
    );
    packer.commitPrepared(frame);
    const repeated = packer.prepare(
      count,
      (index) => values[index],
      () => 0,
    );
    assert.deepEqual(repeated.uploads, []);
    packer.commitPrepared(repeated);
    for (let tick = 14; tick <= 24; tick++) timeline.update(tick, observations(tick));
    const completed = timeline.sample();
    const retired = packer.prepare(
      count,
      (index) => completed[index],
      () => 0,
    );
    assert.equal(retired.requiredSnapshotSlots, 0);
    assert.equal(timeline.snapshotBytes, 0);
  }
});

function assertSameMotion(a: AppearanceBundle, b: AppearanceBundle) {
  const replays = [a, b].map(
    (bundle) => new BattleModelReplay({ 41: bundle }, 41, denseBattleModelReplayRecipe(bundle, 41)),
  );
  for (const tick of [0, 6.25, 12.25, 14.5, 18.25, 26.5, 37.25, 75]) {
    const poses = [a, b].map((bundle, i) =>
      localPoseToJointMatrices(
        bundle.rig,
        evaluatePlaybackPose(bundle, replays[i].seek(tick).playback),
      ),
    );
    for (let tier = 0; tier < 3; tier++) {
      const expected = poseSoldierMesh(a.tiers[tier], poses[0]),
        actual = poseSoldierMesh(b.tiers[tier], poses[1]);
      for (const field of ["positions", "normals", "tangents"] as const) {
        assert.equal(actual[field].length, expected[field].length);
        const error = Math.max(
          ...actual[field].map((value, i) => Math.abs(value - expected[field][i])),
        );
        assert.ok(error < 1e-6, `${tick}/${tier}/${field}: ${error}`);
      }
    }
  }
}

test("subdivision adds coplanar surface detail without altering the seed or other tiers", () => {
  const before = structuredClone(source);
  const fixture = syntheticBudgetFixture(source, { subdivisions: [1, 0, 0] });
  assert.equal(fixture.tiers[0].indices.length, source.tiers[0].indices.length * 4);
  assert.ok(fixture.tiers[0].positions.length > source.tiers[0].positions.length);
  assert.deepEqual(fixture.tiers[1], source.tiers[1]);
  assert.deepEqual(fixture.tiers[2], source.tiers[2]);
  assert.deepEqual(fixture.farMesh, source.farMesh);
  assert.deepEqual(source, before);
  for (const phase of [0, 0.37, 1]) {
    const palette = localPoseToJointMatrices(
      source.rig,
      sampleRigLocalPose(source.rig, "gait", phase),
    );
    const original = poseSoldierMesh(source.tiers[0], palette);
    const refined = poseSoldierMesh(fixture.tiers[0], palette);
    const point = (positions: Float32Array, index: number) =>
      Array.from(positions.slice(index * 3, index * 3 + 3));
    const minus = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
    const cross = (a: number[], b: number[]) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
    for (let triangle = 0; triangle < source.tiers[0].indices.length / 3; triangle++) {
      const [a, b, c] = Array.from(
        source.tiers[0].indices.slice(triangle * 3, triangle * 3 + 3),
        (i) => point(original.positions, i),
      );
      const u = minus(b, a),
        v = minus(c, a),
        n = cross(u, v),
        area = Math.hypot(...n) / 2;
      let refinedArea = 0;
      for (let child = 0; child < 4; child++) {
        const ids = fixture.tiers[0].indices.slice(
          triangle * 12 + child * 3,
          triangle * 12 + child * 3 + 3,
        );
        const points = Array.from(ids, (i) => point(refined.positions, i));
        const childNormal = cross(minus(points[1], points[0]), minus(points[2], points[0]));
        assert.ok(dot(childNormal, n) > 0, "winding preserved");
        refinedArea += Math.hypot(...childNormal) / 2;
        for (const [index, p] of points.entries()) {
          const d = minus(p, a),
            denom = dot(u, u) * dot(v, v) - dot(u, v) ** 2;
          const s = (dot(d, u) * dot(v, v) - dot(d, v) * dot(u, v)) / denom;
          const t = (dot(d, v) * dot(u, u) - dot(d, u) * dot(u, v)) / denom;
          assert.ok(
            Math.abs(dot(d, n)) / Math.hypot(...n) < 1e-6,
            "posed vertex stays on source plane",
          );
          assert.ok(
            s >= -1e-5 && t >= -1e-5 && s + t <= 1 + 1e-5,
            "posed vertex stays inside source triangle",
          );
          assert.deepEqual(
            point(refined.normals, ids[index]),
            point(original.normals, source.tiers[0].indices[triangle * 3]),
          );
        }
      }
      assert.ok(Math.abs(refinedArea - area) < 1e-6, "no added overlapping surface area");
    }
  }
});

test("additional bones are weighted while masked playback preserves the original posed surface", () => {
  const baseline = syntheticBudgetFixture(source);
  const expanded = syntheticBudgetFixture(source, { jointCopies: 4 });
  assert.ok(expanded.rig.bones.length > baseline.rig.bones.length);
  const used = new Set<number>();
  for (const mesh of expanded.tiers)
    mesh.joints.forEach((joint, i) => {
      if (mesh.weights[i] > 0) used.add(joint);
    });
  for (let joint = baseline.rig.bones.length; joint < expanded.rig.bones.length; joint++)
    assert.ok(used.has(joint));
  assertSameMotion(baseline, expanded);
});

test("one versus four influences holds skeleton, topology and composed motion fixed", () => {
  const one = syntheticBudgetFixture(source, { jointCopies: 4, influences: 1 });
  const four = syntheticBudgetFixture(source, { jointCopies: 4, influences: 4 });
  assert.deepEqual(one.rig, four.rig);
  for (const [tier, mesh] of four.tiers.entries()) {
    assert.deepEqual(mesh.positions, one.tiers[tier].positions);
    assert.deepEqual(mesh.indices, one.tiers[tier].indices);
    for (let i = 0; i < mesh.joints.length; i += 4) {
      assert.equal(new Set(mesh.joints.slice(i, i + 4)).size, 4);
      assert.deepEqual(Array.from(mesh.weights.slice(i, i + 4)), [0.25, 0.25, 0.25, 0.25]);
    }
  }
  assertSameMotion(one, four);
});

test("authored-key densification preserves STEP boundaries and fractional LINEAR motion", () => {
  const stepped = structuredClone(source);
  const bind = stepped.rig.bones[3].bind.T;
  stepped.rig.clips[0].tracks[3].T = {
    interpolation: "STEP",
    times: [0, 0.37, 1],
    values: [...bind, bind[0] + 0.07, bind[1], bind[2], ...bind],
  };
  const baseline = syntheticBudgetFixture(stepped);
  const dense = syntheticBudgetFixture(stepped, { keySubdivisions: 4 });
  assert.ok(dense.animation.data.length > baseline.animation.data.length);
  assert.deepEqual(dense.animation.stepMasks, baseline.animation.stepMasks);
  for (const clip of baseline.rig.clips) {
    const next = dense.rig.clips.find((c) => c.name === clip.name)!;
    for (const [joint, track] of Object.entries(clip.tracks)) {
      for (const field of ["T", "R", "S"] as const) {
        const original = track[field];
        if (!original) continue;
        const refined = next.tracks[Number(joint)][field]!;
        const width = field === "R" ? 4 : 3;
        assert.equal(refined.interpolation, original.interpolation);
        for (const [i, time] of original.times.entries()) {
          const index = refined.times.indexOf(time);
          assert.ok(index >= 0);
          assert.deepEqual(
            refined.values.slice(index * width, (index + 1) * width),
            original.values.slice(i * width, (i + 1) * width),
          );
        }
      }
    }
    for (const phase of [0, 0.125, 0.369999, 0.37, 0.370001, 0.8, 1]) {
      const expected = sampleRigLocalPose(baseline.rig, clip.name, phase);
      const actual = sampleRigLocalPose(dense.rig, clip.name, phase);
      assert.ok(Math.max(...actual.map((v, i) => Math.abs(v - expected[i]))) < 1e-6);
      const decoded = decodeLocalSample(
        dense.animation,
        resolveLocalSample(dense.animation, clip.name, phase),
      );
      assert.ok(Math.max(...decoded.map((v, i) => Math.abs(v - expected[i]))) < 1e-6);
    }
  }
  assertSameMotion(baseline, dense);
});

test("combined fixture mutations leave the source untouched and reject unmeasurable inputs", () => {
  const before = structuredClone(source);
  const fixture = syntheticBudgetFixture(source, {
    subdivisions: [1, 1, 1],
    jointCopies: 4,
    influences: 4,
    keySubdivisions: 2,
  });
  assert.deepEqual(source, before);
  assert.deepEqual(fixture.manifest.bounds, source.manifest.bounds);
  assert.deepEqual(fixture.surface, source.surface);
  assert.deepEqual(fixture.farMesh, source.farMesh);
  assert.throws(
    () => syntheticBudgetFixture(source, { jointCopies: 2, influences: 4 }),
    /available joint copies/,
  );
  assert.throws(
    () => syntheticBudgetFixture(source, { jointCopies: 100 }),
    /referenced seed vertices/,
  );
  assert.throws(
    () => syntheticBudgetFixture(source, { subdivisions: [-1, 0, 0] }),
    /nonnegative integers/,
  );
  assert.throws(() => syntheticBudgetFixture(source, { keySubdivisions: 0 }), /positive integers/);
});

test("dense indexed geometry keeps every triangle index addressable beyond uint16", () => {
  const mesh = syntheticBudgetFixture(source, { subdivisions: [5, 0, 0] }).tiers[0];
  assert.ok(mesh.positions.length / 3 > 65536);
  assert.ok(mesh.indices instanceof Uint32Array);
  assert.equal(mesh.indices.length, source.tiers[0].indices.length * 4 ** 5);
  let maxIndex = 0;
  for (const index of mesh.indices) {
    assert.ok(index < mesh.positions.length / 3);
    maxIndex = Math.max(maxIndex, index);
  }
  assert.ok(maxIndex > 65535);
});
