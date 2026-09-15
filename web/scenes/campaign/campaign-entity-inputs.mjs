export const meta = {
  name: "campaign-entity-inputs",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: [
    "campaign-entity-inputs-coarse",
    "campaign-entity-inputs-raised",
    "campaign-entity-inputs-cart",
  ],
  describe:
    "Actual frame army/garrison standards, shared selection and road carts follow the presented surface.",
};
export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "campaign-inputs",
  });
  const warnings = [];
  page.on("console", (m) => {
    if (m.type() === "warning" && /GPU|shader|validation/i.test(m.text())) warnings.push(m.text());
  });
  await page.goto(`${ctx.target}/renderer/campaign-composition?ref=1&inputs=1`);
  await page.waitForFunction(() => window.__rendererLabReady, undefined, { timeout: 180000 });
  const state = () => page.evaluate(() => window.__rendererLabStats);
  const ready = await state();
  ctx.check("fixture loads", ready.ok === true, JSON.stringify(ready.error));
  const initial = ready.stats;
  ctx.check(
    "garrison frame retains one city and two army standards",
    initial.crowd.instances === 6 &&
      initial.cities.instances === 1 &&
      initial.standards.standards === 2 &&
      initial.standards.selected === 1 &&
      initial.selections.garrisonedArmySelections === 1,
  );
  ctx.check(
    "standard identity and actual faction livery survive",
    initial.standardAnchors[0].unitId === 0 &&
      initial.standardAnchors[1].unitId === 1 &&
      initial.standardAnchors[0].cityId === 0 &&
      initial.standardAnchors[0].livery.field[2] > initial.standardAnchors[1].livery.field[2],
  );
  ctx.check(
    "existing scenery pipeline draws generated road carts",
    initial.scenery.scenery > 0 && initial.scenery.scenerySubmitted === initial.scenery.scenery,
  );
  await page.evaluate(() => window.__campaignComposition.inputs(1));
  await page.waitForTimeout(500);
  const coarse = (await state()).stats;
  ctx.check(
    "new frame replaces selected army and ring kind",
    coarse.selected === "army:1" &&
      coarse.standards.selected === 1 &&
      coarse.selections.selections === 1 &&
      coarse.selections.garrisonedArmySelections === 0,
  );
  await page.evaluate(() => window.__campaignComposition.draw());
  ctx.check("drawing preserves current selection", (await state()).stats.selected === "army:1");
  await ctx.snap(null, "campaign-entity-inputs-coarse", {
    threshold: 0,
    maxDiffRatio: 0,
    shot: await page.screenshot(),
  });
  await page.evaluate(() => window.__campaignComposition.installDetail(true));
  await page.waitForTimeout(300);
  const raised = (await state()).stats;
  ctx.check(
    "eastern army standard follows terrain replacement",
    raised.standardAnchors[1].z > coarse.standardAnchors[1].z + 6,
  );
  ctx.check(
    "terrain update preserves cart membership and clearance",
    raised.sceneryAnchors.length === coarse.sceneryAnchors.length &&
      raised.sceneryAnchors.every((cart) => cart.surfaceOffset > 0),
  );
  await ctx.snap(null, "campaign-entity-inputs-raised", {
    threshold: 0,
    maxDiffRatio: 0,
    shot: await page.screenshot(),
  });
  await page.evaluate(() => window.__campaignComposition.inputs(1, false, 20));
  ctx.check(
    "campaign time moves carts without changing their source",
    (await state()).stats.sceneryAnchors.some(
      (cart, i) => cart.x !== raised.sceneryAnchors[i]?.x || cart.y !== raised.sceneryAnchors[i]?.y,
    ),
  );
  await page.evaluate(() => window.__campaignComposition.visibility(false));
  const hidden = (await state()).stats;
  ctx.check(
    "fog clears hidden selected army and standard",
    hidden.selected === null && hidden.standards.standards === 1 && hidden.standards.selected === 0,
  );
  await page.locator("#composition-fog").click();
  ctx.check(
    "reveal does not resurrect cleared selection",
    (await state()).stats.selections.selections === 0 &&
      (await state()).stats.standards.selected === 0,
  );
  await page.evaluate(() => window.__campaignComposition.inputs(0, true));
  const empty = (await state()).stats;
  ctx.check(
    "empty frame clears cities standards crowds selections and carts",
    empty.cities.instances === 0 &&
      empty.standards.standards === 0 &&
      empty.crowd.instances === 0 &&
      empty.selections.selections === 0 &&
      empty.scenery.scenerySubmitted === 0,
  );
  await page.evaluate(() => window.__campaignComposition.inputs());
  await page.locator("#composition-reset").click();
  await page.waitForFunction(() => window.__rendererLabStats.stats?.generation === 1, undefined, {
    timeout: 180000,
  });
  ctx.check(
    "recreation restores one shared world",
    (await state()).stats.standards.standards === 2 && (await page.locator("canvas").count()) === 1,
  );
  await page.goto(`${ctx.target}/renderer/campaign-composition?ref=1&inputs=1&focus=cart`);
  await page.waitForFunction(
    () => window.__rendererLabReady && window.__rendererLabStats.ok,
    undefined,
    { timeout: 180000 },
  );
  await page.waitForTimeout(500);
  await page.mouse.move(1, 1);
  await ctx.snap(null, "campaign-entity-inputs-cart", {
    threshold: 0,
    maxDiffRatio: 0,
    shot: await page.screenshot(),
  });
  ctx.check("no GPU warnings", warnings.length === 0, warnings.join("\n"));
  await page.close();
}
