export const meta = {
  name: "campaign-crowd-grounding",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: ["campaign-crowd-empty", "campaign-crowd-coarse", "campaign-crowd-raised"],
  describe: "Actual campaign frame figures share physical crowd scale, surface and lifecycle.",
};
export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "campaign-crowd",
  });
  const warnings = [];
  page.on("console", (m) => {
    if (m.type() === "warning" && /GPU|shader|validation/i.test(m.text())) warnings.push(m.text());
  });
  await page.goto(`${ctx.target}/renderer/campaign-composition?ref=1&crowd=1`);
  await page.waitForFunction(() => window.__rendererLabReady, undefined, { timeout: 180000 });
  await page.waitForTimeout(1000);
  const state = () => page.evaluate(() => window.__rendererLabStats.stats);
  const initial = await state();
  ctx.check(
    "real stack frame renders twelve scaled figures",
    initial.crowd.instances === 12 &&
      initial.crowd.visible === 12 &&
      initial.crowd.modelScale === 2.4,
  );
  await ctx.snap(null, "campaign-crowd-coarse", {
    threshold: 0,
    maxDiffRatio: 0,
    shot: await page.screenshot(),
  });
  await page.evaluate(() => window.__campaignComposition.crowd(5, true));
  await page.waitForTimeout(250);
  ctx.check("removal clears all crowd draw submissions", (await state()).crowd.drawCalls === 0);
  await ctx.snap(null, "campaign-crowd-empty", {
    threshold: 0,
    maxDiffRatio: 0,
    shot: await page.screenshot(),
  });
  await page.evaluate(() => window.__campaignComposition.crowd());
  await page.evaluate(() => window.__campaignComposition.installDetail(true));
  await page.waitForTimeout(250);
  const raised = await state();
  ctx.check(
    "tile replacement reseats eastern figures",
    raised.crowd.instances === 12 &&
      raised.crowdSeating.every((p, i) =>
        p.x < 0
          ? p.elevation === initial.crowdSeating[i].elevation
          : p.elevation > initial.crowdSeating[i].elevation + 6,
      ),
  );
  await ctx.snap(null, "campaign-crowd-raised", {
    threshold: 0,
    maxDiffRatio: 0,
    shot: await page.screenshot(),
  });
  await page.evaluate(() => window.__campaignComposition.installDetail(false));
  ctx.check(
    "eviction restores coarse seating",
    (await state()).crowdSeating.every(
      (p, i) => Math.abs(p.elevation - initial.crowdSeating[i].elevation) < 1e-5,
    ),
  );
  await page.locator("#composition-fog").click();
  ctx.check("fog hides eastern stack", (await state()).crowd.instances === 6);
  await page.evaluate(() => window.__campaignComposition.visibility(true));
  ctx.check(
    "new visibility query replaces membership",
    (await state()).crowdSeating.every((p) => p.x > 0),
  );
  await page.locator("#composition-fog").click();
  await page.evaluate(() => window.__campaignComposition.crowd(1));
  ctx.check("campaign overview removes representatives", (await state()).crowd.instances === 0);
  await page.evaluate(() => window.__campaignComposition.crowd());
  await page.locator("#composition-reset").click();
  await page.waitForFunction(() => window.__rendererLabStats.stats.generation === 1, undefined, {
    timeout: 180000,
  });
  ctx.check(
    "recreation restores crowd and one canvas",
    (await state()).crowd.instances === 12 && (await page.locator("canvas").count()) === 1,
  );
  ctx.check("no GPU warnings", warnings.length === 0, warnings.join("\n"));
  await page.close();
}
