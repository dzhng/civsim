import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

// The standing 30k perf gate (slice 04f): the PRODUCTION battle renderer
// (BattleRenderer — the surface slice 08b swaps) must hold the spec's locked
// budget of median <= 33 ms/frame GPU time with >= 30,000 soldiers plus the
// map's dense foliage fill on screen, at both the mid and vista zoom stops.
// Soldier/foliage counts are published and floored so the gate cannot silently
// shrink. Hardware adapter only for the ms assertion (VERIFY_GPU_ADAPTER=
// hardware; SwiftShader is not a perf oracle) — under SwiftShader the scene
// still runs as a correctness smoke and records that the budget was skipped.
// BMSGRASS-F4B1 adds a live camera-pan phase: rAF p95 must stay under the same
// 33 ms floor while the camera crosses multiple old 8m grass snap boundaries.
// Every photoreal ladder slice from 08b on re-runs this gate.
export const meta = {
  name: "battle-perf-30k",
  kind: "flow",
  world: "battle-real",
  tier: "full",
  snapshots: [],
  describe:
    "Production battle renderer holds 33 ms static GPU median and pan rAF p95 at 30k+ soldiers plus dense foliage.",
};

// Locked numbers (interview 2026-07-02): changing either requires David.
const BUDGET_MS = 33;
const SOLDIER_FLOOR = 30000;
// The load the counts may never shrink below (generated seed 7 base army plus
// dense scenery; production grass is the slice-11 blade-field record
// window plus slice-12 routed/thinned blade triangles).
const SPAWN_TARGET = 30500;
const SCENERY_FLOOR = 500;
const PRODUCTION_GRASS_RECORDS = 160000;
const PRODUCTION_GRASS_BUDGET_QUOTAS = [76800, 59200, 24000];
const VISTA_GRASS_RECORD_FLOOR = PRODUCTION_GRASS_RECORDS;
const VISTA_GRASS_TRIANGLE_FLOOR = 90000;
const VISTA_GRASS_FAR_SURVIVOR_FLOOR = 22000;
const PAN_DISTANCE_M = 200;
const PAN_DURATION_MS = 3000;

// Same production rig zooms as battle-camera-zoom: playable mid and the
// low-oblique cinematic vista (zoomT = 1), where grass density peaks. Both
// stops centre on the 30k crowd mass so the measured frame carries the
// soldiers on screen, not an empty field.
const STOPS = [
  { name: "mid", zoom: 3.0, center: [0, -310] },
  { name: "vista", zoom: 9.5, center: [0, -310] },
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
        device: s.renderStats.device,
      };
    });
    table.push({
      stop: stop.name,
      zoom: stop.zoom,
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

  const [mid, vista] = table;
  console.log(`battle-perf-30k frame-time table:\n${JSON.stringify(table, null, 2)}`);
  console.log(`battle-perf-30k pan table:\n${JSON.stringify(pan, null, 2)}`);

  // --- The load is real and may never shrink -------------------------------
  ctx.check(
    `gate holds >= ${SOLDIER_FLOOR} soldiers on the production battle renderer`,
    spawned.before + spawned.added >= SOLDIER_FLOOR &&
      table.every((row) => row.soldiers >= SOLDIER_FLOOR),
    JSON.stringify({ spawned, mid: mid.soldiers, vista: vista.soldiers }),
  );
  ctx.check(
    "gate holds the dense foliage fill (scenery + vista blade-field floors)",
    table.every((row) => row.scenery >= SCENERY_FLOOR) &&
      vista.grassRecords >= VISTA_GRASS_RECORD_FLOOR &&
      vista.grassTriangles >= VISTA_GRASS_TRIANGLE_FLOOR &&
      vista.grassTierRecords?.far >= VISTA_GRASS_FAR_SURVIVOR_FLOOR,
    JSON.stringify({
      scenery: vista.scenery,
      vistaGrassRecords: vista.grassRecords,
      vistaGrassTriangles: vista.grassTriangles,
      vistaGrassTierRecords: vista.grassTierRecords,
    }),
  );
  ctx.check(
    "production grass sample uses the pinned slice-12 stratified record budget",
    table.every(
      (row) =>
        row.grassSampleStratifiedBudget &&
        row.grassSampleCapacity === PRODUCTION_GRASS_RECORDS &&
        row.grassSampleAccepted === PRODUCTION_GRASS_RECORDS &&
        sameArray(row.grassSampleBudgetQuotas, PRODUCTION_GRASS_BUDGET_QUOTAS) &&
        Array.isArray(row.grassSampleDroppedByBudget) &&
        row.grassSampleDroppedByBudget.some((count) => count > 0),
    ),
    JSON.stringify(
      table.map((row) => ({
        stop: row.stop,
        accepted: row.grassSampleAccepted,
        capacity: row.grassSampleCapacity,
        lodCounts: row.grassSampleLodCounts,
        quotas: row.grassSampleBudgetQuotas,
        droppedByBudget: row.grassSampleDroppedByBudget,
      })),
    ),
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
  } else {
    ctx.check(
      "SwiftShader is not a perf oracle: ms budget assertion skipped (correctness smoke only)",
      true,
      JSON.stringify({ device: vista.device, rafMedianMs: table.map((row) => row.rafMedianMs) }),
    );
  }

  await page.close();
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

function sameArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
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
