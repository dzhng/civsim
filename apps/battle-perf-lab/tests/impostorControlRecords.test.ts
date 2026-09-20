// @vitest-environment node
/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
// The numerical control's record gate. A backend that uploads a packed record is still
// held to exact equality with Three; a backend that derives the record on the GPU is held
// to the actual readback under bounds declared before the comparison, with every exact
// disagreement and every tile difference reported rather than absorbed.
import { expect, test } from "vitest";
import { compareControlRecords } from "../src/impostorControlBackend";
import {
  packImpostors,
  type ImpostorView,
} from "../../../packages/battle-renderer/src/impostorData";
import { hemiOctTileDirections } from "../../../packages/photoreal-renderer/src/battle/impostorTile";
import type { CrowdInstance } from "../../../packages/crowd-runtime/src/instanceData";
import type { ImpostorAtlasLayout } from "../../../packages/soldier-assets/src/impostorAtlas";
import type { ImpostorRecordControl } from "../src/impostorControlBackend";
import { F32_STEP } from "../candidates/typegpu/impostorRecordCases";

/** The 6x4 grid: no two of its cells are baked from the same direction, so every tile
 *  difference it can show is a real pick and not an interchangeable one. */
const ATLAS: ImpostorAtlasLayout = {
  columns: 6,
  rows: 4,
  tileSize: 256,
  center: [0.137, -0.241, 0.913],
  worldSpan: 1.7,
};
const VIEW: ImpostorView = { right: [1, 0, 0], up: [0, 0, 1], eye: [3.75, -10.5, 4.25], fovY: 0.8 };
const soldier = (overrides: Partial<CrowdInstance> = {}): CrowdInstance => ({
  x: 0,
  y: 0,
  facing: Math.PI / 2,
  classId: 0,
  faction: 0,
  alive: true,
  clip: "idle",
  phase: 0,
  seed: 0,
  mounted: false,
  lod: 0,
  ...overrides,
});
/** The derived half of the verdict, refused if the control reported a packed one. */
const derived = (control: ImpostorRecordControl) => {
  if (control.source !== "gpu-derived-readback") throw new Error("expected a derived verdict");
  return control;
};
const RECORD_FLOATS = 9;
const PACKED_STRIDE = 12;
/** Three's instance attributes for this fixture. The lab's own gate has always asserted
 *  that these are the packer's bytes exactly, so the packer stands in for them here. */
const threeFor = (source: readonly CrowdInstance[], view: ImpostorView) => {
  const packed = packImpostors(ATLAS, source, view);
  return (i: number) =>
    Array.from(packed.subarray(i * PACKED_STRIDE, i * PACKED_STRIDE + RECORD_FLOATS));
};
const derivedFrom = (source: readonly CrowdInstance[], view: ImpostorView) => {
  const three = threeFor(source, view);
  return source.map((_, i) => three(i));
};

test("a packed backend is still held to exact equality, with no tolerance at all", () => {
  const source = [soldier(), soldier({ x: 4, y: -2, facing: 1.1, faction: 1 })];
  const packed = packImpostors(ATLAS, source, VIEW);
  const equal = compareControlRecords(ATLAS, source, VIEW, threeFor(source, VIEW), {
    source: "uploaded-packed-record",
    packed,
    stride: PACKED_STRIDE,
  });
  expect(equal).toMatchObject({
    source: "uploaded-packed-record",
    packingEqual: true,
    passed: true,
    compared: source.length * RECORD_FLOATS,
    exact: source.length * RECORD_FLOATS,
  });
  // One f32 step on one anchor — inside every bound the derived gate declares — still fails.
  const nudged = packed.slice();
  nudged[0] += Math.abs(nudged[0]) * F32_STEP;
  const off = compareControlRecords(ATLAS, source, VIEW, threeFor(source, VIEW), {
    source: "uploaded-packed-record",
    packed: nudged,
    stride: PACKED_STRIDE,
  });
  expect(off).toMatchObject({ packingEqual: false, passed: false });
  expect(off.exact).toBe(source.length * RECORD_FLOATS - 1);
});

test("a derived backend passes on inexact records inside the declared bound and fails outside it", () => {
  const source = [soldier({ x: 2.5, y: -4, facing: 0.7, elevation: 0.5 })];
  const records = derivedFrom(source, VIEW);
  const shifted = (scale: number) => {
    const record = [...records[0]];
    record[0] += Math.abs(record[0]) * F32_STEP * scale;
    return [record];
  };
  const inside = derived(
    compareControlRecords(ATLAS, source, VIEW, threeFor(source, VIEW), {
      source: "gpu-derived-readback",
      records: shifted(4),
    }),
  );
  expect(inside.passed).toBe(true);
  expect(inside.faults).toEqual([]);
  // It passed, and it still says the record was not exact: the two are reported apart.
  expect(inside.exact).toBe(RECORD_FLOATS - 1);
  expect(inside.compared).toBe(RECORD_FLOATS);
  // Nothing in a derived verdict claims the old packed equality.
  expect(inside).not.toHaveProperty("packingEqual");

  const outside = derived(
    compareControlRecords(ATLAS, source, VIEW, threeFor(source, VIEW), {
      source: "gpu-derived-readback",
      records: shifted(1e6),
    }),
  );
  expect(outside.passed).toBe(false);
  expect(outside.faults).toHaveLength(1);
  expect(outside.faults[0]).toMatchObject({ field: "anchorX", label: "soldier 0" });
});

test("a derived backend reports a co-optimal tile as a tie and a wrong tile as a fault", () => {
  // A soldier whose facing makes its local frame the world frame, looked at from the exact
  // bisector of two cells that really are its two nearest: both are equidistant and either
  // one is right, which is the only tile difference a derived route may show.
  const dirs = hemiOctTileDirections(ATLAS.columns, ATLAS.rows);
  const tiles = ATLAS.columns * ATLAS.rows;
  const cell = (index: number) => [dirs[index * 3], dirs[index * 3 + 1], dirs[index * 3 + 2]];
  const dot = (direction: number[], index: number) =>
    direction.reduce((sum, axis, k) => sum + axis * cell(index)[k], 0);
  const source = [soldier()];
  const bisector = (() => {
    for (let a = 0; a < tiles; a++)
      for (let b = a + 1; b < tiles; b++) {
        const sum = cell(a).map((axis, k) => axis + cell(b)[k]);
        const length = Math.hypot(...sum);
        if (length === 0) continue;
        const direction = sum.map((axis) => axis / length);
        if (dot(direction, a) !== dot(direction, b)) continue;
        const eye = direction.map((axis) => axis * 12) as [number, number, number];
        const chosen = packImpostors(ATLAS, source, { ...VIEW, eye })[4];
        if (chosen === a || chosen === b) return { eye, direction, pair: [a, b], chosen };
      }
    throw new Error("the 6x4 grid has no cell pair whose bisector is nearest to both");
  })();
  const view = { ...VIEW, eye: bisector.eye };
  const three = threeFor(source, view);
  const swap = (tile: number) => {
    const record = [...three(0)];
    record[4] = tile;
    return [record];
  };
  const other = bisector.pair.find((tile) => tile !== bisector.chosen)!;
  const coOptimal = derived(
    compareControlRecords(ATLAS, source, view, three, {
      source: "gpu-derived-readback",
      records: swap(other),
    }),
  );
  expect(coOptimal.passed).toBe(true);
  expect(coOptimal.faults).toEqual([]);
  // Explicit, not absorbed: the difference is named, with the margin that justifies it.
  expect(coOptimal.ties).toMatchObject([{ expected: bisector.chosen, actual: other }]);
  expect(Math.abs(coOptimal.ties[0].dotMargin)).toBeLessThan(1e-12);

  // The cell facing furthest the other way is no one's co-optimal answer.
  const opposite = Array.from({ length: tiles }, (_, i) => i).reduce((worst, i) =>
    dot(bisector.direction, i) < dot(bisector.direction, worst) ? i : worst,
  );
  const wrong = derived(
    compareControlRecords(ATLAS, source, view, three, {
      source: "gpu-derived-readback",
      records: swap(opposite),
    }),
  );
  expect(wrong.passed).toBe(false);
  expect(wrong.faults).toMatchObject([
    { field: "tile", expected: bisector.chosen, actual: opposite },
  ]);
  expect(wrong.faults[0].dotMargin).toBeGreaterThan(0.1);
});

test("a nonfinite derived record fails however small the gap looks", () => {
  const source = [soldier()];
  const record = [...derivedFrom(source, VIEW)[0]];
  record[2] = Number.NaN;
  const verdict = derived(
    compareControlRecords(ATLAS, source, VIEW, threeFor(source, VIEW), {
      source: "gpu-derived-readback",
      records: [record],
    }),
  );
  expect(verdict.passed).toBe(false);
  expect(verdict.nonfinite).toMatchObject([{ field: "anchorZ" }]);
});
