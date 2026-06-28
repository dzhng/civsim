import { access, mkdir, readFile, writeFile } from 'node:fs/promises';

const VIS_ROOT = new URL('../../specs/done/webgpu-skinned-crowd-foundation/visualizations/', import.meta.url);
const CUTOVER_JSON = new URL('cutover/webgpu-cutover-report.json', VIS_ROOT);
const VISUAL_JSON = new URL('visual-report/webgpu-visual-report.json', VIS_ROOT);
const PERF_JSON = new URL('performance/full-game-webgpu-performance.json', VIS_ROOT);
const OUT_DIR = new URL('release-audit/', VIS_ROOT);
const OUT_JSON = new URL('webgpu-release-audit.json', OUT_DIR);
const OUT_HTML = new URL('../webgpu-release-audit.html', OUT_DIR);

const EXPECTED_VISUAL_CAPTURES = [
  'menu-ready',
  'menu-unsupported',
  'battle-default',
  'battle-selection-hud-dpr2',
  'campaign-whole-map',
  'campaign-label-zoom',
  'campaign-handoff-battle',
];

const EXPECTED_PERF_SCENES = [
  'menu',
  'battle-max-crowd',
  'campaign-whole-map',
  'campaign-battle-handoff',
];

const EXPECTED_CUTOVER_COMPLETE = [
  'parity-menu-shell',
  'parity-menu-visual',
  'parity-battle-default',
  'parity-battle-input',
  'parity-campaign-production',
  'parity-campaign-handoff',
  'parity-campaign-save-load',
  'parity-campaign-visual',
  'parity-campaign-conquest',
  'parity-campaign-reinforcements',
  'parity-visual-report',
  'parity-performance-report',
  'parity-lab-cutover',
  'scenario-run-webgpu',
  'scenario-run-campaign',
  'retire-babylon-dependency',
  'retire-babylon-lockfile',
  'retire-legacy-renderer-files',
  'webgpu-production-files',
  'release-script-wires-cutover',
  'artifact-visual-report',
  'artifact-performance-report',
  'artifact-visual-manifest-template',
  'artifact-perf-baseline-template',
];

const checks = [];

async function main() {
  const cutover = await readJson(CUTOVER_JSON, 'cutover report');
  const visual = await readJson(VISUAL_JSON, 'visual report');
  const perf = await readJson(PERF_JSON, 'performance report');

  auditCutover(cutover);
  await auditVisual(visual);
  auditPerf(perf);

  const releaseReady = checks.every((check) => check.ok);
  const audit = {
    kind: 'webgpu-release-audit',
    generatedAt: process.env.RELEASE_AUDIT_GENERATED_AT ?? 'scenario-generated',
    releaseReady,
    summary: releaseReady ? 'ready' : 'blocked',
    blockers: checks.filter((check) => !check.ok).map((check) => check.id),
    inputs: {
      cutoverReport: relativePath(CUTOVER_JSON),
      visualReport: relativePath(VISUAL_JSON),
      performanceReport: relativePath(PERF_JSON),
    },
    checks,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_JSON, JSON.stringify(audit, null, 2));
  await writeFile(OUT_HTML, renderHtml(audit));

  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.id}: ${check.detail}`);
  }
  console.log(`\nreleaseReady=${releaseReady}`);
  console.log(`audit=${relativePath(OUT_HTML)}`);

  if (!releaseReady) process.exitCode = 1;
}

function auditCutover(report) {
  check(report?.kind === 'webgpu-cutover-report', 'cutover-report-kind', 'cutover report exists');
  check(report?.renderer === 'raw-webgpu-production-default', 'cutover-renderer-default', `renderer is ${report?.renderer ?? 'missing'}`);
  check(report?.routineScreenshots === 'webgpu-only', 'cutover-webgpu-only-screenshots', `routine screenshots are ${report?.routineScreenshots ?? 'missing'}`);
  check(Array.isArray(report?.localFailures) && report.localFailures.length === 0, 'cutover-no-local-failures', `local cutover failures: ${(report?.localFailures ?? []).join(', ') || 'none'}`);
  check(report?.retiredSwitches?.includes('?gfx=2d') && report.retiredSwitches.includes('?gfx=3d') && report.retiredSwitches.includes('?gfx=legacy'), 'cutover-retired-switches', 'legacy route switches remain retired');
  check(report?.removed?.includes('@babylonjs/core'), 'cutover-babylon-removed', '@babylonjs/core is listed as removed');

  const byId = new Map((Array.isArray(report?.checks) ? report.checks : []).map((item) => [item.id, item]));
  for (const id of EXPECTED_CUTOVER_COMPLETE) {
    const item = byId.get(id);
    check(item?.status === 'complete', `cutover-${id}`, item?.detail ?? `${id} missing from cutover report`);
  }

  check(
    report?.releaseReady === true,
    'cutover-release-ready',
    `cutover releaseReady=${report?.releaseReady ?? 'missing'} blockers=${(report?.blockers ?? []).join(', ') || 'none'}`,
  );
}

async function auditVisual(report) {
  check(report?.kind === 'webgpu-visual-cutover-report', 'visual-report-kind', 'visual cutover report exists');
  check(report?.postCutoverScreenshots === 'webgpu-only', 'visual-webgpu-only', 'routine screenshots are WebGPU-only');
  check(
    report?.releaseVisualImprovement === 'pass' || report?.releaseVisualImprovement === 'accepted',
    'visual-improvement-accepted',
    `visual improvement status is ${report?.releaseVisualImprovement ?? 'missing'}`,
  );

  const captures = Array.isArray(report?.captures) ? report.captures : [];
  const ids = new Set(captures.map((capture) => capture.id));
  for (const id of EXPECTED_VISUAL_CAPTURES) {
    check(ids.has(id), `visual-capture-${id}`, `required visual capture ${id}`);
  }
  for (const capture of captures) {
    check(capture.status === 'webgpu-evidence', `visual-${capture.id}-webgpu`, `${capture.id} has WebGPU evidence`);
    check(comparisonAccepted(capture.currentRendererComparison), `visual-${capture.id}-comparison`, `${capture.id} current-renderer comparison accepted`);
    if (capture.image) {
      check(await exists(new URL(capture.image, VIS_ROOT)), `visual-${capture.id}-image`, `${capture.image} exists`);
    } else {
      check(false, `visual-${capture.id}-image`, `${capture.id} image path is missing`);
    }
  }
}

function auditPerf(report) {
  check(report?.kind === 'webgpu-full-game-perf', 'perf-report-kind', 'full-game performance report exists');
  check(report?.hardwareReleaseStatus === 'pass', 'perf-hardware-pass', `hardware release status is ${report?.hardwareReleaseStatus ?? 'missing'}`);
  check(report?.releaseBudget === 'pass', 'perf-budget-pass', `release budget is ${report?.releaseBudget ?? 'missing'}`);
  check(report?.mode === 'hardware-report', 'perf-hardware-mode', `performance report mode is ${report?.mode ?? 'missing'}`);
  check(
    report?.currentRendererComparison?.status === 'webgpu-equal-or-better',
    'perf-current-comparison',
    `current-renderer comparison is ${report?.currentRendererComparison?.status ?? 'missing'}`,
  );

  const scenes = Array.isArray(report?.scenes) ? report.scenes : [];
  const ids = new Set(scenes.map((scene) => scene.id));
  for (const id of EXPECTED_PERF_SCENES) {
    const scene = scenes.find((candidate) => candidate.id === id);
    check(ids.has(id), `perf-scene-${id}`, `required performance scene ${id}`);
    check(Number.isFinite(scene?.frame?.medianMs) && scene.frame.medianMs > 0, `perf-${id}-median`, `${id} median frame time recorded`);
    check(Number.isFinite(scene?.frame?.p95Ms) && scene.frame.p95Ms > 0, `perf-${id}-p95`, `${id} p95 frame time recorded`);
    check(Number.isFinite(scene?.startupMs) && scene.startupMs > 0, `perf-${id}-startup`, `${id} startup/loading time recorded`);
    check(Number.isFinite(scene?.memory?.usedMB) && scene.memory.usedMB > 0, `perf-${id}-memory`, `${id} heap usage recorded`);
    if (id !== 'menu') {
      check(Number.isFinite(scene?.performance?.uploadMs), `perf-${id}-upload`, `${id} upload timing recorded`);
      check(Number.isFinite(scene?.performance?.frameCpuMs), `perf-${id}-cpu-frame`, `${id} renderer CPU frame timing recorded`);
    }
  }
}

function comparisonAccepted(value) {
  if (value && typeof value === 'object') {
    return Boolean(value.image) && ['webgpu-better', 'equal-or-better', 'accepted-exception', 'pass', 'accepted'].includes(value.status);
  }
  return false;
}

async function readJson(url, label) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch (error) {
    check(false, `${label.replaceAll(' ', '-')}-read`, `cannot read ${relativePath(url)}: ${error.message}`);
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

function check(ok, id, detail) {
  checks.push({ id, ok: Boolean(ok), detail });
}

function renderHtml(audit) {
  const rows = audit.checks.map((check) => `
    <tr class="${check.ok ? 'pass' : 'fail'}">
      <td>${escapeHtml(check.ok ? 'PASS' : 'FAIL')}</td>
      <td>${escapeHtml(check.id)}</td>
      <td>${escapeHtml(check.detail)}</td>
    </tr>
  `).join('\n');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>WebGPU Release Audit</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background: #181815; color: #eadfca; }
    header { padding: 24px 28px; background: #252118; border-bottom: 1px solid #4e412d; }
    main { padding: 24px 28px; }
    h1 { margin: 0 0 8px; font: 700 26px Georgia, serif; }
    p { margin: 0; color: #cbbd9e; }
    table { width: 100%; border-collapse: collapse; background: #211f19; border: 1px solid #4b3e2a; }
    td, th { padding: 9px 10px; border-bottom: 1px solid #3f3424; text-align: left; font-size: 13px; }
    th { color: #d6bb7a; }
    tr.pass td:first-child { color: #8ddf92; }
    tr.fail td:first-child { color: #f08d7e; }
    code { color: #f3ddb0; }
  </style>
</head>
<body>
  <header>
    <h1>WebGPU Release Audit</h1>
    <p>Status <code>${escapeHtml(audit.summary)}</code>. Generated ${escapeHtml(audit.generatedAt)} from ${escapeHtml(audit.inputs.cutoverReport)}, ${escapeHtml(audit.inputs.visualReport)}, and ${escapeHtml(audit.inputs.performanceReport)}.</p>
  </header>
  <main>
    <table>
      <tr><th>status</th><th>check</th><th>detail</th></tr>
      ${rows}
    </table>
  </main>
</body>
</html>
`;
}

function relativePath(url) {
  return decodeURIComponent(url.pathname).replace(`${process.cwd().replace(/\/web$/, '')}/`, '');
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
