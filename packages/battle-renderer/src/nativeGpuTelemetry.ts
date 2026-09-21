import {
  summarizeGpuTimestampRanges,
  type GpuTimestampRange,
} from "../../renderer-core/src/gpuTimestampRanges";
import { clearGpuScopeObserver, hasGpuScopeObserver, setGpuScopeObserver } from "./gpuScope";
export type NativeGpuBackend = "raw" | "typegpu" | "vgpu";
export type NativeGpuSource = "battle-draw" | "render-only";
/** Lab-only compile-time control over this observer's incremental query work. */
export type NativeTimingQueryMode = "enabled" | "disabled";
export type NativeGpuTimingAvailability =
  | "available"
  | "disabled-by-lab-control"
  | "device-unsupported";
export interface NativeSubmissionIdentity {
  submissionId: number;
  backend: NativeGpuBackend;
  source: NativeGpuSource;
}

/** What this observer can say about one logical submission window's drawing: the
 * draw commands its submitted command buffers handed to `queue.submit`.
 *
 * Offered is not drawn. The queue may still reject the batch asynchronously and
 * the frame may never present, so the renderer's own admission and presentation
 * validation is what permits publishing this as a successful frame's draw calls.
 * A count that cannot be taken honestly — an executed bundle this observer never
 * recorded, a submitted command buffer it never encoded, a repeat submission
 * WebGPU rejects — reports `unavailable` with its reason instead of a lower
 * bound. Observation needs no timestamp query and no readback, so the count and
 * its cost are the same under either timing mode. */
export interface NativeDrawObservation {
  status: "counted" | "unavailable";
  reason: string | null;
  /** Draw commands in the command buffers this window offered to `queue.submit`,
   * including each submitted execution of a render bundle's own draws. Null when
   * `status` is `unavailable`. */
  offeredDrawCalls: number | null;
  /** The subset of `offeredDrawCalls` issued indirectly: one encoded command
   * each, whose GPU-side parameters are never read back here. */
  indirectDrawCalls: number | null;
  /** Render bundle executions counted above, one per submitted invocation and
   * never one per bundle creation. */
  bundleExecutions: number | null;
  /** Draw commands this window encoded but had not offered to the queue when it
   * closed: a batch that was built and dropped, or a backend that submits after
   * `endSubmission` returns. Its own account, with its own reason, because work
   * the queue never received cannot make an offered count wrong. A window that
   * leaves drawing behind reports it here rather than as a confident frame total,
   * so a consumer publishing `offeredDrawCalls` as a presented frame's draw calls
   * must require this to be zero. */
  unsubmittedDrawCalls: number | null;
  unsubmittedReason: string | null;
}

/** Submission identity carrying the measurement taken at the same instant, so a
 * consumer attaches a count to the frame that actually offered it rather than to
 * whichever submission is latest when it asks. */
export interface NativeSubmissionMeasurement extends NativeSubmissionIdentity {
  draws: NativeDrawObservation;
}
interface Pass {
  kind: "render" | "compute";
  label: string;
  ended: boolean;
  submitted: boolean;
  ms: number | null;
  range?: GpuTimestampRange;
}
interface Slot {
  query: GPUQuerySet;
  resolve: GPUBuffer;
  readback: GPUBuffer;
  busy: boolean;
}
/** Draws a bundle execution contributed are folded into `direct`/`indirect`;
 * `bundles` counts the executions that contributed them. */
interface Draws {
  direct: number;
  indirect: number;
  bundles: number;
}

const drew = (draws: Draws) => draws.direct > 0 || draws.indirect > 0 || draws.bundles > 0;

/** Where one render pass or bundle encoder's observed draws accumulate, with the
 * reason its count stopped being trustworthy. */
interface DrawTarget {
  draws: Draws;
  reason: string | null;
}

/** One command encoder's recorded work, held until its command buffer is
 * submitted. `window` is the measurement that encoded it, so commands crossing a
 * window boundary are reported rather than quietly re-attributed. */
interface Encoded extends DrawTarget {
  window: number | null;
  passes: Pass[];
  submitted: boolean;
}

/** Draw entry points are reached by name and wrapped only where the encoder
 * implements them: a command the backend cannot issue is not one this observer
 * can miss. */
type DrawMethods = { [name: string]: ((...args: never[]) => unknown) | undefined };

interface Record {
  source: NativeGpuSource;
  window: number;
  startedAfter: number;
  slot: Slot | null;
  passes: Pass[];
  omitted: number;
  reason: string | null;
  /** Draws actually offered to the queue, accumulated as buffers are submitted. */
  offered: Draws;
  /** Encoders opened in this window, retained only to report what it encoded and
   * had not submitted, and released when the window closes. */
  encoded: Encoded[];
  drawReason: string | null;
  unsubmittedReason: string | null;
}
export interface NativeGpuEvent extends NativeSubmissionIdentity {
  sequence: number;
  status: "complete" | "incomplete";
  reason: string | null;
  missingQueries: number;
  renderMs: number | null;
  computeMs: number | null;
  /** Diagnostic sum; overlapping pass intervals can double-count elapsed time. */
  measuredPassGpuMs: number | null;
  observedGpuSpanMs: number | null;
  observedGpuUnionMs: number | null;
  /** Opt-in diagnostic detail; order is command encoding order. */
  passes?: {
    kind: Pass["kind"];
    label: string;
    ms: number | null;
    beginNs?: string;
    endNs?: string;
  }[];
  stages: {
    kind: Pass["kind"];
    label: string;
    observedGpuSpanMs: number | null;
    observedGpuUnionMs: number | null;
    queries: number;
    missingQueries: number;
    ms: number | null;
  }[];
}
const MAX_PASSES = 64;
const MAX_SLOTS = 8;
const MAX_EVENTS = 128;
const MAX_ENCODERS = 256;

/** Lab measurement of standard WebGPU calls, installed before library construction.
 * Resolve/copy work uses a separate submission and is never included in pass time,
 * the draw count or the returned final-render identity. No readback is awaited by
 * presentation.
 *
 * Two independent measurements share this owner because they share one seam — the
 * command encoders and `queue.submit` calls a window actually makes. Pass timing
 * needs timestamp queries and an asynchronous readback, and reports itself
 * unavailable without them. Draw observation needs neither: it counts the commands
 * offered to the queue as they are encoded and submitted, so it is complete
 * synchronously and carries its own reason when a count cannot be taken honestly.
 *
 * `timingQueries: "disabled"` withholds only this observer's incremental query work:
 * no query set, no injected timestampWrites, no resolve/copy submission and no
 * readback map. Submission counting, identity and draw observation stay installed,
 * so a disabled build is an incremental query/readback overhead control, not an
 * uninstrumented renderer. */
export class NativeGpuTelemetry {
  private readonly createEncoder: GPUDevice["createCommandEncoder"];
  private readonly submitQueue: GPUQueue["submit"];
  private readonly createBundleEncoder: GPUDevice["createRenderBundleEncoder"] | null;
  private readonly buffers = new WeakMap<GPUCommandBuffer, Encoded>();
  private readonly bundles = new WeakMap<GPURenderBundle, DrawTarget>();
  private readonly slots: Slot[] = [];
  private readonly events: NativeGpuEvent[] = [];
  private active: Record | null = null;
  private scope = "other";
  private closed = false;
  private count = 0;
  private sequence = 0;
  private window = 0;
  private outsidePasses = 0;
  readonly supported: boolean;
  /** Reported so a disabled control never reads as a device limitation. */
  readonly timingQueries: NativeTimingQueryMode;
  readonly availability: NativeGpuTimingAvailability;

  constructor(
    private readonly device: GPUDevice,
    private readonly backend: NativeGpuBackend,
    private readonly options: {
      passDetails?: boolean;
      timingQueries?: NativeTimingQueryMode;
    } = {},
  ) {
    if (hasGpuScopeObserver(device)) throw Error("GPU device already has a native telemetry owner");
    const deviceTimestamps = device.features.has("timestamp-query");
    this.timingQueries = options.timingQueries ?? "enabled";
    this.supported = this.timingQueries === "enabled" && deviceTimestamps;
    this.availability =
      this.timingQueries === "disabled"
        ? "disabled-by-lab-control"
        : deviceTimestamps
          ? "available"
          : "device-unsupported";
    this.createEncoder = device.createCommandEncoder;
    this.submitQueue = device.queue.submit;
    this.createBundleEncoder =
      typeof device.createRenderBundleEncoder === "function"
        ? device.createRenderBundleEncoder
        : null;
    const observer = this;
    device.createCommandEncoder = function (descriptor) {
      const encoder = observer.createEncoder.call(this, descriptor);
      // Installed under either timing mode: draw observation is not query work.
      if (observer.closed) return encoder;
      const encoded = observer.openEncoder();
      const render = encoder.beginRenderPass;
      const compute = encoder.beginComputePass;
      const finish: (descriptor?: GPUCommandBufferDescriptor) => GPUCommandBuffer = encoder.finish;
      encoder.beginRenderPass = function (descriptor: GPURenderPassDescriptor) {
        const sample = observer.pass(
          "render",
          descriptor.label,
          descriptor.timestampWrites !== undefined,
        );
        const pass = render.call(
          this,
          sample?.writes ? { ...descriptor, timestampWrites: sample.writes } : descriptor,
        );
        observer.watchDraws(pass, encoded);
        if (sample) observer.watchEnd(pass, sample.pass, encoded.passes);
        return pass;
      };
      encoder.beginComputePass = function (descriptor?: GPUComputePassDescriptor) {
        const sample = observer.pass(
          "compute",
          descriptor?.label,
          descriptor?.timestampWrites !== undefined,
        );
        // With no writes to inject the backend receives the caller's own argument,
        // an absent descriptor included, so both timing modes encode identically.
        const pass = sample?.writes
          ? compute.call(this, { ...descriptor, timestampWrites: sample.writes })
          : compute.call(this, descriptor as GPUComputePassDescriptor);
        if (sample) observer.watchEnd(pass, sample.pass, encoded.passes);
        return pass;
      };
      encoder.finish = function (descriptor?: GPUCommandBufferDescriptor) {
        const buffer = finish.call(this, descriptor);
        observer.buffers.set(buffer, encoded);
        return buffer;
      };
      return encoder;
    };
    const createBundleEncoder = this.createBundleEncoder;
    if (createBundleEncoder)
      device.createRenderBundleEncoder = function (descriptor) {
        const encoder = createBundleEncoder.call(this, descriptor);
        if (observer.closed) return encoder;
        // Recorded once here, and added again at every execution that submits it.
        const target: DrawTarget = { draws: { direct: 0, indirect: 0, bundles: 0 }, reason: null };
        observer.watchDraws(encoder, target);
        const finish = encoder.finish;
        encoder.finish = function (bundleDescriptor?: GPURenderBundleDescriptor) {
          const bundle = finish.call(this, bundleDescriptor);
          observer.bundles.set(bundle, target);
          return bundle;
        };
        return encoder;
      };
    device.queue.submit = function (commands: Iterable<GPUCommandBuffer>) {
      const submitted = Array.from(commands);
      // WebGPU reports invalid submissions asynchronously through error scopes, but
      // a lost device or a throwing backend fails here. Such a call offered nothing,
      // and it throws before this observer counts the batch or any command in it.
      observer.submitQueue.call(this, submitted);
      observer.count++;
      for (const buffer of submitted) observer.offer(buffer);
    };
    setGpuScopeObserver(device, this);
  }

  get measuring() {
    return this.active !== null;
  }

  get submissionCount() {
    return this.count;
  }

  withScope<T>(label: string, work: () => T): T {
    const previous = this.scope;
    this.scope = label;
    try {
      return work();
    } finally {
      this.scope = previous;
    }
  }

  beginSubmission(source: NativeGpuSource) {
    if (this.closed) throw Error("Native GPU telemetry disposed");
    if (this.active) throw Error("Native GPU measurement already active");
    let slot = this.slots.find((slot) => !slot.busy) ?? null;
    if (this.supported && !slot && this.slots.length < MAX_SLOTS) {
      slot = this.createSlot();
      this.slots.push(slot);
    }
    if (slot) slot.busy = true;
    this.active = {
      source,
      window: ++this.window,
      startedAfter: this.count,
      slot,
      passes: [],
      omitted: 0,
      reason: this.supported && !slot ? "query-ring-full" : null,
      offered: { direct: 0, indirect: 0, bundles: 0 },
      encoded: [],
      drawReason: null,
      unsubmittedReason: null,
    };
  }

  /** Call after the final scene submit. Validation must cover originating commands;
   * WebGPU may accept queue.submit synchronously but reject its work asynchronously. */
  endSubmission(validation: Promise<unknown>): NativeSubmissionMeasurement | null {
    const accepted = validation.then(
      () => true,
      () => false,
    );
    const record = this.active;
    if (!record) throw Error("No active native GPU measurement");
    this.active = null;
    // Closed before any timing decision below, and before this observer's own
    // resolve/copy submission, so neither can reach the draw count.
    const identity: NativeSubmissionMeasurement = {
      submissionId: this.count,
      backend: this.backend,
      source: record.source,
      draws: this.observeDraws(record),
    };
    if (this.count === record.startedAfter) {
      // Do not publish an event under a previous frame's submission identity.
      if (record.slot && record.passes.length === 0) record.slot.busy = false;
      return null;
    }
    if (!this.supported) return identity;
    if (record.passes.some((pass) => !pass.ended || !pass.submitted))
      record.reason = "unfinished-or-unsubmitted-pass";
    if (!record.passes.length && !record.reason) record.reason = "no-recorded-passes";
    if (record.reason || !record.slot) {
      this.publish(record, identity);
      // Unsubmitted encoders may still reference this query set. Quarantine that
      // slot until disposal rather than letting late writes corrupt another frame.
      if (record.slot && record.passes.every((pass) => pass.submitted)) record.slot.busy = false;
      return identity;
    }
    const slot = record.slot;
    try {
      const bytes = record.passes.length * 16;
      const encoder = this.createEncoder.call(this.device, { label: "native-timing-resolve" });
      encoder.resolveQuerySet(slot.query, 0, record.passes.length * 2, slot.resolve, 0);
      encoder.copyBufferToBuffer(slot.resolve, 0, slot.readback, 0, bytes);
      this.device.queue.submit([encoder.finish()]);
      void slot.readback
        .mapAsync(GPUMapMode.READ, 0, bytes)
        .then(async () => {
          if (this.closed) return;
          const values = new BigUint64Array(slot.readback.getMappedRange(0, bytes).slice(0));
          slot.readback.unmap();
          if (!(await accepted)) record.reason = "submission-validation-failed";
          for (let i = 0; i < record.passes.length; i++) {
            record.passes[i].range = { beginNs: values[i * 2], endNs: values[i * 2 + 1] };
            const duration = values[i * 2 + 1] - values[i * 2];
            if (duration < 0n || (values[i * 2] === 0n && values[i * 2 + 1] === 0n))
              record.reason = "invalid-query-result";
            else record.passes[i].ms = Number(duration) / 1e6;
          }
          this.publish(record, identity);
        })
        .catch(() => {
          if (!this.closed) {
            record.reason = "query-readback-failed";
            this.publish(record, identity);
          }
        })
        .finally(() => {
          // A read/copy failure must not leave a mapped buffer in the reusable ring.
          if (!this.closed) slot.readback.unmap();
          slot.busy = false;
        });
    } catch (error) {
      record.reason = "query-resolve-failed";
      this.publish(record, identity);
      slot.busy = false;
      throw error;
    }
    return identity;
  }

  /** Close failed preparation without attributing it to an earlier presentation. */
  cancelSubmission() {
    const record = this.active;
    if (!record) return;
    record.reason = "presentation-cancelled";
    this.endSubmission(Promise.resolve());
  }

  eventsSince(afterSequence: number) {
    if (!this.supported) return null;
    const oldestRetainedSequence = this.events[0]?.sequence ?? this.sequence + 1;
    return {
      nextSequence: this.sequence,
      oldestRetainedSequence,
      cursorGap: afterSequence < oldestRetainedSequence - 1,
      events: this.events
        .filter((event) => event.sequence > afterSequence)
        .map((event) => ({
          ...event,
          stages: event.stages.map((stage) => ({ ...stage })),
          ...(event.passes ? { passes: event.passes.map((pass) => ({ ...pass })) } : {}),
        })),
    };
  }

  stats() {
    return {
      supported: this.supported,
      timingQueries: this.timingQueries,
      availability: this.availability,
      submissionCount: this.count,
      outsideSubmissionPasses: this.outsidePasses,
      querySlots: this.slots.length,
      busyQuerySlots: this.slots.filter((slot) => slot.busy).length,
      // Logical retained buffers only; query sets and physical VRAM are outside
      // this accounting. Disposal destroys both buffers in every retained slot.
      requestedBuffers: this.closed ? 0 : this.slots.length * 2,
      requestedBufferBytes: this.closed
        ? 0
        : this.slots.reduce((bytes, slot) => bytes + slot.resolve.size + slot.readback.size, 0),
    };
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.active = null;
    clearGpuScopeObserver(this.device);
    this.device.createCommandEncoder = this.createEncoder;
    if (this.createBundleEncoder) this.device.createRenderBundleEncoder = this.createBundleEncoder;
    this.device.queue.submit = this.submitQueue;
    for (const slot of this.slots) {
      slot.query.destroy();
      slot.resolve.destroy();
      slot.readback.destroy();
    }
  }

  private createSlot(): Slot {
    const query = this.device.createQuerySet({
      type: "timestamp",
      count: MAX_PASSES * 2,
      label: "native-pass-timestamps",
    });
    let resolve: GPUBuffer | undefined;
    try {
      resolve = this.device.createBuffer({
        size: MAX_PASSES * 16,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
      const readback = this.device.createBuffer({
        size: MAX_PASSES * 16,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      return { query, resolve, readback, busy: false };
    } catch (error) {
      query.destroy();
      resolve?.destroy();
      throw error;
    }
  }

  /** Accumulates the window's draw account and releases its encoders. Runs
   * whatever the timing mode is, so the count never depends on query support. */
  private observeDraws(record: Record): NativeDrawObservation {
    let unsubmitted = 0;
    for (const encoded of record.encoded) {
      if (encoded.submitted) continue;
      unsubmitted += encoded.draws.direct + encoded.draws.indirect;
      // Routed to the account it belongs to: a defect in a batch the queue never
      // received says nothing about the batches it did.
      if (encoded.reason) record.unsubmittedReason ??= encoded.reason;
    }
    // Released here rather than at the next window, because a pending timestamp
    // readback keeps this record — and everything it holds — alive until it lands.
    record.encoded.length = 0;
    const offered = record.drawReason
      ? {
          status: "unavailable" as const,
          reason: record.drawReason,
          offeredDrawCalls: null,
          indirectDrawCalls: null,
          bundleExecutions: null,
        }
      : {
          status: "counted" as const,
          reason: null,
          offeredDrawCalls: record.offered.direct + record.offered.indirect,
          indirectDrawCalls: record.offered.indirect,
          bundleExecutions: record.offered.bundles,
        };
    return {
      ...offered,
      unsubmittedDrawCalls: record.unsubmittedReason ? null : unsubmitted,
      unsubmittedReason: record.unsubmittedReason,
    };
  }

  private openEncoder(): Encoded {
    const record = this.active;
    const encoded: Encoded = {
      window: record?.window ?? null,
      passes: [],
      draws: { direct: 0, indirect: 0, bundles: 0 },
      reason: null,
      submitted: false,
    };
    if (!record) return encoded;
    if (record.encoded.length === MAX_ENCODERS)
      record.unsubmittedReason ??= "encoder-retention-limit";
    else record.encoded.push(encoded);
    return encoded;
  }

  /** One command buffer handed to `queue.submit`. Pass bookkeeping and draw
   * attribution share this seam because both answer the same question: which
   * measurement window actually offered this work to the queue. */
  private offer(buffer: GPUCommandBuffer) {
    const record = this.active;
    const encoded = this.buffers.get(buffer);
    if (!encoded) {
      // Not encoded through this observer. The timing resolve/copy buffer takes
      // this path with no window open, which is how it stays out of every count.
      if (record) record.drawReason ??= "unobserved-command-buffer";
      return;
    }
    for (const pass of encoded.passes) {
      pass.submitted = true;
      if (record && !record.passes.includes(pass)) {
        record.omitted++;
        record.reason = "pass-encoded-outside-measurement";
      }
    }
    if (encoded.submitted) {
      // WebGPU rejects a second submission of the same command buffer, so a repeat
      // attempt is a validation error rather than a second execution to count.
      if (record) record.drawReason ??= "command-buffer-resubmitted";
      return;
    }
    encoded.submitted = true;
    if (!record) return;
    if (encoded.reason) record.drawReason ??= encoded.reason;
    if (encoded.window !== record.window && drew(encoded.draws))
      record.drawReason ??= "draw-commands-encoded-outside-measurement";
    record.offered.direct += encoded.draws.direct;
    record.offered.indirect += encoded.draws.indirect;
    record.offered.bundles += encoded.draws.bundles;
  }

  /** Counts the draw commands a render pass or bundle encoder actually records.
   * Each counter advances only after the underlying call returns, so a command the
   * backend rejected is never counted as encoded. A method the encoder does not
   * implement cannot draw; the multi-draw extensions take their command count from
   * a GPU buffer and so report unobservable rather than one draw each. */
  private watchDraws(encoder: GPURenderPassEncoder | GPURenderBundleEncoder, target: DrawTarget) {
    const methods = encoder as unknown as DrawMethods;
    const count = (name: string, observe: () => void) => {
      const original = methods[name];
      if (typeof original !== "function") return;
      methods[name] = function (this: unknown, ...args: never[]) {
        const result = original.apply(this, args);
        observe();
        return result;
      };
    };
    for (const name of ["draw", "drawIndexed"]) count(name, () => target.draws.direct++);
    for (const name of ["drawIndirect", "drawIndexedIndirect"])
      count(name, () => target.draws.indirect++);
    for (const name of ["multiDrawIndirect", "multiDrawIndexedIndirect"])
      count(name, () => (target.reason ??= "multi-draw-command-count-unobservable"));
    const execute = methods.executeBundles;
    if (typeof execute !== "function") return;
    const recorded = this.bundles;
    methods.executeBundles = function (this: unknown, bundles: Iterable<GPURenderBundle>) {
      // The argument is any iterable, so it is materialised once and that same
      // sequence forwarded: counting must not consume the caller's commands.
      const list = Array.from(bundles);
      (execute as (this: unknown, list: GPURenderBundle[]) => unknown).call(this, list);
      for (const bundle of list) {
        const source = recorded.get(bundle);
        if (!source) {
          target.reason ??= "unobserved-render-bundle";
          continue;
        }
        if (source.reason) target.reason ??= source.reason;
        target.draws.direct += source.draws.direct;
        target.draws.indirect += source.draws.indirect;
      }
      target.draws.bundles += list.length;
    } as DrawMethods[string];
  }

  private pass(kind: Pass["kind"], label: string | undefined, occupied: boolean) {
    // Pass records exist to carry timestamps; without queries there are none to
    // carry, and the draw count above does not depend on them.
    if (!this.supported) return null;
    const record = this.active;
    if (!record) {
      this.outsidePasses++;
      return {
        pass: {
          kind,
          label: label ?? `other-${kind}`,
          ended: false,
          submitted: false,
          ms: null,
        } as Pass,
        writes: null,
      };
    }
    if (record.passes.length === MAX_PASSES) {
      record.omitted++;
      record.reason = "pass-retention-limit";
      return null;
    }
    const pass: Pass = {
      kind,
      label: this.scope === "other" ? (label ?? `other-${kind}`) : this.scope,
      ended: false,
      submitted: false,
      ms: null,
    };
    const index = record.passes.length;
    record.passes.push(pass);
    if (occupied) record.reason = "pass-has-another-timestamp-owner";
    const writes =
      record.slot && !occupied
        ? {
            querySet: record.slot.query,
            beginningOfPassWriteIndex: index * 2,
            endOfPassWriteIndex: index * 2 + 1,
          }
        : null;
    return { pass, writes };
  }

  private watchEnd(
    encoder: GPURenderPassEncoder | GPUComputePassEncoder,
    pass: Pass,
    passes: Pass[],
  ) {
    const end = encoder.end;
    encoder.end = function () {
      end.call(this);
      pass.ended = true;
    };
    passes.push(pass);
  }

  private publish(record: Record, identity: NativeSubmissionIdentity) {
    if (this.closed) return;
    const complete =
      !record.reason && record.passes.length > 0 && record.passes.every((pass) => pass.ms !== null);
    const stages: NativeGpuEvent["stages"] = [];
    for (const pass of record.passes) {
      let stage = stages.find((stage) => stage.kind === pass.kind && stage.label === pass.label);
      if (!stage) {
        stage = {
          kind: pass.kind,
          label: pass.label,
          queries: 0,
          missingQueries: 0,
          ms: 0,
          observedGpuSpanMs: null,
          observedGpuUnionMs: null,
        };
        stages.push(stage);
      }
      stage.queries++;
      if (pass.ms === null) stage.missingQueries++;
      stage.ms! += pass.ms ?? 0;
    }
    const ranges = (passes: Pass[]) => {
      if (!complete || passes.some((pass) => !pass.range)) return null;
      return summarizeGpuTimestampRanges(passes.map((pass) => pass.range!));
    };
    const observed = ranges(record.passes);
    for (const stage of stages) {
      const metrics = ranges(
        record.passes.filter((pass) => pass.kind === stage.kind && pass.label === stage.label),
      );
      stage.observedGpuSpanMs = metrics?.observedGpuSpanMs ?? null;
      stage.observedGpuUnionMs = metrics?.observedGpuUnionMs ?? null;
    }
    const sum = (kind: Pass["kind"]) =>
      record.passes.reduce((total, pass) => total + (pass.kind === kind ? (pass.ms ?? 0) : 0), 0);
    if (!complete) for (const stage of stages) stage.ms = null;
    const renderMs = complete ? sum("render") : null;
    const computeMs = complete ? sum("compute") : null;
    if (this.events.length === MAX_EVENTS) this.events.shift();
    this.events.push({
      ...identity,
      sequence: ++this.sequence,
      status: complete ? "complete" : "incomplete",
      reason: record.reason,
      missingQueries: record.passes.filter((pass) => pass.ms === null).length + record.omitted,
      renderMs,
      computeMs,
      measuredPassGpuMs: complete ? renderMs! + computeMs! : null,
      observedGpuSpanMs: observed?.observedGpuSpanMs ?? null,
      observedGpuUnionMs: observed?.observedGpuUnionMs ?? null,
      stages,
      ...(this.options.passDetails
        ? {
            passes: record.passes.map(({ kind, label, ms, range }) => ({
              kind,
              label,
              ms: complete ? ms : null,
              ...(complete && range
                ? { beginNs: range.beginNs.toString(), endNs: range.endNs.toString() }
                : {}),
            })),
          }
        : {}),
    });
  }
}
