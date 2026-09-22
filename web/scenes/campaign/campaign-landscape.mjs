import { PHOTOREAL_SUBSTRATE, PHOTOREAL_PROJECTION } from "../_renderer-contract.mjs";

export const meta = {
  name: "campaign-landscape",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: ["landscape-alps", "landscape-italy"],
  describe: "Real campaign geography rendered through the production campaign world.",
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
    const report = await page.evaluate(() => window.__rendererLabStats);
    ctx.check(
      `${region}: production terrain residency and seated trees render`,
      report?.ok === true &&
        report.stats.substrate === PHOTOREAL_SUBSTRATE &&
        report.stats.projection === PHOTOREAL_PROJECTION &&
        report.stats.depth.owner === "three-webgpu" &&
        report.stats.depth.reversed === true &&
        report.stats.residency.ready &&
        report.stats.residency.failed.length === 0 &&
        report.stats.terrain.residentTiles > 0 &&
        report.stats.sceneryAnchors.length > 0 &&
        report.stats.drawCalls > 0 &&
        report.stats.surface.centerRay?.revision === report.stats.surface.revision,
      JSON.stringify(report),
    );
    ctx.check(`${region}: GPU validation is clean`, warnings.length === 0, warnings.join("\n"));
    await ctx.snap(null, `landscape-${region}`, {
      threshold: 0,
      maxDiffRatio: 0,
      shot: await page.screenshot({ timeout: 180000 }),
    });
    await page.close();
  }
}
