// @vitest-environment node
// Slice 11 seam pins — the pure halves of the sun-shadow rig
// (packages/photoreal-renderer/src/battle/shadowRig.ts): the adapter-probe
// tier resolution (SwiftShader must land on 'single' BY NAME — the standing
// capability-fallback gate) and the preset→softness coupling (lighting is an
// environment: PCF radius derives from the preset's turbidity, no new field
// on the ONE preset owner).
import assert from "node:assert/strict";
import { test } from "vitest";
import { CIVSIM_ENVIRONMENTS } from "../../packages/game-renderer/src/environment/environment.ts";
import {
  CSM_CASCADES,
  CSM_MAP_SIZE,
  resolveSunShadowMode,
  shadowRadiusForTurbidity,
} from "../../packages/photoreal-renderer/src/battle/shadowRig.ts";

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
  const clear = shadowRadiusForTurbidity(2.0);
  const golden = shadowRadiusForTurbidity(2.6);
  const dusk = shadowRadiusForTurbidity(3.6);
  const overcast = shadowRadiusForTurbidity(9.8);
  assert.equal(clear, 1);
  assert.ok(golden > clear && dusk > golden && overcast > dusk, "monotonic in turbidity");
  assert.ok(overcast > 2.8 && overcast <= 3, `overcast near the cap (${overcast})`);
  assert.equal(shadowRadiusForTurbidity(0), 1, "clamped below");
  assert.equal(shadowRadiusForTurbidity(50), 3, "clamped above");
});

test("every preset maps to an in-range softness; overcast is the softest", () => {
  const radii = Object.values(CIVSIM_ENVIRONMENTS).map((env) => ({
    id: env.id,
    radius: shadowRadiusForTurbidity(env.physical.turbidity),
  }));
  for (const { id, radius } of radii) {
    assert.ok(radius >= 1 && radius <= 3, `${id} radius ${radius} in [1, 3]`);
  }
  const overcast = radii.find((r) => r.id === "overcast-highland")!;
  for (const { id, radius } of radii) {
    assert.ok(overcast.radius >= radius, `overcast (${overcast.radius}) >= ${id} (${radius})`);
  }
});

test("the hardware tier ships real cascades at real resolution", () => {
  assert.ok(CSM_CASCADES >= 2, "cascaded means at least two cascades");
  assert.ok(CSM_MAP_SIZE >= 1024, "hardware cascade maps are not thumbnail-res");
});
