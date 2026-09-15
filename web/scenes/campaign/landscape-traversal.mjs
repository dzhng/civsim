import { mkdir, writeFile } from "node:fs/promises";

export const meta = {
  name: "landscape-traversal",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: [
    "landscape-traversal-overview",
    "landscape-traversal-alps",
    "landscape-traversal-italy",
    "landscape-traversal-distant",
    "landscape-traversal-return",
  ],
  describe:
    "Real geography camera residency, memory plateau, idle stability and adapter-labelled traversal timing.",
};
export async function run(ctx) {
  const hardware = process.env.VERIFY_GPU_ADAPTER === "hardware";
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "landscape-traversal",
  });
  const warnings = [];
  page.on("console", (m) => {
    if (m.type() === "warning" && /GPU|shader|bind|validation/i.test(m.text()))
      warnings.push(m.text());
  });
  await page.goto(`${ctx.target}/renderer/landscape-traversal?ref=1`);
  await page.waitForFunction(() => window.__landscapeTraversal, undefined, { timeout: 120000 });
  const environment = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter();
    return {
      browser: navigator.userAgent,
      adapter: {
        vendor: adapter.info.vendor,
        architecture: adapter.info.architecture,
        device: adapter.info.device,
        description: adapter.info.description,
      },
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
    };
  });
  const records = [];
  const stops = [
    ["overview", -100, 250, 0.16],
    ["alps", -450, 1080, 1.8],
    ["italy", -456, 446, 1.8],
    ["distant", 1131, -686, 1.8],
    ["return", -450, 1080, 1.8],
  ];
  const move = async ([name, x, y, zoom]) => {
    await page.evaluate((v) => window.__landscapeTraversal.cam(...v), [x, y, zoom]);
    await page.waitForFunction(
      () => {
        const s = window.__landscapeTraversal.stats();
        return (s.ready && !s.pendingKey) || s.failed.length;
      },
      undefined,
      { timeout: 120000 },
    );
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => window.__landscapeTraversal.stats());
    ctx.check(
      `${name}: bounded real geography admission`,
      state.ready &&
        !state.failed.length &&
        state.residentTiles <= 24 &&
        state.peakTotalTerrainBytes <= 128 * 1024 ** 2,
      JSON.stringify({
        ...state,
        renderer: undefined,
        frameTimes: undefined,
        admissionFrames: undefined,
      }),
    );
    return state;
  };
  // Reverse while a worker result is pending: stale work must not restart a
  // needed tile or block forward progress after returning to the old view.
  await page.evaluate(() => window.__landscapeTraversal.cam(-450, 1080, 1.8));
  await page.waitForFunction(() => window.__landscapeTraversal.stats().pendingKey);
  await page.evaluate(() => window.__landscapeTraversal.cam(1131, -686, 1.8));
  await page.evaluate(() => window.__landscapeTraversal.cam(-100, 250, 0.16));
  await page.waitForFunction(() => !window.__landscapeTraversal.stats().pendingKey);
  for (const stop of stops) {
    records.push(await move(stop));
    if (!hardware)
      await ctx.snap(page, `landscape-traversal-${stop[0]}`, { threshold: 0, maxDiffRatio: 0 });
  }
  for (let loop = 0; loop < 2; loop++)
    for (const stop of stops.slice(2)) records.push(await move(stop));
  const last = records.at(-1);
  await page.waitForTimeout(800);
  const idle = await page.evaluate(() => window.__landscapeTraversal.stats());
  ctx.check(
    "stationary terrain does not rebuild or upload",
    idle.builds === last.builds &&
      idle.revision === last.revision &&
      idle.allocationBytes === last.allocationBytes,
    JSON.stringify({ builds: idle.builds, revision: idle.revision, bytes: idle.allocationBytes }),
  );
  const returns = records.filter((s) => s.camera.x === -450 && s.camera.y === 1080);
  ctx.check(
    "repeat traversals plateau",
    returns.every(
      (s) =>
        s.residentTiles === returns[0].residentTiles &&
        s.residentTiles > 0 &&
        s.allocationBytes === returns[0].allocationBytes,
    ),
    JSON.stringify(returns.map((s) => ({ tiles: s.residentTiles, bytes: s.allocationBytes }))),
  );
  await page.evaluate(() => window.__landscapeTraversal.resetTiming());
  await page.evaluate(async () => {
    for (let i = 0; i < 180; i++) {
      const t = i / 179;
      window.__landscapeTraversal.cam(
        -450 + 256 * t,
        1080 - 128 * t,
        1.8 + Math.sin(t * Math.PI) * 0.5,
      );
      await new Promise(requestAnimationFrame);
    }
  });
  const timing = await page.evaluate(() => window.__landscapeTraversal.stats());
  const sorted = timing.frameTimes.toSorted((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const admissionMax = Math.max(0, ...timing.admissionFrames);
  if (hardware) {
    ctx.check("hardware pan/zoom p95 <=33ms", p95 <= 33, `${p95}ms`);
    ctx.check(
      "warm admission frames <=100ms",
      admissionMax <= 100,
      `${admissionMax}ms (${timing.admissionFrames.length} admissions)`,
    );
  }
  const report = {
    environment,
    hardware,
    scope: "terrain composition owner; full gameplay UI acceptance remains production-cutover work",
    records: records.map(({ frameTimes, admissionFrames, renderer, ...s }) => s),
    timing: {
      samples: sorted.length,
      p95,
      admissionMax,
      admissionSamples: timing.admissionFrames.length,
    },
  };
  await mkdir("reports/rendering", { recursive: true });
  await writeFile(
    `reports/rendering/landscape-traversal-${hardware ? "hardware" : "swiftshader"}.json`,
    JSON.stringify(report, null, 2),
  );
  ctx.check("clean GPU validation", warnings.length === 0, warnings.join("\n"));
  await page.close();
  const retina = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    errorPrefix: "landscape-traversal-dpr2",
  });
  await retina.goto(`${ctx.target}/renderer/landscape-traversal?ref=1`);
  await retina.waitForFunction(() => window.__landscapeTraversal, undefined, { timeout: 120000 });
  await retina.evaluate(() => window.__landscapeTraversal.cam(-450, 1080, 1.8));
  await retina.waitForFunction(() => window.__landscapeTraversal.stats().ready, undefined, {
    timeout: 120000,
  });
  const dpr2 = await retina.evaluate(() => ({
    dpr: devicePixelRatio,
    state: window.__landscapeTraversal.stats(),
    canvas: [document.querySelector("canvas").width, document.querySelector("canvas").height],
  }));
  ctx.check(
    "DPR2 retains world requests and bounds",
    dpr2.dpr === 2 &&
      dpr2.state.residentTiles === returns[0].residentTiles &&
      dpr2.state.peakTotalTerrainBytes <= 128 * 1024 ** 2,
    JSON.stringify({ dpr: dpr2.dpr, canvas: dpr2.canvas, bytes: dpr2.state.peakTotalTerrainBytes }),
  );
  await retina.close();
}
