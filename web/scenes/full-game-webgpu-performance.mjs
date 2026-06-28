import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { hasBattleWorldDepthContract, hasCampaignWorldDepthContract } from './_webgpu-contract.mjs';

export const meta = {
  name: 'full-game-webgpu-performance',
  kind: 'flow',
  world: 'full-game',
  tier: 'full',
  snapshots: [],
  describe: 'Headless liveness performance report for normal WebGPU menu, battle, campaign, and handoff routes.',
};

export async function run(ctx) {
  if (process.env.VERIFY_WEBGPU !== '1') {
    ctx.check('requires WebGPU browser flags', true, 'set VERIFY_WEBGPU=1 to exercise the WebGPU performance report');
    return;
  }

  const environment = await collectEnvironment(ctx);
  const scenes = [];
  scenes.push(await measureMenu(ctx));
  scenes.push(await measureBattle(ctx));
  scenes.push(await measureCampaign(ctx));
  scenes.push(await measureHandoff(ctx));
  const currentRenderer = await readCurrentRendererBaseline();
  const release = classifyReleaseEvidence(environment, scenes, currentRenderer);

  const report = {
    kind: 'webgpu-full-game-perf',
    mode: release.mode,
    generatedAt: process.env.PERF_REPORT_GENERATED_AT ?? 'scenario-generated',
    environment,
    scenes,
    releaseBudget: release.releaseBudget,
    hardwareReleaseStatus: release.status,
    currentRendererComparison: release.comparison,
    reportFiles: reportFiles(),
    notes: [
      ...release.notes,
      'Release budgets require named real hardware and archived current-renderer comparison captures.',
    ],
  };
  await writeReport(report);

  ctx.check(
    'headless full-game WebGPU perf report covers menu, battle, campaign, and handoff',
    scenes.length === 4 && scenes.every((scene) =>
      scene.frame.samples >= 20
      && Number.isFinite(scene.frame.medianMs)
      && Number.isFinite(scene.frame.p95Ms)
      && scene.frame.p95Ms > 0,
    ),
    JSON.stringify(compactReport(report)),
  );
  ctx.check(
    'performance report keeps hardware release gate honest',
    report.hardwareReleaseStatus !== 'pass' || report.releaseBudget === 'pass',
    JSON.stringify({
      hardwareReleaseStatus: report.hardwareReleaseStatus,
      releaseBudget: report.releaseBudget,
      comparisonStatus: report.currentRendererComparison.status,
      html: report.reportFiles.html,
      json: report.reportFiles.json,
    }),
  );
}

async function collectEnvironment(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'perf-environment' });
  await page.goto(ctx.target);
  await page.waitForFunction(() => window.__appShellStats?.webgpu?.checked === true, undefined, { timeout: 18000 });
  const environment = await page.evaluate(() => ({
    browser: navigator.userAgent,
    gpu: window.__appShellStats?.webgpu?.adapter ?? 'unknown',
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: window.devicePixelRatio || 1,
  }));
  await page.close();
  return environment;
}

async function measureMenu(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'perf-menu' });
  const startupStart = performance.now();
  await page.goto(ctx.target);
  await page.waitForFunction(() => window.__appShellStats?.webgpu?.ok === true, undefined, { timeout: 18000 });
  const startupMs = performance.now() - startupStart;
  const frame = await sampleRaf(page);
  const stats = await page.evaluate(() => window.__appShellStats);
  const memory = await sampleMemory(page);
  await page.close();
  ctx.check('perf menu shell is WebGPU-ready', stats.webgpu.ok === true && stats.postCutoverScreenshots === 'webgpu-only', JSON.stringify(stats));
  return sceneReport({
    id: 'menu',
    label: 'Menu shell',
    route: '/',
    renderer: 'webgpu-app-shell',
    frame,
    startupMs,
    memory,
    stats,
  });
}

async function measureBattle(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'perf-battle' });
  const startupStart = performance.now();
  await page.goto(`${ctx.target}/?map=A&ai=off`);
  await page.waitForFunction(() => {
    const stats = window.__game?.stats?.();
    return window.__ready === true
      && stats?.renderer === 'webgpu'
      && stats.renderStats?.ready === true
      && stats.renderStats.soldiers === stats.soldiers;
  }, undefined, { timeout: 24000 });
  const startupMs = performance.now() - startupStart;
  await page.evaluate(() => window.__game.freezeAtTick(180));
  await page.waitForTimeout(200);
  const frame = await sampleRaf(page, 60);
  const stats = await page.evaluate(() => window.__game.stats());
  const memory = await sampleMemory(page);
  await page.close();
  ctx.check(
    'perf battle measures the normal raw-WebGPU max-crowd route',
    stats.renderer === 'webgpu'
      && stats.soldiers > 0
      && stats.renderStats?.soldiers === stats.renderStats?.expectedSoldiers
      && stats.renderStats?.soldiers === stats.soldiers
      && stats.renderStats?.drawCalls === 1
      && hasBattleWorldDepthContract(stats.renderStats)
      && perfStatsOk(stats.renderStats?.performance),
    JSON.stringify({ frame, stats }),
  );
  return sceneReport({
    id: 'battle-max-crowd',
    label: 'Battle max crowd',
    route: '/?map=A&ai=off',
    renderer: 'raw-webgpu-battle',
    frame,
    startupMs,
    memory,
    stats,
  });
}

async function measureCampaign(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'perf-campaign' });
  await page.goto(ctx.target);
  await page.waitForFunction(() => window.__appShellStats?.webgpu?.ok === true, undefined, { timeout: 18000 });
  const startupStart = performance.now();
  await page.click('#menu-new-campaign');
  await page.waitForFunction(() => window.__campaignReady === true && window.__campaignWebGPUStats?.ready === true, undefined, { timeout: 30000 });
  const startupMs = performance.now() - startupStart;
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.cam(-100, 250, 0.18);
  });
  await page.waitForTimeout(200);
  const frame = await sampleRaf(page, 60);
  const stats = await page.evaluate(() => window.__campaignWebGPUStats);
  const memory = await sampleMemory(page);
  await page.close();
  ctx.check(
    'perf campaign measures the normal raw-WebGPU campaign route',
    stats.renderer === 'webgpu-campaign'
      && stats.cityEntities > 20
      && stats.lineSegments > 1000
      && hasCampaignWorldDepthContract(stats)
      && perfStatsOk(stats.performance),
    JSON.stringify({ frame, stats }),
  );
  return sceneReport({
    id: 'campaign-whole-map',
    label: 'Campaign whole map',
    route: '/ -> New Campaign',
    renderer: 'raw-webgpu-campaign',
    frame,
    startupMs,
    memory,
    stats,
  });
}

async function measureHandoff(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'perf-handoff' });
  await page.goto(`${ctx.target}/?campaign=handoff`);
  await page.waitForFunction(() => window.__campaignReady === true && window.__campaignWebGPUStats?.ready === true, undefined, { timeout: 18000 });
  const handoffMs = await page.evaluate(async () => {
    window.__campaign.place(0, 1, 0, 3);
    window.__campaign.place(1, 1, 0, 4);
    window.__campaign.tick(2000);
    const start = performance.now();
    if (!window.__campaign.fightReady()) throw new Error('fightReady failed');
    await new Promise((resolve, reject) => {
      const deadline = performance.now() + 22000;
      const tick = () => {
        const stats = window.__game?.stats?.();
        if (window.__ready === true && stats?.renderer === 'webgpu' && stats.renderStats?.soldiers === stats.soldiers) {
          resolve();
          return;
        }
        if (performance.now() > deadline) {
          reject(new Error('handoff timed out'));
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
    return performance.now() - start;
  });
  await page.evaluate(() => window.__game.freezeAtTick(96));
  await page.waitForTimeout(200);
  const frame = await sampleRaf(page, 45);
  const stats = await page.evaluate(() => window.__game.stats());
  const memory = await sampleMemory(page);
  await page.close();
  ctx.check(
    'perf handoff reaches a WebGPU campaign battle with matching render count',
    handoffMs > 0
      && handoffMs < 22000
      && stats.renderer === 'webgpu'
      && stats.renderStats?.soldiers === stats.soldiers
      && hasBattleWorldDepthContract(stats.renderStats)
      && perfStatsOk(stats.renderStats?.performance),
    JSON.stringify({ handoffMs, frame, stats }),
  );
  return sceneReport({
    id: 'campaign-battle-handoff',
    label: 'Campaign to battle handoff',
    route: '/?campaign=handoff',
    renderer: 'raw-webgpu-campaign-to-battle',
    frame,
    startupMs: handoffMs,
    memory,
    stats: { handoffMs, ...stats },
  });
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

function sceneReport({ id, label, route, renderer, frame, startupMs, memory, stats }) {
  return {
    id,
    label,
    route,
    renderer,
    frame,
    startupMs: round(startupMs),
    memory,
    performance: extractRendererPerformance(stats),
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

function compactReport(report) {
  return {
    kind: report.kind,
    mode: report.mode,
    hardwareReleaseStatus: report.hardwareReleaseStatus,
    releaseBudget: report.releaseBudget,
    environment: {
      gpu: report.environment.gpu,
      browser: report.environment.browser.includes('Headless') ? 'headless' : 'browser',
      viewport: report.environment.viewport,
      dpr: report.environment.dpr,
    },
    currentRendererComparison: report.currentRendererComparison.status,
    scenes: report.scenes.map((scene) => ({
      id: scene.id,
      renderer: scene.renderer,
      samples: scene.frame.samples,
      medianMs: Number(scene.frame.medianMs.toFixed(2)),
      p95Ms: Number(scene.frame.p95Ms.toFixed(2)),
      startupMs: scene.startupMs,
      usedHeapMB: scene.memory?.usedMB,
      uploadMs: scene.performance?.uploadMs,
      drawMs: scene.performance?.drawMs,
      frameCpuMs: scene.performance?.frameCpuMs,
      soldiers: scene.stats?.soldiers,
      handoffMs: scene.stats?.handoffMs ? Number(scene.stats.handoffMs.toFixed(2)) : undefined,
    })),
  };
}

async function readCurrentRendererBaseline() {
  const path = process.env.PERF_CURRENT_RENDERER_JSON;
  if (!path) return null;
  const text = await readFile(path, 'utf8');
  return { path, report: JSON.parse(text) };
}

function classifyReleaseEvidence(environment, scenes, currentRenderer) {
  const hardware = hardwareKind(environment);
  if (hardware !== 'real-hardware') {
    return {
      mode: 'headless-liveness',
      releaseBudget: 'not-set',
      status: 'headless-liveness-only',
      comparison: {
        status: 'not-applicable-headless',
        currentRendererSource: currentRenderer?.path ?? null,
        scenes: [],
      },
      notes: [`${environment.gpu} / ${environment.browser} is classified as ${hardware}; do not use it as release performance proof.`],
    };
  }
  if (!currentRenderer) {
    return {
      mode: 'hardware-report',
      releaseBudget: 'candidate',
      status: 'pending-current-renderer-baseline',
      comparison: {
        status: 'missing-archived-current-renderer-baseline',
        currentRendererSource: null,
        scenes: scenes.map((scene) => ({
          id: scene.id,
          webgpuMedianMs: round(scene.frame.medianMs),
          webgpuP95Ms: round(scene.frame.p95Ms),
          webgpuStartupMs: round(scene.startupMs),
          webgpuUsedHeapMB: scene.memory?.usedMB ?? null,
          currentMedianMs: null,
          currentP95Ms: null,
          currentStartupMs: null,
          currentUsedHeapMB: null,
          result: 'missing-current-renderer-baseline',
        })),
      },
      notes: ['Real browser/GPU detected, but PERF_CURRENT_RENDERER_JSON was not supplied.'],
    };
  }
  const comparisonScenes = compareScenes(scenes, currentRenderer.report.scenes ?? []);
  const pass = comparisonScenes.every((scene) => scene.result === 'pass');
  return {
    mode: 'hardware-report',
    releaseBudget: pass ? 'pass' : 'fail',
    status: pass ? 'pass' : 'fail',
    comparison: {
      status: pass ? 'webgpu-equal-or-better' : 'webgpu-regression',
      currentRendererSource: currentRenderer.path,
      scenes: comparisonScenes,
    },
    notes: [`Compared against archived current-renderer perf report ${basename(currentRenderer.path)}.`],
  };
}

function hardwareKind(environment) {
  const text = `${environment.browser} ${environment.gpu}`.toLowerCase();
  if (text.includes('swiftshader') || text.includes('llvmpipe') || text.includes('software')) return 'software-adapter';
  if (text.includes('headless')) return 'headless-browser';
  if (environment.gpu === 'unknown') return 'unknown-adapter';
  return 'real-hardware';
}

function compareScenes(webgpuScenes, currentScenes) {
  return webgpuScenes.map((webgpu) => {
    const current = currentScenes.find((scene) => scene.id === webgpu.id);
    if (!current?.frame) {
      return {
        id: webgpu.id,
        webgpuMedianMs: round(webgpu.frame.medianMs),
        webgpuP95Ms: round(webgpu.frame.p95Ms),
        webgpuStartupMs: round(webgpu.startupMs),
        webgpuUsedHeapMB: webgpu.memory?.usedMB ?? null,
        currentMedianMs: null,
        currentP95Ms: null,
        currentStartupMs: null,
        currentUsedHeapMB: null,
        result: 'missing-current-renderer-scene',
      };
    }
    const medianRatio = webgpu.frame.medianMs / Math.max(0.001, current.frame.medianMs);
    const p95Ratio = webgpu.frame.p95Ms / Math.max(0.001, current.frame.p95Ms);
    const webgpuPerf = webgpu.performance ?? extractRendererPerformance(webgpu.stats);
    const currentPerf = current.performance ?? extractRendererPerformance(current.stats);
    const webgpuMemory = extractMemory(webgpu);
    const currentMemory = extractMemory(current);
    if (Number.isFinite(webgpu.startupMs) && !Number.isFinite(current.startupMs)) {
      return {
        id: webgpu.id,
        webgpuMedianMs: round(webgpu.frame.medianMs),
        webgpuP95Ms: round(webgpu.frame.p95Ms),
        webgpuStartupMs: round(webgpu.startupMs),
        webgpuUsedHeapMB: webgpuMemory?.usedMB ?? null,
        currentMedianMs: round(current.frame.medianMs),
        currentP95Ms: round(current.frame.p95Ms),
        currentStartupMs: null,
        currentUsedHeapMB: currentMemory?.usedMB ?? null,
        medianRatio: round(medianRatio),
        p95Ratio: round(p95Ratio),
        result: 'missing-current-startup-baseline',
      };
    }
    if (webgpuMemory && !currentMemory) {
      return {
        id: webgpu.id,
        webgpuMedianMs: round(webgpu.frame.medianMs),
        webgpuP95Ms: round(webgpu.frame.p95Ms),
        webgpuStartupMs: round(webgpu.startupMs),
        webgpuUsedHeapMB: webgpuMemory.usedMB,
        currentMedianMs: round(current.frame.medianMs),
        currentP95Ms: round(current.frame.p95Ms),
        currentStartupMs: round(current.startupMs),
        currentUsedHeapMB: null,
        medianRatio: round(medianRatio),
        p95Ratio: round(p95Ratio),
        startupRatio: round(startupRatio(webgpu, current)),
        result: 'missing-current-memory-baseline',
      };
    }
    const needsCpuBaseline = webgpu.id !== 'menu' && webgpuPerf !== null;
    if (needsCpuBaseline && !currentPerf) {
      return {
        id: webgpu.id,
        webgpuMedianMs: round(webgpu.frame.medianMs),
        webgpuP95Ms: round(webgpu.frame.p95Ms),
        webgpuStartupMs: round(webgpu.startupMs),
        webgpuUsedHeapMB: webgpuMemory?.usedMB ?? null,
        currentMedianMs: round(current.frame.medianMs),
        currentP95Ms: round(current.frame.p95Ms),
        currentStartupMs: round(current.startupMs),
        currentUsedHeapMB: currentMemory?.usedMB ?? null,
        medianRatio: round(medianRatio),
        p95Ratio: round(p95Ratio),
        webgpuUploadMs: round(webgpuPerf.uploadMs),
        webgpuDrawMs: round(webgpuPerf.drawMs),
        currentUploadMs: null,
        currentDrawMs: null,
        result: 'missing-current-cpu-baseline',
      };
    }
    const uploadRatio = webgpuPerf && currentPerf
      ? webgpuPerf.uploadMs / Math.max(0.001, currentPerf.uploadMs)
      : null;
    const drawRatio = webgpuPerf && currentPerf
      ? webgpuPerf.drawMs / Math.max(0.001, currentPerf.drawMs)
      : null;
    const startupMsRatio = startupRatio(webgpu, current);
    const heapRatio = webgpuMemory && currentMemory
      ? webgpuMemory.usedMB / Math.max(0.001, currentMemory.usedMB)
      : null;
    const framePass = withinMeasurementFloor(webgpu.frame.medianMs, current.frame.medianMs, 0.25)
      && withinMeasurementFloor(webgpu.frame.p95Ms, current.frame.p95Ms, 1.5);
    const cpuPass = !webgpuPerf || !currentPerf || (
      withinMeasurementFloor(webgpuPerf.uploadMs, currentPerf.uploadMs, 0.25)
      && withinMeasurementFloor(webgpuPerf.drawMs, currentPerf.drawMs, 0.25)
    );
    const startupPass = startupMsRatio === null || startupMsRatio <= 1.05 || withinMeasurementFloor(webgpu.startupMs, current.startupMs, 50);
    const heapPass = heapRatio === null || heapRatio <= 1.1;
    return {
      id: webgpu.id,
      webgpuMedianMs: round(webgpu.frame.medianMs),
      webgpuP95Ms: round(webgpu.frame.p95Ms),
      webgpuStartupMs: round(webgpu.startupMs),
      webgpuUsedHeapMB: webgpuMemory?.usedMB ?? null,
      currentMedianMs: round(current.frame.medianMs),
      currentP95Ms: round(current.frame.p95Ms),
      currentStartupMs: round(current.startupMs),
      currentUsedHeapMB: currentMemory?.usedMB ?? null,
      medianRatio: round(medianRatio),
      p95Ratio: round(p95Ratio),
      startupRatio: round(startupMsRatio),
      heapRatio: round(heapRatio),
      webgpuUploadMs: webgpuPerf ? round(webgpuPerf.uploadMs) : null,
      webgpuDrawMs: webgpuPerf ? round(webgpuPerf.drawMs) : null,
      currentUploadMs: currentPerf ? round(currentPerf.uploadMs) : null,
      currentDrawMs: currentPerf ? round(currentPerf.drawMs) : null,
      uploadRatio: round(uploadRatio),
      drawRatio: round(drawRatio),
      measurementFloorMs: {
        median: 0.25,
        p95: 1.5,
        cpu: 0.25,
        startup: 50,
      },
      result: framePass && cpuPass && startupPass && heapPass ? 'pass' : 'fail',
    };
  });
}

function withinMeasurementFloor(webgpuValue, currentValue, floorMs) {
  if (!Number.isFinite(webgpuValue) || !Number.isFinite(currentValue)) return false;
  return webgpuValue <= currentValue + floorMs;
}

function startupRatio(webgpu, current) {
  return Number.isFinite(webgpu.startupMs) && Number.isFinite(current.startupMs)
    ? webgpu.startupMs / Math.max(0.001, current.startupMs)
    : null;
}

function extractMemory(scene) {
  const memory = scene?.memory;
  if (!memory || typeof memory !== 'object') return null;
  const usedMB = Number(memory.usedMB ?? (memory.usedJSHeapSize / 1048576));
  const totalMB = Number(memory.totalMB ?? (memory.totalJSHeapSize / 1048576));
  return Number.isFinite(usedMB) && usedMB > 0
    ? { usedMB, totalMB: Number.isFinite(totalMB) ? totalMB : null }
    : null;
}

function extractRendererPerformance(stats) {
  const perf = stats?.renderStats?.performance ?? stats?.performance;
  if (!perf || typeof perf !== 'object') return null;
  const out = {
    buildMs: finiteMs(perf.buildMs),
    uploadMs: finiteMs(perf.uploadMs),
    drawMs: finiteMs(perf.drawMs),
    frameCpuMs: finiteMs(perf.frameCpuMs),
  };
  return Object.values(out).every((value) => Number.isFinite(value)) ? out : null;
}

function perfStatsOk(perf) {
  const normalized = extractRendererPerformance({ performance: perf });
  return Boolean(
    normalized
      && normalized.frameCpuMs >= normalized.drawMs
      && normalized.frameCpuMs >= normalized.uploadMs
      && normalized.uploadMs >= 0
      && normalized.drawMs >= 0,
  );
}

function finiteMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

async function writeReport(report) {
  const files = reportFileUrls();
  await mkdir(files.dir, { recursive: true });
  await writeFile(files.json, JSON.stringify(report, null, 2));
  await writeFile(files.html, renderHtml(report));
}

function reportFileUrls() {
  const dir = new URL('../../specs/webgpu-skinned-crowd/visualizations/performance/', import.meta.url);
  return {
    dir,
    json: new URL('full-game-webgpu-performance.json', dir),
    html: new URL('../webgpu-performance-report.html', dir),
  };
}

function reportFiles() {
  return {
    json: 'specs/webgpu-skinned-crowd/visualizations/performance/full-game-webgpu-performance.json',
    html: 'specs/webgpu-skinned-crowd/visualizations/webgpu-performance-report.html',
  };
}

function renderHtml(report) {
  const comparison = report.currentRendererComparison.scenes.map((scene) => `
    <tr>
      <td>${escapeHtml(scene.id)}</td>
      <td>${valueCell(scene.webgpuMedianMs)}</td>
      <td>${valueCell(scene.webgpuP95Ms)}</td>
      <td>${valueCell(scene.webgpuStartupMs)}</td>
      <td>${valueCell(scene.webgpuUsedHeapMB)}</td>
      <td>${valueCell(scene.currentMedianMs)}</td>
      <td>${valueCell(scene.currentP95Ms)}</td>
      <td>${valueCell(scene.currentStartupMs)}</td>
      <td>${valueCell(scene.currentUsedHeapMB)}</td>
      <td>${valueCell(scene.webgpuUploadMs)}</td>
      <td>${valueCell(scene.currentUploadMs)}</td>
      <td>${escapeHtml(scene.result)}</td>
    </tr>
  `).join('\n');
  const sceneRows = report.scenes.map((scene) => `
    <tr>
      <td>${escapeHtml(scene.label)}</td>
      <td>${escapeHtml(scene.renderer)}</td>
      <td>${valueCell(round(scene.frame.medianMs))}</td>
      <td>${valueCell(round(scene.frame.p95Ms))}</td>
      <td>${valueCell(round(scene.startupMs))}</td>
      <td>${valueCell(scene.memory?.usedMB)}</td>
      <td>${valueCell(round(scene.performance?.uploadMs))}</td>
      <td>${valueCell(round(scene.performance?.drawMs))}</td>
      <td>${valueCell(round(scene.performance?.frameCpuMs))}</td>
      <td>${escapeHtml(String(scene.frame.samples))}</td>
    </tr>
  `).join('\n');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>WebGPU Performance Report</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background: #191915; color: #e9dfca; }
    header { padding: 24px 28px; background: #252219; border-bottom: 1px solid #4d412b; }
    h1 { margin: 0 0 8px; font: 700 26px Georgia, serif; }
    h2 { margin: 28px 0 10px; font-size: 18px; color: #f0d59c; }
    p { margin: 0; max-width: 980px; line-height: 1.5; color: #cec0a4; }
    main { padding: 24px 28px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 22px; background: #211f19; border: 1px solid #4d412b; }
    th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid #403624; font-size: 13px; }
    th { color: #d7bd82; font-weight: 700; }
    code { color: #f0d59c; }
  </style>
</head>
<body>
  <header>
    <h1>WebGPU Performance Report</h1>
    <p>Status <code>${escapeHtml(report.hardwareReleaseStatus)}</code>, budget <code>${escapeHtml(report.releaseBudget)}</code>. Generated ${escapeHtml(report.generatedAt)} on ${escapeHtml(report.environment.gpu)} with ${escapeHtml(report.environment.browser)}.</p>
  </header>
  <main>
    <h2>WebGPU Scenes</h2>
    <table>
      <tr><th>scene</th><th>renderer</th><th>median ms</th><th>p95 ms</th><th>startup ms</th><th>heap MB</th><th>upload ms</th><th>draw ms</th><th>CPU frame ms</th><th>samples</th></tr>
      ${sceneRows}
    </table>
    <h2>Current Renderer Comparison</h2>
    <table>
      <tr><th>scene</th><th>webgpu median</th><th>webgpu p95</th><th>webgpu startup</th><th>webgpu heap</th><th>current median</th><th>current p95</th><th>current startup</th><th>current heap</th><th>webgpu upload</th><th>current upload</th><th>result</th></tr>
      ${comparison || '<tr><td colspan="12">No archived current-renderer baseline attached.</td></tr>'}
    </table>
  </main>
</body>
</html>
`;
}

function valueCell(value) {
  return value === null || value === undefined ? 'missing' : escapeHtml(String(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}
