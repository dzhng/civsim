import { PNG } from "pngjs";

const tiers = ["battle-unit", "campaign-army", "settlement-banner"];
const factions = ["azure", "crimson"];
const gates = tiers.flatMap((tier) =>
  factions.map((faction) => ({
    id: `${tier}-${faction}`,
    tier,
    faction,
    label: `${tier} ${faction}`,
  })),
);

export const meta = {
  name: "shared-standard-models",
  kind: "visual",
  world: "shared-standard-models",
  tier: "full",
  snapshots: gates.map((gate) => `shared/standards/${gate.id}`),
  describe:
    "Captures the reusable 3D standard family under web/shots/models/shared/standards: all size tiers x Azure/Crimson liveries.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "shared standard shots require browser GPU flags",
      true,
      "set VERIFY_GPU=1 to capture shared standard shots",
    );
    return;
  }

  for (const gate of gates) {
    await captureGate(ctx, gate);
  }
}

async function captureGate(ctx, gate) {
  const page = await ctx.newPage({
    viewport: { width: 720, height: 820 },
    errorPrefix: `shared-standard-${gate.id}`,
  });
  await page.goto(`${ctx.target}/renderer/shared-standard-models?gate=${gate.id}`);
  await page.waitForFunction(
    (id) => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.gate === id,
    gate.id,
    { timeout: 18000 },
  );
  await page.waitForTimeout(160);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== "shared-standard-models" || stats?.gate !== gate.id) {
    await page.close();
    throw new Error(
      `shared standard ${gate.id} did not publish valid stats: ${JSON.stringify(stats)}`,
    );
  }
  ctx.check(
    `${gate.id} route publishes the shared standard contract`,
    stats.standards === 1 &&
      stats.tier === gate.tier &&
      stats.faction === gate.faction &&
      stats.weightChannel?.includes(">0 cloth") &&
      stats.waveContract?.includes("cam.time") &&
      stats.timeSeconds === 0.75,
    JSON.stringify(stats),
  );
  const shot = await page.locator("#renderer-canvas").screenshot();
  const metrics = standardMetrics(PNG.sync.read(shot), gate.faction);
  ctx.check(
    `${gate.id} standard fills the model frame`,
    metrics.standardPixels >= 0.055 && metrics.topHeadroom > 0.02 && metrics.bottomHeadroom > 0.02,
    JSON.stringify({ label: gate.label, metrics }),
  );
  ctx.check(
    `${gate.id} livery and gold hardware are visible`,
    metrics.field >= 0.006 && metrics.gold >= 0.003 && metrics.dark >= 0.002,
    JSON.stringify({ label: gate.label, metrics }),
  );
  await ctx.snap(page, `shared/standards/${gate.id}`, { shot });
  await page.close();
}

function standardMetrics(png, faction) {
  let total = 0;
  let standardPixels = 0;
  let field = 0;
  let gold = 0;
  let dark = 0;
  let minY = png.height;
  let maxY = 0;
  const x0 = Math.floor(png.width * 0.12);
  const x1 = Math.floor(png.width * 0.88);
  const y0 = Math.floor(png.height * 0.05);
  const y1 = Math.floor(png.height * 0.94);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      total++;
      const isField =
        faction === "azure"
          ? b > 115 && b > r * 1.22 && g > 85
          : r > 115 && r > b * 1.35 && g < 150;
      const isGold = r > 120 && g > 85 && b < 90 && r > b * 1.6 && r > g * 1.05;
      const isDark = r > 26 && r < 110 && g > 16 && g < 88 && b < 60 && r > g * 1.15;
      if (isField || isGold || isDark) standardPixels++;
      // Headroom tracks the flag itself (field/gold), never terrain look-alikes.
      if (isField || isGold) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      if (isField) field++;
      if (isGold) gold++;
      if (isDark) dark++;
    }
  }
  const ratio = (value) => Number((value / Math.max(1, total)).toFixed(4));
  return {
    standardPixels: ratio(standardPixels),
    field: ratio(field),
    gold: ratio(gold),
    dark: ratio(dark),
    topHeadroom: Number((minY / png.height).toFixed(4)),
    bottomHeadroom: Number(((png.height - maxY) / png.height).toFixed(4)),
  };
}
