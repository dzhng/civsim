import { PNG } from 'pngjs';

// The quick-battle maps, by catalog id. Kept in step with BATTLE_MAP_CATALOG in
// packages/game-renderer/src/battle/mapCatalog.ts (the route is the source of
// truth; this list just drives navigation).
const MAPS = ['river-and-crags', 'walled-plain', 'coastal-scrub'];

export const meta = {
  name: 'battle-terrain-features',
  kind: 'visual',
  world: 'battle-terrain-features',
  tier: 'full',
  snapshots: MAPS.map((id) => `terrain-features/${id}`),
  describe: 'Boots each quick-battle map and gates its typed terrain presentation: features, sealed edges, ground cover, and gentle height.',
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('battle terrain feature shots require browser GPU flags', true, 'set VERIFY_GPU=1 to capture');
    return;
  }
  for (const id of MAPS) {
    await gateMap(ctx, id);
  }
}

async function gateMap(ctx, id) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: `terrain-features-${id}` });
  await page.goto(`${ctx.target}/renderer/battle-terrain-features?gate=${id}`);
  await page.waitForFunction((g) => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.gate === g, id, { timeout: 18000 });
  await page.waitForTimeout(160);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== 'battle-terrain-features' || stats?.gate !== id) {
    await page.close();
    throw new Error(`terrain features ${id} did not publish valid stats: ${JSON.stringify(stats)}`);
  }

  const c = stats.featureCounts ?? {};
  // Rock, mud, and micro-rough are present on every quick-battle map; forest
  // belongs to the green maps (the dry coastal scrub has none, by design);
  // water/wall appear where that map's sealed side calls for it.
  if (stats.groundCover === 'green-grass') {
    ctx.check(`${id} green map has forest clumps`, (c.forest ?? 0) > 0, JSON.stringify(c));
  } else {
    ctx.check(`${id} dry map has no forest`, (c.forest ?? 0) === 0, JSON.stringify(c));
  }
  ctx.check(`${id} has rock outcrops`, (c.rock ?? 0) > 0, JSON.stringify(c));
  ctx.check(`${id} has a mud patch`, (c.mud ?? 0) > 0, JSON.stringify(c));
  ctx.check(`${id} scatters micro-rough on open ground`, (c['micro-rough'] ?? 0) > 4, JSON.stringify(c));
  ctx.check(`${id} feature centers stay in bounds`, stats.inBounds === true, `inBounds=${stats.inBounds}`);

  // West/east sealed, north/south open-fog — and the declared roles match the
  // terrain's passability (no side claims a seal the ground does not enforce).
  const e = stats.edges ?? {};
  ctx.check(`${id} west and east are sealed`, e.west !== 'open-fog' && e.east !== 'open-fog', JSON.stringify(e));
  ctx.check(`${id} north and south are open-fog`, e.north === 'open-fog' && e.south === 'open-fog', JSON.stringify(e));
  ctx.check(`${id} edge roles match terrain passability`, (stats.edgeMismatches ?? []).length === 0, JSON.stringify(stats.edgeMismatches));

  ctx.check(`${id} declares a ground cover`, typeof stats.groundCover === 'string' && stats.groundCover.length > 0, String(stats.groundCover));

  // Gentle rolling relief: non-flat unless the map opts out, but smooth enough
  // that soldiers and props sit on it without stair-steps.
  if (stats.intentionallyFlat) {
    ctx.check(`${id} flat map stays flat`, stats.heightSpan < 0.5, `span=${stats.heightSpan}`);
  } else {
    ctx.check(`${id} rolls but stays gentle`, stats.heightSpan > 1 && stats.heightSpan < 15, `span=${stats.heightSpan}`);
  }
  ctx.check(`${id} height samples smoothly`, stats.heightMaxStep < stats.terrainCell, `maxStep=${stats.heightMaxStep} cell=${stats.terrainCell}`);

  // The rendered tint field shows the painted terrain regions.
  const shot = await page.locator('#renderer-canvas').screenshot();
  const metrics = tintMetrics(PNG.sync.read(shot));
  ctx.check(`${id} terrain field is painted`, metrics.colored > 0.4, JSON.stringify(metrics));
  await ctx.snap(page, `terrain-features/${id}`, { shot });
  await page.close();
}

function tintMetrics(png) {
  let total = 0;
  let colored = 0;
  const x0 = Math.floor(png.width * 0.1);
  const x1 = Math.floor(png.width * 0.9);
  const y0 = Math.floor(png.height * 0.2);
  const y1 = Math.floor(png.height * 0.8);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      total++;
      // Anything that is not the pale haze-blue clear counts as painted terrain.
      if (!(b > r && b > g && b > 170)) colored++;
    }
  }
  return { colored: Number((colored / Math.max(1, total)).toFixed(3)) };
}
