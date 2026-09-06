// @vitest-environment node
import { readFile } from "node:fs/promises";
import { beforeAll, expect, test } from "vitest";
import initWasm, { Game } from "../src/wasm/game_wasm.js";
import { BattleActionAdapter } from "../src/battle/battleActionAdapter";
import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import { APPEARANCE_DESCRIPTORS } from "@packages/soldier-assets/src/appearance";
import { ACTION_TICK_SECONDS } from "@packages/crowd-runtime/src/actionTimeline";
import { BattleCrowd } from "../src/battle/battleCrowd";
import { createBattleViews } from "../src/battle/battleViews";
import type { BattleWorld } from "../src/battle/battleWorld";
import type { BattleUnitPresentation } from "../src/battle/battleUnitPresentation";
import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";

let wasm: Awaited<ReturnType<typeof initWasm>>;
beforeAll(async () => {
  wasm = await initWasm({
    module_or_path: await readFile(new URL("../src/wasm/game_wasm_bg.wasm", import.meta.url)),
  });
});

test("production crowd preserves smoothed positions across append and resets playback on catalog replacement", async () => {
  const url = new URL(
    "../public/assets/soldiers/appearances/heavy-sword/appearance.json",
    import.meta.url,
  );
  const read = async (path: URL) => JSON.parse(await readFile(path, "utf8"));
  const manifest = await read(url);
  const bundle = {
    manifest,
    rig: await read(new URL(manifest.skeleton, url)),
    animation: await read(new URL(manifest.animation, url)),
  } as AppearanceBundle;
  const game = new Game(47);
  try {
    game.spawn_class(0, 0, 0, 1, 1, 0, 0);
    const views = createBattleViews(game, wasm.memory);
    const submitted: { positions: number[]; phase: number }[] = [];
    const renderer = {
      soldierAssets: { 0: bundle },
      draw: (...args: Parameters<BattleWorld["renderer"]["draw"]>) =>
        submitted.push({
          positions: Array.from(args[0]),
          phase: args[2][0].base.destination.phase,
        }),
    };
    const world = {
      game,
      memory: wasm.memory,
      ...views,
      renderer,
      camera: { zoom: 0 },
    } as unknown as BattleWorld;
    const presentation = {
      beginFrame() {},
      addSoldier() {},
      finishFrame() {},
      update() {},
    } as unknown as BattleUnitPresentation;
    const crowd = new BattleCrowd(world, presentation);
    crowd.draw(0, false, 0, 0, []);
    const initialX = views.positions()[0];
    views.positions()[0] += 1;
    crowd.draw(1, false, 0, 0, []);
    expect(submitted.at(-1)!.positions[0]).toBeCloseTo(initialX + 0.75);
    game.spawn_class(4, 0, 0, 1, 1, 0, 0);
    crowd.draw(1, false, 0, 0, []);
    expect(submitted.at(-1)!.positions[0]).toBeCloseTo(initialX + 0.75);
    expect(submitted.at(-1)!.positions.slice(2)).toEqual(Array.from(views.positions().slice(2)));
    crowd.draw(2, false, 0, 0, []);
    expect(submitted.at(-1)!.positions[0]).toBeCloseTo(initialX + 0.82);
    crowd.draw(3, false, 0, 0, []);
    expect(submitted.at(-1)!.phase).toBeGreaterThan(0);
    renderer.soldierAssets = { 0: bundle };
    crowd.draw(3, false, 0, 0, []);
    expect(submitted.at(-1)!.phase).toBe(0);
    crowd.draw(0, false, 0, 0, []);
    expect(submitted.at(-1)!.positions).toEqual(Array.from(views.positions()));
  } finally {
    game.free();
  }
});

test("observation histories survive append and memory growth, but reset on rewind or explicit identity reset", () => {
  const game = new Game(41);
  try {
    game.spawn_class(0, 0, 0, 1, 1, 0, 0);
    const adapter = new BattleActionAdapter(game, wasm.memory);
    const initial = adapter.read(10).observations[0];
    const positions = () =>
      new Float32Array(wasm.memory.buffer, game.positions_ptr(), game.soldier_count() * 2);
    positions()[0] += 0.1;
    const moved = adapter.read(11).observations[0];
    expect(moved.speedMps).toBeCloseTo(0.1 / ACTION_TICK_SECONDS, 5);
    expect(moved.health).toBe(initial.health);
    expect(adapter.read(11).observations[0]).toBe(moved);
    game.spawn_class(4, 0, 0, 1, 1, 0, 0);
    const appended = adapter.read(11).observations;
    expect(appended).toHaveLength(2);
    expect(appended[0]).toBe(moved);
    expect(appended[1].speedMps).toBe(0);
    wasm.memory.grow(1);
    positions()[0] += 0.2;
    const grown = adapter.read(13).observations;
    expect(grown[0].speedMps).toBeCloseTo(0.2 / (2 * ACTION_TICK_SECONDS), 5);
    expect(grown[1].speedMps).toBe(0);
    expect(adapter.read(0).observations.every((observation) => observation.speedMps === 0)).toBe(
      true,
    );
    positions()[0] += 20;
    adapter.reset();
    expect(adapter.read(0).observations[0].speedMps).toBe(0);
  } finally {
    game.free();
  }
});

test("health does not replace alive authority, and fighting or switch cooldown is not an injury observation", () => {
  const game = new Game(43);
  try {
    game.spawn_class(0, 0, 0, 1, 1, 6, 0);
    const adapter = new BattleActionAdapter(game, wasm.memory);
    const first = adapter.read(0).observations[0];
    new Uint8Array(wasm.memory.buffer, game.fighting_ptr(), 1)[0] = 1;
    new Float32Array(wasm.memory.buffer, game.switch_cd_ptr(), 1)[0] = 0.4;
    const contact = adapter.read(1).observations[0];
    expect(contact.health).toBe(first.health);
    expect(contact.mountHealth).toBe(first.mountHealth);
    expect(contact.alive).toBe(true);
    new Float32Array(wasm.memory.buffer, game.mount_health_ptr(), 1)[0] -= 0.25;
    new Float32Array(wasm.memory.buffer, game.health_ptr(), 1)[0] = 0;
    const injured = adapter.read(2).observations[0];
    expect(injured.mountHealth).toBeCloseTo(first.mountHealth - 0.25);
    expect(injured.alive).toBe(true);
    new Uint8Array(wasm.memory.buffer, game.alive_ptr(), 1)[0] = 0;
    expect(adapter.read(3).observations[0].alive).toBe(false);
  } finally {
    game.free();
  }
});

test("battle observations preserve real injury/release signals while selecting held weapon appearances", () => {
  const game = new Game(37);
  try {
    game.spawn_class(0, 0, 0, 1, 1, 3, 0);
    const adapter = new BattleActionAdapter(game, wasm.memory);
    const hedge = adapter.classSpecs[3].weapons.findIndex((weapon) => weapon.braced);
    const weapons = new Uint8Array(wasm.memory.buffer, game.cur_weapon_ptr(), 1);
    const info = new Float32Array(
      wasm.memory.buffer,
      game.unit_info_ptr(),
      game.unit_info_stride(),
    );
    const health = new Float32Array(wasm.memory.buffer, game.health_ptr(), 1);
    const releases = new Float32Array(wasm.memory.buffer, game.loosing_ptr(), 1);
    const fighting = new Uint8Array(wasm.memory.buffer, game.fighting_ptr(), 1);
    weapons[0] = hedge;
    info[UNIT_INFO.atEase] = 0;
    const first = adapter.read(0).observations[0];
    expect(first.pikeReady).toBe(true);
    expect(first.health).toBe(health[0]);
    // Controlled WASM boundary samples, not invented controller hit events.
    health[0] -= 0.25;
    releases[0] = 0.5;
    fighting[0] = 1;
    weapons[0] = adapter.classSpecs[3].weapons.findIndex((weapon) => !weapon.braced);
    const next = adapter.read(1).observations[0];
    expect(next.health).toBe(health[0]);
    expect(next.releaseTtl).toBe(0.5);
    expect(next.releaseAgeSeconds).toBe(game.loosing_duration() - 0.5);
    expect(first.releaseAgeSeconds).toBe(0);
    expect(next.fighting).toBe(true);
    expect(next.pikeReady).toBe(false);
    expect(APPEARANCE_DESCRIPTORS[next.appearanceId].selection).toEqual({
      unitClass: 3,
      state: "sidearm",
    });
    expect(adapter.read(1).observations[0]).toEqual(next);
  } finally {
    game.free();
  }
});
