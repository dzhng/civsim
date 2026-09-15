import { PNG } from "pngjs";
import { campaign } from "../worlds.mjs";
import { hasCampaignWorldDepthContract } from "../_renderer-contract.mjs";
export const meta = {
  name: "campaign-physical-overview",
  kind: "visual",
  world: "campaign-real",
  tier: "full",
  snapshots: ["campaign-production-overview"],
  describe: "Production real-map overview retains faction, sea and screen-marker hierarchy.",
};
export async function run(ctx) {
  const page = await campaign(ctx, "new", {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "physical-overview",
    timeout: 120000,
  });
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning" && /GPU|shader|validation/i.test(message.text()))
      warnings.push(message.text());
  });
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.fogOfWar(false);
    window.__campaign.factionView(true);
    window.__campaign.cam(-100, 250, 0.18);
  });
  await page.waitForFunction(() => window.__campaignGpuStats?.residency?.ready, undefined, {
    timeout: 120000,
  });
  await page.evaluate(() => document.fonts.ready);
  const stats = await page.evaluate(() => window.__campaignGpuStats);
  ctx.check("real campaign shares the physical world", hasCampaignWorldDepthContract(stats));
  ctx.check(
    "overview keeps geographic label hierarchy",
    stats.visibleSeaLabelRects.length > 0 && stats.visibleFactionLabelRects.length > 0,
    JSON.stringify({
      sea: stats.visibleSeaLabelRects.length,
      factions: stats.visibleFactionLabelRects.length,
    }),
  );
  ctx.check("overview submits screen army flags", stats.mapMarkers > 0, String(stats.mapMarkers));
  ctx.check(
    "mountains come from terrain, without mountain props",
    stats.sceneryCandidateStats.mountains === 0,
  );
  const shot = await page.screenshot();
  const pixels = PNG.sync.read(shot);
  // Three equally spaced sea patches straddle the reported below-camera
  // artifact. Smooth aerial variation is allowed; the old LUT block cut
  // the middle patch by 34 RGB levels relative to its two neighbors.
  const mean = (x) => {
    let sum = 0;
    for (let y = 645; y < 675; y++)
      for (let px = x; px < x + 20; px++) {
        const i = (y * pixels.width + px) * 4;
        sum += (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
      }
    return sum / 600;
  };
  const seaTrough = (mean(620) + mean(690)) / 2 - mean(655);
  ctx.check(
    "below-camera sea has no deep rectangular aerial-light trough",
    seaTrough < 20,
    JSON.stringify({ seaTrough, maximum: 20 }),
  );
  await ctx.snap(null, "campaign-production-overview", {
    shot,
    threshold: 0,
    maxDiffRatio: 0,
  });
  ctx.check(
    "overview screen shaders have no validation warnings",
    warnings.length === 0,
    warnings.join("\n"),
  );
  await page.close();
}
