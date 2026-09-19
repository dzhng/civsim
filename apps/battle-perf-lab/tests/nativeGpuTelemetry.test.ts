/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
import { NativeGpuTelemetry } from "../src/nativeGpuTelemetry";
import { nativeGpuScope } from "../../../packages/battle-renderer/src/gpuScope";

function deviceFixture(supported = true, timestampValues?: bigint[]) {
  vi.stubGlobal("GPUBufferUsage", { QUERY_RESOLVE: 1, COPY_SRC: 2, COPY_DST: 4, MAP_READ: 8 });
  vi.stubGlobal("GPUMapMode", { READ: 1 });
  const mappings: (() => void)[] = [];
  const descriptors: (GPURenderPassDescriptor | GPUComputePassDescriptor)[] = [];
  const resources: { destroy: ReturnType<typeof vi.fn> }[] = [];
  const encoders: {
    resolveQuerySet: ReturnType<typeof vi.fn>;
    copyBufferToBuffer: ReturnType<typeof vi.fn>;
  }[] = [];
  const submit = vi.fn();
  const queue = { submit };
  const device = {
    features: new Set(supported ? ["timestamp-query"] : []),
    queue,
    createQuerySet: vi.fn(() => {
      const query = { destroy: vi.fn() };
      resources.push(query);
      return query;
    }),
    createBuffer: vi.fn(() => {
      const buffer = {
        destroy: vi.fn(),
        unmap: vi.fn(),
        mapAsync: vi.fn(() => new Promise<void>((resolve) => mappings.push(resolve))),
        getMappedRange: vi.fn((_offset: number, bytes: number) => {
          const values = new BigUint64Array(bytes / 8);
          for (let i = 0; i < values.length; i += 2) {
            values[i] = BigInt(i * 1000000);
            values[i + 1] = values[i] + 2000000n;
          }
          if (timestampValues) values.set(timestampValues);
          return values.buffer;
        }),
      };
      resources.push(buffer);
      return buffer;
    }),
    createCommandEncoder: vi.fn(() => {
      const encoder = {
        beginRenderPass: vi.fn((descriptor: GPURenderPassDescriptor) => {
          descriptors.push(descriptor);
          return { end: vi.fn() };
        }),
        beginComputePass: vi.fn((descriptor: GPUComputePassDescriptor) => {
          descriptors.push(descriptor);
          return { end: vi.fn() };
        }),
        resolveQuerySet: vi.fn(),
        copyBufferToBuffer: vi.fn(),
        finish: vi.fn(() => ({})),
      };
      encoders.push(encoder);
      return encoder;
    }),
  } as unknown as GPUDevice;
  async function drain() {
    mappings.splice(0).forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  function encode(kind: "render" | "compute" = "render", submit = true) {
    const encoder = device.createCommandEncoder();
    const pass =
      kind === "render"
        ? encoder.beginRenderPass({ colorAttachments: [] })
        : encoder.beginComputePass();
    pass.end();
    const buffer = encoder.finish();
    if (submit) device.queue.submit([buffer]);
    return buffer;
  }
  return { device, submit, queue, descriptors, resources, encoders, drain, encode };
}

afterEach(() => vi.unstubAllGlobals());

test("multiple actual submissions correlate to final render, excluding asynchronous timing copy", async () => {
  const f = deviceFixture(),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  nativeGpuScope(f.device, "pose", () => f.encode("compute"));
  nativeGpuScope(f.device, "main", () => f.encode());
  expect(telemetry.endSubmission(Promise.resolve())).toEqual({
    submissionId: 2,
    backend: "typegpu",
    source: "battle-draw",
  });
  expect(f.submit).toHaveBeenCalledTimes(3);
  expect(telemetry.eventsSince(0)?.events).toEqual([]);
  await f.drain();
  expect(telemetry.eventsSince(0)?.events[0]).toMatchObject({
    submissionId: 2,
    status: "complete",
    renderMs: 2,
    computeMs: 2,
    measuredPassGpuMs: 4,
    stages: [
      { label: "pose", ms: 2 },
      { label: "main", ms: 2 },
    ],
  });
  expect(telemetry.stats().busyQuerySlots).toBe(0);
  telemetry.dispose();
});

test("unsubmitted work is never assigned the previous frame and its query slot is quarantined", () => {
  const f = deviceFixture(),
    telemetry = new NativeGpuTelemetry(f.device, "raw");
  f.device.queue.submit([]);
  telemetry.beginSubmission("battle-draw");
  f.encode("render", false);
  expect(telemetry.endSubmission(Promise.resolve())).toBeNull();
  expect(telemetry.eventsSince(0)?.events).toEqual([]);
  expect(telemetry.stats().busyQuerySlots).toBe(1);
  telemetry.beginSubmission("render-only");
  telemetry.cancelSubmission();
  expect(telemetry.stats().busyQuerySlots).toBe(1);
  telemetry.dispose();
});

test("full ring reports missing measurements without fencing or corrupting pending frames", async () => {
  const f = deviceFixture(),
    telemetry = new NativeGpuTelemetry(f.device, "vgpu");
  for (let i = 0; i < 9; i++) {
    telemetry.beginSubmission("battle-draw");
    f.encode();
    telemetry.endSubmission(Promise.resolve());
  }
  const missing = telemetry.eventsSince(0)?.events[0];
  expect(missing).toMatchObject({
    submissionId: 17,
    status: "incomplete",
    reason: "query-ring-full",
    measuredPassGpuMs: null,
  });
  await f.drain();
  expect(
    telemetry.eventsSince(0)?.events.filter((event) => event.status === "complete"),
  ).toHaveLength(8);
  expect(telemetry.stats().querySlots).toBe(8);
  telemetry.dispose();
});

test("another timestamp owner is preserved and unavailable measurements stay null", () => {
  const f = deviceFixture(),
    telemetry = new NativeGpuTelemetry(f.device, "raw");
  telemetry.beginSubmission("render-only");
  const writes = {
    querySet: {} as GPUQuerySet,
    beginningOfPassWriteIndex: 0,
    endOfPassWriteIndex: 1,
  };
  const encoder = f.device.createCommandEncoder();
  encoder.beginComputePass({ timestampWrites: writes }).end();
  f.device.queue.submit([encoder.finish()]);
  telemetry.endSubmission(Promise.resolve());
  expect(f.descriptors[0].timestampWrites).toBe(writes);
  expect(telemetry.eventsSince(0)?.events[0]).toMatchObject({
    status: "incomplete",
    measuredPassGpuMs: null,
    reason: "pass-has-another-timestamp-owner",
  });
  telemetry.dispose();
});

test("unsupported timing preserves real submission identity and returns no fabricated events", () => {
  const f = deviceFixture(false),
    originalEncoder = f.device.createCommandEncoder,
    originalSubmit = f.device.queue.submit;
  const telemetry = new NativeGpuTelemetry(f.device, "raw");
  telemetry.beginSubmission("render-only");
  f.encode();
  expect(telemetry.endSubmission(Promise.resolve())?.submissionId).toBe(1);
  expect(telemetry.eventsSince(0)).toBeNull();
  expect(f.device.createQuerySet).not.toHaveBeenCalled();
  telemetry.dispose();
  telemetry.dispose();
  expect(f.device.createCommandEncoder).toBe(originalEncoder);
  expect(f.device.queue.submit).toBe(originalSubmit);
});

test("cancelled partially submitted presentation stays incomplete and releases safe slots", () => {
  const f = deviceFixture(),
    telemetry = new NativeGpuTelemetry(f.device, "raw");
  telemetry.beginSubmission("battle-draw");
  f.encode();
  telemetry.cancelSubmission();
  expect(telemetry.eventsSince(0)?.events[0]).toMatchObject({
    status: "incomplete",
    reason: "presentation-cancelled",
    measuredPassGpuMs: null,
  });
  expect(telemetry.stats().busyQuerySlots).toBe(0);
  telemetry.dispose();
  expect(f.resources.every((resource) => resource.destroy.mock.calls.length === 1)).toBe(true);
});

test("work encoded before measurement makes its receiving submission incomplete", () => {
  const f = deviceFixture(),
    telemetry = new NativeGpuTelemetry(f.device, "raw");
  const early = f.encode("compute", false);
  telemetry.beginSubmission("battle-draw");
  const current = f.encode("render", false);
  f.device.queue.submit([early, current]);
  telemetry.endSubmission(Promise.resolve());
  expect(telemetry.eventsSince(0)?.events[0]).toMatchObject({
    status: "incomplete",
    reason: "pass-encoded-outside-measurement",
    measuredPassGpuMs: null,
  });
  telemetry.dispose();
});

test("failed originating validation cannot become a complete GPU timing", async () => {
  const f = deviceFixture(),
    telemetry = new NativeGpuTelemetry(f.device, "raw");
  telemetry.beginSubmission("battle-draw");
  f.encode();
  telemetry.endSubmission(Promise.reject(Error("invalid command buffer")));
  await f.drain();
  expect(telemetry.eventsSince(0)?.events[0]).toMatchObject({
    status: "incomplete",
    reason: "submission-validation-failed",
    measuredPassGpuMs: null,
  });
  telemetry.dispose();
});

it("publishes ordered diagnostic pass details only when requested, without changing aggregate stages", async () => {
  const f = deviceFixture();
  const telemetry = new NativeGpuTelemetry(f.device, "raw", { passDetails: true });
  telemetry.beginSubmission("render-only");
  nativeGpuScope(f.device, "post", () => {
    f.encode();
    f.encode();
  });
  telemetry.endSubmission(Promise.resolve());
  await f.drain();
  const event = telemetry.eventsSince(0)!.events[0];
  expect(event.stages).toEqual([
    {
      kind: "render",
      label: "post",
      queries: 2,
      missingQueries: 0,
      ms: 4,
      observedGpuSpanMs: 4,
      observedGpuUnionMs: 4,
    },
  ]);
  expect(event.passes).toEqual([
    { kind: "render", label: "post", ms: 2, beginNs: "0", endNs: "2000000" },
    { kind: "render", label: "post", ms: 2, beginNs: "2000000", endNs: "4000000" },
  ]);
  event.passes![0].ms = 999;
  expect(telemetry.eventsSince(0)!.events[0].passes![0].ms).toBe(2);
  telemetry.dispose();
  const plain = new NativeGpuTelemetry(f.device, "raw");
  plain.beginSubmission("render-only");
  f.encode();
  plain.endSubmission(Promise.resolve());
  await f.drain();
  expect(plain.eventsSince(0)!.events[0]).not.toHaveProperty("passes");
  plain.dispose();
});

it("aggregates overlapping stages from raw ranges without adding stage unions", async () => {
  const epoch = 2n ** 63n;
  const f = deviceFixture(true, [epoch, epoch + 4000000n, epoch + 2000000n, epoch + 6000000n]);
  const telemetry = new NativeGpuTelemetry(f.device, "raw");
  telemetry.beginSubmission("render-only");
  nativeGpuScope(f.device, "main", () => f.encode());
  nativeGpuScope(f.device, "post", () => f.encode());
  telemetry.endSubmission(Promise.resolve());
  await f.drain();
  const event = telemetry.eventsSince(0)!.events[0];
  expect(event).toMatchObject({
    measuredPassGpuMs: 8,
    observedGpuSpanMs: 6,
    observedGpuUnionMs: 6,
  });
  expect(event.stages.map((s) => s.observedGpuUnionMs)).toEqual([4, 4]);
  expect(event).not.toHaveProperty("passes");
  telemetry.dispose();
});

it("withholds all interval aggregates when one query is invalid", async () => {
  const f = deviceFixture(true, [1n, 100n, 0n, 0n]);
  const telemetry = new NativeGpuTelemetry(f.device, "raw", { passDetails: true });
  telemetry.beginSubmission("render-only");
  f.encode();
  f.encode();
  telemetry.endSubmission(Promise.resolve());
  await f.drain();
  const event = telemetry.eventsSince(0)!.events[0];
  expect(event).toMatchObject({
    status: "incomplete",
    observedGpuSpanMs: null,
    observedGpuUnionMs: null,
  });
  expect(
    event.stages.every((s) => s.observedGpuSpanMs === null && s.observedGpuUnionMs === null),
  ).toBe(true);
  expect(event.passes!.every((p) => p.ms === null && p.beginNs === undefined)).toBe(true);
  telemetry.dispose();
});

test("the disabled lab control issues no query GPU work while actual submission identity advances", async () => {
  const f = deviceFixture();
  const telemetry = new NativeGpuTelemetry(f.device, "raw", { timingQueries: "disabled" });
  expect(f.device.features.has("timestamp-query")).toBe(true);
  telemetry.beginSubmission("battle-draw");
  nativeGpuScope(f.device, "main", () => f.encode());
  expect(telemetry.endSubmission(Promise.resolve())).toEqual({
    submissionId: 1,
    backend: "raw",
    source: "battle-draw",
  });
  telemetry.beginSubmission("render-only");
  f.encode("compute");
  expect(telemetry.endSubmission(Promise.resolve())).toEqual({
    submissionId: 2,
    backend: "raw",
    source: "render-only",
  });
  await f.drain();
  expect(f.device.createQuerySet).not.toHaveBeenCalled();
  expect(f.device.createBuffer).not.toHaveBeenCalled();
  // Each pass descriptor reaches the backend exactly as it was authored.
  expect(f.descriptors).toEqual([{ colorAttachments: [] }, undefined]);
  expect(
    f.encoders.every(
      (encoder) =>
        !encoder.resolveQuerySet.mock.calls.length && !encoder.copyBufferToBuffer.mock.calls.length,
    ),
  ).toBe(true);
  // Only the two scene submissions; the resolve/copy submission is gone with the queries.
  expect(f.submit).toHaveBeenCalledTimes(2);
  expect(telemetry.submissionCount).toBe(2);
  expect(telemetry.eventsSince(0)).toBeNull();
  expect(telemetry.stats()).toEqual({
    supported: false,
    timingQueries: "disabled",
    availability: "disabled-by-lab-control",
    submissionCount: 2,
    outsideSubmissionPasses: 0,
    querySlots: 0,
    busyQuerySlots: 0,
  });
  telemetry.dispose();
});

test("a lab-disabled control is distinguishable from an unsupported device and is never the default", () => {
  const unsupported = deviceFixture(false);
  const absent = new NativeGpuTelemetry(unsupported.device, "raw");
  expect(absent.stats()).toMatchObject({
    supported: false,
    timingQueries: "enabled",
    availability: "device-unsupported",
  });
  absent.dispose();
  const f = deviceFixture();
  const telemetry = new NativeGpuTelemetry(f.device, "raw");
  telemetry.beginSubmission("battle-draw");
  f.encode();
  telemetry.endSubmission(Promise.resolve());
  expect(telemetry.stats()).toMatchObject({
    supported: true,
    timingQueries: "enabled",
    availability: "available",
    querySlots: 1,
  });
  expect(f.device.createQuerySet).toHaveBeenCalledTimes(1);
  expect(f.descriptors[0].timestampWrites).toBeDefined();
  telemetry.dispose();
});
