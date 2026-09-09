// @vitest-environment node
import { readFile } from "node:fs/promises";
import { beforeAll, expect, test } from "vitest";
import initWasm, { Game } from "../src/wasm/game_wasm.js";
import { createBattleViews } from "../src/battle/battleViews";
import type { ClassSpec } from "../src/battle/classData";

let wasm: Awaited<ReturnType<typeof initWasm>>;
beforeAll(async () => {
  wasm = await initWasm({
    module_or_path: await readFile(new URL("../src/wasm/game_wasm_bg.wasm", import.meta.url)),
  });
});

test("fresh battle views follow soldier growth and detached WASM memory", () => {
  const game = new Game(23);
  try {
    game.spawn_unit(10, 20, 0.5, 1, 1, 1, 1, 0, 0.5);
    const views = createBattleViews(game, wasm.memory);
    const initialHealth = views.health()[0];
    game.spawn_unit(30, 40, 1.5, 129, 1, 1, 1, 1, 0.5);
    expect(Array.from(views.health())).toEqual(Array(130).fill(initialHealth));
    expect(Array.from(views.mountHealth())).toEqual(Array(130).fill(0));
    const prior = Object.values(views).map((read) => read());
    const values = prior.map((view) => Array.from(view));
    wasm.memory.grow(1);
    for (const view of prior) expect(view.byteLength).toBe(0);
    Object.values(views).forEach((read, index) => {
      const current = read();
      expect(current.buffer === wasm.memory.buffer, "fresh view must share WASM memory").toBe(true);
      expect(Array.from(current)).toEqual(values[index]);
    });
    game.spawn_unit(50, 60, 2.5, 1, 1, 1, 1, 0, 0.5);
    expect(views.health()[130]).toBe(initialHealth);
    expect(views.mountHealth()[130]).toBe(0);
    expect(views.positions().length).toBe(262);
    expect(views.facings()[130]).toBe(2.5);
  } finally {
    game.free();
  }
});

test("a replacement battle starts fresh views when soldier IDs are reused", () => {
  const first = new Game(31);
  const classes: ClassSpec[] = JSON.parse(first.class_specs());
  const mounted = classes.find((spec) => spec.mounted)!;
  const foot = classes.find((spec) => !spec.mounted)!;
  try {
    first.spawn_class(0, 0, 0, 1, 1, mounted.id, 0);
    expect(createBattleViews(first, wasm.memory).mountHealth()[0]).toBe(
      Math.fround(mounted.mountHealth),
    );
  } finally {
    first.free();
  }
  const replacement = new Game(31);
  try {
    const views = createBattleViews(replacement, wasm.memory);
    expect(Array.from(views.health())).toEqual([]);
    expect(Array.from(views.mountHealth())).toEqual([]);
    replacement.spawn_class(0, 0, 0, 1, 1, foot.id, 0);
    expect(Array.from(views.health())).toEqual([Math.fround(foot.health)]);
    expect(Array.from(views.mountHealth())).toEqual([0]);
  } finally {
    replacement.free();
  }
});

test("battle views expose live rider and mount pools without copying", () => {
  const game = new Game(17);
  try {
    const classes: ClassSpec[] = JSON.parse(game.class_specs());
    const foot = classes.find((spec) => !spec.mounted)!;
    const mounted = classes.find((spec) => spec.mounted)!;
    // More than a lone survivor per side avoids the automatic tiny-unit rout.
    game.spawn_class(-2, 0, 0, 16, 4, foot.id, 0);
    game.spawn_class(2, 0, Math.PI, 16, 4, mounted.id, 1);
    game.set_attack_order(0, 1);
    game.set_attack_order(1, 0);
    const views = createBattleViews(game, wasm.memory);
    const health = views.health();
    const mounts = views.mountHealth();
    expect(Array.from(health)).toEqual([
      ...Array(16).fill(Math.fround(foot.health)),
      ...Array(16).fill(Math.fround(mounted.health)),
    ]);
    expect(Array.from(mounts)).toEqual([
      ...Array(16).fill(0),
      ...Array(16).fill(Math.fround(mounted.mountHealth)),
    ]);
    expect(health.buffer === wasm.memory.buffer, "health must share WASM memory").toBe(true);
    expect(mounts.buffer === wasm.memory.buffer, "mount health must share WASM memory").toBe(true);
    expect(health.byteOffset).toBe(game.health_ptr());
    expect(mounts.byteOffset).toBe(game.mount_health_ptr());
    const total = () =>
      views.health().reduce((sum, value) => sum + value, 0) +
      views.mountHealth().reduce((sum, value) => sum + value, 0);
    const before = total();
    for (let tick = 0; tick < 600; tick++) {
      game.tick();
      if (total() < before) break;
    }
    // Actual combat establishes a changed value, not a JS write into the view.
    expect(total()).toBeLessThan(before);
  } finally {
    game.free();
  }
});
