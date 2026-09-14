export const meta = {
  name: "campaign-landscape",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: ["landscape-alps", "landscape-italy"],
  describe: "Real campaign geography rendered through shared battle terrain and lighting.",
};
export async function run(ctx) {
  for (const region of ["alps", "italy"]) {
    const page = await ctx.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      errorPrefix: `landscape-${region}`,
    });
    const warnings = [];
    page.on("console", (message) => {
      if (message.type() === "warning" && /GPU|shader|bind|validation/i.test(message.text()))
        warnings.push(message.text());
    });
    await page.goto(`${ctx.target}/renderer/campaign-landscape?ref=1&region=${region}`);
    await page.waitForFunction(() => window.__rendererLabReady === true, undefined, {
      timeout: 90000,
    });
    await page.waitForTimeout(1000);
    const report = await page.evaluate(() => window.__rendererLabStats);
    ctx.check(
      `${region}: continuous terrain and trees render`,
      report?.stats?.terrainTriangles > 0 &&
        report?.stats?.trees > 0 &&
        report?.stats?.mountainProps === 0,
      JSON.stringify(report),
    );
    ctx.check(`${region}: GPU validation is clean`, warnings.length === 0, warnings.join("\n"));
    await ctx.snap(null, `landscape-${region}`, {
      shot: await page.screenshot({ timeout: 180000 }),
    });
    await page.close();
  }
}
