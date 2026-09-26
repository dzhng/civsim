import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { arch, cpus, platform } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { campaign, campaignPresentationReady } from "../worlds.mjs";

export const meta = {
  name: "camera-math-performance",
  kind: "flow",
  world: "campaign-real",
  tier: "full",
  snapshots: [],
  describe: "Capture real camera batches and separately measure unwrapped campaign frames.",
};

// Override source root when this scene's worktree observes another checkout's server.
const root =
  process.env.MATH_PERF_SOURCE_ROOT ?? fileURLToPath(new URL("../../../", import.meta.url));
const output = new URL("throwaway/math-optimization/", pathToFileURL(`${root}/`));
const durationMs = Number(process.env.MATH_PERF_MS ?? 5000);
const selectedCase = process.env.MATH_PERF_CASE;
const summary = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return {
    samples: sorted.length,
    medianMs: sorted[Math.floor(sorted.length * 0.5)],
    p95Ms: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)],
  };
};

export async function run(ctx) {
  if (!Number.isFinite(durationMs) || durationMs < 5000)
    throw new Error("MATH_PERF_MS must be finite and at least 5000");
  await mkdir(output, { recursive: true });
  const report = {
    recordedAt: new Date().toISOString(),
    sourceRoot: root,
    target: ctx.target,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    dirty: execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }).trim(),
    wasmSha256: createHash("sha256")
      .update(await readFile(`${root}/web/src/wasm/game_wasm_bg.wasm`))
      .digest("hex"),
    wasmJsSha256: createHash("sha256")
      .update(await readFile(`${root}/web/src/wasm/game_wasm.js`))
      .digest("hex"),
    machine: { platform: platform(), architecture: arch(), cpu: cpus()[0]?.model },
    build: "development server",
    headful: process.env.VERIFY_HEADFUL === "1",
    durationMs,
    selectedCase,
    verdict: "baseline only; isolated candidate comparison required",
    coverage: {
      cadence: "rAF intervals, not physical presentation",
      cpu: "cached production renderer.draw stages; excludes pre-draw cards/clamp/stats publication",
      task: "CDP TaskDuration delta includes all main-thread work and measurement callbacks",
      memory:
        "heap endpoints show retention; separate sampled allocation pass includes collected objects, not exact allocation counts or GC pause duration",
      rays: "derived from observed containing calls: four per footprint and four per shadow fit",
      fixtures: "only observed world.project calls; anchors are counted but never invoked by probe",
    },
    runs: [],
  };
  const seededContext = {
    ...ctx,
    newPage: async (options) => {
      const page = await ctx.newPage(options);
      await page.addInitScript(() => {
        let seed = 7;
        Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
      });
      return page;
    },
  };
  report.seed = 7;
  for (const dpr of [1, 2]) {
    if (selectedCase && !selectedCase.includes(`-dpr${dpr}`)) continue;
    const page = await campaign(seededContext, "new", {
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: dpr,
      timeout: 180000,
    });
    const cdp = await page.context().newCDPSession(page);
    try {
      await page.evaluate(() => window.__campaign.freeze(true));
      await campaignPresentationReady(page, 180000);
      const identity = await page.evaluate(async () => {
        const { Game } = await import("/src/wasm/game_wasm.js");
        return {
          generatedVistaShoreDistance:
            typeof Game.prototype.generated_vista_band_shore_distance_ptr,
          browser: navigator.userAgent,
          gpu: window.__campaignGpuStats.device,
          dpr: devicePixelRatio,
          viewport: [innerWidth, innerHeight],
          canvas: [
            window.__campaign.rendererOwner().canvas.width,
            window.__campaign.rendererOwner().canvas.height,
          ],
          tick: window.__campaign.currentTick(),
          paused: window.__campaign.paused(),
        };
      });
      if (identity.generatedVistaShoreDistance !== "function")
        throw new Error("Generated WASM API is stale: rebuild before measuring");
      identity.hardware =
        Boolean(identity.gpu) &&
        !/swiftshader|software|llvmpipe|unknown|initializing/i.test(identity.gpu);
      ctx.check(
        `DPR ${dpr}: requested adapter identified`,
        process.env.VERIFY_GPU_ADAPTER === "hardware" ? identity.hardware : Boolean(identity.gpu),
      );
      await cdp.send("Performance.enable");
      const cases = [
        ...["whole", "regional", "close"].flatMap((view) =>
          [false, true].map((moving) => ({ view, moving })),
        ),
        { view: "regional", moving: false, resized: true },
      ];
      for (const config of cases) {
        const id = `${config.view}-${config.moving ? "moving" : "held"}-dpr${dpr}${config.resized ? "-resize" : ""}`;
        if (selectedCase && selectedCase !== id) continue;
        if (config.resized) await page.setViewportSize({ width: 1100, height: 720 });
        const scale = { whole: 0.18, regional: 2, close: 7 }[config.view] * dpr;
        const firstPoseCpuMs = await page.evaluate((scale) => {
          const start = performance.now();
          window.__campaign.cam(-100, 250, scale);
          return performance.now() - start;
        }, scale);
        const firstTraversal = await sample(page, config.moving ? durationMs : 1000, config.moving);
        await campaignPresentationReady(page, 180000);
        await page.evaluate(
          (c) => window.__campaign.cam(c.x, c.y, c.scale),
          firstTraversal.startCamera,
        );
        if (config.moving) await page.keyboard.down("d");
        let frames, warmed, taskBefore, taskAfter;
        try {
          frames = await capture(page);
          if (config.moving) {
            await page.keyboard.up("d");
            await page.evaluate(
              (c) => window.__campaign.cam(c.x, c.y, c.scale),
              firstTraversal.startCamera,
            );
          }
          await campaignPresentationReady(page, 180000);
          // Wrappers are restored before this window; no sampling profiler is attached.
          taskBefore = await cdp.send("Performance.getMetrics");
          warmed = await sample(page, durationMs, config.moving);
          taskAfter = await cdp.send("Performance.getMetrics");
        } finally {
          if (config.moving && !page.isClosed()) await page.keyboard.up("d");
        }
        const task = (result) => result.metrics.find((m) => m.name === "TaskDuration")?.value;
        const run = {
          id,
          config,
          identity: {
            ...identity,
            viewport: [frames[0].width, frames[0].height],
            canvas: [frames[0].width * dpr, frames[0].height * dpr],
          },
          frames,
          firstPoseCpuMs,
          firstTraversal,
          warmed,
          actualMotion: warmed.movingTransitions ? "moving" : config.moving ? "clamped" : "held",
          taskMsPerFrame: ((task(taskAfter) - task(taskBefore)) * 1000) / warmed.samples.length,
          cadence: summary(warmed.samples.map((s) => s.intervalMs)),
          cpu: Object.fromEntries(
            ["buildMs", "uploadMs", "drawMs", "frameCpuMs"].map((key) => [
              key,
              summary(warmed.samples.map((s) => s.performance?.[key])),
            ]),
          ),
        };
        ctx.check(
          `${id}: complete finite CPU evidence`,
          Number.isFinite(run.taskMsPerFrame) &&
            Object.values(run.cpu).every((stage) => stage.samples === warmed.samples.length),
        );
        ctx.check(
          `${id}: captures complete production frames`,
          frames.length === 6 &&
            frames.every(
              (f) =>
                f.renders === 1 && f.preparations >= 1 && f.points.length > 0 && f.poseConsistent,
            ),
        );
        ctx.check(
          `${id}: warmed interval and production samples`,
          warmed.elapsedMs >= durationMs && warmed.samples.length > 10,
        );
        if (config.moving && config.view !== "whole")
          ctx.check(`${id}: camera actually moves`, warmed.movingTransitions > 0);
        report.runs.push(run);
        await writeFile(new URL(`${id}.json`, output), JSON.stringify(run));
        console.log(
          JSON.stringify({
            id,
            projections: frames[0].points.length,
            counts: frames[0].counts,
            preparations: frames[0].preparations,
            cadence: run.cadence,
            cpu: run.cpu.frameCpuMs,
          }),
        );
      }
      // Separate attribution pass: its intervals are deliberately excluded from timing summaries.
      if (dpr === 1 && !selectedCase) {
        await page.evaluate(() => window.__campaign.cam(-100, 250, 2));
        await campaignPresentationReady(page, 180000);
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
        await cdp.send("Profiler.start");
        const cpuFrames = await sample(page, durationMs);
        const { profile } = await cdp.send("Profiler.stop");
        await writeFile(new URL("campaign.cpuprofile", output), JSON.stringify(profile));
        report.cpuProfile = {
          file: "campaign.cpuprofile",
          frames: cpuFrames.samples.length,
          elapsedMs: cpuFrames.elapsedMs,
        };
        await cdp.send("HeapProfiler.startSampling", {
          samplingInterval: 32768,
          includeObjectsCollectedByMajorGC: true,
          includeObjectsCollectedByMinorGC: true,
        });
        const allocationFrames = await sample(page, durationMs);
        const { profile: allocationProfile } = await cdp.send("HeapProfiler.stopSampling");
        await writeFile(
          new URL("campaign-allocation.json", output),
          JSON.stringify(allocationProfile),
        );
        report.allocation = {
          file: "campaign-allocation.json",
          samplingIntervalBytes: 32768,
          includesCollectedObjects: true,
          frames: allocationFrames.samples.length,
          elapsedMs: allocationFrames.elapsedMs,
          samples: allocationProfile.samples.length,
          sampledBytes: allocationProfile.samples.reduce((sum, sample) => sum + sample.size, 0),
        };
        ctx.check("allocation sampling captured", report.allocation.samples > 0);
      }
    } finally {
      // A watchdog already destroys this owned page; keep the original diagnostic error.
      await cdp.detach().catch(() => {});
      await page.close().catch(() => {});
    }
  }
  if (!report.runs.length) throw new Error(`No camera cases matched ${selectedCase}`);
  report.hardware = report.runs.every((run) => run.identity.hardware)
    ? "identified adapter"
    : "inconclusive";
  await writeFile(new URL("camera-baseline.json", output), JSON.stringify(report));
  console.log(
    `cameraMathReport=${new URL("camera-baseline.json", output).pathname}; ${report.verdict}`,
  );
}

async function sample(page, ms, moving = false) {
  return evaluateWithin(
    page,
    ms + 10000,
    async ({ ms, moving }) => {
      const samples = [];
      const memory = () =>
        performance.memory
          ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize }
          : null;
      const startCamera = window.__campaign.camGet(),
        heapBefore = memory();
      const start = performance.now();
      let previous = await new Promise(requestAnimationFrame),
        activeKey;
      let previousCamera = startCamera,
        movingTransitions = 0;
      const key = (type, key) =>
        window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
      try {
        while (performance.now() - start < ms) {
          // Bound the traversal with normal input; a held key can hit the clamp before timing starts.
          const nextKey = Math.floor((performance.now() - start) / 500) % 2 ? "a" : "d";
          if (moving && nextKey !== activeKey) {
            if (activeKey) key("keyup", activeKey);
            key("keydown", nextKey);
            activeKey = nextKey;
          }
          const now = await new Promise(requestAnimationFrame);
          const camera = window.__campaign.camGet();
          if (
            camera.x !== previousCamera.x ||
            camera.y !== previousCamera.y ||
            camera.scale !== previousCamera.scale
          )
            movingTransitions++;
          previousCamera = camera;
          samples.push({
            intervalMs: now - previous,
            camera,
            performance: { ...window.__campaignGpuStats.performance },
          });
          previous = now;
        }
      } finally {
        if (activeKey) key("keyup", activeKey);
      }
      return {
        elapsedMs: performance.now() - start,
        movingTransitions,
        samples,
        heapBefore,
        heapAfter: memory(),
        startCamera,
        endCamera: window.__campaign.camGet(),
      };
    },
    { ms, moving },
  );
}

async function capture(page) {
  const serialized = await evaluateWithin(page, 10000, async () => {
    const renderer = window.__campaign.rendererOwner(),
      world = renderer.world;
    const restore = [],
      frames = [];
    let frame,
      category = "other",
      inStats = false,
      rendering = false;
    const fresh = () => ({
      pose: null,
      points: [],
      counts: {},
      preparations: 0,
      renders: 0,
      poseConsistent: true,
      preDrawPoints: 0,
      calls: { anchors: 0, stats: 0, toScreen: 0, footprints: 0 },
    });
    const wrap = (owner, key, fn) => {
      const original = owner[key],
        own = Object.hasOwn(owner, key);
      owner[key] = function (...args) {
        return fn(original.bind(this), args);
      };
      restore.push(() => {
        if (own) owner[key] = original;
        else delete owner[key];
      });
    };
    const group = (owner, key, name) =>
      wrap(owner, key, (original, args) => {
        const previous = category;
        category = inStats ? `stats.${name}` : name;
        try {
          return original(...args);
        } finally {
          category = previous;
        }
      });
    wrap(world, "stats", (original, args) => {
      if (frame) frame.calls.stats++;
      const previous = inStats;
      inStats = true;
      try {
        return original(...args);
      } finally {
        inStats = previous;
      }
    });
    group(world.labels, "update", "labels");
    group(world.markers, "update", "markers");
    group(world, "cityScreenBounds", "cityScreenBounds");
    for (const [owner, key, counter] of [
      [world, "anchors", "anchors"],
      [renderer, "toScreen", "toScreen"],
      [renderer, "groundFootprintForScale", "footprints"],
    ]) {
      wrap(owner, key, (original, args) => {
        if (frame) frame.calls[counter]++;
        return original(...args);
      });
    }
    wrap(world, "setFrameCamera", (original, args) => {
      if (frame) {
        const [pose, width, height, dpr] = args;
        frame.preparations++;
        if (frame.pose)
          frame.poseConsistent &&= JSON.stringify(frame.pose) === JSON.stringify(pose);
        else Object.assign(frame, { pose: structuredClone(pose), width, height, dpr });
      }
      return original(...args);
    });
    wrap(world, "render", (original, args) => {
      if (frame) frame.renders++;
      rendering = true;
      try {
        return original(...args);
      } finally {
        rendering = false;
      }
    });
    wrap(world, "project", (original, args) => {
      if (frame) {
        frame.points.push(args.slice(0, 3));
        frame.counts[category] = (frame.counts[category] ?? 0) + 1;
        if (!rendering && !inStats) frame.preDrawPoints++;
      }
      return original(...args);
    });
    try {
      // Begin/end on rAF boundaries so async page evaluation never splits a production frame.
      await new Promise(requestAnimationFrame);
      frame = fresh();
      for (let i = 0; i < 6; i++) {
        await new Promise(requestAnimationFrame);
        frame.otherRays = { clamp: frame.calls.footprints * 4, shadow: frame.renders * 4 };
        frames.push(frame);
        frame = fresh();
      }
      return JSON.stringify(frames);
    } finally {
      for (const undo of restore.reverse()) undo();
    }
  });
  return JSON.parse(serialized);
}

async function evaluateWithin(page, timeoutMs, fn, args) {
  let timer;
  try {
    return await Promise.race([
      page.evaluate(fn, args),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          void page.close().catch(() => {});
          reject(new Error(`Camera measurement exceeded ${timeoutMs}ms; owned page closed`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
