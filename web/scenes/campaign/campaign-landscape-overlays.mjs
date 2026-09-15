import { PNG } from "pngjs";
export const meta = {
  name: "campaign-landscape-overlays",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: [
    "campaign-ownership",
    "campaign-ownership-changed",
    "campaign-visibility-west",
    "campaign-visibility-east",
  ],
  describe: "Live political ownership and moving visibility share the presented campaign surface.",
};
export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${ctx.target}/renderer/campaign-composition?ref=1&geography=1`);
  await page.waitForFunction(() => window.__rendererLabReady === true, undefined, {
    timeout: 90000,
  });
  const capture = async (name) => {
    await page.waitForTimeout(300);
    const shot = await page.screenshot();
    await ctx.snap(null, name, { threshold: 0, maxDiffRatio: 0, shot });
    return PNG.sync.read(shot);
  };
  await page.evaluate(() => window.__campaignComposition.ownership(false));
  await page.waitForTimeout(300);
  const natural = PNG.sync.read(await page.screenshot());
  await page.evaluate(() => window.__campaignComposition.ownership(true));
  const original = await capture("campaign-ownership");
  await page.evaluate(() => window.__campaignComposition.ownership(true, true));
  const changed = await capture("campaign-ownership-changed");
  let changedPixels = 0;
  for (let k = 0; k < original.data.length; k += 4)
    if (
      original.data[k] !== changed.data[k] ||
      original.data[k + 1] !== changed.data[k + 1] ||
      original.data[k + 2] !== changed.data[k + 2]
    )
      changedPixels++;
  ctx.check(
    "ownership update reaches visible terrain",
    changedPixels > 1000,
    `${changedPixels} pixels changed`,
  );
  await page.evaluate(() => window.__campaignComposition.ownership(false, true));
  await page.waitForTimeout(300);
  const restored = PNG.sync.read(await page.screenshot());
  ctx.check(
    "political toggle restores unchanged natural terrain",
    natural.data.equals(restored.data),
  );
  await page.evaluate(() => window.__campaignComposition.ownership(true, true));
  await page.evaluate(() => window.__campaignComposition.visibility(false));
  const westImage = await capture("campaign-visibility-west");
  const west = await page.evaluate(() => window.__rendererLabStats.stats);
  ctx.check(
    "west visibility shows city and west woodland",
    west.objects === 1 && west.scenery.scenery === 1,
    JSON.stringify(west),
  );
  await page.evaluate(() => window.__campaignComposition.visibility(true));
  const eastImage = await capture("campaign-visibility-east");
  let revealedPixels = 0;
  for (let k = 0; k < westImage.data.length; k += 4)
    if (
      Math.abs(westImage.data[k] - eastImage.data[k]) +
        Math.abs(westImage.data[k + 1] - eastImage.data[k + 1]) +
        Math.abs(westImage.data[k + 2] - eastImage.data[k + 2]) >
      30
    )
      revealedPixels++;
  ctx.check(
    "moving visibility changes the ground, not only entity membership",
    revealedPixels > 20000,
    `${revealedPixels} pixels change by more than 30 RGB levels`,
  );
  const east = await page.evaluate(() => window.__rendererLabStats.stats);
  ctx.check(
    "moving visibility replaces visible entities without toggling fog",
    east.anchors.find((a) => a.id === "army").visible &&
      !east.anchors.find((a) => a.id === "city").visible &&
      east.scenery.scenery === 1 &&
      east.visibilityRevision === 2,
    JSON.stringify(east),
  );
  await page.evaluate(() => window.__campaignComposition.installDetail(true));
  const detail = await page.evaluate(() => window.__rendererLabStats.stats);
  ctx.check(
    "tile admission keeps current visibility",
    detail.objects === east.objects &&
      detail.scenery.scenery === east.scenery.scenery &&
      detail.surfaceRevision > east.surfaceRevision,
    JSON.stringify(detail),
  );
  await page.close();
}
