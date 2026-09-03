import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import {
  hasBattleWorldDepthContract,
  hasCampaignWorldDepthContract,
} from "../_renderer-contract.mjs";
import { campaign, ready } from "../worlds.mjs";

export const meta = {
  name: "full-game-rendering-performance",
  kind: "flow",
  world: "full-game",
  tier: "full",
  snapshots: [],
  describe:
    "Headless liveness performance report for normal WebGPU menu, battle, campaign, and handoff routes.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "requires WebGPU browser flags",
      true,
      "set VERIFY_GPU=1 to exercise the WebGPU performance report",
    );
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
    kind: "rendering-full-game-perf",
    mode: release.mode,
    generatedAt: process.env.PERF_REPORT_GENERATED_AT ?? "scenario-generated",
    environment,
    scenes,
    releaseBudget: release.releaseBudget,
    hardwareReleaseStatus: release.status,
    currentRendererComparison: release.comparison,
    notes: [
      ...release.notes,
      "Release budgets require named real hardware and archived current-renderer comparison captures.",
    ],
  };

  ctx.check(
    "headless full-game WebGPU perf report covers menu, battle, campaign, and handoff",
    scenes.length === 4 &&
      scenes.every(
        (scene) =>
          scene.frame.samples >= 20 &&
          Number.isFinite(scene.frame.medianMs) &&
          Number.isFinite(scene.frame.p95Ms) &&
          scene.frame.p95Ms > 0,
      ),
    JSON.stringify(compactReport(report)),
  );
  ctx.check(
    "performance report keeps hardware release gate honest",
    report.hardwareReleaseStatus !== "pass" || report.releaseBudget === "pass",
    JSON.stringify({
      hardwareReleaseStatus: report.hardwareReleaseStatus,
      releaseBudget: report.releaseBudget,
      comparisonStatus: report.currentRendererComparison.status,
    }),
  );
}

async function collectEnvironment(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "perf-environment",
  });
  await page.goto(ctx.target);
  await page.waitForFunction(() => window.__appShellStats?.gpu?.checked === true, undefined, {
    timeout: 18000,
  });
  const environment = await page.evaluate(() => ({
    browser: navigator.userAgent,
    gpu: window.__appShellStats?.gpu?.adapter ?? "unknown",
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: window.devicePixelRatio || 1,
  }));
  await page.close();
  return environment;
}

async function measureMenu(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "perf-menu",
  });
  const startupStart = performance.now();
  await page.goto(ctx.target);
  await page.waitForFunction(() => window.__appShellStats?.gpu?.ok === true, undefined, {
    timeout: 18000,
  });
  const startupMs = performance.now() - startupStart;
  const frame = await sampleRaf(page);
  const stats = await page.evaluate(() => window.__appShellStats);
  const memory = await sampleMemory(page);
  await page.close();
  ctx.check(
    "perf menu shell is WebGPU-ready",
    stats.gpu.ok === true && stats.postCutoverScreenshots === "renderer-only",
    JSON.stringify(stats),
  );
  return sceneReport({
    id: "menu",
    label: "Menu shell",
    route: "/",
    renderer: "gpu-app-shell",
    frame,
    startupMs,
    memory,
    stats,
  });
}

async function measureBattle(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "perf-battle",
  });
  const startupStart = performance.now();
  await page.goto(`${ctx.target}/?map=gen&seed=7&ai=off`);
  await page.waitForFunction(
    () => {
      const stats = window.__game?.stats?.();
      return (
        window.__ready === true &&
        stats?.renderer === "gpu" &&
        stats.renderStats?.ready === true &&
        stats.renderStats.soldiers === stats.soldiers
      );
    },
    undefined,
    { timeout: 24000 },
  );
  const startupMs = performance.now() - startupStart;
  await page.evaluate(() => window.__game.freezeAtTick(180));
  await page.waitForTimeout(200);
  const frame = await sampleRaf(page, 60);
  const stats = await page.evaluate(() => window.__game.stats());
  const memory = await sampleMemory(page);
  await page.close();
  ctx.check(
    "perf battle measures the normal raw-WebGPU max-crowd route",
    stats.renderer === "gpu" &&
      stats.soldiers > 0 &&
      stats.renderStats?.soldiers === stats.renderStats?.expectedSoldiers &&
      stats.renderStats?.soldiers === stats.soldiers &&
      stats.renderStats?.drawCalls > 0 &&
      stats.renderStats?.drawCalls < 64 &&
      hasBattleWorldDepthContract(stats.renderStats) &&
      perfStatsOk(stats.renderStats?.performance),
    JSON.stringify({ frame, stats }),
  );
  return sceneReport({
    id: "battle-max-crowd",
    label: "Battle max crowd",
    route: "/?map=gen&seed=7&ai=off",
    renderer: "raw-renderer-battle",
    frame,
    startupMs,
    memory,
    stats,
  });
}

async function measureCampaign(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "perf-campaign",
  });
  await page.goto(ctx.target);
  await page.waitForFunction(() => window.__appShellStats?.gpu?.ok === true, undefined, {
    timeout: 18000,
  });
  const startupStart = performance.now();
  await page.click("#menu-new-campaign");
  await ready(page, "__campaignReady", 30000);
  const startupMs = performance.now() - startupStart;
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.cam(-100, 250, 0.18);
  });
  await page.waitForTimeout(200);
  const frame = await sampleRaf(page, 60);
  const stats = await page.evaluate(() => window.__campaignGpuStats);
  const memory = await sampleMemory(page);
  await page.close();
  ctx.check(
    "perf campaign measures the normal raw-WebGPU campaign route",
    stats.renderer === "renderer-campaign" &&
      stats.cityEntities > 20 &&
      stats.lineSegments > 1000 &&
      hasCampaignWorldDepthContract(stats) &&
      perfStatsOk(stats.performance),
    JSON.stringify({ frame, stats }),
  );
  return sceneReport({
    id: "campaign-whole-map",
    label: "Campaign whole map",
    route: "/ -> New Campaign",
    renderer: "raw-renderer-campaign",
    frame,
    startupMs,
    memory,
    stats,
  });
}

async function measureHandoff(ctx) {
  const page = await campaign(ctx, "handoff", {
    viewport: { width: 1280, height: 800 },
    errorPrefix: "perf-handoff",
    timeout: 18000,
  });
  const handoffStart = Date.now();
  const launched = await page.evaluate(() => {
    window.__campaign.place(0, 1, 0, 3);
    window.__campaign.place(1, 1, 0, 4);
    window.__campaign.tick(2000);
    return window.__campaign.fightReady();
  });
  if (!launched) throw new Error("fightReady failed");
  await page.waitForFunction(
    () => {
      const stats = window.__game?.stats?.();
      return (
        window.__ready === true &&
        stats?.renderer === "gpu" &&
        stats.renderStats?.soldiers === stats.soldiers
      );
    },
    undefined,
    { timeout: 22000 },
  );
  const handoffMs = Date.now() - handoffStart;
  await page.evaluate(() => window.__game.freezeAtTick(96));
  await page.waitForFunction(
    () => {
      const stats = window.__game?.stats?.();
      return (
        window.__ready === true &&
        stats?.renderer === "gpu" &&
        stats.renderStats?.soldiers === stats.soldiers
      );
    },
    undefined,
    { timeout: 22000 },
  );
  await page.waitForTimeout(200);
  const frame = await sampleRaf(page, 45);
  await page.waitForFunction(
    () => {
      const stats = window.__game?.stats?.();
      return stats?.renderer === "gpu" && stats.renderStats?.soldiers === stats.soldiers;
    },
    undefined,
    { timeout: 8000 },
  );
  const stats = await page.evaluate(() => window.__game?.stats?.() ?? null);
  const memory = await sampleMemory(page);
  await page.close();
  ctx.check(
    "perf handoff reaches a WebGPU campaign battle with matching render count",
    stats &&
      handoffMs > 0 &&
      handoffMs < 22000 &&
      stats.renderer === "gpu" &&
      stats.renderStats?.soldiers === stats.soldiers &&
      hasBattleWorldDepthContract(stats.renderStats) &&
      perfStatsOk(stats.renderStats?.performance),
    JSON.stringify({ handoffMs, frame, stats }),
  );
  return sceneReport({
    id: "campaign-battle-handoff",
    label: "Campaign to battle handoff",
    route: "/?campaign=handoff",
    renderer: "raw-renderer-campaign-to-battle",
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
  const sorted = samples
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
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
      browser: report.environment.browser.includes("Headless") ? "headless" : "browser",
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
  const text = await readFile(path, "utf8");
  return { path, report: JSON.parse(text) };
}

function classifyReleaseEvidence(environment, scenes, currentRenderer) {
  const hardware = hardwareKind(environment);
  if (hardware !== "real-hardware") {
    return {
      mode: "headless-liveness",
      releaseBudget: "not-set",
      status: "headless-liveness-only",
      comparison: {
        status: "not-applicable-headless",
        currentRendererSource: currentRenderer?.path ?? null,
        scenes: [],
      },
      notes: [
        `${environment.gpu} / ${environment.browser} is classified as ${hardware}; do not use it as release performance proof.`,
      ],
    };
  }
  if (!currentRenderer) {
    return {
      mode: "hardware-report",
      releaseBudget: "candidate",
      status: "pending-current-renderer-baseline",
      comparison: {
        status: "missing-archived-current-renderer-baseline",
        currentRendererSource: null,
        scenes: scenes.map((scene) => ({
          id: scene.id,
          gpuMedianMs: round(scene.frame.medianMs),
          gpuP95Ms: round(scene.frame.p95Ms),
          gpuStartupMs: round(scene.startupMs),
          gpuUsedHeapMB: scene.memory?.usedMB ?? null,
          currentMedianMs: null,
          currentP95Ms: null,
          currentStartupMs: null,
          currentUsedHeapMB: null,
          result: "missing-current-renderer-baseline",
        })),
      },
      notes: ["Real browser/GPU detected, but PERF_CURRENT_RENDERER_JSON was not supplied."],
    };
  }
  const comparisonScenes = compareScenes(scenes, currentRenderer.report.scenes ?? []);
  const pass = comparisonScenes.every((scene) => scene.result === "pass");
  return {
    mode: "hardware-report",
    releaseBudget: pass ? "pass" : "fail",
    status: pass ? "pass" : "fail",
    comparison: {
      status: pass ? "gpu-equal-or-better" : "gpu-regression",
      currentRendererSource: currentRenderer.path,
      scenes: comparisonScenes,
    },
    notes: [
      `Compared against archived current-renderer perf report ${basename(currentRenderer.path)}.`,
    ],
  };
}

function hardwareKind(environment) {
  const text = `${environment.browser} ${environment.gpu}`.toLowerCase();
  if (text.includes("swiftshader") || text.includes("llvmpipe") || text.includes("software"))
    return "software-adapter";
  if (text.includes("headless")) return "headless-browser";
  if (environment.gpu === "unknown") return "unknown-adapter";
  return "real-hardware";
}

function compareScenes(gpuScenes, currentScenes) {
  return gpuScenes.map((gpu) => {
    const current = currentScenes.find((scene) => scene.id === gpu.id);
    if (!current?.frame) {
      return {
        id: gpu.id,
        gpuMedianMs: round(gpu.frame.medianMs),
        gpuP95Ms: round(gpu.frame.p95Ms),
        gpuStartupMs: round(gpu.startupMs),
        gpuUsedHeapMB: gpu.memory?.usedMB ?? null,
        currentMedianMs: null,
        currentP95Ms: null,
        currentStartupMs: null,
        currentUsedHeapMB: null,
        result: "missing-current-renderer-scene",
      };
    }
    const medianRatio = gpu.frame.medianMs / Math.max(0.001, current.frame.medianMs);
    const p95Ratio = gpu.frame.p95Ms / Math.max(0.001, current.frame.p95Ms);
    const gpuPerf = gpu.performance ?? extractRendererPerformance(gpu.stats);
    const currentPerf = current.performance ?? extractRendererPerformance(current.stats);
    const gpuMemory = extractMemory(gpu);
    const currentMemory = extractMemory(current);
    if (Number.isFinite(gpu.startupMs) && !Number.isFinite(current.startupMs)) {
      return {
        id: gpu.id,
        gpuMedianMs: round(gpu.frame.medianMs),
        gpuP95Ms: round(gpu.frame.p95Ms),
        gpuStartupMs: round(gpu.startupMs),
        gpuUsedHeapMB: gpuMemory?.usedMB ?? null,
        currentMedianMs: round(current.frame.medianMs),
        currentP95Ms: round(current.frame.p95Ms),
        currentStartupMs: null,
        currentUsedHeapMB: currentMemory?.usedMB ?? null,
        medianRatio: round(medianRatio),
        p95Ratio: round(p95Ratio),
        result: "missing-current-startup-baseline",
      };
    }
    if (gpuMemory && !currentMemory) {
      return {
        id: gpu.id,
        gpuMedianMs: round(gpu.frame.medianMs),
        gpuP95Ms: round(gpu.frame.p95Ms),
        gpuStartupMs: round(gpu.startupMs),
        gpuUsedHeapMB: gpuMemory.usedMB,
        currentMedianMs: round(current.frame.medianMs),
        currentP95Ms: round(current.frame.p95Ms),
        currentStartupMs: round(current.startupMs),
        currentUsedHeapMB: null,
        medianRatio: round(medianRatio),
        p95Ratio: round(p95Ratio),
        startupRatio: round(startupRatio(gpu, current)),
        result: "missing-current-memory-baseline",
      };
    }
    const needsCpuBaseline = gpu.id !== "menu" && gpuPerf !== null;
    if (needsCpuBaseline && !currentPerf) {
      return {
        id: gpu.id,
        gpuMedianMs: round(gpu.frame.medianMs),
        gpuP95Ms: round(gpu.frame.p95Ms),
        gpuStartupMs: round(gpu.startupMs),
        gpuUsedHeapMB: gpuMemory?.usedMB ?? null,
        currentMedianMs: round(current.frame.medianMs),
        currentP95Ms: round(current.frame.p95Ms),
        currentStartupMs: round(current.startupMs),
        currentUsedHeapMB: currentMemory?.usedMB ?? null,
        medianRatio: round(medianRatio),
        p95Ratio: round(p95Ratio),
        gpuUploadMs: round(gpuPerf.uploadMs),
        gpuDrawMs: round(gpuPerf.drawMs),
        currentUploadMs: null,
        currentDrawMs: null,
        result: "missing-current-cpu-baseline",
      };
    }
    const uploadRatio =
      gpuPerf && currentPerf ? gpuPerf.uploadMs / Math.max(0.001, currentPerf.uploadMs) : null;
    const drawRatio =
      gpuPerf && currentPerf ? gpuPerf.drawMs / Math.max(0.001, currentPerf.drawMs) : null;
    const startupMsRatio = startupRatio(gpu, current);
    const heapRatio =
      gpuMemory && currentMemory ? gpuMemory.usedMB / Math.max(0.001, currentMemory.usedMB) : null;
    const framePass =
      withinMeasurementFloor(gpu.frame.medianMs, current.frame.medianMs, 0.25) &&
      withinMeasurementFloor(gpu.frame.p95Ms, current.frame.p95Ms, 1.5);
    const cpuPass =
      !gpuPerf ||
      !currentPerf ||
      (withinMeasurementFloor(gpuPerf.uploadMs, currentPerf.uploadMs, 0.25) &&
        withinMeasurementFloor(gpuPerf.drawMs, currentPerf.drawMs, 0.25));
    const startupPass =
      startupMsRatio === null ||
      startupMsRatio <= 1.05 ||
      withinMeasurementFloor(gpu.startupMs, current.startupMs, 50);
    const heapPass = heapRatio === null || heapRatio <= 1.1;
    return {
      id: gpu.id,
      gpuMedianMs: round(gpu.frame.medianMs),
      gpuP95Ms: round(gpu.frame.p95Ms),
      gpuStartupMs: round(gpu.startupMs),
      gpuUsedHeapMB: gpuMemory?.usedMB ?? null,
      currentMedianMs: round(current.frame.medianMs),
      currentP95Ms: round(current.frame.p95Ms),
      currentStartupMs: round(current.startupMs),
      currentUsedHeapMB: currentMemory?.usedMB ?? null,
      medianRatio: round(medianRatio),
      p95Ratio: round(p95Ratio),
      startupRatio: round(startupMsRatio),
      heapRatio: round(heapRatio),
      gpuUploadMs: gpuPerf ? round(gpuPerf.uploadMs) : null,
      gpuDrawMs: gpuPerf ? round(gpuPerf.drawMs) : null,
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
      result: framePass && cpuPass && startupPass && heapPass ? "pass" : "fail",
    };
  });
}

function withinMeasurementFloor(gpuValue, currentValue, floorMs) {
  if (!Number.isFinite(gpuValue) || !Number.isFinite(currentValue)) return false;
  return gpuValue <= currentValue + floorMs;
}

function startupRatio(gpu, current) {
  return Number.isFinite(gpu.startupMs) && Number.isFinite(current.startupMs)
    ? gpu.startupMs / Math.max(0.001, current.startupMs)
    : null;
}

function extractMemory(scene) {
  const memory = scene?.memory;
  if (!memory || typeof memory !== "object") return null;
  const usedMB = Number(memory.usedMB ?? memory.usedJSHeapSize / 1048576);
  const totalMB = Number(memory.totalMB ?? memory.totalJSHeapSize / 1048576);
  return Number.isFinite(usedMB) && usedMB > 0
    ? { usedMB, totalMB: Number.isFinite(totalMB) ? totalMB : null }
    : null;
}

function extractRendererPerformance(stats) {
  const perf = stats?.renderStats?.performance ?? stats?.performance;
  if (!perf || typeof perf !== "object") return null;
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
    normalized &&
    normalized.frameCpuMs >= normalized.drawMs &&
    normalized.frameCpuMs >= normalized.uploadMs &&
    normalized.uploadMs >= 0 &&
    normalized.drawMs >= 0,
  );
}

function finiteMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}
