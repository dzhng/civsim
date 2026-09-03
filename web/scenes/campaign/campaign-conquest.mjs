import { readFile } from "node:fs/promises";
import { nearestIndependentCityFromRoma } from "../_campaign-map-helpers.mjs";
import { hasCampaignWorldDepthContract } from "../_renderer-contract.mjs";
import { ready } from "../worlds.mjs";

export const meta = {
  name: "campaign-conquest",
  kind: "flow",
  world: "campaign-real",
  tier: "full",
  snapshots: [],
  describe:
    "Normal WebGPU campaign marches on an independent city and auto-resolves the garrison battle.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "campaign WebGPU conquest requires VERIFY_GPU=1",
      true,
      "set VERIFY_GPU=1 to exercise the WebGPU campaign adapter",
    );
    return;
  }

  const map = JSON.parse(
    await readFile(new URL("../../public/data/campaign-map.json", import.meta.url)),
  );
  const target = nearestIndependentCityFromRoma(map);
  ctx.check(
    "found an independent city near Roma",
    target.index >= 0,
    `${target.name} at ${Math.round(target.distanceKm)}km`,
  );

  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "campaign-conquest",
  });
  await page.goto(ctx.target);
  await page.waitForFunction(() => window.__appShellStats?.gpu?.ok === true, undefined, {
    timeout: 18000,
  });
  await page.evaluate(() => localStorage.removeItem("campaign-save"));
  await page.click("#menu-new-campaign");
  await ready(page, "__campaignReady", 30000);

  const initial = await page.evaluate(() => ({
    renderer: window.__campaignGpuStats?.renderer,
    gpu: window.__campaignGpuStats,
    cityEntities: window.__campaignGpuStats?.cityEntities,
    armyEntities: window.__campaignGpuStats?.armyEntities,
    armies: window.__campaign.armies(),
    cityCount: Object.keys(window.__campaign.cities()).length,
  }));
  const mine = initial.armies.filter((army) => army.mine);
  ctx.check(
    "real campaign starts through the raw-WebGPU adapter",
    initial.renderer === "renderer-campaign" &&
      hasCampaignWorldDepthContract(initial.gpu) &&
      initial.cityEntities > 100 &&
      initial.armyEntities > 5 &&
      initial.armies.length >= 10 &&
      mine.length >= 2 &&
      initial.cityCount > 390,
    JSON.stringify({
      renderer: initial.renderer,
      cityEntities: initial.cityEntities,
      armyEntities: initial.armyEntities,
      armies: initial.armies.length,
      mine: mine.length,
      cityCount: initial.cityCount,
    }),
  );

  const moved = await page.evaluate(
    (targetIndex) => window.__campaign.orderMove(0, 0, targetIndex, 0),
    target.index,
  );
  ctx.check("move order accepted for nearest independent city", moved === true, target.name);

  let pending = { eid: -1, spent: 0, encounter: null };
  for (let i = 0; i < 40 && pending.eid < 0; i++) {
    pending = await page.evaluate(() => {
      window.__campaign.tick(2000);
      const eid = window.__campaign.battleReady();
      return {
        eid,
        spent: window.__campaign.currentTick(),
        encounter: eid >= 0 ? JSON.parse(window.__campaign.encounterJson(eid)) : null,
      };
    });
  }
  ctx.check(
    "march leads to a pending garrison battle",
    pending.eid >= 0 &&
      pending.encounter?.attacker?.soldiers > 0 &&
      pending.encounter?.defender?.soldiers > 0,
    JSON.stringify(pending),
  );

  await page.keyboard.press("1");
  await page.waitForSelector(".cmp-box", { timeout: 8000 });
  const modal = await page.evaluate(() => ({
    text: document.querySelector(".cmp-box")?.textContent ?? "",
    paused: window.__campaign.paused(),
    renderer: window.__campaignGpuStats?.renderer,
  }));
  ctx.check(
    "initiation modal shows both sides over the WebGPU campaign",
    modal.renderer === "renderer-campaign" &&
      modal.paused === true &&
      /Attacker/.test(modal.text) &&
      /Defender/.test(modal.text),
    JSON.stringify({ ...modal, text: modal.text.replace(/\s+/g, " ").slice(0, 140) }),
  );

  await page.click("#cmp-auto");
  await page.waitForFunction(() => !document.querySelector(".cmp-box"), undefined, {
    timeout: 300000,
  });
  const after = await page.evaluate(() => {
    const armies = window.__campaign.armies();
    const player = armies.find((army) => army.id === 0);
    return {
      renderer: window.__campaignGpuStats?.renderer,
      gpu: window.__campaignGpuStats,
      ready: window.__campaign.battleReady(),
      currentTick: window.__campaign.currentTick(),
      playerArmy: player
        ? {
            id: player.id,
            soldiers: player.soldiers,
            encounter: player.encounter,
            mine: player.mine,
          }
        : null,
      armyCount: armies.length,
      saveLength: window.__campaign.save().length,
    };
  });
  ctx.check(
    "auto-resolve consumes the pending battle and returns to a savable WebGPU campaign",
    after.renderer === "renderer-campaign" &&
      hasCampaignWorldDepthContract(after.gpu) &&
      after.ready === -1 &&
      after.playerArmy?.mine === true &&
      after.playerArmy.encounter === -1 &&
      after.playerArmy.soldiers > 0 &&
      after.armyCount >= 1 &&
      after.saveLength > 1000,
    JSON.stringify(after),
  );

  await page.close();
}
