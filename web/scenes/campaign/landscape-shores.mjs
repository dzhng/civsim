const cases = [
  ["before", "before=1"],
  ["coarse", ""],
  ["detail", "detail=1"],
  ["real", "real=1"],
];
export const meta = {
  name: "landscape-shores",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: cases.map(([name]) => `landscape-shores-${name}`),
  describe:
    "Source-conforming channel, island and real coast share rendered geometry and ray queries.",
};
export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "landscape-shores",
  });
  for (const [name, query] of cases) {
    await page.goto(`${ctx.target}/renderer/landscape-shores?ref=1&${query}`);
    await page.waitForFunction(() => window.__rendererLabReady === true, undefined, {
      timeout: 90000,
    });
    await page.waitForTimeout(800);
    const report = await page.evaluate(() => window.__rendererLabStats);
    ctx.check(
      `${name} has a queryable surface within the feature budget`,
      report.stats.centerRay !== null && report.stats.allocationBytes < 128 * 1024 * 1024,
      JSON.stringify(report),
    );
    await ctx.snap(null, `landscape-shores-${name}`, {
      threshold: 0,
      maxDiffRatio: 0,
      shot: await page.screenshot({ timeout: 180000 }),
    });
  }
  await page.close();
}
