import { mkdir, writeFile } from 'node:fs/promises';

export const meta = {
  name: 'webgpu-soldier-gates',
  kind: 'visual',
  world: 'webgpu-soldier-gates',
  tier: 'full',
  snapshots: [],
  describe: 'Captures addressable WebGPU soldier class, in-game readability, and animation still gates.',
};

const OUT_DIR = new URL('../../../specs/done/webgpu-skinned-crowd-foundation/visualizations/soldier-gates/', import.meta.url);
const REPORT_JSON = new URL('webgpu-soldier-gates.json', OUT_DIR);
const REPORT_HTML = new URL('webgpu-soldier-gates.html', OUT_DIR);
const GENERATED_AT = process.env.SOLDIER_GATES_GENERATED_AT ?? 'scenario-generated';

const classNames = [
  'heavy-sword',
  'light-spear',
  'longsword',
  'phalanx',
  'archers',
  'skirmishers',
  'shock-cav',
  'horse-archers',
  'artillery',
  'peasant',
  'light-sword',
  'heavy-spear',
  'medium-infantry',
  'medium-spear',
  'medium-phalanx',
];

const animationRefs = [
  [0, 'heavy-sword', 'attack', 'attack_a', 0.52],
  [0, 'heavy-sword', 'die', 'death_a', 0.82],
  [0, 'heavy-sword', 'hit', 'hit_a', 0.50],
  [0, 'heavy-sword', 'run', 'run', 0.32],
  [0, 'heavy-sword', 'walk', 'march', 0.32],
  [3, 'phalanx', 'attack', 'attack_a', 0.52],
  [3, 'phalanx', 'die', 'death_a', 0.82],
  [3, 'phalanx', 'hit', 'hit_a', 0.50],
  [3, 'phalanx', 'run', 'run', 0.32],
  [3, 'phalanx', 'walk', 'march', 0.32],
  [4, 'archers', 'attack', 'attack_a', 0.52],
  [4, 'archers', 'die', 'death_a', 0.82],
  [4, 'archers', 'hit', 'hit_a', 0.50],
  [4, 'archers', 'run', 'run', 0.32],
  [4, 'archers', 'walk', 'march', 0.32],
  [6, 'shock-cav', 'attack', 'attack_a', 0.52],
  [6, 'shock-cav', 'die', 'death_a', 0.82],
  [6, 'shock-cav', 'hit', 'hit_a', 0.50],
  [6, 'shock-cav', 'run', 'run', 0.32],
  [6, 'shock-cav', 'walk', 'march', 0.32],
];

export async function run(ctx) {
  if (process.env.VERIFY_WEBGPU !== '1') {
    ctx.check('soldier gates require WebGPU browser flags', true, 'set VERIFY_WEBGPU=1 to capture WebGPU soldier gates');
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const captures = [];
  for (let classId = 0; classId < classNames.length; classId++) {
    captures.push(await captureSoldier(ctx, turntableGate(classId)));
  }
  for (let classId = 0; classId < classNames.length; classId++) {
    captures.push(await captureSoldier(ctx, inGameGate(classId)));
  }
  for (const ref of animationRefs) {
    captures.push(await captureSoldier(ctx, animationGate(...ref)));
  }

  const report = {
    kind: 'webgpu-soldier-gate-report',
    generatedAt: GENERATED_AT,
    note: 'These are addressable WebGPU soldier/model review captures. They prove coverage and expose remaining parity gaps; whole-scene parity still requires comparison against archived current-renderer evidence.',
    captures,
  };
  await writeFile(REPORT_JSON, JSON.stringify(report, null, 2));
  await writeFile(REPORT_HTML, renderHtml(report).replace(/[ \t]+$/gm, ''));
  ctx.check(
    'WebGPU soldier gate report generated',
    captures.every((capture) => capture.image && capture.stats?.route === 'skinned-soldier' && capture.stats.meshVariants >= classNames.length),
    JSON.stringify({ html: filePath(REPORT_HTML), json: filePath(REPORT_JSON), captures: captures.length }),
  );
}

function turntableGate(classId) {
  const name = classNames[classId];
  return {
    id: `turntable-${String(classId).padStart(2, '0')}-${name}`,
    classId,
    label: `Turntable ${name}`,
    group: 'turntable',
    criteria: 'Hero angle model capture keeps old class silhouette cues: armor, helmet, shield, weapon, mount, faction accent, and deterministic pose.',
    params: { class: classId, clip: 'march', phase: 0.24, frame: 1, facing: 1.25, x: -4.2, y: 0.75, zoom: 78, pitch: 0.14, yaw: -0.22, size: 1.15 },
  };
}

function inGameGate(classId) {
  const name = classNames[classId];
  return {
    id: `ingame-${String(classId).padStart(2, '0')}-${name}`,
    classId,
    label: `In-game ${name}`,
    group: 'in-game',
    criteria: 'Battle-camera readability capture checks the same model at the production-like pitch and smaller scale.',
    params: { class: classId, clip: 'march', phase: 0.18, frame: 1, facing: 1.57, x: -4.2, y: 0.55, zoom: 54, pitch: 0.32, yaw: -0.08, size: 1.0 },
  };
}

function animationGate(classId, className, animName, clip, phase) {
  return {
    id: `anim-${String(classId).padStart(2, '0')}-${className}-${animName}`,
    classId,
    label: `Animation ${className} ${animName}`,
    group: 'animation-still',
    criteria: 'Deterministic still sample for the legacy GIF inventory; GIF review should be regenerated from the same frozen phases.',
    params: { class: classId, clip, phase, frame: frameForClip(clip), facing: 1.35, x: -4.2, y: 0.75, zoom: 78, pitch: 0.15, yaw: -0.18, size: classId === 6 ? 1.05 : 1.15 },
  };
}

async function captureSoldier(ctx, gate) {
  const page = await ctx.newPage({ viewport: { width: 900, height: 700 }, errorPrefix: `soldier-gate-${gate.id}` });
  const url = new URL(`${ctx.target}/webgpu/skinned-soldier`);
  for (const [key, value] of Object.entries(gate.params)) url.searchParams.set(key, String(value));
  await page.goto(url.href);
  await page.waitForFunction(
    (classId) => window.__webgpuLabReady === true && window.__webgpuLabStats?.stats?.classId === classId,
    gate.classId,
    { timeout: 18000 },
  );
  await page.waitForTimeout(120);
  const labStats = await page.evaluate(() => window.__webgpuLabStats ?? null);
  const stats = labStats?.stats ? { route: labStats.route, ...labStats.stats } : null;
  const image = new URL(`${gate.id}.png`, OUT_DIR);
  await page.locator('#webgpu-canvas').screenshot({ path: filePath(image) });
  await page.close();
  return {
    id: gate.id,
    label: gate.label,
    group: gate.group,
    criteria: gate.criteria,
    classId: gate.classId,
    image: basename(image),
    stats,
    status: stats?.meshVariants >= classNames.length ? 'webgpu-evidence' : 'missing-class-mesh-coverage',
  };
}

function frameForClip(clip) {
  if (clip === 'attack_a') return 3;
  if (clip === 'death_a') return 4;
  if (clip === 'hit_a') return 10;
  if (clip === 'run') return 8;
  return 1;
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
          <dt>Group</dt><dd>${escapeHtml(capture.group)}</dd>
          <dt>Class</dt><dd>${capture.classId}</dd>
          <dt>Renderer</dt><dd>${escapeHtml(rendererSummary(capture.stats))}</dd>
        </dl>
      </div>
    </article>
  `).join('\n');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>WebGPU Soldier Gates</title>
  <style>
    body { margin: 0; background: #171714; color: #eadfca; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
    header { padding: 22px 28px; border-bottom: 1px solid #4e412d; background: #242017; }
    h1 { margin: 0 0 8px; font: 700 26px Georgia, serif; color: #f1dfb1; }
    header p { margin: 0; max-width: 980px; color: #cbbd9e; line-height: 1.45; }
    main { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 18px; padding: 22px; }
    article { display: grid; gap: 12px; padding: 12px; background: #211f19; border: 1px solid #4b3e2a; }
    figure { margin: 0; }
    img { display: block; width: 100%; height: auto; border: 1px solid #665237; background: #111; }
    h2 { margin: 0 0 8px; color: #f3ddb0; font-size: 17px; }
    p { line-height: 1.45; }
    dl { display: grid; grid-template-columns: 78px 1fr; gap: 6px 10px; font-size: 13px; }
    dt { color: #bca56f; font-weight: 700; }
    dd { margin: 0; color: #e2d5bd; }
  </style>
</head>
<body>
  <header>
    <h1>WebGPU Soldier Gates</h1>
    <p>Generated ${escapeHtml(report.generatedAt)}. ${escapeHtml(report.note)}</p>
  </header>
  <main>${cards}</main>
</body>
</html>`;
}

function rendererSummary(stats) {
  if (!stats) return 'missing stats';
  return `${stats.instances ?? 0} instance, ${stats.drawCalls ?? 0} draw call(s), ${stats.meshVariants ?? 0} mesh variants, clip ${stats.clip ?? 'n/a'}, phase ${stats.phase ?? 'n/a'}`;
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
