export const meta = {
  name: "campaign-city-grounding",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: [
    "campaign-city-fixture",
    "campaign-city-perge-attalea",
    "campaign-city-cyrene-apollonia",
    "campaign-city-scodra",
  ],
  describe: "Live campaign city inputs and actual model feet on the presented surface.",
};
export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "campaign-city",
  });
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning" && /GPU|shader|validation/i.test(message.text()))
      warnings.push(message.text());
  });
  await page.goto(`${ctx.target}/renderer/campaign-composition?ref=1&cities=1`);
  await page.waitForFunction(() => window.__rendererLabReady, undefined, { timeout: 90000 });
  await page.waitForTimeout(1000);
  ctx.check(
    "tiny live fixture",
    await page.evaluate(() => window.__rendererLabStats.stats.cities.instances === 2),
  );
  await ctx.snap(null, "campaign-city-fixture", {
    threshold: 0,
    maxDiffRatio: 0,
    shot: await page.screenshot(),
  });
  // Independent body pixels from the fixed fixture, not projected debug anchors.
  await page.mouse.click(742, 461);
  await page.waitForFunction(() => window.__rendererLabStats.stats.selected === "1");
  ctx.check(
    "visible city body can be picked",
    await page.evaluate(() => window.__rendererLabStats.stats.selected === "1"),
  );
  await page.locator("#composition-fog").click();
  ctx.check(
    "fog hides the valley city",
    await page.evaluate(() => window.__rendererLabStats.stats.objects === 1),
  );
  ctx.check(
    "fog clears hidden city selection",
    await page.evaluate(() => window.__rendererLabStats.stats.selected === null),
  );
  for (const [key, names] of [
    ["perge-attalea", "Perge,Attalea"],
    ["cyrene-apollonia", "Cyrene,Apollonia-Sozousa"],
    ["scodra", "Scodra"],
  ]) {
    await page.goto(
      `${ctx.target}/renderer/landscape-traversal?ref=1&cities=${encodeURIComponent(names)}`,
    );
    await page.waitForFunction(() => window.__landscapeTraversal?.stats().ready, undefined, {
      timeout: 180000,
    });
    await page.waitForTimeout(1000);
    const stats = await page.evaluate(() => window.__landscapeTraversal.stats());
    ctx.check(
      `${key}: live frame city count`,
      stats.renderer.cities.instances === names.split(",").length,
      JSON.stringify(stats.anchors),
    );
    await ctx.snap(null, `campaign-city-${key}`, {
      threshold: 0,
      maxDiffRatio: 0,
      shot: await page.screenshot(),
    });
    await page.evaluate(() => window.__landscapeTraversal.cities(-1, true));
    ctx.check(
      `${key}: removal clears meshes`,
      (await page.evaluate(() => window.__landscapeTraversal.stats())).renderer.cities.instances ===
        0,
    );
    const id = Number(stats.anchors[0].id);
    await page.evaluate((id) => window.__landscapeTraversal.cities(id, false), id);
    ctx.check(
      `${key}: selection survives reinsertion`,
      (await page.evaluate(() => window.__landscapeTraversal.stats())).renderer.selected ===
        String(id),
    );
  }
  ctx.check("city materials produce no GPU warnings", warnings.length === 0, warnings.join("\n"));
  await page.close();
}
