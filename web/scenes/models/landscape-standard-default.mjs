import { PNG } from "pngjs";
export const meta = {
  name: "landscape-standard-default",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: ["landscape-standard-default"],
  describe: "Selected battle standard default appearance isolated from battlefield grass.",
};
export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${ctx.target}/renderer/landscape-standards?battle=1&ref=1`);
  await page.waitForFunction(() => window.__rendererLabReady === true, undefined, {
    timeout: 90000,
  });
  await page.waitForTimeout(350);
  ctx.check(
    "one selected battle standard",
    await page.evaluate(
      () =>
        window.__rendererLabStats.stats.standards === 1 &&
        window.__rendererLabStats.stats.selected === 1 &&
        window.__rendererLabStats.stats.tier === "battle-unit",
    ),
  );
  const shot = await page.screenshot();
  const pixels = PNG.sync.read(shot);
  let blue = 0;
  for (let k = 0; k < pixels.data.length; k += 4)
    if (
      pixels.data[k + 2] > pixels.data[k] * 1.08 &&
      pixels.data[k + 2] > pixels.data[k + 1] * 0.95 &&
      pixels.data[k + 2] > 100
    )
      blue++;
  ctx.check("battle cloth is visibly rendered", blue > 100, `${blue} blue cloth pixels`);
  await ctx.snap(null, "landscape-standard-default", { shot, threshold: 0, maxDiffRatio: 0 });
  await page.close();
}
