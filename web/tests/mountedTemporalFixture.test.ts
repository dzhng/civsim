// @vitest-environment node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, vi } from "vitest";
import { loadAppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";
import { assertAppearancePresentation } from "@packages/soldier-assets/src/presentation";
import { mountedTemporalFixture } from "../scenes/models/_mounted-temporal-fixture";
import {
  BattleModelReplay,
  denseBattleModelReplayRecipe,
} from "../../apps/renderer-lab/src/battleModelReplay";
import { evaluatePlaybackPose } from "@packages/crowd-runtime/src/actionTimeline";
import { sampleRigLocalPose } from "@packages/soldier-assets/src/localPose";
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

test("test-only admission preserves authored assets and accepts the real timeline", () => {
  const fixture = mountedTemporalFixture(source);
  assert.equal(source.manifest.presentation, null);
  assert.deepEqual(fixture.tiers, source.tiers);
  assert.deepEqual(fixture.rig.bones, source.rig.bones);
  for (const clip of source.rig.clips)
    assert.deepEqual(
      fixture.rig.clips.find((candidate) => candidate.name === clip.name),
      clip,
    );
  assertAppearancePresentation(fixture.manifest.presentation, fixture.rig, fixture.animation, true);
  const recipe = denseBattleModelReplayRecipe(fixture, 41);
  const replay = new BattleModelReplay({ 41: fixture }, 41, recipe);
  assert.ok(replay.seek(14.5).playback.riderUpperBody);
});

test("rebaked aliases retain original authored poses at endpoints and fractional times", () => {
  const fixture = mountedTemporalFixture(source);
  for (const [alias, original] of [
    ["fixture-walk", "gait"],
    ["fixture-run", "gait"],
    ["fixture-release", "rider-action"],
    ["fixture-fullbody-terminal", "rider-action"],
  ]) {
    for (const phase of [0, 0.125, 0.375, 0.8, 1]) {
      const expected = sampleRigLocalPose(source.rig, original, phase);
      const authored = sampleRigLocalPose(fixture.rig, alias, phase);
      assert.deepEqual(authored, expected);
      const decoded = decodeLocalSample(
        fixture.animation,
        resolveLocalSample(fixture.animation, alias, phase),
      );
      const error = Math.max(...decoded.map((value, index) => Math.abs(value - expected[index])));
      assert.ok(error < 1e-6, `${alias}/${phase}: ${error}`);
    }
  }
});

test("authored mounted overlay exits to the advancing base and full-body terminal transition is continuous", () => {
  const fixture = mountedTemporalFixture(source);
  const recipe = denseBattleModelReplayRecipe(fixture, 41);
  const replay = new BattleModelReplay({ 41: fixture }, 41, recipe);
  const exitTick = recipe.events.find((event) => event.label === "Release exit")!.tick;
  const deathTick = recipe.events.find((event) => event.label === "Composed death")!.tick;
  for (const tick of [10, 11, 14, 15, 18, exitTick, exitTick + 1, deathTick]) {
    const { before, after } = replay.seekBoundary(tick);
    assert.deepEqual(
      evaluatePlaybackPose(fixture, before.playback),
      evaluatePlaybackPose(fixture, after.playback),
      `boundary ${tick}`,
    );
  }
  const converged = replay.seek(exitTick + 4.75);
  assert.equal(converged.playback.riderUpperBody?.weight, 1);
  assert.ok(converged.playback.base.weight < 1);
  assert.deepEqual(
    evaluatePlaybackPose(fixture, converged.playback),
    evaluatePlaybackPose(fixture, { appearanceId: 41, base: converged.playback.base }),
  );
  const terminal = replay.seek(recipe.endTick);
  assert.equal(terminal.playback.base.destination.phase, 1);
  assert.equal(terminal.snapshotBytes, 0);
  const held = evaluatePlaybackPose(fixture, terminal.playback);
  assert.deepEqual(held, sampleRigLocalPose(source.rig, "rider-action", 1));
  assert.deepEqual(held, evaluatePlaybackPose(fixture, replay.seek(recipe.endTick - 1).playback));
});

test("rider action leaves the moving horse, pelvis and legs at their CPU base pose", () => {
  const fixture = mountedTemporalFixture(source);
  const recipe = denseBattleModelReplayRecipe(fixture, 41);
  const replay = new BattleModelReplay({ 41: fixture }, 41, recipe);
  const mask = fixture.manifest.presentation!.riderUpperBodyJoints!;
  const poses = [12.25, 13.5].map((tick) => {
    const { playback } = replay.seek(tick);
    const composed = evaluatePlaybackPose(fixture, playback);
    const base = evaluatePlaybackPose(fixture, { appearanceId: 41, base: playback.base });
    let changedUpper = false;
    fixture.rig.bones.forEach((bone, index) => {
      const actual = composed.slice(index * 10, (index + 1) * 10);
      const expected = base.slice(index * 10, (index + 1) * 10);
      if (mask.includes(bone.name))
        changedUpper ||= actual.some((value, i) => value !== expected[i]);
      else assert.deepEqual(actual, expected, bone.name);
    });
    assert.ok(changedUpper, "masked articulation must be visible in the CPU pose");
    return base;
  });
  const leg = fixture.rig.bones.findIndex((bone) => bone.name === "horse-front-leg");
  assert.notDeepEqual(
    poses[0].slice(leg * 10, (leg + 1) * 10),
    poses[1].slice(leg * 10, (leg + 1) * 10),
  );
});
