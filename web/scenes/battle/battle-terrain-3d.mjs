import { PNG } from 'pngjs';

const MAPS = ['river-and-crags', 'walled-plain', 'coastal-scrub'];

export const meta = {
  name: 'battle-terrain-3d',
  kind: 'visual',
  world: 'battle-terrain-3d',
  tier: 'full',
  snapshots: MAPS.map((id) => `terrain-3d/${id}`),
  describe: 'Each quick-battle map rendered as rolling 3D ground with terrain-masked grass and shared scenery props seated on the shared terrain height, at the gameplay camera.',
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('battle 3d terrain shots require browser GPU flags', true, 'set VERIFY_GPU=1 to capture');
    return;
  }
  for (const id of MAPS) {
    await gateMap(ctx, id);
  }
  await gateSoldiers(ctx, 'river-and-crags');
}

async function gateMap(ctx, id) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: `terrain-3d-${id}` });
  await page.goto(`${ctx.target}/renderer/battle-terrain-3d?gate=${id}`);
  await page.waitForFunction((g) => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.gate === g, id, { timeout: 20000 });
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== 'battle-terrain-3d' || stats?.gate !== id) {
    await page.close();
    throw new Error(`battle 3d terrain ${id} did not publish valid stats: ${JSON.stringify(stats)}`);
  }

  ctx.check(`${id} ground is a displaced heightfield mesh`, stats.groundTriangles > 1000 && stats.groundLayer === 'battle-ground-heightfield', JSON.stringify({ tris: stats.groundTriangles, layer: stats.groundLayer }));
  ctx.check(`${id} relief is exaggerated for readability`, stats.heightSpan > 5 && stats.heightSpan < 40, `span=${stats.heightSpan}`);
  ctx.check(`${id} grass is emitted from terrain cover`, stats.grass?.terrainMasked === true && stats.grass?.tuftInstances > 0 && stats.grass?.bladeInstances > stats.grass?.tuftInstances, JSON.stringify(stats.grass));
  ctx.check(`${id} grass skips blocked water rock wall mud tints`, stats.grass?.invalidTintTufts === 0 && stats.grass?.blockedTintCells > 0 && stats.grass?.eligibleCells > 0, JSON.stringify(stats.grass));
  ctx.check(`${id} grass stays in world-depth before soldiers`, hasWorldDepthGrassPass(stats.framePhases), JSON.stringify(stats.framePhases));
  ctx.check(`${id} props are placed`, stats.props > 0, `props=${stats.props}`);
  // Green maps grow woods; the dry coast has rock outcrops instead of trees.
  if (stats.groundCover === 'green-grass') {
    ctx.check(`${id} green map grows trees`, stats.trees > 0, `trees=${stats.trees}`);
  } else {
    ctx.check(`${id} dry map has rock cues, no trees`, stats.trees === 0 && stats.rocks > 0, JSON.stringify({ trees: stats.trees, rocks: stats.rocks }));
  }

  const shot = await page.locator('#renderer-canvas').screenshot();
  const metrics = groundMetrics(PNG.sync.read(shot));
  ctx.check(`${id} ground fills the frame with cover, not blank`, metrics.cover > 0.78, JSON.stringify(metrics));
  // Tree silhouettes are dark enough to count in pixels; rock cues on dry maps
  // are tan against tan, so the stats.rocks check above carries those.
  if (stats.groundCover === 'green-grass') {
    ctx.check(`${id} trees read against the ground`, metrics.prop > 0.002, JSON.stringify(metrics));
  }
  await ctx.snap(page, `terrain-3d/${id}`, { shot });
  await page.close();
}

async function gateSoldiers(ctx, id) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: `terrain-3d-${id}-soldiers` });
  await page.goto(`${ctx.target}/renderer/battle-terrain-3d?gate=${id}&view=soldiers`);
  await page.waitForFunction((g) => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.gate === g && window.__rendererLabStats?.stats?.view === 'soldiers', id, { timeout: 20000 });
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  ctx.check(`${id} soldiers are seated on the shared terrain height`, stats?.soldiers > 0 && stats?.soldierElevationMatches === true && stats?.soldierElevationSpan > 0.1, JSON.stringify({
    soldiers: stats?.soldiers,
    soldierElevationMatches: stats?.soldierElevationMatches,
    soldierElevationSpan: stats?.soldierElevationSpan,
  }));
  ctx.check(`${id} soldier view keeps grass terrain-masked`, stats?.grass?.terrainMasked === true && stats?.grass?.invalidTintTufts === 0 && stats?.grass?.tuftInstances > 0, JSON.stringify(stats?.grass));
  await page.close();
}

function hasWorldDepthGrassPass(phases) {
  if (!Array.isArray(phases)) return false;
  return phases.some((phase) => {
    if (phase?.kind !== 'world-depth') return false;
    const ids = phase.passIds ?? [];
    const grass = ids.indexOf('battle-3d-grass');
    const soldiers = ids.indexOf('battle-3d-soldiers');
    return grass >= 0
      && (soldiers < 0 || grass < soldiers)
      && phase.depthPasses?.some((pass) => pass.id === 'battle-3d-grass' && pass.mode === 'read-write')
      && phase.passRoles?.some((pass) => pass.id === 'battle-3d-grass' && pass.role === 'world-opaque');
  });
}

function groundMetrics(png) {
  let total = 0;
  let cover = 0;
  let prop = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      total++;
      // Cover = grassy/earthy ground (not the pale haze-blue clear).
      if (!(b > r && b > g && b > 170)) cover++;
      // Props = the dark tree/rock silhouettes and their trunks against the cover.
      if (r < 75 && g < 95 && b < 70) prop++;
    }
  }
  return { cover: Number((cover / total).toFixed(3)), prop: Number((prop / total).toFixed(4)) };
}
