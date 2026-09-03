import { PNG } from "pngjs";

// Catalog seeds (mapCatalog.ts): the three named maps are generated from seeds
// 1, 7 and 8; the old elevation scene also carried "generated-seed-7", which is
// highland-vale under another name, so it is not repeated here.
const MAPS = [
  ["shore-and-crags", 1],
  ["highland-vale", 7],
  ["wooded-pass", 8],
];

export const meta = {
  name: "battle-seating",
  kind: "visual",
  world: "production-photoreal-battle-heightfields",
  tier: "full",
  snapshots: MAPS.map(([id]) => `seating/${id}`),
  describe: "Production photoreal soldiers seat and render over each shared battle heightfield.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("battle seating requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  for (const [id, seed] of MAPS) {
    const page = await ctx.newPage({
      viewport: { width: 1280, height: 800 },
      errorPrefix: `seating-${id}`,
    });
    try {
      await page.goto(
        `${ctx.target}/renderer/photoreal-battle?map=gen&seed=${seed}&t=0&ref=1&zoom=6.5&cx=0&cy=-650&env=golden-hour`,
      );
      await page.waitForFunction(
        () =>
          window.__rendererLabReady === true &&
          window.__rendererLabStats?.ok === true &&
          window.__rendererLabStats?.route === "photoreal-battle",
        undefined,
        { timeout: 180000 },
      );
      await page.waitForTimeout(400);
      const seating = await page.evaluate(
        () => window.__rendererLabStats?.stats?.renderStats?.seating ?? null,
      );
      ctx.check(`${id} planted a soldier block`, seating?.checked > 100, JSON.stringify(seating));
      ctx.check(
        `${id} every soldier seats on the sampled terrain height`,
        seating?.matches === true,
        JSON.stringify(seating),
      );
      ctx.check(`${id} the block climbs the slope`, seating?.span > 0.5, JSON.stringify(seating));

      const clip = await page.locator("#renderer-canvas").boundingBox();
      const shot = await page.screenshot({ clip, timeout: 180000 });
      const soldier = soldierFraction(PNG.sync.read(shot));
      ctx.check(`${id} soldiers render over the ground`, soldier > 0.005, `soldier=${soldier}`);
      await ctx.snap(page, `seating/${id}`, { shot });
    } finally {
      await page.close();
    }
  }
}

function soldierFraction(png) {
  let soldiers = 0;
  const total = png.width * png.height;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const luma = r * 0.3 + g * 0.59 + b * 0.11;
    const greenField = g > r + 22 && g > b + 12;
    if (luma > 34 && luma < 132 && r < 165 && g < 155 && b < 145 && !greenField) soldiers++;
  }
  return Number((soldiers / total).toFixed(4));
}
