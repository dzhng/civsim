import { PNG } from "pngjs";
import { hasCampaignWorldDepthContract } from "../_renderer-contract.mjs";
import { campaign, campaignPresentationReady } from "../worlds.mjs";

export const meta = {
  name: "campaign-production",
  kind: "flow",
  world: "campaign",
  tier: "full",
  snapshots: [
    "campaign-production-physical",
    "campaign-production-physical-selected",
    "campaign-production-physical-dpr2",
    "campaign-production-physical-selected-dpr2",
  ],
  describe: "Normal campaign route renders through the shared physical campaign world.",
};

export async function run(ctx) {
  for (const dpr of [1, 2])
    await runDpr(
      {
        ...ctx,
        check: (name, ...args) => ctx.check(`DPR${dpr}: ${name}`, ...args),
        snap: (page, name, options) => ctx.snap(page, dpr === 1 ? name : `${name}-dpr2`, options),
      },
      dpr,
    );
}
async function runDpr(ctx, dpr) {
  const page = await campaign(ctx, "test", {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: dpr,
    errorPrefix: "campaign-production",
    timeout: 60000,
  });
  await page.evaluate((dpr) => {
    window.__campaign.freeze(true);
    window.__campaign.cam(0, 450, 6 * dpr);
  }, dpr);
  await campaignPresentationReady(page);
  ctx.check(
    "campaign terrain residency completed without worker failure",
    await page.evaluate(() => window.__campaignGpuStats.residency.ready),
  );

  const stats = await page.evaluate(() => window.__campaignGpuStats);
  ctx.check(
    "production campaign route uses the shared physical world",
    stats.renderer === "renderer-campaign" &&
      stats.cityEntities === 2 &&
      stats.armyEntities >= 1 &&
      stats.labelLayer === "physical-gpu-glyph-atlas" &&
      stats.labelVertices > 0 &&
      hasCampaignWorldDepthContract(stats),
    JSON.stringify(stats),
  );
  ctx.check(
    "post-cutover screenshot policy is WebGPU-only",
    stats.postCutoverScreenshots === "renderer-only",
    JSON.stringify(stats),
  );

  const bodyClear = stats.visibleCardRects
    .filter((card) => card.id.startsWith("city:"))
    .every((card) => {
      const body = stats.physicalWorld.cityBodyRects.find(
        (body) => body.id === Number(card.id.slice(5)),
      );
      return body && card.box.y >= body.maxY;
    });
  ctx.check("same-frame city cards clear the presented city bodies", bodyClear);
  const frame = await page.screenshot();
  await ctx.snap(null, "campaign-production-physical", {
    shot: frame,
    threshold: 0,
    maxDiffRatio: 0,
  });
  const pixels = countPixels(PNG.sync.read(frame));
  ctx.check(
    "campaign frame has visible ground, faction and UI pixels",
    pixels.warmGround > 120000 && pixels.red > 700 && pixels.gold > 40,
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
  const replenishRow = await page.evaluate(() => {
    const input = document.querySelector("#cmp-auto-replenish");
    const label = input?.closest("label");
    const icon = label?.querySelector("svg");
    const text = Array.from(label?.childNodes ?? []).findLast(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
    );
    if (!input || !icon || !text) return false;
    const range = document.createRange();
    range.selectNodeContents(text);
    const a = input.getBoundingClientRect(),
      b = icon.getBoundingClientRect();
    const c = range.getBoundingClientRect();
    const center = (r) => (r.top + r.bottom) / 2;
    return (
      Math.abs(center(a) - center(b)) < 1 &&
      Math.abs(center(b) - center(c)) < 2 &&
      c.left >= b.right &&
      c.height < 20
    );
  });
  ctx.check("auto replenish checkbox, icon and label occupy one readable row", replenishRow);
  const selectedFrame = await page.screenshot();
  await ctx.snap(null, "campaign-production-physical-selected", {
    shot: selectedFrame,
    threshold: 0,
    maxDiffRatio: 0,
  });
  const selectedPixels = countPixels(PNG.sync.read(selectedFrame));
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
      cityOpened.gpu.labelLayer === "physical-gpu-glyph-atlas" &&
      hasCampaignWorldDepthContract(cityOpened.gpu),
    JSON.stringify({ cityTarget, cityOpened }),
  );

  const beforePan = await page.evaluate(() => window.__campaign.camGet());
  await page.mouse.move(650, 650);
  await page.mouse.down();
  await page.mouse.move(740, 650, { steps: 3 });
  await page.mouse.up();
  await page.waitForFunction((x) => window.__campaign.camGet().x !== x, beforePan.x);
  ctx.check(
    "dragging the actual campaign canvas pans the camera",
    await page.evaluate((x) => window.__campaign.camGet().x !== x, beforePan.x),
  );
  await page.keyboard.press("f");
  await page.waitForFunction(() => window.__campaignGpuStats.fogEnabled);
  ctx.check(
    "fog input reaches the shared world",
    await page.evaluate(() => window.__campaignGpuStats.physicalWorld.fog === true),
  );
  await page.close();
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
