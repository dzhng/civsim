import { PNG } from "pngjs";
import { hasCampaignWorldDepthContract } from "../_renderer-contract.mjs";

export const meta = {
  name: "campaign-production",
  kind: "flow",
  world: "campaign",
  tier: "full",
  snapshots: [],
  describe: "Normal campaign route renders through the production raw-WebGPU campaign adapter.",
};

export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "campaign-production",
  });
  await page.goto(`${ctx.target}/?campaign=test`);
  await page.waitForFunction(
    () => window.__campaignReady === true && window.__campaignGpuStats?.ready === true,
    undefined,
    { timeout: 18000 },
  );
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.cam(0, 450, 6);
  });
  await page.waitForTimeout(260);

  const stats = await page.evaluate(() => window.__campaignGpuStats);
  ctx.check(
    "production campaign route is using the raw WebGPU adapter",
    stats.renderer === "renderer-campaign" &&
      stats.cityEntities === 2 &&
      stats.armyEntities >= 1 &&
      stats.waterLayer === "map-sea-mask" &&
      stats.cloudQuads === 1 &&
      stats.labelLayer === "raw-gpu-glyph-atlas" &&
      stats.labelVertices > 0 &&
      hasCampaignWorldDepthContract(stats),
    JSON.stringify(stats),
  );
  ctx.check(
    "post-cutover screenshot policy is WebGPU-only",
    stats.postCutoverScreenshots === "renderer-only",
    JSON.stringify(stats),
  );

  const pixels = countPixels(PNG.sync.read(await page.screenshot()));
  ctx.check(
    "campaign WebGPU frame has parchment, faction, atmosphere, and UI pixels",
    pixels.warmGround > 120000 && pixels.red > 700 && pixels.gold > 40 && pixels.cloud > 1200,
    JSON.stringify(pixels),
  );

  const armyTarget = await page.evaluate(() => {
    const army = window.__campaign.armies().find((candidate) => candidate.mine);
    if (!army) throw new Error("no player army found");
    const p = window.__campaign.project(army.x, army.y);
    return { x: p[0], y: p[1], id: army.id };
  });
  await page.mouse.click(armyTarget.x, armyTarget.y);
  await page.waitForTimeout(160);
  const armySelected = await page.evaluate(() => ({
    selected: window.__campaign.selected(),
    armyPanel: document.querySelector("#cmp-army")?.textContent ?? "",
  }));
  ctx.check(
    "real canvas click selects the rendered WebGPU army marker",
    armySelected.selected === armyTarget.id &&
      armySelected.armyPanel.includes(`Army ${armyTarget.id}`),
    JSON.stringify({ armyTarget, armySelected }),
  );
  const selectedPixels = countPixels(PNG.sync.read(await page.screenshot()));
  ctx.check(
    "selected WebGPU army marker exposes the campaign selection color",
    selectedPixels.green > 200,
    JSON.stringify(selectedPixels),
  );

  await page.evaluate((armyId) => {
    window.__campaign.place(armyId, 1, 0, 4);
  }, armyTarget.id);
  await page.waitForTimeout(160);
  const cityTarget = await page.evaluate(() => {
    const p = window.__campaign.project(-25, 450);
    return { x: p[0], y: p[1] };
  });
  await page.mouse.click(cityTarget.x, cityTarget.y);
  await page.waitForTimeout(160);
  const cityOpened = await page.evaluate(() => ({
    selected: window.__campaign.selected(),
    cityPanel: document.querySelector("#cmp-city")?.textContent ?? "",
    // Own cities are DOM map cards (spec campaign-map-polish 17); Neapolis is
    // the one canvas label left in this fixture.
    cards: Array.from(document.querySelectorAll(".cmp-map-card"))
      .filter((node) => node.style.display !== "none")
      .map((node) => node.querySelector(".cmp-map-card__name")?.textContent ?? ""),
    gpu: window.__campaignGpuStats,
  }));
  ctx.check(
    "real canvas click opens the normal city panel over WebGPU",
    cityOpened.selected === -1 &&
      cityOpened.cityPanel.includes("Roma") &&
      cityOpened.gpu.visibleLabels >= 1 &&
      cityOpened.cards.some((n) => n.toUpperCase().includes("ROMA")) &&
      cityOpened.gpu.labelLayer === "raw-gpu-glyph-atlas" &&
      hasCampaignWorldDepthContract(cityOpened.gpu),
    JSON.stringify({ cityTarget, cityOpened }),
  );

  await page.close();

  const retired = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "campaign-retired-gfx-legacy",
  });
  await retired.goto(`${ctx.target}/?campaign=test&gfx=legacy`);
  await retired.waitForFunction(
    () => window.__campaignReady === true && window.__campaignGpuStats?.ready === true,
    undefined,
    { timeout: 18000 },
  );
  const retiredStats = await retired.evaluate(() => window.__campaignGpuStats);
  ctx.check(
    "retired campaign gfx=legacy route still uses raw WebGPU",
    retiredStats.renderer === "renderer-campaign" &&
      retiredStats.ready === true &&
      retiredStats.labelLayer === "raw-gpu-glyph-atlas" &&
      retiredStats.postCutoverScreenshots === "renderer-only" &&
      hasCampaignWorldDepthContract(retiredStats),
    JSON.stringify(retiredStats),
  );
  await retired.close();
}

function countPixels(png) {
  let warmGround = 0;
  let red = 0;
  let green = 0;
  let gold = 0;
  let cloud = 0;
  let nonBlank = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const o = (y * png.width + x) * 4;
      const r = png.data[o],
        g = png.data[o + 1],
        b = png.data[o + 2];
      if (r + g + b > 60) nonBlank++;
      if (r > 100 && g > 90 && g < 190 && b < 155) warmGround++;
      if (r > 130 && g < 125 && b < 125) red++;
      if (g > 145 && r < 135 && b < 140) green++;
      if (r > 160 && g > 120 && b < 100) gold++;
      if (r > 170 && g > 175 && b > 165 && Math.abs(r - g) < 36 && Math.abs(g - b) < 44) cloud++;
    }
  }
  return { warmGround, red, green, gold, cloud, nonBlank };
}
