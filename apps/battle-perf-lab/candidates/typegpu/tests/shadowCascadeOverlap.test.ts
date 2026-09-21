/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
// @vitest-environment node
// The CPU half of the High receiver's cascade-overlap gate: the fixture that
// drives it and the hand-derived oracle it is measured against. Nothing here
// touches a GPU — the hardware half lives in shadow-check.ts and is run by
// verify-shadow.mjs.
//
// The point of these tests is that the numbers the hardware gate compares
// against are DERIVED, not recorded: every probe depth is placed where the
// shared fade formula collapses to a closed form, and the weights in the probe
// table are those closed forms written out. What is pinned here is that the
// placement really lands at the declared depth, that the closed forms are the
// ones the fade actually produces, and that a wrong-layer read cannot slip
// through the configurations the gate runs.
import { expect, test } from "vitest";
import { tgpu } from "typegpu";
import { probeReceiverShader } from "../shadow-check";
import { typegpuSunShadowSample } from "../../../../../packages/battle-renderer/src/world/environment";
import {
  CHECK_NORMAL,
  CLEARED_DEPTHS,
  LAYER_CONFIGURATIONS,
  LINEAR_DEPTH_ERROR,
  MIN_COMPARE_SEPARATION,
  shadowOverlapFixture,
} from "../shadowOverlapFixture";
import { cascadeBlendWeight } from "../../../../../packages/game-renderer/src/battle/cascadePolicy";
import {
  SUN_CASCADE_RECORD_FLOATS,
  SUN_SHADOW_CONTROL_OFFSET,
} from "../../../../../packages/battle-renderer/src/shaders/shadow";
import { CSM_CASCADES } from "../../../../../packages/game-renderer/src/battle/shadowPolicy";

const fixture = shadowOverlapFixture();
const weighted = fixture.probes.filter((probe) => probe.weights.some((weight) => weight > 0));
const overlap = fixture.probes.filter((probe) => probe.name.startsWith("overlap-"));

test("the gate drives the genuine High fit, not a contrived receiver block", () => {
  // Two active cascades, meeting at one break, ending at the capped far the
  // shared control vector publishes — all read off the packed block itself.
  expect(fixture.receiver[SUN_SHADOW_CONTROL_OFFSET + 1]).toBe(CSM_CASCADES);
  expect(fixture.cappedFar).toBe(fixture.receiver[SUN_SHADOW_CONTROL_OFFSET]);
  expect(fixture.split).toBeGreaterThan(0);
  expect(fixture.split).toBeLessThan(1);
  expect(fixture.receiver[SUN_CASCADE_RECORD_FLOATS + 20]).toBe(fixture.split);
  expect(fixture.receiver[SUN_CASCADE_RECORD_FLOATS + 21]).toBe(1);
  // Both margins are the shared 0.25*edge^2, taken at the edge nearest the
  // sample: the shared break for both cascades, and the capped far for the last.
  expect(fixture.overlapMargin).toBeCloseTo(0.25 * fixture.split ** 2, 12);
  expect(fixture.terminalMargin).toBe(0.25);
});

test("every probe's world point lands at the receiver depth it claims", () => {
  // The placement inverts the receiver's own normalisation; if it drifted, the
  // probe names would stop describing where the sample actually is.
  for (const probe of fixture.probes) {
    const m = fixture.worldToView;
    const viewZ = m[2] * probe.world[0] + m[6] * probe.world[1] + m[10] * probe.world[2] + m[14];
    const linearDepth = (-viewZ - fixture.znear) / (fixture.cappedFar - fixture.znear);
    expect(Math.abs(linearDepth - probe.linearDepth)).toBeLessThan(LINEAR_DEPTH_ERROR);
  }
});

test("the hand-derived weights are what the shared fade produces", () => {
  // CONSISTENCY CHECK, NOT AN INDEPENDENT ORACLE: cascadePolicy's blend is the
  // CPU transcription of the same shader text this gate measures, so agreement
  // proves the closed forms were read off the right formula — it cannot prove
  // the formula. The independent claims are the collapsed forms below.
  for (const probe of fixture.probes)
    for (const [index, weight] of probe.weights.entries())
      expect(
        cascadeBlendWeight(probe.linearDepth, intervalOf(index), {
          first: index === 0,
          last: index === CSM_CASCADES - 1,
        }),
      ).toBeCloseTo(weight, 6);
});

function intervalOf(index: number): readonly [number, number] {
  const at = index * SUN_CASCADE_RECORD_FLOATS;
  return [fixture.receiver[at + 20], fixture.receiver[at + 21]];
}

test("the overlap band's two weights sum to exactly one", () => {
  // The band is where both cascades take their margin from the same shared
  // break, so one's distance past the low edge is the other's distance short of
  // the high edge. Nothing about the sampled depth can change that.
  for (const probe of overlap) expect(probe.weights[0] + probe.weights[1]).toBe(1);
  expect(overlap.map((probe) => probe.weights[0])).toEqual([1, 0.75, 0.5, 0.25, 0]);
  const width = overlap.at(-1)!.linearDepth - overlap[0]!.linearDepth;
  expect(width).toBeCloseTo(fixture.overlapMargin, 12);
});

test("the first cascade's near half is unfaded through the zero-width-margin guard", () => {
  // Below the first interval's centre the nearest edge is 0, so the margin is
  // 0 and the ratio is a 0/0 the shader guards rather than evaluates. The
  // weight there is exactly 1, not a NaN and not a partial fade.
  const near = probeNamed("first-cascade-near-half");
  expect(near.linearDepth).toBeLessThan(fixture.split / 2);
  expect(near.weights).toEqual([1, 0]);
  expect(probeNamed("first-cascade-far-half").weights).toEqual([1, 0]);
});

test("the last cascade fades to unshadowed at the capped far", () => {
  // Linear in the remaining distance, over a margin of the capped far squared.
  for (const [name, weight] of [
    ["terminal-fade-start", 1],
    ["terminal-fade-half", 0.5],
    ["terminal-fade-tail", 0.08],
    ["capped-far", 0],
  ] as const) {
    const probe = probeNamed(name);
    expect(probe.weights[1]).toBeCloseTo((1 - probe.linearDepth) / fixture.terminalMargin, 12);
    expect(probe.weights[1]).toBeCloseTo(weight, 12);
  }
  for (const name of ["before-near-plane", "capped-far", "beyond-capped-far"])
    expect(probeNamed(name).weights).toEqual([0, 0]);
});

test("every weighted cascade is admitted by its own map and clear of every cleared depth", () => {
  const clears = [...new Set(LAYER_CONFIGURATIONS.flatMap((c) => c.clears))];
  expect(clears.sort()).toEqual(Object.values(CLEARED_DEPTHS).sort());
  for (const probe of weighted)
    for (const [index, weight] of probe.weights.entries()) {
      if (weight === 0) continue;
      expect(probe.cascades[index].inside).toBe(true);
      for (const clear of clears)
        expect(Math.abs(probe.cascades[index].z - clear)).toBeGreaterThanOrEqual(
          MIN_COMPARE_SEPARATION,
        );
    }
});

test("each configuration's expected shade is the complement of the weights it keeps", () => {
  const by = (name: string) => LAYER_CONFIGURATIONS.find((c) => c.name === name)!;
  const w = fixture.probes.map((probe) => probe.weights);
  expect(fixture.expected(by("cascade-0-occluded"), "none")).toEqual(w.map(([a]) => 1 - a));
  expect(fixture.expected(by("cascade-1-occluded"), "none")).toEqual(w.map(([, b]) => 1 - b));
  expect(fixture.expected(by("both-occluded"), "none")).toEqual(w.map(([a, b]) => 1 - a - b));
  expect(fixture.expected(by("neither-occluded"), "none")).toEqual(w.map(() => 1));
  // The overlap is the seam every cascade fade risks: occluded on both sides it
  // must be wholly shadowed, with no lighter or darker band at the join.
  for (const probe of overlap)
    expect(fixture.expected(by("both-occluded"), "none")[fixture.probes.indexOf(probe)]).toBe(0);
});

test("a layer swap moves every probe any cascade weights", () => {
  // The mutation gate's precondition. A probe outside every interval is
  // deliberately unaffected — no layer is read there at all — so the claim is
  // about weighted probes, and it has to hold for each one of them.
  for (const probe of weighted) {
    const index = fixture.probes.indexOf(probe);
    const moved = LAYER_CONFIGURATIONS.filter(
      (configuration) =>
        Math.abs(
          fixture.expected(configuration, "none")[index] -
            fixture.expected(configuration, "layer-swap")[index],
        ) > fixture.tolerance,
    );
    expect(moved.length).toBeGreaterThan(0);
  }
});

test("the corrupted receiver exchanges the two cascade records", () => {
  const corrupted = fixture.corruptedReceiver();
  const span = SUN_CASCADE_RECORD_FLOATS;
  expect([...corrupted.subarray(0, span)]).toEqual([...fixture.receiver.subarray(span, span * 2)]);
  expect([...corrupted.subarray(span, span * 2)]).toEqual([...fixture.receiver.subarray(0, span)]);
  // The control vector is untouched, so the corruption is the record ownership
  // alone — a receiver that reads cascade 1's matrix, bias and interval as if
  // they were cascade 0's, which is exactly what a mis-ordered pack would do.
  expect([...corrupted.subarray(SUN_SHADOW_CONTROL_OFFSET)]).toEqual([
    ...fixture.receiver.subarray(SUN_SHADOW_CONTROL_OFFSET),
  ]);
  expect([...corrupted]).not.toEqual([...fixture.receiver]);
});

test("the tolerance is derived from the fit and cannot mask a wrong weight", () => {
  // Stated before any hardware runs: an f32 linear depth carries ~1e-6, the
  // blend divides that by the narrowest margin in play, and two cascades
  // accumulate. It is never widened to admit a measurement.
  expect(fixture.tolerance).toBeCloseTo((2 * LINEAR_DEPTH_ERROR) / fixture.overlapMargin, 15);
  const answers = [...new Set(fixture.probes.flatMap((probe) => probe.weights))].sort(
    (a, b) => a - b,
  );
  const smallestGap = Math.min(...answers.slice(1).map((value, index) => value - answers[index]));
  expect(fixture.tolerance * 100).toBeLessThan(smallestGap);
});

test("the receiver's shading normal is a sampling input, not an unused argument", () => {
  // The sampler offsets the receiver by normal * normalBias before projecting.
  // A zero normal would silently drop that half of the bias contract.
  expect(CHECK_NORMAL.some((component) => component !== 0)).toBe(true);
  const normalBias = fixture.receiver[17];
  expect(normalBias).toBeGreaterThan(0);
});

function probeNamed(name: string) {
  const found = fixture.probes.find((probe) => probe.name === name);
  if (!found) throw Error(`No probe named ${name}`);
  return found;
}

test("the probe surface resolves to WGSL that samples both cascade layers", () => {
  // Device-free: the gate's own fragment, resolved through the same High
  // sampler the world binds. It has to reach the depth ARRAY and both layer
  // indices, or the wrong-layer claim this gate makes would be untestable.
  const wgsl = tgpu.resolve([
    probeReceiverShader(typegpuSunShadowSample("csm"), fixture.probes.length).fragment,
  ]);
  expect(wgsl).toMatch(/var \w+\s*:\s*texture_depth_2d_array\b/);
  for (const layer of Array(CSM_CASCADES).keys())
    expect(wgsl).toMatch(new RegExp(`shadowVisibility\\(sunDepth,sunCompare,${layer},`));
  // One probe slot per probe, read by the fragment's own texel index.
  expect(wgsl).toMatch(new RegExp(`array<vec4f,\\s*${fixture.probes.length}>`));
  expect(wgsl).toMatch(/probes\[i32\(position\.x\)\]/);
  // The blend still reads the admitted frame's view row and near plane.
  expect(wgsl).toContain("environment.worldToView");
  expect(wgsl).toContain("cam.znear");
});
