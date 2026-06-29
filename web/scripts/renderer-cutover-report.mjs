import { access, mkdir, readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../../', import.meta.url);
const REPORT_ROOT = new URL('web/reports/rendering/', ROOT);
const SHOTS_ROOT = new URL('web/shots/', ROOT);
const OUT_DIR = new URL('cutover/', REPORT_ROOT);
const OUT_JSON = new URL('renderer-cutover-report.json', OUT_DIR);
const OUT_HTML = new URL('../renderer-cutover-report.html', OUT_DIR);
const PERF_JSON = new URL('performance/full-game-rendering-performance.json', REPORT_ROOT);
const SCENARIO_JSON = new URL('scenario-runs/renderer-latest.json', REPORT_ROOT);
const CAMPAIGN_SCENARIO_JSON = new URL('scenario-runs/renderer-campaign-latest.json', REPORT_ROOT);
const WEB_PACKAGE_JSON = new URL('../package.json', import.meta.url);
const WEB_PACKAGE_LOCK = new URL('../package-lock.json', import.meta.url);

const EXPECTED_SCENARIOS = [
  { id: 'menu-shell', file: 'ui/menu-renderer-shell.mjs', script: 'scenario:renderer', detail: 'menu boot, unsupported WebGPU UX, duel, quick battle, campaign launch, and return-to-menu' },
  { id: 'menu-visual', file: 'ui/menu-renderer-shell-visual.mjs', script: 'scenario:renderer', detail: 'menu ready, unsupported, and duel modal snapshots' },
  { id: 'battle-default', file: 'battle/battle-renderer-default.mjs', script: 'scenario:renderer', detail: 'normal battle route defaults to raw WebGPU and retired gfx switches stay retired' },
  { id: 'battle-input', file: 'battle/battle-input.mjs', script: 'scenario:renderer', detail: 'click, drag-box, right-click order, wheel zoom, DPR, and freeze semantics' },
  { id: 'campaign-production', file: 'campaign/campaign-production.mjs', script: 'scenario:renderer', detail: 'normal campaign route uses raw-WebGPU map, markers, labels, panels, and selection' },
  { id: 'campaign-handoff', file: 'campaign/campaign-handoff.mjs', script: 'scenario:renderer', detail: 'campaign to battle and back without changing campaign mechanics' },
  { id: 'campaign-save-load', file: 'campaign/campaign-save-load.mjs', script: 'scenario:renderer', detail: 'menu save slot round-trips into a loaded WebGPU campaign' },
  { id: 'campaign-visual', file: 'campaign/campaign-visual.mjs', script: 'scenario:renderer', detail: 'controlled campaign marker and panel snapshots through WebGPU' },
  { id: 'campaign-conquest', file: 'campaign/campaign-conquest.mjs', script: 'scenario:renderer:campaign', detail: 'real-map march to garrison battle, auto-resolve, and continued savable campaign' },
  { id: 'campaign-reinforcements', file: 'campaign/campaign-reinforcements.mjs', script: 'scenario:renderer:campaign', detail: 'nearby split stack joins battle and expanded army renders through WebGPU' },
  { id: 'campaign-models', file: 'models/campaign-models.mjs', script: 'scenario:renderer', detail: 'campaign model, prop, terrain, road, water, fog, and label shots under web/shots/models/campaign' },
  { id: 'performance-report', file: 'system/full-game-rendering-performance.mjs', script: 'scenario:renderer', detail: 'full-game liveness performance report for menu, battle, campaign, and handoff' },
  { id: 'lab-cutover', file: 'system/renderer-lab-routes.mjs', script: 'scenario:renderer', detail: 'lab route contracts and cutover route stats stay covered' },
];

// The raw-WebGPU production renderers deliberately reuse the canonical
// web/src/battle/renderer.ts and web/src/campaign/renderer.ts paths (asserted
// present by REQUIRED_NEW_FILES). Only the WebGL2/Babylon-era files that the new
// architecture actually deletes belong here — listing the reused paths would make
// this gate require a file to be both absent and present.
const RETIRED_FILES = [
  'web/src/battle/renderer3d.ts',
  'web/src/battle/turntable.ts',
  'web/src/campaign/shaders.ts',
  'web/src/campaign/terrain3d.ts',
  'web/src/shared/glutil.ts',
  'web/bake/vat.mjs',
  'web/bake/vat.test.mjs',
  'web/bake/kit.example.json',
];

const REQUIRED_NEW_FILES = [
  'web/src/battle/renderer.ts',
  'web/src/campaign/renderer.ts',
  'web/src/battle/uiLayer.ts',
  'web/src/campaign/uiLayer.ts',
  'packages/renderer-core/src/device.ts',
  'packages/renderer-core/src/frameShell.ts',
  'packages/renderer-core/src/skinnedPipeline.ts',
  'packages/crowd-runtime/src/animationState.ts',
  'packages/crowd-runtime/src/instanceData.ts',
  'packages/crowd-runtime/src/lod.ts',
  'packages/game-renderer/src/perfReport.ts',
  'packages/soldier-assets/bake/soldier-placeholders.mjs',
  'apps/renderer-lab/src/router.ts',
  'web/renderer-probe-lib.mjs',
];
const REQUIRED_RELEASE_SHOTS = [
  'ui/menu-renderer-ready.png',
  'ui/menu-renderer-unsupported.png',
  'battle/battle-selection-dpr2.png',
  'battle/battle-minimap-world-dpr2.png',
  'campaign/campaign-lod-whole-natural.png',
  'campaign/campaign-lod-rome-close.png',
  'models/campaign/entities/city.png',
  'models/campaign/entities/army.png',
  'models/campaign/props/trees.png',
  'models/campaign/props/mountain.png',
  'models/campaign/props/rocks.png',
  'models/campaign/terrain/terrain-grass-scrub.png',
  'models/campaign/terrain/shoreline-water.png',
  'models/shared/soldiers/ingame/00-heavy-sword.png',
  'models/shared/soldiers/anim/00-heavy-sword-walk.gif',
];

async function main() {
  const pkg = await readJson(WEB_PACKAGE_JSON, 'web package');
  const scripts = pkg?.scripts ?? {};
  const checks = [];

  checks.push(...await scenarioChecks(scripts));
  checks.push(...await scenarioRunChecks());
  checks.push(...await rendererRetirementChecks(pkg));
  checks.push(...await artifactChecks());

  const visualGate = await releaseShotCoverageCheck();
  const perfGate = await hardwarePerfCheck();
  checks.push(visualGate, perfGate);

  const releaseReady = checks.every((check) => check.status === 'complete');
  const report = {
    kind: 'renderer-cutover-report',
    generatedAt: process.env.CUTOVER_REPORT_GENERATED_AT ?? 'scenario-generated',
    releaseReady,
    renderer: 'raw-gpu-production-default',
    routineScreenshots: 'renderer-only',
    removed: ['battle-2d-renderer', 'battle-babylon-renderer', 'campaign-webgl-renderer', '@babylonjs/core'],
    retainedDomDecision: 'dense menu, battle HUD, and campaign panels may remain DOM when layered and tested over WebGPU',
    retiredSwitches: ['?gfx=2d', '?gfx=3d', '?test=models', '?gfx=legacy'],
    visualShots: 'web/shots/',
    perfReport: 'web/reports/rendering/rendering-performance-report.html',
    checks,
    blockers: checks.filter((check) => check.status !== 'complete').map((check) => check.id),
    localFailures: checks.filter((check) => check.status === 'fail').map((check) => check.id),
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_JSON, JSON.stringify(report, null, 2));
  await writeFile(OUT_HTML, renderHtml(report));

  for (const check of checks) {
    console.log(`${check.status.toUpperCase()} ${check.id}: ${check.detail}`);
  }
  console.log(`\nreleaseReady=${releaseReady}`);
  console.log(`cutover=${relativePath(OUT_HTML)}`);

  if (report.localFailures.length > 0) process.exitCode = 1;
}

async function scenarioRunChecks() {
  const gpu = EXPECTED_SCENARIOS
    .filter((scenario) => scenario.script === 'scenario:renderer')
    .map((scenario) => scenarioName(scenario));
  const campaign = EXPECTED_SCENARIOS
    .filter((scenario) => scenario.script === 'scenario:renderer:campaign')
    .map((scenario) => scenarioName(scenario));
  return [
    await scenarioRunCheck('scenario-run-renderer', SCENARIO_JSON, gpu),
    await scenarioRunCheck('scenario-run-campaign', CAMPAIGN_SCENARIO_JSON, campaign),
  ];
}

async function scenarioRunCheck(id, url, requiredNames) {
  const report = await readJson(url, id, false);
  if (!report) {
    return {
      id,
      status: 'pending',
      detail: `${relativePath(url)} is missing; run the matching WebGPU scenario script before release audit`,
      evidence: { report: relativePath(url), requiredNames },
    };
  }
  const names = new Set((Array.isArray(report.scenarios) ? report.scenarios : []).map((scenario) => scenario.name));
  const missing = requiredNames.filter((name) => !names.has(name));
  const ok = report.kind === 'scenario-run-report'
    && report.status === 'pass'
    && report.gpu === true
    && report.exitCode === 0
    && missing.length === 0
    && (!Array.isArray(report.failures) || report.failures.length === 0)
    && (!Array.isArray(report.pageErrors) || report.pageErrors.length === 0);
  return {
    id,
    status: ok ? 'complete' : 'fail',
    detail: ok
      ? `${relativePath(url)} proves ${requiredNames.length} WebGPU scenarios passed`
      : `${relativePath(url)} is not a clean pass; missing=${missing.join(', ') || 'none'} status=${report.status ?? 'missing'}`,
    evidence: {
      report: relativePath(url),
      status: report.status ?? 'missing',
      generatedAt: report.generatedAt ?? 'missing',
      failures: report.failures ?? [],
      pageErrors: report.pageErrors ?? [],
      missing,
    },
  };
}

async function scenarioChecks(scripts) {
  const out = [];
  for (const scenario of EXPECTED_SCENARIOS) {
    const fileOk = await exists(new URL(`../scenes/${scenario.file}`, import.meta.url));
    const script = scripts[scenario.script] ?? '';
    const scriptOk = script.includes(scenario.metaName ?? scenarioName(scenario));
    out.push({
      id: `parity-${scenario.id}`,
      status: fileOk && scriptOk ? 'complete' : 'fail',
      detail: `${scenario.detail}; scene file ${fileOk ? 'exists' : 'missing'} and ${scenario.script} ${scriptOk ? 'includes it' : 'does not include it'}`,
      evidence: { file: `web/scenes/${scenario.file}`, script: scenario.script },
    });
  }
  return out;
}

function scenarioName(scenario) {
  return scenario.file.split('/').at(-1).replace(/\.mjs$/, '');
}

async function rendererRetirementChecks(pkg) {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const lockText = await readFile(WEB_PACKAGE_LOCK, 'utf8').catch(() => '');
  const retired = [];
  for (const file of RETIRED_FILES) {
    retired.push({ file, absent: !(await exists(new URL(file, ROOT))) });
  }
  const required = [];
  for (const file of REQUIRED_NEW_FILES) {
    required.push({ file, present: await exists(new URL(file, ROOT)) });
  }
  const scripts = pkg?.scripts ?? {};
  return [
    {
      id: 'retire-babylon-dependency',
      status: deps['@babylonjs/core'] ? 'fail' : 'complete',
      detail: '@babylonjs/core is absent from web package dependencies',
      evidence: { dependency: deps['@babylonjs/core'] ?? null },
    },
    {
      id: 'retire-babylon-lockfile',
      status: lockText.includes('@babylonjs/core') ? 'fail' : 'complete',
      detail: '@babylonjs/core is absent from web package-lock.json',
      evidence: { lockfile: 'web/package-lock.json' },
    },
    {
      id: 'retire-legacy-renderer-files',
      status: retired.every((item) => item.absent) ? 'complete' : 'fail',
      detail: 'legacy battle/campaign renderer and Babylon spike files are removed',
      evidence: retired,
    },
    {
      id: 'gpu-production-files',
      status: required.every((item) => item.present) ? 'complete' : 'fail',
      detail: 'raw-WebGPU production adapters, lab, packages, and probe helpers are present',
      evidence: required,
    },
    {
      id: 'release-script-wires-cutover',
      status: scripts['release:renderer']?.includes('renderer-cutover-report.mjs') ? 'complete' : 'fail',
      detail: 'release:renderer regenerates the cutover report before auditing final gates',
      evidence: { script: scripts['release:renderer'] ?? '' },
    },
  ];
}

async function artifactChecks() {
  const artifacts = [
    ['performance-report', 'web/reports/rendering/performance/full-game-rendering-performance.json'],
    ['perf-baseline-template', 'web/reports/rendering/performance/current-renderer-baseline.example.json'],
  ];
  const out = [];
  for (const [id, path] of artifacts) {
    out.push({
      id: `artifact-${id}`,
      status: await exists(new URL(path, ROOT)) ? 'complete' : 'fail',
      detail: `${path} exists`,
      evidence: { path },
    });
  }
  return out;
}

async function releaseShotCoverageCheck() {
  const shots = [];
  for (const shot of REQUIRED_RELEASE_SHOTS) {
    shots.push({ shot: `web/shots/${shot}`, present: await exists(new URL(shot, SHOTS_ROOT)) });
  }
  const missing = shots.filter((shot) => !shot.present).map((shot) => shot.shot);
  return {
    id: 'release-shot-coverage',
    status: missing.length === 0 ? 'complete' : 'pending',
    detail: missing.length === 0
      ? 'release-review visuals are committed under web/shots'
      : 'release-review visuals are missing from web/shots',
    evidence: {
      required: shots.length,
      missing,
      shots,
    },
  };
}

async function hardwarePerfCheck() {
  const report = await readJson(PERF_JSON, 'performance report', false);
  const accepted = report?.mode === 'hardware-report'
    && report?.hardwareReleaseStatus === 'pass'
    && report?.releaseBudget === 'pass'
    && report?.currentRendererComparison?.status === 'gpu-equal-or-better';
  return {
    id: 'hardware-perf',
    status: accepted ? 'complete' : 'pending',
    detail: accepted
      ? 'named real-hardware WebGPU performance is equal or better than the archived current-renderer baseline'
      : 'waiting for named real-hardware performance comparison',
    evidence: {
      report: relativePath(PERF_JSON),
      mode: report?.mode ?? 'missing',
      hardwareReleaseStatus: report?.hardwareReleaseStatus ?? 'missing',
      releaseBudget: report?.releaseBudget ?? 'missing',
      currentRendererComparison: report?.currentRendererComparison?.status ?? 'missing',
      gpu: report?.environment?.gpu ?? 'missing',
      browser: report?.environment?.browser ?? 'missing',
    },
  };
}

async function readJson(url, label, required = true) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch (error) {
    if (required) throw new Error(`cannot read ${label} at ${relativePath(url)}: ${error.message}`);
    return null;
  }
}

async function exists(url) {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

function renderHtml(report) {
  const grouped = groupByStatus(report.checks);
  const rows = report.checks.map((check) => `
    <tr class="${escapeHtml(check.status)}">
      <td>${escapeHtml(check.status)}</td>
      <td>${escapeHtml(check.id)}</td>
      <td>${escapeHtml(check.detail)}</td>
    </tr>
  `).join('\n');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Renderer Cutover Report</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background: #181815; color: #eadfca; }
    header { padding: 24px 28px; background: #252118; border-bottom: 1px solid #4e412d; }
    main { padding: 24px 28px; }
    h1 { margin: 0 0 8px; font: 700 26px Georgia, serif; }
    p { margin: 0 0 10px; color: #cbbd9e; }
    .summary { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0; }
    .pill { border: 1px solid #5e513a; background: #221f18; padding: 8px 10px; color: #f0dcaa; }
    table { width: 100%; border-collapse: collapse; background: #211f19; border: 1px solid #4b3e2a; }
    td, th { padding: 9px 10px; border-bottom: 1px solid #3f3424; text-align: left; font-size: 13px; }
    th { color: #d6bb7a; }
    tr.complete td:first-child { color: #8ddf92; }
    tr.pending td:first-child { color: #f1c36d; }
    tr.fail td:first-child { color: #f08d7e; }
    code { color: #f3ddb0; }
  </style>
</head>
<body>
  <header>
    <h1>Renderer Cutover Report</h1>
    <p>Status <code>${escapeHtml(report.releaseReady ? 'ready' : 'blocked')}</code>. Generated ${escapeHtml(report.generatedAt)}.</p>
    <p>Renderer <code>${escapeHtml(report.renderer)}</code>; routine screenshots <code>${escapeHtml(report.routineScreenshots)}</code>.</p>
  </header>
  <main>
    <div class="summary">
      <div class="pill">complete ${grouped.complete}</div>
      <div class="pill">pending ${grouped.pending}</div>
      <div class="pill">fail ${grouped.fail}</div>
      <div class="pill">blockers ${escapeHtml(report.blockers.join(', ') || 'none')}</div>
    </div>
    <table>
      <tr><th>status</th><th>check</th><th>detail</th></tr>
      ${rows}
    </table>
  </main>
</body>
</html>
`;
}

function groupByStatus(checks) {
  return checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] ?? 0) + 1;
    return acc;
  }, { complete: 0, pending: 0, fail: 0 });
}

function relativePath(url) {
  return decodeURIComponent(url.pathname).replace(`${decodeURIComponent(ROOT.pathname)}`, '');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
