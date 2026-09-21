import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

// The standing 30k perf gate requires the PRODUCTION battle renderer
// (`BattleRenderer`) to hold the locked budget of median <= 33 ms/frame GPU
// time with >= 30,000 soldiers plus the
// map's dense foliage fill on screen, at both the mid and vista zoom stops.
// Soldier/foliage counts are published and floored so the gate cannot silently
// shrink. Hardware adapter only for the ms assertion (VERIFY_GPU_ADAPTER=
// hardware; SwiftShader is not a perf oracle) — under SwiftShader the scene
// still runs as a correctness smoke and records that the budget was skipped.
// BMSGRASS-F4B1 adds a live camera-pan phase: rAF p95 must stay under the same
// 33 ms floor while the camera crosses multiple 8m grass sampling boundaries.
// PERFDIG-F2C6 adds the wheel path: dispatch real wheel events during the
// sample so the input handler must keep applying zoom while grass catches up.
// Every photoreal change runs this gate.
// VERIFY_BATTLE_ROUTE=raw runs the same gate, unchanged, against the selected
// raw world served through the lab's Menu substitution. Every floor, threshold,
// population and window below is identical on both routes; only which owner
// publishes a diagnostic differs, and the columns the raw world does not
// measure (its CPU tier/triangle/thinning mirror) report absent rather than
// zero. They were never floors.
export const meta = {
  name: "battle-perf-30k",
  kind: "flow",
  world: "battle-real",
  tier: "full",
  snapshots: [],
  describe:
    "Production battle renderer holds 33 ms static GPU median and pan rAF p95 at 30k+ soldiers plus dense foliage.",
};

// Locked product numbers: changing either requires David.
const BUDGET_MS = 33;
const SOLDIER_FLOOR = 30000;
// The load the counts may never shrink below (generated seed 7 base army plus
// dense scenery; production grass includes the blade-field record window and
// routed/thinned blade triangles).
const SPAWN_TARGET = 30500;
const SCENERY_FLOOR = 500;
// Static whole-map grass: the field is sampled once at the sampler's 1M ceiling
// (STATIC_GRASS_MAX_RECORDS in battleWorld.ts) and uniformly across the map.
const STATIC_GRASS_RECORD_CAP = 1_000_000;
const CLOSE_GRASS_RECORD_FLOOR = 40000;
const PAN_DISTANCE_M = 200;
const PAN_DURATION_MS = 3000;
const WHEEL_BURST_EVENTS = 30;
const WHEEL_BURST_DURATION_MS = 1000;
const CLOSE_DISTANCE_STOPS = [20, 10];

// Same production rig zooms as battle-camera-zoom: playable mid and the
// low-oblique cinematic vista (zoomT = 1), where grass density peaks. Both
// stops centre on the 30k crowd mass so the measured frame carries the
// soldiers on screen, not an empty field.
const STOPS = [
  { name: "mid", zoom: 3.0, center: [0, -310] },
  { name: "vista", distance: 10, center: [0, -310] },
];

const WARMUP_FRAMES = 60;
const SAMPLE_FRAMES = 150;
const REPORT_DIR = new URL("../../reports/rendering/scenario-runs/", import.meta.url);

// Harness-only route selection. Production still constructs the source
// renderer; the selected raw world is reached by pointing VERIFY_URL at the
// lab's Menu substitution, and this names which diagnostics owners the run is
// reading so the scene never has to guess (or quietly fall back) when a shape
// is missing. Both branches retire at the M9 cutover, when there is one route.
// Validate route selection once at run entry, before reading any diagnostics.
const ROUTE = process.env.VERIFY_BATTLE_ROUTE ?? "source";
const ROUTE_SUBSTRATE = { source: "threejs-webgpu-tsl", raw: "raw-webgpu" };
// `performance.gpuTimeMs` is a different measurement on each route, and the
// renderer names which one it published. The source value is an asynchronous
// render-pass-only sum belonging to no identified frame; the raw value is one
// presented frame's complete observed submission span.
const ROUTE_GPU_METRIC = {
  source: "source-render-pass-timestamp-sum",
  raw: "correlated-complete-submission-span",
};

export async function run(ctx) {
  assertKnownRoute(ROUTE);
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "requires WebGPU browser flags",
      true,
      "set VERIFY_GPU=1 to exercise the 30k perf gate",
    );
    return;
  }
  const hardware = process.env.VERIFY_GPU_ADAPTER === "hardware";

  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "battle-perf-30k",
  });
  const warnings = [];
  const audioPolicyWarnings = [];
  page.on("console", (message) => {
    if (message.type() !== "warning") return;
    const text = message.text();
    // Direct URL launch has no user activation; Chrome blocks ambient audio.
    // Retain that separate policy signal without hiding any renderer warning.
    if (
      text.startsWith(
        "The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page.",
      )
    )
      audioPolicyWarnings.push(text);
    else warnings.push(text);
  });
  await page.goto(`${ctx.target}?map=gen&seed=7&ai=off`);
  await page.waitForFunction(
    () => {
      const stats = window.__game?.stats?.();
      return (
        window.__ready === true &&
        stats?.renderer === "gpu" &&
        stats.renderStats?.ready === true &&
        stats.renderStats.soldiers === stats.soldiers
      );
    },
    undefined,
    { timeout: 90000 },
  );

  // Grow the generated battle to the 30k floor through the production spawn path.
  // Fixed grid + fixed establishment => the load is identical every run.
  const spawned = await page.evaluate((target) => {
    const g = window.__game;
    const before = g.stats().soldiers;
    const need = Math.max(0, Math.ceil((target - before) / 500));
    for (let i = 0; i < need; i++) {
      const row = Math.floor(i / 10);
      const col = i % 10;
      g.spawnClass(-540 + col * 120, -400 + row * 90, Math.PI / 2, 500, 28, 0, row % 2);
    }
    return { before, added: need * 500 };
  }, SPAWN_TARGET);
  await page.waitForFunction(
    (floor) => {
      const stats = window.__game.stats();
      return (
        stats.soldiers >= floor &&
        stats.renderStats.soldiers === stats.soldiers &&
        stats.renderStats.expectedSoldiers === stats.soldiers
      );
    },
    SOLDIER_FLOOR,
    { timeout: 120000 },
  );

  await page.addStyleTag({
    content:
      "#gameover, #hud, #buttons, #pausemenu, #banner, #selbox, #minimap, #unitcards, #toolbar { display: none !important; }",
  });
  // The one in-page GPU reader, used by every sampling phase below. It reads
  // only what the production stats seam already publishes — no query, no wait,
  // no extra draw — and reduces nothing: which readings count as samples is
  // decided off-page by `gpuSamples`. Harness-only, and it retires with the
  // route fork at M9.
  await page.evaluate(() => {
    window.__perfGpuReading = () => {
      const perf = window.__game.stats().renderStats.performance;
      const frame = perf.gpuFrame ?? null;
      return {
        ms: perf.gpuTimeMs ?? null,
        metric: perf.gpuTimeMetric ?? null,
        // Identity of the completed frame the value measures, where the route
        // publishes one. The source's uncorrelated pass sum has none.
        frameId: frame?.renderedFrameId ?? null,
        submissionId: frame?.submissionId ?? null,
      };
    };
  });
  await page.evaluate(() => {
    window.__cam.yaw = 0;
    window.__cam.pitchBias = 0;
  });

  // Pause the SIM (not freeze: freeze pins fixedTime and skips identical
  // redraws). At 30k the sim tick alone saturates the main thread
  // (~15 ms/tick catch-up), which is sim cost, not renderer cost — this gate
  // measures the RENDERER, so the crowd stands idle while every rAF still
  // draws a full live frame.
  await page.keyboard.press("p");
  await page.waitForTimeout(600); // let the tick accumulator drain its backlog
  const tickBefore = await page.evaluate(() => window.__game.tickCount());
  await page.waitForTimeout(300);
  const tickAfter = await page.evaluate(() => window.__game.tickCount());
  ctx.check(
    "sim is paused for the renderer measurement (rAF frames stay live draws)",
    tickAfter === tickBefore,
    JSON.stringify({ tickBefore, tickAfter }),
  );

  const table = [];
  const shots = {};
  for (const stop of STOPS) {
    await page.evaluate(async ({ zoom, distance, center }) => {
      const cam = window.__cam;
      if (distance !== undefined) cam.zoomAt(0, 0, cam.params().distance / distance);
      else cam.zoom = zoom;
      cam.clampView?.();
      await new Promise((resolve) => setTimeout(resolve, 80));
      cam.setViewCenter(center[0], center[1]);
      cam.clampView?.();
    }, stop);
    await page.waitForTimeout(200);
    await waitForGrassReady(page);

    // Warm frames, then per-frame samples: rAF wall time plus the shell's
    // GPU time surfaced through the production stats seam, taken as the raw
    // reading it is and reduced to samples off-page.
    // SwiftShader gets a token sample run (liveness), never a verdict.
    const sampled = await page.evaluate(
      async ({ warmup, frames }) => {
        const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
        for (let i = 0; i < warmup; i++) await raf();
        const seed = window.__perfGpuReading();
        const gpu = [];
        const frameMs = [];
        let last = performance.now();
        for (let i = 0; i < frames; i++) {
          await raf();
          const now = performance.now();
          frameMs.push(now - last);
          last = now;
          gpu.push(window.__perfGpuReading());
        }
        return { gpu, seed, raf: frameMs };
      },
      { warmup: hardware ? WARMUP_FRAMES : 5, frames: hardware ? SAMPLE_FRAMES : 10 },
    );
    const gpu = gpuSamples(sampled.gpu, sampled.seed);

    const stats = await page.evaluate(() => {
      const s = window.__game.stats();
      return {
        camera: {
          requested: window.__cam.params(),
          submitted: s.renderStats.camera.camera3d,
          zoomT: window.__cam.zoomT,
        },
        substrate: s.renderStats.substrate ?? null,
        soldiers: s.soldiers,
        renderSoldiers: s.renderStats.soldiers,
        scenery: s.renderStats.terrain?.scenery ?? 0,
        grass: s.renderStats.terrain?.grass ?? null,
        device: s.renderStats.device,
      };
    });
    const grass = grassReading(stats.grass);
    const sample = grass?.baseSample;
    table.push({
      stop: stop.name,
      zoom: stop.zoom,
      requestedDistance: stop.distance,
      route: ROUTE,
      substrate: stats.substrate,
      camera: stats.camera,
      focus: {
        active: grass?.detail?.focusRingActive === true,
        accepted: grass?.focusSample?.acceptedRecords ?? 0,
        capacity: grass?.focusSample?.recordCapacity ?? 0,
        slotCapacity: grass?.rebuild?.slotCapacity ?? 0,
        slotRecords: grass?.rebuild?.tileSlotRecords ?? 0,
        coverageResident: grass?.rebuild?.activeCoverageResident === true,
        coverageTiles: grass?.rebuild?.publishedCoverageTiles ?? 0,
      },
      soldiers: stats.renderSoldiers,
      scenery: stats.scenery,
      grassRecords: grass?.recordCount ?? null,
      grassTriangles: grass?.submittedTriangles ?? null,
      grassTierRecords: grass?.tierRecords ?? null,
      grassTierDroppedByThinning: grass?.tierDroppedByThinning ?? null,
      grassThinnedRecords: grass?.thinnedRecords ?? null,
      grassSampleAccepted: sample?.acceptedRecords ?? 0,
      grassSampleCapacity: sample?.recordCapacity ?? 0,
      grassSampleLodCounts: sample?.lodCounts ?? null,
      grassSampleBudgetQuotas: sample?.lodBudgetQuotas ?? null,
      grassSampleDroppedByBudget: sample?.lodDroppedByBudget ?? null,
      grassSampleStratifiedBudget: sample?.lodStratifiedBudget === true,
      grassActiveRecordBudget: grass?.rebuild?.activeRecordBudget ?? 0,
      grassAreaBudgetScale: grass?.rebuild?.areaBudgetScale ?? 0,
      grassVistaRecordBudget: grass?.rebuild?.vistaRecordBudget ?? 0,
      gpuMedianMs: round(median(gpu.ms)),
      gpuP95Ms: round(percentile(gpu.ms, 0.95)),
      gpuSamples: gpu.ms.length,
      gpuTimeMetric: gpu.metric,
      rafMedianMs: round(median(sampled.raf)),
      rafP95Ms: round(percentile(sampled.raf, 0.95)),
      device: stats.device,
    });

    shots[stop.name] = await page.locator("#battlefield").screenshot({ timeout: 180000 });
  }

  const pan = await sampleCameraPan(page, hardware);
  const zoomSweep = await sampleCameraZoomSweep(page, hardware);
  const wheelBurst = await sampleWheelBurst(page, hardware);
  const closeZoomFill = await sampleCloseZoomFill(page, hardware);

  const [mid, vista] = table;
  console.log(`battle-perf-30k route: ${ROUTE}`);
  console.log(`battle-perf-30k frame-time table:\n${JSON.stringify(table, null, 2)}`);
  console.log(`battle-perf-30k pan table:\n${JSON.stringify(pan, null, 2)}`);
  console.log(`battle-perf-30k wheel-burst table:\n${JSON.stringify(wheelBurst, null, 2)}`);
  console.log(`battle-perf-30k close-zoom-fill table:\n${JSON.stringify(closeZoomFill, null, 2)}`);

  // --- The diagnostics belong to the route under test ----------------------
  // Every floor below reads the selected route's own owners. A world that is
  // not the one this run selected, or a GPU value that is not the measurement
  // that route names, fails here rather than being read as if it were.
  const gpuMetrics = [...table, pan].map((row) => ({
    phase: row.stop ?? "pan",
    samples: row.gpuSamples,
    metric: row.gpuTimeMetric,
  }));
  ctx.check(
    `diagnostics come from the ${ROUTE} route's own owners and named GPU metric`,
    table.every((row) => row.substrate === ROUTE_SUBSTRATE[ROUTE]) &&
      gpuMetrics.every(
        ({ samples, metric }) =>
          (samples === 0 && metric === null) || (samples > 0 && metric === ROUTE_GPU_METRIC[ROUTE]),
      ),
    JSON.stringify({
      route: ROUTE,
      expectedSubstrate: ROUTE_SUBSTRATE[ROUTE],
      substrates: table.map((row) => row.substrate),
      expectedMetric: ROUTE_GPU_METRIC[ROUTE],
      gpuMetrics,
    }),
  );

  // --- The load is real and may never shrink -------------------------------
  ctx.check(
    `gate holds >= ${SOLDIER_FLOOR} soldiers on the production battle renderer`,
    spawned.before + spawned.added >= SOLDIER_FLOOR &&
      table.every((row) => row.soldiers >= SOLDIER_FLOOR),
    JSON.stringify({ spawned, mid: mid.soldiers, vista: vista.soldiers }),
  );
  ctx.check(
    "gate holds the dense foliage fill on the static whole-map blade field",
    table.every((row) => row.scenery >= SCENERY_FLOOR) &&
      table.every(
        (row) =>
          row.grassActiveRecordBudget ===
            STATIC_GRASS_RECORD_CAP +
              (row.focus.active ? row.focus.slotCapacity * row.focus.slotRecords : 0) &&
          (!row.focus.active ||
            (row.focus.accepted >= CLOSE_GRASS_RECORD_FLOOR &&
              row.focus.accepted <= row.focus.capacity &&
              row.focus.capacity === row.focus.slotCapacity * row.focus.slotRecords &&
              row.focus.coverageResident &&
              row.focus.coverageTiles > 0)) &&
          row.grassAreaBudgetScale === 1 &&
          row.grassRecords >= CLOSE_GRASS_RECORD_FLOOR &&
          row.grassRecords <= row.grassActiveRecordBudget,
      ),
    JSON.stringify({
      table: table.map((row) => ({
        stop: row.stop,
        scenery: row.scenery,
        grassRecords: row.grassRecords,
        grassTriangles: row.grassTriangles,
        activeBudget: row.grassActiveRecordBudget,
        areaScale: row.grassAreaBudgetScale,
      })),
    }),
  );
  ctx.check(
    "static grass is sampled uniformly to the record cap (no stratified/area budget)",
    table.every(
      (row) =>
        row.grassSampleStratifiedBudget === false &&
        row.grassSampleCapacity === STATIC_GRASS_RECORD_CAP &&
        row.grassSampleAccepted >= CLOSE_GRASS_RECORD_FLOOR &&
        row.grassSampleAccepted <= row.grassSampleCapacity,
    ),
    JSON.stringify(
      table.map((row) => ({
        stop: row.stop,
        accepted: row.grassSampleAccepted,
        capacity: row.grassSampleCapacity,
        stratified: row.grassSampleStratifiedBudget,
      })),
    ),
  );
  ctx.check(
    "close physical views keep accepted grass content and resident coverage",
    closeZoomFill.every(
      (row) =>
        row.grassEnabled &&
        row.pending !== true &&
        row.baseAccepted >= CLOSE_GRASS_RECORD_FLOOR &&
        row.focusAccepted >= CLOSE_GRASS_RECORD_FLOOR &&
        row.coverageResident,
    ),
    JSON.stringify(closeZoomFill),
  );

  ctx.check(
    "physical camera requests reach the submitted view, including the 10m endpoint",
    [...table, ...closeZoomFill].every(
      (row) =>
        Math.abs(row.camera.requested.distance - row.camera.submitted.distance) < 0.01 &&
        ["pitch", "yaw", "fovY", "aspect", "near"].every(
          (key) => Math.abs(row.camera.requested[key] - row.camera.submitted[key]) < 1e-6,
        ) &&
        row.camera.requested.target.every(
          (value, i) => Math.abs(value - row.camera.submitted.target[i]) < 0.01,
        ) &&
        (row.requestedDistance === undefined ||
          Math.abs(row.camera.submitted.distance - row.requestedDistance) < 0.01) &&
        (row.requestedDistance !== 10 ||
          (Math.abs(row.camera.zoomT - 1) < 1e-6 &&
            Math.abs(row.camera.submitted.pitch - 0.3) < 1e-6 &&
            Math.abs(row.camera.submitted.fovY - 0.85) < 1e-6)),
    ),
    JSON.stringify(
      [...table, ...closeZoomFill].map(({ requestedDistance, camera }) => ({
        requestedDistance,
        camera,
      })),
    ),
  );
  ctx.check(
    "zoom sweep visits near and returns to its starting distance",
    Math.abs(zoomSweep.nearestDistance - 10) < 0.01 &&
      Math.abs(zoomSweep.finalDistance - zoomSweep.startDistance) < 0.01 &&
      zoomSweep.elapsedMs >= PAN_DURATION_MS,
    JSON.stringify(zoomSweep),
  );

  ctx.check(
    "camera pan traverses the requested ground distance in the rendered view",
    Math.abs(pan.actualDistanceM - PAN_DISTANCE_M) < 0.01 &&
      pan.elapsedMs >= PAN_DURATION_MS &&
      pan.endTarget.every((value, i) => Math.abs(value - pan.submitted[i]) < 0.01),
    JSON.stringify(pan),
  );

  // --- Visual evidence: the crowd is on screen at both stops ----------------
  // Map A is 2400x1600 world units, so soldiers become mass/silhouette pixels
  // at these stops. The floors prove formations render on screen; the evidence
  // shots are the human-readable proof of the field.
  const pixels = {
    mid: crowdPixels(PNG.sync.read(shots.mid)),
    vista: crowdPixels(PNG.sync.read(shots.vista)),
  };
  ctx.check(
    "frames show the crowd and terrain at both stops (load is on screen)",
    pixels.mid.crowd > 1400 &&
      pixels.vista.crowd > 3200 &&
      pixels.vista.terrain > pixels.vista.total * 0.2,
    JSON.stringify(pixels),
  );
  await mkdir(REPORT_DIR, { recursive: true });
  const adapter = hardware ? "hardware" : "swiftshader";
  for (const [name, shot] of Object.entries(shots)) {
    const shotPath = new URL(`battle-perf-30k-${name}-${adapter}.png`, REPORT_DIR);
    await writeFile(shotPath, shot);
    console.log(`battle-perf-30k ${name} evidence shot: ${shotPath.pathname}`);
  }

  // --- The budget ------------------------------------------------------------
  if (hardware) {
    ctx.check(
      "hardware run measured a real (non-software) adapter with live GPU timestamps",
      !/swiftshader|llvmpipe|software/i.test(vista.device) &&
        table.every((row) => row.gpuSamples >= SAMPLE_FRAMES * 0.5),
      JSON.stringify({ device: vista.device, gpuSamples: table.map((row) => row.gpuSamples) }),
    );
    ctx.check(
      `median GPU frame time within the ${BUDGET_MS} ms budget at both zoom stops`,
      table.every((row) => row.gpuMedianMs !== null && row.gpuMedianMs <= BUDGET_MS),
      JSON.stringify(table),
    );
    ctx.check(
      `continuous ${PAN_DISTANCE_M}m camera pan keeps rAF p95 within the ${BUDGET_MS} ms budget`,
      pan.rafP95Ms !== null && pan.rafP95Ms <= BUDGET_MS,
      JSON.stringify(pan),
    );
    ctx.check(
      `continuous zoom sweep keeps rAF p95 within the ${BUDGET_MS} ms budget`,
      zoomSweep.rafP95Ms !== null && zoomSweep.rafP95Ms <= BUDGET_MS,
      JSON.stringify(zoomSweep),
    );
    ctx.check(
      `wheel burst keeps rAF p95 within the ${BUDGET_MS} ms budget`,
      wheelBurst.rafP95Ms !== null && wheelBurst.rafP95Ms <= BUDGET_MS,
      JSON.stringify(wheelBurst),
    );
    ctx.check(
      `close distance ${CLOSE_DISTANCE_STOPS.join("/")}m grass-on fill keeps rAF p95 within the ${BUDGET_MS} ms budget`,
      closeZoomFill.every((row) => row.rafP95Ms !== null && row.rafP95Ms <= BUDGET_MS),
      JSON.stringify(closeZoomFill),
    );
    ctx.check(
      "wheel burst delivers all events inside the playable rig range",
      wheelBurst.sent === WHEEL_BURST_EVENTS &&
        wheelBurst.zoomT >= 0 &&
        wheelBurst.zoomT <= 1 &&
        wheelBurst.settledDistance >= 10 &&
        wheelBurst.settledDistance < wheelBurst.startDistance,
      JSON.stringify(wheelBurst),
    );
  } else {
    ctx.check(
      "SwiftShader is not a perf oracle: ms budget assertion skipped (correctness smoke only)",
      true,
      JSON.stringify({ device: vista.device, rafMedianMs: table.map((row) => row.rafMedianMs) }),
    );
  }

  ctx.check(
    "continuous rendering emits no non-audio-policy browser warnings",
    warnings.length === 0,
    {
      warnings,
      audioPolicyWarnings: audioPolicyWarnings.length,
    },
  );
  await page.close();
}

async function sampleCloseZoomFill(page, hardware) {
  const out = [];
  for (const distance of CLOSE_DISTANCE_STOPS) {
    await page.evaluate(
      async ({ distance }) => {
        const cam = window.__cam;
        cam.zoomAt(0, 0, cam.params().distance / distance);
        cam.clampView?.();
        cam.setViewCenter(0, -310);
        cam.clampView?.();
        await new Promise((resolve) => setTimeout(resolve, 120));
      },
      { distance },
    );
    await waitForGrassReady(page);
    const sampled = await page.evaluate(
      async ({ warmup, frames }) => {
        const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
        for (let i = 0; i < warmup; i++) await raf();
        const frameMs = [];
        let last = performance.now();
        for (let i = 0; i < frames; i++) {
          await raf();
          const now = performance.now();
          frameMs.push(now - last);
          last = now;
        }
        const s = window.__game.stats();
        return {
          raf: frameMs,
          camera: {
            requested: window.__cam.params(),
            submitted: s.renderStats.camera.camera3d,
            zoomT: window.__cam.zoomT,
          },
          settledZoom: window.__cam.zoom,
          grass: s.renderStats.terrain?.grass ?? null,
        };
      },
      { warmup: hardware ? 30 : 3, frames: hardware ? 90 : 10 },
    );
    const grass = grassReading(sampled.grass);
    out.push({
      requestedDistance: distance,
      camera: sampled.camera,
      baseAccepted: grass?.baseSample?.acceptedRecords ?? 0,
      focusAccepted: grass?.focusSample?.acceptedRecords ?? 0,
      coverageResident: grass?.rebuild?.activeCoverageResident === true,
      settledZoom: round(sampled.settledZoom),
      grassEnabled: grass?.enabled === true,
      recordCount: grass?.recordCount ?? null,
      activeBudget: grass?.rebuild?.activeRecordBudget ?? 0,
      areaScale: grass?.rebuild?.areaBudgetScale ?? 0,
      pending: grass?.rebuild?.pending ?? null,
      rafMedianMs: round(median(sampled.raf)),
      rafP95Ms: round(percentile(sampled.raf, 0.95)),
    });
  }
  return out;
}

/** Polls the route's own residency owner through the one reader, so the two
 * routes' differing stats shapes are understood in exactly one place.
 *
 * Same readiness contract as before: resident records and no pending rebuild,
 * or throw after the same 30 s. Only the poll moved off the page — this reads
 * the stats seam the owner already publishes, exactly as the previous in-page
 * predicate did, and it names the last reading when it gives up. */
async function waitForGrassReady(page) {
  const deadline = Date.now() + 30000;
  for (;;) {
    const grass = grassReading(
      await page.evaluate(() => window.__game?.stats?.().renderStats?.terrain?.grass ?? null),
    );
    if (grass && grass.recordCount > 0 && grass.rebuild?.pending !== true) return;
    if (Date.now() > deadline)
      throw new Error(
        `grass never became resident on the ${ROUTE} route: ${JSON.stringify(grass)}`,
      );
    await page.waitForTimeout(50);
  }
}

// Continuous zoom sweep: the churn the pan phase can't see. A zoom-coupled
// grass rebuild key once rebuilt every frame while zooming (David's "still
// slow" failure mode), so this phase pins the interaction.
async function sampleCameraZoomSweep(page, hardware) {
  await page.evaluate(async () => {
    const cam = window.__cam;
    cam.zoom = 3.0;
    cam.clampView?.();
    cam.setViewCenter(-100, -310);
    cam.clampView?.();
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  await waitForGrassReady(page);
  const sampled = await page.evaluate(
    async ({ durationMs }) => {
      const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const cam = window.__cam,
        frameMs = [];
      const startDistance = cam.params().distance;
      let last = performance.now(),
        nearestDistance = Infinity;
      const started = last;
      for (const [from, to] of [
        [startDistance, 10],
        [10, startDistance],
      ]) {
        const legStart = performance.now();
        while (true) {
          const t = Math.min(1, (performance.now() - legStart) / (durationMs / 2));
          const distance = from + (to - from) * t;
          cam.zoomAt(0, 0, cam.params().distance / distance);
          cam.setViewCenter(-100, -310);
          cam.clampView();
          await raf();
          const next = performance.now();
          frameMs.push(next - last);
          last = next;
          nearestDistance = Math.min(nearestDistance, cam.params().distance);
          if (t === 1) break;
        }
      }
      return {
        raf: frameMs,
        startDistance,
        nearestDistance,
        finalDistance: cam.params().distance,
        elapsedMs: performance.now() - started,
      };
    },
    { durationMs: PAN_DURATION_MS },
  );
  await waitForGrassReady(page);
  return {
    durationMs: PAN_DURATION_MS,
    elapsedMs: sampled.elapsedMs,
    startDistance: sampled.startDistance,
    nearestDistance: sampled.nearestDistance,
    finalDistance: sampled.finalDistance,
    rafMedianMs: round(median(sampled.raf)),
    rafP95Ms: round(percentile(sampled.raf, 0.95)),
  };
}

async function sampleCameraPan(page, hardware) {
  await page.evaluate(async () => {
    const cam = window.__cam;
    cam.zoomAt(0, 0, cam.params().distance / 160);
    cam.clampView?.();
    cam.setViewCenter(-100, -310);
    cam.clampView?.();
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  await waitForGrassReady(page);
  const before = grassReading(
    await page.evaluate(() => window.__game.stats().renderStats.terrain?.grass ?? null),
  );
  const sampled = await page.evaluate(
    async ({ distance, durationMs, frames }) => {
      const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const cam = window.__cam;
      const startX = -100;
      const y = -310;
      const frameMs = [];
      const gpu = [];
      let last = performance.now();
      const started = last;
      const startTarget = [...cam.params().target];
      const seed = window.__perfGpuReading();
      for (let i = 0; i < frames || performance.now() - started < durationMs; i++) {
        const now = performance.now();
        const t = Math.min(1, (now - started) / durationMs);
        cam.setViewCenter(startX + distance * t, y);
        cam.clampView?.();
        await raf();
        const next = performance.now();
        frameMs.push(next - last);
        last = next;
        gpu.push(window.__perfGpuReading());
      }
      cam.setViewCenter(startX + distance, y);
      cam.clampView?.();
      await raf();
      const endTarget = [...cam.params().target];
      const submitted = window.__game.stats().renderStats.camera.camera3d.target;
      return {
        gpu,
        seed,
        raf: frameMs,
        startTarget,
        endTarget,
        submitted,
        elapsedMs: performance.now() - started,
        actualDistanceM: Math.hypot(endTarget[0] - startTarget[0], endTarget[1] - startTarget[1]),
      };
    },
    {
      distance: PAN_DISTANCE_M,
      durationMs: PAN_DURATION_MS,
      frames: hardware ? Math.ceil(PAN_DURATION_MS / 16.67) : 20,
    },
  );
  await waitForGrassReady(page);
  const after = grassReading(
    await page.evaluate(() => window.__game.stats().renderStats.terrain?.grass ?? null),
  );
  const gpu = gpuSamples(sampled.gpu, sampled.seed);
  return {
    route: ROUTE,
    distanceM: PAN_DISTANCE_M,
    actualDistanceM: sampled.actualDistanceM,
    elapsedMs: sampled.elapsedMs,
    startTarget: sampled.startTarget,
    endTarget: sampled.endTarget,
    submitted: sampled.submitted,
    durationMs: PAN_DURATION_MS,
    rafMedianMs: round(median(sampled.raf)),
    rafP95Ms: round(percentile(sampled.raf, 0.95)),
    gpuMedianMs: round(median(gpu.ms)),
    gpuP95Ms: round(percentile(gpu.ms, 0.95)),
    gpuSamples: gpu.ms.length,
    gpuTimeMetric: gpu.metric,
    rebuildsBefore: before?.rebuild?.rebuilds ?? null,
    rebuildsAfter: after?.rebuild?.rebuilds ?? null,
    lastSampleMs: after?.rebuild?.lastSampleMs ?? null,
    recordCount: after?.recordCount ?? null,
    pending: after?.rebuild?.pending ?? null,
  };
}

async function sampleWheelBurst(page, hardware) {
  await page.evaluate(async () => {
    const cam = window.__cam;
    cam.zoom = 3.0;
    cam.clampView?.();
    cam.setViewCenter(-100, -310);
    cam.clampView?.();
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  await waitForGrassReady(page);
  const before = await page.evaluate(() => {
    const s = window.__game.stats();
    return {
      zoom: window.__cam.zoom,
      distance: window.__cam.params().distance,
      zoomT: window.__cam.zoomT,
      grass: s.renderStats.terrain?.grass ?? null,
    };
  });
  const sampled = await page.evaluate(
    async ({ eventCount, durationMs, frames }) => {
      const canvas = document.querySelector("#battlefield");
      if (!canvas) throw new Error("battlefield canvas not found");
      const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const frameMs = [];
      let sent = 0;
      let last = performance.now();
      const started = last;
      let nextEventAt = started;
      const eventSpacing = durationMs / eventCount;
      for (
        let i = 0;
        i < frames || performance.now() - started < durationMs || sent < eventCount;
        i++
      ) {
        const now = performance.now();
        while (sent < eventCount && now >= nextEventAt) {
          canvas.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              clientX: window.innerWidth * 0.52,
              clientY: window.innerHeight * 0.58,
              deltaY: sent < eventCount / 2 ? -38 : 26,
            }),
          );
          sent++;
          nextEventAt = started + sent * eventSpacing;
        }
        await raf();
        const next = performance.now();
        frameMs.push(next - last);
        last = next;
      }
      await raf();
      return { raf: frameMs, sent, finalZoom: window.__cam.zoom };
    },
    {
      eventCount: WHEEL_BURST_EVENTS,
      durationMs: WHEEL_BURST_DURATION_MS,
      frames: hardware ? Math.ceil(WHEEL_BURST_DURATION_MS / 16.67) + 12 : 20,
    },
  );
  await waitForGrassReady(page);
  const after = await page.evaluate(() => {
    const s = window.__game.stats();
    return {
      zoom: window.__cam.zoom,
      distance: window.__cam.params().distance,
      zoomT: window.__cam.zoomT,
      grass: s.renderStats.terrain?.grass ?? null,
    };
  });
  const rebuild = grassReading(after.grass)?.rebuild;
  return {
    events: WHEEL_BURST_EVENTS,
    durationMs: WHEEL_BURST_DURATION_MS,
    sent: sampled.sent,
    startZoom: round(before.zoom),
    finalZoom: round(sampled.finalZoom),
    settledZoom: round(after.zoom),
    startDistance: before.distance,
    settledDistance: after.distance,
    zoomT: after.zoomT,
    rafMedianMs: round(median(sampled.raf)),
    rafP95Ms: round(percentile(sampled.raf, 0.95)),
    rebuildsBefore: grassReading(before.grass)?.rebuild?.rebuilds ?? null,
    rebuildsAfter: rebuild?.rebuilds ?? null,
    pending: rebuild?.pending ?? null,
    lastSampleMs: rebuild?.lastSampleMs ?? null,
    lastSlices: rebuild?.lastSlices ?? null,
    lastMaxSliceMs: rebuild?.lastMaxSliceMs ?? null,
  };
}

// --- Harness-owned readers ------------------------------------------------
// The readers below belong to this gate alone. The three exported ones are
// exported only so the CPU tests can pin them; nothing in production, and no
// other scene, imports them. They exist because the two routes publish the same
// real measurements under different owners, and they retire with the route fork
// at the M9 cutover.

/** The routes this gate knows how to read. A mistyped selection is a run aimed
 * at nothing, not a request for the default: rejecting it is what stops a
 * `VERIFY_BATTLE_ROUTE=rwa` run from reporting the incumbent source renderer's
 * numbers under the raw world's name. */
export function assertKnownRoute(route) {
  if (Object.hasOwn(ROUTE_SUBSTRATE, route)) return route;
  throw new Error(
    `VERIFY_BATTLE_ROUTE must be "source" or "raw" (unset means source), not ${JSON.stringify(route)}`,
  );
}

/** The route's grass diagnostics, normalised to the columns this gate reads.
 *
 * Both routes measure the same real content, under different owners: the source
 * renderer flattens the residency owner into its blade-field CPU mirror, while
 * the selected raw world keeps that owner under `residency`, publishes the
 * record counts its GPU layers actually hold, and publishes the visibility its
 * route/draw obey — it owns no CPU tier, triangle or thinning mirror at all, so
 * those columns are absent rather than zero, and none of them is floored.
 * A shape the selected route does not actually publish reads as null here and
 * fails this gate's floors; it is never answered from the other route.
 * One owner for both branches, retired at the M9 cutover.
 */
export function grassReading(grass, route = ROUTE) {
  if (!grass || typeof grass !== "object") return null;
  if (route === "source")
    return {
      enabled: grass.enabled === true,
      recordCount: finiteCount(grass.recordCount),
      submittedTriangles: finiteCount(grass.submittedTriangles),
      tierRecords: tierColumn(grass.tiers, "records"),
      tierDroppedByThinning: tierColumn(grass.tiers, "droppedByThinning"),
      thinnedRecords: finiteCount(grass.thinnedRecords),
      detail: grass.detail ?? null,
      baseSample: grass.baseSample ?? null,
      focusSample: grass.focusSample ?? null,
      rebuild: grass.rebuild ?? null,
    };
  const { residency, visibility, layers } = grass;
  if (!residency || !visibility || !Array.isArray(layers) || layers.length !== 2) return null;
  // The focus layer's records reach the ground only while it is visible, which
  // is the same window the source merges its ring counts in. Visibility comes
  // from the prepared state, never from records a disabled layer still holds.
  const ringVisible = visibility.ring === true;
  const base = finiteCount(layers[0]?.recordCount);
  const ring = ringVisible ? finiteCount(layers[1]?.recordCount) : 0;
  return {
    enabled: visibility.base === true || ringVisible,
    recordCount: base === null || ring === null ? null : base + ring,
    submittedTriangles: null,
    tierRecords: null,
    tierDroppedByThinning: null,
    thinnedRecords: null,
    detail: residency.detail ?? null,
    baseSample: residency.baseSample ?? null,
    focusSample: residency.focusSample ?? null,
    rebuild: residency.rebuild ?? null,
  };
}

/** Reduces per-frame GPU readings to the samples the route can honestly claim.
 *
 * The source value is an asynchronous render-pass timestamp sum belonging to no
 * identified frame, so every read of it is the reading it has always been. The
 * raw value is one completed frame's own submission span, which stays on the
 * stats seam until a newer frame completes: reading it again is the same
 * measurement, not a second one, so it counts once per distinct frame identity.
 * The reading cached before the window opened belongs to a pre-window frame and
 * is seeded out. A missing measurement is dropped, never counted as zero.
 */
export function gpuSamples(readings, seed, route = ROUTE) {
  const ms = [];
  const metrics = new Set();
  const seen = new Set();
  const identity = (reading) =>
    Number.isFinite(reading?.frameId) && Number.isFinite(reading?.submissionId)
      ? `${reading.frameId}:${reading.submissionId}`
      : null;
  if (route !== "source") {
    const seeded = identity(seed);
    if (seeded !== null) seen.add(seeded);
  }
  for (const reading of readings) {
    const value = reading?.ms;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    if (route !== "source") {
      const key = identity(reading);
      if (key === null || seen.has(key)) continue;
      seen.add(key);
    }
    ms.push(value);
    if (reading.metric) metrics.add(reading.metric);
  }
  // Provenance travels with the numbers: a run that mixed metrics says so
  // rather than reporting one of them.
  return { ms, metric: metrics.size === 0 ? null : [...metrics].sort().join("+") };
}

function finiteCount(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function tierColumn(tiers, key) {
  if (!tiers) return null;
  return {
    near: tiers.near?.[key] ?? 0,
    mid: tiers.mid?.[key] ?? 0,
    far: tiers.far?.[key] ?? 0,
  };
}

function median(values) {
  return percentile(values, 0.5);
}

function percentile(values, p) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[idx];
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function crowdPixels(png) {
  let crowd = 0;
  let terrain = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    if (isCrowdMass(r, g, b)) crowd++;
    if ((r > 100 && g > 86 && b < 125) || (g > 78 && g >= r - 12 && b < 150)) terrain++;
  }
  return { crowd, terrain, total: png.width * png.height };
}

function isCrowdMass(r, g, b) {
  const luma = r * 0.3 + g * 0.59 + b * 0.11;
  const greenField = g > r + 22 && g > b + 12;
  return luma > 34 && luma < 132 && r < 165 && g < 155 && b < 145 && !greenField;
}
