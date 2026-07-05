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
// Every photoreal ladder slice from 08b on re-runs this gate.
export const meta = {
  name: "battle-perf-30k",
  kind: "flow",
  world: "battle-real",
  tier: "full",
  snapshots: [],
  describe:
    "Production battle renderer holds 33 ms median GPU frame time at 30k+ soldiers plus dense foliage.",
};

// Locked numbers (interview 2026-07-02): changing either requires David.
const BUDGET_MS = 33;
const SOLDIER_FLOOR = 30000;
// The load the counts may never shrink below (map A base army 15,560 soldiers,
// 548 scenery props; vista grass focus fill measured at 16,800 tufts /
// 184,800 blade instances / ~1.48M submitted triangles on 2026-07-02).
const SPAWN_TARGET = 30500;
const SCENERY_FLOOR = 500;
const VISTA_GRASS_TUFT_FLOOR = 15000;
const VISTA_GRASS_BLADE_FLOOR = 150000;

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
  await page.goto(`${ctx.target}?map=A&ai=off`);
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

  // Grow the map-A battle to the 30k floor through the production spawn path.
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
      return {
        soldiers: s.soldiers,
        renderSoldiers: s.renderStats.soldiers,
        scenery: s.renderStats.terrain?.scenery ?? 0,
        grassTufts: s.renderStats.terrain?.grass?.tuftInstances ?? 0,
        grassBlades: s.renderStats.terrain?.grass?.bladeInstances ?? 0,
        grassTriangles: s.renderStats.terrain?.grass?.submittedTriangles ?? 0,
        device: s.renderStats.device,
      };
    });
    table.push({
      stop: stop.name,
      zoom: stop.zoom,
      soldiers: stats.renderSoldiers,
      scenery: stats.scenery,
      grassTufts: stats.grassTufts,
      grassBlades: stats.grassBlades,
      grassTriangles: stats.grassTriangles,
      gpuMedianMs: round(median(sampled.gpu)),
      gpuP95Ms: round(percentile(sampled.gpu, 0.95)),
      gpuSamples: sampled.gpu.length,
      rafMedianMs: round(median(sampled.raf)),
      rafP95Ms: round(percentile(sampled.raf, 0.95)),
      device: stats.device,
    });

    shots[stop.name] = await page.locator("#battlefield").screenshot({ timeout: 180000 });
  }

  const [mid, vista] = table;
  console.log(`battle-perf-30k frame-time table:\n${JSON.stringify(table, null, 2)}`);

  // --- The load is real and may never shrink -------------------------------
  ctx.check(
    `gate holds >= ${SOLDIER_FLOOR} soldiers on the production battle renderer`,
    spawned.before + spawned.added >= SOLDIER_FLOOR &&
      table.every((row) => row.soldiers >= SOLDIER_FLOOR),
    JSON.stringify({ spawned, mid: mid.soldiers, vista: vista.soldiers }),
  );
  ctx.check(
    "gate holds the dense foliage fill (scenery + vista grass floors)",
    table.every((row) => row.scenery >= SCENERY_FLOOR) &&
      vista.grassTufts >= VISTA_GRASS_TUFT_FLOOR &&
      vista.grassBlades >= VISTA_GRASS_BLADE_FLOOR,
    JSON.stringify({
      scenery: vista.scenery,
      vistaGrassTufts: vista.grassTufts,
      vistaGrassBlades: vista.grassBlades,
      vistaGrassTriangles: vista.grassTriangles,
    }),
  );

  // --- Visual evidence: the crowd is on screen at both stops ----------------
  // Map A is 2400x1600 world units, so team-colored soldiers are a few pixels
  // each even at mid zoom (hardware measured mid ~2.8k / vista ~6.4k team
  // pixels on 2026-07-02); the floors prove formations render on screen, the
  // evidence shots are the human-readable proof of the field.
  const pixels = {
    mid: crowdPixels(PNG.sync.read(shots.mid)),
    vista: crowdPixels(PNG.sync.read(shots.vista)),
  };
  ctx.check(
    "frames show the crowd and terrain at both stops (load is on screen)",
    pixels.mid.team > 1400 &&
      pixels.vista.team > 3200 &&
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
  } else {
    ctx.check(
      "SwiftShader is not a perf oracle: ms budget assertion skipped (correctness smoke only)",
      true,
      JSON.stringify({ device: vista.device, rafMedianMs: table.map((row) => row.rafMedianMs) }),
    );
  }

  await page.close();
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
  let team = 0;
  let terrain = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    if ((r > g + 22 && r > b + 26 && r > 105) || (b > r + 24 && b > g + 8)) team++;
    if ((r > 100 && g > 86 && b < 125) || (g > 78 && g >= r - 12 && b < 150)) terrain++;
  }
  return { team, terrain, total: png.width * png.height };
}
