/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
/** Does a published snapshot actually feed the EXISTING presentation consumers?
 *
 * The transport probe only proves the raw adapter inputs arrive byte for byte. These
 * checks run the real `BattleActionAdapter` — and, for one transient, the real
 * `ActionTimeline` — over published buffers, with the same adapter reading the live
 * `Game` as the oracle. No second timeline, no second `Game` per case, no timing claim.
 * They are lab checks of the publication layout, not production integration.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CAPACITY, createRun, presentationMetadata, snapshot } from "./publication.mjs";
import { createPublishedObservationSource } from "./publishedObservations.ts";
import {
  field,
  liveProjectiles,
  publishedProjectiles,
  type PublishedSnapshot,
} from "./publicationRecords.ts";
import { BattleActionAdapter } from "../../../web/src/battle/battleActionAdapter";
import {
  battleObservationMetadata,
  createBattleViews,
  createLiveObservationSource,
} from "../../../web/src/battle/battleViews";
import initWasm, { Game } from "../../../web/src/wasm/game_wasm.js";
import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import { APPEARANCE_DESCRIPTORS } from "@packages/soldier-assets/src/appearance";
import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";
import { ActionTimeline } from "@packages/crowd-runtime/src/actionTimeline";

const WASM_DIRECTORY = resolve("web/src/wasm");
let wasm: Awaited<ReturnType<typeof initWasm>>;
beforeAll(async () => {
  wasm = await initWasm({
    module_or_path: await readFile(`${WASM_DIRECTORY}/game_wasm_bg.wasm`),
  });
});

/** One consumer: the real adapter over published buffers, plus the publication source
 * holding them. Its construction metadata is the producer's identity, as a consumer with
 * no local `Game` would receive it. */
function consumer(run: { game: Game; memory: WebAssembly.Memory }) {
  const identity = presentationMetadata(run.game);
  const publication = createPublishedObservationSource(
    battleObservationMetadata(identity.classSpecs, identity.releaseDuration),
  );
  return {
    publication,
    live: new BattleActionAdapter(createLiveObservationSource(run.game, run.memory)),
    published: new BattleActionAdapter(publication),
    publish(tick: number, buffer: ArrayBuffer) {
      const state: PublishedSnapshot = snapshot(run, tick, buffer);
      publication.adopt(state);
      return state;
    },
  };
}

/** Every published projectile record equals the live one at the same completed tick. */
function expectProjectileRecords(
  published: PublishedSnapshot,
  run: { game: Game; memory: WebAssembly.Memory },
) {
  expect(published.projectiles).toBe(run.game.projectile_count());
  expect(publishedProjectiles(published).map((record) => Array.from(record))).toEqual(
    liveProjectiles(run.game, run.memory).map((record) => Array.from(record)),
  );
}

async function fixtureAppearances(names: readonly string[]) {
  const read = async (url: URL) => JSON.parse(await readFile(url, "utf8"));
  const catalog: Record<number, AppearanceBundle> = {};
  for (const name of names) {
    const url = new URL(
      `../../../web/public/assets/soldiers/fixtures/placeholder-soldiers/appearances/${name}/appearance.json`,
      import.meta.url,
    );
    const manifest = await read(url);
    catalog[APPEARANCE_DESCRIPTORS.findIndex((descriptor) => descriptor.name === name)] = {
      manifest,
      rig: await read(new URL(manifest.skeleton, url)),
      animation: await read(new URL(manifest.animation, url)),
    } as AppearanceBundle;
  }
  return catalog;
}

// Short enough to stay a smoke: the canonical armies are still approaching, and the
// first real posture transitions land at tick 91.
const PREPARE_TICKS = 88;
const SMOKE_TICKS = 8;

test(
  "canonical published snapshots reproduce live adapter observations, facings and HUD records",
  { timeout: 120_000 },
  async () => {
    const run = await createRun(WASM_DIRECTORY);
    const { publication, live, published, publish } = consumer(run);
    const views = createBattleViews(run.game, run.memory);
    const buffer = new ArrayBuffer(CAPACITY);
    const guarded: string[] = [];
    try {
      for (let tick = 0; tick < PREPARE_TICKS; tick += 30)
        run.game.advance_ticks(Math.min(30, PREPARE_TICKS - tick));
      for (let tick = PREPARE_TICKS; tick < PREPARE_TICKS + SMOKE_TICKS; tick++) {
        if (tick > PREPARE_TICKS) run.game.advance_ticks(1);
        const state = publish(tick, buffer);
        const fromSnapshot = published.read(tick);
        const fromGame = live.read(tick);
        expect(state.tick).toBe(tick);
        expect(state.hash).toBe(run.game.state_hash().toString());
        expect(state.soldiers).toBe(run.game.soldier_count());
        expect(fromSnapshot.observations).toHaveLength(state.soldiers);
        expect(fromSnapshot.observations).toEqual(fromGame.observations);
        expect(Array.from(fromSnapshot.facings)).toEqual(Array.from(fromGame.facings));
        // HUD and projectile records ride the same buffer as the observations they belong to.
        expect(Array.from(field(state, "unit_info", Float32Array))).toEqual(
          Array.from(views.unitInfo()),
        );
        expectProjectileRecords(state, run);
        guarded.push(
          fromSnapshot.observations.map((one) => (one.guardedFacing ? "1" : "0")).join(""),
        );
      }
      // The window must actually move, or the parity above proves nothing about transitions.
      expect(new Set(guarded).size).toBeGreaterThan(1);
      expect(publication.release().byteLength).toBe(CAPACITY);
    } finally {
      run.game.free();
    }
  },
);

test("a published release transition reaches the real action timeline", async () => {
  const game = new Game(37);
  const run = { game, memory: wasm.memory };
  const { live, published, publish } = consumer(run);
  const timeline = new ActionTimeline(await fixtureAppearances(["archers", "heavy-sword"]));
  const buffer = new ArrayBuffer(CAPACITY);
  try {
    game.spawn_class(0, 0, 0, 5, 3, 4, 0);
    game.spawn_class(40, 0, Math.PI, 5, 3, 0, 1);
    const releaseDuration = game.loosing_duration();
    let released = -1;
    for (let tick = 0; tick <= 2; tick++) {
      if (tick > 0) game.tick();
      const state = publish(tick, buffer);
      const { observations } = published.read(tick);
      expect(observations).toHaveLength(game.soldier_count());
      expect(observations).toEqual(live.read(tick).observations);
      expectProjectileRecords(state, run);
      timeline.update(tick, observations);
      const loosing = field(state, "loosing", Float32Array);
      observations.forEach((observation, soldier) => {
        expect(observation.releaseTtl).toBe(loosing[soldier]);
        expect(observation.releaseAgeSeconds).toBe(
          loosing[soldier] > 0 ? releaseDuration - loosing[soldier] : 0,
        );
      });
      if (released < 0 && observations.some((observation) => observation.releaseTtl > 0))
        released = tick;
    }
    expect(released).toBe(1);
    expect(game.projectile_count()).toBeGreaterThan(0);
    // Archers that actually loosed carry the published transient into real playback.
    const playback = timeline.sample(released);
    const loosing = Array.from(field(publish(released, buffer), "loosing", Float32Array));
    expect(loosing.some((ttl) => ttl > 0)).toBe(true);
    loosing.forEach((ttl, soldier) => {
      if (ttl > 0) expect(playback[soldier].base.destination.clip).toBe("bow_release");
    });
  } finally {
    game.free();
  }
});

test("published transitions decode exactly; only an unchanged held publication is reused", () => {
  const game = new Game(37);
  const run = { game, memory: wasm.memory };
  const { publication, live, published, publish } = consumer(run);
  const buffer = new ArrayBuffer(CAPACITY);
  try {
    game.spawn_class(0, 0, 0, 1, 1, 3, 0);
    const specs = live.classSpecs[3].weapons;
    const hedge = specs.findIndex((weapon) => weapon.braced);
    const sidearm = specs.findIndex((weapon) => !weapon.braced);
    // Controlled WASM boundary samples, as in the existing adapter tests: these pin the
    // published decode of branches the approach window never reaches on its own.
    const weapons = new Uint8Array(wasm.memory.buffer, game.cur_weapon_ptr(), 1);
    const posture = new Uint8Array(wasm.memory.buffer, game.posture_ptr(), 1);
    const fighting = new Uint8Array(wasm.memory.buffer, game.fighting_ptr(), 1);
    const releases = new Float32Array(wasm.memory.buffer, game.loosing_ptr(), 1);
    const info = new Float32Array(
      wasm.memory.buffer,
      game.unit_info_ptr(),
      game.unit_info_stride(),
    );
    weapons[0] = hedge;
    posture[0] = 4;
    info[UNIT_INFO.atEase] = 0;

    publish(0, buffer);
    const braced = published.read(0).observations[0];
    expect(braced).toEqual(live.read(0).observations[0]);
    expect(braced).toMatchObject({ pikeReady: true, guardedFacing: true, incapacitated: false });
    expect(APPEARANCE_DESCRIPTORS[braced.appearanceId].selection).toEqual({
      unitClass: 3,
      state: "primary",
    });

    weapons[0] = sidearm;
    posture[0] = 5;
    fighting[0] = 1;
    releases[0] = 0.5;
    publish(1, buffer);
    const switched = published.read(1);
    expect(switched.observations[0]).toEqual(live.read(1).observations[0]);
    expect(switched.observations[0]).toMatchObject({
      pikeReady: false,
      fighting: true,
      incapacitated: true,
      guardedFacing: false,
      releaseTtl: 0.5,
      releaseAgeSeconds: game.loosing_duration() - 0.5,
    });
    expect(APPEARANCE_DESCRIPTORS[switched.observations[0].appearanceId].selection).toEqual({
      unitClass: 3,
      state: "sidearm",
    });

    // An unchanged tick reuses the derived observations, including across a republication.
    expect(published.read(1).observations).toBe(switched.observations);
    publish(1, buffer);
    expect(published.read(1).observations).toBe(switched.observations);
    expect(published.read(0).observations).not.toBe(switched.observations);

    // Returning the credit ends consumer ownership: the source retains nothing, and the
    // last presentation survives because the adapter copied it out of the buffer.
    const retained = structuredClone(switched.observations);
    publish(1, buffer);
    const last = published.read(1);
    const returned = publication.release();
    expect(() => published.read(2)).toThrow(/publication buffer was returned/);
    const credit = structuredClone(returned, { transfer: [returned] });
    expect(returned.byteLength).toBe(0);
    expect(credit.byteLength).toBe(CAPACITY);
    expect(last.observations).toEqual(retained);
    expect(Array.from(last.facings)).toEqual(Array.from(live.read(1).facings));

    // The producer reuses the credited buffer and the consumer recovers.
    publication.adopt(snapshot(run, 2, credit));
    expect(published.read(2).observations).toEqual(live.read(2).observations);

    // Reuse follows the count of the publication actually held, not the observations
    // already derived: a shorter publication of the same tick shrinks the presentation.
    const shorter = snapshot(run, 2, new ArrayBuffer(CAPACITY));
    game.spawn_class(4, 0, 0, 1, 1, 3, 0);
    publication.adopt(snapshot(run, 2, new ArrayBuffer(CAPACITY)));
    expect(published.read(2).observations).toHaveLength(2);
    publication.adopt(shorter);
    const shrunk = published.read(2);
    expect(shrunk.observations).toHaveLength(1);
    expect(shrunk.facings).toHaveLength(1);

    // Returning the credit ends ownership for the tick just read too: the consumer fails
    // explicitly instead of answering that tick from what it derived while it held one.
    publication.release();
    expect(() => published.read(2)).toThrow(/publication buffer was returned/);
  } finally {
    game.free();
  }
});
