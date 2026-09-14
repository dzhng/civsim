export const meta = {
  name: "landscape-surface",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: ["landscape-surface"],
  describe: "World-aligned coastal ridge and a camera ray on the actual presented triangles.",
};
export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "landscape-surface",
  });
  await page.goto(`${ctx.target}/renderer/landscape-surface?ref=1`);
  await page.waitForFunction(() => window.__rendererLabReady === true, undefined, {
    timeout: 90000,
  });
  await page.waitForTimeout(1000);
  const report = await page.evaluate(() => window.__rendererLabStats);
  const { surface, terrainTriangles } = report.stats;
  ctx.check(
    "camera ray hits the presented raised surface",
    terrainTriangles > 0 &&
      surface.centerRay?.position[2] > 0 &&
      surface.centerRay?.revision === surface.revision,
    JSON.stringify(report),
  );
  await ctx.snap(null, "landscape-surface", {
    threshold: 0,
    maxDiffRatio: 0,
    shot: await page.screenshot({ timeout: 180000 }),
  });
  await page.close();
}
