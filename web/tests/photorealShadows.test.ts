// @vitest-environment node
// The pure halves of the sun-shadow rig are pinned independently:
// (packages/photoreal-renderer/src/battle/shadowRig.ts): the adapter-probe
// tier resolution (SwiftShader must land on 'single' BY NAME — the standing
// capability-fallback gate) and the preset→softness coupling (lighting is an
// environment: PCF radius derives from the preset's turbidity, no new field
// on the ONE preset owner). The turbidity curve is pinned through High, which
// still samples it unscaled; the fitted single tier narrows the SAME five-tap
// footprint and is pinned as its own output.
import assert from "node:assert/strict";
import { test } from "vitest";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment.ts";
import {
  CSM_CASCADES,
  CSM_MAP_SIZE,
  resolveSunShadowMode,
  sunShadowRadius,
} from "@packages/game-renderer/src/battle/shadowPolicy.ts";

test("software rasterizer adapters resolve to the single tier by name", () => {
  assert.equal(resolveSunShadowMode("google / swiftshader / SwiftShader driver"), "single");
  assert.equal(resolveSunShadowMode("Mesa / llvmpipe (LLVM 15.0.7)"), "single");
  assert.equal(resolveSunShadowMode("mesa / lavapipe"), "single");
  assert.equal(resolveSunShadowMode("some vendor / software renderer"), "single");
});

test("every adapter defaults to the single soft tier (perf: csm re-renders the crowd per cascade)", () => {
  assert.equal(resolveSunShadowMode("apple / metal-3 / Apple M3"), "single");
  assert.equal(resolveSunShadowMode("nvidia / ampere / RTX"), "single");
  // Unlabelled adapters (adapterInfo withheld) assume hardware — SwiftShader
  // always self-identifies; the SwiftShader scene run proves the fallback.
  assert.equal(resolveSunShadowMode("unknown"), "single");
});

test("an explicit tier override wins over the probe", () => {
  assert.equal(resolveSunShadowMode("apple / metal-3", "off"), "off");
  assert.equal(resolveSunShadowMode("apple / metal-3", "single"), "single");
  assert.equal(resolveSunShadowMode("google / swiftshader", "csm"), "csm");
  // Unknown override values fall back to the probe, never crash the tier.
  assert.equal(resolveSunShadowMode("apple / metal-3", "blurry"), "single");
});

test("PCF softness derives from preset turbidity: monotonic, clamped [1, 3]", () => {
  const clear = sunShadowRadius(2.0, "csm");
  const golden = sunShadowRadius(2.6, "csm");
  const dusk = sunShadowRadius(3.6, "csm");
  const overcast = sunShadowRadius(9.8, "csm");
  assert.equal(clear, 1);
  assert.ok(golden > clear && dusk > golden && overcast > dusk, "monotonic in turbidity");
  assert.ok(overcast > 2.8 && overcast <= 3, `overcast near the cap (${overcast})`);
  assert.equal(sunShadowRadius(0, "csm"), 1, "clamped below");
  assert.equal(sunShadowRadius(50, "csm"), 3, "clamped above");
});

test("the fitted single map narrows that same curve; High and off are untouched", () => {
  // The single map is fitted to the visible ground, so its texel is a fraction
  // of a High texel and the five taps spread over the same radius read faint.
  // Deliberately narrower OUTPUT, same curve underneath: [1, 3] becomes
  // [0.6, 1.8], monotonic, with no mode-independent tap or clamp change.
  const near = (actual: number, expected: number, what: string) =>
    assert.ok(Math.abs(actual - expected) < 1e-6, `${what}: ${actual} != ${expected}`);
  near(sunShadowRadius(2.6, "single"), 0.7008, "golden");
  near(sunShadowRadius(3.6, "single"), 0.8688, "dusk");
  near(sunShadowRadius(0, "single"), 0.6, "clamped below");
  near(sunShadowRadius(50, "single"), 1.8, "clamped above");
  for (const turbidity of [0, 2, 2.6, 3.6, 7.2, 9.8, 50]) {
    const single = sunShadowRadius(turbidity, "single");
    const high = sunShadowRadius(turbidity, "csm");
    assert.ok(single > 0 && single < high, `${turbidity}: ${single} narrower than ${high}`);
    assert.equal(sunShadowRadius(turbidity, "off"), 0, "off casts nothing to filter");
  }
});

test("every preset maps to an in-range softness; overcast is the softest", () => {
  const radii = Object.values(CIVSIM_ENVIRONMENTS).map((env) => ({
    id: env.id,
    radius: sunShadowRadius(env.physical.turbidity, "csm"),
    single: sunShadowRadius(env.physical.turbidity, "single"),
  }));
  for (const { id, radius, single } of radii) {
    assert.ok(radius >= 1 && radius <= 3, `${id} radius ${radius} in [1, 3]`);
    assert.ok(single >= 0.6 && single <= 1.8, `${id} single radius ${single} in [0.6, 1.8]`);
  }
  const overcast = radii.find((r) => r.id === "overcast-highland")!;
  for (const { id, radius, single } of radii) {
    assert.ok(overcast.radius >= radius, `overcast (${overcast.radius}) >= ${id} (${radius})`);
    assert.ok(overcast.single >= single, `overcast (${overcast.single}) >= ${id} (${single})`);
  }
});

test("the hardware tier ships real cascades at real resolution", () => {
  assert.ok(CSM_CASCADES >= 2, "cascaded means at least two cascades");
  assert.ok(CSM_MAP_SIZE >= 1024, "hardware cascade maps are not thumbnail-res");
});
