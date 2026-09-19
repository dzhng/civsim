// @vitest-environment node
/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
import { startSceneFrames } from "../../../web/src/shared/sceneFrames";
import { createCrowdAudienceHistory } from "../src/crowdAudienceHistory";
import type { CrowdProjectionView } from "../../../packages/crowd-runtime/src/visibility";
import {
  checkpointObserverConfig,
  installCheckpointObserver,
  type CheckpointObservation,
} from "./checkpointObserver.ts";
import {
  compareCheckpointArchives,
  readCheckpointCounts,
  type CheckpointArchive,
} from "./compareCheckpoints.ts";
import { asObservation, judgeCheckpoints, reportFramesFor } from "./runCheckpointObserver.ts";

/**
 * A battle loop with the shape the real one has: the crowd counts and the camera
 * move at the *start* of a frame's preparation, and `frameMetrics` only at its
 * end, after the presentation promise settles. `stats.renderStats.mark` is the
 * frame whose preparation last wrote them, so a sample is coherent exactly when
 * it equals `frameMetrics().frameId`.
 */
function fakeGame(options: { async?: boolean; frameMs?: number; onPrepare?: () => void } = {}) {
  const frameMs = options.frameMs ?? 80;
  let completed: { frameId: number; simTick: number } | null = null;
  let mark = 0;
  let runningAt: number | null = null;
  let elapsedMs = 0;
  let phase = "preparing";
  // The nested storage the owners hand out; mutated in place between frames.
  const crowd = { instances: 100, mainVisible: 60, shadowOnly: 40 };
  const game = {
    frameMetrics: () => (completed ? { ...completed } : null),
    stateHash: () => "held-hash",
    benchmark: { status: () => ({ phase, elapsedMs, scenario: { startTick: 12000 } }) },
    // Retained references on purpose: a sample that keeps them would drift.
    stats: () => ({ soldiers: 100, renderStats: { mark, crowd } }),
  };
  const frame = (now: number) => {
    // Preparation: counts and camera move to this frame before anything completes.
    mark = (completed?.frameId ?? 0) + 1;
    crowd.mainVisible = 60 + mark;
    options.onPrepare?.();
    const complete = () => {
      if (phase === "preparing") {
        phase = "running";
        runningAt = now;
      } else elapsedMs = now - runningAt!;
      completed = { frameId: mark, simTick: 12000 };
    };
    if (!options.async) return void complete();
    return Promise.resolve().then(complete);
  };
  return { game, frame, frameMs };
}

/** Installs the observer on a fake window and returns a hand-driven frame clock. */
function harness(options: Parameters<typeof fakeGame>[0] = {}, checkpointSeconds = [1, 2]) {
  const queue: ((now: number) => void)[] = [];
  const view = globalThis as unknown as Record<string, any>;
  const window: any = {
    requestAnimationFrame: (callback: (now: number) => void) =>
      queue.push(callback) && queue.length,
  };
  view.window = window;
  installCheckpointObserver(checkpointObserverConfig(checkpointSeconds, 50));
  const built = fakeGame(options);
  window.__game = built.game;
  let now = 0;
  const tick = async () => {
    const due = queue.splice(0, queue.length);
    now += built.frameMs;
    for (const callback of due) callback(now);
    await Promise.resolve();
    await Promise.resolve();
  };
  return {
    window,
    built,
    tick,
    state: () => window.__checkpointObserver as CheckpointObservation,
    async run(frames: number) {
      for (let index = 0; index < frames; index++) await tick();
    },
  };
}

afterEach(() => {
  delete (globalThis as any).window;
});

/** What a held export's `scope` carries, and the clean run context around it. */
const held = {
  simulation: "held",
  tick: 12000,
  initialStateHash: "held-hash",
  finalStateHash: "held-hash",
};
const clean = { provenanceOk: true, exitCode: 0, sceneError: null };

test("every sample the real pump produces pairs stats with their own completed frame", async () => {
  const seen: { frameId: number; mark: number }[] = [];
  const h = harness({ async: true, frameMs: 500 }, [1, 2, 3]);
  startSceneFrames(
    h.built.frame,
    (next) => h.window.requestAnimationFrame(next),
    (error) => {
      throw error;
    },
  );
  await h.run(12);
  const state = h.state();
  for (const sample of state.samples) {
    expect(sample).not.toBeNull();
    seen.push({ frameId: sample!.frameId, mark: (sample!.stats as any).renderStats.mark });
  }
  // Coherence: the counts belong to the frame the sample names, never the next.
  expect(seen.every((row) => row.frameId === row.mark)).toBe(true);
  expect(state.errors).toEqual([]);
  expect(state.boundaries).toBe(12);
  expect(state.samples.map((sample) => sample!.frameIdDelta)).toEqual([1, 1, 1]);
});

test("a poll during preparation sees the very mismatch the boundary excludes", async () => {
  const polls: { frameId: number | null; mark: number }[] = [];
  let observer: CheckpointObservation | null = null;
  const h = harness(
    {
      async: true,
      frameMs: 500,
      onPrepare: () => {
        const game = h.window.__game;
        polls.push({
          frameId: game.frameMetrics()?.frameId ?? null,
          mark: game.stats().renderStats.mark,
        });
      },
    },
    [1, 2],
  );
  startSceneFrames(
    h.built.frame,
    (next) => h.window.requestAnimationFrame(next),
    (error) => {
      throw error;
    },
  );
  await h.run(8);
  observer = h.state();
  // The poll is wrong on every frame after the first: identity N, counts N+1.
  expect(polls.slice(1).every((row) => row.frameId !== row.mark)).toBe(true);
  // The observer never recorded such a pair.
  expect(
    observer.samples.every(
      (sample) => sample && sample.frameId === (sample.stats as any).renderStats.mark,
    ),
  ).toBe(true);
});

test("nested and competing registrations during preparation take no sample", async () => {
  const h = harness(
    {
      async: true,
      frameMs: 500,
      // What `settlePresentedFrame` does: rAF from inside an in-flight frame.
      onPrepare: () =>
        h.window.requestAnimationFrame(() => h.window.requestAnimationFrame(() => {})),
    },
    [1, 2],
  );
  startSceneFrames(
    h.built.frame,
    (next) => h.window.requestAnimationFrame(next),
    (error) => {
      throw error;
    },
  );
  // An unrelated animation loop of its own, registering every frame.
  const rival = () => h.window.requestAnimationFrame(rival);
  rival();
  await h.run(8);
  const state = h.state();
  expect(state.registrations).toBeGreaterThan(state.boundaries * 2);
  // Still exactly one boundary per completed frame, and every sample coherent.
  expect(state.boundaries).toBe(8);
  expect(state.errors).toEqual([]);
  expect(
    state.samples.every(
      (sample) => sample && sample.frameId === (sample.stats as any).renderStats.mark,
    ),
  ).toBe(true);
});

test("the synchronous pump path holds the same boundary", async () => {
  const h = harness({ async: false, frameMs: 500 }, [1, 2]);
  startSceneFrames(
    h.built.frame,
    (next) => h.window.requestAnimationFrame(next),
    (error) => {
      throw error;
    },
  );
  await h.run(8);
  const state = h.state();
  expect(state.boundaries).toBe(8);
  expect(
    state.samples.every(
      (sample) => sample && sample.frameId === (sample.stats as any).renderStats.mark,
    ),
  ).toBe(true);
});

test("a sample keeps the values it saw when the owner mutates the same storage", async () => {
  const h = harness({ async: true, frameMs: 500 }, [1]);
  startSceneFrames(
    h.built.frame,
    (next) => h.window.requestAnimationFrame(next),
    () => {},
  );
  await h.run(6);
  const sampled = (h.state().samples[0]!.stats as any).renderStats.crowd.mainVisible;
  const live = h.window.__game.stats().renderStats.crowd.mainVisible;
  expect(sampled).not.toBe(live);
  expect((h.state().samples[0]!.stats as any).renderStats.crowd.mainVisible).toBe(sampled);
});

test("a stopped pump leaves its checkpoints missing, with how near it got", async () => {
  const h = harness({ async: true, frameMs: 500 }, [1, 2]);
  const failures: unknown[] = [];
  const stop = startSceneFrames(
    h.built.frame,
    (next) => h.window.requestAnimationFrame(next),
    (error) => failures.push(error),
  );
  await h.run(3);
  stop();
  await h.run(4);
  const state = h.state();
  expect(state.samples[0]).not.toBeNull();
  expect(state.samples[1]).toBeNull();
  expect(state.nearestOffsetMs[1]).toBe(-1000);
  expect(judgeCheckpoints(state, { ...clean, heldScope: held })).toEqual([
    "no completed frame within 50ms of 2000ms (nearest was -1000ms away)",
  ]);
});

test("the closest completed frame inside the window wins the checkpoint", async () => {
  const h = harness({ async: true, frameMs: 20 }, [1]);
  startSceneFrames(
    h.built.frame,
    (next) => h.window.requestAnimationFrame(next),
    () => {},
  );
  await h.run(70);
  const sample = h.state().samples[0]!;
  expect(Math.abs(sample.offsetMs)).toBeLessThanOrEqual(10);
  expect(sample.elapsedMs).toBe(1000);
});

test("an observer fault never throws into the page's own scheduling", async () => {
  const h = harness({ async: true, frameMs: 500 }, [1]);
  h.window.__game = {
    frameMetrics: () => {
      throw Error("debug api is gone");
    },
  };
  let scheduled = 0;
  h.window.requestAnimationFrame(() => scheduled++);
  expect(h.state().errors).toEqual(["Error: debug api is gone"]);
  expect(h.state().registrations).toBe(1);
});

test("a frame that completes with no registration between is a recorded fault", () => {
  const h = harness({ async: true }, [1]);
  let completed = 1;
  h.window.__game = {
    frameMetrics: () => ({ frameId: completed }),
    benchmark: { status: () => ({ phase: "running", elapsedMs: 0 }) },
    stats: () => ({}),
  };
  h.window.requestAnimationFrame(() => {});
  completed = 3;
  h.window.requestAnimationFrame(() => {});
  expect(h.state().errors).toEqual(["completed frame 3 advanced by 2 since the previous boundary"]);
});

test("the installer survives serialisation with no module scope around it", () => {
  // Playwright ships it to the page as source, so it may close over nothing here.
  const detached = new Function(
    "window",
    `return (${installCheckpointObserver.toString()})({ checkpointsMs: [1000], toleranceMs: 50 });`,
  );
  const page: any = { requestAnimationFrame: (callback: unknown) => callback };
  detached(page);
  page.__game = {
    frameMetrics: () => ({ frameId: 7 }),
    benchmark: { status: () => ({ phase: "running", elapsedMs: 1000 }) },
    stateHash: () => "held-hash",
    stats: () => ({ renderStats: { mark: 7 } }),
  };
  page.requestAnimationFrame(() => {});
  expect(page.__checkpointObserver.samples[0].frameId).toBe(7);
  expect(page.__checkpointObserver.errors).toEqual([]);
});

// --- Stat field map ---------------------------------------------------------

const view = (pixels: number, shadow = false): CrowdProjectionView => ({
  frustum: { planes: [] },
  shadow,
  projection: {
    view: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -100, 1],
    pixelsPerViewUnit: pixels,
    perspective: false,
    near: 1,
  },
});
const soldier = {
  x: 0,
  y: 0,
  facing: 0,
  classId: 0,
  faction: 0,
  alive: true,
  clip: "idle",
  phase: 0,
  seed: 0,
  mounted: false,
  lod: 0,
} as const;
const asset = { manifest: { bounds: { center: [0, 0, 0], radius: 1 } } };

/** The lab shape, read from the real owner rather than a hand-written literal. */
function labStats() {
  const history = createCrowdAudienceHistory({ 0: asset } as never, { 0: {} } as never);
  const instances = [soldier, { ...soldier, x: 4 }, { ...soldier, x: 8 }];
  const views = [view(40), view(0.05, true)];
  history.commit(history.begin(instances as never, views), {
    fovY: 1,
    right: [1, 0, 0],
    up: [0, 1, 0],
    eye: [0, 0, 100],
  } as never);
  return {
    soldiers: instances.length,
    renderStats: {
      soldiers: instances.length,
      renderer: "gpu",
      native: {
        camera: {
          x: 1,
          y: 2,
          zoom: 3,
          camera3d: { target: [1, 2, 0], distance: 9, yaw: 0.5, pitch: 0.4 },
        },
        crowd: { ...history.stats(), mesh: {}, impostors: {} },
      },
      submission: {},
    },
  };
}

/**
 * The source shape. Its owner needs three.js and a device, so this literal stands
 * in — copied from an archived real `three` trial
 * (`throwaway/matched-current-58b2a9bd/trials/three-0/trial.json`) and kept honest
 * by the histogram/`mainVisible` invariant the extractor checks.
 */
const threeStats = {
  soldiers: 15560,
  renderStats: {
    soldiers: 15560,
    renderer: "gpu",
    camera: {
      x: 1,
      y: 2,
      zoom: 3,
      camera3d: { target: [1, 2, 0], distance: 9, yaw: 0.5, pitch: 0.4 },
    },
    crowd: {
      instances: 15560,
      visible: 14688,
      culled: 872,
      shadowTierHistogram: { l0: 0, l1: 0, l2: 14688, l3: 0 },
      tierHistogram: { l0: 7535, l1: 359, l2: 0, l3: 7666 },
      visibleTierHistogram: { l0: 7535, l1: 359, l2: 0, l3: 0 },
      culling: { input: 15560, visible: 14688, culled: 872, viewVisible: 7894, shadowOnly: 6794 },
    },
    post: {},
  },
};

test("the lab field map reads the real crowd audience owner's own stats", () => {
  const stats = labStats();
  const read = readCheckpointCounts("raw", stats);
  const truth = stats.renderStats.native.crowd as any;
  expect(read.counts).toEqual({
    soldiers: 3,
    instances: truth.instances,
    mainVisible: truth.mainVisible,
    shadowOnly: truth.shadowOnly,
  });
  expect(read.histograms.visibleTierHistogram).toEqual(truth.visibleTierHistogram);
  expect(read.histograms.shadowTierHistogram).toEqual(truth.shadowTierHistogram);
  // Not all-zero: the counts exist and are real, which is the whole point.
  expect(truth.instances).toBe(3);
  expect(truth.mainVisible + truth.shadowOnly).toBeGreaterThan(0);
});

test("the source field map reads the equivalent numbers from the other spelling", () => {
  const read = readCheckpointCounts("three", threeStats);
  expect(read.counts).toEqual({
    soldiers: 15560,
    instances: 15560,
    mainVisible: 7894,
    shadowOnly: 6794,
  });
  expect(read.histograms.visibleTierHistogram).toEqual({ l0: 7535, l1: 359, l2: 0, l3: 0 });
});

test("an absent count is an error, never a zero", () => {
  const broken = JSON.parse(JSON.stringify(threeStats));
  delete broken.renderStats.crowd.culling.viewVisible;
  expect(() => readCheckpointCounts("three", broken)).toThrow(
    /three\.mainVisible: crowd\.culling\.viewVisible is absent/,
  );
  // And reading the source shape with the lab map does not silently yield zeros.
  expect(() => readCheckpointCounts("raw", threeStats)).toThrow(/is absent/);
});

test("a visible histogram that does not break down mainVisible is refused", () => {
  const broken = JSON.parse(JSON.stringify(threeStats));
  broken.renderStats.crowd.visibleTierHistogram.l0 += 1;
  expect(() => readCheckpointCounts("three", broken)).toThrow(/sums to 7895, mainVisible is 7894/);
});

// --- Comparison -------------------------------------------------------------

const sample = (stats: unknown, frameId = 42) => ({
  checkpointMs: 15000,
  match: "approximate" as const,
  offsetMs: 8,
  elapsedMs: 15008,
  frameId,
  boundary: 3,
  frameIdDelta: 1,
  stateHash: "held-hash",
  frame: { frameId, simTick: 12000 },
  benchmark: { phase: "running", elapsedMs: 15008 },
  stats: stats as Record<string, unknown>,
});

const archiveOf = (
  backend: CheckpointArchive["backend"],
  stats: unknown,
  overrides: Partial<CheckpointArchive> = {},
): CheckpointArchive => ({
  kind: "battle-benchmark-checkpoint-run",
  version: 1,
  runId: `${backend}-checkpoints`,
  backend,
  url: "http://127.0.0.1:5261/",
  heldTick: 12000,
  build: { manifestPath: "m.json", commit: "abc", buildSha256: "def" },
  provenanceOk: true,
  exitCode: 0,
  observation: {
    kind: "battle-benchmark-checkpoint-observation",
    version: 1,
    admissibleAsTimingEvidence: false,
    config: { checkpointsMs: [15000], toleranceMs: 50 },
    registrations: 900,
    boundaries: 300,
    lastFrameId: 300,
    samples: [sample(stats)],
    nearestOffsetMs: [8],
    errors: [],
  },
  reportFrames: {
    "42": {
      elapsedMs: 15008,
      phase: "advance",
      camera: { center: [1, 2], distance: 9, yaw: 0.5, pitch: 0.4 },
      intendedCamera: { center: [1, 2.5], distance: 9, yaw: 0.5, pitch: 0.4 },
    },
  },
  issues: [],
  ok: true,
  ...overrides,
});

test("equivalent counts compare and one-sided fields stay scoped", () => {
  const lab = labStats();
  const scaled = JSON.parse(JSON.stringify(threeStats));
  const truth = lab.renderStats.native.crowd as any;
  scaled.soldiers = scaled.renderStats.soldiers = 3;
  scaled.renderStats.crowd.instances = truth.instances;
  scaled.renderStats.crowd.culling.viewVisible = truth.mainVisible;
  scaled.renderStats.crowd.culling.shadowOnly = truth.shadowOnly;
  scaled.renderStats.crowd.visibleTierHistogram = truth.visibleTierHistogram;
  scaled.renderStats.crowd.shadowTierHistogram = truth.shadowTierHistogram;

  const report = compareCheckpointArchives([archiveOf("three", scaled), archiveOf("raw", lab)]);
  expect(report.issues).toEqual([]);
  expect(report.ok).toBe(true);
  expect(report.rankable).toBe(false);
  const checkpoint = report.checkpoints[0] as any;
  for (const field of ["instances", "mainVisible", "shadowOnly", "visibleTierHistogram"])
    expect(checkpoint.equivalent[field].equal).toBe(true);
  // `tierHistogram`/`visible`/`culled` and `submission` belong to one shape only.
  expect(report.scopedOnly.three).toContain("post");
  expect(report.scopedOnly.lab).toContain("native");
  expect(report.scopedOnly.lab).toContain("submission");
  // The tour deviation is recorded, never asserted to be zero.
  expect(checkpoint.backends[0].report.tourDelta.center[1]).toBeCloseTo(-0.5);
});

test("a disagreeing count is reported as unequal, not hidden", () => {
  const other = JSON.parse(JSON.stringify(threeStats));
  other.renderStats.crowd.culling.viewVisible = 7000;
  other.renderStats.crowd.visibleTierHistogram = { l0: 7000, l1: 0, l2: 0, l3: 0 };
  const report = compareCheckpointArchives([
    archiveOf("three", threeStats),
    archiveOf("three", other, { runId: "three-b" }),
  ]);
  const checkpoint = report.checkpoints[0] as any;
  expect(checkpoint.equivalent.mainVisible.equal).toBe(false);
  expect(checkpoint.equivalent.instances.equal).toBe(true);
});

test("a missing sample and a stat camera that contradicts the report both fail", () => {
  const missing = archiveOf("three", threeStats, {
    runId: "three-missing",
    observation: {
      ...archiveOf("three", threeStats).observation!,
      samples: [null],
      nearestOffsetMs: [-180],
    },
  });
  const drifted = archiveOf("three", threeStats, { runId: "three-drift" });
  drifted.reportFrames!["42"].camera = { center: [1, 2], distance: 9, yaw: 0.9, pitch: 0.4 };
  const report = compareCheckpointArchives([missing, drifted]);
  expect(report.ok).toBe(false);
  expect(report.issues).toEqual([
    "three-missing: no completed frame within 50ms of 15000ms (nearest -180ms)",
    "three-drift @15000ms: frame 42 stats camera differs from the camera the report recorded it consuming",
  ]);
});

test("only the sampled frames' report rows are archived", () => {
  const rows = reportFramesFor(
    {
      frames: [
        { frameId: 1, elapsedMs: 0, phase: "a", camera: {}, intendedCamera: {} },
        { frameId: 42, elapsedMs: 15008, phase: "b", camera: {}, intendedCamera: {} },
      ],
    },
    [42],
  );
  expect(Object.keys(rows!)).toEqual(["42"]);
});

test("a page that could not be read is a failure with its reason, not an observation", () => {
  const collected = { error: "Target page, context or browser has been closed" };
  expect(asObservation(collected)).toBeNull();
  expect(
    judgeCheckpoints(asObservation(collected), { ...clean, heldScope: held, collected }),
  ).toEqual([`the observer state could not be read: ${JSON.stringify(collected)}`]);
});

test("provenance and scene failures fail the run before any checkpoint reasoning", () => {
  expect(
    judgeCheckpoints(null, {
      provenanceOk: false,
      exitCode: null,
      sceneError: null,
      heldScope: held,
    }),
  ).toEqual([
    "the served build did not match its manifest",
    "the scene exited null",
    "the observer left no state in the page",
  ]);
});

test("a live build is refused, and a sample whose authority moved is refused", async () => {
  const h = harness({ async: true, frameMs: 500 }, [1]);
  startSceneFrames(
    h.built.frame,
    (next) => h.window.requestAnimationFrame(next),
    () => {},
  );
  await h.run(6);
  const state = h.state();
  // No `scope` is what a live benchmark export looks like.
  expect(judgeCheckpoints(state, { ...clean, heldScope: null })).toEqual([
    "the export carries no held scope; only a held build may be observed",
  ]);
  expect(judgeCheckpoints(state, { ...clean, heldScope: held })).toEqual([]);
  expect(judgeCheckpoints(state, { ...clean, heldScope: { ...held, tick: 9000 } })).toEqual([
    "checkpoint 1000ms sampled tick 12000, not 9000",
  ]);
  expect(
    judgeCheckpoints(state, { ...clean, heldScope: { ...held, initialStateHash: "other" } }),
  ).toEqual(["checkpoint 1000ms sampled hash held-hash, not other"]);
});
