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
const MEADOW_RING_RECORD_CAP = 1_000_000; // meadow-polish P3.3 focus ring
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
// Physical close stops: formation detail and the production 10m endpoint.
// Old dial values 24/28 both clamped to 8 and measured the same frame.
const CLOSE_FILL_DISTANCES_M = [24, 10];

// Same production rig zooms as battle-camera-zoom: playable mid and the
// low-oblique cinematic vista (zoomT = 1), where grass density peaks. Both
// stops centre on the 30k crowd mass so the measured frame carries the
// soldiers on screen, not an empty field.
const STOPS = [
  { name: "mid", zoom: 3.0, center: [0, -310] },
  { name: "vista", zoom: 8, center: [0, -310] },
];

const WARMUP_FRAMES = 60;
const SAMPLE_FRAMES = 150;
const REPORT_DIR = new URL("../../reports/rendering/scenario-runs/", import.meta.url);

export async function run(ctx) {
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
    await page.evaluate(async ({ zoom, center }) => {
      const cam = window.__cam;
      cam.zoom = zoom;
      cam.clampView?.();
      await new Promise((resolve) => setTimeout(resolve, 80));
      cam.setViewCenter(center[0], center[1]);
      cam.clampView?.();
    }, stop);
    await page.waitForTimeout(200);
    await waitForGrassReady(page);

    // Warm frames, then per-frame samples: rAF wall time plus the shell's
    // timestamp-query GPU time surfaced through the production stats seam.
    // SwiftShader gets a token sample run (liveness), never a verdict.
    const sampled = await page.evaluate(
      async ({ warmup, frames }) => {
        const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
        for (let i = 0; i < warmup; i++) await raf();
        const gpu = [];
        const frameMs = [];
        let last = performance.now();
        for (let i = 0; i < frames; i++) {
          await raf();
          const now = performance.now();
          frameMs.push(now - last);
          last = now;
          const g = window.__game.stats().renderStats.performance.gpuTimeMs;
          if (typeof g === "number" && Number.isFinite(g) && g >= 0) gpu.push(g);
        }
        return { gpu, raf: frameMs };
      },
      { warmup: hardware ? WARMUP_FRAMES : 5, frames: hardware ? SAMPLE_FRAMES : 10 },
    );

    const stats = await page.evaluate(() => {
      const s = window.__game.stats();
      const grass = s.renderStats.terrain?.grass;
      const sample = grass?.sample;
      return {
        soldiers: s.soldiers,
        renderSoldiers: s.renderStats.soldiers,
        scenery: s.renderStats.terrain?.scenery ?? 0,
        grassRecords: grass?.recordCount ?? 0,
        grassTriangles: grass?.submittedTriangles ?? 0,
        grassTierRecords: grass?.tiers
          ? {
              near: grass.tiers.near?.records ?? 0,
              mid: grass.tiers.mid?.records ?? 0,
              far: grass.tiers.far?.records ?? 0,
            }
          : null,
        grassTierDroppedByThinning: grass?.tiers
          ? {
              near: grass.tiers.near?.droppedByThinning ?? 0,
              mid: grass.tiers.mid?.droppedByThinning ?? 0,
              far: grass.tiers.far?.droppedByThinning ?? 0,
            }
          : null,
        grassThinnedRecords: grass?.thinnedRecords ?? 0,
        grassSampleAccepted: sample?.acceptedRecords ?? 0,
        grassSampleCapacity: sample?.recordCapacity ?? 0,
        grassSampleLodCounts: sample?.lodCounts ?? null,
        grassSampleBudgetQuotas: sample?.lodBudgetQuotas ?? null,
        grassSampleDroppedByBudget: sample?.lodDroppedByBudget ?? null,
        grassSampleStratifiedBudget: sample?.lodStratifiedBudget === true,
        grassActiveRecordBudget: grass?.rebuild?.activeRecordBudget ?? 0,
        grassAreaBudgetScale: grass?.rebuild?.areaBudgetScale ?? 0,
        grassVistaRecordBudget: grass?.rebuild?.vistaRecordBudget ?? 0,
        camera: { zoom: window.__cam.zoom, ...window.__cam.params() },
        device: s.renderStats.device,
      };
    });
    table.push({
      stop: stop.name,
      requestedZoom: stop.zoom,
      camera: stats.camera,
      soldiers: stats.renderSoldiers,
      scenery: stats.scenery,
      grassRecords: stats.grassRecords,
      grassTriangles: stats.grassTriangles,
      grassTierRecords: stats.grassTierRecords,
      grassTierDroppedByThinning: stats.grassTierDroppedByThinning,
      grassThinnedRecords: stats.grassThinnedRecords,
      grassSampleAccepted: stats.grassSampleAccepted,
      grassSampleCapacity: stats.grassSampleCapacity,
      grassSampleLodCounts: stats.grassSampleLodCounts,
      grassSampleBudgetQuotas: stats.grassSampleBudgetQuotas,
      grassSampleDroppedByBudget: stats.grassSampleDroppedByBudget,
      grassSampleStratifiedBudget: stats.grassSampleStratifiedBudget,
      grassActiveRecordBudget: stats.grassActiveRecordBudget,
      grassAreaBudgetScale: stats.grassAreaBudgetScale,
      grassVistaRecordBudget: stats.grassVistaRecordBudget,
      gpuMedianMs: round(median(sampled.gpu)),
      gpuP95Ms: round(percentile(sampled.gpu, 0.95)),
      gpuSamples: sampled.gpu.length,
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
  console.log(`battle-perf-30k frame-time table:\n${JSON.stringify(table, null, 2)}`);
  console.log(`battle-perf-30k pan table:\n${JSON.stringify(pan, null, 2)}`);
  console.log(`battle-perf-30k wheel-burst table:\n${JSON.stringify(wheelBurst, null, 2)}`);
  console.log(`battle-perf-30k close-zoom-fill table:\n${JSON.stringify(closeZoomFill, null, 2)}`);

  ctx.check(
    "static stops reach their requested production camera framing",
    table.every((row) => Math.abs(row.camera.zoom - row.requestedZoom) < 1e-6) &&
      mid.camera.distance > vista.camera.distance,
    JSON.stringify(
      table.map(({ stop, requestedZoom, camera }) => ({ stop, requestedZoom, camera })),
    ),
  );
  ctx.check(
    "close fill measures two distinct physical camera distances",
    closeZoomFill.every((row) => Math.abs(row.camera.distance - row.requestedDistanceM) < 0.01) &&
      closeZoomFill[0].camera.distance > closeZoomFill[1].camera.distance * 2,
    JSON.stringify(closeZoomFill),
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
          // Two-set contract (meadow-polish P3.3): base-only stops report the
          // static cap; ring-engaged stops report base+ring. Records must stay
          // within whichever budget the world declares for the stop.
          (row.grassActiveRecordBudget === STATIC_GRASS_RECORD_CAP ||
            row.grassActiveRecordBudget === STATIC_GRASS_RECORD_CAP + MEADOW_RING_RECORD_CAP) &&
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
    "close zoom fill keeps the close-gate-density grass budget active",
    closeZoomFill.every(
      (row) =>
        row.grassEnabled &&
        row.pending !== true &&
        row.activeBudget >= CLOSE_GRASS_RECORD_FLOOR &&
        row.recordCount >= CLOSE_GRASS_RECORD_FLOOR,
    ),
    JSON.stringify(closeZoomFill),
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
      `close distance ${CLOSE_FILL_DISTANCES_M.join("/")}m grass-on fill keeps rAF p95 within the ${BUDGET_MS} ms budget`,
      closeZoomFill.every((row) => row.rafP95Ms !== null && row.rafP95Ms <= BUDGET_MS),
      JSON.stringify(closeZoomFill),
    );
    ctx.check(
      "wheel burst final zoom stays between min and max clamps",
      wheelBurst.finalZoom > wheelBurst.minZoom && wheelBurst.finalZoom < wheelBurst.maxZoom,
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
  for (const distanceM of CLOSE_FILL_DISTANCES_M) {
    await page.evaluate(
      async ({ distanceM }) => {
        const cam = window.__cam;
        const canvas = document.querySelector("#battlefield");
        cam.zoomAt(canvas.width / 2, canvas.height / 2, cam.params().distance / distanceM);
        cam.clampView?.();
        cam.setViewCenter(0, -310);
        cam.clampView?.();
        await new Promise((resolve) => setTimeout(resolve, 120));
      },
      { distanceM },
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
        const grass = s.renderStats.terrain?.grass;
        return {
          raf: frameMs,
          camera: { zoom: window.__cam.zoom, ...window.__cam.params() },
          grassEnabled: grass?.enabled === true,
          recordCount: grass?.recordCount ?? 0,
          activeBudget: grass?.rebuild?.activeRecordBudget ?? 0,
          areaScale: grass?.rebuild?.areaBudgetScale ?? 0,
          pending: grass?.rebuild?.pending ?? null,
        };
      },
      { warmup: hardware ? 30 : 3, frames: hardware ? 90 : 10 },
    );
    out.push({
      requestedDistanceM: distanceM,
      camera: sampled.camera,
      grassEnabled: sampled.grassEnabled,
      recordCount: sampled.recordCount,
      activeBudget: sampled.activeBudget,
      areaScale: sampled.areaScale,
      pending: sampled.pending,
      rafMedianMs: round(median(sampled.raf)),
      rafP95Ms: round(percentile(sampled.raf, 0.95)),
    });
  }
  return out;
}

async function waitForGrassReady(page) {
  await page.waitForFunction(
    () => {
      const grass = window.__game?.stats?.().renderStats?.terrain?.grass;
      return grass?.recordCount > 0 && grass?.rebuild?.pending !== true;
    },
    undefined,
    { timeout: 30000 },
  );
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
    async ({ durationMs, frames }) => {
      const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const cam = window.__cam;
      const frameMs = [];
      let last = performance.now();
      const started = last;
      for (let i = 0; i < frames; i++) {
        const now = performance.now();
        const t = Math.min(1, (now - started) / durationMs);
        // 3.0 -> 8.0 -> 3.0 triangle sweep across the playable zoom band.
        const tri = t < 0.5 ? t * 2 : 2 - t * 2;
        cam.zoom = 3.0 + 5.0 * tri;
        cam.clampView?.();
        await raf();
        const next = performance.now();
        frameMs.push(next - last);
        last = next;
      }
      return { raf: frameMs };
    },
    { durationMs: PAN_DURATION_MS, frames: hardware ? Math.ceil(PAN_DURATION_MS / 16.67) : 20 },
  );
  await waitForGrassReady(page);
  return {
    durationMs: PAN_DURATION_MS,
    rafMedianMs: round(median(sampled.raf)),
    rafP95Ms: round(percentile(sampled.raf, 0.95)),
  };
}

async function sampleCameraPan(page, hardware) {
  await page.evaluate(async () => {
    const cam = window.__cam;
    cam.zoom = 3.0;
    cam.clampView?.();
    cam.setViewCenter(-100, -310);
    cam.clampView?.();
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  await waitForGrassReady(page);
  const before = await page.evaluate(() => window.__game.stats().renderStats.terrain?.grass);
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
      for (let i = 0; i < frames; i++) {
        const now = performance.now();
        const t = Math.min(1, (now - started) / durationMs);
        cam.setViewCenter(startX + distance * t, y);
        cam.clampView?.();
        await raf();
        const next = performance.now();
        frameMs.push(next - last);
        last = next;
        const g = window.__game.stats().renderStats.performance.gpuTimeMs;
        if (typeof g === "number" && Number.isFinite(g) && g >= 0) gpu.push(g);
      }
      cam.setViewCenter(startX + distance, y);
      cam.clampView?.();
      await raf();
      return { gpu, raf: frameMs };
    },
    {
      distance: PAN_DISTANCE_M,
      durationMs: PAN_DURATION_MS,
      frames: hardware ? Math.ceil(PAN_DURATION_MS / 16.67) : 20,
    },
  );
  await waitForGrassReady(page);
  const after = await page.evaluate(() => window.__game.stats().renderStats.terrain?.grass);
  return {
    distanceM: PAN_DISTANCE_M,
    durationMs: PAN_DURATION_MS,
    rafMedianMs: round(median(sampled.raf)),
    rafP95Ms: round(percentile(sampled.raf, 0.95)),
    gpuMedianMs: round(median(sampled.gpu)),
    gpuP95Ms: round(percentile(sampled.gpu, 0.95)),
    gpuSamples: sampled.gpu.length,
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
      rebuilds: s.renderStats.terrain?.grass?.rebuild?.rebuilds ?? null,
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
      for (let i = 0; i < frames; i++) {
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
      while (sent < eventCount) {
        canvas.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: window.innerWidth * 0.52,
            clientY: window.innerHeight * 0.58,
            deltaY: 26,
          }),
        );
        sent++;
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
    const grass = s.renderStats.terrain?.grass;
    return {
      zoom: window.__cam.zoom,
      rebuilds: grass?.rebuild?.rebuilds ?? null,
      pending: grass?.rebuild?.pending ?? null,
      lastSampleMs: grass?.rebuild?.lastSampleMs ?? null,
      lastSlices: grass?.rebuild?.lastSlices ?? null,
      lastMaxSliceMs: grass?.rebuild?.lastMaxSliceMs ?? null,
    };
  });
  return {
    events: WHEEL_BURST_EVENTS,
    durationMs: WHEEL_BURST_DURATION_MS,
    sent: sampled.sent,
    startZoom: round(before.zoom),
    finalZoom: round(sampled.finalZoom),
    settledZoom: round(after.zoom),
    minZoom: 0.4,
    maxZoom: 8,
    rafMedianMs: round(median(sampled.raf)),
    rafP95Ms: round(percentile(sampled.raf, 0.95)),
    rebuildsBefore: before.rebuilds,
    rebuildsAfter: after.rebuilds,
    pending: after.pending,
    lastSampleMs: after.lastSampleMs,
    lastSlices: after.lastSlices,
    lastMaxSliceMs: after.lastMaxSliceMs,
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
