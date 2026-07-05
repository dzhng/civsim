import { PNG } from "pngjs";

// A soldier block planted on the steepest slope of each quick-battle map, seated
// through the same height field as the ground mesh and the props — proof that
// soldiers, shadows, and scenery share one terrain surface (the slice-03
// movement/seating invariant) on the real map height, not a lab-only ridge.
const MAPS = ["shore-and-crags", "highland-vale", "wooded-pass", "generated-seed-7"];

export const meta = {
  name: "battle-terrain-elevation",
  kind: "visual",
  world: "battle-terrain-elevation",
  tier: "full",
  snapshots: MAPS.map((id) => `terrain-elevation/${id}`),
  describe:
    "Soldiers seated on the real rolling battle terrain through the shared height field, including fixed generated seed 7.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "battle elevation shots require browser GPU flags",
      true,
      "set VERIFY_GPU=1 to capture",
    );
    return;
  }
  for (const id of MAPS) {
    await gate(ctx, id);
  }
}

async function gate(ctx, id) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: `elevation-${id}`,
  });
  await page.goto(`${ctx.target}/renderer/battle-terrain-3d?gate=${id}&view=soldiers`);
  await page.waitForFunction(
    (g) => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.gate === g,
    id,
    { timeout: 20000 },
  );
  await page.waitForTimeout(200);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== "battle-terrain-3d" || stats?.view !== "soldiers") {
    await page.close();
    throw new Error(`elevation ${id} bad stats: ${JSON.stringify(stats)}`);
  }

  ctx.check(`${id} planted a soldier block`, stats.soldiers > 100, `soldiers=${stats.soldiers}`);
  ctx.check(
    `${id} every soldier seats on the sampled terrain height`,
    stats.soldierElevationMatches === true,
    `match=${stats.soldierElevationMatches}`,
  );
  // The block straddles real relief (not a flat parade spot).
  ctx.check(
    `${id} the block climbs the slope`,
    stats.soldierElevationSpan > 0.5,
    `span=${stats.soldierElevationSpan}`,
  );

  const shot = await page.locator("#renderer-canvas").screenshot();
  const m = soldierMetrics(PNG.sync.read(shot));
  // Generated relief partially occludes the block behind rises. 0.005 is still
  // ~60x above noise.
  const soldierFloor = 0.005;
  ctx.check(`${id} soldiers render over the ground`, m.soldier > soldierFloor, JSON.stringify(m));
  await ctx.snap(page, `terrain-elevation/${id}`, { shot });
  await page.close();
}

function soldierMetrics(png) {
  let total = 0;
  let soldier = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      total++;
      // Soldiers are material-led now: count dark armor/leather mass over the field,
      // not blue faction livery.
      if (isCrowdMass(r, g, b)) soldier++;
    }
  }
  return { soldier: Number((soldier / total).toFixed(4)) };
}

function isCrowdMass(r, g, b) {
  const luma = r * 0.3 + g * 0.59 + b * 0.11;
  const greenField = g > r + 22 && g > b + 12;
  return luma > 34 && luma < 132 && r < 165 && g < 155 && b < 145 && !greenField;
}
