import {
  createTerrainSurface,
  fieldWaterResponse,
} from "@packages/battle-renderer/src/world/terrainFunctions";
import { expect, test } from "vitest";
import { d, tgpu } from "typegpu";
import { fieldWaterNormal, waterField } from "@packages/battle-renderer/src/world/waterField";

test("field-water lighting preserves dry normals exactly and gives wet interiors moving surface cues", () => {
  const ground = d.vec3f(0.1, 0.2, 0.97);
  const phaseA = d.vec3f(0.12, -0.06, 0.99);
  const phaseB = d.vec3f(-0.08, 0.09, 0.99);
  for (const coverage of [-1, 0, 0.08]) {
    expect(fieldWaterNormal(ground, coverage, phaseA, 10)).toEqual(ground);
    expect(fieldWaterNormal(ground, coverage, phaseB, 10)).toEqual(ground);
  }
  const wetA = fieldWaterNormal(ground, 1, phaseA, 10);
  const wetB = fieldWaterNormal(ground, 1, phaseB, 10);
  expect(wetA).not.toEqual(wetB);
  expect(wetA.x).toBeGreaterThan(0);
  expect(wetB.x).toBeLessThan(0);
  expect(Math.hypot(wetA.x, wetA.y, wetA.z)).toBeCloseTo(1);
  expect(fieldWaterNormal(ground, 1, phaseA, 10)).toEqual(wetA);
  const distant = fieldWaterNormal(ground, 1, phaseA, 1000);
  expect(Math.hypot(distant.x, distant.y)).toBeLessThan(Math.hypot(wetA.x, wetA.y));
});

test("the shared wave field and terrain normal consumer resolve as one typed shader dependency graph", () => {
  expect(() =>
    tgpu.resolve([waterField, fieldWaterNormal, fieldWaterResponse, createTerrainSurface({})]),
  ).not.toThrow();
});
