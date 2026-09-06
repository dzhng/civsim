// @vitest-environment node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, vi } from "vitest";
import {
  BattleModelReplay,
  denseBattleModelReplayRecipe,
} from "../../apps/renderer-lab/src/battleModelReplay";
import { loadAppearanceCatalog } from "@packages/soldier-assets/src/appearanceBundle";
import { evaluatePlaybackPose } from "@packages/crowd-runtime/src/actionTimeline";

vi.stubGlobal("fetch", async (url: string) => {
  const path = new URL(String(url)).pathname;
  return new Response(
    await readFile(new URL(`../../packages/soldier-assets/assets${path}`, import.meta.url)),
  );
});
const assets = await loadAppearanceCatalog("http://fixture/catalog.json");
vi.unstubAllGlobals();

test("same-time death boundary preserves the previous alive observation and displayed pose", () => {
  const replay = new BattleModelReplay(assets, 7);
  replay.seek(240);
  const { before, after } = replay.seekBoundary(195);
  assert.equal(before.tick, 195);
  assert.equal(after.tick, 195);
  assert.equal(before.observation.alive, true);
  assert.equal(after.observation.alive, false);
  assert.equal(before.instances[0].alive, true);
  assert.equal(after.instances[0].alive, false);
  assert.deepEqual(
    evaluatePlaybackPose(assets[7], before.playback),
    evaluatePlaybackPose(assets[7], after.playback),
  );
  assert.deepEqual(replay.state(), after);
  assert.deepEqual(replay.seekBoundary(195), { before, after });
});

test("dense release interruptions preserve exact displayed locals on both sides of blend midpoint", () => {
  for (const appearanceId of [4, 7]) {
    const recipe = denseBattleModelReplayRecipe(assets[appearanceId], appearanceId);
    const replay = new BattleModelReplay(assets, appearanceId, recipe);
    for (const tick of [11, 14, 15, 18]) {
      const { before, after } = replay.seekBoundary(tick);
      const lane = before.playback.riderUpperBody ?? before.playback.base;
      assert.ok(Math.abs(lane.weight - (tick === 11 || tick === 15 ? 1 : 3) / 4.5) < 1e-12);
      assert.deepEqual(
        evaluatePlaybackPose(assets[appearanceId], after.playback),
        evaluatePlaybackPose(assets[appearanceId], before.playback),
      );
      const nextLane = after.playback.riderUpperBody ?? after.playback.base;
      assert.equal(nextLane.weight, 0);
      assert.equal(nextLane.source.kind, "frozen");
      assert.ok(after.snapshotBytes <= 2 * assets[appearanceId].rig.bones.length * 10 * 8);
    }
  }
});

test("mounted release exit follows a changing base, then composed death holds and releases snapshots", () => {
  const recipe = denseBattleModelReplayRecipe(assets[7], 7);
  const replay = new BattleModelReplay(assets, 7, recipe);
  const exitTick = recipe.events.find((event) => event.label === "Release exit")!.tick;
  const deathTick = recipe.events.find((event) => event.label === "Composed death")!.tick;
  const exit = replay.seekBoundary(exitTick);
  assert.deepEqual(exit.after.playback.riderUpperBody?.destination, { kind: "base" });
  assert.ok(exit.after.playback.base.weight > 0 && exit.after.playback.base.weight < 1);
  assert.deepEqual(
    evaluatePlaybackPose(assets[7], exit.before.playback),
    evaluatePlaybackPose(assets[7], exit.after.playback),
  );
  const change = replay.seekBoundary(exitTick + 1);
  assert.equal(change.after.playback.base.weight, 0);
  assert.deepEqual(
    evaluatePlaybackPose(assets[7], change.before.playback),
    evaluatePlaybackPose(assets[7], change.after.playback),
  );
  const converged = replay.seek(exitTick + 4.75);
  assert.equal(converged.playback.riderUpperBody?.weight, 1);
  assert.ok(converged.playback.base.weight < 1);
  assert.deepEqual(
    evaluatePlaybackPose(assets[7], converged.playback),
    evaluatePlaybackPose(assets[7], { appearanceId: 7, base: converged.playback.base }),
  );
  const death = replay.seekBoundary(deathTick);
  assert.ok(death.before.playback.riderUpperBody);
  assert.equal(death.after.playback.riderUpperBody, undefined);
  assert.equal(death.after.playback.base.weight, 0);
  assert.deepEqual(
    evaluatePlaybackPose(assets[7], death.before.playback),
    evaluatePlaybackPose(assets[7], death.after.playback),
  );
  const terminal = replay.seek(recipe.endTick);
  assert.equal(terminal.playback.base.destination.phase, 1);
  assert.equal(terminal.snapshotBytes, 0);
  assert.deepEqual(
    evaluatePlaybackPose(assets[7], terminal.playback),
    evaluatePlaybackPose(assets[7], replay.seek(recipe.endTick - 1).playback),
  );
  replay.reset();
  assert.deepEqual(replay.seekBoundary(deathTick), death);
  for (let tick = 0; tick <= recipe.endTick; tick += 0.25) {
    const state = replay.seek(tick);
    assert.ok(
      state.snapshotBytes <= 2 * evaluatePlaybackPose(assets[7], state.playback).byteLength,
      `snapshot storage at ${tick}`,
    );
  }
});

test("direct seek preserves all release/injury/death observations and replays identically after reset", () => {
  const direct = new BattleModelReplay(assets, 4);
  const stepped = new BattleModelReplay(assets, 4);
  let previous = -1;
  for (const checkpoint of [46, 61, 92, 106, 166, 200, 240]) {
    for (let tick = previous + 1; tick <= checkpoint; tick++) stepped.seek(tick);
    assert.deepEqual(direct.seek(checkpoint), stepped.state(), `seek tick ${checkpoint}`);
    previous = checkpoint;
  }
  const death = assets[4].manifest.presentation!.actions.death!;
  assert.equal(direct.state().instances[0].clip, death.clip);
  assert.equal(direct.state().instances[0].phase, 1);
  const release = direct.seek(90);
  assert.equal(
    release.playback.base.destination.clip,
    assets[4].manifest.presentation!.actions.release!.clip,
  );
  assert.equal(
    release.playback.base.destination.phase,
    assets[4].animation.clips.find((clip) => clip.name === release.playback.base.destination.clip)!
      .markers!.release,
  );
  direct.reset();
  assert.deepEqual(direct.seek(90), release);
});

test("replay retains mounted upper action while submitting the production base pose", () => {
  const replay = new BattleModelReplay(assets, 7);
  const state = replay.seek(90);
  assert.equal(
    state.playback.riderUpperBody?.destination &&
      "clip" in state.playback.riderUpperBody.destination
      ? state.playback.riderUpperBody.destination.clip
      : null,
    assets[7].manifest.presentation!.actions.release!.clip,
  );
  assert.equal(state.instances[0].clip, state.playback.base.destination.clip);
  assert.deepEqual(replay.seek(90), state);
});

test("replay switches equipment through canonical selection metadata and rejects manual-only assets", () => {
  const replay = new BattleModelReplay(assets, 3);
  const state = replay.seek(165);
  assert.notEqual(state.playback.appearanceId, 3);
  assert.equal(assets[state.playback.appearanceId].manifest.name, "heavy-phalanx-sidearm");
  const manual = { ...assets[3], manifest: { ...assets[3].manifest, presentation: null } };
  assert.throws(() => new BattleModelReplay({ 3: manual }, 3), /Manual-only/);
});
