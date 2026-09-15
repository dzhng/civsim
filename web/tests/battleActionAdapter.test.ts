import type { BattleRenderer } from "../src/battle/renderer";
// @vitest-environment node
import { readFile } from "node:fs/promises";
import { beforeAll, expect, test } from "vitest";
import initWasm, { Game } from "../src/wasm/game_wasm.js";
import { BattleActionAdapter } from "../src/battle/battleActionAdapter";
import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import { APPEARANCE_DESCRIPTORS } from "@packages/soldier-assets/src/appearance";
import {
  ACTION_TICK_SECONDS,
  ActionTimeline,
  evaluatePlaybackPose,
} from "@packages/crowd-runtime/src/actionTimeline";
import { sampleRigLocalPose } from "@packages/soldier-assets/src/localPose";
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

async function diagnosticGuardedBundle(appearanceId: number) {
  const url = new URL(
    `../public/assets/soldiers/fixtures/placeholder-soldiers/appearances/${APPEARANCE_DESCRIPTORS[appearanceId].name}/appearance.json`,
    import.meta.url,
  );
  const read = async (path: URL) => JSON.parse(await readFile(path, "utf8"));
  const manifest = await read(url);
  const bundle = {
    manifest,
    rig: await read(new URL(manifest.skeleton, url)),
    animation: await read(new URL(manifest.animation, url)),
  } as AppearanceBundle;
  // Distinguishable block-fixture motion, not a detailed appearance admission.
  const run = bundle.animation.clips.find(
    (clip) => clip.name === manifest.presentation.actions.run.clip,
  )!;
  const guarded = { ...structuredClone(run), name: "diagnostic-backward", strideMeters: 1 };
  bundle.animation.clips.push(guarded);
  bundle.rig.clips.push({
    ...structuredClone(bundle.rig.clips.find((clip) => clip.name === run.name)!),
    name: guarded.name,
  });
  Object.assign(bundle.manifest.presentation!.actions, {
    guardedBackwardWalk: { clip: guarded.name, layer: "fullBody" },
    guardedLeftWalk: null,
    guardedRightWalk: null,
  });
  return bundle;
}

test("targetless Disengage selects protected travel only when the actual engine is not at ease", async () => {
  for (const [unitClass, evade] of [
    [0, false],
    [3, false],
    [5, true],
  ] as const)
    for (const enemyX of [80, 30]) {
      const game = new Game(59);
      try {
        game.spawn_class(0, 0, 0, 10, 5, unitClass, 0);
        game.spawn_class(enemyX, 0, Math.PI, 10, 5, 0, 1);
        if (evade) game.set_move_order(0, -30, 0);
        else game.set_disengage_order(0, -30, 0);
        const adapter = new BattleActionAdapter(game, wasm.memory);
        const first = adapter.read(0).observations[0];
        game.tick();
        const observation = adapter.read(1).observations[0];
        expect(observation).toMatchObject({
          atEase: enemyX === 80,
          guardedFacing: true,
          routing: false,
          incapacitated: false,
          fighting: false,
        });
        expect(observation.forwardMps).toBeLessThan(-Math.abs(observation.lateralMps));
        if (unitClass === 3) {
          expect(observation.pikeReady).toBe(true);
          expect(APPEARANCE_DESCRIPTORS[observation.appearanceId].selection.state).toBe(
            enemyX === 80 ? "atEase" : "primary",
          );
          const views = createBattleViews(game, wasm.memory);
          const facing = views.unitInfo()[UNIT_INFO.facing];
          const travel = views.motorTravel();
          expect(observation.forwardMps).toBeCloseTo(
            (travel[0] * Math.cos(facing) + travel[1] * Math.sin(facing)) / ACTION_TICK_SECONDS,
            10,
          );
        }
        const bundle = await diagnosticGuardedBundle(observation.appearanceId);
        const timeline = new ActionTimeline({
          [first.appearanceId]: await diagnosticGuardedBundle(first.appearanceId),
          [observation.appearanceId]: bundle,
        });
        timeline.update(0, [first]);
        timeline.update(1, [observation]);
        const playback = timeline.sample(10)[0];
        const ordinaryBundle = structuredClone(bundle);
        ordinaryBundle.manifest.presentation!.actions.guardedBackwardWalk = null;
        const ordinary = new ActionTimeline({ [observation.appearanceId]: ordinaryBundle });
        ordinary.update(1, [observation]);
        const expected =
          enemyX === 30 ? "diagnostic-backward" : ordinary.sample()[0].base.destination.clip;
        expect(playback.base.destination.clip).toBe(expected);
        expect(Array.from(evaluatePlaybackPose(bundle, playback))).toEqual(
          Array.from(sampleRigLocalPose(bundle.rig, expected, playback.base.destination.phase)),
        );
      } finally {
        game.free();
      }
    }
});

test("production crowd submits distance-driven poses despite contrary ordered pace", async () => {
  const url = new URL(
    "../public/assets/soldiers/fixtures/placeholder-soldiers/appearances/heavy-sword/appearance.json",
    import.meta.url,
  );
  const read = async (path: URL) => JSON.parse(await readFile(path, "utf8"));
  const manifest = await read(url);
  const bundle = {
    manifest,
    rig: await read(new URL(manifest.skeleton, url)),
    animation: await read(new URL(manifest.animation, url)),
  } as AppearanceBundle;
  const game = new Game(52);
  try {
    game.spawn_class(0, 0, 0, 10, 5, 0, 0);
    game.set_move_order(0, 100, 0);
    game.advance_ticks(60);
    const views = createBattleViews(game, wasm.memory);
    const submitted: Parameters<BattleRenderer["draw"]>[2][] = [];
    const world = {
      game,
      memory: wasm.memory,
      ...views,
      camera: { zoom: 0 },
      renderer: {
        soldierAssets: { 0: bundle },
        draw: (...args: Parameters<BattleRenderer["draw"]>) => submitted.push(args[2]),
      },
    } as unknown as BattleWorld;
    const presentation = {
      beginFrame() {},
      addSoldier() {},
      finishFrame() {},
      build: () => ({ standards: [], readouts: [] }),
    } as unknown as BattleUnitPresentation;
    const crowd = new BattleCrowd(world, presentation);
    const draw = (...args: Parameters<BattleCrowd["prepare"]>) => {
      const f = crowd.prepare(...args)!;
      (world.renderer as unknown as Pick<BattleRenderer, "draw">).draw(
        f.positions,
        f.facings,
        f.playback,
        f.alive,
        f.count,
        world.camera,
        f.observationTick,
        f.frameDt,
      );
    };
    draw(60, true, 0, 0, []);
    let measuredDistance = 0;
    for (let tick = 61; tick <= 70; tick++) {
      const before = Array.from(views.positions().slice(0, 2));
      game.tick();
      measuredDistance += Math.hypot(
        views.positions()[0] - before[0],
        views.positions()[1] - before[1],
      );
      views.unitInfo()[UNIT_INFO.running] = 1; // Contrary exported order, not a gait authority.
      draw(tick, true, 0, 0, []);
    }
    const playback = submitted.at(-1)![0];
    const walk = bundle.animation.clips.find(
      (clip) => clip.name === manifest.presentation.actions.walk.clip,
    )!;
    expect(playback.base.destination.clip).toBe(walk.name);
    expect(playback.base.destination.phase).toBeCloseTo(measuredDistance / walk.strideMeters!, 12);
    expect(Array.from(evaluatePlaybackPose(bundle, playback))).toEqual(
      Array.from(sampleRigLocalPose(bundle.rig, walk.name, playback.base.destination.phase)),
    );
    const paused = structuredClone(playback);
    draw(70, true, 0, 0, []);
    expect(submitted.at(-1)![0]).toEqual(paused);
    // Unqualified endpoint transport cannot keep a gait moving. Root placement
    // still follows positions; this pass does not alter that separate owner.
    views.positions()[0] += 3;
    draw(71, true, 0, 0, []);
    expect(submitted.at(-1)![0].base.destination.clip).toBe(
      manifest.presentation.actions.atEase.clip,
    );
  } finally {
    game.free();
  }
});

test("production crowd preserves delayed positions across append and resets playback on catalog replacement", async () => {
  const url = new URL(
    "../public/assets/soldiers/fixtures/placeholder-soldiers/appearances/heavy-sword/appearance.json",
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
      draw: (...args: Parameters<BattleRenderer["draw"]>) =>
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
      build: () => ({ standards: [], readouts: [] }),
    } as unknown as BattleUnitPresentation;
    const crowd = new BattleCrowd(world, presentation);
    const draw = (...args: Parameters<BattleCrowd["prepare"]>) => {
      const f = crowd.prepare(...args)!;
      (world.renderer as unknown as Pick<BattleRenderer, "draw">).draw(
        f.positions,
        f.facings,
        f.playback,
        f.alive,
        f.count,
        world.camera,
        f.observationTick,
        f.frameDt,
      );
    };
    draw(0, false, 0, 0, []);
    const initialX = views.positions()[0];
    views.positions()[0] += 1;
    draw(1, false, 0, 0, []);
    expect(submitted.at(-1)!.positions[0]).toBe(initialX);
    game.spawn_class(4, 0, 0, 1, 1, 0, 0);
    draw(1, false, 0, 0, []);
    expect(submitted.at(-1)!.positions[0]).toBe(initialX);
    expect(submitted.at(-1)!.positions.slice(2)).toEqual(Array.from(views.positions().slice(2)));
    draw(2, false, 0, 0, []);
    expect(submitted.at(-1)!.positions[0]).toBeCloseTo(initialX + 1);
    draw(3, false, 0, 0, []);
    expect(submitted.at(-1)!.phase).toBeGreaterThan(0);
    renderer.soldierAssets = { 0: bundle };
    draw(3, false, 0, 0, []);
    expect(submitted.at(-1)!.phase).toBe(0);
    draw(0, false, 0, 0, []);
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
    const travel = createBattleViews(game, wasm.memory).motorTravel;
    travel().set([0.1, 0, 0.1]);
    const moved = adapter.read(11).observations[0];
    expect(moved.speedMps).toBeCloseTo(0.1 / ACTION_TICK_SECONDS, 5);
    expect(moved.forwardMps).toBeCloseTo(moved.speedMps, 5);
    expect(moved.lateralMps).toBe(0);
    expect(moved.health).toBe(initial.health);
    expect(adapter.read(11).observations[0]).toBe(moved);
    game.spawn_class(4, 0, 0, 1, 1, 0, 0);
    const appended = adapter.read(11).observations;
    expect(appended).toHaveLength(2);
    expect(appended[0]).toBe(moved);
    expect(appended[1].speedMps).toBe(0);
    expect(appended[1].forwardMps).toBe(0);
    expect(appended[1].lateralMps).toBe(0);
    wasm.memory.grow(1);
    travel().set([0.3, 0, 0.3]);
    const grown = adapter.read(13).observations;
    expect(grown[0].speedMps).toBeCloseTo(0.2 / (2 * ACTION_TICK_SECONDS), 5);
    expect(grown[0].forwardMps).toBeCloseTo(grown[0].speedMps, 5);
    expect(grown[1].speedMps).toBe(0);
    for (const observation of adapter.read(0).observations) {
      expect([observation.speedMps, observation.forwardMps, observation.lateralMps]).toEqual([
        0, 0, 0,
      ]);
    }
    travel().set([20.3, 0, 20.3]);
    adapter.reset();
    const reset = adapter.read(0).observations[0];
    expect([reset.speedMps, reset.forwardMps, reset.lateralMps]).toEqual([0, 0, 0]);
  } finally {
    game.free();
  }
});

test("motion retains forward and lateral signs in the presented facing basis", () => {
  const game = new Game(53);
  try {
    game.spawn_class(0, 0, 0, 1, 1, 0, 0);
    const views = createBattleViews(game, wasm.memory);
    const adapter = new BattleActionAdapter(game, wasm.memory);
    adapter.read(0);
    // Face +y: travel toward -y is backwards, while +x is to the right.
    views.facings()[0] = Math.PI / 2;
    views.motorTravel().set([3, -4, 5]);
    const motion = adapter.read(30).observations[0];
    expect(motion.forwardMps).toBeCloseTo(-4, 5);
    expect(motion.lateralMps).toBeCloseTo(3, 5);
    expect(motion.speedMps).toBe(5);
    views.facings()[0] = 0;
    views.motorTravel().set([3, -2, 7]);
    const sideways = adapter.read(60).observations[0];
    expect(sideways.forwardMps).toBe(0);
    expect(sideways.lateralMps).toBe(-2);
    expect(sideways.speedMps).toBe(2);
    // Opposing qualified steps can cancel direction without cancelling cadence.
    views.motorTravel()[2] += 4;
    const reversed = adapter.read(90).observations[0];
    expect(reversed.speedMps).toBe(4);
    expect([reversed.forwardMps, reversed.lateralMps]).toEqual([0, 0]);
  } finally {
    game.free();
  }
});

test("held pike motion uses the presented unit facing, returning to soldier facing for a sidearm", () => {
  const game = new Game(59);
  try {
    game.spawn_class(0, 0, 0, 1, 1, 3, 0);
    const adapter = new BattleActionAdapter(game, wasm.memory);
    const views = createBattleViews(game, wasm.memory);
    const weapons = new Uint8Array(wasm.memory.buffer, game.cur_weapon_ptr(), 1);
    weapons[0] = adapter.classSpecs[3].weapons.findIndex((weapon) => weapon.braced);
    views.facings()[0] = 0;
    views.unitInfo()[UNIT_INFO.facing] = Math.PI / 2;
    const posture = new Uint8Array(wasm.memory.buffer, game.posture_ptr(), 1);
    posture[0] = 4; // Unit retained-facing branch, but not soldier-facing branch.
    adapter.read(0);
    views.motorTravel().set([1, 0, 1]);
    const held = adapter.read(30);
    expect(held.facings[0]).toBeCloseTo(Math.PI / 2);
    expect(held.observations[0].forwardMps).toBeCloseTo(0, 5);
    expect(held.observations[0].lateralMps).toBeCloseTo(1, 5);
    expect(held.observations[0].guardedFacing).toBe(true);
    weapons[0] = adapter.classSpecs[3].weapons.findIndex((weapon) => !weapon.braced);
    views.motorTravel().set([2, 0, 2]);
    const sidearm = adapter.read(60);
    expect(sidearm.facings[0]).toBe(0);
    expect(sidearm.observations[0].forwardMps).toBe(1);
    expect(sidearm.observations[0].lateralMps).toBe(0);
    expect(sidearm.observations[0].guardedFacing).toBe(false);
    expect(views.facings()[0]).toBe(0);
  } finally {
    game.free();
  }
});

test("routing and incapacitation stay distinct from guarded facing and signed displacement", () => {
  const game = new Game(59);
  try {
    game.spawn_class(0, 0, 0, 1, 1, 0, 0);
    const adapter = new BattleActionAdapter(game, wasm.memory);
    const views = createBattleViews(game, wasm.memory);
    const posture = new Uint8Array(wasm.memory.buffer, game.posture_ptr(), 1);
    expect(adapter.read(0).observations[0]).toMatchObject({
      routing: false,
      incapacitated: false,
      guardedFacing: false,
    });
    posture[0] = 3;
    views.unitInfo()[UNIT_INFO.routing] = 1;
    views.motorTravel().set([-1, 0, 1]);
    const displaced = adapter.read(30).observations[0];
    expect(displaced).toMatchObject({
      forwardMps: -1,
      speedMps: 1,
      routing: true,
      incapacitated: true,
      guardedFacing: true,
    });
    expect(displaced.lateralMps).toBeCloseTo(0);
    // Flags are observations, not a fabricated mutually exclusive gameplay state.
    posture[0] = 0;
    views.unitInfo()[UNIT_INFO.routing] = 0;
    adapter.reset();
    expect(adapter.read(30).observations[0]).toMatchObject({
      forwardMps: 0,
      speedMps: 0,
      routing: false,
      incapacitated: false,
      guardedFacing: false,
    });
  } finally {
    game.free();
  }
});

test("engine targetless withdrawal reaches the real held-pike adapter without synthetic posture bits", () => {
  const game = new Game(59);
  try {
    // The real battle routes remnants of nine or fewer men; keep the smallest
    // non-remnant formations so this probes withdrawal, not rout.
    game.spawn_class(0, 0, 0, 10, 5, 3, 0);
    game.spawn_class(80, 0, Math.PI, 10, 5, 0, 1);
    const adapter = new BattleActionAdapter(game, wasm.memory);
    const views = createBattleViews(game, wasm.memory);
    expect(adapter.read(0).observations[0].guardedFacing).toBe(false);
    game.set_disengage_order(0, -30, 0);
    let withdrawal;
    for (let tick = 1; tick <= 120; tick++) {
      game.tick();
      const observation = adapter.read(tick).observations[0];
      if (views.unitInfo()[UNIT_INFO.mode] === 2 && observation.forwardMps < -0.01) {
        withdrawal = observation;
        break;
      }
    }
    expect(withdrawal).toMatchObject({
      alive: true,
      pikeReady: true,
      routing: false,
      incapacitated: false,
      guardedFacing: true,
    });
    expect(withdrawal!.forwardMps).toBeLessThan(0);
  } finally {
    game.free();
  }
});

test("actual routing ticks reach batched motor-travel observations in the displayed facing", async () => {
  const game = new Game(71);
  try {
    game.spawn_class(0, 0, 0, 1, 1, 0, 0);
    game.spawn_class(80, 0, Math.PI, 10, 5, 0, 1);
    const views = createBattleViews(game, wasm.memory);
    const adapter = new BattleActionAdapter(game, wasm.memory);
    game.advance_ticks(10);
    expect(adapter.read(10).observations[0].routing).toBe(true);
    let path = 0;
    const first = Array.from(views.positions().slice(0, 2));
    for (let tick = 11; tick <= 20; tick++) {
      const before = Array.from(views.positions().slice(0, 2));
      game.tick();
      path += Math.hypot(views.positions()[0] - before[0], views.positions()[1] - before[1]);
    }
    const { observations, facings } = adapter.read(20);
    const observation = observations[0];
    const dx = views.positions()[0] - first[0],
      dy = views.positions()[1] - first[1];
    const seconds = 10 * ACTION_TICK_SECONDS;
    expect(observation.routing).toBe(true);
    expect(observation.speedMps).toBeCloseTo(path / seconds, 12);
    expect(observation.forwardMps).toBeCloseTo(
      (dx * Math.cos(facings[0]) + dy * Math.sin(facings[0])) / seconds,
      12,
    );
    expect(observation.lateralMps).toBeCloseTo(
      (dx * Math.sin(facings[0]) - dy * Math.cos(facings[0])) / seconds,
      12,
    );
    const bundle = await diagnosticGuardedBundle(observation.appearanceId);
    const timeline = new ActionTimeline({ [observation.appearanceId]: bundle });
    timeline.update(20, [observation]);
    expect(timeline.sample()[0].base.destination.clip).not.toBe("diagnostic-backward");
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
