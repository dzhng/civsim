// @vitest-environment node
import { expect, test } from "vitest";
import { sampleVatPhase } from "@packages/renderer-core/src/vatLayout";

test("non-looping clips hold their endpoint while looping clips wrap", () => {
  expect(sampleVatPhase(1, false)).toBe(1);
  expect(sampleVatPhase(1.2, false)).toBe(1);
  expect(sampleVatPhase(-0.2, false)).toBe(0);
  expect(sampleVatPhase(1, true)).toBe(0);
  expect(sampleVatPhase(1.25, true)).toBe(0.25);
});
