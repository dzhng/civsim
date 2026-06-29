import { PNG } from 'pngjs';

export const meta = {
  name: 'campaign-models',
  kind: 'visual',
  world: 'campaign-models',
  tier: 'full',
  snapshots: [
    'campaign/entities/city',
    'campaign/entities/garrison-outside',
    'campaign/entities/garrison-city',
    'campaign/entities/garrison-hidden',
    'campaign/entities/hostile-depth-order',
    'campaign/entities/town',
    'campaign/entities/army',
    'campaign/terrain/road',
    'campaign/terrain/road-only',
    'campaign/entities/selected-city',
    'campaign/props/trees',
    'campaign/props/conifer',
    'campaign/props/broadleaf',
    'campaign/props/mountain',
    'campaign/props/rocks',
    'campaign/labels/labels',
    'campaign/terrain/terrain-grass-scrub',
    'campaign/terrain/terrain-stone-relief',
    'campaign/terrain/shoreline-water',
    'campaign/terrain/cloud-fog',
  ],
  describe: 'Captures campaign model, prop, terrain, road, water, fog, and label baselines under web/shots/models/campaign.',
};

const CONTENT_REQUIREMENTS = {
  trees: { foliageRatio: 0.05, trunkRatio: 0.004 },
  conifer: { foliageRatio: 0.04 },
  broadleaf: { foliageRatio: 0.03, trunkRatio: 0.004 },
  mountain: { stoneRatio: 0.08, darkRatio: 0.01 },
  rocks: { stoneRatio: 0.05, darkRatio: 0.015 },
  'terrain-grass-scrub': { foliageRatio: 0.03 },
  'terrain-stone-relief': { stoneRatio: 0.12 },
};

const gates = [
  {
    id: 'city',
    label: 'City Cluster',
    criteria: 'Large settlement has clustered sandstone buildings, terracotta roofs, ownership flag, shadow, label icon, and selected footprint.',
  },
  {
    id: 'garrison-outside',
    label: 'Garrison Outside City',
    criteria: 'Army marker is fully visible outside the city before garrisoning, using the same production city and army depth-tested model path.',
  },
  {
    id: 'garrison-city',
    label: 'Garrison Partly In City',
    criteria: 'Army marker can sit inside the city volume with lower soldiers occluded and the raised standard still readable through the production depth pass.',
  },
  {
    id: 'garrison-hidden',
    label: 'Garrison Hidden In City',
    criteria: 'Army marker can be lowered into the city volume and fully hidden by city roofs/walls through the production depth pass.',
  },
  {
    id: 'hostile-depth-order',
    label: 'Hostile Depth Order',
    criteria: 'A later-submitted scenery bucket behind the city cannot overpaint the nearer city standard; type buckets are batching only.',
  },
  {
    id: 'town',
    label: 'Town Scale',
    criteria: 'Smaller settlement keeps the same model language at a distinct readable scale.',
  },
  {
    id: 'army',
    label: 'Army Marker',
    criteria: 'Army flag is attached to the marker with representative figures, faction livery, label icon, shadow, and a ground selection footprint occluded by the formation.',
  },
  {
    id: 'road',
    label: 'Road With Cities',
    criteria: 'Road segment is visible as a stone route between settlement endpoints.',
  },
  {
    id: 'road-only',
    label: 'Road Only',
    criteria: 'Raised pale-stone road treatment is visible without city models hiding edge and shadow behavior.',
  },
  {
    id: 'selected-city',
    label: 'Selected City Footprint',
    criteria: 'Selected city footprint sits outside the city shadow, projects with the ground plane, and is occluded by city geometry where covered.',
  },
  {
    id: 'trees',
    label: 'Tree Props',
    criteria: 'Tree prop family is visible with separate conifer and broadleaf silhouettes in one comparison capture.',
  },
  {
    id: 'conifer',
    label: 'Conifer Tree',
    criteria: 'Individual conifer model has trunk, tiered crown, non-square contact shadow, and campaign lighting.',
  },
  {
    id: 'broadleaf',
    label: 'Broadleaf Tree',
    criteria: 'Individual broadleaf model has trunk, rounded low-poly canopy, non-square contact shadow, and campaign lighting.',
  },
  {
    id: 'mountain',
    label: 'Mountain Props',
    criteria: 'Mountain massif prop family is visible and anchored to terrain with campaign lighting.',
  },
  {
    id: 'rocks',
    label: 'Rock Props',
    criteria: 'Rock/boulder prop family is visible and distinct from mountains.',
  },
  {
    id: 'labels',
    label: 'Campaign Labels',
    criteria: 'City, army, faction, and sea label typography/icon samples render through the WebGPU glyph atlas.',
  },
  {
    id: 'terrain-grass-scrub',
    label: 'Terrain Grass And Scrub',
    criteria: 'Grass/scrub material sample shows warm parchment terrain with sparse Mediterranean vegetation.',
  },
  {
    id: 'terrain-stone-relief',
    label: 'Terrain Stone Relief',
    criteria: 'Stone/relief material sample shows rocks and mountains anchored to campaign terrain.',
  },
  {
    id: 'shoreline-water',
    label: 'Shoreline Water',
    criteria: 'Campaign water/glint pass is visible as a real WebGPU atmospheric layer over the terrain.',
  },
  {
    id: 'cloud-fog',
    label: 'Cloud And Fog Layer',
    criteria: 'Campaign cloud/fog pass is visible as a real WebGPU atmospheric layer over the terrain.',
  },
];

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('campaign model shots require browser GPU flags', true, 'set VERIFY_GPU=1 to capture campaign model shots');
    return;
  }

  const captures = [];
  for (const gate of gates) {
    captures.push(await captureShot(ctx, gate));
  }
  ctx.check(
    'campaign model shots captured',
    captures.every((capture) => capture.stats?.route === 'campaign-models' && capture.contentOk !== false),
    JSON.stringify({ captures: captures.length, shots: captures.map((capture) => capture.shot) }),
  );
}

async function captureShot(ctx, gate) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: `model-shot-${gate.id}` });
  await page.goto(`${ctx.target}/renderer/campaign-models?gate=${gate.id}`);
  await page.waitForFunction((id) => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.gate === id, gate.id, { timeout: 18000 });
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== 'campaign-models' || stats?.gate !== gate.id) {
    await page.close();
    throw new Error(`model shot ${gate.id} did not publish valid stats: ${JSON.stringify(stats)}`);
  }
  const shot = await page.locator('#renderer-canvas').screenshot();
  const content = shotContentCheck(gate.id, shot);
  const shotName = `campaign/${shotFolder(gate.id)}/${gate.id}`;
  await ctx.snap(page, shotName, { shot });
  await page.close();
  ctx.check(
    `campaign model content ${gate.id}`,
    content.ok,
    JSON.stringify({ label: gate.label, criteria: gate.criteria, metrics: content.metrics }),
  );
  return {
    ...gate,
    shot: `${shotName}.png`,
    stats,
    contentMetrics: content.metrics,
    contentOk: content.ok,
    status: 'gpu-evidence',
  };
}

function shotContentCheck(gateId, shot) {
  const metrics = contentMetrics(PNG.sync.read(shot));
  const required = CONTENT_REQUIREMENTS[gateId];
  if (!required) return { ok: true, metrics };
  const ok = Object.entries(required).every(([key, min]) => (metrics[key] ?? 0) >= min);
  return { ok, metrics };
}

function shotFolder(gateId) {
  if (['city', 'town', 'army', 'selected-city', 'garrison-outside', 'garrison-city', 'garrison-hidden', 'hostile-depth-order'].includes(gateId)) {
    return 'entities';
  }
  if (['trees', 'conifer', 'broadleaf', 'mountain', 'rocks'].includes(gateId)) {
    return 'props';
  }
  if (gateId === 'labels') {
    return 'labels';
  }
  return 'terrain';
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
