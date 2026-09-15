export const meta = {
  name: "landscape-vegetation",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: [
    "landscape-vegetation-coarse",
    "landscape-vegetation-raised",
    "landscape-vegetation-return",
  ],
  describe:
    "Shared trees retain their positions and follow presented terrain without idle uploads.",
};
export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "landscape-vegetation",
  });
  await page.goto(`${ctx.target}/renderer/landscape-vegetation?ref=1`);
  await page.waitForFunction(() => window.__rendererLabReady === true);
  const state = () => page.evaluate(() => window.__rendererLabStats.stats.scenery);
  const initial = await state();
  ctx.check(
    "all six fixture props are submitted",
    initial.scenery === 6 && initial.scenerySubmitted >= 6,
  );
  await ctx.snap(null, "landscape-vegetation-coarse", {
    threshold: 0,
    maxDiffRatio: 0,
    shot: await page.screenshot(),
  });
  await page.evaluate(() => {
    for (let i = 0; i < 30; i++) window.__campaignComposition.resubmitScenery();
  });
  ctx.check(
    "idle frames do not upload static scenery",
    (await state()).uploads === initial.uploads,
  );
  await page.getByRole("button", { name: "Load raised detail" }).click();
  await page.mouse.move(1, 1);
  await page.waitForTimeout(250);
  const raised = await state();
  ctx.check(
    "terrain admission updates scenery once without changing membership",
    raised.scenery === initial.scenery && raised.uploads === initial.uploads + 1,
  );
  await ctx.snap(null, "landscape-vegetation-raised", {
    threshold: 0,
    maxDiffRatio: 0,
    shot: await page.screenshot(),
  });
  await page.getByRole("button", { name: "Evict raised detail" }).click();
  await page.mouse.move(1, 1);
  await page.waitForTimeout(250);
  ctx.check("return keeps the same props", (await state()).scenery === initial.scenery);
  await ctx.snap(null, "landscape-vegetation-return", {
    threshold: 0,
    maxDiffRatio: 0,
    shot: await page.screenshot(),
  });
  await page.getByRole("button", { name: "Toggle fog" }).click();
  ctx.check(
    "fog hides props under the same visibility rule as campaign entities",
    (await state()).scenery === 2,
  );
  await page.getByRole("button", { name: "Load raised detail" }).click();
  ctx.check("terrain replacement cannot reveal hidden scenery", (await state()).scenery === 2);
  await page.getByRole("button", { name: "Toggle fog" }).click();
  ctx.check(
    "revealing terrain restores its candidate membership",
    (await state()).scenery === initial.scenery,
  );
  await page.evaluate(() => window.__campaignComposition.growScenery());
  await page.waitForTimeout(250);
  ctx.check("growing the instance capacity retains all props", (await state()).scenery === 7);
  await page.close();
}
