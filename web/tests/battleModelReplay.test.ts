// @vitest-environment node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, vi } from "vitest";
import { BattleModelReplay } from "../../apps/renderer-lab/src/battleModelReplay";
import { loadAppearanceCatalog } from "@packages/soldier-assets/src/appearanceBundle";

vi.stubGlobal("fetch", async (url: string) => {
  const path = new URL(String(url)).pathname;
  return new Response(
    await readFile(new URL(`../../packages/soldier-assets/assets${path}`, import.meta.url)),
  );
});
const assets = await loadAppearanceCatalog("http://fixture/catalog.json");
vi.unstubAllGlobals();

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
