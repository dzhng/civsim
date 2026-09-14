import { InspectorBase, type Camera, type Scene, type WebGPURenderer } from "three/webgpu";

export type GpuScope = "pose" | "grass" | "output" | "other";
type QueryKind = "render" | "compute";
interface PassSample {
  uid: string;
  kind: QueryKind;
  label: string;
  finished: boolean;
  ms: number | null;
}
interface Submission {
  submissionId: number;
  source: "battle-draw" | "render-only";
  threeFrameId: number;
  closed: boolean;
  reason: string | null;
  passes: PassSample[];
}

// These are retention limits, not rendering or timing budgets.
const MAX_SUBMISSIONS = 64;
const MAX_PASSES = 64;

/** Source-documented public fields omitted by the pinned @types/three backend.
 * Only timestamp RESULTS are pruned; query sets, offsets and buffers are untouched. */
export interface TimestampBackend {
  hasTimestamp: boolean;
  timestampQueryPool: Record<QueryKind, { timestamps: Map<string, number> } | null>;
  hasTimestampQuery(uid: string): boolean;
  getTimestamp(uid: string): number;
}

/** Inspector UIDs correlate pass work, not queue latency, copies or presentation.
 * Results remain query-incomplete until every observed pass has a valid result. */
export class GpuTelemetry extends InspectorBase {
  private records: Submission[] = [];
  private active: Submission | null = null;
  private nextId = 0;
  private scope: GpuScope = "other";
  private camera: Camera | null = null;
  private dropped = 0;
  private lastDroppedSubmissionId: number | null = null;
  private outsideSubmissionPasses = 0;

  constructor(
    private readonly frame: () => number,
    private readonly scene: Scene,
  ) {
    super();
  }

  beginSubmission(camera: Camera, source: Submission["source"] = "render-only"): void {
    if (this.active) {
      this.active.reason = "submission-not-finished";
      this.active.closed = true;
    }
    if (this.records.length === MAX_SUBMISSIONS) {
      const removed = this.records.shift()!;
      if (
        !removed.closed ||
        removed.reason ||
        removed.passes.length === 0 ||
        removed.passes.some((pass) => pass.ms === null)
      ) {
        this.dropped++;
        this.lastDroppedSubmissionId = removed.submissionId;
      }
    }
    this.camera = camera;
    this.active = {
      submissionId: ++this.nextId,
      source,
      threeFrameId: this.frame(),
      closed: false,
      reason: null,
      passes: [],
    };
    this.records.push(this.active);
  }

  get hasActiveSubmission(): boolean {
    return this.active !== null;
  }

  endSubmission(): void {
    if (this.active) {
      this.active.closed = true;
      if (this.active.passes.length === 0) this.active.reason = "no-recorded-passes";
    }
    this.active = null;
  }

  withScope<T>(scope: GpuScope, work: () => T): T {
    const before = this.scope;
    this.scope = scope;
    try {
      return work();
    } finally {
      this.scope = before;
    }
  }

  override beginRender(uid: string, scene: Scene, camera: Camera): void {
    const label =
      camera.userData.battleShadowCamera === true
        ? "shadow"
        : scene === this.scene && camera === this.camera
          ? "main"
          : scene !== this.scene && this.scope === "output"
            ? "post"
            : "other-render";
    this.beginPass(uid, "render", label);
  }

  override finishRender(uid: string): void {
    this.finishPass(uid);
  }
  override beginCompute(uid: string): void {
    this.beginPass(uid, "compute", this.scope);
  }
  override finishCompute(uid: string): void {
    this.finishPass(uid);
  }

  private beginPass(uid: string, kind: QueryKind, label: string): void {
    const record = this.active;
    if (!record) {
      this.outsideSubmissionPasses++;
      return;
    }
    if (record.passes.length === MAX_PASSES) {
      record.reason = "pass-retention-limit";
      return;
    }
    if (this.frame() !== record.threeFrameId || !uid.endsWith(`:f${record.threeFrameId}`))
      record.reason = "frame-identity-mismatch";
    // Pinned Three can issue r: UIDs for compute arrays; its public lookup then
    // selects the wrong pool. Never mistake that render result for compute work.
    if (!uid.startsWith(kind === "render" ? "r:" : "c:")) record.reason = "query-kind-mismatch";
    if (record.passes.some((pass) => pass.uid === uid)) record.reason = "duplicate-query-uid";
    record.passes.push({ uid, kind, label, finished: false, ms: null });
  }

  private finishPass(uid: string): void {
    const pass = this.active?.passes.find((entry) => entry.uid === uid);
    if (pass) pass.finished = true;
  }

  /** Called after existing async resolves, never awaited in the render hot path. */
  resolve(backend: TimestampBackend, enabled = true): void {
    for (const record of this.records) {
      if (!enabled || !backend.hasTimestamp) {
        record.reason = "timestamps-unavailable";
        continue;
      }
      for (const pass of record.passes) {
        if (pass.ms !== null || !pass.finished) continue;
        if (!pass.uid.startsWith(pass.kind === "render" ? "r:" : "c:")) continue;
        if (!backend.timestampQueryPool[pass.kind] || !backend.hasTimestampQuery(pass.uid))
          continue;
        const ms = backend.getTimestamp(pass.uid);
        if (Number.isFinite(ms) && ms >= 0) pass.ms = ms;
        else record.reason = "invalid-query-result";
      }
    }
    // Keep unresolved UIDs even across independently resolving render/compute
    // batches. Everything copied into the ledger, or outside its window, expires.
    const needed = new Set(
      this.records.flatMap((record) =>
        record.passes.filter((pass) => pass.ms === null).map((pass) => pass.uid),
      ),
    );
    for (const kind of ["render", "compute"] as const) {
      const results = backend.timestampQueryPool[kind]?.timestamps;
      if (results) for (const uid of results.keys()) if (!needed.has(uid)) results.delete(uid);
    }
  }

  latestSubmissionIdentity() {
    const record = this.records.at(-1);
    return record
      ? {
          submissionId: record.submissionId,
          threeFrameId: record.threeFrameId,
          source: record.source,
        }
      : null;
  }

  snapshot() {
    return {
      coverage: "recorded-render-and-compute-passes" as const,
      excludes: "uploads, copies, queue wait and presentation; outside-submission work",
      droppedSubmissions: this.dropped,
      lastDroppedSubmissionId: this.lastDroppedSubmissionId,
      outsideSubmissionPasses: this.outsideSubmissionPasses,
      maxRetainedSubmissions: MAX_SUBMISSIONS,
      maxPassesPerSubmission: MAX_PASSES,
      submissions: this.records.map((record) => {
        const complete =
          record.closed &&
          record.reason === null &&
          record.passes.length > 0 &&
          record.passes.every((pass) => pass.finished && pass.ms !== null);
        const sum = (kind: QueryKind) =>
          record.passes.reduce(
            (total, pass) => total + (pass.kind === kind ? (pass.ms ?? 0) : 0),
            0,
          );
        return {
          submissionId: record.submissionId,
          source: record.source,
          threeFrameId: record.threeFrameId,
          status: complete ? "complete" : record.reason ? "incomplete" : "pending",
          reason: record.reason,
          missingQueries: record.passes.filter((pass) => pass.ms === null).length,
          renderMs: complete ? sum("render") : null,
          computeMs: complete ? sum("compute") : null,
          measuredPassGpuMs: complete ? sum("render") + sum("compute") : null,
          passes: record.passes.map((pass) => ({ ...pass })),
        };
      }),
    };
  }
}

export function timestampBackend(renderer: WebGPURenderer): TimestampBackend {
  return renderer.backend as unknown as TimestampBackend;
}
