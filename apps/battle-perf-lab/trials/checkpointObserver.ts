/**
 * Correctness-only checkpoint observation for a held benchmark run.
 *
 * The problem. A held run's archived report carries each frame's identity and the
 * camera it consumed, but no scene counts. `__game.stats()` carries the counts but
 * no frame identity. Reading the two on a timer correlates them wrongly, because a
 * frame's counts are published *during* preparation while `frameMetrics` is only
 * published at the *end* of it: `apps/battle-perf-lab/src/raw/battleScene.ts:308`
 * assigns `lastCamera` and `apps/battle-perf-lab/src/live/NativeBattleRenderer.ts`
 * uploads the crowd several `await`s before `web/src/battle/battleLoop.ts:273`
 * advances `frameId`. A poll landing inside a presentation therefore reports the
 * next frame's counts beside this frame's identity.
 *
 * The boundary. This observer never polls. It wraps `requestAnimationFrame` in the
 * page and samples at *registration*, and only when the completed frame id is newer
 * than the one the previous registration saw. That instant is coherent, from three
 * source facts:
 *
 * 1. `completeFrame` (`web/src/battle/battleLoop.ts:262-302`) publishes `frameId`,
 *    records the consumed camera and calls `benchmark.frame(...)`, which sets
 *    `status().elapsedMs` — all three for the same frame, in one synchronous block.
 * 2. `completeFrame` runs inside the frame promise, not after it: the loop returns
 *    `completeBattlePresentation(...)` (`battleLoop.ts:410`), whose promise is
 *    `result.then((receipt) => finish(receipt, true))`
 *    (`web/src/battle/presentationCompletion.ts:31`) and `finish` invokes the
 *    completion callback synchronously. `startSceneFrames`
 *    (`web/src/shared/sceneFrames.ts:81-95`) re-registers the pump only in that
 *    promise's `.then`, so the pump's registration always follows a published
 *    `frameId` and always precedes the next `frame(now)` call.
 * 3. Preparation for frame N+1 can only begin inside that next `frame(now)`, which
 *    a browser animation frame must deliver. So between `frameId` reaching N and
 *    the pump's registration, nothing is preparing — and every registration made
 *    *during* an N+1 preparation still sees N, which the pump already consumed, so
 *    it cannot sample. One sample per completed frame, at the only coherent point.
 *
 * This requires no callback classification and no confidence gate. It does not
 * matter whether the pump or some other caller makes the first registration after
 * a new `frameId`: any registration in that window is before the next preparation,
 * which is the whole of the claim.
 *
 * An observed run is never timing evidence — wrapping the page's frame scheduling
 * is itself an intervention — and `admissibleAsTimingEvidence` says so in the
 * archive.
 */

/** One interior checkpoint inside each phase of `BENCHMARK_CAMERA_PHASES`. */
export const CHECKPOINT_SECONDS = [15, 60, 120, 180, 240, 285] as const;
/** How far a completed frame may sit from a checkpoint and still stand for it. */
export const CHECKPOINT_TOLERANCE_MS = 50;

export interface CheckpointObserverConfig {
  checkpointsMs: number[];
  toleranceMs: number;
}

export const checkpointObserverConfig = (
  seconds: readonly number[] = CHECKPOINT_SECONDS,
  toleranceMs = CHECKPOINT_TOLERANCE_MS,
): CheckpointObserverConfig => ({
  checkpointsMs: seconds.map((value) => value * 1000),
  toleranceMs,
});

export interface CheckpointSample {
  checkpointMs: number;
  /** A completed frame lands near a checkpoint, never on it. */
  match: "approximate";
  offsetMs: number;
  elapsedMs: number;
  frameId: number;
  /** Completed-frame boundaries the observer had seen when this was taken. */
  boundary: number;
  /** Completed frames between the previous boundary and this one; 1 for the pump. */
  frameIdDelta: number | null;
  /** Authority hash at the sample, from `__game.stateHash()`. */
  stateHash: string | null;
  /** `__game.frameMetrics()`, by value. */
  frame: Record<string, unknown>;
  /** `__game.benchmark.status()`, by value. */
  benchmark: Record<string, unknown>;
  /** `__game.stats()`, by value, raw and unnormalised per backend. */
  stats: Record<string, unknown>;
}

export interface CheckpointObservation {
  kind: "battle-benchmark-checkpoint-observation";
  version: 1;
  /** Always false: the observer wraps the page's own frame scheduling. */
  admissibleAsTimingEvidence: false;
  config: CheckpointObserverConfig;
  /** Every `requestAnimationFrame` registration the page made. */
  registrations: number;
  /** Registrations that saw a newer completed frame, i.e. coherent instants. */
  boundaries: number;
  lastFrameId: number | null;
  samples: (CheckpointSample | null)[];
  /** Closest any completed frame came to each checkpoint, tolerance aside. */
  nearestOffsetMs: (number | null)[];
  /** Coherence or observer faults. A non-empty list fails the run. */
  errors: string[];
}

/**
 * Runs in the page before any application module, through the browser seam's init
 * script. Serialised by `toString()`, so its body may close over nothing in this
 * module and must stay free of non-erasable TypeScript.
 */
export function installCheckpointObserver(config: CheckpointObserverConfig): void {
  const view = window as unknown as Record<string, any>;
  if (view.__checkpointObserver) return;
  const schedule = view.requestAnimationFrame.bind(window);
  const state: any = {
    kind: "battle-benchmark-checkpoint-observation",
    version: 1,
    admissibleAsTimingEvidence: false,
    config,
    registrations: 0,
    boundaries: 0,
    lastFrameId: null,
    samples: config.checkpointsMs.map(() => null),
    nearestOffsetMs: config.checkpointsMs.map(() => null),
    errors: [],
  };
  view.__checkpointObserver = state;
  const fault = (message: string) => {
    if (state.errors.length < 32) state.errors.push(message);
  };
  // By value at the boundary. The owners hand out live nested storage, and the
  // archive is JSON either way, so cloning here loses nothing it could have kept.
  const byValue = (value: unknown) => JSON.parse(JSON.stringify(value));

  const observe = () => {
    const game = view.__game;
    if (!game || typeof game.frameMetrics !== "function") return;
    const frame = game.frameMetrics();
    if (!frame) return;
    if (state.lastFrameId !== null && frame.frameId <= state.lastFrameId) return;
    const delta = state.lastFrameId === null ? null : frame.frameId - state.lastFrameId;
    state.lastFrameId = frame.frameId;
    state.boundaries++;
    // The pump registers once per completed frame, so a gap means a frame
    // completed with no registration between: the boundary argument would not
    // hold for it. Recorded as a fault rather than silently sampled.
    if (delta !== null && delta !== 1)
      fault(`completed frame ${frame.frameId} advanced by ${delta} since the previous boundary`);
    const status = game.benchmark ? game.benchmark.status() : null;
    if (!status || status.phase !== "running") return;
    const elapsedMs = status.elapsedMs;
    for (let index = 0; index < config.checkpointsMs.length; index++) {
      const checkpointMs = config.checkpointsMs[index];
      const offsetMs = elapsedMs - checkpointMs;
      const nearest = state.nearestOffsetMs[index];
      if (nearest === null || Math.abs(offsetMs) < Math.abs(nearest))
        state.nearestOffsetMs[index] = offsetMs;
      if (Math.abs(offsetMs) > config.toleranceMs) continue;
      const held = state.samples[index];
      if (held && Math.abs(held.offsetMs) <= Math.abs(offsetMs)) continue;
      state.samples[index] = {
        checkpointMs,
        match: "approximate",
        offsetMs,
        elapsedMs,
        frameId: frame.frameId,
        boundary: state.boundaries,
        frameIdDelta: delta,
        stateHash: typeof game.stateHash === "function" ? game.stateHash() : null,
        frame: byValue(frame),
        benchmark: byValue(status),
        stats: byValue(game.stats()),
      };
    }
  };

  view.requestAnimationFrame = function (callback: (now: number) => void) {
    state.registrations++;
    try {
      observe();
    } catch (error) {
      fault(String(error));
    }
    return schedule(callback);
  };
}
