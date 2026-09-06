export type FrameBudgetResult =
  | { frameId: number; status: "measured"; gpuQueueMs: number }
  | { frameId: number; status: "dropped" }
  | { frameId: number; status: "error"; message: string };

interface Slot {
  queries: GPUQuerySet;
  resolve: GPUBuffer;
  readback: GPUBuffer;
  pending?: Promise<void>;
}

/** Scene-owned queue-elapsed timing, including CPU submission bubbles between
 * brackets, NOT active-pass GPU time. The caller owns CPU/rAF measurements and
 * consumes results; readbacks never block a frame or acquire a newer frame ID. */
export class FrameBudgetProbe {
  private readonly slots: Slot[] = [];
  private results: FrameBudgetResult[] = [];
  private lastFrame = -1;
  private disposed = false;
  private readonly bracketPipeline: GPUComputePipeline;

  constructor(
    private readonly device: GPUDevice,
    capacity = 8,
  ) {
    if (!device.features.has("timestamp-query"))
      throw new Error("Frame budget requires timestamp-query");
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 64)
      throw new Error("Frame budget readback capacity must be 1–64");
    this.bracketPipeline = device.createComputePipeline({
      label: "budget-probe:bracket-pipeline",
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          label: "budget-probe:bracket-shader",
          code: "@compute @workgroup_size(1) fn main() {}",
        }),
        entryPoint: "main",
      },
    });
    // Track partial allocation too: failure must not orphan earlier resources.
    const allocated: { destroy(): void }[] = [];
    try {
      for (let i = 0; i < capacity; i++) {
        const queries = device.createQuerySet({
          type: "timestamp",
          count: 2,
          label: "budget-probe:queries",
        });
        allocated.push(queries);
        const resolve = device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
          label: "budget-probe:resolve",
        });
        allocated.push(resolve);
        const readback = device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          label: "budget-probe:readback",
        });
        allocated.push(readback);
        this.slots.push({ queries, resolve, readback });
      }
    } catch (error) {
      for (const resource of allocated) resource.destroy();
      throw error;
    }
  }

  /** draw must synchronously submit the complete frame; no async callback. */
  measure(frameId: number, draw: () => void): void {
    if (this.disposed) throw new Error("Frame budget probe disposed");
    if (!Number.isSafeInteger(frameId) || frameId <= this.lastFrame)
      throw new Error("Frame budget IDs must increase strictly");
    this.lastFrame = frameId;
    const slot = this.slots.find((candidate) => !candidate.pending);
    if (!slot) {
      this.results.push({ frameId, status: "dropped" });
      draw();
      return;
    }
    try {
      this.bracket(slot, false);
    } catch (error) {
      this.recordError(frameId, error);
      draw();
      return;
    }
    try {
      draw();
    } catch (error) {
      this.recordError(frameId, error);
      throw error;
    }
    try {
      this.bracket(slot, true);
      slot.pending = this.read(slot, frameId).finally(() => {
        slot.pending = undefined;
      });
    } catch (error) {
      this.recordError(frameId, error);
    }
  }

  private bracket(slot: Slot, end: boolean): void {
    const encoder = this.device.createCommandEncoder({ label: "budget-probe:bracket" });
    const pass = encoder.beginComputePass({
      timestampWrites: {
        querySet: slot.queries,
        ...(end ? { endOfPassWriteIndex: 1 } : { beginningOfPassWriteIndex: 0 }),
      },
    });
    // Metal elides empty passes, including their timestamp writes. One no-op
    // invocation retains each bracket without touching any production resources.
    pass.setPipeline(this.bracketPipeline);
    pass.dispatchWorkgroups(1);
    pass.end();
    if (end) {
      encoder.resolveQuerySet(slot.queries, 0, 2, slot.resolve, 0);
      encoder.copyBufferToBuffer(slot.resolve, 0, slot.readback, 0, 16);
    }
    this.device.queue.submit([encoder.finish()]);
  }

  private async read(slot: Slot, frameId: number): Promise<void> {
    try {
      await slot.readback.mapAsync(GPUMapMode.READ, 0, 16);
      if (this.disposed) throw new Error("Frame budget probe disposed during readback");
      const times = new BigUint64Array(slot.readback.getMappedRange(0, 16));
      if (times[0] === 0n || times[1] <= times[0]) throw new Error("Invalid frame GPU timestamps");
      this.results.push({
        frameId,
        status: "measured",
        gpuQueueMs: Number(times[1] - times[0]) / 1e6,
      });
    } catch (error) {
      this.recordError(frameId, error);
    } finally {
      if (slot.readback.mapState === "mapped") slot.readback.unmap();
    }
  }

  private recordError(frameId: number, error: unknown): void {
    this.results.push({ frameId, status: "error", message: String(error) });
  }

  takeResults(): FrameBudgetResult[] {
    const results = this.results;
    this.results = [];
    return results;
  }

  /** Call after the sample loop, never per frame. */
  async drain(): Promise<void> {
    await Promise.all(this.slots.map((slot) => slot.pending));
  }

  /** Synchronous cancellation for finally/error paths; normal close drains first. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.slots) {
      slot.queries.destroy();
      slot.resolve.destroy();
      slot.readback.destroy();
    }
  }
}
