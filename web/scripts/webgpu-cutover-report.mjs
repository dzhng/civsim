import { access, mkdir, readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../../', import.meta.url);
const VIS_ROOT = new URL('specs/done/webgpu-skinned-crowd-foundation/visualizations/', ROOT);
const OUT_DIR = new URL('cutover/', VIS_ROOT);
const OUT_JSON = new URL('webgpu-cutover-report.json', OUT_DIR);
const OUT_HTML = new URL('../webgpu-cutover-report.html', OUT_DIR);
const VISUAL_JSON = new URL('visual-report/webgpu-visual-report.json', VIS_ROOT);
const PERF_JSON = new URL('performance/full-game-webgpu-performance.json', VIS_ROOT);
const SCENARIO_JSON = new URL('scenario-runs/webgpu-latest.json', VIS_ROOT);
const CAMPAIGN_SCENARIO_JSON = new URL('scenario-runs/webgpu-campaign-latest.json', VIS_ROOT);
const WEB_PACKAGE_JSON = new URL('../package.json', import.meta.url);
const WEB_PACKAGE_LOCK = new URL('../package-lock.json', import.meta.url);

const EXPECTED_SCENARIOS = [
  { id: 'menu-shell', file: 'menu-webgpu-shell.mjs', script: 'scenario:webgpu', detail: 'menu boot, unsupported WebGPU UX, duel, quick battle, campaign launch, and return-to-menu' },
  { id: 'menu-visual', file: 'menu-webgpu-shell-visual.mjs', script: 'scenario:webgpu', detail: 'menu ready, unsupported, and duel modal snapshots' },
  { id: 'battle-default', file: 'battle-webgpu-default.mjs', script: 'scenario:webgpu', detail: 'normal battle route defaults to raw WebGPU and retired gfx switches stay retired' },
  { id: 'battle-input', file: 'battle-webgpu-input.mjs', script: 'scenario:webgpu', detail: 'click, drag-box, right-click order, wheel zoom, DPR, and freeze semantics' },
  { id: 'campaign-production', file: 'campaign-webgpu-production.mjs', script: 'scenario:webgpu', detail: 'normal campaign route uses raw-WebGPU map, markers, labels, panels, and selection' },
  { id: 'campaign-handoff', file: 'campaign-webgpu-handoff.mjs', script: 'scenario:webgpu', detail: 'campaign to battle and back without changing campaign mechanics' },
  { id: 'campaign-save-load', file: 'campaign-webgpu-save-load.mjs', script: 'scenario:webgpu', detail: 'menu save slot round-trips into a loaded WebGPU campaign' },
  { id: 'campaign-visual', file: 'campaign-webgpu-visual.mjs', script: 'scenario:webgpu', detail: 'controlled campaign marker and panel snapshots through WebGPU' },
  { id: 'campaign-conquest', file: 'campaign-webgpu-conquest.mjs', script: 'scenario:webgpu:campaign', detail: 'real-map march to garrison battle, auto-resolve, and continued savable campaign' },
  { id: 'campaign-reinforcements', file: 'campaign-webgpu-reinforcements.mjs', script: 'scenario:webgpu:campaign', detail: 'nearby split stack joins battle and expanded army renders through WebGPU' },
  { id: 'visual-report', file: 'webgpu-visual-report.mjs', script: 'scenario:webgpu', detail: 'visual cutover contact sheet for menu, battle, campaign, and handoff surfaces' },
  { id: 'performance-report', file: 'full-game-webgpu-performance.mjs', script: 'scenario:webgpu', detail: 'full-game liveness performance report for menu, battle, campaign, and handoff' },
  { id: 'lab-cutover', file: 'webgpu-lab-routes.mjs', script: 'scenario:webgpu', detail: 'lab route contracts and cutover route stats stay covered' },
];

const RETIRED_FILES = [
  'web/src/battle/renderer.ts',
  'web/src/battle/renderer3d.ts',
  'web/src/battle/turntable.ts',
  'web/src/campaign/renderer.ts',
  'web/src/campaign/shaders.ts',
  'web/src/campaign/terrain3d.ts',
  'web/src/shared/glutil.ts',
  'web/bake/vat.mjs',
  'web/bake/vat.test.mjs',
  'web/bake/kit.example.json',
];

const REQUIRED_NEW_FILES = [
  'web/src/battle/rendererWebGPU.ts',
  'web/src/campaign/rendererWebGPU.ts',
  'web/src/battle/webgpuUiLayer.ts',
  'web/src/campaign/webgpuUiLayer.ts',
  'packages/webgpu-core/src/device.ts',
  'packages/webgpu-core/src/frameShell.ts',
  'packages/webgpu-core/src/skinnedPipeline.ts',
  'packages/crowd-runtime/src/animationState.ts',
  'packages/crowd-runtime/src/instanceData.ts',
  'packages/crowd-runtime/src/lod.ts',
  'packages/game-renderer/src/perfReport.ts',
  'packages/soldier-assets/bake/soldier-placeholders.mjs',
  'apps/webgpu-lab/src/router.ts',
  'web/webgpu-probe-lib.mjs',
];

async function main() {
  const pkg = await readJson(WEB_PACKAGE_JSON, 'web package');
  const scripts = pkg?.scripts ?? {};
  const checks = [];

  checks.push(...await scenarioChecks(scripts));
  checks.push(...await scenarioRunChecks());
  checks.push(...await rendererRetirementChecks(pkg));
  checks.push(...await artifactChecks());

  const visualGate = await visualImprovementCheck();
  const perfGate = await hardwarePerfCheck();
  checks.push(visualGate, perfGate);

  const releaseReady = checks.every((check) => check.status === 'complete');
  const report = {
    kind: 'webgpu-cutover-report',
    generatedAt: process.env.CUTOVER_REPORT_GENERATED_AT ?? 'scenario-generated',
    releaseReady,
    renderer: 'raw-webgpu-production-default',
    routineScreenshots: 'webgpu-only',
    removed: ['battle-2d-renderer', 'battle-babylon-renderer', 'campaign-webgl-renderer', '@babylonjs/core'],
    retainedDomDecision: 'dense menu, battle HUD, and campaign panels may remain DOM when layered and tested over WebGPU',
    retiredSwitches: ['?gfx=2d', '?gfx=3d', '?test=models', '?gfx=legacy'],
    visualReport: 'specs/done/webgpu-skinned-crowd-foundation/visualizations/webgpu-visual-report.html',
    perfReport: 'specs/done/webgpu-skinned-crowd-foundation/visualizations/webgpu-performance-report.html',
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
  const webgpu = EXPECTED_SCENARIOS
    .filter((scenario) => scenario.script === 'scenario:webgpu')
    .map((scenario) => scenario.file.replace(/\.mjs$/, ''));
  const campaign = EXPECTED_SCENARIOS
    .filter((scenario) => scenario.script === 'scenario:webgpu:campaign')
    .map((scenario) => scenario.file.replace(/\.mjs$/, ''));
  return [
    await scenarioRunCheck('scenario-run-webgpu', SCENARIO_JSON, webgpu),
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
    && report.webgpu === true
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
    const scriptOk = script.includes(scenario.metaName ?? scenario.file.replace(/\.mjs$/, ''));
    out.push({
      id: `parity-${scenario.id}`,
      status: fileOk && scriptOk ? 'complete' : 'fail',
      detail: `${scenario.detail}; scene file ${fileOk ? 'exists' : 'missing'} and ${scenario.script} ${scriptOk ? 'includes it' : 'does not include it'}`,
      evidence: { file: `web/scenes/${scenario.file}`, script: scenario.script },
    });
  }
  return out;
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
      id: 'webgpu-production-files',
      status: required.every((item) => item.present) ? 'complete' : 'fail',
      detail: 'raw-WebGPU production adapters, lab, packages, and probe helpers are present',
      evidence: required,
    },
    {
      id: 'release-script-wires-cutover',
      status: scripts['release:webgpu']?.includes('webgpu-cutover-report.mjs') ? 'complete' : 'fail',
      detail: 'release:webgpu regenerates the cutover report before auditing final gates',
      evidence: { script: scripts['release:webgpu'] ?? '' },
    },
  ];
}

async function artifactChecks() {
  const artifacts = [
    ['visual-report', 'specs/done/webgpu-skinned-crowd-foundation/visualizations/visual-report/webgpu-visual-report.json'],
    ['performance-report', 'specs/done/webgpu-skinned-crowd-foundation/visualizations/performance/full-game-webgpu-performance.json'],
    ['visual-manifest-template', 'specs/done/webgpu-skinned-crowd-foundation/visualizations/visual-comparison.manifest.example.json'],
    ['perf-baseline-template', 'specs/done/webgpu-skinned-crowd-foundation/visualizations/performance/current-renderer-baseline.example.json'],
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

async function visualImprovementCheck() {
  const report = await readJson(VISUAL_JSON, 'visual report', false);
  const captures = Array.isArray(report?.captures) ? report.captures : [];
  const accepted = (report?.releaseVisualImprovement === 'pass' || report?.releaseVisualImprovement === 'accepted')
    && captures.length > 0
    && captures.every((capture) => comparisonAccepted(capture.currentRendererComparison));
  return {
    id: 'visual-improvement',
    status: accepted ? 'complete' : 'pending',
    detail: accepted
      ? 'archived current-renderer comparisons are accepted for every required WebGPU visual surface'
      : 'waiting for accepted archived current-renderer visual comparisons',
    evidence: {
      report: relativePath(VISUAL_JSON),
      releaseVisualImprovement: report?.releaseVisualImprovement ?? 'missing',
      captures: captures.map((capture) => ({ id: capture.id, comparison: capture.currentRendererComparison?.status ?? capture.currentRendererComparison ?? 'missing' })),
    },
  };
}

async function hardwarePerfCheck() {
  const report = await readJson(PERF_JSON, 'performance report', false);
  const accepted = report?.mode === 'hardware-report'
    && report?.hardwareReleaseStatus === 'pass'
    && report?.releaseBudget === 'pass'
    && report?.currentRendererComparison?.status === 'webgpu-equal-or-better';
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

function comparisonAccepted(value) {
  if (typeof value === 'string') return ['webgpu-better', 'equal-or-better', 'accepted-exception', 'pass', 'accepted'].includes(value);
  return ['webgpu-better', 'equal-or-better', 'accepted-exception', 'pass', 'accepted'].includes(value?.status);
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
  <title>WebGPU Cutover Report</title>
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
    <h1>WebGPU Cutover Report</h1>
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
