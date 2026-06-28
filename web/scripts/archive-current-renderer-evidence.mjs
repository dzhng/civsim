import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { nearestIndependentCityFromRoma } from '../scenes/_campaign-map-helpers.mjs';

const TARGET = process.env.CURRENT_RENDERER_URL ?? 'http://127.0.0.1:5173';
const GENERATED_AT = process.env.CURRENT_RENDERER_ARCHIVE_GENERATED_AT ?? new Date().toISOString();
const VIS_ROOT = new URL('../../specs/webgpu-skinned-crowd/visualizations/', import.meta.url);
const OUT_DIR = new URL('current-renderer/', VIS_ROOT);
const MANIFEST_JSON = new URL('current-renderer/visual-comparison.manifest.pending.json', VIS_ROOT);
const PERF_JSON = new URL('performance/current-renderer-baseline.generated.json', VIS_ROOT);
const MAP_JSON = new URL('../public/data/campaign-map.json', import.meta.url);

const launchOptions = {};
if (process.env.CURRENT_RENDERER_HEADFUL === '1') launchOptions.headless = false;
if (process.env.CURRENT_RENDERER_BROWSER_CHANNEL) launchOptions.channel = process.env.CURRENT_RENDERER_BROWSER_CHANNEL;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(new URL('.', PERF_JSON), { recursive: true });

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await context.addInitScript(legacyRendererPerfShim);
  const captures = [];
  const scenes = [];
  let environment = null;
  try {
    captures.push(await captureMenuReady(context));
    captures.push(await captureMenuUnsupportedEquivalent(context));
    captures.push(await captureBattleDefault(context));
    captures.push(await captureBattleSelectionHud(context));
    captures.push(await captureCampaignWholeMap(context));
    captures.push(await captureCampaignLabelZoom(context));
    captures.push(await captureCampaignHandoffBattle(context));

    scenes.push(await measureMenu(context));
    scenes.push(await measureBattle(context));
    scenes.push(await measureCampaign(context));
    scenes.push(await measureHandoff(context));
    environment = await collectEnvironment(context);
  } finally {
    await context.close();
    await browser.close();
  }

  const manifest = {
    kind: 'current-renderer-visual-comparison-manifest',
    generatedAt: GENERATED_AT,
    source: TARGET,
    status: 'pending-review',
    instructions: 'Review each archived current-renderer image against the matching WebGPU visual-report image, then change each comparison status to webgpu-better, equal-or-better, accepted-exception, pass, or accepted only after human/agent visual review.',
    comparisons: Object.fromEntries(captures.map((capture) => [capture.id, {
      status: 'pending-review',
      image: `current-renderer/${capture.file}`,
      note: capture.note,
    }])),
  };
  await writeFile(MANIFEST_JSON, JSON.stringify(manifest, null, 2));

  const perf = {
    kind: 'current-renderer-full-game-perf',
    generatedAt: GENERATED_AT,
    source: TARGET,
    environment,
    scenes,
    notes: [
      'Generated from the archived current-renderer URL with a browser-side WebGL CPU instrumentation shim for upload/draw timing.',
      'Use this file as PERF_CURRENT_RENDERER_JSON only with matching real-hardware WebGPU evidence from the same browser, GPU, viewport, and DPR.',
    ],
  };
  await writeFile(PERF_JSON, JSON.stringify(perf, null, 2));

  console.log(`visualArchive=${relativePath(OUT_DIR)}`);
  console.log(`visualManifest=${relativePath(MANIFEST_JSON)}`);
  console.log(`perfBaseline=${relativePath(PERF_JSON)}`);
}

async function captureMenuReady(context) {
  const page = await newPage(context);
  await page.goto(TARGET);
  await waitForMenu(page);
  await page.waitForTimeout(200);
  await savePage(page, 'menu-ready');
  await page.close();
  return { id: 'menu-ready', file: 'menu-ready.png', note: 'Archived current-renderer menu shell before WebGPU capability gating.' };
}

async function captureMenuUnsupportedEquivalent(context) {
  const page = await newPage(context);
  await page.goto(TARGET);
  await waitForMenu(page);
  await page.waitForTimeout(200);
  await savePage(page, 'menu-unsupported');
  await page.close();
  return { id: 'menu-unsupported', file: 'menu-unsupported.png', note: 'The current renderer had no unsupported-WebGPU state; this image archives the closest legacy menu surface for exception review.' };
}

async function captureBattleDefault(context) {
  const page = await newPage(context);
  await gotoBattle(page, `${TARGET}/?map=A&ai=off`);
  await page.evaluate(() => window.__game.freezeAtTick(180));
  await page.waitForTimeout(260);
  await savePage(page, 'battle-default');
  await page.close();
  return { id: 'battle-default', file: 'battle-default.png', note: 'Archived current-renderer max-crowd battle surface at frozen tick 180.' };
}

async function captureBattleSelectionHud(context) {
  const scoped = await context.browser().newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await newPage(scoped);
  try {
    await gotoBattle(page, `${TARGET}/?battle=5v5&ai=off`);
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
    await page.waitForTimeout(280);
    await savePage(page, 'battle-selection-hud-dpr2');
  } finally {
    await scoped.close();
  }
  return { id: 'battle-selection-hud-dpr2', file: 'battle-selection-hud-dpr2.png', note: 'Archived current-renderer DPR2 selection, HUD, minimap, and unit-card surface.' };
}

async function captureCampaignWholeMap(context) {
  const page = await gotoCampaignFromMenu(context);
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.cam(-100, 250, 0.16);
  });
  await page.waitForTimeout(360);
  await savePage(page, 'campaign-whole-map');
  await page.close();
  return { id: 'campaign-whole-map', file: 'campaign-whole-map.png', note: 'Archived current-renderer whole campaign map with roads, labels, territory, and water.' };
}

async function captureCampaignLabelZoom(context) {
  const page = await newPage(context);
  await page.goto(`${TARGET}/?campaign=test`);
  await waitForCampaign(page);
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.place(0, 1, 0, 4);
    window.__campaign.cam(0, 450, 6);
  });
  await page.waitForTimeout(320);
  await savePage(page, 'campaign-label-zoom');
  await page.close();
  return { id: 'campaign-label-zoom', file: 'campaign-label-zoom.png', note: 'Archived current-renderer controlled campaign zoom with city, army, road, and label readability.' };
}

async function captureCampaignHandoffBattle(context) {
  const page = await gotoCampaignBattle(context);
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
  await page.waitForTimeout(300);
  await savePage(page, 'campaign-handoff-battle');
  await page.close();
  return { id: 'campaign-handoff-battle', file: 'campaign-handoff-battle.png', note: 'Archived current-renderer campaign-to-battle handoff surface.' };
}

async function measureMenu(context) {
  const page = await newPage(context);
  const startupStart = performance.now();
  await page.goto(TARGET);
  await waitForMenu(page);
  const startupMs = performance.now() - startupStart;
  const frame = await sampleRaf(page);
  const memory = await sampleMemory(page);
  await page.close();
  return sceneReport({ id: 'menu', label: 'Menu shell', route: '/', renderer: 'current-menu', frame, startupMs, memory, stats: null });
}

async function measureBattle(context) {
  const page = await newPage(context);
  const startupStart = performance.now();
  await gotoBattle(page, `${TARGET}/?map=A&ai=off`);
  const startupMs = performance.now() - startupStart;
  await page.evaluate(() => window.__game.freezeAtTick(180));
  await page.waitForTimeout(200);
  const frame = await sampleRaf(page, 60);
  const stats = await page.evaluate(() => window.__game.stats());
  const rendererPerformance = await sampleLegacyRendererPerf(page);
  const memory = await sampleMemory(page);
  await page.close();
  return sceneReport({ id: 'battle-max-crowd', label: 'Battle max crowd', route: '/?map=A&ai=off', renderer: 'current-battle', frame, startupMs, memory, performance: rendererPerformance, stats });
}

async function measureCampaign(context) {
  const startupStart = performance.now();
  const page = await gotoCampaignFromMenu(context);
  const startupMs = performance.now() - startupStart;
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.cam(-100, 250, 0.18);
  });
  await page.waitForTimeout(220);
  const frame = await sampleRaf(page, 60);
  const rendererPerformance = await sampleLegacyRendererPerf(page);
  const stats = await page.evaluate(() => ({
    armies: window.__campaign.armies().length,
    cities: Object.keys(window.__campaign.cities()).length,
    terr: window.__campaign.terrStats(),
  }));
  const memory = await sampleMemory(page);
  await page.close();
  return sceneReport({ id: 'campaign-whole-map', label: 'Campaign whole map', route: '/ -> New Campaign', renderer: 'current-campaign', frame, startupMs, memory, performance: rendererPerformance, stats });
}

async function measureHandoff(context) {
  const startupStart = performance.now();
  const page = await gotoCampaignBattle(context);
  const startupMs = performance.now() - startupStart;
  await page.evaluate(() => window.__game.freezeAtTick(96));
  await page.waitForTimeout(200);
  const frame = await sampleRaf(page, 45);
  const stats = await page.evaluate(() => window.__game.stats());
  const rendererPerformance = await sampleLegacyRendererPerf(page);
  const memory = await sampleMemory(page);
  await page.close();
  return sceneReport({ id: 'campaign-battle-handoff', label: 'Campaign to battle handoff', route: '/ -> campaign encounter -> fight', renderer: 'current-campaign-to-battle', frame, startupMs, memory, performance: rendererPerformance, stats });
}

async function gotoCampaignBattle(context) {
  const map = JSON.parse(await readFile(MAP_JSON, 'utf8'));
  const target = nearestIndependentCityFromRoma(map);
  if (target.index < 0) throw new Error('could not find an independent city near Roma for current-renderer handoff archive');
  const page = await gotoCampaignFromMenu(context);
  const accepted = await page.evaluate((targetIndex) => window.__campaign.orderMove(0, 0, targetIndex, 0), target.index);
  if (!accepted) throw new Error(`current renderer rejected move order to ${target.name}`);
  let pending = -1;
  for (let i = 0; i < 50 && pending < 0; i++) {
    pending = await page.evaluate(() => {
      window.__campaign.tick(2000);
      return window.__campaign.battleReady();
    });
  }
  if (pending < 0) throw new Error(`current renderer did not create a pending battle near ${target.name}`);
  await page.keyboard.press('1');
  await page.waitForSelector('.cmp-box', { timeout: 10000 });
  await page.click('#cmp-fight');
  await waitForBattleReady(page);
  return page;
}

async function gotoCampaignFromMenu(context) {
  const page = await newPage(context);
  await page.goto(TARGET);
  await waitForMenu(page);
  await page.evaluate(() => localStorage.removeItem('campaign-save'));
  await page.click('#menu-new-campaign');
  await waitForCampaign(page);
  return page;
}

async function gotoBattle(page, url) {
  await page.goto(url);
  await waitForBattleReady(page);
}

async function waitForMenu(page) {
  await page.waitForSelector('#menu-ui', { state: 'visible', timeout: 20000 });
}

async function waitForBattleReady(page) {
  await page.waitForFunction(() => window.__ready === true && window.__game?.stats?.().soldiers > 0, undefined, { timeout: 30000 });
}

async function waitForCampaign(page) {
  await page.waitForFunction(() => window.__campaignReady === true && window.__campaign?.armies?.().length > 0, undefined, { timeout: 30000 });
}

async function newPage(context, opts = {}) {
  const page = await context.newPage({
    viewport: opts.viewport ?? { width: 1280, height: 800 },
    deviceScaleFactor: opts.deviceScaleFactor ?? 1,
  });
  page.on('pageerror', (error) => console.error(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`console: ${message.text()}`);
  });
  return page;
}

async function savePage(page, id) {
  const file = new URL(`${id}.png`, OUT_DIR);
  await page.screenshot({ path: filePath(file) });
}

async function collectEnvironment(context) {
  const page = await newPage(context);
  await page.goto(TARGET);
  const environment = await page.evaluate(() => ({
    browser: navigator.userAgent,
    gpu: 'legacy-current-renderer',
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: window.devicePixelRatio || 1,
  }));
  await page.close();
  return environment;
}

async function sampleRaf(page, frames = 45) {
  const samples = await page.evaluate(async (targetFrames) => {
    const out = [];
    let last = performance.now();
    await new Promise((resolve) => {
      const tick = (now) => {
        out.push(now - last);
        last = now;
        if (out.length >= targetFrames) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return out.slice(1);
  }, frames + 1);
  return summarize(samples);
}

async function sampleMemory(page) {
  return page.evaluate(() => {
    const memory = performance.memory;
    if (!memory) return null;
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      usedMB: Number((memory.usedJSHeapSize / 1048576).toFixed(2)),
      totalMB: Number((memory.totalJSHeapSize / 1048576).toFixed(2)),
    };
  });
}

async function sampleLegacyRendererPerf(page) {
  return page.evaluate(() => window.__legacyRendererPerf?.() ?? null);
}

function sceneReport({ id, label, route, renderer, frame, startupMs, memory, performance = null, stats }) {
  return {
    id,
    label,
    route,
    renderer,
    frame,
    startupMs: round(startupMs),
    memory,
    performance,
    stats,
  };
}

function summarize(samples) {
  const sorted = samples.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    samples: sorted.length,
    avgMs: sorted.length ? sum / sorted.length : 0,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[idx];
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

function legacyRendererPerfShim() {
  const state = {
    frames: [],
    current: null,
  };
  const uploadMethods = [
    'bufferData',
    'bufferSubData',
    'texImage2D',
    'texSubImage2D',
    'uniform1f',
    'uniform1fv',
    'uniform1i',
    'uniform1iv',
    'uniform2f',
    'uniform2fv',
    'uniform2i',
    'uniform2iv',
    'uniform3f',
    'uniform3fv',
    'uniform3i',
    'uniform3iv',
    'uniform4f',
    'uniform4fv',
    'uniform4i',
    'uniform4iv',
    'uniformMatrix2fv',
    'uniformMatrix3fv',
    'uniformMatrix4fv',
  ];
  const drawMethods = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'];
  const ensureFrame = () => {
    if (!state.current) state.current = { buildMs: 0, uploadMs: 0, drawMs: 0, frameCpuMs: 0 };
    return state.current;
  };
  const wrap = (proto, name, bucket) => {
    const original = proto?.[name];
    if (typeof original !== 'function' || original.__civsimPerfWrapped) return;
    const wrapped = function (...args) {
      const start = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        ensureFrame()[bucket] += performance.now() - start;
      }
    };
    wrapped.__civsimPerfWrapped = true;
    proto[name] = wrapped;
  };
  const install = () => {
    for (const ctor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      const proto = ctor?.prototype;
      if (!proto) continue;
      for (const name of uploadMethods) wrap(proto, name, 'uploadMs');
      for (const name of drawMethods) wrap(proto, name, 'drawMs');
    }
  };
  install();
  const originalRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => originalRaf((timestamp) => {
    if (state.current) {
      state.frames.push(state.current);
      if (state.frames.length > 240) state.frames.shift();
    }
    state.current = { buildMs: 0, uploadMs: 0, drawMs: 0, frameCpuMs: 0 };
    const start = performance.now();
    try {
      return callback(timestamp);
    } finally {
      ensureFrame().frameCpuMs += performance.now() - start;
    }
  });
  const summarize = (values) => {
    const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.5) - 1));
    return sorted[idx];
  };
  window.__legacyRendererPerf = () => {
    const frames = state.frames.slice(-90);
    if (frames.length === 0) return null;
    return {
      buildMs: 0,
      uploadMs: summarize(frames.map((frame) => frame.uploadMs)),
      drawMs: summarize(frames.map((frame) => frame.drawMs)),
      frameCpuMs: summarize(frames.map((frame) => frame.frameCpuMs)),
    };
  };
}

function filePath(url) {
  return decodeURIComponent(url.pathname);
}

function relativePath(url) {
  return decodeURIComponent(url.pathname).replace(`${process.cwd().replace(/\/web$/, '')}/`, '');
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
