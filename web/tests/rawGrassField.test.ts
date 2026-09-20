// @vitest-environment node
import { test, expect, vi } from "vitest";
const handles = vi.hoisted(
  () =>
    [] as {
      updateRecords: ReturnType<typeof vi.fn>;
      adoptRecordCapacity: ReturnType<typeof vi.fn>;
      writeRecordRanges: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
      draw: ReturnType<typeof vi.fn>;
      route: ReturnType<typeof vi.fn>;
    }[],
);
vi.mock("../../packages/battle-renderer/src/world/grass", () => ({
  createRawGrass: vi.fn(async () => {
    const value = {
      updateRecords: vi.fn(async () => {}),
      adoptRecordCapacity: vi.fn(async () => {}),
      writeRecordRanges: vi.fn(),
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
import { createRawGrassField } from "../../packages/battle-renderer/src/world/grassField";
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
    // This terrain is entirely resident already, so moving the published
    // coverage across it changes a uniform. It is not a reason to resend the
    // records, and the old generation-revision upload did exactly that.
    expect(native.stats().uploads[1]).toBe(uploads[1]);
    expect(handles).toHaveLength(2);
    expect(handles.every((h) => h.dispose.mock.calls.length === 0)).toBe(true);
  } finally {
    native.dispose();
  }
  expect(handles.every((h) => h.dispose.mock.calls.length === 1)).toBe(true);
});

test("a travelling native consumer uploads bounded ranges, never the whole focus buffer again", async () => {
  handles.length = 0;
  const native = await createRawGrassField(
    {} as GPUDevice,
    {} as GPUBindGroupLayout,
    {} as never,
    productionBladeFieldProfile(),
  );
  const CELLS = 150;
  const CELL = 4;
  const ORIGIN = -(CELLS * CELL) / 2;
  const field = flatHeightField(ORIGIN, ORIGIN, CELLS, CELLS, CELL);
  const grid = { ...field, tint: new Uint8Array(CELLS * CELLS) };
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
    await native.settle();
    const [, ring] = handles;
    // The capacity buffer and its pipelines are built in loading, sized to the
    // whole capacity rather than to whatever happens to be live.
    expect(ring.adoptRecordCapacity).toHaveBeenCalledTimes(1);
    const [adopted] = ring.adoptRecordCapacity.mock.calls[0] as [Float32Array, number];
    const capacity = native.snapshot().ring.recordCapacity;
    expect(adopted.length / 16).toBe(capacity);
    const adoptions = ring.adoptRecordCapacity.mock.calls.length;
    const replacements = ring.updateRecords.mock.calls.length;
    const bound = native.stats().residency.rebuild.publishTilesPerStep;
    const slotRecords = native.stats().residency.rebuild.tileSlotRecords;
    for (let step = 1; step <= 12; step++) {
      await native.prepare({ ...camera, target: [step * 48, step * 24, 0] }, 900, wind, [0, 0, 1]);
      // A frame boundary: the owner's scheduled sampling slice runs here, and
      // the next prepare is the consumer that takes and uploads its ranges.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await native.prepare({ ...camera, target: [12 * 48, 12 * 24, 0] }, 900, wind, [0, 0, 1]);
    // Camera travel is range writes only: no second adoption, no whole-buffer
    // replacement, and no single frame handed more than one step's ranges.
    expect(ring.adoptRecordCapacity.mock.calls.length).toBe(adoptions);
    expect(ring.updateRecords.mock.calls.length).toBe(replacements);
    expect(ring.writeRecordRanges.mock.calls.length).toBeGreaterThan(0);
    for (const [source, edits, live] of ring.writeRecordRanges.mock.calls as [
      Float32Array,
      { start: number; count: number }[],
      number,
    ][]) {
      expect(source.length / 16).toBe(capacity);
      expect(edits.length).toBeLessThanOrEqual(bound);
      expect(live).toBeLessThanOrEqual(capacity);
      for (const edit of edits) {
        expect(edit.count).toBeLessThanOrEqual(slotRecords);
        expect(edit.start + edit.count).toBeLessThanOrEqual(capacity);
      }
    }
  } finally {
    native.dispose();
  }
});

test("edits published during capacity admission reach the GPU on the next prepare", async () => {
  handles.length = 0;
  const native = await createRawGrassField(
    {} as GPUDevice,
    {} as GPUBindGroupLayout,
    {} as never,
    productionBladeFieldProfile(),
  );
  const field = flatHeightField(-32, -32, 16, 16, 4);
  const camera: Camera3DParams = {
    target: [0, 0, 0],
    distance: 24,
    pitch: 0.5,
    yaw: 0,
    fovY: 0.8,
    aspect: 1.5,
    near: 0.1,
  };
  const wind = {
    direction: [1, 0] as [number, number],
    speed: 1,
    gustPhase: 0,
    velocity: [1, 0] as [number, number],
    frequency: 1,
    sharpness: 1,
  };
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let adopted!: () => void;
  const started = new Promise<void>((resolve) => {
    adopted = resolve;
  });
  let gpu = new Float32Array();
  const ring = handles[1];
  ring.adoptRecordCapacity.mockImplementation(async (records: Float32Array) => {
    gpu = new Float32Array(records);
    adopted();
    await held;
  });
  ring.writeRecordRanges.mockImplementation(
    (records: Float32Array, edits: { start: number; count: number }[]) => {
      for (const edit of edits)
        gpu.set(records.subarray(edit.start * 16, (edit.start + edit.count) * 16), edit.start * 16);
    },
  );
  try {
    native.setTerrain({ ...field, tint: new Uint8Array(256) }, field, "green-grass");
    const preparing = native.prepare(camera, 900, wind, [0, 0, 1]);
    await started;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(native.snapshot().ring.recordCount).toBeGreaterThan(0);
    release();
    await preparing;
    await native.prepare(camera, 900, wind, [0, 0, 1]);
    const ringState = native.snapshot().ring;
    expect(ring.writeRecordRanges).toHaveBeenCalled();
    const bytes = ringState.recordCount * 16 * 4;
    expect(
      Buffer.compare(
        Buffer.from(gpu.buffer, 0, bytes),
        Buffer.from(ringState.records!.buffer, 0, bytes),
      ),
    ).toBe(0);
  } finally {
    release();
    native.dispose();
  }
});

test("prepared visibility diagnostics report what route and draw actually obey", async () => {
  handles.length = 0;
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
  const encoder = {} as GPUCommandEncoder;
  const pass = {} as GPURenderPassEncoder;
  const calls = () => handles.map((h) => h.route.mock.calls.length + h.draw.mock.calls.length);
  try {
    native.setTerrain(grid, field, "green-grass");
    await native.prepare(camera, 900, wind, [0, 0, 1]);
    await native.settle();
    await native.prepare(camera, 900, wind, [0, 0, 1]);
    expect(native.stats().visibility).toEqual({ base: true, ring: true, far: true });
    native.route(encoder);
    native.draw(pass, {} as GPUBindGroup);
    const drawn = calls();
    expect(drawn.every((count) => count > 0)).toBe(true);

    native.setVisible(false);
    await native.prepare(camera, 900, wind, [0, 0, 1]);
    expect(native.stats().visibility).toEqual({ base: false, ring: false, far: true });
    // The records a switched-off field sampled are still resident — they are
    // the cache a re-engaged camera reuses — so a consumer asking whether grass
    // is on cannot read the answer off a positive record count.
    expect(native.snapshot().base.recordCount).toBeGreaterThan(0);
    expect(native.snapshot().ring.recordCount).toBeGreaterThan(0);
    native.route(encoder);
    native.draw(pass, {} as GPUBindGroup);
    expect(calls()).toEqual(drawn);

    native.setVisible(true);
    native.setFarVisible(false);
    await native.prepare(camera, 900, wind, [0, 0, 1]);
    expect(native.stats().visibility).toEqual({ base: true, ring: true, far: false });
    native.draw(pass, {} as GPUBindGroup);
    // `farVisible` is the draw argument the tiers actually read, not a layer switch.
    expect(handles[0].draw.mock.calls.at(-1)![3]).toBe(false);
    expect(calls().every((count, i) => count > drawn[i])).toBe(true);
  } finally {
    native.dispose();
  }
});
