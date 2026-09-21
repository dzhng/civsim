// @vitest-environment node
import { expect, test } from "vitest";
import { battleDebugBlockTriangles } from "@packages/game-renderer/src/battle/debugBlockData";
import { presentationRenderer } from "./support/battleRendererPresentation";
import { captureBattleRenderCamera } from "../src/battle/battlePresentation";

const camera = () =>
  captureBattleRenderCamera({
    zoom: 2,
    zoomT: 0.5,
    viewCenter: () => [0, 0],
    params: () => ({
      target: [0, 0, 0],
      distance: 100,
      yaw: 0,
      pitch: 0.7,
      fovY: 1,
      aspect: 1.5,
      near: 1,
    }),
  });

/** float32 storage, so compare the geometry at a resolution the view cares about. */
const round = (v: number) => Math.round(v * 1e4) / 1e4;
/** Two triangles, six floats a vertex: x, y, r, g, b, a. */
const VERTEX = 6;
const RECTANGLE = 6 * VERTEX;

function blocks(verts: Float32Array) {
  expect(verts.length % RECTANGLE).toBe(0);
  const out: { x: [number, number]; y: [number, number]; color: number[] }[] = [];
  for (let b = 0; b < verts.length / RECTANGLE; b++) {
    const xs: number[] = [],
      ys: number[] = [];
    for (let v = 0; v < 6; v++) {
      const o = b * RECTANGLE + v * VERTEX;
      xs.push(round(verts[o]));
      ys.push(round(verts[o + 1]));
    }
    out.push({
      x: [Math.min(...xs), Math.max(...xs)],
      y: [Math.min(...ys), Math.max(...ys)],
      color: [...verts.subarray(b * RECTANGLE + 2, b * RECTANGLE + 6)].map(round),
    });
  }
  return out;
}

test("a block spans only the unit's living bodies, padded on every side", () => {
  // Four soldiers of one unit in a line; the outermost one is dead.
  const verts = battleDebugBlockTriangles({
    positions: new Float32Array([0, 0, 10, 4, 20, 8, 100, 100]),
    alive: new Float32Array([1, 1, 1, 0]),
    count: 4,
    soldierUnit: new Uint32Array([0, 0, 0, 0]),
    unitTeam: [0],
  });
  expect(blocks(verts)).toEqual([
    { x: [-2.4, 22.4], y: [-2.4, 10.4], color: [0.18, 0.44, 1, 0.88] },
  ]);
});

test("a unit with no living bodies contributes no block at all", () => {
  const verts = battleDebugBlockTriangles({
    positions: new Float32Array([0, 0, 5, 5]),
    alive: new Float32Array([0, 0.5]),
    count: 2,
    soldierUnit: new Uint32Array([0, 1]),
    unitTeam: [0, 1],
  });
  expect(verts).toHaveLength(0);
});

test("each unit gets its own block and team one is the only red side", () => {
  // Units 0 and 2 interleave in space; blocks must follow the association, not proximity.
  const verts = battleDebugBlockTriangles({
    positions: new Float32Array([0, 0, 1, 1, 30, 30, 31, 31]),
    alive: new Float32Array([1, 1, 1, 1]),
    count: 4,
    soldierUnit: new Uint32Array([0, 2, 0, 2]),
    unitTeam: [1, 0, 3],
  });
  expect(blocks(verts)).toEqual([
    { x: [-2.4, 32.4], y: [-2.4, 32.4], color: [0.88, 0.2, 0.16, 0.88] },
    { x: [-1.4, 33.4], y: [-1.4, 33.4], color: [0.18, 0.44, 1, 0.88] },
  ]);
});

test("soldiers beyond the live count never widen a block", () => {
  const full = new Float32Array([0, 0, 50, 50]);
  const verts = battleDebugBlockTriangles({
    positions: full,
    alive: new Float32Array([1, 1]),
    count: 1,
    soldierUnit: new Uint32Array([0, 0]),
    unitTeam: [0],
  });
  expect(blocks(verts)[0]).toMatchObject({ x: [-2.4, 2.4], y: [-2.4, 2.4] });
});

test("the renderer presents blocks from the association it was handed", async () => {
  const { renderer, debugBlocks } = presentationRenderer();
  Object.assign(renderer, { blockMode: true });
  renderer.setStatic(new Uint32Array([0, 1]), [1, 0], [0, 0]);
  await renderer.present({
    camera: camera(),
    timeSeconds: 1,
    clock: "wall",
    fixedTime: null,
    preserveFrozenEffects: false,
    tacticalLines: {
      groundCues: new Float32Array(),
      rings: new Float32Array(),
      effects: new Float32Array(),
    },
    crowd: {
      positions: new Float32Array([0, 0, 40, 40]),
      facings: new Float32Array([0, 0]),
      playback: [0, 1].map(() => ({
        appearanceId: 0,
        base: {
          source: { kind: "clip" as const, sample: { clip: "idle", phase: 0 } },
          destination: { clip: "idle", phase: 0 },
          weight: 1,
        },
      })),
      alive: new Float32Array([1, 0]),
      count: 2,
      observationTick: 7,
      frameDt: 0,
      standards: [],
      readouts: [],
      triangles: new Float32Array(),
    },
  });
  // Only the living team-one soldier, so one red rectangle around it.
  expect(debugBlocks).toHaveLength(1);
  expect(blocks(debugBlocks[0])).toEqual([
    { x: [-2.4, 2.4], y: [-2.4, 2.4], color: [0.88, 0.2, 0.16, 0.88] },
  ]);
});
