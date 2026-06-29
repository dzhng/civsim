import { PNG } from 'pngjs';

// Each quick-battle map, viewed looking outward at its two sealed sides. West
// and east must read as the blocker the catalog declares (cliff/ocean/wall) and
// the sim enforces; north/south stay open (the field fades to haze).
const MAPS = ['river-and-crags', 'walled-plain', 'coastal-scrub'];
const VIEWS = ['west', 'east'];

export const meta = {
  name: 'battle-terrain-blockers',
  kind: 'visual',
  world: 'battle-terrain-blockers',
  tier: 'full',
  snapshots: MAPS.flatMap((id) => VIEWS.map((v) => `terrain-blockers/${id}-${v}`)),
  describe: 'Sealed west/east edges of each quick-battle map rendered as cliffs, ocean, or walls at the gameplay camera.',
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('battle blocker shots require browser GPU flags', true, 'set VERIFY_GPU=1 to capture');
    return;
  }
  for (const id of MAPS) {
    for (const view of VIEWS) {
      await gate(ctx, id, view);
    }
  }
}

async function gate(ctx, id, view) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: `blockers-${id}-${view}` });
  await page.goto(`${ctx.target}/renderer/battle-terrain-3d?gate=${id}&view=${view}`);
  await page.waitForFunction((g) => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.gate === g, id, { timeout: 20000 });
  await page.waitForTimeout(160);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== 'battle-terrain-3d' || stats?.view !== view) {
    await page.close();
    throw new Error(`blockers ${id}/${view} bad stats: ${JSON.stringify(stats)}`);
  }
  const role = stats.edges?.[view];
  ctx.check(`${id} ${view} is a sealed role`, role !== 'open-fog' && typeof role === 'string', String(role));
  ctx.check(`${id} ${view} blocker is built`, (stats.sealedEdges ?? []).includes(`${view}:${role}`), JSON.stringify(stats.sealedEdges));

  const shot = await page.locator('#renderer-canvas').screenshot();
  const m = blockerMetrics(PNG.sync.read(shot), role);
  ctx.check(`${id} ${view} blocker reads in the frame`, m.blocker > 0.04, JSON.stringify(m));
  await ctx.snap(page, `terrain-blockers/${id}-${view}`, { shot });
  await page.close();
}

// Count pixels matching the blocker material: grey stone for cliff/wall, blue
// water for ocean. The blocker fills the near band of the outward view.
function blockerMetrics(png, role) {
  let total = 0;
  let blocker = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      total++;
      if (role === 'ocean') {
        if (b > r + 12 && b > 70 && b < 200 && g > r) blocker++;
      } else {
        // grey-ish stone: channels close together, mid value.
        if (Math.abs(r - g) < 26 && Math.abs(g - b) < 30 && r > 110 && r < 215) blocker++;
      }
    }
  }
  return { role, blocker: Number((blocker / total).toFixed(3)) };
}
