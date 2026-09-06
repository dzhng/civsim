import { fileURLToPath } from "node:url";

export const meta = {
  name: "battle-model-budget",
  kind: "flow",
  world: "battle-models-animated-budget",
  tier: "full",
  snapshots: [],
  describe: "Hardware-only, frame-correlated animation and production render cost; no art verdict.",
};

// This is a numerical workload, not a replacement for the standing 30k gate.
export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1" || process.env.VERIFY_GPU_ADAPTER !== "hardware") {
    ctx.check("animated budget requires hardware WebGPU", false);
    return;
  }
  const width = Number(process.env.BUDGET_WIDTH ?? 1280);
  const height = Number(process.env.BUDGET_HEIGHT ?? 800);
  const count = Number(process.env.BUDGET_SOLDIERS ?? 30000);
  const frames = Number(process.env.BUDGET_FRAMES ?? 180);
  const warmup = 60;
  if (![width, height, count, frames].every((n) => Number.isSafeInteger(n) && n > 0))
    throw new Error("Budget dimensions/count/frames must be positive integers");
  const page = await ctx.newPage({ viewport: { width, height } });
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  try {
    await page.goto(`${ctx.target}/renderer/battle-models?ref=1`);
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 120000,
    });
    await page.evaluate(() => window.__battleModels.freeze());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    const rows = await page.evaluate(
      async (config) => {
        const module = (path) => import(`/@fs${config.root}${path}`);
        const { FrameBudgetProbe } = await module("web/scenes/models/_frame-budget-probe.ts");
        const { installAllocationBudgetProbe } = await module(
          "web/scenes/models/_allocation-budget-probe.ts",
        );
        const { ActionTimeline } = await module("packages/crowd-runtime/src/actionTimeline.ts");
        const { SimClock } = await module("web/src/shared/simClock.ts");
        const { BATTLE_TICK_DT, BATTLE_MAX_TICKS_PER_FRAME } = await module(
          "web/src/battle/battleWorld.ts",
        );
        const { generatedFormation, buildCrowdInstances } = await module(
          "packages/crowd-runtime/src/instanceData.ts",
        );
        const { modelCamera, DEFAULT_MODEL_POSE } = await module(
          "apps/renderer-lab/src/battleModelFixture.ts",
        );
        const w = window.__battleModels.world;
        const device = w.world.renderer.backend.device;
        if (!device.features.has("timestamp-query"))
          throw new Error("Hardware timestamps unavailable");
        const raf = () => new Promise(requestAnimationFrame);
        const formations = generatedFormation(config.count, { classId: 4, spacing: 1.6 });
        const positions = Float32Array.from(formations.flatMap((i) => [i.x, i.y]));
        const soldierUnit = new Uint32Array(config.count);
        const facings = Float32Array.from(formations, (i) => i.facing);
        const source = w.soldierAssets[4];
        w.resize(config.width, config.height, 1);
        w.setStatic(soldierUnit, [0], [4]);
        w.setTime(0);
        const rows = [];
        let frameId = 0;
        for (const [stop, zoom] of [
          ["close", 190],
          ["mid", 12],
          ["vista", 3],
        ]) {
          const camera = modelCamera({ ...DEFAULT_MODEL_POSE, zoom }, config.width, config.height);
          for (const mode of ["steady", "interruptions"]) {
            // Match BattleCrowd: the capped simulation clock advances, then the
            // controller observes only the latest state, never every missed tick.
            for (const instrumented of [false, true]) {
              const timeline = new ActionTimeline(w.soldierAssets);
              const observations = Array.from({ length: config.count }, () => ({
                appearanceId: 4,
                alive: true,
                health: 100,
                mountHealth: 100,
                speedMps: 1,
                running: false,
                atEase: false,
                pikeReady: false,
                fighting: false,
                releaseTtl: 0,
                releaseAgeSeconds: 0,
              }));
              const probe = instrumented ? new FrameBudgetProbe(device) : null;
              const samples = [];
              const clock = new SimClock({
                tickHz: 1 / BATTLE_TICK_DT,
                maxTicksPerFrame: BATTLE_MAX_TICKS_PER_FRAME,
              });
              let priorRaf,
                snapshotHighWater = 0;
              let tick = -1;
              const draw = (sampleTick) => {
                const t0 = performance.now();
                const nextTick = Math.floor(sampleTick);
                let observedTicks = 0;
                if (tick < nextTick) {
                  tick = nextTick;
                  observedTicks = 1;
                  const cycle = tick % 60;
                  const lastRelease = [10, 11, 14, 15, 18].findLast((event) => event <= cycle);
                  const age = lastRelease === undefined ? Infinity : (cycle - lastRelease) / 30;
                  for (const observation of observations) {
                    observation.running =
                      mode === "interruptions" && ((cycle >= 4 && cycle < 23) || cycle >= 25);
                    observation.releaseTtl = mode === "interruptions" ? Math.max(0, 0.5 - age) : 0;
                    observation.releaseAgeSeconds =
                      mode === "interruptions" && Number.isFinite(age) ? age : 0;
                  }
                  timeline.update(tick, observations);
                }
                const t1 = performance.now();
                const playback = timeline.sample(sampleTick);
                const t2 = performance.now();
                const { instances } = buildCrowdInstances({
                  positions,
                  facings,
                  playback,
                  soldierUnit,
                  unitTeam: [0],
                  terrainHeight: (x, y) => w.heightAt(x, y),
                  count: config.count,
                });
                const t3 = performance.now();
                w.drawInstances(instances, camera);
                const t4 = performance.now();
                w.render();
                const t5 = performance.now();
                return {
                  sampleTick,
                  observedTicks,
                  observeMs: t1 - t0,
                  sampleMs: t2 - t1,
                  buildMs: t3 - t2,
                  uploadMs: t4 - t3,
                  renderSubmitMs: t5 - t4,
                };
              };
              try {
                draw(0);
                await w.settlePresentedFrame();
                for (let frame = 1; frame <= config.warmup + config.frames; frame++) {
                  const rafTime = await raf();
                  const advancedTicks = clock.advance(rafTime);
                  const sampleTick = clock.tick + clock.alpha;
                  const id = ++frameId;
                  let phases;
                  const start = performance.now();
                  if (probe && frame > config.warmup)
                    probe.measure(id, () => {
                      phases = draw(sampleTick);
                    });
                  else phases = draw(sampleTick);
                  const cpuFrameMs = performance.now() - start;
                  if (frame > config.warmup) {
                    const telemetryStart = performance.now();
                    snapshotHighWater = Math.max(snapshotHighWater, timeline.snapshotBytes);
                    const telemetryMs = performance.now() - telemetryStart;
                    samples.push({
                      frameId: id,
                      rafMs: rafTime - priorRaf,
                      cpuFrameMs,
                      telemetryMs,
                      advancedTicks,
                      ...phases,
                    });
                  }
                  priorRaf = rafTime;
                }
                await probe?.drain();
                const timings = probe?.takeResults() ?? [];
                rows.push({
                  stop,
                  zoom,
                  mode,
                  instrumented,
                  samples,
                  timings,
                  snapshotHighWater,
                  stats: w.stats(),
                  asset: {
                    bones: source.rig.bones.length,
                    vertices: source.tiers.map((m) => m.positions.length / 3),
                    triangles: source.tiers.map((m) => m.indices.length / 3),
                    authoredSamples: source.animation.clips.map((c) => ({
                      name: c.name,
                      samples: c.times.length,
                    })),
                    animationBytes:
                      source.animation.data.byteLength + source.animation.stepMasks.byteLength,
                  },
                });
              } finally {
                probe?.dispose();
              }
            }
          }
        }
        // Allocation observation is separate from timing: method wrappers and
        // accounting should not inflate the reported production CPU workload.
        const allocation = installAllocationBudgetProbe(device);
        const allocationStates = {};
        let replacement;
        try {
          const assets = { 4: source };
          const instances = w.instances;
          const camera = modelCamera(
            { ...DEFAULT_MODEL_POSE, zoom: 3 },
            config.width,
            config.height,
          );
          allocation.phase("initialization");
          replacement = await w.crowd.constructor.create(w.world.renderer, w.world.scene, assets);
          w.crowd.dispose();
          w.crowd = replacement;
          replacement = undefined;
          allocationStates.initialization = w.stats().crowd;
          for (const size of [...new Set([1, Math.ceil(config.count / 2), config.count])]) {
            allocation.phase(`grow-${size}`);
            w.drawInstances(instances.slice(0, size), camera);
            w.render();
            await w.settlePresentedFrame();
            allocationStates[`grow-${size}`] = w.stats().crowd;
          }
          allocation.phase("frozen-repeat");
          for (let frame = 0; frame < 10; frame++) {
            w.drawInstances(instances, camera);
            w.render();
            await w.settlePresentedFrame();
          }
          allocationStates["frozen-repeat"] = w.stats().crowd;
          allocation.phase("replacement-overlap");
          replacement = await w.crowd.constructor.create(w.world.renderer, w.world.scene, assets);
          w.crowd.dispose();
          w.crowd = replacement;
          replacement = undefined;
          w.drawInstances(instances, camera);
          w.render();
          await w.settlePresentedFrame();
          allocationStates["replacement-overlap"] = w.stats().crowd;
          rows.push({
            allocation: allocation.snapshot(),
            allocationStates,
            camera,
            scope:
              "Tracked fresh crowd generations only; uploads include whole-device traffic. Frozen-repeat is not advancing playback. Requested bytes exclude opaque texture storage and driver overhead.",
          });
        } finally {
          replacement?.dispose();
          allocation.dispose();
        }
        return rows;
      },
      {
        root: fileURLToPath(new URL("../../../", import.meta.url)),
        width,
        height,
        count,
        frames,
        warmup,
      },
    );
    for (const row of rows) {
      if (row.allocation) {
        ctx.check(
          "allocation captures initialization and replacement",
          row.allocation.phases.initialization.createdResources > 0 &&
            row.allocation.phases["replacement-overlap"].createdResources > 0 &&
            row.allocation.total.bufferCreatedBytes > 0 &&
            row.allocation.total.mappedAtCreationBytes > 0 &&
            row.allocation.phases["replacement-overlap"].destroyedResources > 0,
          row,
        );
        continue;
      }
      const name = `${row.stop}/${row.mode}/${row.instrumented ? "timed" : "control"}`;
      ctx.check(`${name}: complete submitted crowd`, row.stats.soldiers === count, row.stats.crowd);
      const percentile = (values, fraction) =>
        [...values].sort((a, b) => a - b)[
          Math.min(values.length - 1, Math.floor(values.length * fraction))
        ];
      const cpuMedianMs = percentile(
        row.samples.map((s) => s.cpuFrameMs),
        0.5,
      );
      const rafP95Ms = percentile(
        row.samples.map((s) => s.rafMs),
        0.95,
      );
      ctx.check(`${name}: CPU submission median <= 33ms`, cpuMedianMs <= 33, { cpuMedianMs });
      ctx.check(`${name}: live cadence p95 <= 33ms`, rafP95Ms <= 33, { rafP95Ms });
      if (row.instrumented) {
        const measured = row.timings.filter((t) => t.status === "measured");
        ctx.check(
          `${name}: correlated timing coverage`,
          measured.length >= frames * 0.95 &&
            new Set(row.timings.map((t) => t.frameId)).size === frames &&
            row.timings.every((t) => row.samples.some((s) => s.frameId === t.frameId)) &&
            !row.timings.some((t) => t.status === "error"),
          row.timings,
        );
        const values = measured.map((t) => t.gpuQueueMs).sort((a, b) => a - b);
        const median = values[Math.floor(values.length / 2)];
        ctx.check(`${name}: GPU-queue elapsed median <= 33ms`, median <= 33, { median });
      }
      ctx.check(`${name}: frame measurements`, true, row);
    }
    ctx.check("no renderer warnings", warnings.length === 0, warnings);
  } finally {
    await page.close();
  }
}
