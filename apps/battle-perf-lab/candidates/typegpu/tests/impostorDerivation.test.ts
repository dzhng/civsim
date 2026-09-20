/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
// @vitest-environment node
// The billboard record the vertex stage now derives, against the CPU packer that stays the
// independent oracle. The typed bodies are ordinary TypeScript until they are transpiled,
// so this suite runs the SAME functions the shader compiles, over the SAME fixture the
// hardware readback uses. TypeGPU stores struct and vector members at f32, so a JavaScript
// run carries the shader's storage precision but not its arithmetic: it pins the algorithm,
// and it is not a substitute for the hardware check.
import { describe, expect, it, test } from "vitest";
import { tgpu, d } from "typegpu";
import {
  IMPOSTOR_STATE_FLOATS,
  ImpostorRecord,
  ImpostorState,
  ImpostorViewBlock,
  impostorDerivation,
  impostorViewBlock,
  writeImpostorState,
} from "../impostorDerivation";
import {
  F32_STEP,
  STORED_F32,
  compareImpostorRecords,
  duplicateCells,
  impostorRecordSuites,
  type RecordProbe,
} from "../impostorRecordCases";
import type { ImpostorView } from "../../../../../packages/battle-renderer/src/impostorData";
import type { ImpostorAtlasLayout } from "../../../../../packages/soldier-assets/src/impostorAtlas";
import { IMPOSTOR_ATLAS_POLICY } from "../../../../../packages/soldier-assets/src/impostorAtlas";
import type { CrowdInstance } from "../../../../../packages/crowd-runtime/src/instanceData";
import { hemiOctTileDirections } from "../../../../../packages/photoreal-renderer/src/battle/impostorTile";

const SQUARE: ImpostorAtlasLayout = {
  ...IMPOSTOR_ATLAS_POLICY,
  center: [0.137, -0.241, 0.913],
  worldSpan: 1.7,
};
/** A grid whose corner fold lands on a near-duplicate rather than an exact one. */
const OBLONG: ImpostorAtlasLayout = { ...SQUARE, columns: 6, rows: 4 };
const CAMERA: ImpostorView = {
  right: [1, 0, 0],
  up: [0, 0, 1],
  eye: [3.75, -10.5, 4.25],
  fovY: 0.8,
};

/** The compile-time half: `tsc --noEmit -p tests/tsconfig.json` fails this file if any of
 * these calls stops being rejected. Never executed. */
export function rejectedByTheCompiler() {
  const { deriveImpostorRecord, impostorTile } = impostorDerivation(SQUARE);
  const state = ImpostorState({
    position: d.vec2f(0, 0),
    facing: 0,
    faction: 0,
    elevation: 0,
    living: 1,
  });
  const view = ImpostorViewBlock(impostorViewBlock(CAMERA));
  // @ts-expect-error the view block is a struct, not the loose caller-facing camera
  deriveImpostorRecord(state, CAMERA);
  // @ts-expect-error a record is not the state it was derived from
  deriveImpostorRecord(deriveImpostorRecord(state, view), view);
  // @ts-expect-error the tile pick takes a direction, not a pair of cell coordinates
  impostorTile(d.vec2f(0, 1));
  // @ts-expect-error the tile index is an i32, never a colour
  const widened: d.v3f = impostorTile(d.vec3f(0, 0, 1));
  // @ts-expect-error the anchor is a vec3f, not a scalar
  const narrowed: number = deriveImpostorRecord(state, view).anchor;
  const accepted: number = deriveImpostorRecord(state, view).span;
  return [widened, narrowed, accepted];
}

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

/** The derived record in the oracle's field order, published through the real writers so
 *  the state a soldier is reduced to is the one the vertex buffer would carry. */
function derivedRecord(atlas: ImpostorAtlasLayout, probe: RecordProbe): number[] {
  const state = new Float32Array(IMPOSTOR_STATE_FLOATS);
  writeImpostorState(probe.instance, state, 0);
  const record = impostorDerivation(atlas).deriveImpostorRecord(
    ImpostorState({
      position: d.vec2f(state[0], state[1]),
      facing: state[2],
      faction: state[3],
      elevation: state[4],
      living: state[5],
    }),
    ImpostorViewBlock(impostorViewBlock(probe.view)),
  );
  return [
    record.anchor.x,
    record.anchor.y,
    record.anchor.z,
    record.faction,
    record.tile,
    record.span,
    record.span,
    record.angle,
    record.living,
  ];
}

describe.each([
  ["8x8", SQUARE],
  ["6x4", OBLONG],
])("the derived record on a %s atlas", (_name, atlas) => {
  const suites = impostorRecordSuites(atlas);
  const verdictFor = (probes: RecordProbe[]) =>
    compareImpostorRecords(atlas, probes, (probe) => derivedRecord(atlas, probe), STORED_F32);

  for (const name of [
    "a full sphere through the below-horizon fallback",
    "both sides of every cell edge",
    "motion, degenerate geometry and corpse fade",
  ])
    it(`equals the CPU packer across ${name}`, () => {
      const verdict = verdictFor(suites[name]);
      expect(verdict.probes).toBeGreaterThan(25);
      // Nothing here is ambiguous, so nothing is allowed to be resolved as a tie.
      expect({ faults: verdict.faults, ties: verdict.ties, nonfinite: verdict.nonfinite }).toEqual({
        faults: [],
        ties: [],
        nonfinite: [],
      });
      // A duplicate cell may still be substituted — that is the grid's own property, and
      // on a grid that has none the agreement is unconditional.
      expect(verdict.duplicates.length).toBeLessThan(verdict.probes / 2);
      if (duplicateCells(atlas) === 0) expect(verdict.duplicates).toEqual([]);
    });

  it("picks a co-optimal tile on an exact bisector, never a third one", () => {
    const probes = suites["exact tile bisectors"];
    const verdict = verdictFor(probes);
    expect(verdict.faults).toEqual([]);
    // The hard case is actually reached: f32 storage does flip some of these, and no
    // other field moves when it does.
    expect(verdict.ties.length).toBeGreaterThan(0);
    expect(verdict.ties.length).toBeLessThan(probes.length);
    // Every flip is between centres that face the direction equally, to f64 rounding.
    for (const tie of verdict.ties) expect(Math.abs(tie.dotMargin)).toBeLessThan(1e-15);
  });
});

test("only an even grid folds cells onto exact duplicates", () => {
  // The duplicate allowance above is real on one of these grids and absent on the other,
  // so the 6x4 suites pin the tile index with no substitution permitted at all.
  expect(duplicateCells(SQUARE)).toBeGreaterThan(0);
  expect(duplicateCells(OBLONG)).toBe(0);
});

test("the evaluated tile directions are the baked table, cell for cell", () => {
  for (const atlas of [SQUARE, OBLONG]) {
    const { tileDirection } = impostorDerivation(atlas);
    const baked = hemiOctTileDirections(atlas.columns, atlas.rows);
    const faults = [];
    for (let ty = 0; ty < atlas.rows; ty++)
      for (let tx = 0; tx < atlas.columns; tx++) {
        const evaluated = tileDirection(tx, ty);
        const o = (ty * atlas.columns + tx) * 3;
        for (const [axis, value] of [evaluated.x, evaluated.y, evaluated.z].entries())
          if (
            !(
              Math.abs(value - baked[o + axis]) <=
              Math.max(Math.abs(baked[o + axis]), 1) * F32_STEP
            )
          )
            faults.push({ tx, ty, axis, value, baked: baked[o + axis] });
      }
    expect(faults).toEqual([]);
  }
});

test("a degenerate direction keeps the reference's tile 0 rather than an unseeded scan", () => {
  for (const atlas of [SQUARE, OBLONG])
    expect(impostorDerivation(atlas).impostorTile(d.vec3f(0, 0, 0))).toBe(0);
});

describe("the published bytes", () => {
  it("carries one soldier in six floats and the whole camera in forty-eight bytes", () => {
    expect(d.sizeOf(ImpostorState)).toBe(IMPOSTOR_STATE_FLOATS * 4);
    expect(d.sizeOf(ImpostorViewBlock)).toBe(48);
    // Nothing per-soldier hides in the view block, and nothing camera-dependent in the state.
    expect(Object.keys(ImpostorViewBlock.propTypes)).toEqual(["right", "tanHalfFov", "up", "eye"]);
    expect(Object.keys(ImpostorState.propTypes)).toEqual([
      "position",
      "facing",
      "faction",
      "elevation",
      "living",
    ]);
  });

  it("writes the soldier's own camera-independent values at its own offset", () => {
    const out = new Float32Array(IMPOSTOR_STATE_FLOATS * 3).fill(NaN);
    writeImpostorState(soldier({ x: 4, y: -5, facing: 0.5, faction: 2, elevation: 1.5 }), out, 6);
    expect(Array.from(out.subarray(6, 12))).toEqual([4, -5, 0.5, 2, 1.5, 1]);
    // The neighbours either side are untouched.
    expect(out.subarray(0, 6).every(Number.isNaN)).toBe(true);
    expect(out.subarray(12).every(Number.isNaN)).toBe(true);
  });

  it("carries the corpse fade and a missing elevation the way the packer reads them", () => {
    const out = new Float32Array(IMPOSTOR_STATE_FLOATS);
    const dying = soldier({ alive: false }) as CrowdInstance;
    dying.playback = { base: { weight: 0.25 } } as CrowdInstance["playback"];
    writeImpostorState(dying, out, 0);
    expect(out[5]).toBe(0.75);
    // A dead soldier with no playback presents as a settled corpse, as the packer reads it.
    writeImpostorState(soldier({ alive: false }), out, 0);
    expect(out[5]).toBe(0);
    writeImpostorState(soldier({ elevation: undefined }), out, 0);
    expect(out[4]).toBe(0);
  });

  it("carries the oracle's guarded half-field, zero included", () => {
    expect(impostorViewBlock({ ...CAMERA, fovY: 0 }).tanHalfFov).toBe(0);
    expect(impostorViewBlock({ ...CAMERA, fovY: -1 }).tanHalfFov).toBe(0);
    expect(impostorViewBlock({ ...CAMERA, fovY: 0.8 }).tanHalfFov).toBe(Math.tan(0.4));
  });
});

describe("the resolved shader", () => {
  const resolved = (atlas: ImpostorAtlasLayout) =>
    tgpu.resolve({
      template:
        "fn probe(s:ImpostorState,v:ImpostorViewBlock)->ImpostorRecord{return derive(s,v);}",
      externals: {
        derive: impostorDerivation(atlas).deriveImpostorRecord,
        ImpostorState,
        ImpostorViewBlock,
        ImpostorRecord,
      },
    });

  it("declares the camera as one block and the soldier as six floats", () => {
    const wgsl = resolved(SQUARE);
    expect(wgsl).toContain("struct ImpostorState {\n  position: vec2f,");
    expect(wgsl).toContain("struct ImpostorViewBlock {\n  right: vec3f,\n  tanHalfFov: f32,");
    // No table, buffer or per-soldier array reaches the derivation.
    expect(wgsl).not.toMatch(/var<(storage|uniform)/);
    expect(wgsl).not.toMatch(/array</);
  });

  it("specialises the grid it was built for rather than reading a table", () => {
    expect(resolved(SQUARE)).toContain("clamp(i32(floor((((u + 1f) * 0.5f) * 8f))), 0i, 7i)");
    expect(resolved(OBLONG)).toContain("clamp(i32(floor((((u + 1f) * 0.5f) * 6f))), 0i, 5i)");
    expect(resolved(OBLONG)).toContain("clamp(i32(floor((((v + 1f) * 0.5f) * 4f))), 0i, 3i)");
  });

  it("keeps one owner of each step, whatever calls it", () => {
    const wgsl = resolved(SQUARE);
    for (const owner of [
      "fn tileDirection(",
      "fn scanNeighbourhood(",
      "fn exhaustiveTile(",
      "fn impostorTile(",
      "fn deriveImpostorRecord(",
    ])
      expect(wgsl.split(owner)).toHaveLength(2);
  });

  it("bakes this atlas's anchor and span instead of publishing them per frame", () => {
    const wgsl = resolved(SQUARE);
    for (const baked of ["0.137f", "-0.241f", "0.913f", "1.7f"]) expect(wgsl).toContain(baked);
  });
});
