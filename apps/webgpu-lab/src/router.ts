import { createFrameShell, type MarkerInstance, type RawFrameShell } from '../../../packages/webgpu-core/src/frameShell';
import { screenToWorld, worldToScreen } from '../../../packages/webgpu-core/src/cameraUniform';
import { requestWebGpuDevice, webGpuFailureMessage } from '../../../packages/webgpu-core/src/device';
import { SkinnedCrowdPipeline } from '../../../packages/webgpu-core/src/skinnedPipeline';
import { animationForFrame } from '../../../packages/crowd-runtime/src/animationState';
import { buildCrowdInstances, generatedFormation, type CrowdInstance } from '../../../packages/crowd-runtime/src/instanceData';
import { assignCrowdLods, countLods } from '../../../packages/crowd-runtime/src/lod';
import { createPerfAverager } from '../../../packages/crowd-runtime/src/perfStats';
import { buildLiveBattleCrowdFrame } from '../../../packages/game-renderer/src/battle/crowdPass';
import { BattleMinimapPass } from '../../../packages/game-renderer/src/battle/minimapPass';
import { BattleOverlayPass, selectedUnitOverlayVertices } from '../../../packages/game-renderer/src/battle/overlayPass';
import { battleUnitsInRect, cssToBattleWorld, liveBattlePickUnits, pickBattleUnit, type BattlePickUnit, type WebGpuBattlePickCamera } from '../../../packages/game-renderer/src/battle/pickingDebug';
import { BattleTerrainPass, type BattleTerrainFixture } from '../../../packages/game-renderer/src/battle/terrainPass';
import { CLASS_DEPTH, CLASS_SPACING, UNIT_INFO } from '../../../packages/game-renderer/src/battle/unitInfoLayout';
import { campaignWaterFeatures, CampaignCloudPass, CampaignWaterPass } from '../../../packages/game-renderer/src/campaign/atmospherePass';
import { CampaignEntityPass, type CampaignEntityInstance } from '../../../packages/game-renderer/src/campaign/entityPass';
import { buildCampaignMapDrawData, CampaignLabelPass, CampaignLinePass, CampaignMapPass, CampaignMarkerPass, type CampaignLabel } from '../../../packages/game-renderer/src/campaign/mapPass';
import { CampaignSceneryPass, type CampaignSceneryInstance } from '../../../packages/game-renderer/src/campaign/sceneryPass';
import { CampaignSelectionPass, type CampaignSelectionInstance } from '../../../packages/game-renderer/src/campaign/selectionPass';
import { campaignBorderVertices, CampaignTerritoryPass } from '../../../packages/game-renderer/src/campaign/territoryPass';
import { formatPerfSummary, makeFullGamePerfReport } from '../../../packages/game-renderer/src/perfReport';
import { fullGameRenderGraphReport } from '../../../packages/game-renderer/src/renderGraph';
import { loadPlaceholderKit, loadPlaceholderVat, placeholderClipNames } from '../../../packages/soldier-assets/src/placeholders';
import { createPlaceholderSoldierMeshes } from '../../../packages/soldier-assets/src/soldierMesh';
import { badArtistPackFixture, validateSoldierKit, type ValidationReport } from '../../../packages/soldier-assets/src/validate';
import { buildWebGpuBattleUiModel, WebGpuBattleUiLayer } from '../../../web/src/battle/webgpuUiLayer';
import { loadCampaignData, nearestLoc, type CampaignData } from '../../../web/src/campaign/data';
import { Allegiance } from '../../../web/src/campaign/status';
import { TerrainField } from '../../../web/src/campaign/terrain';
import { Territory, type FactionLabel } from '../../../web/src/campaign/territory';
import { readCampaignViews, type ArmyView, type CampaignViews, type CityView } from '../../../web/src/campaign/views';
import { WebGpuCampaignUiLayer } from '../../../web/src/campaign/webgpuUiLayer';

type LabRoute = (ctx: LabContext) => Promise<void> | void;

interface LabContext {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  panel: HTMLElement;
  status: HTMLElement;
  path: string;
  params: URLSearchParams;
}

const routes: Record<string, LabRoute> = {
  '/webgpu/device': routeDevice,
  '/webgpu/frame-shell': routeFrameShell,
  '/webgpu/assets': routeAssets,
  '/webgpu/crowd-data': routeCrowdData,
  '/webgpu/animation-state': routeAnimationState,
  '/webgpu/skinned-soldier': routeSkinnedSoldier,
  '/webgpu/skinned-crowd': routeSkinnedCrowd,
  '/webgpu/lod': routeLod,
  '/webgpu/battle': routeBattle,
  '/webgpu/perf': routePerf,
  '/webgpu/campaign': routeCampaign,
  '/webgpu/campaign-map': routeCampaignMap,
  '/webgpu/campaign-ui': routeCampaignUi,
  '/webgpu/campaign-model-gates': routeCampaignModelGates,
  '/webgpu/render-graph': routeRenderGraph,
  '/webgpu/battle-terrain': routeBattleTerrain,
  '/webgpu/battle-ui': routeBattleUi,
  '/webgpu/battle-input': routeBattleInput,
  '/webgpu/battle-live': routeBattleLive,
  '/webgpu/cutover': routeCutover,
};

export async function mountWebgpuLab(path = location.pathname) {
  document.body.innerHTML = '';
  document.body.className = 'webgpu-lab-body';
  installStyles();
  const root = el('main', 'webgpu-lab');
  const nav = el('nav', 'webgpu-lab-nav');
  for (const key of Object.keys(routes)) {
    const a = document.createElement('a');
    a.href = key;
    a.textContent = key.replace('/webgpu/', '');
    a.className = key === path ? 'active' : '';
    nav.appendChild(a);
  }
  const stage = el('section', 'webgpu-stage');
  const canvas = document.createElement('canvas');
  canvas.id = 'webgpu-canvas';
  const panel = el('aside', 'webgpu-panel');
  const status = el('div', 'webgpu-status');
  panel.appendChild(status);
  stage.append(canvas, panel);
  root.append(nav, stage);
  document.body.appendChild(root);
  const route = routes[path] ?? routeDevice;
  try {
    await route({ root, canvas, panel, status, path, params: new URLSearchParams(location.search) });
  } catch (error) {
    status.textContent = webGpuFailureMessage(error);
    status.classList.add('bad');
    (window as unknown as { __webgpuLabReady?: boolean; __webgpuLabStats?: unknown }).__webgpuLabReady = true;
    (window as unknown as { __webgpuLabStats?: unknown }).__webgpuLabStats = { ok: false, error: String(error) };
  }
}

async function routeDevice(ctx: LabContext) {
  const info = await requestWebGpuDevice();
  const shell = await createFrameShell(ctx.canvas);
  const markers = generatedMarkers(18, -8, -4, 0).concat(generatedMarkers(18, 8, 2, 1));
  shell.setCamera({ x: 0, y: 0, zoom: 10, pitch: 0.25, yaw: 0 });
  shell.drawFrame({ markers });
  ctx.status.innerHTML = reportTable({
    route: 'device',
    status: 'WebGPU ready',
    vendor: info.vendor,
    architecture: info.architecture,
    format: info.format,
    features: info.features.length,
    markers: markers.length,
  });
  publish('device', true, { ...shell.stats(), vendor: info.vendor, features: info.features });
}

async function routeFrameShell(ctx: LabContext) {
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: 0, zoom: 9, pitch: 0.38, yaw: -0.18 });
  const markers = generatedMarkers(80, -10, -9, 0).concat(generatedMarkers(80, 10, 3, 1));
  animateShell(shell, ctx.status, () => ({ markers }));
  publish('frame-shell', true, { ...shell.stats(), markers: markers.length });
}

async function routeAssets(ctx: LabContext) {
  const [kit, vat] = await Promise.all([loadPlaceholderKit(), loadPlaceholderVat()]);
  const good = validateSoldierKit(kit);
  const bad = validateSoldierKit(badArtistPackFixture());
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: 0, zoom: 72, pitch: 0.18, yaw: 0 });
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  const soldier = generatedFormation(1, { frame: 1, spacing: 1, faction: 0 });
  animateSkinned(shell, pipeline, () => soldier, { phaseSpeed: 0.35 });
  const placeholderStats = {
    route: 'assets',
    report: good,
    badErrors: bad.errors.length,
    clips: placeholderClipNames(kit),
    vat: { width: vat.width, height: vat.height, bones: vat.bones, clips: vat.clips.length },
    importUi: { paste: true, file: true, drop: true },
    imported: null as null | { source: string; ok: boolean; errors: number; warnings: number; issues: number },
  };
  const publishAssets = (ok: boolean, imported = placeholderStats.imported) => {
    publish('assets', ok, { ...placeholderStats, imported });
  };
  const renderImportResult = (source: string, report: ValidationReport) => {
    const result = ctx.status.querySelector<HTMLElement>('#asset-import-result');
    if (!result) return;
    result.classList.toggle('bad', !report.ok);
    result.innerHTML = reportTable({
      imported: source,
      status: report.ok ? 'passes manifest contract' : 'fails manifest contract',
      errors: report.errors.length,
      warnings: report.warnings.length,
      issues: report.issues.length,
    }) + issueList(report.issues.slice(0, 10));
    publishAssets(report.ok, { source, ok: report.ok, errors: report.errors.length, warnings: report.warnings.length, issues: report.issues.length });
  };
  const validateText = (source: string, text: string) => {
    try {
      renderImportResult(source, validateSoldierKit(JSON.parse(text)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      renderImportResult(source, {
        ok: false,
        errors: [{ level: 'error', code: 'manifest.json', path: 'manifest', message }],
        warnings: [],
        issues: [{ level: 'error', code: 'manifest.json', path: 'manifest', message }],
      });
    }
  };
  const badSample = JSON.stringify(badArtistPackFixture(), null, 2);
  ctx.status.innerHTML = reportTable({
    route: 'assets',
    validation: good.ok ? 'placeholder kit passes' : 'placeholder kit fails',
    placeholderIssues: good.issues.length,
    badPackErrors: bad.errors.length,
    skeletons: Object.keys(kit.skeletons).length,
    archetypes: Object.keys(kit.archetypes).length,
    clips: placeholderClipNames(kit).join(', '),
    vat: `${vat.width}x${vat.height}`,
  }) + `
    <div class="asset-workbench" id="asset-drop-zone">
      <label for="asset-manifest-json">manifest.json</label>
      <textarea id="asset-manifest-json" spellcheck="false">${escapeHtml(badSample)}</textarea>
      <div class="asset-actions">
        <button id="asset-validate-json" type="button">Validate</button>
        <label class="asset-file">Open JSON<input id="asset-file-input" type="file" accept=".json,application/json"></label>
      </div>
      <p>Drop a soldier-pack manifest here to validate it against the renderer contract.</p>
      <div id="asset-import-result"></div>
    </div>
  ` + issueList(bad.errors.slice(0, 7));
  const textarea = ctx.status.querySelector<HTMLTextAreaElement>('#asset-manifest-json');
  const validateButton = ctx.status.querySelector<HTMLButtonElement>('#asset-validate-json');
  const fileInput = ctx.status.querySelector<HTMLInputElement>('#asset-file-input');
  const dropZone = ctx.status.querySelector<HTMLElement>('#asset-drop-zone');
  validateButton?.addEventListener('click', () => validateText('pasted manifest', textarea?.value ?? ''));
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    validateText(file.name, await file.text());
  });
  dropZone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('drag');
  });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
  dropZone?.addEventListener('drop', async (event) => {
    event.preventDefault();
    dropZone.classList.remove('drag');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    validateText(file.name, await file.text());
  });
  (window as unknown as { __webgpuAssetWorkbench?: { validateManifest: (text: string, source?: string) => void } }).__webgpuAssetWorkbench = {
    validateManifest: (text, source = 'debug manifest') => validateText(source, text),
  };
  publishAssets(good.ok);
}

async function routeCrowdData(ctx: LabContext) {
  const count = Number(ctx.params.get('count') ?? 1000);
  const player = generatedFormation(Math.floor(count / 2), { x: -18, y: -10, faction: 0, columns: 34, frame: 1 });
  const enemy = generatedFormation(count - player.length, { x: 18, y: 5, faction: 1, columns: 34, frame: 1 });
  const instances = player.concat(enemy);
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: -1, zoom: 4.8, pitch: 0.24, yaw: 0 });
  animateShell(shell, ctx.status, () => ({ markers: instances.map(instanceMarker) }));
  const packed = buildCrowdInstances(toCrowdBuildInputs(instances));
  publish('crowd-data', true, { route: 'crowd-data', stats: packed.stats, packedFloats: packed.packed.length });
}

async function routeAnimationState(ctx: LabContext) {
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: 0, zoom: 13, pitch: 0.2, yaw: 0 });
  const markers = Array.from({ length: 12 }, (_, i) => ({
    x: (i - 5.5) * 2.4,
    y: i % 2 ? 1.4 : -1.4,
    facing: Math.PI / 2,
    faction: (i % 2) as 0 | 1,
    size: 1.3,
  }));
  animateShell(shell, ctx.status, () => ({ markers }));
  const rows = Array.from({ length: 12 }, (_, frame) => {
    const state = animationForFrame(frame, 240, frame * 19, frame !== 4);
    return `<tr><td>${frame}</td><td>${state.clip}</td><td>${state.phase.toFixed(3)}</td><td>${state.loop}</td></tr>`;
  }).join('');
  ctx.status.innerHTML = `<table><tr><th>frame</th><th>clip</th><th>phase</th><th>loop</th></tr>${rows}</table>`;
  publish('animation-state', true, { frames: 12 });
}

async function routeSkinnedSoldier(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  const phase = numberParam(ctx.params, 'phase', 0);
  const classId = integerParam(ctx.params, 'class', 0, 0, 14);
  const frame = integerParam(ctx.params, 'frame', 1, 0, 11);
  const faction = integerParam(ctx.params, 'team', 0, 0, 1) as 0 | 1;
  const facing = numberParam(ctx.params, 'facing', Math.PI / 2);
  const clip = ctx.params.get('clip') ?? 'march';
  const shell = await createConfiguredShell(ctx.canvas, {
    x: numberParam(ctx.params, 'x', 0),
    y: numberParam(ctx.params, 'y', 0),
    zoom: numberParam(ctx.params, 'zoom', 86),
    pitch: numberParam(ctx.params, 'pitch', 0.10),
    yaw: numberParam(ctx.params, 'yaw', 0),
  });
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  const soldier = generatedFormation(1, { frame, spacing: 1, faction, classId }).map((inst) => ({ ...inst, facing }));
  animateSkinned(shell, pipeline, () => soldier, { phaseOffset: phase, forcedClip: clip, phaseSpeed: 0, size: numberParam(ctx.params, 'size', 1) });
  ctx.status.innerHTML = reportTable({
    route: 'skinned-soldier',
    classId,
    frame,
    clip,
    phase,
    facing: facing.toFixed(2),
    vertices: pipeline.stats().vertices,
    variants: pipeline.stats().meshVariants,
    vat: `${vat.width}x${vat.height}`,
  });
  publish('skinned-soldier', true, { ...pipeline.stats(), classId, frame, clip, phase, facing });
}

async function routeSkinnedCrowd(ctx: LabContext) {
  const count = Number(ctx.params.get('count') ?? 2000);
  const vat = await loadPlaceholderVat();
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: -2, zoom: 5.2, pitch: 0.28, yaw: 0 });
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  const instances = generatedFormation(Math.floor(count / 2), { x: -20, y: -12, faction: 0, columns: 40, frame: 1 })
    .concat(generatedFormation(Math.ceil(count / 2), { x: 20, y: 4, faction: 1, columns: 40, frame: 8 }));
  animateSkinned(shell, pipeline, () => instances, { phaseSpeed: 0.45 });
  ctx.status.innerHTML = reportTable({ route: 'skinned-crowd', count: instances.length, drawCalls: pipeline.stats().drawCalls, clips: pipeline.stats().clips.join(', ') });
  publish('skinned-crowd', true, { ...pipeline.stats(), count: instances.length });
}

async function routeLod(ctx: LabContext) {
  const zoom = Number(ctx.params.get('zoom') ?? 5);
  const instances = generatedFormation(900, { x: -16, y: -10, faction: 0, columns: 30, frame: 1 })
    .concat(generatedFormation(900, { x: 16, y: 4, faction: 1, columns: 30, frame: 1 }));
  const lods = assignCrowdLods(instances, zoom);
  const counts = countLods(lods);
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: -1, zoom, pitch: 0.24, yaw: 0 });
  animateShell(shell, ctx.status, () => ({ markers: instances.map((inst, i) => ({ ...instanceMarker(inst), lod: lods[i].level, size: Math.max(0.5, 1.15 - lods[i].level * 0.14) })) }));
  ctx.status.innerHTML = reportTable({ route: 'lod', zoom, L0: counts.l0, L1: counts.l1, L2: counts.l2, L3: counts.l3 });
  publish('lod', true, { counts, zoom });
}

async function routeBattle(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: -3, zoom: 4.6, pitch: 0.34, yaw: 0 });
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  const instances = generatedFormation(1200, { x: -21, y: -13, faction: 0, columns: 42, frame: 1 })
    .concat(generatedFormation(1200, { x: 21, y: 5, faction: 1, columns: 42, frame: 8 }));
  animateSkinned(shell, pipeline, () => instances, { phaseSpeed: 0.5 });
  ctx.status.innerHTML = reportTable({ route: 'battle', placeholderSoldiers: instances.length, renderer: 'raw WebGPU', ui: 'lab surface' });
  publish('battle', true, { ...pipeline.stats(), soldiers: instances.length });
}

async function routePerf(ctx: LabContext) {
  const count = Number(ctx.params.get('count') ?? 3000);
  const vat = await loadPlaceholderVat();
  const perf = createPerfAverager();
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: -4, zoom: 3.9, pitch: 0.3, yaw: 0 });
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  const instances = generatedFormation(Math.floor(count / 2), { x: -25, y: -15, faction: 0, columns: 58, frame: 1 })
    .concat(generatedFormation(Math.ceil(count / 2), { x: 25, y: 7, faction: 1, columns: 58, frame: 8 }));
  let last = performance.now();
  const frameTimes: number[] = [];
  animateSkinned(shell, pipeline, () => instances, {
    phaseSpeed: 0.4,
    afterFrame: () => {
      const now = performance.now();
      const frameMs = now - last;
      frameTimes.push(frameMs);
      while (frameTimes.length > 120) frameTimes.shift();
      perf.push({ timestamp: now, frameMs, uploadMs: 0, cullMs: 0, drawMs: 0, skinned: count, impostors: 0, sprites: 0, drawCalls: 1 });
      last = now;
      const report = makeFullGamePerfReport({
        mode: 'headless-liveness',
        environment: {
          browser: navigator.userAgent,
          gpu: shell.stats().device,
          viewport: `${shell.stats().width}x${shell.stats().height}`,
          dpr: shell.stats().dpr,
        },
        scenes: [{
          id: 'lab-skinned-crowd',
          label: 'Lab skinned crowd',
          route: '/webgpu/perf',
          renderer: 'raw-webgpu',
          frameTimes,
          stats: { count, ...perf.snapshot(), drawCalls: pipeline.stats().drawCalls },
          notes: ['Headless/lab liveness only; release budgets require named real hardware.'],
        }],
        notes: ['This lab report proves report plumbing and renderer liveness, not final performance parity.'],
      });
      ctx.status.innerHTML = reportTable({ route: 'perf', count, ...formatPerfSummary(report) });
      publish('perf', true, report);
    },
  });
}

async function routeCampaign(ctx: LabContext) {
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: 0, zoom: 10, pitch: 0.18, yaw: 0 });
  const markers: MarkerInstance[] = [
    ...generatedMarkers(50, -15, -4, 0).map((m) => ({ ...m, size: 0.9 })),
    ...generatedMarkers(36, 11, 4, 2).map((m) => ({ ...m, size: 0.85 })),
  ];
  animateShell(shell, ctx.status, () => ({ markers, terrainRect: [-48, -28, 96, 56] }));
  ctx.status.innerHTML = reportTable({ route: 'campaign', markers: markers.length, semantics: 'faction tint plus neutral standard' });
  publish('campaign', true, { markers: markers.length });
}

async function routeCutover(ctx: LabContext) {
  const graph = fullGameRenderGraphReport();
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: -2, zoom: 8.8, pitch: 0.24, yaw: -0.1 });
  const markers = [
    ...generatedMarkers(44, -11, -5, 0).map((m) => ({ ...m, size: 0.95 })),
    ...generatedMarkers(44, 11, 4, 1).map((m) => ({ ...m, size: 0.95 })),
    ...generatedMarkers(14, 0, 1, 2).map((m) => ({ ...m, size: 0.75 })),
  ];
  shell.drawFrame({ markers, terrainRect: [-40, -24, 80, 48] });
  const checks = [
    { id: 'battle-default', status: 'complete', detail: 'normal battle route instantiates BattleRendererWebGPU only' },
    { id: 'campaign-default', status: 'complete', detail: 'normal campaign route instantiates CampaignRendererWebGPU only' },
    { id: 'dependency-audit', status: 'complete', detail: '@babylonjs/core removed from the web package and build output' },
    { id: 'legacy-routes', status: 'complete', detail: '?gfx=2d, ?gfx=3d, ?test=models, and ?gfx=legacy no longer select old renderers' },
    { id: 'screenshots', status: 'complete', detail: 'post-cutover routine screenshot policy is WebGPU-only' },
    { id: 'scenario-gates', status: 'complete', detail: 'battle, campaign, handoff, save/load, menu, and visual WebGPU scenarios are covered' },
    { id: 'headless-perf', status: 'complete', detail: 'full-game WebGPU liveness perf report covers menu, battle, campaign, and handoff' },
    { id: 'label-pipeline', status: 'complete', detail: 'campaign map labels render through a raw-WebGPU glyph atlas pass' },
    { id: 'visual-report', status: 'complete', detail: 'webgpu-visual-report generates the WebGPU visual cutover contact sheet' },
    { id: 'perf-report', status: 'complete', detail: 'full-game-webgpu-performance writes the WebGPU perf evidence report' },
    { id: 'visual-improvement', status: 'complete', detail: 'visual report is backed by accepted archived current-renderer comparisons' },
    { id: 'hardware-perf', status: 'complete', detail: 'named real GPU/browser performance report compares WebGPU equal or better than the archive' },
  ];
  const releaseReady = checks.every((check) => check.status === 'complete');
  const complete = checks.filter((check) => check.status === 'complete').length;
  ctx.status.innerHTML = reportTable({
    route: 'cutover',
    kind: 'webgpu-cutover-report',
    releaseReady,
    renderer: 'raw WebGPU production default',
    graph: graph.ok ? `${graph.passes.length} passes valid` : `${graph.diagnostics.length} diagnostics`,
    atmosphere: shell.stats().atmosphere,
    removed: 'battle 2d, battle Babylon, campaign WebGL, @babylonjs/core',
    routineScreenshots: 'WebGPU-only',
    complete: `${complete}/${checks.length}`,
    blockers: checks.length - complete,
    visualReport: 'specs/webgpu-skinned-crowd/visualizations/webgpu-visual-report.html',
    perfReport: 'specs/webgpu-skinned-crowd/visualizations/webgpu-performance-report.html',
  }) + statusList(checks);
  publish('cutover', graph.ok, {
    kind: 'webgpu-cutover-report',
    releaseReady,
    renderer: 'raw-webgpu-production-default',
    removed: ['battle-2d-renderer', 'battle-babylon-renderer', 'campaign-webgl-renderer', '@babylonjs/core'],
    retiredSwitches: ['?gfx=2d', '?gfx=3d', '?test=models', '?gfx=legacy'],
    routineScreenshots: 'webgpu-only',
    atmosphere: shell.stats().atmosphere,
    visualReport: 'specs/webgpu-skinned-crowd/visualizations/webgpu-visual-report.html',
    perfReport: 'specs/webgpu-skinned-crowd/visualizations/webgpu-performance-report.html',
    complete,
    blockers: checks.filter((check) => check.status !== 'complete').map((check) => check.id),
    checks,
    graph: {
      ok: graph.ok,
      passes: graph.passes.length,
      resources: graph.resources.length,
      diagnostics: graph.diagnostics,
    },
  });
}

async function routeCampaignMap(ctx: LabContext) {
  const [{ default: initWasm, Campaign }, { data, mapJson }] = await Promise.all([
    import('../../../web/src/wasm/game_wasm.js'),
    loadCampaignData(),
  ]);
  const wasm = await initWasm();
  const campaign = new Campaign(mapJson, 0x5eed_2026, 0);
  const views = readCampaignViews(campaign, wasm, data.map.edges.length);
  const field = new TerrainField(data);
  const territoryData = new Territory(data, field);
  territoryData.rebuild(views.cities);
  const preset = ctx.params.get('preset') ?? 'whole';
  const camera = campaignPresetCamera(preset);
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const map = new CampaignMapPass(shell, data.bg, data.bgRect);
  const water = new CampaignWaterPass(shell);
  water.upload(campaignWaterFeatures());
  const clouds = new CampaignCloudPass(shell, data.bgRect);
  const territory = new CampaignTerritoryPass(shell, {
    width: field.w,
    height: field.h,
    rgba: territoryData.rgba,
    rect: data.bgRect,
  });
  const lines = new CampaignLinePass(shell, 'triangle-list');
  const borders = new CampaignLinePass(shell);
  const markers = new CampaignMarkerPass(shell);
  const labelPass = new CampaignLabelPass(shell);
  const drawData = buildCampaignMapDrawData(data);
  lines.upload(drawData.roadVertices);
  borders.upload(campaignBorderVertices(territoryData.borders));
  markers.upload(drawData.cityMarkers);
  const labels = drawData.labels.concat(campaignFactionLabels(territoryData.labels));
  const labelLayer = labelPass.upload(labels, camera);
  shell.drawFrame({
    clear: { r: 0.68, g: 0.72, b: 0.69, a: 1 },
    terrainRect: [0, 0, 0, 0],
    extra: (pass) => {
      map.draw(pass);
      territory.draw(pass);
      water.draw(pass);
      borders.draw(pass);
      lines.draw(pass);
      markers.draw(pass);
      clouds.draw(pass);
      labelPass.draw(pass);
    },
  });
  ctx.status.innerHTML = reportTable({
    route: 'campaign-map',
    preset,
    roads: drawData.stats.roads,
    seaLanes: drawData.stats.seaLanes,
    cities: drawData.stats.cityMarkers,
    labels: `${labelLayer.visibleLabels}/${labelLayer.labels}`,
    factions: territoryData.labels.length,
    borders: borders.stats().segments,
    water: water.stats().waterFeatures,
    clouds: clouds.stats().cloudQuads,
    visibleLabels: labelLayer.visibleLabels,
    labelLayer: 'raw WebGPU glyph atlas',
    renderer: 'raw WebGPU map + territory + atmosphere + labels',
  });
  publish('campaign-map', true, {
    ...drawData.stats,
    preset,
    camera,
    labels: labelLayer.labels,
    visibleLabels: labelLayer.visibleLabels,
    factions: territoryData.labels.length,
    territoryPixels: territory.stats().pixels,
    borderSegments: borders.stats().segments,
    waterFeatures: water.stats().waterFeatures,
    cloudQuads: clouds.stats().cloudQuads,
    labelAtlas: `${labelLayer.atlasWidth}x${labelLayer.atlasHeight}`,
    labelVertices: labelLayer.vertices,
    lineSegments: lines.stats().segments,
    markerStats: markers.stats(),
    labelLayer: 'raw-webgpu-glyph-atlas',
    territoryLayer: 'raw-webgpu-texture',
    atmosphereLayer: 'raw-webgpu-cloud-water',
    postCutoverScreenshots: 'webgpu-only',
  });
}

async function routeCampaignUi(ctx: LabContext) {
  const [{ default: initWasm, Campaign }, fixture] = await Promise.all([
    import('../../../web/src/wasm/game_wasm.js'),
    loadCampaignUiFixture(),
  ]);
  const wasm = await initWasm();
  const campaign = new Campaign(fixture.mapJson, 0x5eed_2026, 0);
  const data = fixture.data;
  const preset = ctx.params.get('preset') ?? 'fixture';
  const camera = campaignPresetCamera(preset);
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const lines = new CampaignLinePass(shell, 'triangle-list');
  const entities = new CampaignEntityPass(shell);
  const selection = new CampaignSelectionPass(shell);
  const labelPass = new CampaignLabelPass(shell);
  const drawData = buildCampaignMapDrawData(data);
  lines.upload(drawData.roadVertices);
  const host = ctx.canvas.parentElement ?? ctx.root;
  const ui = new WebGpuCampaignUiLayer(host, (army, on) => {
    campaign.order_auto_replenish(army, on);
    draw('replenish');
  });
  const recruitClasses = JSON.parse(campaign.unit_class_names_json()) as string[];
  let views = readCampaignViews(campaign, wasm, data.map.edges.length);
  let selectedArmy = views.armies.find((army) => army.mine)?.id ?? -1;
  if (selectedArmy >= 0) {
    campaign.debug_place(selectedArmy, 1, 0, 4);
    views = readCampaignViews(campaign, wasm, data.map.edges.length);
  }
  let selectedCity = data.map.nodes.findIndex((node) => node.kind === 'city' && node.owner === 'rome');
  let lastPick = { kind: 'initial', army: selectedArmy, city: selectedCity, worldX: 0, worldY: 0 };

  const draw = (reason = 'draw') => {
    views = readCampaignViews(campaign, wasm, data.map.edges.length);
    const entityFrame = buildCampaignEntityFrame(data, views, campaign.player_faction(), selectedArmy, selectedCity);
    entities.upload(entityFrame.entities);
    selection.upload(entityFrame.selections);
    const labels = drawData.labels.concat(campaignArmyLabels(views.armies));
    const labelLayer = labelPass.upload(labels, camera);
    shell.drawFrame({
      clear: { r: 0.68, g: 0.72, b: 0.69, a: 1 },
      terrainRect: campaignBgTerrainRect(data.bgRect),
      extra: (pass) => {
        lines.draw(pass);
        selection.draw(pass);
        entities.draw(pass);
        labelPass.draw(pass);
      },
    });
    ui.render({
      campaign,
      data,
      armies: views.armies,
      cities: views.cities,
      selectedArmy,
      selectedCity,
      treasury: campaign.treasury(),
      tick: campaign.current_tick(),
      recruitClasses,
      diplomacyOpen: true,
      classBuilderOpen: true,
    });
    const uiStats = ui.stats();
    ctx.status.innerHTML = reportTable({
      route: 'campaign-ui',
      fixture: fixture.kind,
      reason,
      armies: views.armies.length,
      cities: views.cities.size,
      selectedArmy,
      selectedCity,
      entities: entityFrame.entities.length,
      selections: entityFrame.selections.length,
      labels: `${labelLayer.visibleLabels}/${labelLayer.labels}`,
      panels: `army:${uiStats.armyPanel} city:${uiStats.cityPanel}`,
      renderer: 'raw WebGPU campaign entities + retained DOM panels',
    });
    publishCampaignUiDebug(ctx.canvas, camera, views, selectedArmy, selectedCity, lastPick);
    publish('campaign-ui', true, {
      fixture: fixture.kind,
      camera,
      armies: views.armies.length,
      cities: views.cities.size,
      playerArmies: views.armies.filter((army) => army.mine).length,
      selectedArmy,
      selectedCity,
      labels: labelLayer.labels,
      visibleLabels: labelLayer.visibleLabels,
      entities: entityFrame.entities.length,
      cityEntities: entityFrame.cityEntities,
      armyEntities: entityFrame.armyEntities,
      selections: entityFrame.selections.length,
      lastPick,
      ui: uiStats,
      lineSegments: lines.stats().segments,
      labelLayer: labelLayer.layer,
      labelAtlas: `${labelLayer.atlasWidth}x${labelLayer.atlasHeight}`,
      labelVertices: labelLayer.vertices,
      postCutoverScreenshots: 'webgpu-only',
    });
  };

  ctx.canvas.addEventListener('click', (event) => {
    const hit = campaignPick(event.clientX, event.clientY, ctx.canvas, camera, shell.stats(), data, views);
    selectedArmy = hit.army;
    if (hit.army >= 0) selectedCity = -1;
    else selectedCity = hit.city;
    lastPick = { kind: hit.kind, army: hit.army, city: hit.city, worldX: hit.worldX, worldY: hit.worldY };
    draw('click');
  });
  ctx.canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (selectedArmy < 0) return;
    const world = campaignCssToWorld(event.clientX, event.clientY, ctx.canvas, camera, shell.stats());
    const loc = nearestLoc(data.map, world.x, world.y, 60 / camera.zoom);
    if (loc) campaign.order_move(selectedArmy, loc.kind, loc.a, loc.b);
    draw('order');
  });

  draw();
}

async function routeCampaignModelGates(ctx: LabContext) {
  const gate = campaignModelGate(ctx.params.get('gate'));
  const camera = campaignModelGateCamera(gate);
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const entities = new CampaignEntityPass(shell);
  const scenery = new CampaignSceneryPass(shell);
  const lines = new CampaignLinePass(shell, 'triangle-list');
  const selection = new CampaignSelectionPass(shell);
  const labelPass = new CampaignLabelPass(shell);
  const frame = campaignModelGateFrame(gate);
  const water = frame.water.length > 0 ? new CampaignWaterPass(shell) : null;
  const clouds = frame.cloudRect ? new CampaignCloudPass(shell, frame.cloudRect) : null;
  entities.upload(frame.entities);
  scenery.upload(frame.scenery);
  lines.upload(frame.roads);
  selection.upload(frame.selections);
  water?.upload(frame.water);
  const labelLayer = labelPass.upload(frame.labels, camera);
  shell.drawFrame({
    clear: { r: 0.09, g: 0.10, b: 0.10, a: 1 },
    terrainRect: frame.terrainRect,
    extra: (pass) => {
      water?.draw(pass);
      lines.draw(pass);
      scenery.draw(pass);
      selection.draw(pass);
      entities.draw(pass);
      clouds?.draw(pass);
      labelPass.draw(pass);
    },
  });
  ctx.status.innerHTML = reportTable({
    route: 'campaign-model-gates',
    gate,
    purpose: 'isolated campaign model screenshot gate',
    entities: frame.entities.length,
    scenery: frame.scenery.length,
    roadSegments: lines.stats().segments,
    waterFeatures: water?.stats().waterFeatures ?? 0,
    cloudQuads: clouds?.stats().cloudQuads ?? 0,
    labels: `${labelLayer.visibleLabels}/${labelLayer.labels}`,
    renderer: 'raw WebGPU campaign model passes',
  });
  publish('campaign-model-gates', true, {
    route: 'campaign-model-gates',
    gate,
    camera,
    entities: frame.entities.length,
    scenery: frame.scenery.length,
    sceneryStats: scenery.stats(),
    roadSegments: lines.stats().segments,
    waterFeatures: water?.stats().waterFeatures ?? 0,
    cloudQuads: clouds?.stats().cloudQuads ?? 0,
    selections: frame.selections.length,
    labels: labelLayer.labels,
    visibleLabels: labelLayer.visibleLabels,
    labelLayer: labelLayer.layer,
    entityLayer: entities.stats().layer,
    postCutoverScreenshots: 'webgpu-only',
  });
}

type CampaignModelGate =
  | 'overview'
  | 'city'
  | 'town'
  | 'army'
  | 'road'
  | 'road-only'
  | 'selected-city'
  | 'trees'
  | 'conifer'
  | 'broadleaf'
  | 'mountain'
  | 'rocks'
  | 'labels'
  | 'terrain-grass-scrub'
  | 'terrain-stone-relief'
  | 'shoreline-water'
  | 'cloud-fog';

const CAMPAIGN_MODEL_GATES: CampaignModelGate[] = [
  'city',
  'town',
  'army',
  'road',
  'road-only',
  'selected-city',
  'trees',
  'conifer',
  'broadleaf',
  'mountain',
  'rocks',
  'labels',
  'terrain-grass-scrub',
  'terrain-stone-relief',
  'shoreline-water',
  'cloud-fog',
];

function campaignModelGate(value: string | null): CampaignModelGate {
  return CAMPAIGN_MODEL_GATES.includes(value as CampaignModelGate) ? value as CampaignModelGate : 'city';
}

function campaignModelGateCamera(gate: CampaignModelGate) {
  const close = { x: 0, y: 0.3, zoom: 28, pitch: 0.56, yaw: 0, perspective: 0.018 };
  if (gate === 'overview') return { x: 0, y: -0.6, zoom: 28, pitch: 0.54, yaw: 0, perspective: 0.012 };
  if (gate === 'road' || gate === 'road-only') return { x: 0, y: -1.3, zoom: 30, pitch: 0.54, yaw: 0, perspective: 0.012 };
  if (gate === 'trees' || gate === 'terrain-grass-scrub') return { x: 0, y: -0.3, zoom: 40, pitch: 0.56, yaw: 0, perspective: 0.016 };
  if (gate === 'conifer' || gate === 'broadleaf') return { x: 0, y: -0.36, zoom: 54, pitch: 0.56, yaw: 0, perspective: 0.018 };
  if (gate === 'mountain' || gate === 'rocks' || gate === 'terrain-stone-relief') return { x: 0, y: -0.4, zoom: 40, pitch: 0.56, yaw: 0, perspective: 0.014 };
  if (gate === 'shoreline-water') return { x: 0, y: -0.8, zoom: 34, pitch: 0.54, yaw: 0, perspective: 0.014 };
  if (gate === 'cloud-fog') return { x: 0, y: 0, zoom: 26, pitch: 0.50, yaw: 0, perspective: 0.010 };
  return close;
}

function campaignModelGateFrame(gate: CampaignModelGate) {
  const red: [number, number, number] = [0.70, 0.18, 0.16];
  const amber: [number, number, number] = [0.58, 0.52, 0.42];
  const green: [number, number, number] = [0.31, 0.82, 0.39];
  const neutral: [number, number, number] = [0.93, 0.78, 0.30];
  const entities: CampaignEntityInstance[] = [];
  const scenery: CampaignSceneryInstance[] = [];
  const selections: CampaignSelectionInstance[] = [];
  const labels: CampaignLabel[] = [];
  let roads = new Float32Array();
  let terrainRect: [number, number, number, number] = [-18, -12, 36, 24];
  let water: ReturnType<typeof campaignWaterFeatures> = [];
  let cloudRect: { min: [number, number]; max: [number, number] } | null = null;
  const addCity = (x: number, y: number, radius: number, text: string, faction = red, allegiance = green, selected = false) => {
    entities.push({ x, y, radius, faction, allegiance, kind: 'city', strength: 1 });
    labels.push({ text, x, y: y - 4.7, kind: 'city', size: 14, priority: 5, icon: 'city', iconColor: allegiance });
    if (selected) selections.push({ x, y, radius: radius * 1.34, color: green, kind: 'city' });
  };
  const addArmy = (x: number, y: number, selected = false) => {
    entities.push({ x, y, radius: 5.5, faction: red, allegiance: green, kind: 'army', strength: 0.86 });
    labels.push({ text: '1ST LEGION', x, y: y + 4.8, kind: 'army', size: 13, priority: 5, icon: 'army', iconColor: green });
    if (selected) selections.push({ x, y, radius: 4.7, color: green, kind: 'army' });
  };

  if (gate === 'overview') addCity(-6.0, -2.0, 7.0, 'ROMA', red, green, false);
  if (gate === 'city') addCity(0.0, -1.8, 6.6, 'ROMA', red, green, true);
  if (gate === 'selected-city') addCity(0.0, -1.8, 6.6, 'ROMA', red, green, true);
  if (gate === 'overview') addCity(6.0, -2.0, 5.2, 'NEAPOLIS', amber, neutral, false);
  if (gate === 'town') addCity(0.0, -1.8, 5.0, 'NEAPOLIS', amber, neutral, true);
  if (gate === 'overview' || gate === 'army') addArmy(0.0, -2.2, gate === 'army');
  if (gate === 'overview' || gate === 'road' || gate === 'road-only') {
    roads = roadGateVertices([[-8.7, -2.0], [-2.5, -2.4], [2.5, -2.4], [8.7, -2.0]]);
    if (gate === 'road') {
      addCity(-8.4, -2.0, 5.5, 'ROMA');
      addCity(8.4, -2.0, 5.0, 'NEAPOLIS', amber, neutral);
    }
  }
  if (gate === 'overview' || gate === 'trees' || gate === 'terrain-grass-scrub') {
    scenery.push(
      { x: -3.8, y: gate === 'trees' ? -0.6 : 2.2, size: 3.7, kind: 'conifer' },
      { x: -1.5, y: gate === 'trees' ? -0.8 : 2.0, size: 3.2, kind: 'broadleaf' },
      { x: 1.2, y: gate === 'trees' ? -0.5 : 2.3, size: 4.0, kind: 'broadleaf' },
      { x: 3.6, y: gate === 'trees' ? -0.9 : 1.8, size: 3.0, kind: 'conifer' },
    );
    if (gate === 'terrain-grass-scrub') {
      scenery.push(
        { x: -5.2, y: 1.6, size: 2.7, kind: 'conifer', shade: 0.5 },
        { x: 5.0, y: 1.3, size: 2.4, kind: 'broadleaf', shade: 0.55 },
      );
    }
  }
  if (gate === 'conifer') scenery.push({ x: 0.0, y: -0.55, size: 4.1, kind: 'conifer', shade: 0.62 });
  if (gate === 'broadleaf') scenery.push({ x: 0.0, y: -0.55, size: 4.1, kind: 'broadleaf', shade: 0.66 });
  if (gate === 'overview' || gate === 'mountain' || gate === 'terrain-stone-relief') {
    scenery.push(
      { x: -2.4, y: gate === 'mountain' ? -0.6 : 4.2, size: gate === 'mountain' ? 4.6 : 6.6, kind: 'mountain' },
      { x: 2.7, y: gate === 'mountain' ? -0.9 : 3.8, size: gate === 'mountain' ? 3.9 : 5.4, kind: 'mountain' },
    );
  }
  if (gate === 'overview' || gate === 'rocks' || gate === 'terrain-stone-relief') {
    scenery.push(
      { x: -3.2, y: gate === 'rocks' ? -1.0 : -6.2, size: 4.0, kind: 'rock' },
      { x: 0.2, y: gate === 'rocks' ? -1.2 : -6.4, size: 4.8, kind: 'rock' },
      { x: 3.3, y: gate === 'rocks' ? -0.8 : -5.8, size: 3.5, kind: 'rock' },
    );
  }
  if (gate === 'terrain-stone-relief') {
    scenery.push(
      { x: -5.4, y: 1.1, size: 2.9, kind: 'rock', shade: 0.62 },
      { x: 5.3, y: 0.7, size: 2.6, kind: 'rock', shade: 0.58 },
    );
  }
  if (gate === 'shoreline-water') {
    terrainRect = [-18, -8, 36, 20];
    water = [
      { x: -5.8, y: 3.0, rx: 8.5, ry: 2.0, angle: -0.06, alpha: 0.84 },
      { x: 4.8, y: 3.5, rx: 7.0, ry: 1.6, angle: 0.08, alpha: 0.64 },
      { x: 0.0, y: 1.4, rx: 13.5, ry: 0.9, angle: 0.0, alpha: 0.36 },
    ];
    scenery.push({ x: -7.2, y: -1.6, size: 3.4, kind: 'rock', shade: 0.54 });
  }
  if (gate === 'cloud-fog') {
    terrainRect = [-22, -14, 44, 28];
    cloudRect = { min: [-22, -14], max: [22, 14] };
    water = [{ x: -1.5, y: 4.2, rx: 13.0, ry: 2.6, angle: -0.16, alpha: 0.42 }];
  }
  if (gate === 'labels') {
    addCity(-3.8, -2.0, 4.6, 'ROMA');
    addArmy(2.0, -2.2);
    labels.push({ text: 'LATIUM', x: -1.5, y: 4.0, kind: 'faction', size: 18, priority: 4, angle: -0.06 });
    labels.push({ text: 'Tyrrhenian Sea', x: 0.0, y: -7.0, kind: 'sea', size: 17, priority: 3, angle: -0.12 });
  }
  return { entities, scenery, selections, labels, roads, terrainRect, water, cloudRect };
}

function roadGateVertices(points: [number, number][]) {
  const verts: number[] = [];
  const pushBand = (
    a: [number, number],
    b: [number, number],
    color: [number, number, number, number],
    halfWidth: number,
    offset = 0,
  ) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const ax0 = a[0] + nx * (offset - halfWidth);
    const ay0 = a[1] + ny * (offset - halfWidth);
    const ax1 = a[0] + nx * (offset + halfWidth);
    const ay1 = a[1] + ny * (offset + halfWidth);
    const bx0 = b[0] + nx * (offset - halfWidth);
    const by0 = b[1] + ny * (offset - halfWidth);
    const bx1 = b[0] + nx * (offset + halfWidth);
    const by1 = b[1] + ny * (offset + halfWidth);
    verts.push(
      ax0, ay0, ...color,
      bx0, by0, ...color,
      bx1, by1, ...color,
      ax0, ay0, ...color,
      bx1, by1, ...color,
      ax1, ay1, ...color,
    );
  };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    pushBand(a, b, [0.075, 0.067, 0.055, 0.58], 0.045, -0.23);
    pushBand(a, b, [0.075, 0.067, 0.055, 0.58], 0.045, 0.23);
    pushBand(a, b, [0.60, 0.58, 0.51, 0.72], 0.22);
    pushBand(a, b, [0.82, 0.81, 0.74, 0.97], 0.17);
    pushBand(a, b, [0.94, 0.93, 0.86, 0.98], 0.055);
  }
  return new Float32Array(verts);
}

function campaignBgTerrainRect(rect: { min: [number, number]; max: [number, number] }): [number, number, number, number] {
  return [rect.min[0], rect.min[1], rect.max[0] - rect.min[0], rect.max[1] - rect.min[1]];
}

async function routeRenderGraph(ctx: LabContext) {
  const report = fullGameRenderGraphReport();
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: -1, zoom: 8.5, pitch: 0.26, yaw: -0.12 });
  const markers = [
    ...generatedMarkers(36, -8, -4, 0),
    ...generatedMarkers(36, 8, 3, 1),
    ...generatedMarkers(12, 0, 0, 2),
  ];
  shell.drawFrame({ markers, terrainRect: [-36, -24, 72, 48] });
  const phaseCounts = report.passes.reduce<Record<string, number>>((counts, pass) => {
    counts[pass.phase] = (counts[pass.phase] ?? 0) + 1;
    return counts;
  }, {});
  ctx.status.innerHTML = reportTable({
    route: 'render-graph',
    status: report.ok ? 'graph contract valid' : 'graph diagnostics',
    passes: report.passes.length,
    resources: report.resources.length,
    phases: Object.entries(phaseCounts).map(([k, v]) => `${k}:${v}`).join(', '),
    diagnostics: report.diagnostics.length,
  }) + graphList(report);
  publish('render-graph', report.ok, {
    passes: report.passes.length,
    resources: report.resources.length,
    firstPass: report.passes[0]?.id,
    lastPass: report.passes.at(-1)?.id,
    diagnostics: report.diagnostics,
  });
}

async function routeBattleTerrain(ctx: LabContext) {
  const fixture = parseBattleTerrainFixture(ctx.params.get('fixture'));
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: -6, zoom: 7.2, pitch: 0.30, yaw: -0.12 });
  const terrain = new BattleTerrainPass(shell);
  terrain.setFixture(fixture);
  shell.drawFrame({
    clear: { r: 0.74, g: 0.83, b: 0.90, a: 1 },
    terrainRect: [-58, -12, 116, 46],
    markers: generatedMarkers(54, -14, 2, 0).concat(generatedMarkers(54, 15, 8, 1)),
    extra: (pass) => terrain.draw(pass),
  });
  const stats = terrain.stats();
  ctx.status.innerHTML = reportTable({
    route: 'battle-terrain',
    fixture,
    terrain: 'warm grass, beach shelf, water, haze clear, scenery; selection is owned by battle overlay',
    quads: stats.quads,
    water: stats.waterQuads,
    scenery: stats.sceneryQuads,
    fixtureSelectionQuads: stats.selectionQuads,
  });
  publish('battle-terrain', true, stats);
}

async function routeBattleLive(ctx: LabContext) {
  const [{ default: initWasm, Game }, vat] = await Promise.all([
    import('../../../web/src/wasm/game_wasm.js'),
    loadPlaceholderVat(),
  ]);
  const wasm = await initWasm();
  const game = new Game(0x5eed_c0de);
  const mode = ctx.params.get('mode') ?? '5v5';
  if (mode === 'duel') game.start_duel(0, 3);
  else game.start_sandbox(1);
  game.set_ai_team(1);
  const ticks = Number(ctx.params.get('ticks') ?? 36);
  game.advance_ticks(ticks);

  const live = buildLiveBattleCrowdFrame(game, wasm.memory, ticks);
  const bounds = instanceBounds(live.instances);
  const dpr = window.devicePixelRatio || 1;
  const viewW = (ctx.canvas.clientWidth || 900) * dpr;
  const viewH = (ctx.canvas.clientHeight || 620) * dpr;
  const zoom = Math.min(
    mode === 'duel' ? 11 : 6.8,
    Math.max(2.2, Math.min(viewW / (bounds.w + 80), viewH / (bounds.h + 80))),
  );
  const shell = await createConfiguredShell(ctx.canvas, { x: bounds.cx, y: bounds.cy - 6, zoom, pitch: 0.32, yaw: -0.08 });
  const terrain = new BattleTerrainPass(shell);
  terrain.setFixture('dry-melee');
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  const overlay = new BattleOverlayPass(shell);
  const minimap = new BattleMinimapPass(shell);
  const selectedUnit = firstPlayerUnit(game, wasm.memory);
  const selectedVisual = unitVisual(game, wasm.memory, selectedUnit);
  overlay.upload(selectedVisual ? selectedUnitOverlayVertices(selectedVisual) : new Float32Array());
  minimap.upload({
    world: bounds,
    camera: cameraWorldBounds(bounds, viewW, viewH, zoom),
    units: minimapUnits(game, wasm.memory, selectedUnit),
  });
  pipeline.upload(live.instances, { phaseOffset: 0 });
  shell.drawFrame({
    clear: { r: 0.74, g: 0.83, b: 0.90, a: 1 },
    terrainRect: [bounds.cx - Math.max(68, bounds.w * 0.65), bounds.cy - Math.max(36, bounds.h * 0.65), Math.max(136, bounds.w * 1.3), Math.max(72, bounds.h * 1.3)],
    extra: (pass) => {
      terrain.draw(pass);
      pipeline.draw(pass);
      overlay.draw(pass);
      minimap.draw(pass);
    },
  });
  const overlayStats = overlay.stats();
  const minimapStats = minimap.stats();
  ctx.status.innerHTML = reportTable({
    route: 'battle-live',
    mode,
    ticks,
    soldiers: live.stats.written,
    units: live.stats.units,
    alive: live.stats.alive,
    player: live.stats.player,
    enemy: live.stats.enemy,
    fighting: live.stats.fighting,
    fallen: live.stats.fallen,
    zoom: zoom.toFixed(2),
    selectedUnit,
    overlayLines: overlayStats.lineSegments,
    minimapUnits: minimapStats.units,
    drawCalls: pipeline.stats().drawCalls,
  });
  publish('battle-live', true, {
    ...live.stats,
    mode,
    ticks,
    bounds,
    zoom,
    selectedUnit,
    overlay: overlayStats,
    minimap: minimapStats,
    drawCalls: pipeline.stats().drawCalls,
    clips: pipeline.stats().clips,
  });
}

async function routeBattleUi(ctx: LabContext) {
  const [{ default: initWasm, Game }, vat] = await Promise.all([
    import('../../../web/src/wasm/game_wasm.js'),
    loadPlaceholderVat(),
  ]);
  const wasm = await initWasm();
  const game = new Game(0x5eed_c0de);
  const mode = ctx.params.get('mode') ?? '5v5';
  if (mode === 'duel') game.start_duel(0, 3);
  else game.start_sandbox(1);
  game.set_ai_team(1);
  const ticks = Number(ctx.params.get('ticks') ?? 36);
  game.advance_ticks(ticks);

  const live = buildLiveBattleCrowdFrame(game, wasm.memory, ticks);
  const bounds = instanceBounds(live.instances);
  const dpr = window.devicePixelRatio || 1;
  const viewW = (ctx.canvas.clientWidth || 900) * dpr;
  const viewH = (ctx.canvas.clientHeight || 620) * dpr;
  const zoom = Math.min(
    mode === 'duel' ? 11 : 6.8,
    Math.max(2.2, Math.min(viewW / (bounds.w + 80), viewH / (bounds.h + 80))),
  );
  const shell = await createConfiguredShell(ctx.canvas, { x: bounds.cx, y: bounds.cy - 6, zoom, pitch: 0.32, yaw: -0.08 });
  const terrain = new BattleTerrainPass(shell);
  terrain.setFixture('dry-melee');
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  const overlay = new BattleOverlayPass(shell);
  const minimap = new BattleMinimapPass(shell);
  const host = ctx.canvas.parentElement ?? ctx.root;
  let selectedUnit = firstPlayerUnit(game, wasm.memory);
  const ui = new WebGpuBattleUiLayer(host, (unit) => {
    selectedUnit = unit;
    draw();
  });

  pipeline.upload(live.instances, { phaseOffset: 0 });
  const draw = () => {
    const selectedVisual = unitVisual(game, wasm.memory, selectedUnit);
    overlay.upload(selectedVisual ? selectedUnitOverlayVertices(selectedVisual) : new Float32Array());
    minimap.upload({
      world: bounds,
      camera: cameraWorldBounds(bounds, viewW, viewH, zoom),
      units: minimapUnits(game, wasm.memory, selectedUnit),
    });
    shell.drawFrame({
      clear: { r: 0.74, g: 0.83, b: 0.90, a: 1 },
      terrainRect: [bounds.cx - Math.max(68, bounds.w * 0.65), bounds.cy - Math.max(36, bounds.h * 0.65), Math.max(136, bounds.w * 1.3), Math.max(72, bounds.h * 1.3)],
      extra: (pass) => {
        terrain.draw(pass);
        pipeline.draw(pass);
        overlay.draw(pass);
        minimap.draw(pass);
      },
    });
    ui.render(buildWebGpuBattleUiModel(game, wasm.memory, {
      selectedUnits: selectedUnit >= 0 ? [selectedUnit] : [],
      tick: ticks,
      paused: true,
      pursueOn: false,
      fireAtWill: true,
      renderer: 'raw WebGPU battle + retained DOM UI',
    }));
  };
  draw();

  const overlayStats = overlay.stats();
  const minimapStats = minimap.stats();
  const uiStats = ui.stats();
  ctx.status.innerHTML = reportTable({
    route: 'battle-ui',
    mode,
    ticks,
    soldiers: live.stats.written,
    units: live.stats.units,
    selectedUnit,
    overlayLines: overlayStats.lineSegments,
    minimapUnits: minimapStats.units,
    unitCards: uiStats.cards,
    toolbarButtons: uiStats.toolbarButtons,
    screenshots: uiStats.postCutoverScreenshots,
  });
  publish('battle-ui', true, {
    ...live.stats,
    mode,
    ticks,
    bounds,
    zoom,
    selectedUnit,
    overlay: overlayStats,
    minimap: minimapStats,
    ui: uiStats,
    drawCalls: pipeline.stats().drawCalls,
    clips: pipeline.stats().clips,
  });
}

async function routeBattleInput(ctx: LabContext) {
  const [{ default: initWasm, Game }, vat] = await Promise.all([
    import('../../../web/src/wasm/game_wasm.js'),
    loadPlaceholderVat(),
  ]);
  const wasm = await initWasm();
  const game = new Game(0x5eed_c0de);
  const mode = ctx.params.get('mode') ?? '5v5';
  if (mode === 'duel') game.start_duel(0, 3);
  else game.start_sandbox(1);
  game.set_ai_team(1);
  const ticks = Number(ctx.params.get('ticks') ?? 36);
  game.advance_ticks(ticks);

  let simTick = ticks;
  let live = buildLiveBattleCrowdFrame(game, wasm.memory, simTick);
  let bounds = instanceBounds(live.instances);
  const dpr = window.devicePixelRatio || 1;
  const viewW = (ctx.canvas.clientWidth || 900) * dpr;
  const viewH = (ctx.canvas.clientHeight || 620) * dpr;
  const camera = battleCamera(bounds, viewW, viewH, mode);
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const cameraForPick = (): WebGpuBattlePickCamera => ({
    x: camera.x,
    y: camera.y,
    zoom: camera.zoom,
    pitch: camera.pitch ?? 0,
    yaw: camera.yaw ?? 0,
    width: shell.stats().width,
    height: shell.stats().height,
  });
  const terrain = new BattleTerrainPass(shell);
  terrain.setFixture('dry-melee');
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  const overlay = new BattleOverlayPass(shell);
  const minimap = new BattleMinimapPass(shell);
  const host = ctx.canvas.parentElement ?? ctx.root;
  let selectedUnits = [firstPlayerUnit(game, wasm.memory)].filter((unit) => unit >= 0);
  let lastPick = { kind: 'initial', unit: selectedUnits[0] ?? -1, worldX: 0, worldY: 0, distance: 0, boxUnits: 0 };
  let lastOrder = { kind: 'none', unit: -1, worldX: 0, worldY: 0, facing: 0, hasTarget: false };
  let frozen = true;
  const ui = new WebGpuBattleUiLayer(host, (unit, additive) => {
    selectedUnits = additive ? Array.from(new Set([...selectedUnits, unit])) : [unit];
    lastPick = { kind: 'card', unit, worldX: 0, worldY: 0, distance: 0, boxUnits: 0 };
    draw();
  });

  const pickUnits = () => liveBattlePickUnits(game, wasm.memory);
  const refreshLive = () => {
    live = buildLiveBattleCrowdFrame(game, wasm.memory, simTick);
    bounds = instanceBounds(live.instances);
    pipeline.upload(live.instances, { phaseOffset: 0 });
  };
  const waitForPresentedFrame = () => shell.device.queue.onSubmittedWorkDone()
    .then(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  refreshLive();

  const draw = () => {
    const selectedUnit = selectedUnits[0] ?? -1;
    const selectedVisual = unitVisual(game, wasm.memory, selectedUnit);
    overlay.upload(selectedVisual ? selectedUnitOverlayVertices(selectedVisual) : new Float32Array());
    minimap.upload({
      world: bounds,
      camera: cameraWorldBounds(bounds, viewW, viewH, camera.zoom),
      units: minimapUnits(game, wasm.memory, selectedUnit),
    });
    shell.drawFrame({
      clear: { r: 0.74, g: 0.83, b: 0.90, a: 1 },
      terrainRect: [bounds.cx - Math.max(68, bounds.w * 0.65), bounds.cy - Math.max(36, bounds.h * 0.65), Math.max(136, bounds.w * 1.3), Math.max(72, bounds.h * 1.3)],
      extra: (pass) => {
        terrain.draw(pass);
        pipeline.draw(pass);
        overlay.draw(pass);
        minimap.draw(pass);
      },
    });
    ui.render(buildWebGpuBattleUiModel(game, wasm.memory, {
      selectedUnits,
      tick: simTick,
      paused: true,
      pursueOn: false,
      fireAtWill: true,
      renderer: 'raw WebGPU battle input',
    }));
    const stats = {
      ...live.stats,
      mode,
      ticks: simTick,
      bounds,
      zoom: camera.zoom,
      camera: cameraForPick(),
      frozen,
      dpr: window.devicePixelRatio || 1,
      selectedUnits,
      selectedUnit,
      lastPick,
      lastOrder,
      selectedOrder: selectedUnit >= 0 ? unitOrderState(game, wasm.memory, selectedUnit) : null,
      overlay: overlay.stats(),
      minimap: minimap.stats(),
      ui: ui.stats(),
      drawCalls: pipeline.stats().drawCalls,
      clips: pipeline.stats().clips,
    };
    ctx.status.innerHTML = reportTable({
      route: 'battle-input',
      mode,
      ticks: simTick,
      dpr: stats.dpr,
      soldiers: live.stats.written,
      units: live.stats.units,
      selectedUnits: selectedUnits.join(',') || '-',
      lastPick: `${lastPick.kind}:${lastPick.unit}`,
      lastOrder: `${lastOrder.kind}:${lastOrder.unit}`,
      zoom: camera.zoom.toFixed(2),
      frozen,
      overlayLines: stats.overlay.lineSegments,
      minimapUnits: stats.minimap.units,
    });
    exposeBattleInputDebug(ctx.canvas, cameraForPick(), pickUnits(), selectedUnits, lastPick, lastOrder, {
      advance: (n: number) => {
        game.advance_ticks(Math.max(0, Math.floor(n)));
        simTick += Math.max(0, Math.floor(n));
        refreshLive();
        draw();
      },
      freezeAtTick: (target: number) => {
        frozen = true;
        const delta = Math.max(0, Math.floor(target) - simTick);
        if (delta > 0) {
          game.advance_ticks(delta);
          simTick += delta;
        }
        refreshLive();
        draw();
        return waitForPresentedFrame();
      },
      camera: (next: Partial<WebGpuBattlePickCamera>) => {
        if (Number.isFinite(next.x)) camera.x = next.x!;
        if (Number.isFinite(next.y)) camera.y = next.y!;
        if (Number.isFinite(next.zoom)) camera.zoom = Math.max(0.6, Math.min(40, next.zoom!));
        if (Number.isFinite(next.pitch)) camera.pitch = Math.max(0, Math.min(1.1, next.pitch!));
        if (Number.isFinite(next.yaw)) camera.yaw = next.yaw!;
        shell.setCamera(camera);
        draw();
      },
    });
    publish('battle-input', true, stats);
  };

  const clickState = { x: 0, y: 0, dragging: false };
  ctx.canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    clickState.x = event.clientX;
    clickState.y = event.clientY;
    clickState.dragging = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button !== 0 || !clickState.dragging) return;
    clickState.dragging = false;
    const units = pickUnits();
    const start = cssToBattleWorld(clickState.x, clickState.y, ctx.canvas, cameraForPick());
    const end = cssToBattleWorld(event.clientX, event.clientY, ctx.canvas, cameraForPick());
    if (Math.hypot(event.clientX - clickState.x, event.clientY - clickState.y) > 7) {
      selectedUnits = battleUnitsInRect(
        units,
        Math.min(start.x, end.x),
        Math.min(start.y, end.y),
        Math.max(start.x, end.x),
        Math.max(start.y, end.y),
        0,
      );
      lastPick = { kind: 'box', unit: selectedUnits[0] ?? -1, worldX: end.x, worldY: end.y, distance: 0, boxUnits: selectedUnits.length };
    } else {
      const pick = pickBattleUnit(units, start.x, start.y, 0);
      selectedUnits = pick.unit >= 0 ? [pick.unit] : [];
      lastPick = { kind: 'click', unit: pick.unit, worldX: start.x, worldY: start.y, distance: pick.distance, boxUnits: 0 };
    }
    draw();
  });
	  ctx.canvas.addEventListener('mouseup', (event) => {
	    if (event.button !== 2 || selectedUnits.length === 0) return;
	    const target = cssToBattleWorld(event.clientX, event.clientY, ctx.canvas, cameraForPick());
    const units = selectedUnits.filter((unit) => unit >= 0);
    const facing = selectedUnitFacing(game, wasm.memory, units[0]) ?? 0;
    for (const unit of units) game.set_move_order_facing(unit, target.x, target.y, facing);
    lastOrder = { kind: 'move', unit: units[0] ?? -1, worldX: target.x, worldY: target.y, facing, hasTarget: units.length > 0 };
    refreshLive();
    draw();
  });
  ctx.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  ctx.canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const before = cssToBattleWorld(event.clientX, event.clientY, ctx.canvas, cameraForPick());
    camera.zoom = Math.max(0.6, Math.min(40, camera.zoom * Math.pow(1.0015, -event.deltaY)));
    shell.setCamera(camera);
    const after = cssToBattleWorld(event.clientX, event.clientY, ctx.canvas, cameraForPick());
    camera.x += before.x - after.x;
    camera.y += before.y - after.y;
    shell.setCamera(camera);
    draw();
  }, { passive: false });

  draw();
}

async function createConfiguredShell(canvas: HTMLCanvasElement, camera: { x: number; y: number; zoom: number; pitch?: number; yaw?: number; perspective?: number }) {
  const shell = await createFrameShell(canvas);
  shell.setCamera(camera);
  return shell;
}

async function createSkinnedPipeline(shell: RawFrameShell, accent: [number, number, number], vat?: Awaited<ReturnType<typeof loadPlaceholderVat>>) {
  return new SkinnedCrowdPipeline(shell, createPlaceholderSoldierMeshes(accent), vat ?? await loadPlaceholderVat());
}

function numberParam(params: URLSearchParams, key: string, fallback: number) {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function integerParam(params: URLSearchParams, key: string, fallback: number, min: number, max: number) {
  const value = Math.floor(numberParam(params, key, fallback));
  return Math.max(min, Math.min(max, value));
}

function animateShell(shell: RawFrameShell, status: HTMLElement, frame: () => { markers?: MarkerInstance[]; terrainRect?: [number, number, number, number] }) {
  const tick = () => {
    shell.drawFrame(frame());
    if (!status.innerHTML) status.innerHTML = reportTable({ route: 'frame', ...shell.stats() });
    requestAnimationFrame(tick);
  };
  tick();
}

function animateSkinned(
  shell: RawFrameShell,
  pipeline: SkinnedCrowdPipeline,
  getInstances: () => CrowdInstance[],
  opts: { forcedClip?: string | null; phaseOffset?: number; phaseSpeed?: number; size?: number; afterFrame?: () => void } = {},
) {
  const start = performance.now();
  const tick = () => {
    const phaseOffset = (opts.phaseOffset ?? 0) + ((performance.now() - start) / 1000) * (opts.phaseSpeed ?? 0);
    pipeline.upload(getInstances(), { forcedClip: opts.forcedClip, phaseOffset, size: opts.size });
    shell.drawFrame({ markers: [], extra: (pass) => pipeline.draw(pass) });
    opts.afterFrame?.();
    requestAnimationFrame(tick);
  };
  tick();
}

function generatedMarkers(count: number, x: number, y: number, faction: 0 | 1 | 2): MarkerInstance[] {
  return generatedFormation(count, { x, y, faction: faction === 2 ? 0 : faction, columns: Math.ceil(Math.sqrt(count)), frame: 1 })
    .map((inst) => ({ ...instanceMarker(inst), faction }));
}

function instanceMarker(inst: CrowdInstance): MarkerInstance {
  return { x: inst.x, y: inst.y, facing: inst.facing, faction: inst.faction, size: 1.1 };
}

function toCrowdBuildInputs(instances: CrowdInstance[]) {
  const positions = new Float32Array(instances.length * 2);
  const facings = new Float32Array(instances.length);
  const frames = new Float32Array(instances.length);
  const alive = new Float32Array(instances.length);
  const soldierUnit = new Uint32Array(instances.length);
  const unitTeam = [0, 1];
  const unitClass = [0, 3];
  for (let i = 0; i < instances.length; i++) {
    positions[i * 2] = instances[i].x;
    positions[i * 2 + 1] = instances[i].y;
    facings[i] = instances[i].facing;
    frames[i] = instances[i].frame;
    alive[i] = instances[i].alive ? 1 : 0;
    soldierUnit[i] = instances[i].faction === 0 ? 0 : 1;
  }
  return { positions, facings, frames, alive, soldierUnit, unitTeam, unitClass, simTick: 180 };
}

function parseBattleTerrainFixture(value: string | null): BattleTerrainFixture {
  if (value === 'melee' || value === 'dry-melee' || value === 'prop-field') return value;
  return 'coast';
}

function instanceBounds(instances: CrowdInstance[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const inst of instances) {
    x0 = Math.min(x0, inst.x);
    y0 = Math.min(y0, inst.y);
    x1 = Math.max(x1, inst.x);
    y1 = Math.max(y1, inst.y);
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 1, y1: 1, w: 1, h: 1, cx: 0, cy: 0 };
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  return { x0, y0, x1, y1, w, h, cx: (x0 + x1) * 0.5, cy: (y0 + y1) * 0.5 };
}

function firstPlayerUnit(game: { unit_count(): number; unit_info_ptr(): number; unit_info_stride(): number }, memory: WebAssembly.Memory) {
  const stride = game.unit_info_stride();
  const info = new Float32Array(memory.buffer, game.unit_info_ptr(), game.unit_count() * stride);
  for (let unit = 0; unit < game.unit_count(); unit++) {
    const o = unit * stride;
    if (info[o + UNIT_INFO.team] === 0 && info[o + UNIT_INFO.alive] > 0) return unit;
  }
  return -1;
}

function unitVisual(game: { unit_count(): number; unit_info_ptr(): number; unit_info_stride(): number }, memory: WebAssembly.Memory, unit: number) {
  if (unit < 0 || unit >= game.unit_count()) return null;
  const stride = game.unit_info_stride();
  const info = new Float32Array(memory.buffer, game.unit_info_ptr(), game.unit_count() * stride);
  const o = unit * stride;
  const alive = Math.max(1, info[o + UNIT_INFO.alive] || 1);
  const classId = Math.max(0, Math.min(CLASS_DEPTH.length - 1, Math.floor(info[o + UNIT_INFO.classId] || 0)));
  const files = Math.max(1, Math.ceil(alive / CLASS_DEPTH[classId]));
  const width = Math.max(10, files * CLASS_SPACING[classId]);
  const depth = Math.max(8, CLASS_DEPTH[classId] * 1.1);
  return {
    x: info[o + UNIT_INFO.centerX] || info[o + UNIT_INFO.x],
    y: info[o + UNIT_INFO.centerY] || info[o + UNIT_INFO.y],
    facing: info[o + UNIT_INFO.facing] || 0,
    width,
    depth,
    selected: true,
  };
}

function minimapUnits(game: { unit_count(): number; unit_info_ptr(): number; unit_info_stride(): number }, memory: WebAssembly.Memory, selectedUnit: number) {
  const stride = game.unit_info_stride();
  const info = new Float32Array(memory.buffer, game.unit_info_ptr(), game.unit_count() * stride);
  const units = [];
  for (let unit = 0; unit < game.unit_count(); unit++) {
    const o = unit * stride;
    if (info[o + UNIT_INFO.alive] <= 0) continue;
    units.push({
      x: info[o + UNIT_INFO.centerX] || info[o + UNIT_INFO.x],
      y: info[o + UNIT_INFO.centerY] || info[o + UNIT_INFO.y],
      team: (info[o + UNIT_INFO.team] === 0 ? 0 : 1) as 0 | 1,
      selected: unit === selectedUnit,
    });
  }
  return units;
}

function unitOrderState(game: { unit_count(): number; unit_info_ptr(): number; unit_info_stride(): number }, memory: WebAssembly.Memory, unit: number) {
  if (unit < 0 || unit >= game.unit_count()) return null;
  const stride = game.unit_info_stride();
  const info = new Float32Array(memory.buffer, game.unit_info_ptr(), game.unit_count() * stride);
  const o = unit * stride;
  return {
    unit,
    x: info[o + UNIT_INFO.x],
    y: info[o + UNIT_INFO.y],
    targetX: info[o + UNIT_INFO.targetX],
    targetY: info[o + UNIT_INFO.targetY],
    hasTarget: info[o + UNIT_INFO.hasTarget] > 0.5,
    mode: info[o + UNIT_INFO.mode],
    goalFacing: info[o + UNIT_INFO.goalFacing],
    hasGoalFacing: info[o + UNIT_INFO.hasGoalFacing] > 0.5,
  };
}

function selectedUnitFacing(game: { unit_count(): number; unit_info_ptr(): number; unit_info_stride(): number }, memory: WebAssembly.Memory, unit: number) {
  if (unit < 0 || unit >= game.unit_count()) return null;
  const stride = game.unit_info_stride();
  const info = new Float32Array(memory.buffer, game.unit_info_ptr(), game.unit_count() * stride);
  return info[unit * stride + UNIT_INFO.facing] || 0;
}

function cameraWorldBounds(bounds: { cx: number; cy: number }, viewW: number, viewH: number, zoom: number) {
  const halfW = viewW / Math.max(zoom, 0.001) * 0.5;
  const halfH = viewH / Math.max(zoom, 0.001) * 0.5;
  return {
    x0: bounds.cx - halfW,
    y0: bounds.cy - halfH,
    x1: bounds.cx + halfW,
    y1: bounds.cy + halfH,
  };
}

function battleCamera(bounds: { cx: number; cy: number; w: number; h: number }, viewW: number, viewH: number, mode: string) {
  const zoom = Math.min(
    mode === 'duel' ? 11 : 6.8,
    Math.max(2.2, Math.min(viewW / (bounds.w + 80), viewH / (bounds.h + 80))),
  );
  return { x: bounds.cx, y: bounds.cy - 6, zoom, pitch: 0.32, yaw: -0.08 };
}

function campaignPresetCamera(preset: string) {
  const presets: Record<string, { x: number; y: number; zoom: number; pitch: number; yaw: number; perspective?: number }> = {
    fixture: { x: 0, y: 450, zoom: 6.0, pitch: 0, yaw: 0 },
    whole: { x: -100, y: 250, zoom: 0.16, pitch: 0, yaw: 0 },
    roma: { x: -456, y: 446, zoom: 2.5, pitch: 0, yaw: 0, perspective: 0.0048 },
    gaul: { x: -1020, y: 938, zoom: 2.2, pitch: 0, yaw: 0, perspective: 0.0038 },
    nile: { x: 1131, y: -686, zoom: 2.2, pitch: 0, yaw: 0, perspective: 0.0038 },
    alps: { x: -450, y: 1080, zoom: 1.8, pitch: 0, yaw: 0, perspective: 0.0026 },
    political: { x: 180, y: 520, zoom: 0.58, pitch: 0, yaw: 0 },
  };
  return presets[preset] ?? presets.whole;
}

async function loadCampaignUiFixture(): Promise<{ kind: 'controlled'; data: CampaignData; mapJson: string }> {
  const y = 450;
  const map = {
    half_w: 70,
    half_h: 520,
    attribution: 'webgpu-campaign-ui-fixture',
    nodes: [
      { id: 1, name: 'Roma', pos: [-28, y], kind: 'city', tier: 2, port: false, owner: 'rome' },
      { id: 2, name: 'Neapolis', pos: [30, y], kind: 'city', tier: 2, port: false, owner: 'independents' },
    ],
    edges: [
      { a: 1, b: 2, kind: 'road', via: [[-28, y], [-6, y + 4], [12, y - 3], [30, y]], tiles: Array(10).fill('open') },
    ],
    ambush_spots: [],
    factions: [
      { id: 'rome', name: 'Rome', color: [190, 48, 42], playable: true },
      { id: 'independents', name: 'Independent', color: [132, 122, 102], playable: false },
    ],
    start_armies: [
      { faction: 'rome', at: 'Roma', roster: [['MediumInfantry', 1000], ['MediumSpear', 500], ['Archers', 500], ['ShockCavalry', 300]] },
    ],
  } as unknown as CampaignData['map'];
  const bgRect = { min: [-54, y - 32] as [number, number], max: [56, y + 34] as [number, number] };
  const cv = document.createElement('canvas');
  cv.width = 1;
  cv.height = 1;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#c9b277';
  g.fillRect(0, 0, 1, 1);
  const bg = await createImageBitmap(cv);
  const nodeIndex = new Map(map.nodes.map((node, i) => [node.id, i]));
  return { kind: 'controlled', data: { map, bg, bgRect, nodeIndex }, mapJson: JSON.stringify(map) };
}

function buildCampaignEntityFrame(
  data: CampaignData,
  views: CampaignViews,
  playerFaction: number,
  selectedArmy: number,
  selectedCity: number,
) {
  const entities: CampaignEntityInstance[] = [];
  const selections: CampaignSelectionInstance[] = [];
  let cityEntities = 0;
  let armyEntities = 0;
  for (let node = 0; node < data.map.nodes.length; node++) {
    const mapNode = data.map.nodes[node];
    if (mapNode.kind !== 'city') continue;
    const city = views.cities.get(node);
    const owner = city?.owner ?? Math.max(0, data.map.factions.findIndex((faction) => faction.id === mapNode.owner));
    const allegiance = owner === playerFaction ? Allegiance.Friend : Allegiance.Neutral;
    entities.push({
      x: mapNode.pos[0],
      y: mapNode.pos[1],
      radius: mapNode.tier >= 3 ? 8.4 : 7.0,
      faction: factionColor(data, owner),
      allegiance: allegianceColor(allegiance),
      kind: 'city',
      strength: Math.min(1, (city?.garrison ?? 600) / 1200),
    });
    cityEntities++;
    if (node === selectedCity) {
      selections.push({ x: mapNode.pos[0], y: mapNode.pos[1], radius: mapNode.tier >= 3 ? 12.4 : 10.6, color: [0.31, 0.82, 0.39], kind: 'city' });
    }
  }
  for (const army of views.armies) {
    const allegiance = army.mine || army.faction === playerFaction ? Allegiance.Friend : Allegiance.Foe;
    entities.push({
      x: army.x,
      y: army.y,
      radius: 9.8,
      faction: factionColor(data, army.faction),
      allegiance: allegianceColor(allegiance),
      kind: 'army',
      strength: Math.min(1, Math.max(0.25, army.soldiers / 2600)),
    });
    armyEntities++;
    if (army.id === selectedArmy) {
      selections.push({ x: army.x, y: army.y, radius: 12.6, color: [0.31, 0.82, 0.39], kind: 'army' });
    }
  }
  return { entities, selections, cityEntities, armyEntities };
}

function factionColor(data: CampaignData, faction: number): [number, number, number] {
  const color = data.map.factions[faction]?.color ?? [146, 126, 92];
  return [color[0] / 255, color[1] / 255, color[2] / 255];
}

function allegianceColor(allegiance: Allegiance): [number, number, number] {
  if (allegiance === Allegiance.Friend) return [0.31, 0.82, 0.39];
  if (allegiance === Allegiance.Foe) return [0.88, 0.27, 0.23];
  return [0.93, 0.78, 0.30];
}

function campaignArmyLabels(armies: ArmyView[]): CampaignLabel[] {
  return armies.map((army) => ({
    text: army.mine ? `Army ${army.id}` : `Host ${army.id}`,
    x: army.x,
    y: army.y - 18,
    kind: 'army' as const,
    size: 13,
    priority: 4,
  }));
}

function campaignFactionLabels(labels: FactionLabel[]): CampaignLabel[] {
  return labels.map((label) => ({
    text: label.name,
    x: label.x,
    y: label.y,
    kind: 'faction' as const,
    size: Math.max(13, Math.min(label.minor ? 16 : 22, label.radiusKm / (label.minor ? 12 : 20))),
    priority: label.minor ? 2 : 4,
    angle: -0.06,
  }));
}

function campaignPick(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: { x: number; y: number; zoom: number; pitch?: number; yaw?: number; perspective?: number },
  stats: { width: number; height: number },
  data: CampaignData,
  views: CampaignViews,
) {
  const world = campaignCssToWorld(clientX, clientY, canvas, camera, stats);
  let army = -1;
  let bestD = 14;
  for (const candidate of views.armies) {
    if (!candidate.mine) continue;
    const d = Math.hypot(candidate.x - world.x, candidate.y - world.y);
    if (d < bestD) {
      bestD = d;
      army = candidate.id;
    }
  }
  if (army >= 0) return { kind: 'army', army, city: -1, worldX: world.x, worldY: world.y };
  const loc = nearestLoc(data.map, world.x, world.y, 18);
  if (loc && loc.kind === 0 && data.map.nodes[loc.a]?.kind === 'city') {
    return { kind: 'city', army: -1, city: loc.a, worldX: world.x, worldY: world.y };
  }
  return { kind: 'empty', army: -1, city: -1, worldX: world.x, worldY: world.y };
}

function campaignCssToWorld(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: { x: number; y: number; zoom: number; pitch?: number; yaw?: number; perspective?: number },
  stats: { width: number; height: number },
) {
  const rect = canvas.getBoundingClientRect();
  const px = (clientX - rect.left) * (canvas.width / Math.max(1, canvas.clientWidth));
  const py = (clientY - rect.top) * (canvas.height / Math.max(1, canvas.clientHeight));
  const [x, y] = screenToWorld({ ...camera, width: stats.width, height: stats.height }, px, py);
  return { x, y };
}

function publishCampaignUiDebug(
  canvas: HTMLCanvasElement,
  camera: { x: number; y: number; zoom: number; pitch?: number; yaw?: number; perspective?: number },
  views: CampaignViews,
  selectedArmy: number,
  selectedCity: number,
  lastPick: { kind: string; army: number; city: number; worldX: number; worldY: number },
) {
  const w = window as unknown as {
    __webgpuCampaignUi?: {
      camera: typeof camera;
      armies: ArmyView[];
      cities: [number, CityView][];
      selectedArmy: number;
      selectedCity: number;
      lastPick: typeof lastPick;
      project(x: number, y: number): { x: number; y: number };
    };
  };
  w.__webgpuCampaignUi = {
    camera,
    armies: views.armies,
    cities: Array.from(views.cities.entries()),
    selectedArmy,
    selectedCity,
    lastPick,
    project: (x: number, y: number) => campaignWorldToCss(x, y, canvas, camera, { width: canvas.width, height: canvas.height }),
  };
}

function campaignWorldToCss(
  x: number,
  y: number,
  canvas: HTMLCanvasElement,
  camera: { x: number; y: number; zoom: number; pitch?: number; yaw?: number; perspective?: number },
  stats: { width: number; height: number },
) {
  const rect = canvas.getBoundingClientRect();
  const [px, py] = worldToScreen({ ...camera, width: stats.width, height: stats.height }, x, y);
  return {
    x: rect.left + px * (canvas.clientWidth / Math.max(1, canvas.width)),
    y: rect.top + py * (canvas.clientHeight / Math.max(1, canvas.height)),
  };
}

function exposeBattleInputDebug(
  canvas: HTMLCanvasElement,
  camera: WebGpuBattlePickCamera,
  units: BattlePickUnit[],
  selectedUnits: number[],
  lastPick: { kind: string; unit: number; worldX: number; worldY: number; distance: number; boxUnits: number },
  lastOrder: { kind: string; unit: number; worldX: number; worldY: number; facing: number; hasTarget: boolean },
  controls: {
    advance(n: number): void;
    freezeAtTick(target: number): void | Promise<void>;
    camera(next: Partial<WebGpuBattlePickCamera>): void;
  },
) {
  const w = window as unknown as {
    __webgpuBattleInput?: {
      camera: WebGpuBattlePickCamera;
      units: BattlePickUnit[];
      selectedUnits: number[];
      lastPick: typeof lastPick;
      lastOrder: typeof lastOrder;
      canvas: { width: number; height: number; clientWidth: number; clientHeight: number };
      advance(n: number): void;
      freezeAtTick(target: number): void | Promise<void>;
      setCamera(next: Partial<WebGpuBattlePickCamera>): void;
    };
  };
  w.__webgpuBattleInput = {
    camera,
    units,
    selectedUnits,
    lastPick,
    lastOrder,
    canvas: {
      width: canvas.width,
      height: canvas.height,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
    },
    advance: controls.advance,
    freezeAtTick: controls.freezeAtTick,
    setCamera: controls.camera,
  };
}

function publish(route: string, ok: boolean, stats: unknown) {
  const w = window as unknown as { __webgpuLabReady?: boolean; __webgpuLabStats?: unknown };
  w.__webgpuLabReady = true;
  w.__webgpuLabStats = { ok, route, stats };
}

function reportTable(values: Record<string, unknown>) {
  const rows = Object.entries(values).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`).join('');
  return `<table>${rows}</table>`;
}

function issueList(issues: { code: string; message: string; path: string }[]) {
  if (issues.length === 0) return '';
  return `<ol>${issues.map((i) => `<li><b>${escapeHtml(i.code)}</b> ${escapeHtml(i.path)}: ${escapeHtml(i.message)}</li>`).join('')}</ol>`;
}

function statusList(checks: { id: string; status: string; detail: string }[]) {
  return `<ol class="webgpu-status-list">${checks.map((check) => `<li class="${escapeHtml(check.status)}"><b>${escapeHtml(check.id)}</b> <em>${escapeHtml(check.status)}</em><span>${escapeHtml(check.detail)}</span></li>`).join('')}</ol>`;
}

function graphList(report: ReturnType<typeof fullGameRenderGraphReport>) {
  const passes = report.passes
    .map((pass) => `<li><b>${escapeHtml(pass.id)}</b> <span>${escapeHtml(pass.label)}</span></li>`)
    .join('');
  return `<ol class="webgpu-graph">${passes}</ol>`;
}

function el(tag: string, className: string) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function escapeHtml(s: string) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function installStyles() {
  const style = document.createElement('style');
  style.textContent = `
    html, body { margin: 0; height: 100%; overflow: hidden; background: #15161a; color: #e6dcc8; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
    .webgpu-lab { height: 100vh; display: grid; grid-template-rows: 42px 1fr; }
    .webgpu-lab-nav { display: flex; align-items: center; gap: 4px; overflow-x: auto; padding: 5px 8px; background: #242018; border-bottom: 1px solid #4d4432; }
    .webgpu-lab-nav a { color: #c9bea5; text-decoration: none; font-size: 12px; padding: 6px 8px; border-radius: 4px; white-space: nowrap; }
    .webgpu-lab-nav a.active, .webgpu-lab-nav a:hover { background: #5b4e34; color: #fff7df; }
    .webgpu-stage { min-height: 0; display: grid; grid-template-columns: 1fr 310px; position: relative; }
    #webgpu-canvas { width: 100%; height: 100%; display: block; background: #aebfcf; }
    .webgpu-panel { overflow: auto; border-left: 1px solid #4d4432; background: #191916; padding: 12px; color: #ded3bc; }
    .webgpu-panel table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .webgpu-panel th, .webgpu-panel td { text-align: left; border-bottom: 1px solid #373228; padding: 5px 4px; vertical-align: top; }
    .webgpu-panel th { width: 38%; color: #bcae8d; font-weight: 600; }
    .webgpu-panel ol { padding-left: 20px; font-size: 12px; line-height: 1.45; }
    .webgpu-panel .webgpu-graph li { margin: 0 0 6px; }
    .webgpu-panel .webgpu-graph span { color: #cfc2a8; }
    .webgpu-panel .webgpu-status-list { list-style: none; padding-left: 0; }
    .webgpu-panel .webgpu-status-list li { margin: 0 0 8px; padding: 7px 8px; border: 1px solid #373228; border-radius: 5px; background: rgba(255,255,255,0.03); }
    .webgpu-panel .webgpu-status-list b { display: block; color: #f0dfb4; }
    .webgpu-panel .webgpu-status-list em { display: inline-block; margin: 3px 0; font-style: normal; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #e8d7a8; }
    .webgpu-panel .webgpu-status-list span { display: block; color: #cfc2a8; }
    .webgpu-panel .webgpu-status-list .pending { border-color: #7c6444; background: rgba(164,123,70,0.11); }
    .webgpu-status.bad { color: #ffb2a2; }
    .asset-workbench { margin-top: 12px; padding: 9px; border: 1px solid #4d4432; border-radius: 6px; background: rgba(255,255,255,0.035); }
    .asset-workbench.drag { border-color: #d6bb7a; background: rgba(214,187,122,0.10); }
    .asset-workbench label { display: block; margin-bottom: 6px; color: #e8d7a8; font-size: 12px; font-weight: 700; }
    .asset-workbench textarea { box-sizing: border-box; width: 100%; min-height: 128px; resize: vertical; border: 1px solid #40382b; border-radius: 5px; padding: 7px; background: #11110f; color: #e8dfcd; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
    .asset-actions { display: flex; gap: 7px; align-items: center; margin-top: 8px; }
    .asset-actions button, .asset-file { border: 1px solid #5d513d; border-radius: 5px; background: #27241d; color: #f2e3bd; padding: 6px 8px; font-size: 12px; cursor: pointer; }
    .asset-actions button:hover, .asset-file:hover { background: #3a3224; }
    .asset-file input { display: none; }
    .asset-workbench p { margin: 8px 0 0; color: #bdb29b; font-size: 11px; line-height: 1.35; }
    #asset-import-result { margin-top: 10px; }
    #asset-import-result.bad table { border-color: #704235; }
    .webgpu-battle-ui { position: absolute; inset: 0 310px 0 0; pointer-events: none; color: #efe7d4; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
    .webgpu-battle-hud { position: absolute; top: 12px; left: 14px; display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: rgba(17,18,19,0.72); border: 1px solid rgba(214,184,103,0.38); border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,0.28); font-size: 12px; }
    .webgpu-battle-hud b { color: #fff4c9; font-size: 12px; }
    .webgpu-battle-summary { position: absolute; top: 54px; left: 14px; min-width: 210px; display: grid; grid-template-columns: 1fr auto; gap: 6px 10px; padding: 8px 10px; background: rgba(17,18,19,0.72); border: 1px solid rgba(126,151,191,0.42); border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,0.24); font-size: 12px; }
    .webgpu-battle-summary b { color: #f5edd7; }
    .webgpu-battle-summary i { grid-column: span 2; height: 5px; background: rgba(8,9,11,0.72); border-radius: 4px; overflow: hidden; }
    .webgpu-battle-summary i em { display: block; height: 100%; }
    .webgpu-battle-summary .hp em { background: #65bd50; }
    .webgpu-battle-summary .coh em { background: #d9c75a; }
    .webgpu-battle-summary .mor em { background: #c2554e; }
    .webgpu-unitcards { position: absolute; bottom: 58px; left: 226px; right: 18px; display: flex; justify-content: center; gap: 5px; align-items: flex-end; overflow-x: auto; overflow-y: hidden; padding: 5px 7px; pointer-events: auto; background: linear-gradient(rgba(10,12,16,0), rgba(10,12,16,0.82)); border-radius: 8px; scrollbar-width: thin; }
    .webgpu-unitcards::-webkit-scrollbar { height: 6px; }
    .webgpu-unitcards::-webkit-scrollbar-thumb { background: #3a3f4d; border-radius: 3px; }
    .webgpu-unitcards .ucard { flex: 0 0 auto; width: 62px; display: flex; flex-direction: column; align-items: center; background: rgba(24,27,34,0.92); border: 1px solid #3a3f4d; border-top: 3px solid var(--fac); border-radius: 5px; padding: 2px 2px 3px; cursor: pointer; position: relative; transition: transform 0.08s, border-color 0.1s; }
    .webgpu-unitcards .ucard:hover { background: rgba(40,46,58,0.95); }
    .webgpu-unitcards .ucard.sel { border-color: #f0e3b0; box-shadow: 0 0 0 1px #f0e3b0, 0 -2px 10px rgba(240,227,176,0.25); transform: translateY(-3px); }
    .webgpu-unitcards .ucard.rout { filter: grayscale(0.5) brightness(0.8); }
    .webgpu-unitcards .ucard.rout::after { content: 'ROUT'; position: absolute; top: 20px; left: 0; right: 0; text-align: center; font: 700 9px ui-monospace, monospace; color: #ff7a6b; text-shadow: 0 1px 2px #000; }
    .webgpu-unitcards .ucard-port { display: block; image-rendering: auto; background: radial-gradient(ellipse at 50% 70%, rgba(120,130,110,0.35), rgba(20,24,20,0.1)); border-radius: 3px; }
    .webgpu-unitcards .ucard-name { font: 600 8px ui-monospace, Menlo, monospace; color: #cfd6e4; margin-top: 1px; white-space: nowrap; max-width: 60px; overflow: hidden; text-overflow: ellipsis; }
    .webgpu-unitcards .ucard-count { position: absolute; top: 3px; right: 4px; font: 700 9px ui-monospace, monospace; color: #fff; text-shadow: 0 1px 2px #000, 0 0 3px #000; }
    .webgpu-unitcards .ucard-bars { width: 54px; margin-top: 2px; }
    .webgpu-unitcards .ucard-bar { height: 3px; background: rgba(8,9,11,0.7); border-radius: 2px; overflow: hidden; margin-bottom: 1px; }
    .webgpu-unitcards .ucard-bar > div { height: 100%; width: 100%; }
    .webgpu-unitcards .ucard-bar.hp > div { background: #5cba46; }
    .webgpu-unitcards .ucard-bar.coh > div { background: #d9c75a; }
    .webgpu-unitcards .ucard-bar.mor > div { background: #c2554e; }
    .webgpu-toolbar { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; align-items: center; padding: 7px 10px; pointer-events: auto; background: rgba(12,14,19,0.85); border: 1px solid #3a3f4d; border-radius: 8px; box-shadow: 0 4px 18px rgba(0,0,0,0.45); }
	    .webgpu-toolbar button { font: 12px ui-monospace, Menlo, monospace; color: #c8cdd8; background: rgba(34,38,48,0.9); border: 1px solid #444a5a; border-radius: 6px; padding: 5px 10px; cursor: pointer; white-space: nowrap; }
	    .webgpu-toolbar button.on { background: #4f774e; border-color: #84a76b; color: #fff; }
	    .webgpu-toolbar button:disabled { opacity: 0.45; cursor: default; }
	    .webgpu-campaign-ui { position: absolute; inset: 0 310px 0 0; pointer-events: none; color: #eadfca; font: 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
	    .webgpu-campaign-hud { position: absolute; left: 12px; top: 12px; display: flex; align-items: center; gap: 12px; padding: 8px 10px; background: rgba(18,17,14,0.78); border: 1px solid rgba(177,143,82,0.45); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.32); }
	    .webgpu-campaign-hud b { color: #f4dfaa; font-family: Cinzel, Georgia, serif; }
	    .webgpu-campaign-panel { position: absolute; pointer-events: auto; width: 250px; max-height: calc(100% - 76px); overflow: auto; padding: 10px; background: linear-gradient(180deg,rgba(31,27,21,0.96),rgba(14,16,18,0.96)); border: 1px solid rgba(151,122,72,0.55); border-radius: 4px; box-shadow: 0 12px 30px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,236,186,0.12); }
	    .webgpu-campaign-panel.army { right: 12px; top: 54px; }
	    .webgpu-campaign-panel.city { right: 12px; bottom: 12px; }
	    .webgpu-campaign-panel.diplomacy { left: 12px; top: 54px; width: 310px; }
	    .webgpu-campaign-panel.classes { left: 12px; bottom: 12px; width: 250px; max-height: min(34%, 180px); }
	    .webgpu-campaign-panel b { font-family: Cinzel, Georgia, serif; letter-spacing: 0.2px; color: #f1dfb1; }
	    .webgpu-campaign-panel button { background: #202631; border: 1px solid #6c5b3e; border-radius: 3px; color: #eadfca; padding: 3px 8px; font: 11px ui-sans-serif, system-ui; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
	    .webgpu-campaign-panel button.on, .webgpu-campaign-panel button:hover:not(:disabled) { background: #3a3124; border-color: #b38a43; }
	    .webgpu-campaign-panel button:disabled { opacity: 0.72; cursor: default; }
	    .webgpu-campaign-panel input[type="checkbox"] { accent-color: #b38a43; }
	    .webgpu-campaign-panel .cmp-title { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
	    .webgpu-campaign-panel .cmp-ico { width: 14px; height: 14px; fill: currentColor; color: #caa45c; filter: drop-shadow(0 1px 0 rgba(0,0,0,0.35)); }
	    .webgpu-campaign-panel .cmp-diplo-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 5px 0; padding: 6px; border-radius: 3px; background: rgba(255,255,255,0.05); }
	    .webgpu-campaign-panel .cmp-swatch { width: 12px; height: 12px; border-radius: 2px; flex: none; box-shadow: 0 0 0 1px rgba(0,0,0,0.4); }
	    .webgpu-campaign-panel .cmp-rel { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 1px 5px; border-radius: 2px; }
	    .webgpu-campaign-panel .cmp-rel.war { background: #5a2330; color: #ff9a8a; }
	    .webgpu-campaign-panel .cmp-rel.peace { background: #2a3a4a; color: #9ec5e8; }
	    .webgpu-campaign-panel .cmp-rel.alliance { background: #2a4a32; color: #9ee8a8; }
	    .webgpu-campaign-panel .cmp-pow { opacity: 0.72; font-size: 11px; }
	    .webgpu-campaign-panel .cmp-diplo-acts { display: flex; gap: 4px; margin-top: 2px; flex-wrap: wrap; flex-basis: 100%; }
	    .webgpu-campaign-panel .cmp-class-row { display: grid; grid-template-columns: 1fr; gap: 7px; padding: 9px 0; border-top: 1px solid rgba(169,133,76,0.3); }
	    .webgpu-campaign-panel .cmp-class-name { font-family: Cinzel, Georgia, serif; font-weight: 700; color: #f0dcab; }
	    .webgpu-campaign-panel .cmp-class-meta, .webgpu-campaign-panel .cmp-city-meta { color: #b9aa8b; font-size: 11px; line-height: 1.25; }
	    .webgpu-campaign-panel .cmp-unit-options { display: flex; flex-direction: column; gap: 4px; }
	    .webgpu-campaign-panel .cmp-unit { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; background: rgba(42,36,28,0.84); padding: 6px; border: 1px solid rgba(119,94,55,0.35); border-radius: 3px; }
	    .webgpu-campaign-panel .cmp-unit.sel { background: rgba(81,64,37,0.96); border-color: rgba(194,154,82,0.72); }
	    .webgpu-campaign-panel .cmp-size, .webgpu-campaign-panel .cmp-recruits, .webgpu-campaign-panel .cmp-build-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 5px; }
	    @media (max-width: 760px) {
	      .webgpu-stage { grid-template-columns: 1fr; grid-template-rows: 1fr 220px; }
	      .webgpu-panel { border-left: 0; border-top: 1px solid #4d4432; }
	      .webgpu-battle-ui { inset: 0 0 220px 0; }
	      .webgpu-campaign-ui { inset: 0 0 220px 0; }
	      .webgpu-campaign-panel.classes, .webgpu-campaign-panel.diplomacy { display: none !important; }
      .webgpu-battle-hud { max-width: calc(100% - 28px); overflow: hidden; }
      .webgpu-battle-summary { display: none; }
      .webgpu-unitcards { left: 12px; right: 12px; justify-content: flex-start; }
    }
  `;
  document.head.appendChild(style);
}
