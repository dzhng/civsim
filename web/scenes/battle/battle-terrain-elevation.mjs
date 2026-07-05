import { PNG } from "pngjs";

// A soldier block planted on the steepest slope of each quick-battle map, seated
// through the same height field as the ground mesh and the props — proof that
// soldiers, shadows, and scenery share one terrain surface (the slice-03
// movement/seating invariant) on the real map height, not a lab-only ridge.
const MAPS = ["river-and-crags", "walled-plain", "coastal-scrub", "generated-seed-7"];

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
  // Generated relief partially occludes the block behind rises; hand maps
  // are flat at the stand. 0.005 is still ~60x above noise.
  const soldierFloor = id.startsWith("generated") ? 0.005 : 0.01;
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
      // The placeholder soldiers are blue-livery — blue dominant over a green field.
      if (b > g && b > r && b > 80) soldier++;
    }
  }
  return { soldier: Number((soldier / total).toFixed(4)) };
}
