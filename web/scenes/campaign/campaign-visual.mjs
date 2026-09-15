import { campaign, campaignPresentationReady } from "../worlds.mjs";

export const meta = {
  name: "campaign-visual",
  kind: "visual",
  world: "campaign-test",
  tier: "quick",
  snapshots: [
    "tiny-overview",
    "ui-class-builder",
    "ui-diplomacy",
    "ui-city-panel",
    "ui-army-replenish-toggle",
    "tiny-army-our-city",
    "tiny-army-road",
    "tiny-army-neutral-city",
  ],
  describe:
    "Controlled campaign marker and UI snapshots on the production shared physical campaign world.",
};

const UI_SHOTS = new URL("../../shots/ui/", import.meta.url).pathname;

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "campaign WebGPU visual snapshots require VERIFY_GPU=1",
      true,
      "set VERIFY_GPU=1 to exercise the WebGPU campaign adapter",
    );
    return;
  }

  const page = await campaign(ctx, "test", {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    errorPrefix: "campaign-visual",
  });
  await page.waitForFunction(
    () =>
      window.__campaignGpuStats?.cityEntities >= 2 && window.__campaignGpuStats?.armyEntities >= 1,
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(() => window.__campaign.freeze());

  const army = await page.evaluate(() =>
    window.__campaign.armies().find((candidate) => candidate.mine),
  );
  ctx.check(
    "test campaign boots with a player army",
    !!army,
    army ? `${army.soldiers} soldiers` : "none",
  );
  const gpuStats = await page.evaluate(() => window.__campaignGpuStats);
  ctx.check(
    "controlled campaign visual route uses the shared physical world",
    gpuStats?.renderer === "renderer-campaign" &&
      gpuStats?.labelLayer === "physical-gpu-glyph-atlas" &&
      gpuStats?.labelVertices > 0,
    JSON.stringify(gpuStats),
  );

  await page.evaluate(() => window.__campaign.cam(0, 450, 16));
  await campaignPresentationReady(page);
  await ctx.snap(page, "tiny-overview");

  await page.click("#cmp-classes-btn");
  await campaignPresentationReady(page);
  await ctx.snap(page, "ui-class-builder", { baseDir: UI_SHOTS });
  await page.click("#cmp-classes-btn");

  await page.click("#cmp-diplo-btn");
  await campaignPresentationReady(page);
  await ctx.snap(page, "ui-diplomacy", { baseDir: UI_SHOTS });
  await page.click("#cmp-diplo-btn");

  await page.evaluate(() => window.__campaign.place(0, 1, 0, 4));
  await page.evaluate(() => window.__campaign.openCity(0));
  await campaignPresentationReady(page);
  await ctx.snap(page, "ui-city-panel", { baseDir: UI_SHOTS });

  const armyClick = await page.evaluate(() => {
    const selectedArmy = window.__campaign.armies().find((candidate) => candidate.mine);
    return window.__campaign.project(selectedArmy.x, selectedArmy.y);
  });
  await page.mouse.click(armyClick[0], armyClick[1]);
  await campaignPresentationReady(page);
  await ctx.snap(page, "ui-army-replenish-toggle", { baseDir: UI_SHOTS });

  await pose(page, ctx, "army-our-city", { kind: 0, a: 0, b: 0 }, -25);
  await pose(page, ctx, "army-road", { kind: 1, a: 0, b: 4 }, 0);
  await pose(page, ctx, "army-neutral-city", { kind: 0, a: 1, b: 0 }, 25);

  await page.close();
}

async function pose(page, ctx, name, place, camX) {
  await page.evaluate((p) => window.__campaign.place(0, p.kind, p.a, p.b), place);
  await page.evaluate((x) => window.__campaign.cam(x, 450, 20), camX);
  await campaignPresentationReady(page);
  await ctx.snap(page, `tiny-${name}`);
}
