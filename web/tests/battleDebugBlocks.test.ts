// @vitest-environment node
import { expect, test, vi } from "vitest";
import { battleDebugBlockTriangles } from "@packages/game-renderer/src/battle/debugBlockData";
import { BattleRenderer } from "../src/battle/renderer";
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

test("the source renderer prepares blocks from the association it was handed", () => {
  const renderer = Object.create(BattleRenderer.prototype) as BattleRenderer;
  const uploads: Float32Array[] = [];
  const world = {
    setStatic: vi.fn(),
    setTime: vi.fn(),
    draw: vi.fn(),
    uploadDebugBlocks: (verts: Float32Array) => uploads.push(verts),
  };
  Object.assign(renderer, {
    world,
    blockMode: true,
    fixedTime: null,
    benchmarkSeconds: null,
    staticData: { soldierUnit: new Uint32Array(), teams: [], classes: [] },
  });
  renderer.setStatic(new Uint32Array([0, 1]), [1, 0], [0, 0]);
  expect(world.setStatic).toHaveBeenCalledOnce();
  renderer.draw(
    new Float32Array([0, 0, 40, 40]),
    new Float32Array([0, 0]),
    [],
    new Float32Array([1, 0]),
    2,
    camera(),
    7,
  );
  // Only the living team-one soldier, so one red rectangle around it.
  expect(uploads).toHaveLength(1);
  expect(blocks(uploads[0])).toEqual([
    { x: [-2.4, 2.4], y: [-2.4, 2.4], color: [0.88, 0.2, 0.16, 0.88] },
  ]);
});
