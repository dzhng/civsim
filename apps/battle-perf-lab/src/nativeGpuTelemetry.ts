export type NativeGpuBackend = "raw" | "typegpu" | "vgpu";
export type NativeGpuSource = "battle-draw" | "render-only";
export interface NativeSubmissionIdentity {
  submissionId: number;
  backend: NativeGpuBackend;
  source: NativeGpuSource;
}
interface Pass {
  kind: "render" | "compute";
  label: string;
  ended: boolean;
  submitted: boolean;
  ms: number | null;
  beginNs?: string;
  endNs?: string;
}
interface Slot {
  query: GPUQuerySet;
  resolve: GPUBuffer;
  readback: GPUBuffer;
  busy: boolean;
}
interface Record {
  source: NativeGpuSource;
  startedAfter: number;
  slot: Slot | null;
  passes: Pass[];
  omitted: number;
  reason: string | null;
}
export interface NativeGpuEvent extends NativeSubmissionIdentity {
  sequence: number;
  status: "complete" | "incomplete";
  reason: string | null;
  missingQueries: number;
  renderMs: number | null;
  computeMs: number | null;
  measuredPassGpuMs: number | null;
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
    queries: number;
    missingQueries: number;
    ms: number | null;
  }[];
}
const MAX_PASSES = 64;
const MAX_SLOTS = 8;
const MAX_EVENTS = 128;
const observers = new WeakMap<GPUDevice, NativeGpuTelemetry>();

/** Scope names describe owned work; runtime libraries still encode every pass. */
export function nativeGpuScope<T>(device: GPUDevice, label: string, work: () => T): T {
  const observer = observers.get(device);
  return observer ? observer.withScope(label, work) : work();
}

/** Lab measurement of standard WebGPU calls, installed before library construction.
 * Resolve/copy work uses a separate submission and is never included in pass time
 * or the returned final-render identity. No readback is awaited by presentation. */
export class NativeGpuTelemetry {
  private readonly createEncoder: GPUDevice["createCommandEncoder"];
  private readonly submitQueue: GPUQueue["submit"];
  private readonly buffers = new WeakMap<GPUCommandBuffer, Pass[]>();
  private readonly slots: Slot[] = [];
  private readonly events: NativeGpuEvent[] = [];
  private active: Record | null = null;
  private scope = "other";
  private closed = false;
  private count = 0;
  private sequence = 0;
  private outsidePasses = 0;
  readonly supported: boolean;

  constructor(
    private readonly device: GPUDevice,
    private readonly backend: NativeGpuBackend,
    private readonly options: { passDetails?: boolean } = {},
  ) {
    if (observers.has(device)) throw Error("GPU device already has a native telemetry owner");
    this.supported = device.features.has("timestamp-query");
    this.createEncoder = device.createCommandEncoder;
    this.submitQueue = device.queue.submit;
    const observer = this;
    device.createCommandEncoder = function (descriptor) {
      const encoder = observer.createEncoder.call(this, descriptor);
      if (!observer.supported || observer.closed) return encoder;
      const passes: Pass[] = [];
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
        if (sample) observer.watchEnd(pass, sample.pass, passes);
        return pass;
      };
      encoder.beginComputePass = function (descriptor: GPUComputePassDescriptor = {}) {
        const sample = observer.pass(
          "compute",
          descriptor.label,
          descriptor.timestampWrites !== undefined,
        );
        const pass = compute.call(
          this,
          sample?.writes ? { ...descriptor, timestampWrites: sample.writes } : descriptor,
        );
        if (sample) observer.watchEnd(pass, sample.pass, passes);
        return pass;
      };
      encoder.finish = function (descriptor?: GPUCommandBufferDescriptor) {
        const buffer = finish.call(this, descriptor);
        observer.buffers.set(buffer, passes);
        return buffer;
      };
      return encoder;
    };
    device.queue.submit = function (commands: Iterable<GPUCommandBuffer>) {
      const submitted = Array.from(commands);
      observer.submitQueue.call(this, submitted);
      observer.count++;
      for (const buffer of submitted)
        for (const pass of observer.buffers.get(buffer) ?? []) {
          pass.submitted = true;
          if (observer.active && !observer.active.passes.includes(pass)) {
            observer.active.omitted++;
            observer.active.reason = "pass-encoded-outside-measurement";
          }
        }
    };
    observers.set(device, this);
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
      startedAfter: this.count,
      slot,
      passes: [],
      omitted: 0,
      reason: this.supported && !slot ? "query-ring-full" : null,
    };
  }

  /** Call after the final scene submit. Validation must cover originating commands;
   * WebGPU may accept queue.submit synchronously but reject its work asynchronously. */
  endSubmission(validation: Promise<unknown>): NativeSubmissionIdentity | null {
    const accepted = validation.then(
      () => true,
      () => false,
    );
    const record = this.active;
    if (!record) throw Error("No active native GPU measurement");
    this.active = null;
    const identity = { submissionId: this.count, backend: this.backend, source: record.source };
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
            if (this.options.passDetails) {
              record.passes[i].beginNs = values[i * 2].toString();
              record.passes[i].endNs = values[i * 2 + 1].toString();
            }
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
      submissionCount: this.count,
      outsideSubmissionPasses: this.outsidePasses,
      querySlots: this.slots.length,
      busyQuerySlots: this.slots.filter((slot) => slot.busy).length,
    };
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.active = null;
    observers.delete(this.device);
    this.device.createCommandEncoder = this.createEncoder;
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

  private pass(kind: Pass["kind"], label: string | undefined, occupied: boolean) {
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
        stage = { kind: pass.kind, label: pass.label, queries: 0, missingQueries: 0, ms: 0 };
        stages.push(stage);
      }
      stage.queries++;
      if (pass.ms === null) stage.missingQueries++;
      stage.ms! += pass.ms ?? 0;
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
      stages,
      ...(this.options.passDetails
        ? {
            passes: record.passes.map(({ kind, label, ms, beginNs, endNs }) => ({
              kind,
              label,
              ms: complete ? ms : null,
              ...(complete ? { beginNs, endNs } : {}),
            })),
          }
        : {}),
    });
  }
}
