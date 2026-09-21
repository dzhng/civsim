import { mkdir, writeFile } from "node:fs/promises";
import { battleRendererReady } from "../worlds.mjs";
import { summarizeFrameIntervals } from "../../src/battle/benchmark/benchmarkMetrics.ts";

export const meta = {
  name: "battle-camera-performance",
  kind: "flow",
  world: "battle-real",
  tier: "full",
  snapshots: [],
  describe:
    "Raw production frame and camera traces, keeping first-traversal grass/LOD work in the sample.",
};
const phaseMs = Number(process.env.CAMERA_PERF_PHASE_MS ?? 60000);
const dpr = Number(process.env.CAMERA_PERF_DPR ?? 2);
const mode = process.env.CAMERA_PERF_MODE ?? "paused";
const phases = ["hold", "pan", "zoom", "horizon", "combined"];

export async function run(ctx) {
  if (!Number.isFinite(phaseMs) || phaseMs < 1000 || !Number.isFinite(dpr) || dpr <= 0)
    throw new Error("Invalid camera trace duration or device scale");
  if (!["paused", "live"].includes(mode))
    throw new Error("CAMERA_PERF_MODE must be paused or live");
  const page = await ctx.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: dpr,
  });
  await page.goto(`${ctx.target}/?map=gen&seed=7&ai=off`);
  await battleRendererReady(page, 120000);
  // This attribution case uses a known idle army. Engaged live acceptance is the menu benchmark.
  if (mode === "paused") await page.keyboard.press("p");
  await page.mouse.move(720, 360);
  const beforeWheel = await page.evaluate(() => window.__cam.params().distance);
  await page.mouse.wheel(0, -120);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const afterWheel = await page.evaluate(() => window.__cam.params().distance);
  ctx.check("real wheel input changes camera distance", afterWheel < beforeWheel);
  await page.evaluate(() => {
    const c = window.__cam;
    c.zoomAt(1440, 720, c.params().distance / 150);
    c.yaw = -Math.PI / 2;
    c.pitchBias = 0;
    c.setViewCenter(0, -620);
    c.clampView();
  });
  const identity = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    viewport: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
    framebuffer: [
      document.getElementById("battlefield").width,
      document.getElementById("battlefield").height,
    ],
    initialState: window.__game.stateHash(),
    tick: window.__game.tickCount(),
    stats: window.__game.stats(),
  }));
  const runs = [];
  for (const phase of phases) {
    const trace = await page.evaluate(
      async ({ phase, durationMs }) => {
        const samples = [],
          work = [];
        const c = window.__cam;
        let lastId = -1,
          nextWork = 0;
        const start = performance.now();
        while (true) {
          await new Promise((r) => requestAnimationFrame(r));
          const now = performance.now(),
            elapsedMs = now - start;
          const frame = window.__game.frameMetrics();
          if (frame && frame.frameId !== lastId) {
            lastId = frame.frameId;
            samples.push({
              elapsedMs,
              ...frame,
              camera: c.capturePose(),
              distance: c.params().distance,
            });
          }
          if (elapsedMs >= nextWork) {
            const stats = window.__game.stats();
            work.push({ elapsedMs, stats });
            nextWork = elapsedMs + 250;
          }
          if (elapsedMs >= durationMs) break;
          const t = elapsedMs / 1000;
          const pan = phase === "pan" || phase === "combined";
          const zoom = phase === "zoom" || phase === "combined";
          const horizon = phase === "horizon" || phase === "combined";
          c.setViewCenter(pan ? 150 * Math.sin((t * Math.PI) / 10) : 0, -620);
          const distance = zoom
            ? Math.exp(
                Math.log(30) +
                  (Math.log(1800) - Math.log(30)) * (0.5 - 0.5 * Math.cos((t * Math.PI) / 10)),
              )
            : 150;
          c.zoomAt(1440, 720, c.params().distance / distance);
          c.yaw = -Math.PI / 2 + (horizon ? 0.65 * Math.sin((t * Math.PI) / 12) : 0);
          c.pitchBias = horizon ? 0.45 * (0.5 - 0.5 * Math.cos((t * Math.PI) / 12)) : 0;
          c.clampView();
        }
        return {
          samples,
          work,
          stateHash: window.__game.stateHash(),
          endTick: window.__game.tickCount(),
        };
      },
      { phase, durationMs: phaseMs },
    );
    const intervals = trace.samples.slice(1).map((s) => s.intervalMs);
    const summary = summarizeFrameIntervals(intervals);
    const rendered =
      trace.samples.at(-1).renderer.renderedFrameId - trace.samples[0].renderer.renderedFrameId;
    ctx.check(`${phase}: measures real submissions`, rendered > 0, `${rendered} submissions`);
    ctx.check(
      `${phase}: no duplicate or invalid loop samples`,
      summary.invalidCount === 0 &&
        trace.samples.every((s, i) => i === 0 || s.frameId > trace.samples[i - 1].frameId),
    );
    if (mode === "paused") ctx.check(`${phase}: sim stays paused`, trace.endTick === identity.tick);
    runs.push({ phase, summary, ...trace });
    console.log(JSON.stringify({ phase, summary }));
  }
  // A frozen cache skip is intentionally distinguishable from a fast rendered frame.
  await page.evaluate(async () => {
    window.__game.freeze(true);
    await window.__game.freezeAtTick(window.__game.tickCount());
  });
  const frozenStart = await page.evaluate(() => window.__game.frameMetrics());
  await page.evaluate(
    () =>
      new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))),
      ),
  );
  const frozenEnd = await page.evaluate(() => window.__game.frameMetrics());
  ctx.check(
    "frozen loop iterations do not count as new submissions",
    frozenEnd.frameId > frozenStart.frameId &&
      frozenEnd.renderer.renderedFrameId === frozenStart.renderer.renderedFrameId,
  );
  const report = {
    kind: "battle-camera-attribution",
    version: 1,
    recordedAt: new Date().toISOString(),
    mode,
    phaseMs,
    shortenedDiagnostic: phaseMs !== 60000,
    identity,
    timingCoverage: {
      cpu: "completed production loop",
      gpu: "low-frequency latest render-pass-only; not correlated with frame",
      cadence: "rAF scheduling, not physical presentation",
    },
    runs,
  };
  const output = new URL(
    process.env.CAMERA_PERF_OUTPUT ??
      "../../reports/rendering/scenario-runs/battle-camera-performance.json",
    import.meta.url,
  );
  await mkdir(new URL(".", output), { recursive: true });
  await writeFile(output, JSON.stringify(report));
  console.log(`cameraPerformanceReport=${output.pathname}`);
}
