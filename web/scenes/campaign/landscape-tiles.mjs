export const meta = {
  name: "landscape-tiles",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: [
    "landscape-tiles-coarse",
    "landscape-tiles-single",
    "landscape-tiles-concave",
    "landscape-tiles-evicted",
    "landscape-tiles-return",
  ],
  describe:
    "Exclusive coarse/detail terrain coverage across admission, concave joins, eviction and return.",
};
export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "landscape-tiles",
  });
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning" && /GPU|shader|bind|validation/i.test(message.text()))
      warnings.push(message.text());
  });
  await page.goto(`${ctx.target}/renderer/landscape-tiles?ref=1`);
  await page.waitForFunction(() => window.__rendererLabReady === true);
  const records = [];
  for (const [stage, name] of ["coarse", "single", "concave", "evicted", "return"].entries()) {
    await page.evaluate((n) => window.__landscapeTiles.stage(n), stage);
    await page.waitForFunction(
      () => window.__landscapeTiles.stats().ready && !window.__landscapeTiles.stats().pendingKey,
    );
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => window.__landscapeTiles.stats());
    records.push(state);
    ctx.check(
      `${name}: bounded residency without failed builds`,
      state.residentTiles <= 3 && state.failed.length === 0,
      JSON.stringify(state),
    );
    await ctx.snap(null, `landscape-tiles-${name}`, {
      threshold: 0,
      maxDiffRatio: 0,
      shot: await page.screenshot(),
    });
  }
  ctx.check(
    "eviction and return rebuild only the missing tile",
    JSON.stringify(records.map((r) => r.builds)) === JSON.stringify([0, 1, 3, 4, 5]),
    JSON.stringify(records.map((r) => r.builds)),
  );
  const last = records.at(-1);
  await page.waitForTimeout(500);
  const idle = await page.evaluate(() => window.__landscapeTiles.stats());
  ctx.check(
    "idle frames retain geometry without rebuilding or reswapping",
    idle.builds === last.builds &&
      idle.revision === last.revision &&
      idle.geometryBytes === last.geometryBytes,
    JSON.stringify(idle),
  );
  ctx.check("GPU validation is clean", warnings.length === 0, warnings.join("\n"));
  await page.close();
}
