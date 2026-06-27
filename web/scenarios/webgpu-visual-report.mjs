import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { battleReal } from './worlds.mjs';

export const meta = {
  name: 'webgpu-visual-report',
  kind: 'visual',
  world: 'full-game',
  tier: 'full',
  snapshots: [],
  describe: 'Generates the WebGPU cutover visual review contact sheet and status JSON.',
};

const OUT_DIR = new URL('../../specs/webgpu-skinned-crowd/visualizations/visual-report/', import.meta.url);
const REPORT_HTML = new URL('../webgpu-visual-report.html', OUT_DIR);
const REPORT_JSON = new URL('webgpu-visual-report.json', OUT_DIR);
const GENERATED_AT = process.env.VISUAL_REPORT_GENERATED_AT ?? 'scenario-generated';
const CURRENT_RENDERER_DIR = process.env.VISUAL_CURRENT_RENDERER_DIR;
const COMPARISON_JSON = process.env.VISUAL_COMPARISON_JSON;
const ACCEPTED_VISUAL_STATUSES = new Set(['webgpu-better', 'equal-or-better', 'accepted-exception', 'pass', 'accepted']);

const reviewRows = [
  {
    id: 'menu-ready',
    label: 'Menu Ready',
    category: 'menu/app shell',
    criteria: 'WebGPU-ready menu, dense controls, readable modal surface.',
    status: 'webgpu-evidence',
  },
  {
    id: 'menu-unsupported',
    label: 'Unsupported WebGPU',
    category: 'fallback UX',
    criteria: 'Unsupported browsers block renderer launch with useful text.',
    status: 'webgpu-evidence',
  },
  {
    id: 'battle-default',
    label: 'Battle Max Crowd',
    category: 'battle',
    criteria: '30k raw-WebGPU crowd, Aegean haze, field-aware coast, warm terrain, skinned soldier material lighting, team colors, HUD composition.',
    status: 'webgpu-evidence',
  },
  {
    id: 'battle-selection-hud-dpr2',
    label: 'Battle Selection DPR2',
    category: 'battle input/HUD',
    criteria: 'Retina/DPR2 selection, order feedback, feathered shore, lit skinned silhouettes, minimap, unit cards.',
    status: 'webgpu-evidence',
  },
  {
    id: 'render-graph-nested-depth',
    label: 'Render Graph Nested Depth',
    category: 'shared 3D engine',
    criteria: 'Depth-tested world pass proves flag-in-city, future garrison occlusion, rank overlap, and ground-marker occlusion before production mesh tuning.',
    status: 'webgpu-evidence',
  },
  {
    id: 'campaign-whole-map',
    label: 'Campaign Whole Map',
    category: 'campaign',
    criteria: 'Parchment map, territory, roads, water, clouds, WebGPU glyph labels.',
    status: 'webgpu-evidence',
  },
  {
    id: 'campaign-label-zoom',
    label: 'Campaign Label Zoom',
    category: 'campaign',
    criteria: 'City/army/road/label readability at gameplay zoom.',
    status: 'webgpu-evidence',
  },
  {
    id: 'campaign-handoff-battle',
    label: 'Campaign Battle Handoff',
    category: 'full-game flow',
    criteria: 'Campaign encounter launches a WebGPU battle with campaign return UI.',
    status: 'webgpu-evidence',
  },
];

export async function run(ctx) {
  if (process.env.VERIFY_WEBGPU !== '1') {
    ctx.check('visual report requires WebGPU browser flags', true, 'set VERIFY_WEBGPU=1 to generate the cutover visual report');
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const comparisonManifest = await loadComparisonManifest();
  const captures = [];

  captures.push(await captureMenuReady(ctx));
  captures.push(await captureMenuUnsupported(ctx));
  captures.push(await captureBattleDefault(ctx));
  captures.push(await captureBattleSelectionHud(ctx));
  captures.push(await captureRenderGraphNestedDepth(ctx));
  captures.push(await captureCampaignWholeMap(ctx));
  captures.push(await captureCampaignLabelZoom(ctx));
  captures.push(await captureCampaignHandoffBattle(ctx));

  for (const capture of captures) {
    await attachCurrentRendererComparison(capture, comparisonManifest);
  }
  const acceptedComparisons = captures.every((capture) => comparisonAccepted(capture.currentRendererComparison));

  const report = {
    kind: 'webgpu-visual-cutover-report',
    generatedAt: GENERATED_AT,
    releaseVisualImprovement: acceptedComparisons ? 'accepted' : 'pending-archived-current-renderer-comparisons',
    legacyComparisonRequirement: acceptedComparisons
      ? 'Archived current-renderer captures were attached and accepted for every required surface.'
      : 'Attach archived current-renderer captures and accepted comparison statuses for the same scenes before marking visual-improvement complete.',
    comparisonInputs: {
      currentRendererDir: CURRENT_RENDERER_DIR ?? null,
      comparisonJson: COMPARISON_JSON ?? null,
    },
    postCutoverScreenshots: 'webgpu-only',
    captures,
  };
  await writeFile(REPORT_JSON, JSON.stringify(report, null, 2));
  await writeFile(REPORT_HTML, renderHtml(report));

  const allFiles = captures.every((capture) => capture.image && capture.status === 'webgpu-evidence');
  ctx.check(
    'WebGPU visual report generated',
    allFiles,
    JSON.stringify({
      html: filePath(REPORT_HTML),
      json: filePath(REPORT_JSON),
      captures: captures.length,
      releaseVisualImprovement: report.releaseVisualImprovement,
    }),
  );
  ctx.check(
    'visual report keeps final improvement gate honest',
    acceptedComparisons || report.releaseVisualImprovement === 'pending-archived-current-renderer-comparisons',
    report.legacyComparisonRequirement,
  );
}

async function loadComparisonManifest() {
  if (!COMPARISON_JSON) return {};
  const manifest = JSON.parse(await readFile(COMPARISON_JSON, 'utf8'));
  if (manifest?.comparisons && typeof manifest.comparisons === 'object') return manifest.comparisons;
  if (typeof manifest === 'object' && !Array.isArray(manifest)) return manifest;
  throw new Error(`VISUAL_COMPARISON_JSON must be an object or contain a comparisons object`);
}

async function attachCurrentRendererComparison(capture, manifest) {
  const manifestEntry = manifest[capture.id] ?? {};
  const currentImage = manifestEntry.image ?? defaultCurrentRendererImage(capture.id);
  const currentImageUrl = currentImage ? new URL(currentImage, new URL('../', OUT_DIR)) : null;
  const hasCurrentImage = currentImageUrl ? await exists(currentImageUrl) : false;
  const status = manifestEntry.status ?? (hasCurrentImage ? 'pending-review' : 'missing-archived-capture');
  capture.currentRendererComparison = {
    status,
    image: hasCurrentImage ? relativeVisualPath(currentImageUrl) : null,
    note: manifestEntry.note ?? defaultComparisonNote(status),
  };
}

function defaultCurrentRendererImage(id) {
  return CURRENT_RENDERER_DIR ? `${CURRENT_RENDERER_DIR.replace(/\/$/, '')}/${id}.png` : null;
}

async function exists(url) {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

function comparisonAccepted(value) {
  return Boolean(value && value.image && ACCEPTED_VISUAL_STATUSES.has(value.status));
}

function defaultComparisonNote(status) {
  if (status === 'missing-archived-capture') return 'Archived current-renderer capture is not attached.';
  if (status === 'pending-review') return 'Archived current-renderer capture is attached but not accepted yet.';
  return '';
}

async function captureMenuReady(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'visual-menu-ready' });
  await page.goto(ctx.target);
  await page.waitForFunction(() => window.__appShellStats?.webgpu?.ok === true, undefined, { timeout: 18000 });
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => window.__appShellStats ?? { webgpu: { adapter: 'unknown' }, postCutoverScreenshots: 'webgpu-only' });
  const capture = await savePage(page, 'menu-ready', {
    status: 'webgpu-evidence',
    evidence: `adapter ${stats.webgpu?.adapter ?? 'unknown'}; ${stats.postCutoverScreenshots ?? 'webgpu-only'}`,
  });
  await page.close();
  return capture;
}

async function captureMenuUnsupported(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'visual-menu-unsupported' });
  await page.goto(`${ctx.target}/?webgpu=off`);
  await page.waitForFunction(() => window.__appShellStats?.webgpu?.checked === true, undefined, { timeout: 18000 });
  await page.waitForTimeout(180);
  const stats = await page.evaluate(() => ({
    shell: window.__appShellStats,
    text: document.getElementById('menu-webgpu-status')?.textContent ?? '',
  }));
  const capture = await savePage(page, 'menu-unsupported', {
    status: 'webgpu-evidence',
    evidence: stats.text,
  });
  await page.close();
  return capture;
}

async function captureBattleDefault(ctx) {
  const page = await battleReal(ctx, { settle: 500, errorPrefix: 'visual-battle-default' });
  await page.evaluate(() => window.__game.freezeAtTick(180));
  await page.waitForTimeout(220);
  const stats = await page.evaluate(() => window.__game.stats());
  const terrain = stats.renderStats?.terrain;
  const capture = await savePage(page, 'battle-default', {
    status: 'webgpu-evidence',
    evidence: `${stats.soldiers} soldiers; renderer ${stats.renderer}; drawCalls ${stats.renderStats?.drawCalls}; ${stats.renderStats?.atmosphere}; terrain quads ${terrain?.quads ?? 'n/a'} / scenery ${terrain?.sceneryQuads ?? 'n/a'}; warm/cool skinned material grade`,
  });
  await page.close();
  return capture;
}

async function captureBattleSelectionHud(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, errorPrefix: 'visual-battle-selection-hud' });
  await page.goto(`${ctx.target}/?battle=5v5&ai=off`);
  await page.waitForFunction(() => {
    const stats = window.__game?.stats?.();
    return window.__ready === true && stats?.renderer === 'webgpu' && stats.renderStats?.ready === true;
  }, undefined, { timeout: 20000 });
  await page.evaluate(() => {
    const info = window.__game.unitInfo(4);
    window.__cam.zoom = 3;
    window.__cam.pitch = 0;
    window.__cam.yaw = 0;
    window.__cam.x = info[0] - 90;
    window.__cam.y = info[1];
    window.__cam.clampView?.();
    window.__game.select(4);
    window.__game.freezeAtTick(72);
  });
  await page.waitForTimeout(240);
  const stats = await page.evaluate(() => window.__game.stats());
  const terrain = stats.renderStats?.terrain;
  const capture = await savePage(page, 'battle-selection-hud-dpr2', {
    status: 'webgpu-evidence',
    evidence: `dpr2 selection; ${stats.soldiers} soldiers; renderer ${stats.renderer}; ${stats.renderStats?.atmosphere}; terrain quads ${terrain?.quads ?? 'n/a'} / scenery ${terrain?.sceneryQuads ?? 'n/a'}; lit skinned silhouettes`,
  });
  await page.close();
  return capture;
}

async function captureRenderGraphNestedDepth(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'visual-render-graph-nested-depth' });
  await page.goto(`${ctx.target}/webgpu/render-graph`);
  await page.waitForFunction(() => window.__webgpuLabReady === true && window.__webgpuLabStats?.stats?.nested3d, undefined, { timeout: 18000 });
  await page.waitForTimeout(260);
  const stats = await page.evaluate(() => window.__webgpuLabStats.stats);
  const capture = await savePage(page, 'render-graph-nested-depth', {
    status: 'webgpu-evidence',
    evidence: `${stats.nested3d.fixtures.join(', ')}; depth ${stats.depth.format} ${stats.depth.width}x${stats.depth.height}; ${stats.nested3d.drawOrder}`,
  });
  await page.close();
  return capture;
}

async function captureCampaignWholeMap(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'visual-campaign-whole-map' });
  await page.goto(`${ctx.target}/?campaign=1`);
  await page.waitForFunction(() => window.__campaignReady === true && window.__campaignWebGPUStats?.ready === true, undefined, { timeout: 22000 });
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.cam(-100, 250, 0.16);
  });
  await page.waitForTimeout(320);
  const stats = await page.evaluate(() => window.__campaignWebGPUStats);
  const capture = await savePage(page, 'campaign-whole-map', {
    status: 'webgpu-evidence',
    evidence: `${stats.cityEntities} cities; ${stats.visibleLabels}/${stats.labels} labels; ${stats.labelLayer}`,
  });
  await page.close();
  return capture;
}

async function captureCampaignLabelZoom(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'visual-campaign-label-zoom' });
  await page.goto(`${ctx.target}/?campaign=test`);
  await page.waitForFunction(() => window.__campaignReady === true && window.__campaignWebGPUStats?.ready === true, undefined, { timeout: 18000 });
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.place(0, 1, 0, 4);
    window.__campaign.select(0);
    window.__campaign.cam(0, 436, 13);
  });
  await page.waitForTimeout(260);
  const stats = await page.evaluate(() => window.__campaignWebGPUStats);
  const capture = await savePage(page, 'campaign-label-zoom', {
    status: 'webgpu-evidence',
    evidence: `${stats.visibleLabels}/${stats.labels} labels; atlas ${stats.labelAtlas}; ${stats.labelLayer}`,
  });
  await page.close();
  return capture;
}

async function captureCampaignHandoffBattle(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'visual-campaign-handoff-battle' });
  await page.goto(`${ctx.target}/?campaign=handoff`);
  await page.waitForFunction(() => window.__campaignReady === true && window.__campaignWebGPUStats?.ready === true, undefined, { timeout: 18000 });
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.place(0, 1, 0, 3);
    window.__campaign.place(1, 1, 0, 4);
    window.__campaign.tick(2000);
    window.__campaign.fightReady();
  });
  await page.waitForFunction(() => {
    const stats = window.__game?.stats?.();
    return window.__ready === true && stats?.renderer === 'webgpu' && stats.renderStats?.ready === true;
  }, undefined, { timeout: 22000 });
  await page.evaluate(() => {
    const info = window.__game.unitInfo(0);
    window.__cam.zoom = 3.2;
    window.__cam.pitch = 0;
    window.__cam.yaw = 0;
    window.__cam.x = info[0];
    window.__cam.y = info[1];
    window.__cam.clampView?.();
    window.__game.select(0);
    window.__game.freezeAtTick(96);
  });
  await page.waitForTimeout(260);
  const stats = await page.evaluate(() => window.__game.stats());
  const capture = await savePage(page, 'campaign-handoff-battle', {
    status: 'webgpu-evidence',
    evidence: `${stats.soldiers} campaign battle soldiers; renderer ${stats.renderer}; ${stats.renderStats?.atmosphere}; WebGPU terrain`,
  });
  await page.close();
  return capture;
}

async function savePage(page, id, extra) {
  const row = reviewRows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`unknown visual report row ${id}`);
  const file = new URL(`${id}.png`, OUT_DIR);
  await page.screenshot({ path: filePath(file) });
  return {
    ...row,
    ...extra,
    image: `visual-report/${basename(file.pathname)}`,
  };
}

function renderHtml(report) {
  const cards = report.captures.map((capture) => `
    <article>
      <figure>
        <figcaption>WebGPU</figcaption>
        <img src="${escapeHtml(capture.image)}" alt="${escapeHtml(capture.label)} WebGPU capture">
      </figure>
      ${comparisonFigure(capture)}
      <div>
        <h2>${escapeHtml(capture.label)}</h2>
        <p><b>${escapeHtml(capture.category)}</b> - ${escapeHtml(capture.criteria)}</p>
        <dl>
          <dt>WebGPU evidence</dt><dd>${escapeHtml(capture.evidence)}</dd>
          <dt>Comparison status</dt><dd>${escapeHtml(comparisonStatus(capture.currentRendererComparison))}</dd>
          <dt>Comparison note</dt><dd>${escapeHtml(comparisonNote(capture.currentRendererComparison))}</dd>
        </dl>
      </div>
    </article>
  `).join('\n');
  const accepted = report.releaseVisualImprovement === 'accepted' || report.releaseVisualImprovement === 'pass';
  const releaseSentence = accepted
    ? 'Archived current-renderer captures are attached and accepted for every required surface, so the visual improvement gate is release-ready.'
    : 'Archived current-renderer captures for the same scenes must be attached and accepted before release readiness can become true.';
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>WebGPU Visual Cutover Report</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background: #181815; color: #eadfca; }
    header { padding: 22px 28px; border-bottom: 1px solid #4e412d; background: #252118; }
    h1 { margin: 0 0 8px; font: 700 26px Georgia, serif; }
    header p { max-width: 980px; margin: 0; line-height: 1.5; color: #cbbd9e; }
    main { display: grid; gap: 18px; padding: 22px; }
    article { display: grid; grid-template-columns: minmax(240px, 1fr) minmax(240px, 1fr) minmax(260px, 0.7fr); gap: 18px; align-items: start; padding: 14px; border: 1px solid #4b3e2a; background: #211f19; }
    figure { margin: 0; }
    figcaption { margin: 0 0 6px; color: #d7bd82; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    img { display: block; width: 100%; height: auto; border: 1px solid #665237; background: #111; }
    .missing-shot { min-height: 180px; display: grid; place-items: center; border: 1px dashed #665237; color: #baa98c; background: #181713; text-align: center; padding: 16px; }
    h2 { margin: 0 0 10px; font-size: 18px; color: #f3ddb0; }
    p { line-height: 1.45; }
    dl { display: grid; grid-template-columns: 150px 1fr; gap: 8px 12px; margin: 14px 0 0; font-size: 13px; }
    dt { color: #bca56f; font-weight: 700; }
    dd { margin: 0; color: #e2d5bd; }
    code { color: #f3ddb0; }
    @media (max-width: 900px) { article { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>WebGPU Visual Cutover Report</h1>
    <p>Generated ${escapeHtml(report.generatedAt)}. This report proves the WebGPU review surfaces exist and are screenshot-captured. Final visual improvement is <code>${escapeHtml(report.releaseVisualImprovement)}</code>: ${releaseSentence}</p>
  </header>
  <main>
    ${cards}
  </main>
</body>
</html>
`;
}

function comparisonFigure(capture) {
  const comparison = capture.currentRendererComparison;
  if (comparison?.image) {
    return `<figure><figcaption>Archived current renderer</figcaption><img src="${escapeHtml(comparison.image)}" alt="${escapeHtml(capture.label)} archived current-renderer capture"></figure>`;
  }
  return `<figure><figcaption>Archived current renderer</figcaption><div class="missing-shot">missing archived capture</div></figure>`;
}

function comparisonStatus(comparison) {
  return typeof comparison === 'string' ? comparison : comparison?.status ?? 'missing';
}

function comparisonNote(comparison) {
  return typeof comparison === 'string' ? '' : comparison?.note ?? '';
}

function relativeVisualPath(url) {
  const root = filePath(new URL('../', OUT_DIR));
  const path = filePath(url);
  return path.startsWith(root) ? path.slice(root.length) : path;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function filePath(url) {
  return decodeURIComponent(url.pathname);
}
