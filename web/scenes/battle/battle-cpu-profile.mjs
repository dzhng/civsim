// Main-thread CPU profile of a live battle frame (sim ticking + renderer),
// aggregated by function self-time. A measuring tool, not a gate: prints the
// top self-time functions so a perf spike can see where scripting time goes.
// PROFILE_SOLDIERS=30500 grows the army through the production spawn path.
export const meta = {
  name: "battle-cpu-profile",
  kind: "flow",
  world: "battle-real",
  tier: "full",
  snapshots: [],
  describe: "CPU self-time profile of the live battle main thread (tool, prints a table).",
};

const TARGET = Number(process.env.PROFILE_SOLDIERS ?? 0);
const PROFILE_MS = Number(process.env.PROFILE_MS ?? 4000);

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: "cpu" });
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
  if (TARGET > 0) {
    await page.evaluate((target) => {
      const g = window.__game;
      const need = Math.max(0, Math.ceil((target - g.stats().soldiers) / 500));
      for (let i = 0; i < need; i++) {
        const row = Math.floor(i / 10),
          col = i % 10;
        g.spawnClass(-540 + col * 120, -400 + row * 90, Math.PI / 2, 500, 28, 0, row % 2);
      }
    }, TARGET);
    await page.waitForFunction((t) => window.__game.stats().renderStats.soldiers >= t, TARGET, {
      timeout: 120000,
    });
  }
  await page.evaluate(async () => {
    const cam = window.__cam;
    cam.yaw = 0;
    cam.pitchBias = 0;
    cam.zoom = 3.0;
    cam.clampView?.();
    await new Promise((r) => setTimeout(r, 80));
    cam.setViewCenter(0, -310);
    cam.clampView?.();
  });
  await page.waitForTimeout(1500);

  for (const paused of [false, true]) {
    if (paused) {
      await page.keyboard.press("p");
      await page.waitForTimeout(600);
    }
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
    const frame = await page.evaluate(async (ms) => {
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      const t = [];
      let last = performance.now();
      const end = last + ms;
      while (performance.now() < end) {
        await raf();
        const n = performance.now();
        t.push(n - last);
        last = n;
      }
      t.sort((a, b) => a - b);
      const m = window.__game.stats();
      return {
        frames: t.length,
        medianMs: t[t.length >> 1],
        p95Ms: t[Math.floor(t.length * 0.95)],
        tickMs: m.tickMs,
        soldiers: window.__game.stats().soldiers,
      };
    }, PROFILE_MS);
    const { profile } = await cdp.send("Profiler.stop");
    await cdp.detach();
    const self = new Map();
    const byFile = new Map();
    const nodeById = new Map();
    for (const n of profile.nodes) nodeById.set(n.id, n);
    let total = 0;
    for (let i = 0; i < profile.samples.length; i++) {
      const n = nodeById.get(profile.samples[i]);
      const dt = (profile.timeDeltas[i] ?? 0) / 1000;
      total += dt;
      const cf = n.callFrame;
      const url = cf.url.replace(/^.*\/(packages|web|node_modules)\//, "$1/").split("?")[0];
      const key = `${cf.functionName || "(anon)"} ${url}:${cf.lineNumber + 1}`;
      self.set(key, (self.get(key) ?? 0) + dt);
      byFile.set(url || cf.functionName, (byFile.get(url || cf.functionName) ?? 0) + dt);
    }
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28);
    const files = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    const perFrame = (ms) => (ms / frame.frames).toFixed(2);
    console.log(
      `\n=== ${paused ? "SIM PAUSED" : "SIM LIVE"} soldiers=${frame.soldiers} frames=${frame.frames} rAF median=${frame.medianMs.toFixed(1)}ms p95=${frame.p95Ms.toFixed(1)}ms tickMs=${frame.tickMs.toFixed(2)} sampled=${total.toFixed(0)}ms`,
    );
    console.log("-- self ms/frame by function");
    for (const [k, v] of top) console.log(`${perFrame(v).padStart(7)}  ${k}`);
    console.log("-- self ms/frame by file");
    for (const [k, v] of files) console.log(`${perFrame(v).padStart(7)}  ${k}`);
    ctx.check(
      `profile captured (${paused ? "paused" : "live"})`,
      frame.frames > 10,
      JSON.stringify(frame),
    );
  }
}
