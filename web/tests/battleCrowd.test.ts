// @vitest-environment node
import { readFile } from "node:fs/promises";
import { beforeAll, expect, test, vi } from "vitest";
import initWasm, { Game } from "../src/wasm/game_wasm.js";
import { BattleCrowd } from "../src/battle/battleCrowd";
import { BattleUnitPresentation } from "../src/battle/battleUnitPresentation";
import { createBattleViews } from "../src/battle/battleViews";
import type { BattleWorld } from "../src/battle/battleWorld";
import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";
import { APPEARANCE_DESCRIPTORS } from "@packages/soldier-assets/src/appearance";
import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import { createBattleOrders } from "../src/battle/battleOrders";
import { SimClock } from "../src/shared/simClock";
import { BattleFreeze } from "../src/battle/battleFreeze";
import * as THREE from "three/webgpu";
import { buildCrowdInstances } from "@packages/crowd-runtime/src/instanceData";
import { planPhotorealCrowdLods } from "@packages/photoreal-renderer/src/battle/crowdLod";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { projectionFootprint } from "@packages/renderer-core/src/camera3d";

let wasm: Awaited<ReturnType<typeof initWasm>>;
let bundle: AppearanceBundle;
beforeAll(async () => {
  wasm = await initWasm({
    module_or_path: await readFile(new URL("../src/wasm/game_wasm_bg.wasm", import.meta.url)),
  });
  const url = new URL(
    "../public/assets/soldiers/fixtures/placeholder-soldiers/appearances/heavy-sword/appearance.json",
    import.meta.url,
  );
  const read = async (path: URL) => JSON.parse(await readFile(path, "utf8"));
  const manifest = await read(url);
  bundle = {
    manifest,
    rig: await read(new URL(manifest.skeleton, url)),
    animation: await read(new URL(manifest.animation, url)),
  } as AppearanceBundle;
  vi.stubGlobal("location", { search: "" });
});

function fixture(unitClass = 0) {
  const game = new Game(37);
  game.spawn_class(0, 0, 0, 1, 1, unitClass, 0);
  const views = createBattleViews(game, wasm.memory);
  views.positions().fill(0);
  views.unitInfo()[UNIT_INFO.atEase] = 1;
  const frames: Parameters<BattleWorld["renderer"]["draw"]>[] = [];
  const labels: Parameters<BattleWorld["renderer"]["setUnitReadouts"]>[] = [];
  const arcs: Float32Array[] = [];
  const renderer = {
    soldierAssets: { 0: bundle } as Record<number, AppearanceBundle>,
    draw: (...args: Parameters<BattleWorld["renderer"]["draw"]>) =>
      frames.push([
        new Float32Array(args[0]),
        new Float32Array(args[1]),
        structuredClone(args[2]),
        new Float32Array(args[3]),
        args[4],
        args[5],
        args[6],
        args[7],
      ]),
    setUnitReadouts: (...args: Parameters<BattleWorld["renderer"]["setUnitReadouts"]>) =>
      labels.push(structuredClone(args)),
    drawTris: (vertices: Float32Array) => arcs.push(new Float32Array(vertices)),
    heightAt: () => 0,
    pxPerWorldAt: () => 80,
  };
  const world = {
    game,
    memory: wasm.memory,
    cfg: { wasm },
    ...views,
    renderer,
    stride: game.unit_info_stride(),
    camera: { zoom: 2, yaw: 0 },
  } as unknown as BattleWorld;
  // Real adapter, timeline and attached standard owner; only the GPU edge records submissions.
  const crowd = new BattleCrowd(world, new BattleUnitPresentation(world));
  const draw = (tick: number, alpha = 0, frozen = false) => {
    crowd.draw(tick, frozen, alpha, 0, []);
    return frames.at(-1)!;
  };
  return { game, views, renderer, world, crowd, draw, frames, labels, arcs };
}

test("live crowd uses one completed batch for root and measured gait at fractional time", () => {
  const f = fixture();
  try {
    f.draw(0);
    f.views.positions()[0] = 4 / 30;
    f.views.motorTravel().set([4 / 30, 0, 4 / 30]);
    const frame = f.draw(4, 0.5);
    expect(frame[0][0]).toBeCloseTo(3.5 / 30, 7);
    const walk = bundle.animation.clips.find(
      (clip) => clip.name === bundle.manifest.presentation!.actions.walk!.clip,
    )!;
    expect(frame[2][0].base.destination.clip).toBe(walk.name);
    expect(frame[2][0].base.destination.phase).toBeCloseTo(3.5 / 30 / walk.strideMeters!, 12);
    expect(f.labels.at(-1)![0][0].x).toBe(frame[0][0]);
  } finally {
    f.game.free();
  }
});

test("attached standards, chips and attack arcs keep preceding life and weapon until the endpoint", () => {
  const f = fixture();
  try {
    f.world.camera.zoom = 3;
    f.world.camera.screenToWorld = (x) => (x === 0 ? [-100, 100] : [100, -100]);
    Object.assign(f.world, { canvas: { width: 800, height: 600 } });
    new Uint8Array(wasm.memory.buffer, f.game.fighting_ptr(), 1)[0] = 1;
    f.views.unitInfo()[UNIT_INFO.mode] = 1;
    f.draw(0);
    expect(f.arcs.at(-1)![0]).toBe(0);
    f.views.positions()[0] = 4;
    f.views.unitInfo()[UNIT_INFO.routing] = 1;
    f.views.unitInfo()[UNIT_INFO.alive] = 0;
    f.views.unitInfo()[UNIT_INFO.centerX] = 99;
    new Uint8Array(wasm.memory.buffer, f.game.alive_ptr(), 1)[0] = 0;
    new Uint8Array(wasm.memory.buffer, f.game.cur_weapon_ptr(), 1)[0] = 255;
    const delayed = f.draw(1, 0.25);
    expect(delayed[3][0]).toBe(1);
    expect(f.labels.at(-1)![0][0].x).toBe(1);
    expect(f.labels.at(-1)![1][0].chips.map((chip) => chip.text)).toContain("ATK");
    expect(f.labels.at(-1)![1][0].chips.map((chip) => chip.text)).not.toContain("ROUT");
    expect(f.arcs.at(-1)![0]).toBe(1);
    const endpoint = f.draw(1, 0.25, true);
    expect(endpoint[3][0]).toBe(0);
    expect(f.labels.at(-1)).toEqual([[], []]);
    expect(f.draw(1, 0.25)[2]).toEqual(delayed[2]);
    expect(f.labels.at(-1)![0][0].x).toBe(1);
  } finally {
    f.game.free();
  }
});

test("selection rings follow the presented body while destination cues stay authoritative", () => {
  const f = fixture();
  try {
    f.draw(0);
    f.views.positions()[0] = 4;
    f.draw(1, 0.25);
    const clock = new SimClock({ tickHz: 30, maxTicksPerFrame: 4 });
    const input = { selected: [0] } as Parameters<typeof createBattleOrders>[0]["input"];
    const orders = createBattleOrders({
      clock,
      freeze: new BattleFreeze(clock, f.world.renderer, () => {}),
      input,
      myUnits: (units) => units,
      unitCenter: () => [0, 0],
      unitInfo: f.views.unitInfo,
      unitSnap: () => {
        throw new Error("No drag in this fixture");
      },
      world: f.world,
    });
    f.views.unitInfo()[UNIT_INFO.hasTarget] = 1;
    f.views.unitInfo()[UNIT_INFO.targetX] = 20;
    f.views.unitInfo()[UNIT_INFO.targetY] = 0;
    const frame = orders.tacticalLineFrame(true, f.crowd.presented);
    expect(Array.from(frame.rings).filter((_, i) => i % 7 === 0)).toEqual([20, 1]);
    expect(Array.from(frame.groundCues)).toContain(20);
  } finally {
    f.game.free();
  }
});

test("real clock pause and freeze preserve the same delayed roots, facing and local pose", () => {
  const f = fixture();
  try {
    const clock = new SimClock({ tickHz: 30, maxTicksPerFrame: 4 });
    const freeze = new BattleFreeze(clock, f.world.renderer, () => {});
    clock.advance(0);
    f.views.facings()[0] = Math.PI - 0.1;
    f.draw(clock.tick, clock.alpha);
    expect(clock.advance(50)).toBe(1);
    f.views.positions()[0] = 1 / 30;
    f.views.motorTravel().set([1 / 30, 0, 1 / 30]);
    f.views.facings()[0] = -Math.PI + 0.1;
    const sample = () => f.draw(clock.tick, clock.alpha, clock.frozen).slice(0, 5);
    const delayed = sample();
    expect(f.frames.at(-1)![0][0]).toBeCloseTo(0.5 / 30, 7);
    expect(f.frames.at(-1)![1][0]).toBeCloseTo(Math.PI, 6);
    clock.paused = true;
    expect(clock.advance(1050)).toBe(0);
    expect(sample()).toEqual(delayed);
    freeze.doFreeze();
    const authoritative = sample();
    expect(f.frames.at(-1)![0][0]).toBeCloseTo(1 / 30, 7);
    expect(f.frames.at(-1)![1][0]).toBe(f.views.facings()[0]);
    expect(authoritative).not.toEqual(delayed);
    freeze.doFreeze(false);
    expect(clock.paused).toBe(true);
    expect(sample()).toEqual(delayed);
    // Same-tick caller mutation is not a newly observed endpoint.
    f.views.positions()[0] = 100;
    f.views.facings()[0] = 0;
    f.views.unitInfo()[UNIT_INFO.routing] = 1;
    expect(sample()).toEqual(delayed);
  } finally {
    f.game.free();
  }
});

test("a disabled left boundary transports the body without inventing gait before recovery", () => {
  const f = fixture();
  try {
    new Uint8Array(wasm.memory.buffer, f.game.posture_ptr(), 1)[0] = 1;
    const initial = f.draw(0);
    new Uint8Array(wasm.memory.buffer, f.game.posture_ptr(), 1)[0] = 0;
    f.views.positions()[0] = 4 / 30;
    f.views.motorTravel().set([4 / 30, 0, 4 / 30]);
    const delayed = f.draw(4, 0.5);
    expect(delayed[0][0]).toBeCloseTo(3.5 / 30, 7);
    expect(delayed[2][0].base.destination.clip).toBe(initial[2][0].base.destination.clip);
    const recovered = f.draw(4, 0.5, true)[2][0];
    expect(recovered.base.destination.clip).toBe(bundle.manifest.presentation!.actions.walk!.clip);
    expect(recovered.base.destination.phase).toBe(0);
    f.views.positions()[0] = 5 / 30;
    f.views.motorTravel().set([5 / 30, 0, 5 / 30]);
    new Uint8Array(wasm.memory.buffer, f.game.posture_ptr(), 1)[0] = 1;
    const interrupted = f.draw(5, 0.5);
    const walk = bundle.animation.clips.find(
      (clip) => clip.name === recovered.base.destination.clip,
    )!;
    expect(interrupted[2][0].base.destination.phase).toBeCloseTo(0.5 / 30 / walk.strideMeters!, 12);
    expect(f.draw(5, 0.5, true)[2][0].base.destination.phase).toBeCloseTo(
      1 / 30 / walk.strideMeters!,
      12,
    );
  } finally {
    f.game.free();
  }
});

test("append anchors only new soldiers while catalog replacement, rewind and shrink reset atomically", () => {
  const f = fixture();
  try {
    f.draw(0);
    f.views.positions()[0] = 4;
    const old = f.draw(1, 0.25);
    f.game.spawn_class(20, 0, 0, 1, 1, 0, 0);
    f.views.positions()[0] = 9;
    const appended = f.draw(1, 0.25);
    expect(appended[0][0]).toBe(old[0][0]);
    expect(appended[2][0]).toEqual(old[2][0]);
    expect(Array.from(appended[0].slice(2))).toEqual(Array.from(f.views.positions().slice(2)));
    expect(f.labels.at(-1)![0].map((standard) => standard.x)).toEqual([1, 20]);
    f.renderer.soldierAssets = { 0: structuredClone(bundle) };
    const replaced = f.draw(1, 0.25);
    expect(Array.from(replaced[0])).toEqual(Array.from(f.views.positions()));
    expect(replaced[2][0].base.destination.phase).toBe(0);
    f.views.positions()[0] = 12;
    const rewound = f.draw(0, 0.25);
    expect(rewound[0][0]).toBe(12);
    expect(rewound[2][0].base.destination.phase).toBe(0);
    const count = vi.spyOn(f.game, "soldier_count").mockReturnValue(1);
    try {
      f.views.positions()[0] = 15;
      const shrunk = f.draw(1, 0.25);
      expect(Array.from(shrunk[0])).toEqual([15, 0]);
      expect(shrunk[2][0].base.destination.phase).toBe(0);
      expect(f.labels.at(-1)![0].map((standard) => standard.unitId)).toEqual([0]);
    } finally {
      count.mockRestore();
    }
  } finally {
    f.game.free();
  }
});

test("production instance seating and visibility consume the delayed root, not the outside endpoint", () => {
  const f = fixture();
  try {
    f.draw(0);
    f.views.positions()[0] = 20;
    const frame = f.draw(1, 0.05);
    const build = (positions: Float32Array) =>
      buildCrowdInstances({
        positions,
        facings: frame[1],
        playback: frame[2],
        alive: frame[3],
        count: frame[4],
        terrainHeight: (x) => x * 0.1,
      }).instances;
    const camera = new THREE.PerspectiveCamera();
    applyCamera3d(camera, {
      target: [0, 0, 1],
      distance: 10,
      pitch: 1.2,
      yaw: 0,
      fovY: 0.85,
      aspect: 1.6,
      near: 1,
    });
    camera.updateMatrixWorld(true);
    const view = {
      frustum: new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
        camera.coordinateSystem,
        camera.reversedDepth,
      ),
      projection: projectionFootprint(
        camera.matrixWorldInverse.elements,
        camera.projectionMatrix.elements,
        800,
        camera.near,
      ),
      shadow: false,
    };
    const visible = build(frame[0]);
    expect(visible[0].x).toBe(1);
    expect(visible[0].elevation).toBe(0.1);
    expect(Array.from(planPhotorealCrowdLods(visible, [view], { 0: bundle }).visibility)).toEqual([
      1,
    ]);
    expect(
      Array.from(
        planPhotorealCrowdLods(build(f.views.positions()), [view], { 0: bundle }).visibility,
      ),
    ).toEqual([0]);
  } finally {
    f.game.free();
  }
});

test("a newly selected direction cannot retroactively change the preceding gait stride", () => {
  const f = fixture();
  try {
    const diagnostic = structuredClone(bundle);
    const actions = diagnostic.manifest.presentation!.actions;
    actions.guardedLeftWalk = actions.run;
    f.renderer.soldierAssets = { 0: diagnostic };
    f.views.unitInfo()[UNIT_INFO.atEase] = 0;
    new Uint8Array(wasm.memory.buffer, f.game.posture_ptr(), 1)[0] = 2;
    f.draw(0);
    f.views.positions()[0] = 1;
    f.views.motorTravel().set([1, 0, 1]);
    const forward = f.draw(30, 0, true)[2][0].base.destination;
    f.views.positions()[1] = 1;
    f.views.motorTravel().set([1, 1, 2]);
    const delayed = f.draw(60, 0.5);
    const walk = diagnostic.animation.clips.find((clip) => clip.name === actions.walk!.clip)!;
    const lateral = diagnostic.animation.clips.find((clip) => clip.name === actions.run!.clip)!;
    expect(walk.strideMeters).not.toBe(lateral.strideMeters);
    expect(delayed[0][1]).toBeCloseTo(29.5 / 30, 7);
    expect(delayed[2][0].base.destination.clip).toBe(walk.name);
    expect(delayed[2][0].base.destination.phase).toBeCloseTo(
      (forward.phase + 29.5 / 30 / walk.strideMeters!) % 1,
      12,
    );
    const endpoint = f.draw(60, 0.5, true)[2][0].base.destination;
    expect(endpoint.clip).toBe(lateral.name);
    expect(endpoint.phase).toBeCloseTo((forward.phase + 1 / walk.strideMeters!) % 1, 12);
    f.views.positions()[1] = 2;
    f.views.motorTravel().set([1, 2, 3]);
    expect(f.draw(90, 0.5)[2][0].base.destination.phase).toBeCloseTo(
      (endpoint.phase + 29.5 / 30 / lateral.strideMeters!) % 1,
      12,
    );
  } finally {
    f.game.free();
  }
});

test("equipment and death switch at the same endpoint as facing, root and attached metadata", async () => {
  const f = fixture(3);
  try {
    const catalog: Record<number, AppearanceBundle> = {};
    for (const [id, descriptor] of APPEARANCE_DESCRIPTORS.entries()) {
      if (descriptor.selection.unitClass !== 3) continue;
      const url = new URL(
        `../public/assets/soldiers/fixtures/placeholder-soldiers/appearances/${descriptor.name}/appearance.json`,
        import.meta.url,
      );
      const read = async (path: URL) => JSON.parse(await readFile(path, "utf8"));
      const manifest = await read(url);
      catalog[id] = {
        manifest,
        rig: await read(new URL(manifest.skeleton, url)),
        animation: await read(new URL(manifest.animation, url)),
      } as AppearanceBundle;
    }
    f.renderer.soldierAssets = catalog;
    const weapons = f.crowd.classSpecs[3].weapons;
    const hedge = weapons.findIndex((weapon) => weapon.braced);
    const sidearm = weapons.findIndex((weapon) => !weapon.braced);
    expect(hedge).toBeGreaterThanOrEqual(0);
    expect(sidearm).toBeGreaterThanOrEqual(0);
    f.views.unitInfo()[UNIT_INFO.atEase] = 0;
    new Uint8Array(wasm.memory.buffer, f.game.cur_weapon_ptr(), 1)[0] = hedge;
    const initial = f.draw(0);
    const oldAppearance = initial[2][0].appearanceId;
    f.views.positions()[0] = 4;
    f.views.facings()[0] = 1.2;
    new Uint8Array(wasm.memory.buffer, f.game.cur_weapon_ptr(), 1)[0] = sidearm;
    new Uint8Array(wasm.memory.buffer, f.game.alive_ptr(), 1)[0] = 0;
    f.views.unitInfo()[UNIT_INFO.alive] = 0;
    const delayed = f.draw(1, 0.25);
    expect(delayed[2][0].appearanceId).toBe(oldAppearance);
    expect(delayed[2][0].base.destination.clip).toBe(initial[2][0].base.destination.clip);
    expect(delayed[0][0]).toBe(1);
    expect(delayed[1][0]).toBeCloseTo(0.3, 6);
    expect(delayed[3][0]).toBe(1);
    expect(f.labels.at(-1)![0][0].x).toBe(1);
    const endpoint = f.draw(1, 0.25, true);
    const sidearmId = APPEARANCE_DESCRIPTORS.findIndex(
      (descriptor) =>
        descriptor.selection.unitClass === 3 && descriptor.selection.state === "sidearm",
    );
    expect(endpoint[2][0].appearanceId).toBe(sidearmId);
    expect(endpoint[2][0].base.destination.clip).toBe(
      catalog[sidearmId].manifest.presentation!.actions.death!.clip,
    );
    expect(endpoint[2][0].base.destination.phase).toBe(0);
    expect(endpoint[0][0]).toBe(4);
    expect(endpoint[1][0]).toBe(f.views.facings()[0]);
    expect(endpoint[3][0]).toBe(0);
    expect(f.labels.at(-1)).toEqual([[], []]);
    expect(f.draw(1, 0.25).slice(0, 5)).toEqual(delayed.slice(0, 5));
  } finally {
    f.game.free();
  }
});
