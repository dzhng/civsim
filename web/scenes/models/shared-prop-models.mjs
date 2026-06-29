import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

export const meta = {
  name: 'shared-prop-models',
  kind: 'visual',
  world: 'shared-prop-models',
  tier: 'full',
  snapshots: [
    'shared/props/trees',
    'shared/props/conifer',
    'shared/props/broadleaf',
    'shared/props/rocks',
    'shared/props/mountain',
    'shared/props/cart',
  ],
  describe: 'Captures shared reusable scenery prop baselines (trees, rocks, mountains, carts) under web/shots/models/shared/props from the shared prop registry.',
};

// Each prop family alone on neutral ground. Thresholds gate that the silhouette
// actually renders (foliage/stone/wood), not merely that the frame is non-blank.
const CONTENT_REQUIREMENTS = {
  trees: { foliageRatio: 0.05, trunkRatio: 0.004 },
  conifer: { foliageRatio: 0.04 },
  broadleaf: { foliageRatio: 0.03, trunkRatio: 0.004 },
  rocks: { stoneRatio: 0.05, darkRatio: 0.015 },
  mountain: { stoneRatio: 0.08, darkRatio: 0.01 },
  cart: { trunkRatio: 0.01, darkRatio: 0.01 },
};

const gates = [
  { id: 'trees', label: 'Mixed Trees', criteria: 'Tree family is visible with separate conifer and broadleaf silhouettes in one comparison capture.' },
  { id: 'conifer', label: 'Conifer Tree', criteria: 'Individual conifer model has trunk, tiered crown, non-square contact shadow, and shared lighting.' },
  { id: 'broadleaf', label: 'Broadleaf Tree', criteria: 'Individual broadleaf model has trunk, rounded low-poly canopy, non-square contact shadow, and shared lighting.' },
  { id: 'rocks', label: 'Rock Cluster', criteria: 'Rock/boulder family is visible, low and ridged, distinct from mountains.' },
  { id: 'mountain', label: 'Mountain Massif', criteria: 'Mountain massif family is visible, broad and ridged, anchored to the ground.' },
  { id: 'cart', label: 'Cart', criteria: 'Ox-less trade cart reads as road life: dark wheels, plank bed, canvas load, contact shadow.' },
];

export async function run(ctx) {
  ctx.check(
    'reusable props are owned by the shared registry',
    sharedRegistryOwnsProps(),
    'campaign sceneryPass and the renderer-lab route both import builders from sceneryPropRegistry; no parallel build* tables',
  );

  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('shared prop shots require browser GPU flags', true, 'set VERIFY_GPU=1 to capture shared prop shots');
    return;
  }

  const captures = [];
  for (const gate of gates) {
    captures.push(await captureShot(ctx, gate));
  }
  ctx.check(
    'shared prop shots captured',
    captures.every((capture) => capture.stats?.route === 'shared-prop-models' && capture.contentOk !== false),
    JSON.stringify({ captures: captures.length, shots: captures.map((capture) => capture.shot) }),
  );
}

async function captureShot(ctx, gate) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: `prop-shot-${gate.id}` });
  await page.goto(`${ctx.target}/renderer/shared-prop-models?gate=${gate.id}`);
  await page.waitForFunction((id) => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.gate === id, gate.id, { timeout: 18000 });
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== 'shared-prop-models' || stats?.gate !== gate.id) {
    await page.close();
    throw new Error(`shared prop shot ${gate.id} did not publish valid stats: ${JSON.stringify(stats)}`);
  }
  const shot = await page.locator('#renderer-canvas').screenshot();
  const content = shotContentCheck(gate.id, shot);
  const shotName = `shared/props/${gate.id}`;
  await ctx.snap(page, shotName, { shot });
  await page.close();
  ctx.check(
    `shared prop content ${gate.id}`,
    content.ok,
    JSON.stringify({ label: gate.label, criteria: gate.criteria, metrics: content.metrics }),
  );
  return { ...gate, shot: `${shotName}.png`, stats, contentMetrics: content.metrics, contentOk: content.ok, status: 'gpu-evidence' };
}

function shotContentCheck(gateId, shot) {
  const metrics = contentMetrics(PNG.sync.read(shot));
  const required = CONTENT_REQUIREMENTS[gateId];
  if (!required) return { ok: true, metrics };
  const ok = Object.entries(required).every(([key, min]) => (metrics[key] ?? 0) >= min);
  return { ok, metrics };
}

// The shared-ownership invariant for slice 01: surfaces place props by id from
// the registry, never from their own copy of the builder list.
function sharedRegistryOwnsProps() {
  const sceneryPass = readSource('../../../packages/game-renderer/src/campaign/sceneryPass.ts');
  const route = readSource('../../../apps/renderer-lab/src/router.ts');
  const passUsesRegistry = sceneryPass.includes("from '../models/shared/sceneryPropRegistry'")
    && !/build(Conifer|Broadleaf|Rock|Mountain|Cart)\w*Mesh\s*\(/.test(sceneryPass);
  const routeUsesRegistry = route.includes('sceneryPropRegistry') && route.includes('PROP_REVIEW_GROUPS');
  return passUsesRegistry && routeUsesRegistry;
}

function readSource(relative) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function contentMetrics(png) {
  let total = 0;
  let stone = 0;
  let foliage = 0;
  let trunk = 0;
  let dark = 0;
  const x0 = Math.floor(png.width * 0.15);
  const x1 = Math.floor(png.width * 0.85);
  const y0 = Math.floor(png.height * 0.15);
  const y1 = Math.floor(png.height * 0.82);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      if (a < 16) continue;
      total++;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (Math.abs(r - g) < 38 && Math.abs(g - b) < 50 && r > 55 && r < 175 && g > 50 && g < 170 && b > 40 && b < 150) stone++;
      if (g > 45 && g < 125 && r < 90 && b < 85 && g > r * 1.20 && g > b * 1.15) foliage++;
      if (r > 60 && r < 130 && g > 30 && g < 90 && b < 60 && r > g * 1.10) trunk++;
      if (max < 100 && min > 8) dark++;
    }
  }
  const ratio = (value) => Number((value / Math.max(1, total)).toFixed(4));
  return {
    centralPixels: total,
    stoneRatio: ratio(stone),
    foliageRatio: ratio(foliage),
    trunkRatio: ratio(trunk),
    darkRatio: ratio(dark),
  };
}
