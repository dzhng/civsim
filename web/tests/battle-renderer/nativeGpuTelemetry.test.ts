// @vitest-environment node
import { vi, test, it, expect, afterEach } from "vitest";
import { NativeGpuTelemetry } from "../../../packages/battle-renderer/src/nativeGpuTelemetry";
import { nativeGpuScope } from "../../../packages/battle-renderer/src/gpuScope";

function deviceFixture(supported = true, timestampValues?: bigint[]) {
  vi.stubGlobal("GPUBufferUsage", { QUERY_RESOLVE: 1, COPY_SRC: 2, COPY_DST: 4, MAP_READ: 8 });
  vi.stubGlobal("GPUMapMode", { READ: 1 });
  const mappings: (() => void)[] = [];
  const descriptors: (GPURenderPassDescriptor | GPUComputePassDescriptor)[] = [];
  const executed: GPURenderBundle[][] = [];
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
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => {
      const buffer = {
        size: descriptor.size,
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
    createRenderBundleEncoder: vi.fn(() => {
      const encoder = { ...drawMethods(), finish: vi.fn(() => ({ bundle: true })) };
      return encoder;
    }),
    createCommandEncoder: vi.fn(() => {
      const encoder = {
        beginRenderPass: vi.fn((descriptor: GPURenderPassDescriptor) => {
          descriptors.push(descriptor);
          return {
            end: vi.fn(),
            ...drawMethods(),
            executeBundles: vi.fn((bundles: Iterable<GPURenderBundle>) => {
              executed.push(Array.from(bundles));
            }),
          };
        }),
        // A compute pass encoder implements no drawing at all.
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
  /** One command buffer: a pass, whatever `record` puts in it, and its submission. */
  function encode(
    kind: "render" | "compute" = "render",
    submit = true,
    record?: (pass: GPURenderPassEncoder) => void,
  ) {
    const encoder = device.createCommandEncoder();
    const pass =
      kind === "render"
        ? encoder.beginRenderPass({ colorAttachments: [] })
        : encoder.beginComputePass();
    record?.(pass as GPURenderPassEncoder);
    pass.end();
    const buffer = encoder.finish();
    if (submit) device.queue.submit([buffer]);
    return buffer;
  }
  function bundle(record: (encoder: GPURenderBundleEncoder) => void) {
    const encoder = device.createRenderBundleEncoder({ colorFormats: [] });
    record(encoder);
    return encoder.finish();
  }
  return {
    device,
    submit,
    queue,
    descriptors,
    executed,
    resources,
    encoders,
    drain,
    encode,
    bundle,
  };
}

/** A backend records nothing when it rejects a command, so these doubles validate
 * their vertex/index count and throw exactly as an encoder would. */
function drawMethods() {
  const validated = (name: string) =>
    vi.fn((count: number) => {
      if (count < 0) throw Error(`invalid ${name} count`);
    });
  return {
    draw: validated("draw"),
    drawIndexed: validated("drawIndexed"),
    drawIndirect: vi.fn(),
    drawIndexedIndirect: vi.fn(),
    multiDrawIndirect: vi.fn(),
    multiDrawIndexedIndirect: vi.fn(),
  };
}

/** The account of a window that encoded no drawing at all — a real zero, not an
 * absent measurement. */
const NO_DRAWS = {
  status: "counted",
  reason: null,
  offeredDrawCalls: 0,
  indirectDrawCalls: 0,
  bundleExecutions: 0,
  unsubmittedDrawCalls: 0,
  unsubmittedReason: null,
} as const;

/** The offered account withheld, because its reason says the total would be a
 * guess. What the window left unsubmitted is a separate account and survives. */
const unavailable = (reason: string, unsubmittedDrawCalls = 0) => ({
  status: "unavailable",
  reason,
  offeredDrawCalls: null,
  indirectDrawCalls: null,
  bundleExecutions: null,
  unsubmittedDrawCalls,
  unsubmittedReason: null,
});

/** An encoder method the standard type does not declare, reached the way a real
 * backend exposes it: present only where the device supports the extension. */
const extension = (pass: GPURenderPassEncoder, name: string) =>
  (pass as unknown as { [key: string]: (...args: unknown[]) => void })[name];

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
    draws: NO_DRAWS,
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
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
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
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
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
  expect(telemetry.stats()).toMatchObject({
    requestedBuffers: vi.mocked(f.device.createBuffer).mock.results.length,
    requestedBufferBytes: vi
      .mocked(f.device.createBuffer)
      .mock.results.reduce((bytes, result) => bytes + result.value.size, 0),
  });
  telemetry.dispose();
  expect(telemetry.stats()).toMatchObject({ requestedBuffers: 0, requestedBufferBytes: 0 });
  expect(f.resources.every((resource) => resource.destroy.mock.calls.length === 1)).toBe(true);
});

test("another timestamp owner is preserved and unavailable measurements stay null", () => {
  const f = deviceFixture(),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
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
  const telemetry = new NativeGpuTelemetry(f.device, "typegpu");
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
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
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
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
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
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
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
  const telemetry = new NativeGpuTelemetry(f.device, "typegpu", { passDetails: true });
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
  const plain = new NativeGpuTelemetry(f.device, "typegpu");
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
  const telemetry = new NativeGpuTelemetry(f.device, "typegpu");
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
  const telemetry = new NativeGpuTelemetry(f.device, "typegpu", { passDetails: true });
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

test("an unsupported device is distinguished from supported timestamp queries", () => {
  const unsupported = deviceFixture(false);
  const absent = new NativeGpuTelemetry(unsupported.device, "typegpu");
  expect(absent.stats()).toMatchObject({
    supported: false,
    availability: "device-unsupported",
  });
  absent.dispose();
  const f = deviceFixture();
  const telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  f.encode();
  telemetry.endSubmission(Promise.resolve());
  expect(telemetry.stats()).toMatchObject({
    supported: true,
    availability: "available",
    querySlots: 1,
  });
  expect(f.device.createQuerySet).toHaveBeenCalledTimes(1);
  expect(f.descriptors[0].timestampWrites).toBeDefined();
  telemetry.dispose();
});

// Draw observation. These cases use devices without timestamp queries unless
// the case is about timing itself: a submitted draw count is a synchronous fact
// about encoded commands, so it must never depend on query support or a readback.

test("the window counts the draws its submitted buffers offered, and only those", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => {
    pass.draw(3);
    pass.drawIndexed(6);
    pass.drawIndexed(6);
  });
  // A second buffer this window built and then dropped: encoded, never offered.
  f.encode("render", false, (pass) => pass.draw(3));
  // Compute work submits commands but draws nothing.
  f.encode("compute");
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    status: "counted",
    reason: null,
    offeredDrawCalls: 3,
    indirectDrawCalls: 0,
    bundleExecutions: 0,
    unsubmittedDrawCalls: 1,
    unsubmittedReason: null,
  });
  expect(f.submit).toHaveBeenCalledTimes(2);
  telemetry.dispose();
});

test("draws are summed across every command buffer and every submit of one window", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  const first = f.encode("render", false, (pass) => pass.draw(3));
  const second = f.encode("render", false, (pass) => pass.drawIndexed(6));
  // Two buffers in one submit, then a third buffer in a submit of its own.
  f.device.queue.submit([first, second]);
  f.encode("render", true, (pass) => pass.draw(3));
  const measurement = telemetry.endSubmission(Promise.resolve())!;
  expect(measurement).toMatchObject({ submissionId: 2, source: "battle-draw" });
  expect(measurement.draws).toEqual({ ...NO_DRAWS, offeredDrawCalls: 3 });
  telemetry.dispose();
});

test("indirect draws count as one command each and are named separately", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => {
    pass.draw(3);
    pass.drawIndirect({} as GPUBuffer, 0);
    pass.drawIndexedIndirect({} as GPUBuffer, 0);
  });
  // The observer never reads the GPU-side parameter buffer, so it reports how many
  // indirect commands it saw rather than how many primitives they will draw.
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 3,
    indirectDrawCalls: 2,
  });
  telemetry.dispose();
});

test("a reused render bundle counts per submitted execution, never per creation", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  const reused = f.bundle((encoder) => {
    encoder.draw(3);
    encoder.drawIndexed(6);
    encoder.drawIndirect({} as GPUBuffer, 0);
  });
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => {
    pass.executeBundles([reused]);
    pass.executeBundles([reused]);
    pass.draw(3);
  });
  // Two executions of a three-draw bundle, plus the pass's own draw.
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 7,
    indirectDrawCalls: 2,
    bundleExecutions: 2,
  });
  // The same bundle in a later window is counted again, from zero.
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => pass.executeBundles([reused, reused]));
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 6,
    indirectDrawCalls: 2,
    bundleExecutions: 2,
  });
  expect(f.executed).toEqual([[reused], [reused], [reused, reused]]);
  telemetry.dispose();
});

test("a bundle this observer never recorded withholds the count instead of undercounting", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  // Built before installation, so its draws were never seen.
  const foreign = { bundle: true } as unknown as GPURenderBundle;
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => {
    pass.draw(3);
    pass.executeBundles([foreign]);
  });
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual(
    unavailable("unobserved-render-bundle"),
  );
  telemetry.dispose();
});

test("a repeat submission of one command buffer is not a second execution to count", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  const buffer = f.encode("render", true, (pass) => pass.draw(3));
  // WebGPU rejects this; the device, not the observer, owns that validation, so
  // the call still reaches the queue and only the count refuses to double.
  f.device.queue.submit([buffer]);
  expect(f.submit).toHaveBeenCalledTimes(2);
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual(
    unavailable("command-buffer-resubmitted"),
  );
  telemetry.dispose();
});

test("a queue submit that fails at the call offered nothing", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => pass.draw(3));
  // WebGPU reports an invalid submission asynchronously; a lost device fails here.
  f.submit.mockImplementationOnce(() => {
    throw Error("device lost");
  });
  expect(() =>
    f.encode("render", true, (pass) => {
      pass.draw(3);
      pass.draw(3);
    }),
  ).toThrow("device lost");
  // The rejected batch is encoded work that never reached the queue.
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 1,
    unsubmittedDrawCalls: 2,
  });
  expect(telemetry.submissionCount).toBe(1);
  telemetry.dispose();
});

test("offered is not presented: validation failing later does not retract the count", async () => {
  const f = deviceFixture(),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => pass.draw(3));
  // The count answers what was handed to queue.submit. Whether that batch was
  // accepted and presented is the renderer's own validation, reported beside it
  // as the submission's timing status.
  const measurement = telemetry.endSubmission(Promise.reject(Error("invalid command buffer")))!;
  expect(measurement.draws).toEqual({ ...NO_DRAWS, offeredDrawCalls: 1 });
  await f.drain();
  expect(telemetry.eventsSince(0)?.events[0]).toMatchObject({
    submissionId: measurement.submissionId,
    status: "incomplete",
    reason: "submission-validation-failed",
  });
  telemetry.dispose();
});

test("draws encoded outside the window that submits them are reported, not re-attributed", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  const early = f.encode("render", false, (pass) => pass.draw(3));
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => pass.draw(3));
  f.device.queue.submit([early]);
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual(
    unavailable("draw-commands-encoded-outside-measurement"),
  );
  // A buffer with no drawing in it crosses the boundary without spoiling a count:
  // it contributes the zero draws it truthfully holds.
  const emptyEarly = f.encode("compute", false);
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => pass.draw(3));
  f.device.queue.submit([emptyEarly]);
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 1,
  });
  telemetry.dispose();
});

test("a submitted buffer this observer never encoded withholds the count", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => pass.draw(3));
  f.device.queue.submit([{} as GPUCommandBuffer]);
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual(
    unavailable("unobserved-command-buffer"),
  );
  telemetry.dispose();
});

test("the observer's own timing resolve and copy submission stays out of the count", async () => {
  const f = deviceFixture(),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => {
    pass.draw(3);
    pass.drawIndexed(6);
  });
  const measurement = telemetry.endSubmission(Promise.resolve())!;
  // Two submits reached the queue: the scene's, then this observer's resolve/copy.
  expect(f.submit).toHaveBeenCalledTimes(2);
  expect(measurement).toEqual({
    submissionId: 1,
    backend: "typegpu",
    source: "battle-draw",
    draws: { ...NO_DRAWS, offeredDrawCalls: 2 },
  });
  await f.drain();
  // The next window starts clean rather than inheriting the resolve submission.
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => pass.draw(3));
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 1,
  });
  telemetry.dispose();
});

test("supported and unsupported devices observe the identical draw count", () => {
  const observe = (telemetry: NativeGpuTelemetry, f: ReturnType<typeof deviceFixture>) => {
    const reused = f.bundle((encoder) => encoder.draw(3));
    telemetry.beginSubmission("battle-draw");
    f.encode("compute");
    f.encode("render", true, (pass) => {
      pass.draw(3);
      pass.drawIndexed(6);
      pass.drawIndirect({} as GPUBuffer, 0);
      pass.executeBundles([reused]);
    });
    f.encode("render", false, (pass) => pass.draw(3));
    const draws = telemetry.endSubmission(Promise.resolve())?.draws;
    telemetry.dispose();
    return draws;
  };
  const expected = {
    status: "counted",
    reason: null,
    offeredDrawCalls: 4,
    indirectDrawCalls: 1,
    bundleExecutions: 1,
    unsubmittedDrawCalls: 1,
    unsubmittedReason: null,
  };
  const enabled = deviceFixture();
  expect(observe(new NativeGpuTelemetry(enabled.device, "typegpu"), enabled)).toEqual(expected);
  const unsupported = deviceFixture(false);
  expect(observe(new NativeGpuTelemetry(unsupported.device, "typegpu"), unsupported)).toEqual(
    expected,
  );
  // Only the query work differs between the modes, never the drawing they watch.
  expect(enabled.device.createQuerySet).toHaveBeenCalled();
  expect(unsupported.device.createQuerySet).not.toHaveBeenCalled();
});

test("a submission that carried no command buffer reports no measurement at all", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  f.encode("render", false, (pass) => pass.draw(3));
  // No identity means no frame; a count under a previous frame's id would be worse
  // than none.
  expect(telemetry.endSubmission(Promise.resolve())).toBeNull();
  telemetry.dispose();
});

test("a cancelled window's draws never reach the next window's count", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => pass.draw(3));
  telemetry.cancelSubmission();
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => pass.drawIndexed(6));
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 1,
  });
  telemetry.dispose();
});

test("encoder retention is bounded, and only the unsubmitted account depends on it", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  for (let i = 0; i < 256; i++) f.encode("render", true, (pass) => pass.draw(3));
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 256,
  });
  // Past the retention bound this window can no longer say what it left behind. The
  // offered total is unaffected: it accrues as buffers are submitted, not from the
  // retained encoders.
  telemetry.beginSubmission("battle-draw");
  for (let i = 0; i < 257; i++) f.encode("render", true, (pass) => pass.draw(3));
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 257,
    unsubmittedDrawCalls: null,
    unsubmittedReason: "encoder-retention-limit",
  });
  telemetry.dispose();
});

test("disposal restores every patched entry point and counts nothing afterwards", () => {
  const f = deviceFixture(false),
    originalBundleEncoder = f.device.createRenderBundleEncoder;
  const telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => pass.draw(3));
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 1,
  });
  telemetry.dispose();
  expect(f.device.createRenderBundleEncoder).toBe(originalBundleEncoder);
  // A disposed observer owns no device and must not resurrect a window.
  expect(() => telemetry.beginSubmission("battle-draw")).toThrow("disposed");
  f.encode("render", true, (pass) => pass.draw(3));
  expect(telemetry.submissionCount).toBe(1);
});

test("a device without render bundles is observed without pretending it has them", () => {
  const f = deviceFixture(false);
  delete (f.device as { createRenderBundleEncoder?: unknown }).createRenderBundleEncoder;
  const telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => pass.draw(3));
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 1,
  });
  telemetry.dispose();
  expect(f.device.createRenderBundleEncoder).toBeUndefined();
});

test("work submitted after its window closed is left behind, never counted as offered", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  const late = f.encode("render", false, (pass) => {
    pass.draw(3);
    pass.draw(3);
  });
  f.encode("compute");
  // A window reports only what it had offered when it closed. A backend that
  // submits after `endSubmission` appears here as nothing offered and work left
  // behind, rather than as a confidently wrong frame total.
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    unsubmittedDrawCalls: 2,
  });
  f.device.queue.submit([late]);
  // Offered while no window was open, it joins no other frame's count either.
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => pass.draw(3));
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 1,
  });
  telemetry.dispose();
});

test("a defect in work the queue never received leaves the offered count intact", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  const foreign = { bundle: true } as unknown as GPURenderBundle;
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => pass.draw(3));
  // Built and dropped, and its own total is not knowable. That is the dropped
  // batch's problem, not the submitted one's.
  f.encode("render", false, (pass) => {
    pass.draw(3);
    pass.executeBundles([foreign]);
  });
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    status: "counted",
    reason: null,
    offeredDrawCalls: 1,
    indirectDrawCalls: 0,
    bundleExecutions: 0,
    unsubmittedDrawCalls: null,
    unsubmittedReason: "unobserved-render-bundle",
  });
  telemetry.dispose();
});

test("a multi-draw command taking its count from a GPU buffer withholds the total", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => {
    pass.draw(3);
    // How many draws this records is read by the GPU, never by this observer, so
    // counting it as one command would be a guess.
    extension(pass, "multiDrawIndirect")({}, 0, 8);
  });
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual(
    unavailable("multi-draw-command-count-unobservable"),
  );
  telemetry.dispose();
});

test("a draw the backend rejects is not counted as encoded", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => {
    pass.draw(3);
    expect(() => pass.drawIndexed(-1)).toThrow("invalid drawIndexed count");
  });
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 1,
  });
  telemetry.dispose();
});

test("counting a bundle execution does not consume the caller's sequence", () => {
  const f = deviceFixture(false),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  const reused = f.bundle((encoder) => encoder.draw(3));
  telemetry.beginSubmission("battle-draw");
  f.encode("render", true, (pass) =>
    pass.executeBundles(
      (function* () {
        yield reused;
        yield reused;
      })(),
    ),
  );
  // A single-pass iterable must still reach the backend in full.
  expect(f.executed).toEqual([[reused, reused]]);
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 2,
    bundleExecutions: 2,
  });
  telemetry.dispose();
});

test("draws past the pass retention limit are counted even though their timing is not", async () => {
  const f = deviceFixture(),
    telemetry = new NativeGpuTelemetry(f.device, "typegpu");
  telemetry.beginSubmission("battle-draw");
  for (let i = 0; i < 65; i++) f.encode("render", true, (pass) => pass.draw(3));
  // The draw account is not a pass record, so the cap on what can be timestamped
  // does not silently cap what can be counted.
  expect(telemetry.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 65,
  });
  await f.drain();
  expect(telemetry.eventsSince(0)?.events[0]).toMatchObject({
    status: "incomplete",
    reason: "pass-retention-limit",
    missingQueries: 65,
  });
  telemetry.dispose();
});

test("pass records are the timing path's, and are not allocated without it", () => {
  const enabled = deviceFixture(),
    on = new NativeGpuTelemetry(enabled.device, "typegpu");
  enabled.encode("render", true, (pass) => pass.draw(3));
  expect(on.stats().outsideSubmissionPasses).toBe(1);
  on.dispose();
  const f = deviceFixture(false),
    off = new NativeGpuTelemetry(f.device, "typegpu");
  f.encode("render", true, (pass) => pass.draw(3));
  // `outsideSubmissionPasses` counts pass records, which the withheld query work
  // never creates. Draw observation is unaffected either way.
  expect(off.stats().outsideSubmissionPasses).toBe(0);
  off.beginSubmission("battle-draw");
  f.encode("render", true, (pass) => pass.draw(3));
  expect(off.endSubmission(Promise.resolve())?.draws).toEqual({
    ...NO_DRAWS,
    offeredDrawCalls: 1,
  });
  off.dispose();
});
