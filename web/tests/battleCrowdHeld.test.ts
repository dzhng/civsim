// @vitest-environment node
import { expect, test, vi } from "vitest";
import { evaluatePlaybackPose } from "@packages/crowd-runtime/src/actionTimeline";
import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";
import type { AppearancePresentation } from "@packages/soldier-assets/src/presentation";
import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import { BattleCrowd } from "../src/battle/battleCrowd";
import { BattleUnitPresentation } from "../src/battle/battleUnitPresentation";
import type { BattleObservationSource } from "../src/battle/battleViews";
import type { BattleWorld } from "../src/battle/battleWorld";

// One bone whose x translation reads back clip index + phase, so a pose value
// proves which clip and how far through it the body actually is.
const clips = [
  ["rest", 4, true],
  ["walk", 2, true],
  ["swing", 1.5, false],
  ["fall", 2, false],
] as const;
const actions = {
  ready: { clip: "rest", layer: "fullBody" },
  atEase: { clip: "rest", layer: "fullBody" },
  walk: { clip: "walk", layer: "fullBody" },
  run: { clip: "walk", layer: "fullBody" },
  melee: { clip: "swing", layer: "fullBody" },
  release: null,
  hit: { clip: "swing", layer: "fullBody" },
  death: { clip: "fall", layer: "fullBody" },
  pikeReady: null,
  guardedBackwardWalk: null,
  guardedLeftWalk: null,
  guardedRightWalk: null,
} satisfies AppearancePresentation["actions"];
const appearance = {
  manifest: { presentation: { actions, riderUpperBodyJoints: null } },
  animation: {
    clips: clips.map(([name, duration, loop]) => ({
      name,
      duration,
      loop,
      ...(name === "walk" ? { strideMeters: 2 } : {}),
    })),
  },
  rig: {
    bones: [
      {
        name: "spine",
        parent: -1,
        bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] },
        inverseBind: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      },
    ],
    clips: clips.map(([name, duration, loop], index) => ({
      name,
      duration,
      loop,
      tracks: { 0: { T: { times: [0, duration], values: [index, 0, 0, index + 1, 0, 0] } } },
    })),
  },
} as unknown as AppearanceBundle;

const STRIDE = Math.max(...Object.values(UNIT_INFO)) + 1;

/** The completed-tick records at the wasm boundary; everything above it is real. */
function fixture() {
  vi.stubGlobal("location", { search: "" });
  const soldiers = 2;
  const state = {
    tick: 0,
    positions: new Float32Array(soldiers * 2),
    motorTravel: new Float64Array(soldiers * 3),
    fighting: new Uint8Array(soldiers),
  };
  const unitInfo = new Float32Array(STRIDE);
  const units = new Uint32Array(soldiers);
  const weapons = new Uint8Array(soldiers);
  const source: BattleObservationSource = {
    metadata: {
      classSpecs: [{ weapons: [{ braced: false, charge: false }] }] as never,
      releaseDuration: 1,
    },
    soldiers: () => soldiers,
    raw: () => ({
      unitInfoStride: STRIDE,
      facings: new Float32Array(soldiers),
      motorTravel: state.motorTravel,
      health: new Float32Array(soldiers).fill(100),
      mountHealth: new Float32Array(soldiers),
      unitInfo,
      alive: new Uint8Array(soldiers).fill(1),
      posture: new Uint8Array(soldiers),
      fighting: state.fighting,
      releases: new Float32Array(soldiers),
      weapons,
      units,
    }),
  };
  const world = {
    sim: {
      observations: source,
      tick: () => state.tick,
      soldierUnits: () => units,
      weapons: () => weapons,
    },
    positions: () => state.positions,
    unitInfo: () => unitInfo,
    stride: STRIDE,
    renderer: { soldierAssets: { 0: appearance }, heightAt: () => 0, pxPerWorldAt: () => 80 },
    camera: { zoom: 2, yaw: 0 },
  } as unknown as BattleWorld;
  const crowd = new BattleCrowd(world, new BattleUnitPresentation(world));
  const complete = (tick: number) => {
    state.tick = tick;
    crowd.observeTick(tick);
  };
  return { state, crowd, complete };
}

/** Soldier 0 starts a one-shot swing at the held tick; soldier 1 is mid-walk. */
function heldAtContact() {
  const f = fixture();
  f.state.positions.set([0, 0, 10, 0]);
  f.complete(99);
  f.state.positions.set([0.5, 0, 10 + 1 / 30, 0]);
  f.state.motorTravel.set([0, 0, 0, 1 / 30, 0, 1 / 30]);
  f.state.fighting[0] = 1;
  f.complete(100);
  return f;
}

const boneX = (playback: NonNullable<ReturnType<BattleCrowd["prepareHeld"]>>["playback"][number]) =>
  evaluatePlaybackPose(appearance, playback)[0];

test("held presentation keeps bodies on the endpoint while actions keep playing", () => {
  const { crowd } = heldAtContact();
  const endpoint = [0.5, 0, 10 + 1 / 30, 0];
  const poses: number[][] = [];
  for (const elapsed of [0, 0.25, 0.5, 1]) {
    const frame = crowd.prepareHeld(elapsed, 1 / 60, [])!;
    // A later presentation time never moves a body past the completed tick.
    expect(Array.from(frame.positions)).toEqual(Array.from(new Float32Array(endpoint)));
    expect(frame.observationTick).toBe(100);
    poses.push(frame.playback.map(boneX));
  }
  // Swing phase follows the elapsed clock from the held tick (blend settles at 0.15 s).
  expect(poses[2][0]).toBeCloseTo(2 + 0.5 / 1.5, 9);
  expect(poses[3][0]).toBeCloseTo(2 + 1 / 1.5, 9);
  // The walk measured 1 m/s over the last tick and keeps cycling on its 2 m stride.
  expect(poses[3][1] - poses[1][1]).toBeCloseTo(0.75 * 0.5, 9);
  for (let index = 1; index < poses.length; index++)
    for (const soldier of [0, 1]) expect(poses[index][soldier]).not.toBe(poses[index - 1][soldier]);
});

test("held presentation replays one-shot actions instead of freezing them at their end", () => {
  const { crowd } = heldAtContact();
  const clamped = crowd.prepare(100 + 1.9 * 30, false, 0, [])!;
  // The ordinary sampler holds the finished swing (and walks bodies past the endpoint).
  expect(boneX(clamped.playback[0])).toBe(3);
  expect(clamped.positions[0]).not.toBe(0.5);
  // The longest one-shot in the catalog is the 2 s fall: the held interval replays then.
  const before = crowd.prepareHeld(1.9, 0, [])!;
  expect(boneX(before.playback[0])).toBe(3);
  const replayed = crowd.prepareHeld(2 + 0.5, 0, [])!;
  expect(boneX(replayed.playback[0])).toBeCloseTo(2 + 0.5 / 1.5, 9);
  expect(replayed.positions[0]).toBe(0.5);
});
