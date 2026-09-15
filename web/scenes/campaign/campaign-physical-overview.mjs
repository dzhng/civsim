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
  await ctx.snap(null, "campaign-production-overview", {
    shot: await page.screenshot(),
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
