// @vitest-environment node
import { test, expect, vi } from "vitest";
const handles = vi.hoisted(
  () =>
    [] as {
      updateRecords: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
      draw: ReturnType<typeof vi.fn>;
    }[],
);
vi.mock("../../apps/battle-perf-lab/src/raw/grass", () => ({
  createRawGrass: vi.fn(async () => {
    const value = {
      updateRecords: vi.fn(async () => {}),
      dispose: vi.fn(),
      update: vi.fn(),
      route: vi.fn(),
      draw: vi.fn(),
      stats: () => ({ pipelineBuilds: 4 }),
      commands: {},
      visible: [],
    };
    handles.push(value);
    return value;
  }),
}));
import { createRawGrassField } from "../../apps/battle-perf-lab/src/raw/grassField";
import { productionBladeFieldProfile } from "@packages/game-renderer/src/battle/battleGrassResidency";
import { flatHeightField } from "@packages/game-renderer/src/terrain/heightField";
import type { Camera3DParams } from "@packages/renderer-core/src/camera3d";

test("grass publication revisions upload once and keep both pipelines alive across camera history", async () => {
  const native = await createRawGrassField(
    {} as GPUDevice,
    {} as GPUBindGroupLayout,
    {} as never,
    productionBladeFieldProfile(),
  );
  const field = flatHeightField(-32, -32, 16, 16, 4),
    grid = { ...field, tint: new Uint8Array(256) };
  const camera: Camera3DParams = {
    target: [0, 0, 0],
    distance: 24,
    pitch: 0.5,
    yaw: 0,
    fovY: 0.8,
    aspect: 1.5,
    near: 0.1,
    far: 2000,
  };
  const wind = {
    direction: [1, 0] as [number, number],
    speed: 1,
    gustPhase: 0,
    velocity: [1, 0] as [number, number],
    frequency: 1,
    sharpness: 1,
  };
  try {
    native.setTerrain(grid, field, "green-grass");
    await native.prepare(camera, 900, wind, [0, 0, 1]);
    await native.settle();
    await native.prepare(camera, 900, wind, [0, 0, 1]);
    const uploads = native.stats().uploads;
    native.draw({} as GPURenderPassEncoder, {} as GPUBindGroup, true);
    const order = handles
      .flatMap((h, layer) =>
        h.draw.mock.calls.map((args, i) => ({
          invocation: h.draw.mock.invocationCallOrder[i],
          layer,
          stage: args[4],
          tier: args[5],
        })),
      )
      .sort((a, b) => a.invocation - b.invocation);
    // Both spatial layers must finish a tier before the next tier can occlude it.
    expect(order.map(({ stage, tier }) => `${stage}:${tier}`)).toEqual([
      "depth:0",
      "depth:0",
      "depth:1",
      "depth:1",
      "beauty:0",
      "beauty:0",
      "beauty:1",
      "beauty:1",
      "beauty:2",
      "beauty:2",
    ]);
    expect(native.snapshot().ring.records!.length).toBeGreaterThan(0);
    await native.prepare({ ...camera, target: [10, 0, 0] }, 900, wind, [0, 0, 1]);
    expect(native.stats().uploads).toEqual(uploads);
    await native.prepare({ ...camera, target: [100, 0, 0] }, 900, wind, [0, 0, 1]);
    await native.settle();
    expect(native.stats().uploads[0]).toBe(uploads[0]);
    expect(native.stats().uploads[1]).toBe(uploads[1] + 1);
    expect(handles).toHaveLength(2);
    expect(handles.every((h) => h.dispose.mock.calls.length === 0)).toBe(true);
  } finally {
    native.dispose();
  }
  expect(handles.every((h) => h.dispose.mock.calls.length === 1)).toBe(true);
});
