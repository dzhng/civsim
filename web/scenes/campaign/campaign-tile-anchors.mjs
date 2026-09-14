export const meta = {
  name: "campaign-tile-anchors",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: [
    "campaign-tile-anchors-coarse",
    "campaign-tile-anchors-detail",
    "campaign-tile-anchors-evicted",
  ],
  describe: "Campaign models, labels, roads and selection follow the tile surface swap.",
};
export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "campaign-tile-anchors",
  });
  await page.goto(`${ctx.target}/renderer/campaign-tile-anchors?ref=1`);
  await page.waitForFunction(() => window.__rendererLabReady === true);
  await page.mouse.click(797, 450);
  const initial = await page.evaluate(() => window.__rendererLabStats.stats);
  const army = (state) => state.anchors.find((a) => a.id === "army");
  ctx.check("fixed-pixel army selection works before admission", initial.selected === "army");
  await ctx.snap(null, "campaign-tile-anchors-coarse", {
    threshold: 0,
    maxDiffRatio: 0,
    shot: await page.screenshot(),
  });
  await page.getByRole("button", { name: "Load raised detail" }).click();
  await page.waitForTimeout(250);
  const detail = await page.evaluate(() => window.__rendererLabStats.stats);
  ctx.check(
    "tile raises the rendered army by its independently specified eight units",
    Math.abs(army(detail).groundZ - army(initial).groundZ - 8) < 0.001,
    JSON.stringify({ before: army(initial), after: army(detail) }),
  );
  ctx.check(
    "selection and label track the raised model",
    detail.selected === "army" && army(detail).visible && army(detail).y < army(initial).y - 10,
  );
  await page.mouse.click(420, 505);
  await page.mouse.click(799, 420);
  ctx.check(
    "fixed-pixel picking follows raised detail",
    await page.evaluate(() => window.__rendererLabStats.stats.selected === "army"),
  );
  await ctx.snap(null, "campaign-tile-anchors-detail", {
    threshold: 0,
    maxDiffRatio: 0,
    shot: await page.screenshot(),
  });
  await page.getByRole("button", { name: "Evict raised detail" }).click();
  await page.waitForTimeout(250);
  const evicted = await page.evaluate(() => window.__rendererLabStats.stats);
  ctx.check(
    "eviction restores the army and label to coarse ground",
    Math.abs(army(evicted).groundZ - army(initial).groundZ) < 0.00001 &&
      Math.abs(army(evicted).y - army(initial).y) < 0.00001,
  );
  await page.mouse.click(420, 505);
  await page.mouse.click(797, 450);
  ctx.check(
    "fixed-pixel picking follows restored surface",
    await page.evaluate(() => window.__rendererLabStats.stats.selected === "army"),
  );
  await ctx.snap(null, "campaign-tile-anchors-evicted", {
    threshold: 0,
    maxDiffRatio: 0,
    shot: await page.screenshot(),
  });
  await page.close();
  const hidpi = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    errorPrefix: "campaign-tile-anchors-dpr2",
  });
  await hidpi.goto(`${ctx.target}/renderer/campaign-tile-anchors?ref=1`);
  await hidpi.waitForFunction(() => window.__rendererLabReady === true);
  await hidpi.getByRole("button", { name: "Load raised detail" }).click();
  await hidpi.waitForTimeout(250);
  await hidpi.mouse.click(799, 420);
  ctx.check(
    "DPR2 picks the raised model at its visible CSS pixel",
    await hidpi.evaluate(() => window.__rendererLabStats.stats.selected === "army"),
  );
  await hidpi.getByRole("button", { name: "Evict raised detail" }).click();
  await hidpi.waitForTimeout(250);
  await hidpi.mouse.click(420, 505);
  await hidpi.mouse.click(797, 450);
  ctx.check(
    "DPR2 picks the restored model after eviction",
    await hidpi.evaluate(() => window.__rendererLabStats.stats.selected === "army"),
  );
  await hidpi.close();
}
