const CASES = [
  { name: "authored-A", map: "A", x: 380, y: -180, cover: "green-grass" },
  { name: "authored-C", map: "C", x: 540, y: 260, cover: "yellow-grass" },
  { name: "generated-forest-edge", map: "gen", seed: 8, x: 344, y: 8, cover: "green-grass" },
];
export const meta = {
  name: "battle-landscape-character",
  kind: "visual",
  world: "production-typegpu-battle-terrain",
  tier: "full",
  snapshots: CASES.map(({ name }) => `landscape-character/${name}`),
  describe:
    "Authored rock/grass and a generated forest edge retain categorical cover in the production TypeGPU terrain. Authored views retain scenery; the generated boundary isolates ground and horizon.",
};
export async function run(ctx) {
  for (const { name, map, seed, x, y, cover } of CASES) {
    const page = await ctx.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    const warnings = [];
    page.on("console", (m) => {
      if (m.type() === "warning" && /GPU|shader|bind|validation/i.test(m.text()))
        warnings.push(m.text());
    });
    try {
      const params = new URLSearchParams({
        map,
        ref: "1",
        env: "golden-hour",
        t: "0",
        ticks: "60",
        zoom: "7.8",
        only: "battle-ground,battle-horizon" + (map === "gen" ? "" : ",battle-scenery"),
        cx: String(x),
        cy: String(y),
        camYaw: String(-Math.PI / 2),
      });
      if (seed !== undefined) params.set("seed", String(seed));
      await page.goto(`${ctx.target}/renderer/photoreal-battle?${params}`);
      await page.waitForFunction(
        () => window.__rendererLabReady === true && window.__rendererLabStats?.ok === true,
        undefined,
        { timeout: 180000 },
      );
      // The route publishes readiness after its awaited production frame completes.
      const { stats, camera } = await page.evaluate(() => ({
        stats: window.__rendererLabStats.renderStats,
        camera: {
          zoom: window.__cam.zoom,
          yaw: window.__cam.yaw,
          center: window.__cam.viewCenter(),
        },
      }));
      ctx.check(
        `${name}: production TypeGPU renderer`,
        stats.substrate === "typegpu",
        stats.substrate,
      );
      ctx.check(
        `${name}: requested camera is not clamped`,
        camera.zoom === 7.8 &&
          camera.yaw === -Math.PI / 2 &&
          Math.abs(camera.center[0] - x) < 1e-6 &&
          Math.abs(camera.center[1] - y) < 1e-6,
        JSON.stringify(camera),
      );
      const terrain = stats.terrain;
      ctx.check(
        `${name}: terrain is installed with its original cover and slope policy`,
        terrain.installed &&
          terrain.groundTriangles > 0 &&
          terrain.groundCover === cover &&
          (map === "gen" ? terrain.slopeBands !== null : terrain.slopeBands === null),
        JSON.stringify({ cover: terrain.groundCover, slopes: terrain.slopeBands }),
      );
      ctx.check(
        `${name}: intended terrain and scenery layers are visible`,
        stats.reviewVisibility.ground &&
          stats.reviewVisibility.vista &&
          stats.reviewVisibility.scenery === (map !== "gen") &&
          !stats.reviewVisibility.water &&
          !stats.reviewVisibility.crowd,
        JSON.stringify(stats.reviewVisibility),
      );
      ctx.check(`${name}: clean GPU validation`, warnings.length === 0, warnings.join("\n"));
      await ctx.snap(page, `landscape-character/${name}`, {
        threshold: 0,
        maxDiffRatio: 0,
      });
    } finally {
      await page.close();
    }
  }
}
