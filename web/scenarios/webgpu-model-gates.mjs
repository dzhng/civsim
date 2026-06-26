import { mkdir, writeFile } from 'node:fs/promises';

export const meta = {
  name: 'webgpu-model-gates',
  kind: 'visual',
  world: 'webgpu-model-gates',
  tier: 'full',
  snapshots: [],
  describe: 'Captures addressable WebGPU model-gate screenshots for campaign entities, props, roads, and labels.',
};

const OUT_DIR = new URL('../../specs/webgpu-skinned-crowd/visualizations/model-gates/', import.meta.url);
const REPORT_JSON = new URL('webgpu-model-gates.json', OUT_DIR);
const REPORT_HTML = new URL('webgpu-model-gates.html', OUT_DIR);
const GENERATED_AT = process.env.MODEL_GATES_GENERATED_AT ?? 'scenario-generated';

const gates = [
  {
    id: 'city',
    label: 'City Cluster',
    criteria: 'Large settlement has clustered sandstone buildings, terracotta roofs, ownership flag, shadow, label icon, and selected footprint.',
  },
  {
    id: 'town',
    label: 'Town Scale',
    criteria: 'Smaller settlement keeps the same model language at a distinct readable scale.',
  },
  {
    id: 'army',
    label: 'Army Marker',
    criteria: 'Army flag is attached to the marker with representative figures, faction livery, label icon, shadow, and selected footprint.',
  },
  {
    id: 'road',
    label: 'Road Segment',
    criteria: 'Road segment is visible as a stone route between settlement endpoints.',
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
  await writeFile(REPORT_HTML, renderHtml(report));
  ctx.check(
    'WebGPU model gate report generated',
    captures.every((capture) => capture.image && capture.stats?.route === 'campaign-model-gates'),
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
  await page.locator('#webgpu-canvas').screenshot({ path: filePath(image) });
  await page.close();
  return {
    ...gate,
    image: basename(image),
    stats,
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
  return `entities ${stats.entities ?? 0}, scenery ${stats.scenery ?? 0}, roads ${stats.roadSegments ?? 0}, labels ${stats.visibleLabels ?? 0}/${stats.labels ?? 0}`;
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
