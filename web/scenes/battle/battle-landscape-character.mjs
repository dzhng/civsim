const CASES = [
  { map: "A", x: 380, y: -180, cover: "green-grass" },
  { map: "C", x: 540, y: 260, cover: "yellow-grass" },
];
export const meta = {
  name: "battle-landscape-character",
  kind: "visual",
  world: "production-photoreal-authored-battle",
  tier: "full",
  snapshots: CASES.map(({ map }) => `landscape-character/authored-${map}`),
  describe:
    "Authored rock and grass patches retain semantic cover under the shared physical terrain response.",
};
export async function run(ctx) {
  for (const { map, x, y, cover } of CASES) {
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
        only: "photoreal-sky,battle-backdrop,battle-terrain,battle-ground,battle-horizon,landscape-scenery",
        cx: String(x),
        cy: String(y),
        camYaw: String(-Math.PI / 2),
      });
      await page.goto(`${ctx.target}/renderer/photoreal-battle?${params}`);
      await page.waitForFunction(
        () => window.__rendererLabReady === true && window.__rendererLabStats?.ok === true,
        undefined,
        { timeout: 180000 },
      );
      await page.evaluate(() => window.__photorealBattleWorld.settlePresentedFrame());
      const terrain = await page.evaluate(
        () => window.__rendererLabStats.stats.renderStats.terrain,
      );
      ctx.check(
        `${map}: authored cover remains and no gameplay slope descriptor is fabricated`,
        terrain.groundCover === cover && terrain.slopeBands === null,
        JSON.stringify({ cover: terrain.groundCover, slopes: terrain.slopeBands }),
      );
      ctx.check(`${map}: clean GPU validation`, warnings.length === 0, warnings.join("\n"));
      await ctx.snap(page, `landscape-character/authored-${map}`, {
        threshold: 0,
        maxDiffRatio: 0,
      });
    } finally {
      await page.close();
    }
  }
}
