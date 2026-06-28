import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

export const meta = {
  name: 'webgpu-model-gates',
  kind: 'visual',
  world: 'webgpu-model-gates',
  tier: 'full',
  snapshots: [],
  describe: 'Captures addressable WebGPU model-gate screenshots for campaign entities, props, roads, and labels.',
};

const OUT_DIR = new URL('../../../specs/done/webgpu-skinned-crowd-foundation/visualizations/model-gates/', import.meta.url);
const REPORT_JSON = new URL('webgpu-model-gates.json', OUT_DIR);
const REPORT_HTML = new URL('webgpu-model-gates.html', OUT_DIR);
const GENERATED_AT = process.env.MODEL_GATES_GENERATED_AT ?? 'scenario-generated';
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
  if (process.env.VERIFY_WEBGPU !== '1') {
    ctx.check('model gates require WebGPU browser flags', true, 'set VERIFY_WEBGPU=1 to capture WebGPU model gates');
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const captures = [];
  for (const gate of gates) {
    captures.push(await captureGate(ctx, gate));
  }
  const report = {
    kind: 'webgpu-model-gate-report',
    generatedAt: GENERATED_AT,
    note: 'These are addressable model-level review captures, not final parity acceptance. Whole-scene parity still requires model gates plus current-renderer comparison.',
    captures,
  };
  await writeFile(REPORT_JSON, JSON.stringify(report, null, 2));
  await writeFile(REPORT_HTML, renderHtml(report).replace(/[ \t]+$/gm, ''));
  ctx.check(
    'WebGPU model gate report generated',
    captures.every((capture) => capture.image && capture.stats?.route === 'campaign-model-gates' && capture.contentOk !== false),
    JSON.stringify({ html: filePath(REPORT_HTML), json: filePath(REPORT_JSON), captures: captures.length }),
  );
}

async function captureGate(ctx, gate) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: `model-gate-${gate.id}` });
  await page.goto(`${ctx.target}/webgpu/campaign-model-gates?gate=${gate.id}`);
  await page.waitForFunction((id) => window.__webgpuLabReady === true && window.__webgpuLabStats?.stats?.gate === id, gate.id, { timeout: 18000 });
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__webgpuLabStats?.stats ?? null);
  if (stats?.route !== 'campaign-model-gates' || stats?.gate !== gate.id) {
    await page.close();
    throw new Error(`model gate ${gate.id} did not publish valid stats: ${JSON.stringify(stats)}`);
  }
  const image = new URL(`${gate.id}.png`, OUT_DIR);
  const imagePath = filePath(image);
  await page.locator('#webgpu-canvas').screenshot({ path: imagePath });
  const content = await gateContentCheck(gate.id, imagePath);
  await page.close();
  return {
    ...gate,
    image: basename(image),
    stats,
    contentMetrics: content.metrics,
    contentOk: content.ok,
    status: 'webgpu-evidence',
  };
}

function renderHtml(report) {
  const cards = report.captures.map((capture) => `
    <article>
      <figure>
        <img src="${escapeHtml(capture.image)}" alt="${escapeHtml(capture.label)}">
      </figure>
      <div>
        <h2>${escapeHtml(capture.label)}</h2>
        <p>${escapeHtml(capture.criteria)}</p>
        <dl>
          <dt>Status</dt><dd>${escapeHtml(capture.status)}</dd>
          <dt>Gate</dt><dd><code>${escapeHtml(capture.id)}</code></dd>
          <dt>Renderer</dt><dd>${escapeHtml(rendererSummary(capture.stats))}</dd>
          <dt>Counts</dt><dd>${escapeHtml(countSummary(capture.stats))}</dd>
        </dl>
      </div>
    </article>
  `).join('\n');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>WebGPU Model Gates</title>
  <style>
    body { margin: 0; background: #181815; color: #eadfca; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
    header { padding: 22px 28px; border-bottom: 1px solid #4e412d; background: #252118; }
    h1 { margin: 0 0 8px; font: 700 26px Georgia, serif; color: #f1dfb1; }
    header p { margin: 0; max-width: 980px; color: #cbbd9e; line-height: 1.45; }
    main { display: grid; gap: 18px; padding: 22px; }
    article { display: grid; grid-template-columns: minmax(320px, 1.4fr) minmax(260px, 0.6fr); gap: 18px; padding: 14px; background: #211f19; border: 1px solid #4b3e2a; }
    figure { margin: 0; }
    img { display: block; width: 100%; height: auto; border: 1px solid #665237; background: #111; }
    h2 { margin: 0 0 10px; color: #f3ddb0; font-size: 18px; }
    p { line-height: 1.45; }
    dl { display: grid; grid-template-columns: 88px 1fr; gap: 7px 12px; font-size: 13px; }
    dt { color: #bca56f; font-weight: 700; }
    dd { margin: 0; color: #e2d5bd; }
    code { color: #f3ddb0; }
    @media (max-width: 900px) { article { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>WebGPU Model Gates</h1>
    <p>Generated ${escapeHtml(report.generatedAt)}. ${escapeHtml(report.note)}</p>
  </header>
  <main>${cards}</main>
</body>
</html>`;
}

function countSummary(stats) {
  if (!stats) return 'missing stats';
  return `entities ${stats.entities ?? 0}, scenery ${stats.scenery ?? 0}, roads ${stats.roadSegments ?? 0}, water ${stats.waterFeatures ?? 0}, clouds ${stats.cloudQuads ?? 0}, labels ${stats.visibleLabels ?? 0}/${stats.labels ?? 0}`;
}

async function gateContentCheck(gateId, imagePath) {
  const metrics = contentMetrics(PNG.sync.read(await readFile(imagePath)));
  const required = CONTENT_REQUIREMENTS[gateId];
  if (!required) return { ok: true, metrics };
  const ok = Object.entries(required).every(([key, min]) => (metrics[key] ?? 0) >= min);
  return { ok, metrics };
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

function rendererSummary(stats) {
  if (!stats) return 'raw-webgpu';
  if ((stats.scenery ?? 0) > 0) return stats.sceneryStats?.layer ?? 'raw-webgpu-scenery';
  if ((stats.entities ?? 0) > 0) return stats.entityLayer ?? 'raw-webgpu-entities';
  if ((stats.labels ?? 0) > 0) return stats.labelLayer ?? 'raw-webgpu-labels';
  return stats.entityLayer ?? stats.labelLayer ?? 'raw-webgpu';
}

function basename(url) {
  return decodeURIComponent(url.pathname.split('/').pop());
}

function filePath(url) {
  return decodeURIComponent(url.pathname);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
