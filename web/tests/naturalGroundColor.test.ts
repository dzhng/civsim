// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  NON_GROUND_SAMPLES,
  naturalGroundColor,
  REFERENCE_GROUND_SAMPLES,
} from "../scenes/campaign/natural-ground-lib.js";

test("reference grass reads as natural ground and the negative controls do not", () => {
  for (const [name, rgb] of REFERENCE_GROUND_SAMPLES) {
    assert.ok(naturalGroundColor(...rgb).olive, `${name} ${rgb} should read as natural ground`);
  }
  for (const [name, rgb] of NON_GROUND_SAMPLES) {
    assert.ok(!naturalGroundColor(...rgb).olive, `${name} ${rgb} should not read as ground`);
  }
});

// The regression this classifier exists for: the reference's grass is yellow as
// well as olive, so any green-leading rule (g above r) throws away most of the
// ground it is supposed to measure.
test("grass with more red than green is still natural ground", () => {
  const yellowLeading = REFERENCE_GROUND_SAMPLES.filter(([, [r, g]]) => g < r);
  assert.ok(yellowLeading.length > 0);
  for (const [name, rgb] of yellowLeading) {
    assert.ok(naturalGroundColor(...rgb).olive, `${name} ${rgb} should read as natural ground`);
  }
});

test("red-brown soil reads as soil, never as ground", () => {
  const soil = naturalGroundColor(154, 100, 60);
  assert.equal(soil.redBrown, true);
  assert.equal(soil.olive, false);
});

test("colorless pixels are never ground at any brightness", () => {
  for (const level of [20, 90, 140, 200, 250]) {
    const grey = naturalGroundColor(level, level, level);
    assert.equal(grey.olive, false, `grey ${level} must not read as ground`);
    assert.equal(grey.redBrown, false, `grey ${level} must not read as soil`);
  }
});
