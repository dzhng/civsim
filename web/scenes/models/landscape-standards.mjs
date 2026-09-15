import { PNG } from "pngjs";
export const meta = {
  name: "landscape-standards",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: ["landscape-standards", "landscape-standards-wind"],
  describe:
    "Mixed settlement, campaign army and battle standards retain livery and explicit wind through buffer growth.",
};
export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${ctx.target}/renderer/landscape-standards?ref=1`);
  await page.waitForFunction(() => window.__rendererLabReady === true, undefined, {
    timeout: 90000,
  });
  await page.waitForTimeout(350);
  const shot = await page.screenshot();
  await ctx.snap(null, "landscape-standards", { shot, threshold: 0, maxDiffRatio: 0 });
  ctx.check(
    "mixed tier and selected contracts",
    await page.evaluate(
      () =>
        window.__rendererLabStats.stats.standards === 3 &&
        window.__rendererLabStats.stats.tier === "mixed" &&
        window.__rendererLabStats.stats.selected === 1,
    ),
  );
  await page.evaluate(() => window.__landscapeStandards.grow());
  await page.waitForTimeout(350);
  ctx.check(
    "grown tier renders alongside remaining tiers",
    await page.evaluate(() => window.__rendererLabStats.stats.standards === 36),
  );
  await page.evaluate(() => window.__landscapeStandards.restore());
  await page.waitForTimeout(350);
  const restored = PNG.sync.read(await page.screenshot());
  ctx.check(
    "shrink returns identical frame after GPU buffer growth",
    PNG.sync.read(shot).data.equals(restored.data),
  );
  await page.evaluate(() => window.__landscapeStandards.time(2.5));
  await page.waitForTimeout(350);
  const moved = await page.screenshot();
  await ctx.snap(null, "landscape-standards-wind", { shot: moved, threshold: 0, maxDiffRatio: 0 });
  const a = PNG.sync.read(shot),
    b = PNG.sync.read(moved);
  let changed = 0;
  for (let k = 0; k < a.data.length; k += 4)
    if (
      a.data[k] !== b.data[k] ||
      a.data[k + 1] !== b.data[k + 1] ||
      a.data[k + 2] !== b.data[k + 2]
    )
      changed++;
  ctx.check("wind time changes cloth", changed > 100, `${changed} pixels changed`);
  let stationaryChanges = 0,
    green = 0,
    pink = 0;
  for (let y = 220; y < 470; y++)
    for (let x = 260; x < 370; x++) {
      const k = (y * a.width + x) * 4;
      if (
        a.data[k] !== b.data[k] ||
        a.data[k + 1] !== b.data[k + 1] ||
        a.data[k + 2] !== b.data[k + 2]
      )
        stationaryChanges++;
      if (a.data[k + 1] > a.data[k] * 1.3 && a.data[k + 1] > a.data[k + 2] * 1.1) green++;
    }
  for (let y = 290; y < 450; y++)
    for (let x = 610; x < 675; x++) {
      const k = (y * a.width + x) * 4;
      if (a.data[k] > a.data[k + 1] * 1.2 && a.data[k + 2] > a.data[k + 1] * 1.05) pink++;
    }
  ctx.check(
    "explicit zero wind leaves settlement cloth unchanged",
    stationaryChanges === 0,
    `${stationaryChanges} changed pixels`,
  );
  ctx.check(
    "custom settlement and army fields reach visible cloth",
    green > 100 && pink > 100,
    JSON.stringify({ green, pink }),
  );
  await page.close();
}
