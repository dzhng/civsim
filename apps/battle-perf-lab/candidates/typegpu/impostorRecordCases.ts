import type { ImpostorAtlasLayout } from "../../../../packages/soldier-assets/src/impostorAtlas";
import type { CrowdInstance } from "../../../../packages/crowd-runtime/src/instanceData";
import {
  packImpostors,
  type ImpostorView,
} from "../../../../packages/battle-renderer/src/impostorData";
import { hemiOctTileDirections } from "../../../../packages/photoreal-renderer/src/battle/impostorTile";
import { tanHalfFov } from "./impostorDerivation";

/** The fixture and the verdict both checks of the derived billboard record share: the CPU
 * lifecycle suite, which runs the typed bodies directly, and the hardware readback, which
 * runs them through a compute stage. `packImpostors` is the oracle for both and is never
 * routed through the derivation. This module is a check, not a rendering path. */

/** One f32 step. TypeGPU stores struct and vector members at f32, so this is the precision
 * the published state and view block themselves carry on either route. */
export const F32_STEP = 2 ** -23;
/** WGSL guarantees sin and cos to an absolute error of 2^-11 inside [-π, π]. Every
 * difference the shader's own arithmetic can introduce descends from this and from f32
 * rounding; nothing here is a fitted number. */
const WGSL_TRIG_ERROR = 2 ** -11;
/** Four f64 steps at a unit dot product: three products and their sum. Two baked centres
 * inside this band are equidistant in the reference table's own precision. */
const TIE_BAND = 4 * Number.EPSILON;

const RECORD_FIELDS = [
  "anchorX",
  "anchorY",
  "anchorZ",
  "faction",
  "tile",
  "width",
  "height",
  "angle",
  "living",
] as const;
export type RecordField = (typeof RECORD_FIELDS)[number];
const TILE_FIELD = RECORD_FIELDS.indexOf("tile");
/** The nine floats `packImpostors` actually carries per soldier. */
const RECORD_FLOATS = RECORD_FIELDS.length;

export interface RecordTolerance {
  label: string;
  /** Allowed absolute deviation for one non-tile field. */
  field(atlas: ImpostorAtlasLayout, expected: number, field: RecordField): number;
  /** How far a dot product may move before two centres stop being distinguishable. */
  dot: number;
}
/** A run whose arithmetic is JavaScript's but whose storage is the shader's. */
export const STORED_F32: RecordTolerance = {
  label: "f32 storage",
  field: (_atlas, expected) => Math.max(Math.abs(expected), 1) * F32_STEP,
  dot: 0,
};
/** A run whose arithmetic is the shader's: the rotation's trigonometry, then rounding.
 * The anchor carries the trig error scaled by the baked offset it rotates; the local
 * direction carries it whole, which is what can move a tile pick. */
export const SHADER_F32: RecordTolerance = {
  label: "f32 arithmetic with WGSL trigonometry",
  field(atlas, expected, field) {
    const rounding = Math.max(Math.abs(expected), 1) * F32_STEP * 8;
    if (field !== "anchorX" && field !== "anchorY") return rounding;
    return rounding + (Math.abs(atlas.center[0]) + Math.abs(atlas.center[1])) * WGSL_TRIG_ERROR;
  },
  // A rotation wrong by ε in both sin and cos moves a unit direction by at most √2·ε.
  dot: Math.SQRT2 * WGSL_TRIG_ERROR,
};

export type Triple = readonly [number, number, number];
export interface RecordProbe {
  label: string;
  instance: CrowdInstance;
  view: ImpostorView;
  /** The local direction this probe aims at, where the case was built from one. */
  direction?: Triple;
}

const unit = (x: number, y: number, z: number): Triple => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};
/** Off every axis: a soldier at the origin is not equidistant from a mirrored pair. */
const CAMERA: ImpostorView = {
  right: [1, 0, 0],
  up: [0, 0, 1],
  eye: [3.75, -10.5, 4.25],
  fovY: 0.8,
};
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
/** A corpse at the given presentation strength; `living` is its complement. */
const corpse = (weight: number): CrowdInstance =>
  soldier({
    alive: false,
    playback: {
      appearanceId: 0,
      base: {
        weight,
        source: { kind: "clip", sample: { clip: "die", phase: 0 } },
        destination: { clip: "die", phase: 1 },
      },
    } as CrowdInstance["playback"],
  });
/** `facing = π/2` cancels the anchor rotation, so the soldier's local direction IS the
 *  world direction from it to the eye: a case can name the tile direction it wants. */
const facingEye = (label: string, direction: Triple, distance = 12): RecordProbe => ({
  label,
  instance: soldier(),
  view: { ...CAMERA, eye: direction.map((axis) => axis * distance) as unknown as Triple },
  direction,
});
const tileCentre = (atlas: ImpostorAtlasLayout, tx: number, ty: number): Triple => {
  const dirs = hemiOctTileDirections(atlas.columns, atlas.rows);
  const o = (ty * atlas.columns + tx) * 3;
  return [dirs[o], dirs[o + 1], dirs[o + 2]];
};

/** Each cell and its right and lower neighbour: every edge the grid actually has. */
function adjacentCells(atlas: ImpostorAtlasLayout) {
  const pairs: { name: string; cells: [string, Triple][]; bisector: Triple }[] = [];
  for (let ty = 0; ty < atlas.rows; ty++)
    for (let tx = 0; tx < atlas.columns; tx++)
      for (const [nx, ny] of [
        [tx + 1, ty],
        [tx, ty + 1],
      ]) {
        if (nx >= atlas.columns || ny >= atlas.rows) continue;
        const a = tileCentre(atlas, tx, ty);
        const b = tileCentre(atlas, nx, ny);
        pairs.push({
          name: `${tx},${ty}|${nx},${ny}`,
          cells: [
            [`${tx},${ty}`, a],
            [`${nx},${ny}`, b],
          ],
          bisector: unit(a[0] + b[0], a[1] + b[1], a[2] + b[2]),
        });
      }
  return pairs;
}

/** Every cell edge as its exact bisector: the hardest direction there is, where both
 *  centres are equidistant and either answer is right. */
function tileBisectors(atlas: ImpostorAtlasLayout): RecordProbe[] {
  const probes = adjacentCells(atlas).map((pair) =>
    facingEye(`bisector ${pair.name}`, pair.bisector),
  );
  // The symmetry axes: every pole and cardinal a sweep would otherwise step over.
  for (const axis of [
    [0, 0, 1],
    [0, 0, -1],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
  ] as Triple[])
    probes.push(facingEye(`axis ${axis.join(",")}`, axis));
  return probes;
}

/** Each bisector stepped toward one of its centres: the same cell edge, resolved far
 *  enough that neither route's precision can reach the other side of it. */
function tileEdges(atlas: ImpostorAtlasLayout, step = 1e-3): RecordProbe[] {
  return adjacentCells(atlas).flatMap((pair) =>
    pair.cells.map(([cell, towards]) =>
      facingEye(
        `edge ${pair.name} toward ${cell}`,
        unit(
          ...(pair.bisector.map((axis, k) => axis + (towards[k] - axis) * step) as unknown as [
            number,
            number,
            number,
          ]),
        ),
      ),
    ),
  );
}

/** A full sphere, offset off every symmetry axis so each direction has one nearest tile.
 *  The lower half runs the below-horizon fallback; the horizon itself is stepped across. */
function sphereSweep(): RecordProbe[] {
  const probes: RecordProbe[] = [];
  for (let a = 0; a < 24; a++) {
    const azimuth = ((a + 0.317) / 24) * Math.PI * 2;
    for (let e = 0; e <= 16; e++) {
      const elevation = -Math.PI / 2 + ((e + 0.211) / 16.42) * Math.PI;
      probes.push(
        facingEye(
          `sweep ${a}/${e}`,
          unit(
            Math.cos(elevation) * Math.cos(azimuth),
            Math.cos(elevation) * Math.sin(azimuth),
            Math.sin(elevation),
          ),
        ),
      );
    }
  }
  // The horizon the fallback branches on, from both sides and exactly on it.
  for (const z of [1e-7, 0, -1e-7, -1e-3])
    probes.push(facingEye(`horizon ${z}`, unit(0.7133, 0.4177, z)));
  return probes;
}

/** Motion, degenerate geometry and corpse fade: everything the record carries that is not
 *  a tile pick. */
function stateProbes(atlas: ImpostorAtlasLayout): RecordProbe[] {
  const probes: RecordProbe[] = [];
  for (let step = 0; step < 16; step++) {
    const facing = -Math.PI + ((step + 0.37) / 16) * Math.PI * 2;
    probes.push({
      label: `facing ${facing.toFixed(3)}`,
      instance: soldier({ facing, x: 3.25, y: -7.5, elevation: 1.375, faction: 1 }),
      view: CAMERA,
    });
  }
  const floorEdge = atlas.worldSpan / (2 * 0.008 * tanHalfFov(CAMERA.fovY));
  for (const [label, instance, view] of [
    ["eye on the soldier", soldier(), { ...CAMERA, eye: [0, 0, 0] }],
    ["eye on the soldier, raised", soldier({ elevation: 2 }), { ...CAMERA, eye: [0, 0, 2] }],
    ["no vertical field", soldier(), { ...CAMERA, fovY: 0 }],
    ["negative vertical field", soldier(), { ...CAMERA, fovY: -1 }],
    ["wide field", soldier(), { ...CAMERA, fovY: 3 }],
    ["pinhole field", soldier(), { ...CAMERA, fovY: 1e-4 }],
    // Far enough that the authored screen-size floor grows the quad, and at its edge.
    ["distant, floor engaged", soldier(), { ...CAMERA, eye: [0, -40000, 0] }],
    ["floor at its edge", soldier(), { ...CAMERA, eye: [0, -floorEdge, 0] }],
    ["floor just inside", soldier(), { ...CAMERA, eye: [0, -floorEdge * (1 - 1e-6), 0] }],
    ["absent elevation", soldier({ elevation: undefined }), CAMERA],
    ["deep elevation", soldier({ elevation: -12.5 }), CAMERA],
    ["neutral faction", soldier({ faction: 2 }), CAMERA],
    ["fresh corpse", corpse(0), CAMERA],
    ["half-faded corpse", corpse(0.5), CAMERA],
    ["settled corpse", corpse(1), CAMERA],
    ["corpse without playback", soldier({ alive: false }), CAMERA],
  ] as [string, CrowdInstance, ImpostorView][])
    probes.push({ label, instance, view });
  return probes;
}

/** Every suite, by name, for one atlas. */
export function impostorRecordSuites(atlas: ImpostorAtlasLayout): Record<string, RecordProbe[]> {
  return {
    "a full sphere through the below-horizon fallback": sphereSweep(),
    "both sides of every cell edge": tileEdges(atlas),
    "motion, degenerate geometry and corpse fade": stateProbes(atlas),
    "exact tile bisectors": tileBisectors(atlas),
  };
}

/** Two cells baked from the identical direction. The corner regions of the hemi-octahedron
 * fold onto interior cells, so an even grid always holds some: either index draws the same
 * pixels, and which one a scan reaches first is not a property worth pinning. */
function interchangeable(atlas: ImpostorAtlasLayout, a: number, b: number): boolean {
  const dirs = hemiOctTileDirections(atlas.columns, atlas.rows);
  return [0, 1, 2].every((axis) => dirs[a * 3 + axis] === dirs[b * 3 + axis]);
}
/** How many cells of this grid share a direction with an earlier one. */
export function duplicateCells(atlas: ImpostorAtlasLayout): number {
  const tiles = atlas.columns * atlas.rows;
  let found = 0;
  for (let a = 1; a < tiles; a++)
    for (let b = 0; b < a; b++)
      if (interchangeable(atlas, a, b)) {
        found++;
        break;
      }
  return found;
}
/** The dot each tile's baked centre makes with a direction, in f64. */
const tileDots = (atlas: ImpostorAtlasLayout, direction: Triple) => {
  const dirs = hemiOctTileDirections(atlas.columns, atlas.rows);
  return Array.from({ length: atlas.columns * atlas.rows }, (_, i) =>
    direction.reduce((sum, axis, k) => sum + axis * dirs[i * 3 + k], 0),
  );
};

/** The oracle's record for one probe: the nine floats it writes per soldier. */
const oracleRecord = (atlas: ImpostorAtlasLayout, probe: RecordProbe) =>
  Array.from(packImpostors(atlas, [probe.instance], probe.view).subarray(0, RECORD_FLOATS));

export interface RecordFault {
  label: string;
  field: RecordField;
  expected: number;
  actual: number;
  gap: number;
  allowed: number;
  /** For a tile fault, how much nearer the oracle's centre faces than the one chosen. */
  dotMargin?: number;
}
export interface RecordSwap {
  label: string;
  expected: number;
  actual: number;
  dotMargin: number;
}
export interface RecordVerdict {
  probes: number;
  compared: number;
  faults: RecordFault[];
  /** A different index for the identical baked direction. */
  duplicates: RecordSwap[];
  /** A different index the compared route cannot tell apart from the oracle's. */
  ties: RecordSwap[];
  nonfinite: { label: string; field: RecordField; actual: number }[];
  worstGap: { field: RecordField; gap: number; allowed: number; label: string } | null;
}

/** Compares derived records against the oracle under one declared tolerance. A tile index
 * may differ only where the two centres are the same direction, or where the compared
 * route's own precision cannot separate them — every other difference, of any size, is a
 * fault, and carries the dot margin that proves it. */
export function compareImpostorRecords(
  atlas: ImpostorAtlasLayout,
  probes: readonly RecordProbe[],
  actualFor: (probe: RecordProbe, index: number) => readonly number[],
  tolerance: RecordTolerance,
): RecordVerdict {
  const verdict: RecordVerdict = {
    probes: probes.length,
    compared: 0,
    faults: [],
    duplicates: [],
    ties: [],
    nonfinite: [],
    worstGap: null,
  };
  probes.forEach((probe, index) => {
    const expected = oracleRecord(atlas, probe);
    const actual = actualFor(probe, index);
    for (let i = 0; i < RECORD_FLOATS; i++) {
      const field = RECORD_FIELDS[i];
      verdict.compared++;
      if (!Number.isFinite(actual[i])) {
        verdict.nonfinite.push({ label: probe.label, field, actual: actual[i] });
        continue;
      }
      if (Object.is(expected[i], actual[i])) continue;
      if (i === TILE_FIELD) {
        const dots = probe.direction ? tileDots(atlas, probe.direction) : null;
        const dotMargin = dots ? dots[expected[i]] - dots[actual[i]] : Number.POSITIVE_INFINITY;
        const swap = { label: probe.label, expected: expected[i], actual: actual[i], dotMargin };
        if (interchangeable(atlas, expected[i], actual[i])) {
          verdict.duplicates.push(swap);
          continue;
        }
        if (Math.abs(dotMargin) <= TIE_BAND + tolerance.dot) {
          verdict.ties.push(swap);
          continue;
        }
        verdict.faults.push({ ...swap, field, gap: Math.abs(expected[i] - actual[i]), allowed: 0 });
        continue;
      }
      const gap = Math.abs(expected[i] - actual[i]);
      const allowed = tolerance.field(atlas, expected[i], field);
      if (!verdict.worstGap || gap / allowed > verdict.worstGap.gap / verdict.worstGap.allowed)
        verdict.worstGap = { field, gap, allowed, label: probe.label };
      if (!(gap <= allowed))
        verdict.faults.push({
          label: probe.label,
          field,
          expected: expected[i],
          actual: actual[i],
          gap,
          allowed,
        });
    }
  });
  return verdict;
}
