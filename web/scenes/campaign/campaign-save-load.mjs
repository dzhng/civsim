import { hasCampaignWorldDepthContract } from "../_renderer-contract.mjs";

export const meta = {
  name: "campaign-save-load",
  kind: "flow",
  world: "campaign-real",
  tier: "quick",
  snapshots: [],
  describe: "Normal menu campaign save/load round-trips into the raw-WebGPU campaign adapter.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "campaign WebGPU save/load requires VERIFY_GPU=1",
      true,
      "set VERIFY_GPU=1 to exercise the WebGPU campaign adapter",
    );
    return;
  }

  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "campaign-save-load",
  });
  await page.goto(ctx.target);
  await page.waitForFunction(() => window.__appShellStats?.gpu?.ok === true, undefined, {
    timeout: 18000,
  });
  // Keep this literal aligned with CAMPAIGN_SAVE_KEY in web/src/campaign/save.ts;
  // node scene files cannot import the browser TypeScript module.
  await page.evaluate(() => localStorage.removeItem("campaign-save"));
  await page.reload();
  await page.waitForFunction(() => window.__appShellStats?.gpu?.ok === true, undefined, {
    timeout: 18000,
  });
  await page.waitForFunction(
    () => {
      const menu = document.getElementById("menu-ui");
      return menu !== null && getComputedStyle(menu).display === "flex";
    },
    undefined,
    { timeout: 12000 },
  );
  const emptySaveState = await page.evaluate(() => ({
    loadDisabled: document.querySelector("#menu-load-save")?.disabled,
    menu: getComputedStyle(document.getElementById("menu-ui")).display,
  }));
  ctx.check(
    "menu starts with no loadable campaign save in this context",
    emptySaveState.menu === "flex" && emptySaveState.loadDisabled === true,
    JSON.stringify(emptySaveState),
  );

  await page.click("#menu-new-campaign");
  await page.waitForFunction(
    () => window.__campaignReady === true && window.__campaignGpuStats?.ready === true,
    undefined,
    { timeout: 30000 },
  );
  const initial = await page.evaluate(() => ({
    renderer: window.__campaignGpuStats?.renderer,
    gpu: window.__campaignGpuStats,
    cityEntities: window.__campaignGpuStats?.cityEntities,
    armyEntities: window.__campaignGpuStats?.armyEntities,
    armies: window.__campaign.armies().length,
    cities: Object.keys(window.__campaign.cities()).length,
    saveLength: window.__campaign.save().length,
  }));
  ctx.check(
    "new campaign starts as a normal WebGPU campaign",
    initial.renderer === "renderer-campaign" &&
      hasCampaignWorldDepthContract(initial.gpu) &&
      initial.cityEntities > 100 &&
      initial.armyEntities > 5 &&
      initial.armies > 5 &&
      initial.cities > 390 &&
      initial.saveLength > 1000,
    JSON.stringify(initial),
  );

  await page.click("#cmp-save");
  const saved = await page.evaluate(() => localStorage.getItem("campaign-save") ?? "");
  ctx.check(
    "campaign save writes the normal local slot",
    saved.length > 1000,
    `${saved.length} chars`,
  );

  // The top-bar exit opens the in-game menu overlay; the actual return to the
  // main menu is its "Exit to Main Menu" action.
  await page.click("#cmp-exit");
  await page.waitForSelector("#cmp-menu-exit", { timeout: 6000 });
  await page.click("#cmp-menu-exit");
  await page.waitForFunction(
    () => {
      const menu = document.getElementById("menu-ui");
      return menu !== null && getComputedStyle(menu).display === "flex";
    },
    undefined,
    { timeout: 12000 },
  );
  const menuAfterSave = await page.evaluate(() => ({
    loadDisabled: document.querySelector("#menu-load-save")?.disabled,
    shell: window.__appShellStats,
  }));
  ctx.check(
    "load button is enabled after a WebGPU campaign save",
    menuAfterSave.shell?.gpu?.ok === true && menuAfterSave.loadDisabled === false,
    JSON.stringify(menuAfterSave),
  );

  await page.click("#menu-load-save");
  await page.waitForFunction(
    () => window.__campaignReady === true && window.__campaignGpuStats?.ready === true,
    undefined,
    { timeout: 30000 },
  );
  const loaded = await page.evaluate(
    (savedText) => ({
      renderer: window.__campaignGpuStats?.renderer,
      gpu: window.__campaignGpuStats,
      cityEntities: window.__campaignGpuStats?.cityEntities,
      armyEntities: window.__campaignGpuStats?.armyEntities,
      armies: window.__campaign.armies().length,
      cities: Object.keys(window.__campaign.cities()).length,
      saveMatches: window.__campaign.save() === savedText,
    }),
    saved,
  );
  ctx.check(
    "loaded save returns to a live raw-WebGPU campaign",
    loaded.renderer === "renderer-campaign" &&
      hasCampaignWorldDepthContract(loaded.gpu) &&
      loaded.cityEntities > 100 &&
      loaded.armyEntities > 5 &&
      loaded.armies === initial.armies &&
      loaded.cities === initial.cities &&
      loaded.saveMatches === true,
    JSON.stringify(loaded),
  );

  await page.close();
}
