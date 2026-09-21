// @vitest-environment node
import { expect, test, vi } from "vitest";
import { buildCrowdInstances } from "@packages/crowd-runtime/src/instanceData";

const inputs = () => ({
  positions: new Float32Array([0, 0, 1, 0]),
  facings: new Float32Array(2),
  alive: new Float32Array([1, 1]),
  count: 2,
  playback: [0, 1].map(() => ({
    appearanceId: 0,
    base: {
      source: { kind: "clip" as const, sample: { clip: "idle", phase: 0 } },
      destination: { clip: "idle", phase: 0 },
      weight: 1,
    },
  })),
});

test("normal instance building samples terrain once per soldier and retains seating", () => {
  const terrainHeight = vi.fn((x: number) => x + 1);
  const first = buildCrowdInstances({ ...inputs(), terrainHeight });
  expect(first.instances.map((instance) => instance.elevation)).toEqual([1, 2]);
  expect(first.elevationSpan).toBe(1);
  expect(terrainHeight).toHaveBeenCalledTimes(2);
  const second = buildCrowdInstances({ ...inputs(), terrainHeight }, first.instances);
  expect(second.instances).toBe(first.instances);
  expect(second.instances.map((instance) => instance.elevation)).toEqual([1, 2]);
  expect(terrainHeight).toHaveBeenCalledTimes(4);
});

test("normal submissions without a terrain sampler use zero elevation", () => {
  const result = buildCrowdInstances(inputs());
  expect(result.instances.map((instance) => instance.elevation)).toEqual([0, 0]);
  expect(result.elevationSpan).toBe(0);
});
