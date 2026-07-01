import { createFrameShell, type BackgroundRenderPass, type FrameGraphCommands, type FrameGraphPass, type MarkerInstance, type OverlayRenderPass, type RawFrameShell, type WorldRenderPass } from '../../../packages/renderer-core/src/frameShell';
import { screenToWorld, world3dToScreen, worldToScreen } from '../../../packages/renderer-core/src/cameraUniform';
import { GPU_DEPTH_FORMAT, GPU_WORLD_DEPTH_ATTACHMENT } from '../../../packages/renderer-core/src/depthContract';
import { requestGpuDevice, gpuFailureMessage } from '../../../packages/renderer-core/src/device';
import { assertStorageBufferFits, resolveDeviceCaps } from '../../../packages/renderer-core/src/capabilities';
import { WORLD_CAMERA_WGSL } from '../../../packages/renderer-core/src/cameraWgsl';
import { gpuOpaqueColorTarget, gpuWorldDepthStencil } from '../../../packages/renderer-core/src/pipelineContracts';
import { compileShader, setShaderErrorHandler, shaderCompilationMessages, type ShaderCompilationMessage } from '../../../packages/renderer-core/src/compileShader';
import { fatalSurfaceFor, showFatalErrorSurface } from '../../../web/src/shared/fatalError';
import { CAMPAIGN_FIGURE_SIZE } from '../../../web/src/campaign/renderer';
import { SkinnedCrowdPipeline } from '../../../packages/renderer-core/src/skinnedPipeline';
import { animationForFrame } from '../../../packages/crowd-runtime/src/animationState';
import { buildCrowdInstances, generatedFormation, type CrowdInstance } from '../../../packages/crowd-runtime/src/instanceData';
import { buildStackCrowd } from '../../../packages/crowd-runtime/src/stackCrowd';
import { assignCrowdLods, assignCrowdLodsByDistance, countLods, lodWithHysteresis } from '../../../packages/crowd-runtime/src/lod';
import { createPerfAverager } from '../../../packages/crowd-runtime/src/perfStats';
import { buildLiveBattleCrowdFrame } from '../../../packages/game-renderer/src/battle/crowdPass';
import { BattleMinimapPass } from '../../../packages/game-renderer/src/battle/minimapPass';
import { BattleGroundCuePass, selectedUnitGroundCueVertices } from '../../../packages/game-renderer/src/battle/groundCuePass';
import { BattleEffectLinePass } from '../../../packages/game-renderer/src/battle/effectLinePass';
import { SoldierShadowDecalPass } from '../../../packages/renderer-core/src/soldierShadowPass';
import { BattleParticlePass, type BattleParticle } from '../../../packages/game-renderer/src/battle/particlePass';
import { battleUnitsInRect, cssToBattleWorld, liveBattlePickUnits, pickBattleUnit, type BattlePickUnit, type RendererBattlePickCamera } from '../../../packages/game-renderer/src/battle/pickingDebug';
import { BattleTerrainPass, type BattleTerrainFixture } from '../../../packages/game-renderer/src/battle/terrainPass';
import { CLASS_DEPTH, CLASS_SPACING, UNIT_INFO } from '../../../packages/game-renderer/src/battle/unitInfoLayout';
import { CampaignCloudPass } from '../../../packages/game-renderer/src/campaign/atmospherePass';
import { CampaignEntityPass, type CampaignEntityInstance } from '../../../packages/game-renderer/src/campaign/entityPass';
import { buildCampaignMapDrawData, CampaignLabelPass, CampaignMapPass, CampaignMarkerPass, CampaignRoadPass, CampaignWorldLinePass, type CampaignLabel } from '../../../packages/game-renderer/src/campaign/mapPass';
import { CampaignSceneryPass, type CampaignSceneryInstance } from '../../../packages/game-renderer/src/campaign/sceneryPass';
import { PROP_REVIEW_GROUPS } from '../../../packages/game-renderer/src/models/shared/sceneryPropRegistry';
import { BATTLE_MAP_CATALOG, battleMapById, buildBattleTerrainPresentation, presentationEdgeMismatches, type BattleMapCatalogEntry } from '../../../packages/game-renderer/src/battle/mapCatalog';
import { flatHeightField, heightSpan, terrainHeightAt, type TerrainHeightField } from '../../../packages/game-renderer/src/terrain/heightField';
import { terrainHeightField, type BattleTerrainFeature, type BattleTerrainFeatureKind, type BattleTerrainGrid } from '../../../packages/game-renderer/src/battle/terrainFeatures';
import { BattleGroundPass } from '../../../packages/game-renderer/src/battle/groundPass';
import { BattleGrassPass, type BattleGrassBounds, type BattleGrassParams, type GrassAccentAggregation, type GrassFiberShellVariant, type GrassPrimitiveFamily, type TextureVolumeProfile, type TextureVolumeRenderModel } from '../../../packages/game-renderer/src/battle/grassPass';
import { sampleGrassField } from '../../../packages/game-renderer/src/battle/grassField';
import { BattleHorizonPass } from '../../../packages/game-renderer/src/battle/horizonPass';
import { eyePosition, projectPoint, unprojectToPlaneZ, type Camera3DParams } from '../../../packages/renderer-core/src/camera3d';
import { createWaterField } from '../../../packages/game-renderer/src/water/waterField';
import { WaterPlanePass } from '../../../packages/game-renderer/src/water/waterPlanePass';
import {
  WATER_ENVIRONMENTS,
  applyBattleEnvironment,
  battleEnvironmentStats,
  resolveBattleEnvironment,
  skinnedLightingForBattleEnvironment,
  type BattleEnvironment,
  type WaterEnvironment,
} from '../../../packages/game-renderer/src/environment/environment';
import { featuresToBattleScenery } from '../../../packages/game-renderer/src/battle/terrainScenery';
import { MeshBuilder, type Rgb } from '../../../packages/game-renderer/src/models/shared/meshBuilder';
import type { GrassAccentStyle } from '../../../packages/game-renderer/src/models/shared/grassModels';
import { CampaignSelectionPass, type CampaignSelectionInstance } from '../../../packages/game-renderer/src/campaign/selectionPass';
import { campaignBorderVertices, CampaignTerritoryPass } from '../../../packages/game-renderer/src/campaign/territoryPass';
import { Nested3dFixturePass } from '../../../packages/game-renderer/src/fixtures/nested3d';
import { formatPerfSummary, makeFullGamePerfReport } from '../../../packages/game-renderer/src/perfReport';
import { compileRenderGraph, fullGameRenderGraphReport, type RenderGraphPass } from '../../../packages/game-renderer/src/renderGraph';
import { loadPlaceholderKit, loadPlaceholderVat, mountedClassesFromKit, placeholderClipNames } from '../../../packages/soldier-assets/src/placeholders';
import {
  REAL_UNIT_CLASS_COUNT,
  PLACEHOLDER_RENDER_CLASS_COUNT,
  SHOCK_CAV_SIDEARM_CLASS,
  createPlaceholderSoldierMeshes,
  createPlaceholderSoldierMeshTiers,
} from '../../../packages/soldier-assets/src/soldierMesh';
import { badArtistPackFixture, validateRig, validateSoldierKit, type ImportedRig, type ValidationReport } from '../../../packages/soldier-assets/src/validate';
import { bakeGltf } from '../../../packages/soldier-assets/bake/gltf.mjs';
import type { VatBake, VatClip } from '../../../packages/soldier-assets/src/schema';
import { importedRigMesh } from './importedRigMesh';
import { routeCrowdPerf, routePbrProbe, routeWaterPbr } from './bakeoffProbes';
import { buildBattleUiModel, BattleUiLayer } from '../../../web/src/battle/uiLayer';
import { UNIT_CLASS_BY_KEY, UnitClass, CLASS_NAMES } from '../../../web/src/battle/classData';
import type { UnitCardInit, UnitCardState } from '../../../web/src/battle/unitCard';
import { UnitCardsReact } from '../../../web/src/ui/hud/UnitCardsReact';
import { installViewportGate } from '../../../web/src/battle/viewportGate';
import { loadCampaignData, nearestLoc, type CampaignData } from '../../../web/src/campaign/data';
import { Allegiance } from '../../../web/src/campaign/status';
import { campaignSurface } from '../../../web/src/campaign/surface';
import { TerrainField } from '../../../web/src/campaign/terrain';
import { Territory, type FactionLabel } from '../../../web/src/campaign/territory';
import { readCampaignViews, type ArmyView, type CampaignViews, type CityView } from '../../../web/src/campaign/views';
import { CampaignUiLayer } from '../../../web/src/campaign/uiLayer';

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
  '/renderer/device': routeDevice,
  '/renderer/capabilities': routeCapabilities,
  '/renderer/per-class-vat': routePerClassVat,
  '/renderer/soldier-materials': routeSoldierMaterials,
  '/renderer/mounted-units': routeMountedUnits,
  '/renderer/lod-tiers': routeLodTiers,
  '/renderer/battle-elevation': routeBattleElevation,
  '/renderer/battle-effects': routeBattleEffects,
  '/renderer/asset-workbench': routeAssetWorkbench,
  '/renderer/fault-injection': routeFaultInjection,
  '/renderer/frame-shell': routeFrameShell,
  '/renderer/assets': routeAssets,
  '/renderer/crowd-data': routeCrowdData,
  '/renderer/animation-state': routeAnimationState,
  '/renderer/skinned-soldier': routeSkinnedSoldier,
  '/renderer/skinned-crowd': routeSkinnedCrowd,
  '/renderer/skinned-depth': routeSkinnedDepth,
  '/renderer/battle-ground-cue-depth': routeBattleGroundCueDepth,
  '/renderer/battle-effect-overlay': routeBattleEffectOverlay,
  '/renderer/lod': routeLod,
  '/renderer/battle': routeBattle,
  '/renderer/perf': routePerf,
  '/renderer/campaign': routeCampaign,
  '/renderer/campaign-map': routeCampaignMap,
  '/renderer/campaign-ui': routeCampaignUi,
  '/renderer/campaign-models': routeCampaignModelShots,
  '/renderer/shared-prop-models': routeSharedPropModelShots,
  '/renderer/shared-grass-models': routeSharedGrassModelShots,
  '/renderer/render-graph': routeRenderGraph,
  '/renderer/world-camera': routeWorldCamera,
  '/renderer/battle-terrain': routeBattleTerrain,
  '/renderer/battle-terrain-features': routeBattleTerrainFeatures,
  '/renderer/battle-terrain-3d': routeBattleTerrain3d,
  '/renderer/battle-grass': routeBattleGrass,
  '/renderer/battle-grass-field': routeBattleGrassField,
  '/renderer/battle-ui': routeBattleUi,
  '/renderer/battle-input': routeBattleInput,
  '/renderer/battle-live': routeBattleLive,
  '/renderer/card-bar': routeCardBar,
  '/renderer/water-bakeoff': routeWaterBakeoff,
  '/renderer/camera3d-probe': routeCamera3dProbe,
  // Slice 06 bake-off spikes (throwaway; bespoke prong):
  '/renderer/pbr-probe': routePbrProbe,
  '/renderer/water-pbr': routeWaterPbr,
  '/renderer/crowd-perf': routeCrowdPerf,
};

export async function mountRendererLab(path = location.pathname) {
  document.body.innerHTML = '';
  document.body.className = 'renderer-lab-body';
  installStyles();
  const root = el('main', 'renderer-lab');
  const nav = el('nav', 'renderer-lab-nav');
  for (const key of Object.keys(routes)) {
    const a = document.createElement('a');
    a.href = key;
    a.textContent = key.replace('/renderer/', '');
    a.className = key === path ? 'active' : '';
    nav.appendChild(a);
  }
  const stage = el('section', 'renderer-stage');
  const canvas = document.createElement('canvas');
  canvas.id = 'renderer-canvas';
  const panel = el('aside', 'renderer-panel');
  const status = el('div', 'renderer-status');
  panel.appendChild(status);
  stage.append(canvas, panel);
  root.append(nav, stage);
  document.body.appendChild(root);
  const route = routes[path] ?? routeDevice;
  try {
    await route({ root, canvas, panel, status, path, params: new URLSearchParams(location.search) });
  } catch (error) {
    status.textContent = gpuFailureMessage(error);
    status.classList.add('bad');
    (window as unknown as { __rendererLabReady?: boolean; __rendererLabStats?: unknown }).__rendererLabReady = true;
    (window as unknown as { __rendererLabStats?: unknown }).__rendererLabStats = { ok: false, error: String(error) };
  }
}

async function routeDevice(ctx: LabContext) {
  const info = await requestGpuDevice();
  const shell = await createFrameShell(ctx.canvas);
  const markers = generatedMarkers(18, -8, -4, 0).concat(generatedMarkers(18, 8, 2, 1));
  shell.setCamera({ x: 0, y: 0, zoom: 10, pitch: 0.25, yaw: 0 });
  shell.drawFrame({ markers, markerLayer: 'lab-placeholder' });
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

// A distinct VAT for a class: every clip's frame count scaled by `factor`
// (columns duplicated, poses preserved) so its clip table — and therefore its
// per-class playback rate — differs from the shared placeholder.
function stretchVat(vat: VatBake, factor: number): VatBake {
  const clips: VatClip[] = [];
  const colMap: number[] = [];
  let start = 0;
  for (const clip of vat.clips) {
    const frames = clip.frames * factor;
    clips.push({ name: clip.name, start, frames });
    for (let f = 0; f < frames; f++) colMap.push(clip.start + Math.floor(f / factor));
    start += frames;
  }
  const width = start;
  const data = new Array<number>(width * vat.height * 4);
  for (let row = 0; row < vat.height; row++) {
    for (let col = 0; col < width; col++) {
      const src = colMap[col];
      for (let k = 0; k < 4; k++) data[(row * width + col) * 4 + k] = vat.data[(row * vat.width + src) * 4 + k];
    }
  }
  return { ...vat, width, clips, data };
}

async function routeBattleEffects(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  const cols = 10;
  const rows = 5;
  const n = cols * rows;
  const positions = new Float32Array(n * 2);
  const alive = new Float32Array(n);
  const frames = new Float32Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      positions[i * 2] = (c - (cols - 1) / 2) * 2.0;
      positions[i * 2 + 1] = (r - (rows - 1) / 2) * 2.0;
      // Front two rows stand; the rest are fallen — a field of corpses.
      alive[i] = r < 2 ? 1 : 0;
      frames[i] = r < 2 ? 1 : 4; // FRAME_FALLEN
    }
  }
  const built = buildCrowdInstances({ positions, alive, frames, simTick: 200 });
  const instances = built.instances.map((inst) => ({ ...inst, facing: Math.PI / 2 }));
  const corpses = instances.filter((inst) => !inst.alive);
  const variantSet = new Set(corpses.map((inst) => inst.deathVariant ?? 0));

  // Impact dust + blood at varied ages so the fade is visible.
  const particles: BattleParticle[] = [];
  for (let i = 0; i < 40; i++) {
    const inst = corpses[i % corpses.length];
    particles.push({ x: inst.x + (i % 3 - 1) * 0.4, y: inst.y, z: (inst.elevation ?? 0) + 0.4, age: (i % 10) / 10, kind: i % 2 === 0 ? 'dust' : 'blood', size: 0.5 });
  }

  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: 0, zoom: 24, pitch: 0.28, yaw: 0 });
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  const shadows = new SoldierShadowDecalPass(shell);
  const fx = new BattleParticlePass(shell);
  shadows.upload(instances);
  fx.upload(particles);

  const start = performance.now();
  const tick = () => {
    const phaseOffset = ((performance.now() - start) / 1000) * 0.6;
    pipeline.upload(instances, { phaseOffset, size: 1 });
    shell.drawFrame({
      passes: [
        { id: 'effects-crowd', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => pipeline.draw(pass) },
        { id: 'effects-shadows', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => shadows.draw(pass) },
        { id: 'effects-particles', role: 'overlay-effect', phase: 'overlay', draw: (pass) => fx.draw(pass) },
      ],
    });
    requestAnimationFrame(tick);
  };
  tick();
  ctx.status.innerHTML = reportTable({
    route: 'battle-effects',
    living: instances.length - corpses.length,
    corpses: corpses.length,
    'death variants used': [...variantSet].sort().join(','),
    particles: fx.stats().particles,
    'particles capped': fx.stats().capped,
  });
  publish('battle-effects', true, {
    route: 'battle-effects',
    living: instances.length - corpses.length,
    corpses: corpses.length,
    deathVariants: [...variantSet].sort(),
    particles: fx.stats().particles,
    capped: fx.stats().capped,
  });
}

async function routeBattleElevation(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  // A smooth ridge centered at x=0 — soldiers climb up and over it.
  const ridge = (x: number, _y: number) => 2.2 * Math.exp(-(x * x) / 36);
  const cols = 14;
  const rows = 3;
  const positions = new Float32Array(cols * rows * 2);
  const unitClass: number[] = [];
  const soldierUnit = new Uint32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      positions[i * 2] = (c - (cols - 1) / 2) * 2.4;
      positions[i * 2 + 1] = (r - (rows - 1) / 2) * 2.0;
    }
  }
  unitClass.push(0);
  const built = buildCrowdInstances({ positions, soldierUnit, unitClass, terrainHeight: ridge, simTick: 90 });
  const instances = built.instances.map((inst) => ({ ...inst, facing: Math.PI / 2 }));

  // The elevation each instance received must equal the sampled terrain height.
  const elevationMatches = instances.every((inst) => Math.abs((inst.elevation ?? 0) - ridge(inst.x, inst.y)) < 1e-6);
  const elevationSpan = Math.max(...instances.map((i) => i.elevation ?? 0)) - Math.min(...instances.map((i) => i.elevation ?? 0));

  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: 0, zoom: 26, pitch: 0.30, yaw: 0 });
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  const shadows = new SoldierShadowDecalPass(shell);

  const start = performance.now();
  const tick = () => {
    const phaseOffset = ((performance.now() - start) / 1000) * 0.6;
    pipeline.upload(instances, { forcedClip: 'march', phaseOffset, size: 1 });
    shadows.upload(instances);
    shell.drawFrame({
      passes: [
        { id: 'elevation-crowd', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => pipeline.draw(pass) },
        { id: 'elevation-shadows', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => shadows.draw(pass) },
      ],
    });
    requestAnimationFrame(tick);
  };
  tick();
  ctx.status.innerHTML = reportTable({
    route: 'battle-elevation',
    soldiers: instances.length,
    'elevation matches terrain': elevationMatches,
    'elevation span': elevationSpan.toFixed(2),
    shadows: shadows.stats().shadows,
  });
  publish('battle-elevation', true, {
    route: 'battle-elevation',
    soldiers: instances.length,
    elevationMatches,
    elevationSpan,
    shadows: shadows.stats().shadows,
  });
}

async function routeLodTiers(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  const tiers = createPlaceholderSoldierMeshTiers([0.20, 0.42, 0.88]);
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: 0, zoom: 40, pitch: 0.18, yaw: 0 });
  const pipeline = new SkinnedCrowdPipeline(shell, tiers, vat);

  // Three soldiers side by side, explicitly L0/L1/L2, so detail reduction is
  // directly reviewable.
  const lineup = [0, 1, 2].map((lod) => ({ ...crowdInstance((lod - 1) * 2.6, 0, 0, 'at_ease'), lod }));
  const triCounts = [0, 1, 2].map((lod) => tiers[0][lod].indices.length / 3);

  // The distance algorithm: a line of instances receding from the camera focus
  // must coarsen monotonically (near = L0, far = coarser).
  const probeCamera = { x: 0, y: 0, zoom: 20 };
  const probe = Array.from({ length: 16 }, (_, i) => ({ ...crowdInstance(0, 0, 0, 'idle'), y: i * 30 }));
  const probeLevels = assignCrowdLodsByDistance(probe, probeCamera).map((a) => a.level);
  const monotonic = probeLevels.every((lvl, i) => i === 0 || lvl >= probeLevels[i - 1]);
  const tiersReached = new Set(probeLevels).size;

  // Hysteresis: within the deadband around the L0/L1 boundary (size 18), an
  // instance keeps its previous tier instead of flipping every frame.
  const heldL0 = lodWithHysteresis(0, 17.5);
  const heldL1 = lodWithHysteresis(1, 18.5);

  animateSkinned(shell, pipeline, () => lineup, { phaseSpeed: 0.5, size: 1.4 });
  ctx.status.innerHTML = reportTable({
    route: 'lod-tiers',
    'L0 / L1 / L2 triangles': triCounts.join(' / '),
    'tiers reduce geometry': triCounts[0] > triCounts[1] && triCounts[1] > triCounts[2],
    'distance bins coarsen': monotonic,
    'probe levels': probeLevels.join(''),
    'hysteresis holds at boundary': heldL0 === 0 && heldL1 === 1,
  });
  publish('lod-tiers', true, {
    route: 'lod-tiers',
    triCounts,
    reduces: triCounts[0] > triCounts[1] && triCounts[1] > triCounts[2],
    probeLevels,
    monotonic,
    tiersReached,
    hysteresis: { heldL0, heldL1 },
    meshVariants: pipeline.stats().meshVariants,
  });
}

async function routeMountedUnits(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  const zoom = numberParam(ctx.params, 'zoom', 6);
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: 0, zoom: 30, pitch: 0.16, yaw: 0 });
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  const heavySword = UNIT_CLASS_BY_KEY[UnitClass.HeavySword];
  const mediumPhalanx = UNIT_CLASS_BY_KEY[UnitClass.MediumPhalanx];
  const shockCavalry = UNIT_CLASS_BY_KEY[UnitClass.ShockCavalry];
  const horseArchers = UNIT_CLASS_BY_KEY[UnitClass.HorseArchers];
  // Heavy sword and medium phalanx are foot; the cavalry classes and the
  // render-only shock-cav sidearm are mounted archetypes.
  const lineup = [
    crowdInstance(-6.0, heavySword, 0, 'march', false),
    crowdInstance(-3.0, mediumPhalanx, 0, 'march', false),
    crowdInstance(0, shockCavalry, 0, 'march', true),
    crowdInstance(3.0, horseArchers, 1, 'march', true),
    crowdInstance(6.0, SHOCK_CAV_SIDEARM_CLASS, 1, 'march', true),
  ];
  const lods = assignCrowdLods(lineup, zoom);
  const byClass = (id: number) => lods[lineup.findIndex((s) => s.classId === id)].screenSize;
  const footSize = byClass(heavySword);
  const phalanxSize = byClass(mediumPhalanx);
  const mountedSizes = { [shockCavalry]: byClass(shockCavalry), [horseArchers]: byClass(horseArchers), [SHOCK_CAV_SIDEARM_CLASS]: byClass(SHOCK_CAV_SIDEARM_CLASS) };
  const allMountedScaled = Object.values(mountedSizes).every((s) => s > footSize + 0.01);
  const phalanxFoot = Math.abs(phalanxSize - footSize) < 0.01;
  const sidearmScaled = mountedSizes[SHOCK_CAV_SIDEARM_CLASS] > footSize + 0.01;
  const mountedEqual = mountedSizes[shockCavalry] === mountedSizes[horseArchers] && mountedSizes[horseArchers] === mountedSizes[SHOCK_CAV_SIDEARM_CLASS];

  animateSkinned(shell, pipeline, () => lineup, { forcedClip: 'march', phaseSpeed: 0.6, size: 1 });
  ctx.status.innerHTML = reportTable({
    route: 'mounted-units',
    'foot LOD size': footSize.toFixed(2),
    'heavy sword / medium phalanx size': `${footSize.toFixed(2)} / ${phalanxSize.toFixed(2)}`,
    [`shock cav / horse archers / ${SHOCK_CAV_SIDEARM_CLASS} size`]: `${mountedSizes[shockCavalry].toFixed(2)} / ${mountedSizes[horseArchers].toFixed(2)} / ${mountedSizes[SHOCK_CAV_SIDEARM_CLASS].toFixed(2)}`,
    'all mounted scale': allMountedScaled,
    'medium phalanx remains foot': phalanxFoot,
    [`class ${SHOCK_CAV_SIDEARM_CLASS} scaled`]: sidearmScaled,
  });
  publish('mounted-units', true, {
    route: 'mounted-units',
    footSize,
    phalanxSize,
    mountedSizes,
    allMountedScaled,
    phalanxFoot,
    sidearmScaled,
    sidearmClass: SHOCK_CAV_SIDEARM_CLASS,
    realUnitClassCount: REAL_UNIT_CLASS_COUNT,
    heavySwordClass: heavySword,
    mediumPhalanxClass: mediumPhalanx,
    shockCavalryClass: shockCavalry,
    horseArchersClass: horseArchers,
    mountedEqual,
    mountedFlags: lineup.map((s) => ({ classId: s.classId, mounted: s.mounted })),
  });
}

async function routeSoldierMaterials(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  const strength = numberParam(ctx.params, 'strength', 1);
  const faction = integerParam(ctx.params, 'team', 0, 0, 1) as 0 | 1;
  const classId = integerParam(ctx.params, 'class', 0, 0, PLACEHOLDER_RENDER_CLASS_COUNT - 1);
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: 0, zoom: 86, pitch: 0.10, yaw: 0 });
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  pipeline.setFactionMaskStrength(strength);
  const soldier = generatedFormation(1, { frame: 6, spacing: 1, faction, classId }).map((inst) => ({ ...inst, x: 0, y: 0, facing: Math.PI / 2 }));
  animateSkinned(shell, pipeline, () => soldier, { forcedClip: 'at_ease', phaseSpeed: 0, size: 1.6 });
  ctx.status.innerHTML = reportTable({
    route: 'soldier-materials',
    'faction mask strength': strength.toFixed(2),
    faction,
    classId,
    note: strength > 0 ? 'faction color localized to mask (crest/shield/sash)' : 'legacy broad team tint',
  });
  publish('soldier-materials', true, { route: 'soldier-materials', strength, faction, classId, ...pipeline.stats() });
}

async function routePerClassVat(ctx: LabContext) {
  const placeholder = await loadPlaceholderVat();
  const kit = await loadPlaceholderKit();
  const stretched = stretchVat(placeholder, 2);
  const meshes = createPlaceholderSoldierMeshes([0.20, 0.42, 0.88]);
  // class 1 → its own 2x VAT; class 0 and everything else (e.g. class 5) → the
  // shared placeholder fallback.
  const vats = meshes.map((_, id) => (id === 1 ? stretched : placeholder));
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: 0, zoom: 70, pitch: 0.14, yaw: 0 });
  const pipeline = new SkinnedCrowdPipeline(shell, meshes, vats, kit);
  const soldiers = [crowdInstance(-3.4, 0, 0, 'march'), crowdInstance(0, 1, 1, 'march'), crowdInstance(3.4, 5, 0, 'march')];

  const c0 = pipeline.classClip(0, 'march');
  const c1 = pipeline.classClip(1, 'march');
  const c5 = pipeline.classClip(5, 'march');
  const stats = {
    route: 'per-class-vat',
    vatVariants: pipeline.stats().vatVariants,
    class0Frames: c0.frames,
    class1Frames: c1.frames,
    class5Frames: c5.frames,
    divergence: c1.frames === c0.frames * 2,
    fallbackMatches: c5.frames === c0.frames,
  };
  ctx.status.innerHTML = reportTable({
    route: 'per-class-vat',
    'VAT variants': stats.vatVariants,
    'class 0 march frames': stats.class0Frames,
    'class 1 march frames (2x VAT)': stats.class1Frames,
    'class 5 march frames (fallback)': stats.class5Frames,
    'per-class divergence': stats.divergence,
    'fallback to shared': stats.fallbackMatches,
  });

  const start = performance.now();
  const tick = () => {
    const phaseOffset = ((performance.now() - start) / 1000) * 0.6;
    pipeline.upload(soldiers, { forcedClip: 'march', phaseOffset, size: 1 });
    shell.drawFrame({
      passes: [{ id: 'per-class-vat', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => pipeline.draw(pass) }],
    });
    requestAnimationFrame(tick);
  };
  tick();
  publish('per-class-vat', true, stats);
}

interface WorkbenchImport {
  source: string;
  ok: boolean;
  bones: number;
  clips: string[];
  boneNames: string[];
  vat: string;
  report: ValidationReport;
  error: string | null;
}

function crowdInstance(x: number, classId: number, faction: 0 | 1 | 2, clip: string, mounted = false): CrowdInstance {
  return { x, y: 0, facing: Math.PI / 2, classId, faction, alive: true, frame: 0, clip, phase: 0, seed: 1, mounted, lod: 0 };
}

async function routeAssetWorkbench(ctx: LabContext) {
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: 0, zoom: 64, pitch: 0.16, yaw: 0 });
  const placeholderVat = await loadPlaceholderVat();
  const placeholderPipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], placeholderVat);
  const placeholderInstances = [crowdInstance(-3.2, 0, 0, 'march')];

  let importedPipeline: SkinnedCrowdPipeline | null = null;
  let importedInstances: CrowdInstance[] = [];
  let imported: WorkbenchImport | null = null;

  const loadGlb = (buffer: ArrayBuffer, source: string) => {
    try {
      const { rig, bake, boneNames } = bakeGltf(buffer, { fps: placeholderVat.fps, skeleton: 'imported' });
      const report = validateRig(rig as ImportedRig);
      importedPipeline = new SkinnedCrowdPipeline(shell, importedRigMesh(rig as ImportedRig), bake);
      const clip = bake.clips[0]?.name ?? 'idle';
      importedInstances = [crowdInstance(2.6, 0, 1, clip)];
      imported = { source, ok: report.ok, bones: rig.bones.length, clips: bake.clips.map((c) => c.name), boneNames, vat: `${bake.width}x${bake.height}`, report, error: null };
    } catch (error) {
      importedPipeline = null;
      importedInstances = [];
      const message = error instanceof Error ? error.message : String(error);
      imported = {
        source, ok: false, bones: 0, clips: [], boneNames: [], vat: '',
        report: { ok: false, errors: [{ level: 'error', code: 'import', path: source, message }], warnings: [], issues: [{ level: 'error', code: 'import', path: source, message }] },
        error: message,
      };
    }
    renderPanel();
    publishStats();
  };

  // The default render proves the placeholder path is intact even before any
  // asset is dropped; we then load the checked-in test fixture beside it.
  try {
    const res = await fetch('/assets/soldiers/test/two-bone.glb');
    if (res.ok) loadGlb(await res.arrayBuffer(), 'two-bone.glb (default fixture)');
  } catch {
    // fixture optional — the workbench still renders the placeholder alone
  }

  (window as unknown as { __assetWorkbench?: { loadBase64Glb(b64: string, name: string): void } }).__assetWorkbench = {
    loadBase64Glb: (b64, name) => loadGlb(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer, name),
  };

  const start = performance.now();
  const tick = () => {
    const phaseOffset = ((performance.now() - start) / 1000) * 0.7;
    placeholderPipeline.upload(placeholderInstances, { forcedClip: 'march', phaseOffset, size: 1 });
    importedPipeline?.upload(importedInstances, { forcedClip: importedInstances[0]?.clip, phaseOffset, size: 1.4 });
    shell.drawFrame({
      passes: [{
        id: 'asset-workbench', role: 'world-opaque', phase: 'world-depth', depth: 'read-write',
        draw: (pass) => { placeholderPipeline.draw(pass); importedPipeline?.draw(pass); },
      }],
    });
    requestAnimationFrame(tick);
  };
  tick();

  function renderPanel() {
    ctx.status.innerHTML = '';
    const intro = el('p', 'fault-intro');
    intro.textContent = 'Left: placeholder soldier (default path). Right: imported .glb skeleton baked live to a VAT. Drop a .glb to replace it.';
    ctx.status.appendChild(intro);
    const drop = el('div', 'asset-workbench');
    drop.innerHTML = '<label>Import a rigged .glb</label>';
    const fileLabel = el('label', 'asset-file');
    fileLabel.textContent = 'Choose .glb';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.glb,.gltf,model/gltf-binary';
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (f) loadGlb(await f.arrayBuffer(), f.name);
    });
    fileLabel.appendChild(file);
    drop.appendChild(fileLabel);
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
      const f = e.dataTransfer?.files?.[0];
      if (f) loadGlb(await f.arrayBuffer(), f.name);
    });
    ctx.status.appendChild(drop);
    ctx.status.insertAdjacentHTML('beforeend', reportTable({
      route: 'asset-workbench',
      'placeholder soldier': 'rendered (default intact)',
      'imported source': imported?.source ?? 'none',
      'imported bones': imported?.bones ?? '—',
      'imported clips': imported?.clips.join(', ') || '—',
      'imported VAT': imported?.vat || '—',
      'validation': imported ? (imported.ok ? 'OK' : `${imported.report.errors.length} error(s)`) : '—',
    }));
    if (imported && imported.report.issues.length > 0) {
      ctx.status.insertAdjacentHTML('beforeend', issueList(imported.report.issues));
    }
  }

  function publishStats() {
    publish('asset-workbench', true, {
      route: 'asset-workbench',
      placeholderRendered: true,
      placeholderVat: `${placeholderVat.width}x${placeholderVat.height}`,
      imported: imported && {
        source: imported.source,
        ok: imported.ok,
        bones: imported.bones,
        clips: imported.clips,
        boneNames: imported.boneNames,
        vat: imported.vat,
        errors: imported.report.errors,
        error: imported.error,
      },
    });
  }
}

async function routeCapabilities(ctx: LabContext) {
  const sampleParam = integerParam(ctx.params, 'msaa', 1, 1, 4);
  const shell = await createFrameShell(ctx.canvas, { enableGpuTimer: true, sampleCount: sampleParam });
  const caps = shell.info.caps;

  // The deliberate depth downgrade: what caps would choose if depth24plus were
  // unavailable. Decision only — we do not re-render the live shell on it.
  const downgradeCaps = resolveDeviceCaps({
    adapterLimits: shell.info.limits,
    deviceFeatures: shell.info.features,
    powerPreference: caps.powerPreference,
    forceNoDepth24: true,
  });

  // VAT storage-buffer guard: oversize is rejected before allocation; a real
  // size fits.
  let oversizeRejected = false;
  let oversizeMessage = '';
  try {
    assertStorageBufferFits(caps.maxStorageBufferBindingSize + 1, caps, 'probe-oversize');
  } catch (error) {
    oversizeRejected = true;
    oversizeMessage = error instanceof Error ? error.message : String(error);
  }
  let realSizeFits = true;
  try {
    assertStorageBufferFits(1 << 20, caps, 'probe-fits');
  } catch {
    realSizeFits = false;
  }

  shell.setCamera({ x: 0, y: 0, zoom: 9, pitch: 0.34, yaw: -0.12 });
  const markers = generatedMarkers(80, -10, -9, 0).concat(generatedMarkers(80, 10, 3, 1));
  const fixture = new Nested3dFixturePass(shell);
  const draw = (): FrameGraphCommands => ({
    markers,
    markerLayer: 'lab-placeholder',
    passes: [{ id: 'capabilities-nested-3d', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => fixture.draw(pass) }],
  });

  const tick = () => {
    shell.drawFrame(draw());
    const stats = shell.stats();
    ctx.status.innerHTML = reportTable({
      route: 'capabilities',
      'power preference': caps.powerPreference,
      'preferred format': shell.info.format,
      'depth format': caps.depthFormat,
      'depth fallback (forced)': `${downgradeCaps.depthFormat} — ${downgradeCaps.depthDowngrade ?? 'none'}`,
      'maxStorageBufferBindingSize': caps.maxStorageBufferBindingSize,
      'maxBufferSize': caps.maxBufferSize,
      'MSAA supported': caps.msaaSupported,
      'sample count': stats.sampleCount,
      'timestamp-query': caps.timestampQuery,
      'GPU time (ms)': stats.gpuTimeMs === null ? 'pending' : stats.gpuTimeMs.toFixed(3),
      'VAT oversize rejected': oversizeRejected,
      'VAT real size fits': realSizeFits,
    });
    publish('capabilities', true, {
      route: 'capabilities',
      caps,
      downgrade: { depthFormat: downgradeCaps.depthFormat, reason: downgradeCaps.depthDowngrade },
      grantedLimits: { maxStorageBufferBindingSize: shell.info.limits.maxStorageBufferBindingSize, maxBufferSize: shell.info.limits.maxBufferSize },
      sampleCount: stats.sampleCount,
      gpuTimeMs: stats.gpuTimeMs,
      vatGuard: { oversizeRejected, oversizeMessage, realSizeFits },
      features: shell.info.features,
    });
    requestAnimationFrame(tick);
  };
  tick();
}

const BAD_SHADER_WGSL = `
@vertex
fn vs() -> @builtin(position) vec4f {
  return notAFunction(1.0);  // undeclared identifier — must surface a compile error
}`;

interface FaultInjectionState {
  route: 'fault-injection';
  initialFrameRendered: boolean;
  badShader: { triggered: boolean; errorCount: number; firstError: ShaderCompilationMessage | null; handlerFired: boolean } | null;
  rejectedSubmission: { triggered: boolean; captured: boolean; message: string } | null;
  deviceLoss: { triggered: boolean; reason: string; fatalSurface: boolean } | null;
  health: { fatal: boolean; deviceLost: boolean };
}

interface FaultInjectionApi {
  injectBadShader(): Promise<FaultInjectionState>;
  rejectSubmission(): Promise<FaultInjectionState>;
  forceDeviceLoss(): Promise<FaultInjectionState>;
}

async function routeFaultInjection(ctx: LabContext) {
  const state: FaultInjectionState = {
    route: 'fault-injection',
    initialFrameRendered: false,
    badShader: null,
    rejectedSubmission: null,
    deviceLoss: null,
    health: { fatal: false, deviceLost: false },
  };
  let handlerFired = false;
  setShaderErrorHandler(() => { handlerFired = true; });

  const shell = await createFrameShell(ctx.canvas, {
    onFatalError: (report) => showFatalErrorSurface(ctx.canvas, fatalSurfaceFor(
      report.phase === 'device-lost' ? 'device-lost' : 'submission',
      report.message,
    )),
  });
  shell.setCamera({ x: 0, y: 0, zoom: 10, pitch: 0.25, yaw: 0 });
  const markers = generatedMarkers(18, -8, -4, 0).concat(generatedMarkers(18, 8, 2, 1));
  shell.drawFrame({ markers, markerLayer: 'lab-placeholder' });
  state.initialFrameRendered = true;

  const sync = () => {
    state.health = { fatal: shell.health().fatal, deviceLost: shell.health().deviceLost };
    publish('fault-injection', true, state);
    renderPanel();
  };

  const injectBadShader = async () => {
    handlerFired = false;
    // Compile on a throwaway device so the bad shader's uncaptured error does
    // not mark the live shell fatal — each fault here is demonstrated in
    // isolation. The compile-error surfacing path is identical to production.
    const scratch = await requestGpuDevice();
    const module = compileShader(scratch.device, BAD_SHADER_WGSL, 'fault-bad-shader');
    const messages = await shaderCompilationMessages(module, 'fault-bad-shader');
    const errors = messages.filter((m) => m.type === 'error');
    state.badShader = {
      triggered: true,
      errorCount: errors.length,
      firstError: errors[0] ?? null,
      handlerFired,
    };
    (scratch.device as unknown as { destroy(): void }).destroy();
    sync();
    return state;
  };

  const rejectSubmission = async () => {
    let captured = false;
    let message = '';
    try {
      // Submitting a non-command-buffer is a synchronous validation/type error:
      // the diagnostic must surface, not vanish into a blank frame.
      (shell.device.queue as unknown as { submit(c: unknown[]): void }).submit([{ invalid: true }]);
    } catch (error) {
      captured = true;
      message = error instanceof Error ? error.message : String(error);
      console.error(`rejected submission: ${message}`);
    }
    state.rejectedSubmission = { triggered: true, captured, message };
    sync();
    return state;
  };

  const forceDeviceLoss = async () => {
    const lost = new Promise<void>((resolve) => {
      const prev = shell.health();
      if (prev.deviceLost) { resolve(); return; }
      const start = performance.now();
      const poll = () => {
        if (shell.health().deviceLost || performance.now() - start > 3000) resolve();
        else requestAnimationFrame(poll);
      };
      poll();
    });
    (shell.device as unknown as { destroy(): void }).destroy();
    await lost;
    // A defined post-loss state: the renderer shows the reload panel rather than
    // hanging. (Default policy: surface, do not silently auto-reinit.)
    shell.drawFrame({ markers, markerLayer: 'lab-placeholder' }); // no-op while fatal
    state.deviceLoss = {
      triggered: true,
      reason: shell.health().lastError?.message ?? '',
      fatalSurface: Boolean(window.__gpuFatal),
    };
    sync();
    return state;
  };

  const api: FaultInjectionApi = { injectBadShader, rejectSubmission, forceDeviceLoss };
  (window as unknown as { __faultInjection?: FaultInjectionApi }).__faultInjection = api;

  function renderPanel() {
    ctx.status.innerHTML = '';
    const intro = el('p', 'fault-intro');
    intro.textContent = 'Force each GPU fault and confirm a visible, correct outcome — never a silent blank canvas.';
    ctx.status.appendChild(intro);
    const controls = el('div', 'fault-controls');
    controls.append(
      faultButton('Inject bad shader', () => void injectBadShader()),
      faultButton('Reject submission', () => void rejectSubmission()),
      faultButton('Force device loss', () => void forceDeviceLoss()),
    );
    ctx.status.appendChild(controls);
    ctx.status.insertAdjacentHTML('beforeend', reportTable({
      'initial frame': state.initialFrameRendered,
      'bad shader errors': state.badShader ? state.badShader.errorCount : '—',
      'bad shader first': state.badShader?.firstError ? `${state.badShader.firstError.line}:${state.badShader.firstError.column} ${state.badShader.firstError.message}` : '—',
      'rejected submission': state.rejectedSubmission ? `captured=${state.rejectedSubmission.captured}` : '—',
      'device loss': state.deviceLoss ? `reason=${state.deviceLoss.reason || 'destroyed'}` : '—',
      'fatal surface': state.deviceLoss?.fatalSurface ?? false,
      'shell fatal': state.health.fatal,
    }));
  }

  function faultButton(label: string, onClick: () => void) {
    const button = document.createElement('button');
    button.className = 'fault-button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  sync();
}

async function routeFrameShell(ctx: LabContext) {
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: 0, zoom: 9, pitch: 0.38, yaw: -0.18 });
  const markers = generatedMarkers(80, -10, -9, 0).concat(generatedMarkers(80, 10, 3, 1));
  const frameGraphContractFixtures = liveFrameGraphContractFixtures(shell);
  animateShell(shell, ctx.status, () => ({ markers, markerLayer: 'lab-placeholder' }));
  publish('frame-shell', true, { ...shell.stats(), markers: markers.length, frameGraphContractFixtures });
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
  (window as unknown as { __gpuAssetWorkbench?: { validateManifest: (text: string, source?: string) => void } }).__gpuAssetWorkbench = {
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
  animateShell(shell, ctx.status, () => ({ markers: instances.map(instanceMarker), markerLayer: 'lab-placeholder' }));
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
  animateShell(shell, ctx.status, () => ({ markers, markerLayer: 'lab-placeholder' }));
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
  const classId = integerParam(ctx.params, 'class', 0, 0, PLACEHOLDER_RENDER_CLASS_COUNT - 1);
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

async function routeSkinnedDepth(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  const camera = { x: 0, y: 0, zoom: 92, pitch: 0.18, yaw: 0, perspective: 0 };
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  const frontClass = UNIT_CLASS_BY_KEY[UnitClass.HeavySword];
  const rearClass = SHOCK_CAV_SIDEARM_CLASS;
  const frontY = -0.03;
  const rearY = 0.03;
  const instances: CrowdInstance[] = [
    {
      x: 0,
      y: frontY,
      facing: Math.PI / 2,
      classId: frontClass,
      faction: 0,
      alive: true,
      frame: 1,
      clip: 'idle',
      phase: 0.15,
      seed: 11,
      mounted: false,
      lod: 0,
    },
    {
      x: 0,
      y: rearY,
      facing: Math.PI / 2,
      classId: rearClass,
      faction: 1,
      alive: true,
      frame: 1,
      clip: 'idle',
      phase: 0.15,
      seed: 22,
      mounted: true,
      lod: 0,
    },
  ];
  pipeline.upload(instances, { forcedClip: 'idle', phaseOffset: 0, size: 1.35 });
  shell.drawFrame({
    clear: { r: 0.70, g: 0.78, b: 0.62, a: 1 },
    terrainRect: [-4, -3, 8, 6],
    passes: [{ id: 'skinned-depth-crowd', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => pipeline.draw(pass) }],
  });
  const shellStats = shell.stats();
  const sampleCamera = { ...camera, width: shellStats.width, height: shellStats.height };
  const [sampleX, sampleY] = world3dToScreen(
    sampleCamera,
    -0.52 * 1.35,
    frontY,
    1.36 * 1.35,
  );
  const sample = { x: sampleX, y: sampleY, world: [-0.52 * 1.35, frontY, 1.36 * 1.35] };
  ctx.status.innerHTML = reportTable({
    route: 'skinned-depth',
    contract: 'front soldier is drawn before rear bucket',
    frontClass,
    rearClass,
    drawCalls: pipeline.stats().drawCalls,
    depth: shellStats.depth.allocated ? shellStats.depth.format : 'none',
  });
  publish('skinned-depth', true, {
    ...pipeline.stats(),
    frontClass,
    rearClass,
    hostileDrawOrder: `front-class-${frontClass}-submitted-before-rear-class-${rearClass}`,
    sample,
    depth: shellStats.depth,
    framePhases: shellStats.phases,
  });
}

async function routeBattleGroundCueDepth(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  const camera = { x: 0, y: 0, zoom: 92, pitch: 0.18, yaw: 0, perspective: 0 };
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  const groundCues = new BattleGroundCuePass(shell);
  const instances: CrowdInstance[] = [{
    x: 0,
    y: 0,
    facing: Math.PI / 2,
    classId: 0,
    faction: 0,
    alive: true,
    frame: 1,
    clip: 'idle',
    phase: 0.15,
    seed: 33,
    mounted: false,
    lod: 0,
  }];
  pipeline.upload(instances, { forcedClip: 'idle', phaseOffset: 0, size: 1.35 });
  groundCues.upload(battleGroundCueDepthFixtureVertices());
  shell.drawFrame({
    clear: { r: 0.70, g: 0.78, b: 0.62, a: 1 },
    terrainRect: [-4, -3, 8, 6],
    passes: [
      { id: 'battle-ground-cue-depth-crowd', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => pipeline.draw(pass) },
      { id: 'battle-ground-cue-depth-cues', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => groundCues.draw(pass) },
    ],
  });
  const shellStats = shell.stats();
  const sampleCamera = { ...camera, width: shellStats.width, height: shellStats.height };
  const covered = world3dToScreen(sampleCamera, -0.52 * 1.35, 0, 1.36 * 1.35);
  const exposed = world3dToScreen(sampleCamera, 1.85, 0.08, 0.02);
  const samples = {
    coveredCueUnderSoldier: { x: covered[0], y: covered[1], world: [-0.52 * 1.35, 0, 1.36 * 1.35] },
    exposedCueControl: { x: exposed[0], y: exposed[1], world: [1.85, 0.08, 0.02] },
  };
  ctx.status.innerHTML = reportTable({
    route: 'battle-ground-cue-depth',
    contract: 'late ground cue is depth-read and cannot overpaint a skinned soldier',
    hostileDrawOrder: 'crowd-before-late-ground-cue',
    cueLines: groundCues.stats().lineSegments,
    depth: shellStats.depth.allocated ? shellStats.depth.format : 'none',
  });
  publish('battle-ground-cue-depth', true, {
    route: 'battle-ground-cue-depth',
    ...pipeline.stats(),
    groundCues: groundCues.stats(),
    hostileDrawOrder: 'crowd-before-late-ground-cue',
    samples,
    depth: shellStats.depth,
    framePhases: shellStats.phases,
  });
}

function battleGroundCueDepthFixtureVertices() {
  const verts: number[] = [];
  const color: [number, number, number] = [1.0, 0.78, 0.22];
  for (const y of [-0.08, -0.04, 0.0, 0.04, 0.08]) {
    verts.push(-2.25, y, ...color, 2.25, y, ...color);
  }
  return new Float32Array(verts);
}

async function routeBattleEffectOverlay(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  const camera = { x: 0, y: 0, zoom: 92, pitch: 0.18, yaw: 0, perspective: 0 };
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const pipeline = await createSkinnedPipeline(shell, [0.20, 0.42, 0.88], vat);
  const effects = new BattleEffectLinePass(shell);
  const instances: CrowdInstance[] = [{
    x: 0,
    y: 0,
    facing: Math.PI / 2,
    classId: 0,
    faction: 0,
    alive: true,
    frame: 1,
    clip: 'idle',
    phase: 0.15,
    seed: 44,
    mounted: false,
    lod: 0,
  }];
  pipeline.upload(instances, { forcedClip: 'idle', phaseOffset: 0, size: 1.35 });
  effects.upload(battleEffectOverlayFixtureVertices());
  shell.drawFrame({
    clear: { r: 0.70, g: 0.78, b: 0.62, a: 1 },
    terrainRect: [-4, -3, 8, 6],
    passes: [
      { id: 'battle-effect-overlay-crowd', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => pipeline.draw(pass) },
      { id: 'battle-effect-overlay-lines', role: 'overlay-effect', phase: 'overlay', draw: (pass) => effects.draw(pass) },
    ],
  });
  const shellStats = shell.stats();
  const sampleCamera = { ...camera, width: shellStats.width, height: shellStats.height };
  const overSoldier = world3dToScreen(sampleCamera, -0.52 * 1.35, 0, 0.02);
  const exposed = world3dToScreen(sampleCamera, 1.85, 0.08, 0.02);
  const samples = {
    effectOverSoldier: { x: overSoldier[0], y: overSoldier[1], world: [-0.52 * 1.35, 0, 0.02] },
    exposedEffectControl: { x: exposed[0], y: exposed[1], world: [1.85, 0.08, 0.02] },
  };
  ctx.status.innerHTML = reportTable({
    route: 'battle-effect-overlay',
    contract: 'transient effect lines are overlay-effect, not world-depth decals',
    effectLines: effects.stats().lineSegments,
    depth: shellStats.depth.allocated ? shellStats.depth.format : 'none',
  });
  publish('battle-effect-overlay', true, {
    route: 'battle-effect-overlay',
    ...pipeline.stats(),
    effects: effects.stats(),
    samples,
    depth: shellStats.depth,
    framePhases: shellStats.phases,
  });
}

function battleEffectOverlayFixtureVertices() {
  const verts: number[] = [];
  const color: [number, number, number] = [1.0, 1.0, 0.92];
  for (const y of [-0.08, -0.04, 0.0, 0.04, 0.08]) {
    verts.push(-2.25, y, ...color, 2.25, y, ...color);
  }
  return new Float32Array(verts);
}

async function routeLod(ctx: LabContext) {
  const zoom = Number(ctx.params.get('zoom') ?? 5);
  const instances = generatedFormation(900, { x: -16, y: -10, faction: 0, columns: 30, frame: 1 })
    .concat(generatedFormation(900, { x: 16, y: 4, faction: 1, columns: 30, frame: 1 }));
  const lods = assignCrowdLods(instances, zoom);
  const counts = countLods(lods);
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: -1, zoom, pitch: 0.24, yaw: 0 });
  animateShell(shell, ctx.status, () => ({ markers: instances.map((inst, i) => ({ ...instanceMarker(inst), lod: lods[i].level, size: Math.max(0.5, 1.15 - lods[i].level * 0.14) })), markerLayer: 'lab-placeholder' }));
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
          route: '/renderer/perf',
          renderer: 'raw-gpu',
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
  animateShell(shell, ctx.status, () => ({ markers, markerLayer: 'lab-placeholder', terrainRect: [-48, -28, 96, 56] }));
  ctx.status.innerHTML = reportTable({ route: 'campaign', markers: markers.length, semantics: 'faction tint plus neutral standard' });
  publish('campaign', true, { markers: markers.length });
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
  const surface = campaignSurface(field);
  const territoryData = new Territory(data, field);
  territoryData.rebuild(views.cities);
  const preset = ctx.params.get('preset') ?? 'whole';
  const camera = campaignPresetCamera(preset);
  const shell = await createConfiguredShell(ctx.canvas, camera);
  // The sea shimmer rides cam.time (pitch-gated); snap at a fixed t for deterministic
  // shots (default 0 = the still painted chart, matching production snapshots).
  shell.setTime(numberParam(ctx.params, 't', 0));
  const map = new CampaignMapPass(shell, data.bg, data.bgRect, { seaTintMix: 1 }, surface.mesh);
  const clouds = new CampaignCloudPass(shell, data.bgRect);
  const territory = new CampaignTerritoryPass(shell, {
    width: field.w,
    height: field.h,
    rgba: territoryData.rgba,
    rect: data.bgRect,
  }, undefined, surface.mesh);
  const lines = new CampaignWorldLinePass(shell, 'triangle-list');
  const roads = new CampaignRoadPass(shell);
  const borders = new CampaignWorldLinePass(shell);
  const markers = new CampaignMarkerPass(shell);
  const labelPass = new CampaignLabelPass(shell);
  const drawData = buildCampaignMapDrawData(data, {
    roadScale: 0.78,
    roadSurfaceAt: (x, y) => surface.landAt(x, y, 10.5) ? 'land' : 'water',
    heightAt: surface.heightAt,
  });
  lines.upload(drawData.lineVertices);
  roads.upload(drawData.roadMeshVertices);
  borders.upload(campaignBorderVertices(territoryData.borders));
  markers.upload(drawData.cityMarkers);
  const labels = drawData.labels.concat(campaignFactionLabels(territoryData.labels));
  const labelLayer = labelPass.upload(labels, camera);
  shell.drawFrame({
    clear: { r: 0.68, g: 0.72, b: 0.69, a: 1 },
    terrainRect: [0, 0, 0, 0],
    passes: [
      { id: 'campaign-map-surface', role: 'world-depth-fill', phase: 'world-depth', depth: 'write', draw: (pass) => map.draw(pass) },
      { id: 'campaign-territory-wash', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => territory.draw(pass) },
      { id: 'campaign-borders', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => borders.draw(pass) },
      { id: 'campaign-roads', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => roads.draw(pass) },
      { id: 'campaign-sea-lanes-depth', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => lines.draw(pass) },
      { id: 'campaign-city-markers', role: 'overlay-ui', phase: 'overlay', draw: (pass) => markers.draw(pass) },
      { id: 'campaign-clouds', role: 'overlay-effect', phase: 'overlay', draw: (pass) => clouds.draw(pass) },
      { id: 'campaign-labels', role: 'overlay-ui', phase: 'overlay', draw: (pass) => labelPass.draw(pass) },
    ],
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
    water: 0,
    clouds: clouds.stats().cloudQuads,
    visibleLabels: labelLayer.visibleLabels,
    labelLayer: 'raw WebGPU glyph atlas',
    renderer: 'raw WebGPU map + territory + atmosphere + labels',
  });
  publish('campaign-map', true, {
    ...drawData.stats,
    preset,
    camera,
    cameraContract: shell.stats().cameraContract,
    labels: labelLayer.labels,
    visibleLabels: labelLayer.visibleLabels,
    factions: territoryData.labels.length,
    territoryPixels: territory.stats().pixels,
    borderSegments: borders.stats().segments,
    waterFeatures: 0,
    waterLayer: 'map-sea-mask',
    cloudQuads: clouds.stats().cloudQuads,
    labelAtlas: `${labelLayer.atlasWidth}x${labelLayer.atlasHeight}`,
    labelVertices: labelLayer.vertices,
    lineSegments: lines.stats().segments,
    roadTriangles: roads.stats().triangles,
    markerStats: markers.stats(),
    labelLayer: 'raw-gpu-glyph-atlas',
    territoryLayer: 'raw-gpu-texture',
    atmosphereLayer: 'raw-gpu-clouds',
    postCutoverScreenshots: 'renderer-only',
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
  const lines = new CampaignWorldLinePass(shell, 'triangle-list');
  const roads = new CampaignRoadPass(shell);
  const entities = new CampaignEntityPass(shell);
  const selection = new CampaignSelectionPass(shell);
  const labelPass = new CampaignLabelPass(shell);
  const drawData = buildCampaignMapDrawData(data, { roadScale: 0.78 });
  lines.upload(drawData.lineVertices);
  roads.upload(drawData.roadMeshVertices);
  const host = ctx.canvas.parentElement ?? ctx.root;
  const ui = new CampaignUiLayer(host, (army, on) => {
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
      passes: [
        { id: 'campaign-ui-entities-opaque', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => entities.drawOpaque(pass) },
        { id: 'campaign-ui-entity-shadows', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => entities.drawShadows(pass) },
        { id: 'campaign-ui-roads', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => roads.draw(pass) },
        { id: 'campaign-ui-sea-lanes-depth', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => lines.draw(pass) },
        { id: 'campaign-ui-selection', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => selection.draw(pass) },
        { id: 'campaign-ui-labels', role: 'overlay-ui', phase: 'overlay', draw: (pass) => labelPass.draw(pass) },
      ],
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
      roadTriangles: roads.stats().triangles,
      labelLayer: labelLayer.layer,
      labelAtlas: `${labelLayer.atlasWidth}x${labelLayer.atlasHeight}`,
      labelVertices: labelLayer.vertices,
      depth: shell.stats().depth,
      framePhases: shell.stats().phases,
      postCutoverScreenshots: 'renderer-only',
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

async function routeCampaignModelShots(ctx: LabContext) {
  const gate = campaignModelShot(ctx.params.get('gate'));
  const camera = campaignModelShotCamera(gate);
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const entities = new CampaignEntityPass(shell);
  const scenery = new CampaignSceneryPass(shell);
  const roads = new CampaignRoadPass(shell);
  const selection = new CampaignSelectionPass(shell);
  const labelPass = new CampaignLabelPass(shell);
  const frame = campaignModelShotFrame(gate);
  const cityStandardSamples = campaignModelShotCityStandardSamples(gate, ctx.canvas, camera);
  const garrisonSamples = campaignModelShotGarrisonSamples(gate, ctx.canvas, camera);
  const selectionSamples = campaignModelShotSelectionSamples(gate, ctx.canvas, camera);
  const clouds = frame.cloudRect ? new CampaignCloudPass(shell, frame.cloudRect) : null;
  entities.upload(frame.entities);
  scenery.upload(frame.scenery);
  roads.upload(frame.roads);
  selection.upload(frame.selections);
  const labelLayer = labelPass.upload(frame.labels, camera);
  // Army stacks draw the shared skinned crowd (matching the production campaign
  // renderer), so this isolated 'army'/'garrison-*' review shows the real
  // representative figures + grounding shadow, not just the standard banner.
  const soldierKit = await loadPlaceholderKit();
  const soldierCrowd = new SkinnedCrowdPipeline(shell, createPlaceholderSoldierMeshes([0.30, 0.36, 0.74]), await loadPlaceholderVat(), soldierKit, { worldDepth: 'campaign' });
  const soldierShadows = new SoldierShadowDecalPass(shell, { worldDepth: 'campaign' });
  const modelStackRoster = [4, 0, 3, 0, 2, 1];
  const modelCrowd = frame.entities
    .filter((entity) => entity.kind === 'army')
    .flatMap((entity, i) => buildStackCrowd(modelStackRoster, {
      unitCount: 20,
      stackUnitCap: 20,
      x: entity.x,
      y: entity.y,
      faction: 0,
      seed: 100 + i,
      clip: 'idle',
      phase: 0,
      mountedClasses: mountedClassesFromKit(soldierKit),
      spacing: CAMPAIGN_FIGURE_SIZE * 1.1,
      terrainHeight: () => entity.z ?? 0,
    }));
  soldierCrowd.upload(modelCrowd, { size: CAMPAIGN_FIGURE_SIZE });
  soldierShadows.upload(modelCrowd, { radius: 0.62 * CAMPAIGN_FIGURE_SIZE });
  const hostileDepthOrder = gate === 'hostile-depth-order';
  const entityOpaquePass: FrameGraphPass = { id: 'model-shot-entities-opaque', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => entities.drawOpaque(pass) };
  const sceneryOpaquePass: FrameGraphPass = { id: 'model-shot-scenery-opaque', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => scenery.drawOpaque(pass) };
  const passes: FrameGraphPass[] = [
    ...(hostileDepthOrder ? [entityOpaquePass, sceneryOpaquePass] : [sceneryOpaquePass, entityOpaquePass]),
    { id: 'model-shot-soldier-crowd', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => soldierCrowd.draw(pass) },
    { id: 'model-shot-scenery-shadows', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => scenery.drawShadows(pass) },
    { id: 'model-shot-entity-shadows', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => entities.drawShadows(pass) },
    { id: 'model-shot-soldier-shadows', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => soldierShadows.draw(pass) },
    { id: 'model-shot-roads', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => roads.draw(pass) },
    { id: 'model-shot-selection', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => selection.draw(pass) },
    ...(clouds ? [{ id: 'model-shot-clouds', role: 'overlay-effect' as const, phase: 'overlay' as const, draw: (pass: OverlayRenderPass) => clouds.draw(pass) }] : []),
    { id: 'model-shot-labels', role: 'overlay-ui', phase: 'overlay', draw: (pass) => labelPass.draw(pass) },
  ];
  shell.drawFrame({
    clear: { r: 0.09, g: 0.10, b: 0.10, a: 1 },
    terrainRect: frame.terrainRect,
    passes,
  });
  ctx.status.innerHTML = reportTable({
    route: 'campaign-models',
    gate,
    purpose: 'isolated campaign model screenshot gate',
    entities: frame.entities.length,
    scenery: frame.scenery.length,
    roadTriangles: roads.stats().triangles,
    cloudQuads: clouds?.stats().cloudQuads ?? 0,
    labels: `${labelLayer.visibleLabels}/${labelLayer.labels}`,
    cityStandard: cityStandardSamples ? 'embedded-depth-sampled' : 'n/a',
    garrison: garrisonSamples ? 'army-inside-city-depth-sampled' : 'n/a',
    selectionDepth: selectionSamples ? 'ground-decal-occlusion-sampled' : 'n/a',
    hostileDrawOrder: hostileDepthOrder ? 'entities-before-late-scenery' : 'normal',
    renderer: 'raw WebGPU campaign model passes',
  });
  const samples = {
    ...(cityStandardSamples ? { cityStandard: cityStandardSamples } : {}),
    ...(garrisonSamples ? { garrison: garrisonSamples } : {}),
    ...(selectionSamples ? { selectionDepth: selectionSamples } : {}),
    ...(hostileDepthOrder ? { hostileDepthOrder: campaignModelShotHostileDepthSamples() } : {}),
  };
  publish('campaign-models', true, {
    route: 'campaign-models',
    gate,
    camera,
    entities: frame.entities.length,
    scenery: frame.scenery.length,
    sceneryStats: scenery.stats(),
    roadTriangles: roads.stats().triangles,
    cloudQuads: clouds?.stats().cloudQuads ?? 0,
    selections: frame.selections.length,
    labels: labelLayer.labels,
    visibleLabels: labelLayer.visibleLabels,
    labelLayer: labelLayer.layer,
    entityLayer: entities.stats().layer,
    depth: shell.stats().depth,
    framePhases: shell.stats().phases,
    hostileDrawOrder: hostileDepthOrder ? 'entities-before-late-scenery' : 'normal',
    samples,
    postCutoverScreenshots: 'renderer-only',
  });
}

// Reusable scenery props posed for model-sheet review: each family alone on
// neutral ground, no cities, labels, roads, water, or fog. The compositions are
// owned by the shared prop registry so battle and campaign review the same poses.
async function routeSharedPropModelShots(ctx: LabContext) {
  const requested = ctx.params.get('gate');
  const group = PROP_REVIEW_GROUPS.find((g) => g.id === requested) ?? PROP_REVIEW_GROUPS[0];
  const camera = group.camera;
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const scenery = new CampaignSceneryPass(shell);
  const instances: CampaignSceneryInstance[] = group.props.map((prop) => ({
    x: prop.x,
    y: prop.y,
    size: prop.size,
    kind: prop.kind,
    shade: prop.shade,
    yaw: prop.yaw,
  }));
  scenery.upload(instances);
  shell.drawFrame({
    clear: { r: 0.09, g: 0.10, b: 0.10, a: 1 },
    terrainRect: [-18, -12, 36, 24],
    passes: [
      { id: 'shared-prop-opaque', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => scenery.drawOpaque(pass) },
      { id: 'shared-prop-shadows', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => scenery.drawShadows(pass) },
    ],
  });
  ctx.status.innerHTML = reportTable({
    route: 'shared-prop-models',
    gate: group.id,
    purpose: 'isolated shared scenery prop model sheet',
    props: instances.length,
    renderer: 'raw WebGPU shared scenery library meshes',
  });
  publish('shared-prop-models', true, {
    route: 'shared-prop-models',
    gate: group.id,
    camera,
    props: instances.length,
    sceneryStats: scenery.stats(),
    depth: shell.stats().depth,
    framePhases: shell.stats().phases,
    postCutoverScreenshots: 'renderer-only',
  });
}

// Shared grass primitive review: the reusable tuft mesh posed either as one
// readable clump or a tiny patch, without sim terrain or battle units competing
// for the silhouette.
async function routeSharedGrassModelShots(ctx: LabContext) {
  const gate = ctx.params.get('gate') === 'patch' ? 'patch' : 'tuft';
  const environment = resolveBattleEnvironment(ctx.params.get('environment'));
  const config = grassModelShotConfig(gate);
  const shell = await createConfiguredShell(ctx.canvas, config.camera, environment);
  const grass = new BattleGrassPass(shell, environment);
  const field = flatFieldFor(config.bounds);
  grass.setField(field, config.bounds, 'green-grass', config.params);
  grass.setWindPhase(numberParam(ctx.params, 'phase', config.params.windPhase ?? 0));
  shell.drawFrame({
    clear: { r: 0.09, g: 0.10, b: 0.10, a: 1 },
    terrainRect: [config.bounds.x - 1.4, config.bounds.y - 1.0, config.bounds.width + 2.8, config.bounds.height + 2.8],
    passes: [
      { id: 'shared-grass-model', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => grass.draw(pass) },
    ],
  });
  const grassStats = grass.stats();
  ctx.status.innerHTML = reportTable({
    route: 'shared-grass-models',
    gate,
    purpose: 'isolated reusable grass primitive model sheet',
    environment: environment.id,
    tufts: grassStats.tuftInstances,
    blades: grassStats.bladeInstances,
    windPhase: grassStats.windPhase.toFixed(2),
  });
  publish('shared-grass-models', true, {
    route: 'shared-grass-models',
    gate,
    camera: config.camera,
    ...grassStats,
    depth: shell.stats().depth,
    framePhases: shell.stats().phases,
    postCutoverScreenshots: 'renderer-only',
  });
}

type CampaignModelShot =
  | 'overview'
  | 'city'
  | 'garrison-outside'
  | 'garrison-city'
  | 'garrison-hidden'
  | 'hostile-depth-order'
  | 'town'
  | 'army'
  | 'road'
  | 'road-only'
  | 'selected-city'
  | 'labels'
  | 'terrain-grass-scrub'
  | 'terrain-stone-relief'
  | 'cloud-fog';

const CAMPAIGN_MODEL_SHOTS: CampaignModelShot[] = [
  'city',
  'garrison-outside',
  'garrison-city',
  'garrison-hidden',
  'hostile-depth-order',
  'town',
  'army',
  'road',
  'road-only',
  'selected-city',
  'labels',
  'terrain-grass-scrub',
  'terrain-stone-relief',
  'cloud-fog',
];

const MODEL_SHOT_CITY_POSITION: [number, number] = [0.0, -1.8];
const MODEL_SHOT_CITY_RADIUS = 6.6;
const MODEL_SHOT_GARRISON_ARMY_POSITION: [number, number] = [0.65, -1.65];
const MODEL_SHOT_OUTSIDE_GARRISON_ARMY_POSITION: [number, number] = [-7.10, -1.85];
const MODEL_SHOT_HIDDEN_GARRISON_ARMY_POSITION: [number, number] = [0.0, 3.0];
const MODEL_SHOT_GARRISON_ARMY_RADIUS = 7.0;
const MODEL_SHOT_HIDDEN_GARRISON_Z = -4.4;

function campaignModelShot(value: string | null): CampaignModelShot {
  return CAMPAIGN_MODEL_SHOTS.includes(value as CampaignModelShot) ? value as CampaignModelShot : 'city';
}

function campaignModelShotCamera(gate: CampaignModelShot) {
  const close = { x: 0, y: 0.3, zoom: 28, pitch: 0.56, yaw: 0, perspective: 0.018 };
  if (gate === 'overview') return { x: 0, y: -0.6, zoom: 28, pitch: 0.54, yaw: 0, perspective: 0.012 };
  if (gate === 'road' || gate === 'road-only') return { x: 0, y: -1.3, zoom: 30, pitch: 0.54, yaw: 0, perspective: 0.012 };
  if (gate === 'terrain-grass-scrub') return { x: 0, y: -0.3, zoom: 40, pitch: 0.56, yaw: 0, perspective: 0.016 };
  if (gate === 'terrain-stone-relief') return { x: 0, y: -0.4, zoom: 40, pitch: 0.56, yaw: 0, perspective: 0.014 };
  if (gate === 'cloud-fog') return { x: 0, y: 0, zoom: 26, pitch: 0.50, yaw: 0, perspective: 0.010 };
  return close;
}

function campaignModelShotFrame(gate: CampaignModelShot) {
  const red: [number, number, number] = [0.70, 0.18, 0.16];
  const amber: [number, number, number] = [0.58, 0.52, 0.42];
  const green: [number, number, number] = [0.31, 0.82, 0.39];
  const neutral: [number, number, number] = [0.93, 0.78, 0.30];
  const entities: CampaignEntityInstance[] = [];
  const scenery: CampaignSceneryInstance[] = [];
  const selections: CampaignSelectionInstance[] = [];
  const labels: CampaignLabel[] = [];
  let roads: Float32Array<ArrayBufferLike> = new Float32Array();
  let terrainRect: [number, number, number, number] = [-18, -12, 36, 24];
  let cloudRect: { min: [number, number]; max: [number, number] } | null = null;
  const addCity = (x: number, y: number, radius: number, text: string, faction = red, allegiance = green, selected = false) => {
    entities.push({ x, y, radius, faction, allegiance, kind: 'city', strength: 1 });
    labels.push({ text, x, y: y - 4.7, kind: 'city', size: 14, priority: 5, icon: 'city', iconColor: allegiance });
    if (selected) selections.push({ x, y, z: 0, radius: radius * 1.34, color: green, kind: 'city' });
  };
  const addArmy = (x: number, y: number, selected = false) => {
    entities.push({ x, y, radius: 5.5, faction: red, allegiance: green, kind: 'army', strength: 0.86 });
    labels.push({ text: '1ST LEGION', x, y, kind: 'army', size: 13, priority: 5, icon: 'army', iconColor: green, screenOffsetY: 54 });
    if (selected) selections.push({ x, y, z: 0, radius: 6.1, color: green, kind: 'army' });
  };

  if (gate === 'overview') addCity(-6.0, -2.0, 7.0, 'ROMA', red, green, false);
  if (gate === 'city') addCity(MODEL_SHOT_CITY_POSITION[0], MODEL_SHOT_CITY_POSITION[1], MODEL_SHOT_CITY_RADIUS, 'ROMA', red, green, true);
  if (gate === 'hostile-depth-order') {
    addCity(MODEL_SHOT_CITY_POSITION[0], MODEL_SHOT_CITY_POSITION[1], MODEL_SHOT_CITY_RADIUS, 'ROMA', red, green, true);
    scenery.push({ x: -1.34, y: -1.08, size: 14.0, kind: 'broadleaf', shade: 0.72 });
  }
  if (gate === 'garrison-outside') {
    addCity(MODEL_SHOT_CITY_POSITION[0], MODEL_SHOT_CITY_POSITION[1], MODEL_SHOT_CITY_RADIUS, 'ROMA', red, green, true);
    entities.push({
      x: MODEL_SHOT_OUTSIDE_GARRISON_ARMY_POSITION[0],
      y: MODEL_SHOT_OUTSIDE_GARRISON_ARMY_POSITION[1],
      radius: MODEL_SHOT_GARRISON_ARMY_RADIUS,
      faction: [0.16, 0.34, 0.78],
      allegiance: green,
      kind: 'army',
      strength: 0.62,
    });
  }
  if (gate === 'garrison-city') {
    addCity(MODEL_SHOT_CITY_POSITION[0], MODEL_SHOT_CITY_POSITION[1], MODEL_SHOT_CITY_RADIUS, 'ROMA', red, green, true);
    entities.push({
      x: MODEL_SHOT_GARRISON_ARMY_POSITION[0],
      y: MODEL_SHOT_GARRISON_ARMY_POSITION[1],
      radius: MODEL_SHOT_GARRISON_ARMY_RADIUS,
      faction: [0.16, 0.34, 0.78],
      allegiance: green,
      kind: 'army',
      strength: 0.62,
    });
  }
  if (gate === 'garrison-hidden') {
    addCity(MODEL_SHOT_CITY_POSITION[0], MODEL_SHOT_CITY_POSITION[1], MODEL_SHOT_CITY_RADIUS, 'ROMA', red, green, true);
    entities.push({
      x: MODEL_SHOT_HIDDEN_GARRISON_ARMY_POSITION[0],
      y: MODEL_SHOT_HIDDEN_GARRISON_ARMY_POSITION[1],
      z: MODEL_SHOT_HIDDEN_GARRISON_Z,
      radius: MODEL_SHOT_GARRISON_ARMY_RADIUS,
      faction: [0.16, 0.34, 0.78],
      allegiance: green,
      kind: 'army',
      strength: 0.62,
    });
  }
  if (gate === 'selected-city') addCity(MODEL_SHOT_CITY_POSITION[0], MODEL_SHOT_CITY_POSITION[1], MODEL_SHOT_CITY_RADIUS, 'ROMA', red, green, true);
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
  if (gate === 'overview' || gate === 'terrain-grass-scrub') {
    scenery.push(
      { x: -3.8, y: 2.2, size: 3.7, kind: 'conifer' },
      { x: -1.5, y: 2.0, size: 3.2, kind: 'broadleaf' },
      { x: 1.2, y: 2.3, size: 4.0, kind: 'broadleaf' },
      { x: 3.6, y: 1.8, size: 3.0, kind: 'conifer' },
    );
    if (gate === 'terrain-grass-scrub') {
      scenery.push(
        { x: -5.2, y: 1.6, size: 2.7, kind: 'conifer', shade: 0.5 },
        { x: 5.0, y: 1.3, size: 2.4, kind: 'broadleaf', shade: 0.55 },
      );
    }
  }
  if (gate === 'overview' || gate === 'terrain-stone-relief') {
    scenery.push(
      { x: -2.4, y: 4.2, size: 6.6, kind: 'mountain' },
      { x: 2.7, y: 3.8, size: 5.4, kind: 'mountain' },
      { x: -3.2, y: -6.2, size: 4.0, kind: 'rock' },
      { x: 0.2, y: -6.4, size: 4.8, kind: 'rock' },
      { x: 3.3, y: -5.8, size: 3.5, kind: 'rock' },
    );
  }
  if (gate === 'terrain-stone-relief') {
    scenery.push(
      { x: -5.4, y: 1.1, size: 2.9, kind: 'rock', shade: 0.62 },
      { x: 5.3, y: 0.7, size: 2.6, kind: 'rock', shade: 0.58 },
    );
  }
  if (gate === 'cloud-fog') {
    terrainRect = [-22, -14, 44, 28];
    cloudRect = { min: [-22, -14], max: [22, 14] };
  }
  if (gate === 'labels') {
    addCity(-3.8, -2.0, 4.6, 'ROMA');
    addArmy(2.0, -2.2);
    labels.push({ text: 'LATIUM', x: -1.5, y: 4.0, kind: 'faction', size: 18, priority: 4, angle: -0.06 });
    labels.push({ text: 'Tyrrhenian Sea', x: 0.0, y: -7.0, kind: 'sea', size: 17, priority: 3, angle: -0.12 });
  }
  return { entities, scenery, selections, labels, roads, terrainRect, cloudRect };
}

function campaignModelShotHostileDepthSamples() {
  return {
    flagOverLateTree: { x: 302, y: 148, note: 'visible city flag in front of late scenery' },
    lateTreeControl: { x: 176, y: 209, note: 'late scenery bucket visible away from the flag' },
  };
}

function campaignModelShotCityStandardSamples(
  gate: CampaignModelShot,
  canvas: HTMLCanvasElement,
  camera: { x: number; y: number; zoom: number; pitch?: number; yaw?: number; perspective?: number },
) {
  if (gate !== 'city' && gate !== 'selected-city') return null;
  const scale = MODEL_SHOT_CITY_RADIUS / 5.0;
  const base = MODEL_SHOT_CITY_POSITION;
  const worldPoint = (local: [number, number, number]) => projectNestedPoint(canvas, camera, [
    base[0] + local[0] * scale,
    base[1] + local[1] * scale,
    local[2] * scale,
  ]);
  return {
    hiddenLowerCloth: worldPoint([-0.22, 0.08, 1.45]),
    visibleUpperCloth: worldPoint([0.76, 0.04, 5.64]),
    plantedMastCore: worldPoint([0.08, 0.04, 2.35]),
    rightFlyingCloth: worldPoint([0.95, 0.04, 5.92]),
    leftOfMastControl: worldPoint([-0.65, 0.04, 5.92]),
    mastAboveCloth: worldPoint([0.08, 0.04, 6.76]),
  };
}

function campaignModelShotGarrisonSamples(
  gate: CampaignModelShot,
  canvas: HTMLCanvasElement,
  camera: { x: number; y: number; zoom: number; pitch?: number; yaw?: number; perspective?: number },
) {
  if (gate !== 'garrison-outside' && gate !== 'garrison-city' && gate !== 'garrison-hidden') return null;
  const cityScale = MODEL_SHOT_CITY_RADIUS / 5.0;
  const armyScale = MODEL_SHOT_GARRISON_ARMY_RADIUS / 4.4;
  const armyBase =
    gate === 'garrison-outside'
      ? MODEL_SHOT_OUTSIDE_GARRISON_ARMY_POSITION
      : gate === 'garrison-hidden'
        ? MODEL_SHOT_HIDDEN_GARRISON_ARMY_POSITION
      : MODEL_SHOT_GARRISON_ARMY_POSITION;
  const armyZ = gate === 'garrison-hidden' ? MODEL_SHOT_HIDDEN_GARRISON_Z : 0;
  const cityPoint = (local: [number, number, number]) => projectNestedPoint(canvas, camera, [
    MODEL_SHOT_CITY_POSITION[0] + local[0] * cityScale,
    MODEL_SHOT_CITY_POSITION[1] + local[1] * cityScale,
    local[2] * cityScale,
  ]);
  const armyPoint = (local: [number, number, number]) => projectNestedPoint(canvas, camera, [
    armyBase[0] + local[0] * armyScale,
    armyBase[1] + local[1] * armyScale,
    armyZ + local[2] * armyScale,
  ]);
  if (gate === 'garrison-outside') {
    return {
      state: 'outside-city',
      visibleShieldOutsideCity: armyPoint([-1.40, -0.72, 0.90]),
      visibleStandardOutsideCity: armyPoint([1.30, 0.12, 4.02]),
      cityControl: cityPoint([-0.62, 0.08, 1.50]),
    };
  }
  if (gate === 'garrison-hidden') {
    return {
      state: 'hidden-inside-city',
      hiddenBodyInsideCity: armyPoint([-0.46, -0.42, 0.98]),
      hiddenStandardInsideCity: armyPoint([1.30, 0.12, 4.02]),
      occludingCityRoof: cityPoint([0.34, 0.04, 4.94]),
    };
  }
  return {
    state: 'partial-inside-city',
    hiddenShieldInsideWall: armyPoint([-0.46, -0.42, 0.98]),
    visibleStandardAboveRoofs: armyPoint([1.30, 0.12, 4.02]),
    occludingCityWall: cityPoint([-0.62, 0.08, 1.50]),
  };
}

function campaignModelShotSelectionSamples(
  gate: CampaignModelShot,
  canvas: HTMLCanvasElement,
  camera: { x: number; y: number; zoom: number; pitch?: number; yaw?: number; perspective?: number },
) {
  void canvas;
  void camera;
  if (gate === 'selected-city') {
    return {
      occludedByCityCore: { x: 295, y: 290, note: 'fixed selected-city crop sample where city geometry must paint over the ground selection decal' },
      visibleOuterRing: { x: 460, y: 236, note: 'fixed selected-city crop sample on exposed outer selection arc' },
    };
  }
  if (gate === 'army') {
    return {
      occludedByArmyCore: { x: 294, y: 331, note: 'fixed army crop sample where soldiers/shields must paint over the ground selection decal' },
      visibleOuterRing: { x: 467, y: 343, note: 'fixed army crop sample on exposed outer selection arc' },
    };
  }
  return null;
}

function roadGateVertices(points: [number, number][]) {
  return buildCampaignMapDrawData({
    map: {
      nodes: [],
      edges: [{ kind: 'road', via: points }],
      factions: [],
    },
  }, { roadScale: 0.34 }).roadMeshVertices;
}

function campaignBgTerrainRect(rect: { min: [number, number]; max: [number, number] }): [number, number, number, number] {
  return [rect.min[0], rect.min[1], rect.max[0] - rect.min[0], rect.max[1] - rect.min[1]];
}

async function routeRenderGraph(ctx: LabContext) {
  const report = fullGameRenderGraphReport();
  const camera = { x: 0, y: -0.6, zoom: 38, pitch: 0.66, yaw: -0.04, perspective: 0.008 };
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const nested = new Nested3dFixturePass(shell);
  const markers = [
    ...generatedMarkers(16, -9, -5, 0),
    ...generatedMarkers(16, 9, 4, 1),
  ];
  shell.drawFrame({
    markers,
    markerLayer: 'lab-placeholder',
    terrainRect: [-14, -7, 28, 15],
    passes: [{ id: 'render-graph-nested-3d', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => nested.draw(pass) }],
  });
  const shellStats = shell.stats();
  const nestedStats = nested.stats();
  const phaseCounts = report.passes.reduce<Record<string, number>>((counts, pass) => {
    counts[pass.phase] = (counts[pass.phase] ?? 0) + 1;
    return counts;
  }, {});
  const graphFramePhases = uniqueGraphFramePhases(report);
  const graphPassRoles = report.passes
    .filter((pass) => pass.framePhase)
    .map((pass) => ({ id: pass.id, framePhase: pass.framePhase, role: pass.role }));
  const depthPasses = report.passes.filter((pass) => pass.depth).map((pass) => pass.id);
  const depthPassModes = report.passes
    .filter((pass) => pass.depth)
    .map((pass) => ({ id: pass.id, mode: pass.depth!.mode, attachment: pass.depth!.attachment }));
  const depthContractFixtures = renderGraphDepthContractFixtures();
  const bucketContractFixtures = renderGraphBucketContractFixtures();
  const backgroundDepthPasses = report.passes
    .filter((pass) => pass.framePhase === 'background' && pass.depth)
    .map((pass) => pass.id);
  const overlayDepthPasses = report.passes
    .filter((pass) => pass.framePhase === 'overlay' && pass.depth)
    .map((pass) => pass.id);
  ctx.status.innerHTML = reportTable({
    route: 'render-graph',
    status: report.ok ? 'graph contract valid' : 'graph diagnostics',
    passes: report.passes.length,
    resources: report.resources.length,
    phases: Object.entries(phaseCounts).map(([k, v]) => `${k}:${v}`).join(', '),
    graphFramePhases: graphFramePhases.join(' -> '),
    graphRoles: graphPassRoles.map((pass) => `${pass.id}:${pass.role}`).join(', '),
    actualFramePhases: shellStats.phases.map((phase) => phase.kind).join(' -> '),
    depthPasses: depthPassModes.map((pass) => `${pass.id}:${pass.mode}`).join(', '),
    depthContractFixtures: `${depthContractFixtures.filter((fixture) => fixture.rejected).length}/${depthContractFixtures.length} rejected`,
    bucketContractFixtures: `${bucketContractFixtures.filter((fixture) => fixture.rejected).length}/${bucketContractFixtures.length} rejected`,
    diagnostics: report.diagnostics.length,
    depth: shellStats.depth.allocated ? `${shellStats.depth.format} ${shellStats.depth.width}x${shellStats.depth.height}` : 'not allocated',
    nestedFixtures: nestedStats.fixtures.join(', '),
  }) + graphList(report);
  publish('render-graph', report.ok, {
    passes: report.passes.length,
    resources: report.resources.length,
    firstPass: report.passes[0]?.id,
    lastPass: report.passes.at(-1)?.id,
    diagnostics: report.diagnostics,
    graphFramePhases,
    graphPassRoles,
    depthPasses,
    depthPassModes,
    depthContractFixtures,
    bucketContractFixtures,
    backgroundDepthPasses,
    overlayDepthPasses,
    depth: shellStats.depth,
    framePhases: shellStats.phases,
    nested3d: nestedStats,
    samples: {
      occludedLowerStandard: projectNestedPoint(ctx.canvas, camera, [-2.62, 0.10, 1.35]),
      visibleUpperFlag: projectNestedPoint(ctx.canvas, camera, [-1.20, 0.10, 3.70]),
      frontRankOverlap: projectNestedPoint(ctx.canvas, camera, [4.30, -1.20, 1.08]),
    },
  });
}

function renderGraphBucketContractFixtures() {
  const base: RenderGraphPass[] = [
    { id: 'camera', label: 'Camera', phase: 'frame', writes: ['cameraUniforms'] },
    {
      id: 'worldDepthClear',
      label: 'Depth clear',
      phase: 'frame',
      framePhase: 'world-depth',
      role: 'world-depth-fill',
      writes: [GPU_WORLD_DEPTH_ATTACHMENT],
      depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'write', format: GPU_DEPTH_FORMAT },
    },
  ];
  const fixtures: Array<{ id: string; pass?: unknown; passes?: unknown[]; expected: string }> = [
    {
      id: 'topLevelTypeBucketPass',
      expected: 'is a type bucket, not a semantic render-graph pass',
      pass: {
        id: 'treeBucket',
        label: 'Tree bucket',
        phase: 'campaign',
        framePhase: 'world-depth',
        role: 'world-opaque',
        batching: { strategy: 'instance-kind', buckets: ['conifer'] },
        reads: ['cameraUniforms', GPU_WORLD_DEPTH_ATTACHMENT],
        writes: ['worldColor', GPU_WORLD_DEPTH_ATTACHMENT],
        depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read-write', format: GPU_DEPTH_FORMAT },
      },
    },
    {
      id: 'semanticPassWithTypeBatching',
      expected: '',
      pass: {
        id: 'campaignScenery',
        label: 'Campaign scenery semantic pass',
        phase: 'campaign',
        framePhase: 'world-depth',
        role: 'world-opaque',
        batching: { strategy: 'instance-kind', buckets: ['trees', 'rocks'] },
        reads: ['cameraUniforms', GPU_WORLD_DEPTH_ATTACHMENT],
        writes: ['worldColor', GPU_WORLD_DEPTH_ATTACHMENT],
        depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read-write', format: GPU_DEPTH_FORMAT },
      },
    },
  ];
  return fixtures.map((fixture) => {
    const report = compileRenderGraph([...base, fixture.pass as RenderGraphPass]);
    return {
      id: fixture.id,
      expected: fixture.expected || 'accepted semantic batching metadata',
      rejected: fixture.expected
        ? !report.ok && report.diagnostics.some((diagnostic) => diagnostic.includes(fixture.expected))
        : false,
      accepted: fixture.expected ? false : report.ok,
      diagnostics: report.diagnostics,
    };
  });
}

function renderGraphDepthContractFixtures() {
  const base: RenderGraphPass[] = [
    { id: 'camera', label: 'Camera', phase: 'frame', writes: ['cameraUniforms'] },
    {
      id: 'clear',
      label: 'Depth clear',
      phase: 'frame',
      framePhase: 'world-depth',
      role: 'world-depth-fill',
      writes: [GPU_WORLD_DEPTH_ATTACHMENT],
      depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'write', format: GPU_DEPTH_FORMAT },
    },
  ];
  const fixtures: Array<{ id: string; pass?: unknown; passes?: unknown[]; expected: string }> = [
    {
      id: 'readModeWritesDepth',
      expected: 'read-only depth',
      pass: {
        id: 'badRead',
        label: 'Bad read mode writes depth',
        phase: 'campaign',
        framePhase: 'world-depth',
        role: 'world-decal',
        reads: ['cameraUniforms', GPU_WORLD_DEPTH_ATTACHMENT],
        writes: ['worldColor', GPU_WORLD_DEPTH_ATTACHMENT],
        depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read', format: GPU_DEPTH_FORMAT },
      },
    },
    {
      id: 'writeModeReadsDepth',
      expected: 'write-only depth',
      pass: {
        id: 'badWrite',
        label: 'Bad write mode reads depth',
        phase: 'battle',
        framePhase: 'world-depth',
        role: 'world-depth-fill',
        reads: ['cameraUniforms', GPU_WORLD_DEPTH_ATTACHMENT],
        writes: [GPU_WORLD_DEPTH_ATTACHMENT],
        depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'write', format: GPU_DEPTH_FORMAT },
      },
    },
    {
      id: 'unsupportedDepthAttachment',
      expected: 'unsupported depth attachment',
      pass: {
        id: 'badAttachment',
        label: 'Bad depth attachment',
        phase: 'campaign',
        framePhase: 'world-depth',
        role: 'world-opaque',
        reads: ['cameraUniforms', 'privateDepth'],
        writes: ['worldColor', 'privateDepth'],
        depth: { attachment: 'privateDepth', mode: 'read-write', format: GPU_DEPTH_FORMAT },
      },
    },
    {
      id: 'unsupportedDepthMode',
      expected: 'unsupported depth mode',
      pass: {
        id: 'badMode',
        label: 'Bad depth mode',
        phase: 'campaign',
        framePhase: 'world-depth',
        role: 'world-decal',
        reads: ['cameraUniforms', GPU_WORLD_DEPTH_ATTACHMENT],
        writes: ['worldColor'],
        depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'sample', format: GPU_DEPTH_FORMAT },
      },
    },
    {
      id: 'missingSemanticRole',
      expected: 'must declare a semantic role',
      pass: {
        id: 'badMissingRole',
        label: 'Bad missing role',
        phase: 'campaign',
        framePhase: 'world-depth',
        reads: ['cameraUniforms', GPU_WORLD_DEPTH_ATTACHMENT],
        writes: ['worldColor', GPU_WORLD_DEPTH_ATTACHMENT],
        depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read-write', format: GPU_DEPTH_FORMAT },
      },
    },
    {
      id: 'mismatchedSemanticRole',
      expected: 'is incompatible with frame phase',
      pass: {
        id: 'badRolePhase',
        label: 'Bad role phase',
        phase: 'ui',
        framePhase: 'overlay',
        role: 'world-opaque',
        reads: ['cameraUniforms'],
        writes: ['compositedColor'],
      },
    },
    {
      id: 'readOnlyBeforeWrite',
      expected: 'writes depth after read-only world decals have started',
      passes: [
        {
          id: 'earlyWorldDecal',
          label: 'Early world decal',
          phase: 'campaign',
          framePhase: 'world-depth',
          role: 'world-decal',
          reads: ['cameraUniforms', GPU_WORLD_DEPTH_ATTACHMENT],
          writes: ['worldColor'],
          depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read', format: GPU_DEPTH_FORMAT },
        },
        {
          id: 'lateWorldOpaque',
          label: 'Late world opaque',
          phase: 'campaign',
          framePhase: 'world-depth',
          role: 'world-opaque',
          reads: ['cameraUniforms', GPU_WORLD_DEPTH_ATTACHMENT],
          writes: ['worldColor', GPU_WORLD_DEPTH_ATTACHMENT],
          depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read-write', format: GPU_DEPTH_FORMAT },
        },
      ],
    },
  ];
  return fixtures.map((fixture) => {
    const report = compileRenderGraph([...base, ...((fixture.passes ?? [fixture.pass]) as RenderGraphPass[])]);
    return {
      id: fixture.id,
      expected: fixture.expected,
      rejected: !report.ok && report.diagnostics.some((diagnostic) => diagnostic.includes(fixture.expected)),
      diagnostics: report.diagnostics,
    };
  });
}

function uniqueGraphFramePhases(report: ReturnType<typeof fullGameRenderGraphReport>) {
  const phases: string[] = [];
  for (const pass of report.passes) {
    if (pass.framePhase && phases.at(-1) !== pass.framePhase) phases.push(pass.framePhase);
  }
  return phases;
}

async function routeWorldCamera(ctx: LabContext) {
  const mode = ctx.params.get('mode') === 'battle' ? 'battle' : 'campaign';
  const camera = mode === 'battle'
    ? { x: 0, y: -0.6, zoom: 42, pitch: 0.34, yaw: -0.10, perspective: 0 }
    : { x: 0, y: -0.6, zoom: 38, pitch: 0.66, yaw: -0.04, perspective: 0.008 };
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const nested = new Nested3dFixturePass(shell);
  shell.drawFrame({
    terrainRect: [-14, -7, 28, 15],
    passes: [{ id: 'world-camera-nested-3d', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => nested.draw(pass) }],
  });
  const shellStats = shell.stats();
  const anchorAgreement = worldCameraAnchorAgreement(ctx.canvas, camera, [
    ['city-ground', [-2.62, 0.10, 0.0]],
    ['garrison-ground', [-3.10, -0.72, 0.0]],
    ['rank-ground', [4.30, -1.20, 0.0]],
    ['ring-ground', [-2.20, -0.55, 0.0]],
  ]);
  const nestedStats = nested.stats();
  ctx.status.innerHTML = reportTable({
    route: 'world-camera',
    status: 'shared camera/depth contract',
    mode,
    camera: `pitch ${camera.pitch.toFixed(2)}, yaw ${camera.yaw.toFixed(2)}, perspective ${camera.perspective}`,
    depth: shellStats.depth.allocated ? `${shellStats.depth.format} ${shellStats.depth.width}x${shellStats.depth.height}` : 'not allocated',
    cameraWgsl: 'packages/renderer-core/src/cameraWgsl.ts',
    maxAnchorDeltaPx: anchorAgreement.maxDelta.toFixed(4),
    nestedFixtures: nestedStats.fixtures.join(', '),
  }) + `<p class="renderer-note"><a href="/renderer/world-camera?mode=campaign">campaign camera</a> · <a href="/renderer/world-camera?mode=battle">battle camera</a></p>`;
  publish('world-camera', true, {
    mode,
    camera,
    depth: shellStats.depth,
    framePhases: shellStats.phases,
    nested3d: nestedStats,
    cameraContract: 'shared-world-camera-wgsl',
    anchorAgreement,
    samples: {
      occludedLowerStandard: projectNestedPoint(ctx.canvas, camera, [-2.62, 0.10, 1.35]),
      visibleUpperFlag: projectNestedPoint(ctx.canvas, camera, [-1.20, 0.10, 3.70]),
      frontRankOverlap: projectNestedPoint(ctx.canvas, camera, [4.30, -1.20, 1.08]),
    },
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
    markerLayer: 'lab-placeholder',
    passes: [
      { id: 'battle-terrain-fixture-underpaint', role: 'background-underpaint', phase: 'background', draw: (pass) => terrain.draw(pass) },
      { id: 'battle-terrain-fixture-props', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => terrain.drawProps(pass) },
    ],
  });
  const stats = terrain.stats();
  ctx.status.innerHTML = reportTable({
    route: 'battle-terrain',
    fixture,
    terrain: 'warm grass, beach shelf, water, haze clear, scenery; selection is owned by battle ground cues',
    quads: stats.quads,
    underpaintQuads: stats.backgroundQuads,
    worldPropQuads: stats.worldPropQuads,
    water: stats.waterQuads,
    scenery: stats.sceneryQuads,
    fixtureSelectionQuads: stats.selectionQuads,
  });
  publish('battle-terrain', true, stats);
}

// Boots each quick-battle map's real sim terrain and turns it into the typed
// presentation (height field + extracted features + catalog edge/cover roles),
// rendering the tint field and publishing the data the battle-terrain-features
// scene asserts. The canonical terrain stays in the sim; this route only views it.
async function routeBattleTerrainFeatures(ctx: LabContext) {
  const { default: initWasm, Game } = await import('../../../web/src/wasm/game_wasm.js');
  const wasm = await initWasm();
  const game = new Game(0x5eed_c0de);
  const entry = battleMapById(ctx.params.get('gate') ?? '') ?? BATTLE_MAP_CATALOG[0];
  game.load_map(entry.wasmMapId);

  const w = game.terrain_w();
  const h = game.terrain_h();
  const cell = game.terrain_cell();
  const ox = game.terrain_origin_x();
  const oy = game.terrain_origin_y();
  // Copy out of wasm memory: the pointers go stale on any reallocation.
  const tint = new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), w * h).slice();
  const speed = new Float32Array(wasm.memory.buffer, game.terrain_speed_ptr(), w * h).slice();
  const height = new Float32Array(wasm.memory.buffer, game.terrain_height_ptr(), w * h).slice();
  const grid: BattleTerrainGrid = { w, h, cell, ox, oy, tint, speed, height };

  const presentation = buildBattleTerrainPresentation(entry, grid, 0x1234);
  const mismatches = presentationEdgeMismatches(entry, grid);
  const featureCounts: Partial<Record<BattleTerrainFeatureKind, number>> = {};
  let inBounds = true;
  for (const f of presentation.features) {
    featureCounts[f.kind] = (featureCounts[f.kind] ?? 0) + 1;
    if (f.x < ox || f.x > ox + w * cell || f.y < oy || f.y > oy + h * cell) inBounds = false;
  }
  // Height smoothness down the open central corridor: the largest jump between
  // 4 m samples must stay small enough that soldiers ride it without stair-steps.
  let heightMaxStep = 0;
  let prev: number | null = null;
  for (let y = oy + 20; y < oy + h * cell - 20; y += 4) {
    const z = terrainHeightAt(presentation.height, 0, y);
    if (prev !== null) heightMaxStep = Math.max(heightMaxStep, Math.abs(z - prev));
    prev = z;
  }

  // Near-top-down and zoomed to fill the frame so the long E–W axis spans the
  // width: the sealed west/east bands read at the left/right edges and the open
  // north/south edges run grass to the top/bottom, instead of a thin seal lost
  // in haze margins.
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: 0, zoom: 0.52, pitch: 0.05, yaw: 0 });
  const terrain = new BattleTerrainPass(shell);
  terrain.setTintGrid({ w, h, cell, ox, oy, tint });
  shell.drawFrame({
    clear: { r: 0.74, g: 0.83, b: 0.90, a: 1 },
    terrainRect: [ox, oy, w * cell, h * cell],
    passes: [
      { id: 'battle-terrain-features-underpaint', role: 'background-underpaint', phase: 'background', draw: (pass) => terrain.draw(pass) },
      { id: 'battle-terrain-features-props', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => terrain.drawProps(pass) },
    ],
  });

  ctx.status.innerHTML = reportTable({
    route: 'battle-terrain-features',
    gate: entry.id,
    map: entry.label,
    edges: `W:${entry.edges.west} E:${entry.edges.east} N:${entry.edges.north} S:${entry.edges.south}`,
    groundCover: entry.groundCover,
    features: presentation.features.length,
    featureKinds: Object.entries(featureCounts).map(([k, v]) => `${k}:${v}`).join(' '),
    edgeMismatches: mismatches.length === 0 ? 'none' : mismatches.join(','),
    heightSpan: heightSpan(presentation.height).toFixed(2),
    heightMaxStep: heightMaxStep.toFixed(3),
  });
  publish('battle-terrain-features', mismatches.length === 0 && inBounds, {
    route: 'battle-terrain-features',
    gate: entry.id,
    mapId: presentation.mapId,
    wasmMapId: entry.wasmMapId,
    edges: presentation.edges,
    groundCover: presentation.groundCover,
    intentionallyFlat: entry.intentionallyFlat ?? false,
    featureTotal: presentation.features.length,
    featureCounts,
    inBounds,
    edgeMismatches: mismatches,
    heightSpan: heightSpan(presentation.height),
    heightMaxStep,
    terrainCell: cell,
    grid: { w, h, cell, ox, oy },
    sceneryStats: terrain.stats(),
    depth: shell.stats().depth,
    framePhases: shell.stats().phases,
  });
}

type Terrain3dEntry = Pick<BattleMapCatalogEntry, 'id' | 'label' | 'edges' | 'groundCover'>;

const REFERENCE_HIGHLAND_ENTRY: Terrain3dEntry = {
  id: 'highland-valley',
  label: 'Highland Valley Reference Fixture',
  edges: { north: 'open-fog', south: 'open-fog', west: 'cliff', east: 'ocean' },
  groundCover: 'green-grass',
};

const REFERENCE_BACKDROP_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
  @location(1) fog: f32,
  @location(2) light: f32,
};

@vertex
fn vs(@location(0) world: vec3f, @location(1) normal: vec3f, @location(2) color: vec3f, @location(3) alpha: f32) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld3d(world, civsimBattleWorldDepth3d(world));
  let axes = cameraSpace(world.xy);
  let distanceFog = smoothstep(780.0, 2400.0, axes.y);
  let heightFog = smoothstep(120.0, 330.0, world.z);
  out.fog = clamp(distanceFog * 0.72 + heightFog * 0.20 + (1.0 - alpha) * 0.35, 0.0, 0.92);
  let sun = normalize(vec3f(-0.35, -0.18, 0.92));
  out.light = clamp(dot(normalize(normal), sun) * 0.22 + 0.88, 0.66, 1.08);
  out.color = color;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let haze = vec3f(0.80, 0.83, 0.84);
  let col = mix(in.color * in.light, haze, in.fog);
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}`;

const REFERENCE_SKY_WGSL = `
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

fn hash(p: vec2f) -> f32 {
  let p3 = fract(vec3f(p.xyx) * 0.1031);
  let q = p3 + dot(p3, p3.yzx + vec3f(33.33));
  return fract((q.x + q.y) * q.z);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
             mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x), u.y);
}

@vertex
fn vs(@builtin(vertex_index) index: u32) -> VsOut {
  let positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
  );
  let p = positions[index];
  var out: VsOut;
  out.pos = vec4f(p, 0.0, 1.0);
  out.uv = p * 0.5 + vec2f(0.5);
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let top = vec3f(0.73, 0.78, 0.81);
  let horizon = vec3f(0.86, 0.88, 0.88);
  var col = mix(horizon, top, smoothstep(0.18, 1.0, in.uv.y));
  let lowMist = 1.0 - smoothstep(0.20, 0.48, in.uv.y);
  col = mix(col, vec3f(0.88, 0.90, 0.89), lowMist * 0.45);
  let cloudP = in.uv * vec2f(3.0, 6.0) + vec2f(1.3, 0.4);
  let cloud = vnoise(cloudP) * 0.58 + vnoise(cloudP * 2.1 + vec2f(4.0, 7.0)) * 0.42;
  let cloudMask = smoothstep(0.50, 0.78, cloud) * smoothstep(0.28, 0.94, in.uv.y);
  col = mix(col, vec3f(0.91, 0.92, 0.91), cloudMask * 0.42);
  let shadow = smoothstep(0.55, 0.78, cloud) * smoothstep(0.40, 0.98, in.uv.y);
  col = mix(col, vec3f(0.67, 0.72, 0.76), shadow * 0.10);
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}`;

class ReferenceHighlandSkyPass {
  private pipeline: GPURenderPipeline;

  constructor(shell: RawFrameShell) {
    const module = compileShader(shell.device, REFERENCE_SKY_WGSL, 'reference-highland-sky');
    this.pipeline = shell.device.createRenderPipeline({
      label: 'reference-highland-sky-pipeline',
      layout: shell.device.createPipelineLayout({ bindGroupLayouts: [] }),
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [gpuOpaqueColorTarget(shell.info.format)] },
      primitive: { topology: 'triangle-list' },
    });
  }

  draw(pass: BackgroundRenderPass) {
    pass.setPipeline(this.pipeline);
    pass.draw(6);
  }

  stats() {
    return { layer: 'reference-highland-sky' as const };
  }
}

class ReferenceHighlandBackdropPass {
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private indexCount = 0;
  private triangles = 0;

  constructor(private shell: RawFrameShell) {
    const module = compileShader(shell.device, REFERENCE_BACKDROP_WGSL, 'reference-highland-backdrop');
    this.pipeline = shell.device.createRenderPipeline({
      label: 'reference-highland-backdrop-pipeline',
      layout: shell.device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 40,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' },
            { shaderLocation: 3, offset: 36, format: 'float32' },
          ],
        }],
      },
      fragment: { module, entryPoint: 'fs', targets: [gpuOpaqueColorTarget(shell.info.format)] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: gpuWorldDepthStencil('read-write'),
    });
  }

  setValley(bounds: { ox: number; oy: number; w: number; h: number; cell: number }, field: TerrainHeightField) {
    const builder = new MeshBuilder();
    const x0 = bounds.ox;
    const x1 = bounds.ox + bounds.w * bounds.cell;
    const y0 = bounds.oy;
    const y1 = bounds.oy + bounds.h * bounds.cell;

    this.addDistantValleyFloor(builder, x0, x1, y0, y1);
    this.addWaterInlet(builder, field);
    this.addLeftRidgeWall(builder, field, y0, y1);
    this.addFarRidgeBands(builder, y1);
    this.addForegroundHummockApron(builder, field);

    const mesh = builder.finish('reference highland backdrop');
    this.upload(mesh.opaque.vertices, mesh.opaque.indices);
    this.triangles = mesh.opaque.indices.length / 3;
  }

  private addDistantValleyFloor(builder: MeshBuilder, x0: number, x1: number, y0: number, y1: number) {
    const nearGrass: Rgb = [0.50, 0.60, 0.43];
    const midMist: Rgb = [0.67, 0.74, 0.70];
    const farMist: Rgb = [0.80, 0.84, 0.83];
    builder.gradQuad(
      [x0 + 210, y0 + 610, -9], [x1 - 120, y0 + 520, -12], [x1 + 840, y1 + 1240, -98], [x0 - 220, y1 + 1280, -82],
      nearGrass, farMist);
    builder.gradQuad(
      [x0 + 470, y0 + 780, -5], [x1 - 520, y0 + 850, -7], [x1 - 40, y1 + 940, -86], [x0 + 30, y1 + 860, -62],
      midMist, farMist);
  }

  private addWaterInlet(builder: MeshBuilder, field: TerrainHeightField) {
    const waterNear: Rgb = [0.58, 0.70, 0.73];
    const waterFar: Rgb = [0.76, 0.82, 0.84];
    const z0 = terrainHeightAt(field, 620, -120) - 6.5;
    builder.gradQuad(
      [520, -170, z0], [1030, -130, z0 - 4], [1160, 360, z0 - 34], [650, 330, z0 - 24],
      waterNear, waterFar);
    builder.gradQuad(
      [690, 290, z0 - 20], [1220, 390, z0 - 32], [1330, 820, z0 - 66], [790, 700, z0 - 52],
      waterFar, [0.82, 0.86, 0.86]);
  }

  private addLeftRidgeWall(builder: MeshBuilder, field: TerrainHeightField, y0: number, y1: number) {
    const nearStone: Rgb = [0.38, 0.42, 0.42];
    const midStone: Rgb = [0.52, 0.56, 0.56];
    const haze: Rgb = [0.80, 0.83, 0.84];
    builder.gradQuad(
      [-910, y0 + 340, terrainHeightAt(field, -820, y0 + 340) - 2],
      [-650, y0 + 820, terrainHeightAt(field, -650, y0 + 820) - 10],
      [-500, y1 + 520, -58],
      [-930, y1 + 300, -42],
      [0.42, 0.51, 0.39], [0.76, 0.81, 0.80]);
    const rows = [
      { x: -980, yStart: -300, yEnd: 620, radius: 155, height: 175, fog: 0.12, step: 155, salt: 17 },
      { x: -820, yStart: -70, yEnd: 900, radius: 190, height: 160, fog: 0.46, step: 175, salt: 53 },
      { x: -610, yStart: 230, yEnd: 1120, radius: 230, height: 130, fog: 0.70, step: 220, salt: 89 },
    ];
    for (const row of rows) {
      const count = Math.ceil((row.yEnd - row.yStart) / row.step);
      for (let i = 0; i <= count; i++) {
        const y = row.yStart + i * row.step;
        const x = row.x + Math.sin((i + row.salt) * 1.7) * row.radius * 0.20;
        const base = terrainHeightAt(field, x + 80, y) - 18 - row.fog * 34;
        const radius = row.radius * (0.82 + hashUnit(i, row.salt) * 0.34);
        const height = row.height * (0.78 + hashUnit(i, row.salt + 11) * 0.34);
        const baseC = mixRgb(nearStone, haze, row.fog);
        const topC = mixRgb(midStone, haze, Math.min(0.88, row.fog + 0.18));
        builder.peak([x, y, base], radius, height, 12, baseC, topC, row.salt + i * 13);
      }
    }
  }

  private addFarRidgeBands(builder: MeshBuilder, y1: number) {
    const ridgeA: Rgb = [0.54, 0.59, 0.60];
    const ridgeB: Rgb = [0.70, 0.75, 0.76];
    const haze: Rgb = [0.82, 0.85, 0.85];
    const bands = [
      { y: y1 + 220, x0: -360, x1: 1030, z: -42, h: 135, c: ridgeA, fog: 0.30 },
      { y: y1 + 610, x0: -150, x1: 1180, z: -78, h: 118, c: ridgeB, fog: 0.58 },
      { y: y1 + 980, x0: 100, x1: 1320, z: -112, h: 92, c: haze, fog: 0.78 },
    ];
    for (const band of bands) {
      const steps = 7;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const xa = band.x0 + (band.x1 - band.x0) * t0;
        const xb = band.x0 + (band.x1 - band.x0) * t1;
        const topA = band.z + band.h * (0.78 + Math.sin((i + 1) * 1.7) * 0.18);
        const topB = band.z + band.h * (0.78 + Math.sin((i + 2) * 1.7) * 0.18);
        builder.gradQuad(
          [xa, band.y, band.z], [xb, band.y + 35 * Math.sin(i), band.z - 8], [xb, band.y + 55, topB], [xa, band.y + 25, topA],
          mixRgb(band.c, haze, band.fog * 0.25), mixRgb(band.c, haze, band.fog));
      }
    }
  }

  private addForegroundHummockApron(builder: MeshBuilder, field: TerrainHeightField) {
    const grass: Rgb = [0.48, 0.60, 0.39];
    const hazeGrass: Rgb = [0.66, 0.74, 0.66];
    builder.gradQuad(
      [20, -560, terrainHeightAt(field, 20, -560) + 1.0],
      [650, -520, terrainHeightAt(field, 650, -520) + 1.8],
      [760, -250, terrainHeightAt(field, 760, -250) - 4.0],
      [120, -280, terrainHeightAt(field, 120, -280) - 3.0],
      grass, hazeGrass);
  }

  private upload(verts: Float32Array, indices: Uint16Array) {
    const device = this.shell.device;
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.vertexBuffer = device.createBuffer({ label: 'reference-highland-backdrop-vertices', size: Math.max(4, verts.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    if (verts.byteLength > 0) device.queue.writeBuffer(this.vertexBuffer, 0, verts);
    const padded = indices.byteLength % 4 === 0 ? indices : new Uint16Array(indices.length + 1);
    if (padded !== indices) padded.set(indices);
    this.indexBuffer = device.createBuffer({ label: 'reference-highland-backdrop-indices', size: Math.max(4, padded.byteLength), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    if (padded.byteLength > 0) device.queue.writeBuffer(this.indexBuffer, 0, padded);
    this.indexCount = indices.length;
  }

  draw(pass: WorldRenderPass) {
    if (!this.vertexBuffer || !this.indexBuffer || this.indexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint16');
    pass.drawIndexed(this.indexCount);
  }

  stats() {
    return { layer: 'reference-highland-backdrop' as const, triangles: this.triangles };
  }
}

// The rolling 3D battle terrain: height-displaced ground + shared scenery props
// seated on the same height, viewed at the gameplay camera. Proves the slice-03
// foundation — soldiers and props will share this ground.
async function routeBattleTerrain3d(ctx: LabContext) {
  const requestedGate = ctx.params.get('gate') ?? '';
  let entry: BattleMapCatalogEntry | Terrain3dEntry;
  let grid: BattleTerrainGrid;
  if (requestedGate === REFERENCE_HIGHLAND_ENTRY.id) {
    entry = REFERENCE_HIGHLAND_ENTRY;
    grid = buildReferenceHighlandGrid();
  } else {
    const { default: initWasm, Game } = await import('../../../web/src/wasm/game_wasm.js');
    const wasm = await initWasm();
    const game = new Game(0x5eed_c0de);
    const catalogEntry = battleMapById(requestedGate) ?? BATTLE_MAP_CATALOG[0];
    game.load_map(catalogEntry.wasmMapId);
    entry = catalogEntry;

    const tw = game.terrain_w();
    const th = game.terrain_h();
    const tcell = game.terrain_cell();
    const tox = game.terrain_origin_x();
    const toy = game.terrain_origin_y();
    grid = {
      w: tw,
      h: th,
      cell: tcell,
      ox: tox,
      oy: toy,
      tint: new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), tw * th).slice(),
      speed: new Float32Array(wasm.memory.buffer, game.terrain_speed_ptr(), tw * th).slice(),
      height: new Float32Array(wasm.memory.buffer, game.terrain_height_ptr(), tw * th).slice(),
    };
  }
  const { w, h, cell, ox, oy } = grid;
  const presentation = buildBattleTerrainPresentation(entry, grid, 0x1234);
  // Exaggerate the gentle metre-scale relief for readability at the gameplay
  // camera (the sim height stays plausible for later vision/ballistics). One
  // field drives ground, props, and soldiers so they share the exact surface.
  const field = presentation.height;
  const view = ctx.params.get('view') ?? 'field';
  const isReferenceFixture = presentation.mapId === REFERENCE_HIGHLAND_ENTRY.id;
  const environment = resolveBattleEnvironment(ctx.params.get('environment') ?? (view === 'reference' ? 'overcast-foggy' : 'golden-hour'));
  field.verticalScale = isReferenceFixture ? 2.35 : 2.6;
  const scenery = featuresToBattleScenery(presentation.features, field, 0x77);

  // Frame this map's biggest mid-field land feature (a wood, else a rock/mud
  // patch) at a three-quarter gameplay camera so the props stand up and the
  // relief reads. Edge blockers (water/wall) and the far edges are excluded so
  // the view stays on the playable field, not the sealed sides.
  const midField = presentation.features.filter(
    (f) => Math.abs(f.x) < 800 && Math.abs(f.y) < 550 && (f.kind === 'forest' || f.kind === 'rock' || f.kind === 'mud'),
  );
  const woods = midField.filter((f) => f.kind === 'forest');
  const focus = (woods.length > 0 ? woods : midField).reduce<BattleTerrainFeature | undefined>(
    (big, f) => (f.radius > (big?.radius ?? 0) ? f : big),
    undefined,
  );
  // Camera: 'field' frames a mid-field wood (pass cx/cy to aim it, e.g. at a
  // coastal shore); 'west'/'east' look outward toward that sealed edge so its
  // blocker fills the distance. 'reference' uses the zoom-coupled vista endpoint
  // for the battle-map-reference comparison shot.
  if (view === 'reference') ctx.root.classList.add('reference-shot');
  const halfW = (w * cell) / 2;
  const midY = oy + (h * cell) / 2;
  // For the soldiers view, find the steepest slope on the field so the block
  // visibly climbs it; other views plant near the focus wood.
  const slopeSpot = steepestSpot(field, ox, oy, w, h, cell);
  const standX = Number(ctx.params.get('cx') ?? (view === 'soldiers' ? slopeSpot.x : focus ? focus.x + 220 : 0));
  const standY = Number(ctx.params.get('cy') ?? (view === 'soldiers' ? slopeSpot.y : focus ? focus.y : 0));
  const camera = view === 'west'
    ? { x: -halfW + 360, y: midY, zoom: 0.95, pitch: 0.26, yaw: -Math.PI / 2 }
    : view === 'east'
      ? { x: halfW - 360, y: midY, zoom: 0.95, pitch: 0.26, yaw: Math.PI / 2 }
      : view === 'soldiers'
        ? { x: standX, y: standY + 4, zoom: 9.0, pitch: 0.40, yaw: -0.04 }
        : view === 'reference'
          ? isReferenceFixture
            ? { x: Number(ctx.params.get('cx') ?? -380), y: Number(ctx.params.get('cy') ?? -720), zoom: Number(ctx.params.get('zoom') ?? 1.92), pitch: 1.03, yaw: -0.035, perspective: 0.0068 }
            : { x: Number(ctx.params.get('cx') ?? -70), y: Number(ctx.params.get('cy') ?? -650), zoom: Number(ctx.params.get('zoom') ?? 2.4), pitch: 1.02, yaw: -0.04, perspective: 0.006 }
        : { x: Number(ctx.params.get('cx') ?? focus?.x ?? 0), y: Number(ctx.params.get('cy') ?? focus?.y ?? 0) - 110, zoom: 3.3, pitch: 0.44, yaw: -0.05 };
  const shell = await createConfiguredShell(ctx.canvas, camera, environment);
  // Field water animates on cam.time; snap at a fixed t for deterministic shots
  // (defaults to 0, matching the pre-water frozen frame for non-water maps).
  shell.setTime(numberParam(ctx.params, 't', 0));
  const ground = new BattleGroundPass(shell, environment);
  ground.setTerrain(grid, field, presentation.groundCover);
  const grass = new BattleGrassPass(shell, environment);
  const grassZoomT = view === 'reference' ? 1.0 : view === 'soldiers' ? 0.82 : 0.58;
  const requestedGrassTechnique = ctx.params.get('grassTechnique');
  const grassTechnique = view === 'reference' && isReferenceFixture
    ? requestedGrassTechnique === 'cards'
      ? 'cards'
      : requestedGrassTechnique === 'field-meadow'
        ? 'field-meadow'
        : 'field-accent'
    : 'cards';
  const grassFocus = {
    x: camera.x,
    y: camera.y,
    radius: view === 'reference' ? Number(ctx.params.get('grassRadius') ?? (isReferenceFixture ? 500 : 320)) : view === 'soldiers' ? 150 : 340,
    ...(view === 'reference' && isReferenceFixture ? {
      yaw: camera.yaw,
      depthNear: numberParam(ctx.params, 'grassDepthNear', 35),
      depthFar: numberParam(ctx.params, 'grassDepthFar', 540),
      nearBoost: numberParam(ctx.params, 'grassNearBoost', 2.20),
      farWeight: numberParam(ctx.params, 'grassFarWeight', 0.035),
    } : {}),
  };
  let referenceFieldSnapshot: ReturnType<typeof sampleGrassField> | null = null;
  if (view === 'reference' && isReferenceFixture && grassTechnique !== 'cards') {
    referenceFieldSnapshot = sampleGrassField(grid, field, {
      seed: integerParam(ctx.params, 'grassSeed', 0x7a55, 0, 0x7fff_ffff),
      focus: grassFocus,
      fieldCellSize: numberParam(ctx.params, 'grassFieldCell', 4.6),
      snapCellSize: numberParam(ctx.params, 'grassSnapCell', 28),
      clumpCellSize: numberParam(ctx.params, 'grassClumpCell', 46),
      density: numberParam(ctx.params, 'grassFieldDensity', 1.0),
      jitter: numberParam(ctx.params, 'grassFieldJitter', 0.58),
      minNormalZ: numberParam(ctx.params, 'grassMinNormalZ', 0.54),
      maxRecords: integerParam(ctx.params, 'grassFieldRecords', 7000, 0, 20000),
      baseHeight: numberParam(ctx.params, 'grassBladeHeight', 0.82),
      baseWidth: numberParam(ctx.params, 'grassBladeWidth', 0.052),
      baseBend: numberParam(ctx.params, 'grassBend', 0.28),
    });
    ground.setMeadowFromGrassField(referenceFieldSnapshot, { x: ox, y: oy, width: w * cell, height: h * cell }, {
      depthNear: numberParam(ctx.params, 'meadowDepthNear', 0),
      depthFar: numberParam(ctx.params, 'meadowDepthFar', 1040),
      nearStrength: numberParam(ctx.params, 'meadowNear', 0.96),
      farStrength: numberParam(ctx.params, 'meadowFar', 0.48),
      cellSize: numberParam(ctx.params, 'meadowCell', 16),
      spread: numberParam(ctx.params, 'meadowSpread', 86),
      coverageSpread: numberParam(ctx.params, 'meadowCoverageSpread', 180),
      densityScale: numberParam(ctx.params, 'meadowDensityScale', 1.08),
      streakStrength: numberParam(ctx.params, 'meadowStreak', 0.28),
      fieldFloor: numberParam(ctx.params, 'meadowFloor', 0.07),
      rootMassStrength: grassTechnique === 'field-accent' ? numberParam(ctx.params, 'rootMassStrength', 1.24) : 0,
      rootMassContrast: numberParam(ctx.params, 'rootMassContrast', 0.78),
      rootMassSpread: numberParam(ctx.params, 'rootMassSpread', 32),
    });
    const fiberShellVariant = fiberShellVariantParam(ctx.params, 'fiberShellVariant', 'normal');
    const requestedPrimitiveFamily = grassPrimitiveFamilyParam(ctx.params, 'grassPrimitiveFamily', 'field-fiber-shell');
    const defaultAccentStyle = grassTechnique === 'field-meadow'
      ? 'tuft'
      : accentStyleForPrimitiveFamily(requestedPrimitiveFamily, fiberShellVariant);
    const grassAccentStyle = grassAccentStyleParam(ctx.params, 'grassAccentStyle', defaultAccentStyle);
    const grassPrimitiveFamily = grassPrimitiveFamilyForRequest(requestedPrimitiveFamily, grassAccentStyle);
    const texturePrimitive = isTextureGrassPrimitiveFamily(grassPrimitiveFamily);
    const textureCarrier = grassPrimitiveFamily === 'texture-carrier';
    const textureMicroCarrier = grassPrimitiveFamily === 'texture-micro-carrier';
    const textureVolumeProfile = texturePrimitive ? textureVolumeProfileParam(ctx.params, 'textureVolumeProfile', 'current') : 'current';
    const textureVolumeRenderModel = grassPrimitiveFamily === 'texture-volume' ? textureVolumeRenderModelParam(ctx.params, 'textureVolumeRenderModel', 'opaque-card') : 'opaque-card';
    const grassAccentAggregation = grassTechnique === 'field-accent' && texturePrimitive
      ? grassAccentAggregationParam(ctx.params, 'grassAccentAggregation', 'field-cell')
      : grassTechnique === 'field-accent' && isFieldFiberShellStyle(grassAccentStyle)
      ? 'field-near'
      : grassTechnique === 'field-accent' && isClumpGrassAccentStyle(grassAccentStyle)
      ? grassAccentAggregationParam(ctx.params, 'grassAccentAggregation', 'clump')
      : 'record';
    const fieldShellStyle = isFieldFiberShellStyle(grassAccentStyle);
    const workbenchPrimitive = isWorkbenchGrassPrimitiveFamily(grassPrimitiveFamily);
    grass.setGrassFieldSnapshot(referenceFieldSnapshot, presentation.groundCover, {
      seed: 0x7a55,
      bladesPerTuft: integerParam(ctx.params, 'grassBlades', grassTechnique === 'field-meadow' ? 0 : fieldShellStyle ? 1 : textureMicroCarrier ? 2 : textureCarrier ? 4 : texturePrimitive ? 4 : grassPrimitiveFamily === 'alpha-impostor' ? 4 : grassPrimitiveFamily === 'volume-card' ? 5 : 5, 0, 96),
      maxTufts: integerParam(ctx.params, 'grassAccentTufts', grassTechnique === 'field-meadow' ? referenceFieldSnapshot.records.length : fieldShellStyle ? 5200 : workbenchPrimitive ? referenceFieldSnapshot.records.length : 2600, 0, 20000),
      accentMaxClumps: integerParam(ctx.params, 'grassAccentClumps', grassTechnique === 'field-accent' ? textureMicroCarrier ? 4600 : textureCarrier ? 2400 : texturePrimitive ? 1900 : workbenchPrimitive ? 420 : 760 : 0, 0, 20000),
      bladeHeight: numberParam(ctx.params, 'grassBladeHeight', grassTechnique === 'field-meadow' ? 0.82 : grassAccentStyle === 'field-fiber-shell-visibility' ? 0.86 : fieldShellStyle ? 0.62 : textureMicroCarrier ? 0.68 : textureCarrier ? 0.92 : texturePrimitive ? 1.06 : grassPrimitiveFamily === 'alpha-impostor' ? 0.74 : grassPrimitiveFamily === 'billboard-cluster' ? 0.92 : grassPrimitiveFamily === 'volume-card' ? 0.70 : 0.56),
      bladeWidth: numberParam(ctx.params, 'grassBladeWidth', grassTechnique === 'field-meadow' ? 0.052 : grassAccentStyle === 'field-fiber-shell-visibility' ? 0.052 : fieldShellStyle ? 0.036 : textureMicroCarrier ? 0.044 : textureCarrier ? 0.120 : texturePrimitive ? 0.074 : grassPrimitiveFamily === 'volume-card' ? 0.090 : 0.070),
      bend: numberParam(ctx.params, 'grassBend', grassTechnique === 'field-meadow' ? 0.28 : grassAccentStyle === 'field-fiber-shell-visibility' ? 0.08 : fieldShellStyle ? 0.14 : textureMicroCarrier ? 0.05 : textureCarrier ? 0.035 : texturePrimitive ? 0.05 : grassPrimitiveFamily === 'volume-card' ? 0.06 : 0.12),
      spread: numberParam(ctx.params, 'grassSpread', grassTechnique === 'field-meadow' ? 0.16 : grassAccentStyle === 'field-fiber-shell-visibility' ? 0.055 : fieldShellStyle ? 0.040 : textureMicroCarrier ? 0.052 : textureCarrier ? 0.12 : texturePrimitive ? 0.082 : grassPrimitiveFamily === 'volume-card' ? 0.070 : 0.090),
      windPhase: numberParam(ctx.params, 'grassPhase', 0),
      windStrength: grassTechnique === 'field-meadow' ? 0.032 : 0.016,
      zoomT: grassZoomT,
      focus: grassFocus,
      accentDepthNear: numberParam(ctx.params, 'grassAccentDepthNear', fieldShellStyle || workbenchPrimitive ? 35 : -40),
      accentDepthFar: numberParam(ctx.params, 'grassAccentDepthFar', textureMicroCarrier ? 460 : textureCarrier ? 460 : fieldShellStyle || workbenchPrimitive ? 360 : 120),
      surfaceBlend: numberParam(ctx.params, 'grassAccentSurface', grassTechnique === 'field-meadow' ? 0 : grassAccentAggregation === 'field-cell' ? textureMicroCarrier ? 0.34 : textureCarrier ? 0.38 : 0.26 : grassAccentAggregation === 'clump' ? workbenchPrimitive ? 0.38 : 0.56 : grassAccentStyle === 'field-fiber-shell-visibility' ? 0.42 : grassAccentAggregation === 'field-near' ? 0.70 : 0.98),
      accentStyle: grassAccentStyle,
      accentAggregation: grassAccentAggregation,
      accentClumpFootprint: numberParam(ctx.params, 'grassAccentFootprint', grassAccentAggregation === 'field-cell' ? textureMicroCarrier ? 1.9 : textureCarrier ? 5.8 : 3.4 : grassAccentAggregation === 'clump' ? workbenchPrimitive ? 8.2 : 6.8 : 1),
      fiberShellVariant,
      grassPrimitiveFamily,
      grassPrimitiveBaseline: grassPrimitiveFamily === 'field-fiber-shell' ? 'none' : 'field-fiber-shell-normal',
      textureVolumeProfile,
      textureVolumeRenderModel,
    });
  } else {
    grass.setTerrain(grid, field, presentation.groundCover, {
      seed: 0x7a55,
      density: view === 'reference' ? (isReferenceFixture ? 1.15 : 0.72) : 0.50,
      maxTufts: view === 'reference' ? (isReferenceFixture ? 24000 : 8000) : 4200,
      zoomT: grassZoomT,
      focus: grassFocus,
      ...(view === 'reference' ? { bladesPerTuft: integerParam(ctx.params, 'grassBlades', 12, 1, 96) } : {}),
      bladeHeight: view === 'reference' ? numberParam(ctx.params, 'grassBladeHeight', isReferenceFixture ? 1.45 : 1.24) : 1.0,
      bladeWidth: view === 'reference' ? numberParam(ctx.params, 'grassBladeWidth', isReferenceFixture ? 0.096 : 0.088) : 0.072,
      bend: view === 'reference' ? numberParam(ctx.params, 'grassBend', isReferenceFixture ? 0.46 : 0.40) : 0.32,
      spread: view === 'reference' ? numberParam(ctx.params, 'grassSpread', isReferenceFixture ? 0.34 : 0.25) : 0.20,
      windPhase: numberParam(ctx.params, 'grassPhase', 0),
      windStrength: isReferenceFixture ? 0.058 : 0.078,
    });
  }
  const props = new CampaignSceneryPass(shell, 'battle');
  props.upload(scenery);
  const horizon = new BattleHorizonPass(shell, environment);
  horizon.setEdges({ ox, oy, w, h, cell }, presentation.edges, field);
  const referenceSky = view === 'reference' && isReferenceFixture ? new ReferenceHighlandSkyPass(shell) : null;
  const referenceBackdrop = view === 'reference' && isReferenceFixture ? new ReferenceHighlandBackdropPass(shell) : null;
  referenceBackdrop?.setValley({ ox, oy, w, h, cell }, field);

  // view=soldiers: plant a block on the rolling ground, seated through the SAME
  // height field as the terrain mesh and props, so feet and shadows ride the
  // surface (the slice-03 movement/seating invariant on the real source).
  const terrainHeight = (x: number, y: number) => terrainHeightAt(field, x, y);
  let soldiers: { pipeline: Awaited<ReturnType<typeof createSkinnedPipeline>>; shadows: SoldierShadowDecalPass; count: number; elevationMatches: boolean; elevationSpan: number } | null = null;
  if (view === 'soldiers') {
    const vat = await loadPlaceholderVat();
    const cols = 16;
    const rows = 12;
    const positions = new Float32Array(cols * rows * 2);
    const soldierUnit = new Uint32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        // Deep ranks running across the slope so the block climbs it.
        positions[i * 2] = standX + (c - (cols - 1) / 2) * 2.0;
        positions[i * 2 + 1] = standY + (r - (rows - 1) / 2) * 3.0;
      }
    }
    const built = buildCrowdInstances({ positions, soldierUnit, unitClass: [0], terrainHeight, simTick: 90 });
    const instances = built.instances.map((inst) => ({ ...inst, facing: Math.PI / 2 }));
    const elevationMatches = instances.every((inst) => Math.abs((inst.elevation ?? 0) - terrainHeight(inst.x, inst.y)) < 1e-4);
    const elevs = instances.map((i) => i.elevation ?? 0);
    const pipeline = await createSkinnedPipeline(shell, [0.30, 0.36, 0.74], vat, environment);
    pipeline.upload(instances, { forcedClip: 'march', phaseOffset: 0, size: 1 });
    const shadows = new SoldierShadowDecalPass(shell);
    shadows.upload(instances);
    soldiers = { pipeline, shadows, count: instances.length, elevationMatches, elevationSpan: Math.max(...elevs) - Math.min(...elevs) };
  }

  shell.drawFrame({
    clear: clearForEnvironment(environment),
    passes: [
      ...(referenceSky
        ? [{ id: 'battle-reference-sky', role: 'background-underpaint' as const, phase: 'background' as const, draw: (pass: BackgroundRenderPass) => referenceSky.draw(pass) }]
        : []),
      ...(referenceBackdrop
        ? [{ id: 'battle-reference-backdrop', role: 'world-opaque' as const, phase: 'world-depth' as const, depth: 'read-write' as const, draw: (pass: WorldRenderPass) => referenceBackdrop.draw(pass) }]
        : [{ id: 'battle-3d-horizon', role: 'world-opaque' as const, phase: 'world-depth' as const, depth: 'read-write' as const, draw: (pass: WorldRenderPass) => horizon.draw(pass) }]),
      { id: 'battle-3d-ground', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => ground.draw(pass) },
      { id: 'battle-3d-scenery', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => props.drawOpaque(pass) },
      { id: 'battle-3d-grass', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => grass.draw(pass) },
      ...(soldiers ? [{ id: 'battle-3d-soldiers', role: 'world-opaque' as const, phase: 'world-depth' as const, depth: 'read-write' as const, draw: (pass: WorldRenderPass) => soldiers.pipeline.draw(pass) }] : []),
      { id: 'battle-3d-scenery-shadow', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => props.drawShadows(pass) },
      ...(soldiers ? [{ id: 'battle-3d-soldier-shadow', role: 'world-decal' as const, phase: 'world-depth' as const, depth: 'read' as const, draw: (pass: WorldRenderPass) => soldiers.shadows.draw(pass) }] : []),
    ],
  });

  const propStats = props.stats();
  const grassStats = grass.stats();
  const groundStats = ground.stats();
  ctx.status.innerHTML = reportTable({
    route: 'battle-terrain-3d',
    gate: entry.id,
    map: entry.label,
    environment: environment.id,
    groundCover: presentation.groundCover,
    groundTriangles: groundStats.triangles,
    grassTechnique,
    meadow: groundStats.meadow.enabled ? `${groundStats.meadow.nearStrength.toFixed(2)} → ${groundStats.meadow.farStrength.toFixed(2)}` : 'off',
    grassTufts: grassStats.tuftInstances,
    grassAccent: `${grassStats.accentStyle}/${grassStats.accentAggregation}`,
    grassPrimitiveFamily: grassStats.grassPrimitiveFamily,
    textureVolumeProfile: grassStats.textureVolumeProfile,
    textureVolumeRenderModel: grassStats.textureVolumeRenderModel,
    grassPrimitiveBaseline: grassStats.grassPrimitiveBaseline,
    grassPrimitiveTexture: grassStats.grassPrimitiveTextureBytes > 0
      ? `${grassStats.grassPrimitiveTextureWidth}x${grassStats.grassPrimitiveTextureHeight} / ${grassStats.grassPrimitiveTextureTiles} tiles`
      : 'none',
    fiberShellVariant: grassStats.fiberShellVariant,
    grassAccentClumps: grassStats.accentClumps,
    grassAccentSource: grassStats.accentSourceRecords,
    grassBlades: grassStats.bladeInstances,
    grassBlockedCells: grassStats.blockedTintCells,
    props: scenery.length,
    trees: propStats.trees,
    rocks: propStats.rocks,
    heightSpan: heightSpan(presentation.height).toFixed(2),
  });
  publish('battle-terrain-3d', true, {
    route: 'battle-terrain-3d',
    gate: entry.id,
    mapId: presentation.mapId,
    view,
    environment: battleEnvironmentStats(environment),
    edges: presentation.edges,
    sealedEdges: referenceBackdrop ? [] : horizon.stats().sealedEdges,
    referenceSky: referenceSky?.stats() ?? null,
    referenceBackdrop: referenceBackdrop?.stats() ?? null,
    groundCover: presentation.groundCover,
    groundTriangles: groundStats.triangles,
    groundLayer: groundStats.layer,
    ground: groundStats,
    grassTechnique,
    props: scenery.length,
    trees: propStats.trees,
    rocks: propStats.rocks,
    grass: grassStats,
    heightSpan: heightSpan(presentation.height),
    soldiers: soldiers?.count ?? 0,
    soldierElevationMatches: soldiers?.elevationMatches ?? null,
    soldierElevationSpan: soldiers?.elevationSpan ?? 0,
    depth: shell.stats().depth,
    framePhases: shell.stats().phases,
  });
}

function buildReferenceHighlandGrid(): BattleTerrainGrid {
  const w = 360;
  const h = 250;
  const cell = 6;
  const ox = -1080;
  const oy = -930;
  const tint = new Uint8Array(w * h);
  const speed = new Float32Array(w * h);
  const height = new Float32Array(w * h);

  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      const x = ox + (cx + 0.5) * cell;
      const y = oy + (cy + 0.5) * cell;
      const nx = (cx + 0.5) / w;
      const ny = (cy + 0.5) / h;

      const leftWall = Math.pow(clampUnit((0.24 - nx) / 0.24), 1.55) * (6.0 + 1.8 * ny);
      const leftToe = 2.2 * gaussian2(x, y, -700, -220, 300, 570);
      const valleyFloor = -4.8 * gaussian2(x, y, -20, -105, 760, 560)
        - 2.8 * gaussian2(x, y, 260, 220, 780, 520)
        - 1.4 * smoothUnit((ny - 0.43) / 0.42);
      const nearHummock = 4.1 * gaussian2(x, y, 360, -710, 560, 170)
        + 2.2 * gaussian2(x, y, -210, -760, 470, 125);
      const midHummock = 2.7 * gaussian2(x, y, 150, -420, 310, 135)
        + 1.8 * gaussian2(x, y, 520, -485, 290, 175);
      const distantShelves = 0.9 * smoothUnit((ny - 0.54) / 0.34);
      const roll = 0.42 * Math.sin(x * 0.006 + y * 0.003)
        + 0.33 * Math.sin(x * 0.013 - y * 0.005);
      let z = leftWall + leftToe + valleyFloor + nearHummock + midHummock + distantShelves + roll - 0.8;

      let t = 0;
      const westCliff = x < -905 + Math.sin(y * 0.009) * 36 + Math.sin(y * 0.021) * 18;
      const shore = 450 + Math.sin(y * 0.004) * 80 - smoothUnit((y + 80) / 620) * 170;
      const inletMouth = gaussian2(x, y, 690, 20, 360, 280) > 0.40
        || gaussian2(x, y, 860, 360, 420, 330) > 0.50;
      const eastWater = y > -260 && x > shore && inletMouth;
      const darkDrain = y > -500 && y < 160 && Math.abs(x + 190 - (y + 340) * 0.36) < 11;
      const screeToe = !westCliff && x < -650 + Math.sin(y * 0.006) * 50 && y > -650;
      const rockOutcrop =
        gaussian2(x, y, -520, -390, 78, 100) > 0.62
        || gaussian2(x, y, -80, -210, 64, 66) > 0.66
        || gaussian2(x, y, 180, -315, 70, 64) > 0.66
        || gaussian2(x, y, 520, -620, 58, 52) > 0.68;

      if (westCliff) {
        t = 2;
      } else if (eastWater) {
        t = 1;
        z = -2.35 + ny * 0.32;
      } else if (rockOutcrop) {
        t = 2;
        z += 0.55;
      } else if (screeToe) {
        t = 6;
      } else if (darkDrain) {
        t = 5;
        z -= 0.45;
      }

      tint[i] = t;
      speed[i] = t === 1 || t === 2 ? 0 : t === 5 ? 0.72 : t === 6 ? 0.82 : 1;
      height[i] = z;
    }
  }

  return { w, h, cell, ox, oy, tint, speed, height };
}

function gaussian2(x: number, y: number, cx: number, cy: number, sx: number, sy: number): number {
  const dx = (x - cx) / sx;
  const dy = (y - cy) / sy;
  return Math.exp(-(dx * dx + dy * dy));
}

function smoothUnit(t: number): number {
  const u = clampUnit(t);
  return u * u * (3 - 2 * u);
}

function clampUnit(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const u = clampUnit(t);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

function hashUnit(k: number, salt: number): number {
  let n = Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

async function routeBattleGrass(ctx: LabContext) {
  const gate = ctx.params.get('gate') === 'sparse' ? 'sparse' : 'flat-field';
  const environment = resolveBattleEnvironment(ctx.params.get('environment'));
  const bounds: BattleGrassBounds = { x: -18, y: -11, width: 36, height: 22 };
  const phase = numberParam(ctx.params, 'phase', 0);
  const params: BattleGrassParams = {
    seed: 0x4a55,
    density: numberParam(ctx.params, 'density', gate === 'sparse' ? 0.42 : 0.92),
    maxTufts: integerParam(ctx.params, 'maxTufts', gate === 'sparse' ? 260 : 720, 0, 2000),
    bladesPerTuft: integerParam(ctx.params, 'blades', 9, 1, 24),
    bladeHeight: numberParam(ctx.params, 'bladeHeight', 0.78),
    bladeWidth: numberParam(ctx.params, 'bladeWidth', 0.058),
    bend: numberParam(ctx.params, 'bend', 0.28),
    spread: numberParam(ctx.params, 'spread', 0.16),
    windPhase: phase,
    windStrength: numberParam(ctx.params, 'windStrength', 0.10),
  };
  const camera = { x: 0, y: -2.2, zoom: 31, pitch: 0.54, yaw: -0.12, perspective: 0.018 };
  const shell = await createConfiguredShell(ctx.canvas, camera, environment);
  const grass = new BattleGrassPass(shell, environment);
  grass.setField(flatFieldFor(bounds), bounds, 'green-grass', params);
  shell.drawFrame({
    clear: clearForEnvironment(environment),
    terrainRect: [bounds.x, bounds.y, bounds.width, bounds.height],
    terrainStyle: 'wide-detail',
    passes: [
      { id: 'battle-grass-flat-field', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => grass.draw(pass) },
    ],
  });
  const stats = grass.stats();
  ctx.status.innerHTML = reportTable({
    route: 'battle-grass',
    gate,
    tufts: stats.tuftInstances,
    blades: stats.bladeInstances,
    capped: stats.cappedTufts,
    windPhase: stats.windPhase.toFixed(2),
  });
  publish('battle-grass', true, {
    route: 'battle-grass',
    gate,
    camera,
    bounds,
    ...stats,
    depth: shell.stats().depth,
    framePhases: shell.stats().phases,
    postCutoverScreenshots: 'renderer-only',
  });
}

async function routeBattleGrassField(ctx: LabContext) {
  const requestedMode = ctx.params.get('mode');
  const mode = requestedMode === 'field-meadow' || requestedMode === 'field-accent' || requestedMode === 'foreground-close-lab'
    ? requestedMode
    : 'packed-tilt';
  const closeLab = mode === 'foreground-close-lab';
  const environment = resolveBattleEnvironment(ctx.params.get('environment') ?? (closeLab ? 'overcast-foggy' : 'golden-hour'));
  const accentMode = mode === 'field-accent' || closeLab;
  const closeLabCameraProfile: ForegroundCloseLabCameraProfile | undefined = closeLab
    ? foregroundCloseLabCameraProfileParam(ctx.params, 'labCameraProfile', 'b4b1-current')
    : undefined;
  const closeLabProfile = closeLabCameraProfile ? FOREGROUND_CLOSE_LAB_CAMERA_PROFILES[closeLabCameraProfile] : undefined;
  const grid = buildGrassFieldSlopeGrid();
  const field = terrainHeightField(grid);
  const bounds = { x: grid.ox, y: grid.oy, width: grid.w * grid.cell, height: grid.h * grid.cell };
  const focus = {
    x: numberParam(ctx.params, 'focusX', closeLab ? 0 : 0),
    y: numberParam(ctx.params, 'focusY', closeLab ? -22 : 0),
    radius: numberParam(ctx.params, 'radius', closeLab ? 78 : 86),
  };
  const snapshot = sampleGrassField(grid, field, {
    seed: integerParam(ctx.params, 'seed', 0x31b2, 0, 0x7fff_ffff),
    focus,
    fieldCellSize: numberParam(ctx.params, 'fieldCell', 3.0),
    snapCellSize: numberParam(ctx.params, 'snapCell', 22),
    clumpCellSize: numberParam(ctx.params, 'clumpCell', 30),
    density: numberParam(ctx.params, 'density', 1.0),
    jitter: numberParam(ctx.params, 'jitter', 0.46),
    minNormalZ: numberParam(ctx.params, 'minNormalZ', mode === 'packed-tilt' ? 0.66 : 0.78),
    maxRecords: integerParam(ctx.params, 'maxRecords', 3200, 0, 12000),
    baseHeight: numberParam(ctx.params, 'bladeHeight', 1.02),
    baseWidth: numberParam(ctx.params, 'bladeWidth', 0.078),
    baseBend: numberParam(ctx.params, 'bend', 0.30),
  });
  const closeLabCamera = closeLabProfile?.camera;
  const camera = closeLab && closeLabCamera
    ? {
      x: numberParam(ctx.params, 'cameraX', closeLabCamera.x),
      y: numberParam(ctx.params, 'cameraY', closeLabCamera.y),
      zoom: numberParam(ctx.params, 'cameraZoom', closeLabCamera.zoom),
      pitch: numberParam(ctx.params, 'cameraPitch', closeLabCamera.pitch),
      yaw: numberParam(ctx.params, 'cameraYaw', closeLabCamera.yaw),
      perspective: numberParam(ctx.params, 'cameraPerspective', closeLabCamera.perspective),
    }
    : { x: 10, y: -14, zoom: 40, pitch: 0.66, yaw: -0.18, perspective: 0.020 };
  const shell = await createConfiguredShell(ctx.canvas, camera, environment);
  const ground = new BattleGroundPass(shell, environment);
  ground.setTerrain(grid, field, 'green-grass', 2);
  const bodyDomainId = bodyDomainIdParam(ctx.params, 'bodyDomainId', 'field-strand-material');
  if (mode !== 'packed-tilt') {
    ground.setMeadowFromGrassField(snapshot, bounds, {
      depthNear: numberParam(ctx.params, 'meadowDepthNear', -70),
      depthFar: numberParam(ctx.params, 'meadowDepthFar', 155),
      nearStrength: numberParam(ctx.params, 'meadowNear', 0.98),
      farStrength: numberParam(ctx.params, 'meadowFar', 0.74),
      cellSize: numberParam(ctx.params, 'meadowCell', 7),
      spread: numberParam(ctx.params, 'meadowSpread', 21),
      coverageSpread: numberParam(ctx.params, 'meadowCoverageSpread', 34),
      densityScale: numberParam(ctx.params, 'meadowDensityScale', 1.12),
      streakStrength: numberParam(ctx.params, 'meadowStreak', 0.30),
      fieldFloor: numberParam(ctx.params, 'meadowFloor', 0),
      rootMassStrength: accentMode ? numberParam(ctx.params, 'rootMassStrength', 1.32) : 0,
      rootMassContrast: numberParam(ctx.params, 'rootMassContrast', 0.72),
      rootMassSpread: numberParam(ctx.params, 'rootMassSpread', 9.5),
      bodyDomainId,
      bodyDomainStrength: numberParam(ctx.params, 'bodyDomainStrength', 0),
      bodyDomainScale: numberParam(ctx.params, 'bodyDomainScale', 0.84),
      bodyDomainFiberFrequency: numberParam(ctx.params, 'bodyDomainFiberFrequency', numberParam(ctx.params, 'bodyDomainScale', 0.84)),
      bodyDomainContrast: numberParam(ctx.params, 'bodyDomainContrast', 0.82),
    });
  }
  const grass = new BattleGrassPass(shell, environment);
  const fiberShellVariant = fiberShellVariantParam(ctx.params, 'fiberShellVariant', 'normal');
  const requestedPrimitiveFamily = grassPrimitiveFamilyParam(ctx.params, 'grassPrimitiveFamily', 'field-fiber-shell');
  const accentStyle = grassAccentStyleParam(ctx.params, 'accentStyle', accentMode ? accentStyleForPrimitiveFamily(requestedPrimitiveFamily, fiberShellVariant) : 'tuft');
  const grassPrimitiveFamily = grassPrimitiveFamilyForRequest(requestedPrimitiveFamily, accentStyle);
  const fieldShellStyle = isFieldFiberShellStyle(accentStyle);
  const workbenchPrimitive = isWorkbenchGrassPrimitiveFamily(grassPrimitiveFamily);
  const texturePrimitive = isTextureGrassPrimitiveFamily(grassPrimitiveFamily);
  const textureCarrier = grassPrimitiveFamily === 'texture-carrier';
  const textureMicroCarrier = grassPrimitiveFamily === 'texture-micro-carrier';
  const fieldFiberBodyPrimitive = grassPrimitiveFamily === 'field-fiber-body'
    || grassPrimitiveFamily === 'field-fiber-bundle'
    || grassPrimitiveFamily === 'field-strand-mat'
    || grassPrimitiveFamily === 'field-woven-mat';
  const fieldDomainSilhouettePrimitive = grassPrimitiveFamily === 'field-domain-shell' || grassPrimitiveFamily === 'field-domain-micro-strand';
  const textureVolumeProfile = texturePrimitive ? textureVolumeProfileParam(ctx.params, 'textureVolumeProfile', 'current') : 'current';
  const textureVolumeRenderModel = grassPrimitiveFamily === 'texture-volume' ? textureVolumeRenderModelParam(ctx.params, 'textureVolumeRenderModel', 'opaque-card') : 'opaque-card';
  const accentAggregation = accentMode && texturePrimitive
    ? grassAccentAggregationParam(ctx.params, 'accentAggregation', 'field-cell')
    : accentMode && fieldShellStyle
    ? 'field-near'
    : accentMode && fieldDomainSilhouettePrimitive
    ? 'field-cell'
    : accentMode && fieldFiberBodyPrimitive
    ? grassAccentAggregationParam(ctx.params, 'accentAggregation', 'record')
    : accentMode && isClumpGrassAccentStyle(accentStyle)
    ? grassAccentAggregationParam(ctx.params, 'accentAggregation', 'clump')
    : 'record';
  grass.setGrassFieldSnapshot(snapshot, 'green-grass', {
    seed: 0x31b2,
    bladesPerTuft: integerParam(ctx.params, 'blades', mode === 'field-meadow' ? 0 : accentMode && fieldShellStyle ? 1 : accentMode && grassPrimitiveFamily === 'field-domain-micro-strand' ? 22 : accentMode && fieldDomainSilhouettePrimitive ? 10 : accentMode && textureMicroCarrier ? 2 : accentMode && textureCarrier ? 4 : accentMode && texturePrimitive ? 4 : accentMode && workbenchPrimitive ? grassPrimitiveFamily === 'alpha-impostor' ? 4 : 5 : accentMode ? 3 : 9, 0, 48),
    maxTufts: integerParam(ctx.params, 'accentTufts', accentMode && accentAggregation === 'field-subcell' ? 7200 : accentMode && fieldShellStyle ? 1500 : accentMode && grassPrimitiveFamily === 'field-domain-micro-strand' ? 1450 : accentMode && fieldDomainSilhouettePrimitive ? 1850 : accentMode && workbenchPrimitive ? snapshot.records.length : accentMode ? 900 : snapshot.records.length, 0, 24000),
    accentMaxClumps: integerParam(ctx.params, 'accentClumps', accentMode ? accentAggregation === 'field-subcell' ? 900 : fieldDomainSilhouettePrimitive ? 0 : textureMicroCarrier ? 1900 : textureCarrier ? 1450 : texturePrimitive ? 1100 : workbenchPrimitive ? 360 : 420 : 0, 0, 12000),
    bladeHeight: numberParam(ctx.params, 'bladeHeight', mode === 'field-meadow' ? 0.32 : accentMode && accentStyle === 'field-fiber-shell-visibility' ? 0.86 : accentMode && fieldShellStyle ? 0.62 : accentMode && grassPrimitiveFamily === 'field-domain-micro-strand' ? 0.46 : accentMode && fieldDomainSilhouettePrimitive ? 0.64 : accentMode && textureMicroCarrier ? 0.58 : accentMode && textureCarrier ? 0.88 : accentMode && texturePrimitive ? 1.00 : accentMode && grassPrimitiveFamily === 'alpha-impostor' ? 0.74 : accentMode && grassPrimitiveFamily === 'billboard-cluster' ? 0.92 : accentMode && grassPrimitiveFamily === 'volume-card' ? 0.70 : accentMode ? 0.58 : 1.02),
    bladeWidth: numberParam(ctx.params, 'bladeWidth', mode === 'field-meadow' ? 0.024 : accentMode && accentStyle === 'field-fiber-shell-visibility' ? 0.052 : accentMode && fieldShellStyle ? 0.038 : accentMode && grassPrimitiveFamily === 'field-domain-micro-strand' ? 0.034 : accentMode && fieldDomainSilhouettePrimitive ? 0.060 : accentMode && textureMicroCarrier ? 0.044 : accentMode && textureCarrier ? 0.110 : accentMode && texturePrimitive ? 0.070 : accentMode && grassPrimitiveFamily === 'volume-card' ? 0.086 : accentMode ? 0.066 : 0.078),
    bend: numberParam(ctx.params, 'bend', mode === 'field-meadow' ? 0.18 : accentMode && accentStyle === 'field-fiber-shell-visibility' ? 0.08 : accentMode && fieldShellStyle ? 0.14 : accentMode && grassPrimitiveFamily === 'field-domain-micro-strand' ? 0.07 : accentMode && fieldDomainSilhouettePrimitive ? 0.09 : accentMode && textureMicroCarrier ? 0.05 : accentMode && textureCarrier ? 0.035 : accentMode && texturePrimitive ? 0.05 : accentMode && grassPrimitiveFamily === 'volume-card' ? 0.06 : accentMode ? 0.12 : 0.30),
    spread: numberParam(ctx.params, 'spread', mode === 'field-meadow' ? 0.06 : accentMode && accentStyle === 'field-fiber-shell-visibility' ? 0.055 : accentMode && fieldShellStyle ? 0.040 : accentMode && grassPrimitiveFamily === 'field-domain-micro-strand' ? 0.24 : accentMode && fieldDomainSilhouettePrimitive ? 0.34 : accentMode && textureMicroCarrier ? 0.052 : accentMode && textureCarrier ? 0.11 : accentMode && texturePrimitive ? 0.082 : accentMode && workbenchPrimitive ? 0.090 : accentMode ? 0.070 : 0.17),
    windPhase: numberParam(ctx.params, 'phase', 0.3),
    windStrength: numberParam(ctx.params, 'windStrength', mode === 'field-meadow' ? 0.014 : accentMode ? 0.012 : 0.035),
    zoomT: 1,
    focus,
    ...(accentMode ? {
      accentDepthNear: numberParam(ctx.params, 'accentDepthNear', fieldShellStyle || workbenchPrimitive ? -35 : -35),
      accentDepthFar: numberParam(ctx.params, 'accentDepthFar', fieldShellStyle || workbenchPrimitive ? 72 : 56),
    } : {}),
    surfaceBlend: numberParam(ctx.params, 'surfaceBlend', accentMode ? accentAggregation === 'field-cell' ? grassPrimitiveFamily === 'field-domain-micro-strand' ? 0.50 : fieldDomainSilhouettePrimitive ? 0.54 : textureMicroCarrier ? 0.34 : textureCarrier ? 0.38 : 0.26 : accentAggregation === 'field-subcell' ? 0.96 : accentAggregation === 'clump' ? workbenchPrimitive ? 0.38 : 0.58 : accentStyle === 'field-fiber-shell-visibility' ? 0.42 : accentAggregation === 'field-near' ? 0.70 : 0.98 : 0),
    accentStyle,
    accentAggregation,
    accentClumpFootprint: numberParam(ctx.params, 'accentFootprint', accentAggregation === 'field-cell' ? grassPrimitiveFamily === 'field-domain-micro-strand' ? 2.4 : fieldDomainSilhouettePrimitive ? 3.2 : textureMicroCarrier ? 1.8 : textureCarrier ? 5.2 : 3.0 : accentAggregation === 'field-subcell' ? 2.2 : accentAggregation === 'clump' ? workbenchPrimitive ? 7.4 : 6.3 : 1),
    accentMicroSourcesPerCell: integerParam(ctx.params, 'accentSourcesPerCell', accentAggregation === 'field-subcell' ? 8 : 1, 1, 12),
    fiberShellVariant,
    grassPrimitiveFamily,
    grassPrimitiveBaseline: grassPrimitiveFamily === 'field-fiber-shell' ? 'none' : 'field-fiber-shell-normal',
    textureVolumeProfile,
    textureVolumeRenderModel,
  });
  shell.drawFrame({
    clear: { r: 0.75, g: 0.84, b: 0.90, a: 1 },
    terrainRect: [bounds.x, bounds.y, bounds.width, bounds.height],
    terrainStyle: 'wide-detail',
    passes: [
      { id: 'battle-grass-field-ground', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => ground.draw(pass) },
      { id: 'battle-grass-field-packed-tilt', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => grass.draw(pass) },
    ],
  });
  const grassStats = grass.stats();
  ctx.status.innerHTML = reportTable({
    route: 'battle-grass-field',
    mode,
    records: grassStats.fieldRecords,
    slopeRejects: grassStats.fieldRejectedSlopeCells,
    packedStride: grassStats.packedStrideFloats,
    instanceBytes: grassStats.instanceBytes,
    submittedTriangles: grassStats.submittedTriangles,
    drawCalls: grassStats.drawCalls,
    meadow: ground.stats().meadow.enabled ? `${ground.stats().meadow.source}:${ground.stats().meadow.fieldCoverage}` : 'off',
    rootMass: ground.stats().meadow.rootMassEnabled ? `${ground.stats().meadow.rootMassCoverage}/${ground.stats().meadow.rootMassStrength}` : 'off',
    bodyDomain: ground.stats().meadow.bodyDomainEnabled ? `${ground.stats().meadow.bodyDomainId}:${ground.stats().meadow.bodyDomainExposedGround}` : 'off',
    accentStyle: grassStats.accentStyle,
    accentAggregation: grassStats.accentAggregation,
    grassPrimitiveFamily: grassStats.grassPrimitiveFamily,
    textureVolumeProfile: grassStats.textureVolumeProfile,
    textureVolumeRenderModel: grassStats.textureVolumeRenderModel,
    grassPrimitiveBaseline: grassStats.grassPrimitiveBaseline,
    grassPrimitiveTexture: grassStats.grassPrimitiveTextureBytes > 0
      ? `${grassStats.grassPrimitiveTextureWidth}x${grassStats.grassPrimitiveTextureHeight} / ${grassStats.grassPrimitiveTextureTiles} tiles`
      : 'none',
    fiberShellVariant: grassStats.fiberShellVariant,
    accentRibbons: grassStats.accentRibbons,
    accentClumps: grassStats.accentClumps,
    accentSourceRecords: grassStats.accentSourceRecords,
    sourceTopology: grassStats.grassPrimitiveSourceTopology,
    sourceCells: grassStats.grassPrimitiveSourceCells,
    sourcesPerCell: grassStats.grassPrimitiveSourcesPerCell,
    fiberShell: grassStats.fiberShellRecords > 0 ? `${grassStats.fiberShellRecords}/${grassStats.fiberShellSourceRecords}` : 'off',
    fiberShellRibbons: grassStats.fiberShellRibbons,
    labProfile: closeLabCameraProfile ?? 'off',
  });
  const groundStats = ground.stats();
  const fieldShellActiveOk = isFieldFiberShellStyle(grassStats.accentStyle)
    && grassStats.accentAggregation === 'field-near'
    && grassStats.fiberShellVariant !== 'off'
    && grassStats.fiberShellSourceRecords > grassStats.fiberShellRecords
    && grassStats.fiberShellRecords === grassStats.accentTufts
    && grassStats.fiberShellRecords === grassStats.tuftInstances
    && grassStats.fiberShellRecords > 80
    && grassStats.fiberShellRecords < grassStats.fieldRecords
    && grassStats.fiberShellRibbons >= grassStats.fiberShellRecords
    && grassStats.fiberShellRibbons === grassStats.accentRibbons
    && grassStats.fiberShellDepthFar > grassStats.fiberShellDepthNear
    && grassStats.fiberShellSubmittedTriangles === grassStats.submittedTriangles;
  const fieldShellOffOk = isFieldFiberShellStyle(grassStats.accentStyle)
    && grassStats.accentAggregation === 'field-near'
    && grassStats.fiberShellVariant === 'off'
    && grassStats.fiberShellSourceRecords > 0
    && grassStats.fiberShellRecords === 0
    && grassStats.accentTufts === 0
    && grassStats.tuftInstances === 0
    && grassStats.drawCalls === 0;
  const clumpAccentOk = !isFieldFiberShellStyle(grassStats.accentStyle)
    && grassStats.accentAggregation === 'clump'
    && grassStats.accentClumps > 0
    && grassStats.accentSourceRecords > grassStats.accentTufts
    && grassStats.accentTufts >= grassStats.accentClumps
    && grassStats.accentTufts <= grassStats.accentClumps * 3
    && (grassStats.accentStyle !== 'soft-root-fiber' || grassStats.accentRibbons > grassStats.accentTufts);
  const fieldCellTextureOk = isTextureGrassPrimitiveFamily(grassStats.grassPrimitiveFamily)
    && grassStats.accentStyle === 'volume-card'
    && grassStats.accentAggregation === 'field-cell'
    && grassStats.accentClumps > 0
    && grassStats.accentTufts >= grassStats.accentClumps
    && grassStats.accentTufts <= grassStats.accentClumps * (grassStats.grassPrimitiveFamily === 'texture-micro-carrier' ? 4 : 2)
    && (grassStats.grassPrimitiveFamily === 'texture-micro-carrier'
      ? grassStats.accentSourceRecords >= grassStats.accentClumps
      : grassStats.accentSourceRecords > grassStats.accentTufts)
    && grassStats.grassPrimitiveSourceRecords === grassStats.accentSourceRecords
    && grassStats.grassPrimitiveRecords === grassStats.accentTufts
    && grassStats.grassPrimitiveClumps === grassStats.accentClumps
    && grassStats.grassPrimitiveTextureWidth > 0
    && grassStats.grassPrimitiveTextureHeight > 0
    && grassStats.grassPrimitiveTextureTiles > 0
    && grassStats.grassPrimitiveTextureBytes > 0
    && (grassStats.grassPrimitiveFamily !== 'texture-micro-carrier' || grassStats.grassPrimitiveMicroCards >= grassStats.accentTufts * 3)
    && grassStats.submittedTriangles > 0
    && grassStats.submittedTriangles < 83200
    && grassStats.drawCalls === 1;
  const fieldDomainSilhouetteOk = closeLab
    && (grassStats.grassPrimitiveFamily === 'field-domain-shell' || grassStats.grassPrimitiveFamily === 'field-domain-micro-strand')
    && (grassStats.grassPrimitiveRepresentation === 'field-owned-body-silhouette' || grassStats.grassPrimitiveRepresentation === 'field-owned-micro-strand-silhouette')
    && grassStats.accentAggregation === 'field-cell'
    && grassStats.grassPrimitiveDomainId === grassStats.grassPrimitiveFamily
    && grassStats.grassPrimitiveDomainSourceAttached === false
    && grassStats.grassPrimitiveDomainGridColumns > 4
    && grassStats.grassPrimitiveDomainGridRows > 4
    && grassStats.grassPrimitiveDomainCells === grassStats.tuftInstances
    && grassStats.grassPrimitiveDomainCells === grassStats.accentTufts
    && grassStats.grassPrimitiveDomainCells > 100
    && grassStats.grassPrimitiveDomainTiles >= grassStats.grassPrimitiveDomainCells
    && grassStats.grassPrimitiveDomainOverlap >= 1
    && grassStats.grassPrimitiveDomainCoverageAvg > 0.45
    && grassStats.grassPrimitiveDomainCoverageMedian > 0.45
    && grassStats.grassPrimitiveDomainExposedGround < 0.40
    && grassStats.grassPrimitiveDomainStrandsPerCell > 0
    && grassStats.grassPrimitiveDomainMicroStrands === grassStats.grassPrimitiveDomainCells * grassStats.grassPrimitiveDomainStrandsPerCell
    && grassStats.grassPrimitiveDomainStrandWidthMin >= 0
    && grassStats.grassPrimitiveDomainStrandWidthMax >= grassStats.grassPrimitiveDomainStrandWidthMin
    && grassStats.grassPrimitiveDomainStrandHeightMax >= grassStats.grassPrimitiveDomainStrandHeightMin
    && grassStats.grassPrimitiveDomainSubmittedTriangles === grassStats.submittedTriangles
    && grassStats.grassPrimitiveDomainGeometryBytes > 0
    && grassStats.grassPrimitiveTextureBytes === 0
    && grassStats.submittedTriangles > 0
    && grassStats.submittedTriangles < 420000
    && grassStats.drawCalls === 1;
  const bodyDomainOk = closeLab
    && groundStats.meadow.bodyDomainEnabled === true
    && (groundStats.meadow.bodyDomainId === 'field-strand-material' || groundStats.meadow.bodyDomainId === 'field-continuous-strand-texture')
    && groundStats.meadow.bodyDomainMaterialOnly === true
    && groundStats.meadow.bodyDomainSubmittedTriangles === 0
    && groundStats.meadow.bodyDomainTextureBytes > 0
    && groundStats.meadow.bodyDomainMaterialBytes === groundStats.meadow.bodyDomainTextureBytes
    && groundStats.meadow.bodyDomainSourceAttached === false
    && (groundStats.meadow.bodyDomainId !== 'field-continuous-strand-texture' || (
      groundStats.meadow.bodyDomainRepresentation === 'continuous-strand-texture'
      && groundStats.meadow.bodyDomainFiberFrequency >= 1
    ))
    && groundStats.meadow.bodyDomainCoverageAvg > 0.55
    && groundStats.meadow.bodyDomainCoverageMedian > 0.55
    && groundStats.meadow.bodyDomainExposedGround < 0.18
    && grassStats.accentTufts === 0
    && grassStats.bladeInstances === 0
    && grassStats.submittedTriangles === 0
    && grassStats.drawCalls === 0;
  const closeLabOk = closeLab
    && grassStats.fieldRecords > 100
    && (bodyDomainOk || fieldDomainSilhouetteOk || (
      grassStats.accentStyle !== 'tuft'
      && grassStats.tuftInstances > 20
      && (grassStats.accentAggregation === 'field-subcell'
        ? grassStats.tuftInstances > grassStats.fieldRecords
        : grassStats.tuftInstances <= grassStats.fieldRecords)
      && grassStats.submittedTriangles > 0
      && grassStats.submittedTriangles < (grassStats.accentAggregation === 'field-subcell' ? 1500000 : 83200)
      && grassStats.drawCalls === 1
    ))
    && groundStats.meadow.source === 'field'
    && groundStats.meadow.fieldCoverage > 0.50
    && groundStats.meadow.rootMassEnabled === true
    && groundStats.meadow.rootMassCoverage > 0.05;
  const ok = closeLab
    ? closeLabOk
    : mode === 'field-meadow'
    ? grassStats.fieldRecords > 0 && grassStats.bladeInstances === 0 && grassStats.drawCalls === 0 && groundStats.meadow.source === 'field' && groundStats.meadow.fieldCoverage > 0.50
    : accentMode
      ? grassStats.fieldRecords > 0 && grassStats.accentStyle !== 'tuft' && (fieldShellActiveOk || fieldShellOffOk || clumpAccentOk || fieldCellTextureOk) && grassStats.tuftInstances === grassStats.accentTufts && grassStats.tuftInstances < grassStats.fieldRecords && (grassStats.fiberShellVariant === 'off' || grassStats.bladeInstances >= grassStats.tuftInstances) && (grassStats.fiberShellVariant === 'off' || grassStats.drawCalls === 1) && groundStats.meadow.source === 'field' && groundStats.meadow.fieldCoverage > 0.50 && groundStats.meadow.rootMassEnabled === true && groundStats.meadow.rootMassCoverage > 0.05
    : grassStats.fieldRecords > 0 && grassStats.fieldRejectedSlopeCells > 0 && grassStats.drawCalls === 1;
  publish('battle-grass-field', ok, {
    route: 'battle-grass-field',
    mode,
    camera,
    focus,
    bounds,
    environment: battleEnvironmentStats(environment),
    grid: { w: grid.w, h: grid.h, cell: grid.cell, ox: grid.ox, oy: grid.oy },
    field: snapshot.stats,
    grass: grassStats,
    ground: groundStats,
    lab: closeLab ? {
      profile: 'foreground-close-lab',
      contract: closeLabContract(closeLabCameraProfile),
      cameraProfile: closeLabCameraProfile,
      cropPurpose: closeLabCropPurpose(closeLabCameraProfile),
      calibration: closeLabProfile?.calibration ?? 'none',
      foregroundWorldUnitsPerPixel: Number((1 / camera.zoom).toFixed(5)),
      reviewWindows: closeLabProfile?.reviewWindows ?? FOREGROUND_CLOSE_LAB_WINDOWS,
      frozenInputs: {
        terrain: 'battle-grass-field-slope-grid',
        palette: 'green-grass',
        lighting: environment.id,
        seed: 0x31b2,
        meadow: 'field-owned',
        rootMass: 'enabled',
        environment: battleEnvironmentStats(environment),
      },
    } : undefined,
    depth: shell.stats().depth,
    framePhases: shell.stats().phases,
  });
}

const FOREGROUND_CLOSE_LAB_WINDOWS = {
  closeHero: { x: 0.08, y: 0.70, width: 0.84, height: 0.24 },
  closeTight2x: { x: 0.28, y: 0.75, width: 0.44, height: 0.16 },
  closeTight4x: { x: 0.41, y: 0.79, width: 0.18, height: 0.10 },
  transition: { x: 0.14, y: 0.48, width: 0.72, height: 0.18 },
  midMass: { x: 0.18, y: 0.31, width: 0.64, height: 0.15 },
};

type ForegroundCloseLabCameraProfile = 'b4b1-current' | 'scale-repair-low' | 'scale-repair-oblique' | 'b4b1a0-test-env';

const FOREGROUND_CLOSE_LAB_CAMERA_PROFILES: Record<ForegroundCloseLabCameraProfile, {
  camera: { x: number; y: number; zoom: number; pitch: number; yaw: number; perspective: number };
  reviewWindows: typeof FOREGROUND_CLOSE_LAB_WINDOWS;
  calibration: string;
}> = {
  'b4b1-current': {
    camera: { x: 0, y: -36, zoom: 104, pitch: 0.78, yaw: -0.08, perspective: 0.020 },
    reviewWindows: FOREGROUND_CLOSE_LAB_WINDOWS,
    calibration: 'none',
  },
  'scale-repair-low': {
    camera: { x: 0, y: -47, zoom: 155, pitch: 0.92, yaw: -0.06, perspective: 0.030 },
    reviewWindows: {
      closeHero: { x: 0.08, y: 0.60, width: 0.84, height: 0.30 },
      closeTight2x: { x: 0.25, y: 0.66, width: 0.50, height: 0.22 },
      closeTight4x: { x: 0.39, y: 0.72, width: 0.22, height: 0.13 },
      transition: { x: 0.12, y: 0.36, width: 0.76, height: 0.20 },
      midMass: { x: 0.16, y: 0.18, width: 0.68, height: 0.16 },
    },
    calibration: 'neutral-scale-guides',
  },
  'scale-repair-oblique': {
    camera: { x: 0, y: -51, zoom: 132, pitch: 1.04, yaw: -0.12, perspective: 0.042 },
    reviewWindows: {
      closeHero: { x: 0.08, y: 0.58, width: 0.84, height: 0.32 },
      closeTight2x: { x: 0.25, y: 0.65, width: 0.50, height: 0.23 },
      closeTight4x: { x: 0.39, y: 0.72, width: 0.22, height: 0.13 },
      transition: { x: 0.12, y: 0.34, width: 0.76, height: 0.20 },
      midMass: { x: 0.16, y: 0.15, width: 0.68, height: 0.16 },
    },
    calibration: 'neutral-scale-guides',
  },
  'b4b1a0-test-env': {
    camera: { x: 0, y: -50, zoom: 178, pitch: 0.96, yaw: -0.045, perspective: 0.032 },
    reviewWindows: {
      closeHero: { x: 0.08, y: 0.61, width: 0.84, height: 0.254 },
      closeTight2x: { x: 0.24, y: 0.64, width: 0.52, height: 0.22 },
      closeTight4x: { x: 0.38, y: 0.71, width: 0.24, height: 0.13 },
      transition: { x: 0.12, y: 0.34, width: 0.76, height: 0.20 },
      midMass: { x: 0.16, y: 0.16, width: 0.68, height: 0.16 },
    },
    calibration: 'test-environment-review-windows',
  },
};

function closeLabContract(profile: ForegroundCloseLabCameraProfile | undefined): string {
  if (profile === 'b4b1-current') return '03B4C5B4B1';
  if (profile === 'b4b1a0-test-env') return '03B4C5B4B1A0';
  return '03B4C5B4B1R';
}

function closeLabCropPurpose(profile: ForegroundCloseLabCameraProfile | undefined): string {
  if (profile === 'b4b1-current') return 'scale-only-not-visual-acceptance';
  if (profile === 'b4b1a0-test-env') return 'test-environment-comparability-not-body-acceptance';
  return 'scale-perspective-repair-not-grass-acceptance';
}

function buildGrassFieldSlopeGrid(): BattleTerrainGrid {
  const w = 42;
  const h = 34;
  const cell = 4;
  const ox = -w * cell * 0.5;
  const oy = -h * cell * 0.5;
  const tint = new Uint8Array(w * h);
  const speed = new Float32Array(w * h);
  const height = new Float32Array(w * h);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const x = ox + (cx + 0.5) * cell;
      const y = oy + (cy + 0.5) * cell;
      const ridge = smoothUnit((x - 6) / 9);
      const roll = Math.sin(x * 0.055) * 2.1 + Math.cos(y * 0.050) * 1.7;
      const cross = Math.sin((x + y) * 0.035) * 0.9;
      const cliffLift = ridge * ridge * 62;
      const z = roll + cross + cliffLift;
      const i = cy * w + cx;
      const water = y < oy + 15 && x > -12 && x < 36;
      tint[i] = water ? 1 : 0;
      speed[i] = water ? 0 : 1;
      height[i] = z;
    }
  }
  return { w, h, cell, ox, oy, tint, speed, height };
}

// Scan the field for the spot with the steepest local slope, so a soldier block
// planted there visibly climbs the relief.
function steepestSpot(field: TerrainHeightField, ox: number, oy: number, w: number, h: number, cell: number) {
  let best = { x: 0, y: 0, slope: -1 };
  const x0 = ox + 200;
  const x1 = ox + w * cell - 200;
  const y0 = oy + 200;
  const y1 = oy + h * cell - 200;
  for (let x = x0; x < x1; x += 70) {
    for (let y = y0; y < y1; y += 70) {
      const dz = Math.abs(terrainHeightAt(field, x + 40, y) - terrainHeightAt(field, x - 40, y))
        + Math.abs(terrainHeightAt(field, x, y + 40) - terrainHeightAt(field, x, y - 40));
      if (dz > best.slope) best = { x, y, slope: dz };
    }
  }
  return best;
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
  const groundCues = new BattleGroundCuePass(shell);
  const minimap = new BattleMinimapPass(shell);
  const selectedUnit = firstPlayerUnit(game, wasm.memory);
  const selectedVisual = unitVisual(game, wasm.memory, selectedUnit);
  groundCues.upload(selectedVisual ? selectedUnitGroundCueVertices(selectedVisual) : new Float32Array());
  minimap.upload({
    world: bounds,
    camera: cameraWorldBounds(bounds, viewW, viewH, zoom),
    units: minimapUnits(game, wasm.memory, selectedUnit),
  });
  pipeline.upload(live.instances, { phaseOffset: 0 });
  shell.drawFrame({
    clear: { r: 0.74, g: 0.83, b: 0.90, a: 1 },
    terrainRect: [bounds.cx - Math.max(68, bounds.w * 0.65), bounds.cy - Math.max(36, bounds.h * 0.65), Math.max(136, bounds.w * 1.3), Math.max(72, bounds.h * 1.3)],
    passes: [
      { id: 'battle-live-terrain-underpaint', role: 'background-underpaint', phase: 'background', draw: (pass) => terrain.draw(pass) },
      { id: 'battle-live-terrain-props', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => terrain.drawProps(pass) },
      { id: 'battle-live-crowd', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => pipeline.draw(pass) },
      { id: 'battle-live-ground-cues', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => groundCues.draw(pass) },
      { id: 'battle-live-minimap', role: 'overlay-ui', phase: 'overlay', draw: (pass) => minimap.draw(pass) },
    ],
  });
  const groundCueStats = groundCues.stats();
  const minimapStats = minimap.stats();
  const shellStats = shell.stats();
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
    groundCueLines: groundCueStats.lineSegments,
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
    groundCues: groundCueStats,
    minimap: minimapStats,
    framePhases: shellStats.phases,
    depth: shellStats.depth,
    cameraContract: pipeline.stats().cameraContract,
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
  const groundCues = new BattleGroundCuePass(shell);
  const minimap = new BattleMinimapPass(shell);
  const host = ctx.canvas.parentElement ?? ctx.root;
  let selectedUnit = firstPlayerUnit(game, wasm.memory);
  const ui = new BattleUiLayer(host, (unit) => {
    selectedUnit = unit;
    draw();
  });

  pipeline.upload(live.instances, { phaseOffset: 0 });
  const draw = () => {
    const selectedVisual = unitVisual(game, wasm.memory, selectedUnit);
    groundCues.upload(selectedVisual ? selectedUnitGroundCueVertices(selectedVisual) : new Float32Array());
    minimap.upload({
      world: bounds,
      camera: cameraWorldBounds(bounds, viewW, viewH, zoom),
      units: minimapUnits(game, wasm.memory, selectedUnit),
    });
    shell.drawFrame({
      clear: { r: 0.74, g: 0.83, b: 0.90, a: 1 },
      terrainRect: [bounds.cx - Math.max(68, bounds.w * 0.65), bounds.cy - Math.max(36, bounds.h * 0.65), Math.max(136, bounds.w * 1.3), Math.max(72, bounds.h * 1.3)],
      passes: [
        { id: 'battle-ui-terrain-underpaint', role: 'background-underpaint', phase: 'background', draw: (pass) => terrain.draw(pass) },
        { id: 'battle-ui-terrain-props', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => terrain.drawProps(pass) },
        { id: 'battle-ui-crowd', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => pipeline.draw(pass) },
        { id: 'battle-ui-ground-cues', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => groundCues.draw(pass) },
        { id: 'battle-ui-minimap', role: 'overlay-ui', phase: 'overlay', draw: (pass) => minimap.draw(pass) },
      ],
    });
    ui.render(buildBattleUiModel(game, wasm.memory, {
      selectedUnits: selectedUnit >= 0 ? [selectedUnit] : [],
      tick: ticks,
      paused: true,
      pursueOn: false,
      fireAtWill: true,
      renderer: 'raw WebGPU battle + retained DOM UI',
    }));
  };
  draw();

  const groundCueStats = groundCues.stats();
  const minimapStats = minimap.stats();
  const uiStats = ui.stats();
  const shellStats = shell.stats();
  ctx.status.innerHTML = reportTable({
    route: 'battle-ui',
    mode,
    ticks,
    soldiers: live.stats.written,
    units: live.stats.units,
    selectedUnit,
    groundCueLines: groundCueStats.lineSegments,
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
    groundCues: groundCueStats,
    minimap: minimapStats,
    framePhases: shellStats.phases,
    depth: shellStats.depth,
    ui: uiStats,
    cameraContract: pipeline.stats().cameraContract,
    drawCalls: pipeline.stats().drawCalls,
    clips: pipeline.stats().clips,
  });
}

// The only place 20 / 30 / 40 cards can be seen — the live game is ~5v5, too few
// to exercise the row wrapping. Mounts the real shared `UnitCards` over synthetic
// rosters (no wasm), so the grid and `<img>` swap reach this harness for free.
// `?count=` sets the roster; the band width comes from the viewport, so drive
// wide/narrow by sizing the page.
async function routeCardBar(ctx: LabContext) {
  const count = Math.max(1, Math.min(60, Number(ctx.params.get('count') ?? 20)));
  const band = el('div', 'renderer-unitcards');
  band.id = 'unitcards';
  ctx.root.appendChild(band);

  // Reuse the live "window too small" gate (index.html's CSS survives the lab
  // mount, but its element doesn't — recreate it) so the scene can exercise the
  // min-window placeholder headlessly.
  const tooSmall = el('div', '');
  tooSmall.id = 'viewport-too-small';
  tooSmall.innerHTML = '<div class="vts-panel"><h2>Window too small</h2><p>The battle needs a window of at least 1180 &times; 640. Please enlarge the window to play.</p></div>';
  ctx.root.appendChild(tooSmall);
  installViewportGate(tooSmall);

  let lastSelect: { unit: number; additive: boolean } | null = null;
  const onSelect = (unit: number, additive: boolean) => {
    lastSelect = { unit, additive };
    (window as unknown as { __cardBarLastSelect?: unknown }).__cardBarLastSelect = lastSelect;
  };
  // No minimap in this harness, so reserve only a bare side margin (not the live
  // game's minimap clearance) — the demo shows the bar at its full width.
  const cards = new UnitCardsReact(band, onSelect, 12);

  // Synthetic roster: cycle every class so portraits, names, and faction accent
  // all vary; live-ish bar values so the strip reads like a real fight.
  const inits: UnitCardInit[] = Array.from({ length: count }, (_, i) => ({
    unit: i,
    cls: i % CLASS_NAMES.length,
    team: 0,
    name: CLASS_NAMES[i % CLASS_NAMES.length],
  }));
  const states: UnitCardState[] = inits.map((_, i) => ({
    alive: 180 - (i * 13) % 170,
    total: 180,
    cohesion: 0.55 + ((i * 7) % 45) / 100,
    morale: 0.5 + ((i * 11) % 50) / 100,
    stamina: 0.6 + ((i * 5) % 40) / 100,
    routing: i % 9 === 4,
    selected: i === 0,
  }));
  cards.build(inits);
  cards.update(states);

  const grid = (window as unknown as { __cardGrid?: Record<string, number> }).__cardGrid ?? {};
  ctx.status.innerHTML = reportTable({
    route: 'card-bar',
    count,
    rows: grid.rows,
    cols: grid.cols,
    cardW: grid.cardW,
    degenerate: grid.degenerate,
    bandWidth: band.clientWidth,
  });
  publish('card-bar', true, { count, grid, lastSelect, bandWidth: band.clientWidth });
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
  const cameraForPick = (): RendererBattlePickCamera => ({
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
  const groundCues = new BattleGroundCuePass(shell);
  const minimap = new BattleMinimapPass(shell);
  const host = ctx.canvas.parentElement ?? ctx.root;
  let selectedUnits = [firstPlayerUnit(game, wasm.memory)].filter((unit) => unit >= 0);
  let lastPick = { kind: 'initial', unit: selectedUnits[0] ?? -1, worldX: 0, worldY: 0, distance: 0, boxUnits: 0 };
  let lastOrder = { kind: 'none', unit: -1, worldX: 0, worldY: 0, facing: 0, hasTarget: false };
  let frozen = true;
  const ui = new BattleUiLayer(host, (unit, additive) => {
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
    groundCues.upload(selectedVisual ? selectedUnitGroundCueVertices(selectedVisual) : new Float32Array());
    minimap.upload({
      world: bounds,
      camera: cameraWorldBounds(bounds, viewW, viewH, camera.zoom),
      units: minimapUnits(game, wasm.memory, selectedUnit),
    });
    shell.drawFrame({
      clear: { r: 0.74, g: 0.83, b: 0.90, a: 1 },
      terrainRect: [bounds.cx - Math.max(68, bounds.w * 0.65), bounds.cy - Math.max(36, bounds.h * 0.65), Math.max(136, bounds.w * 1.3), Math.max(72, bounds.h * 1.3)],
      passes: [
        { id: 'battle-input-terrain-underpaint', role: 'background-underpaint', phase: 'background', draw: (pass) => terrain.draw(pass) },
        { id: 'battle-input-terrain-props', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => terrain.drawProps(pass) },
        { id: 'battle-input-crowd', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => pipeline.draw(pass) },
        { id: 'battle-input-ground-cues', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => groundCues.draw(pass) },
        { id: 'battle-input-minimap', role: 'overlay-ui', phase: 'overlay', draw: (pass) => minimap.draw(pass) },
      ],
    });
    ui.render(buildBattleUiModel(game, wasm.memory, {
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
      groundCues: groundCues.stats(),
      minimap: minimap.stats(),
      framePhases: shell.stats().phases,
      depth: shell.stats().depth,
      ui: ui.stats(),
      cameraContract: pipeline.stats().cameraContract,
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
      groundCueLines: stats.groundCues.lineSegments,
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
      camera: (next: Partial<RendererBattlePickCamera>) => {
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

// The open-sea plane route (originally the Slice 1 technique bake-off, now the
// single Gerstner production field). One tessellated plane at the battle horizon
// camera (or the campaign camera for the perf gate), driven by the WaterFieldSource
// seam. `?preset=golden|dusk|overcast`, `?sunAz`/`?sunEl`, and `?t=<seconds>` (freeze
// the clock for snapshots) are the dials; this route is the shared renderer for every
// water look scene.
async function routeWaterBakeoff(ctx: LabContext) {
  const presetName = ctx.params.get('preset') ?? 'golden';
  const env: WaterEnvironment = WATER_ENVIRONMENTS[presetName as WaterEnvironment['id']] ?? WATER_ENVIRONMENTS.golden;
  const camName = ctx.params.get('cam') === 'campaign' ? 'campaign' : 'battle';
  // Sun comes from the preset; `sunAz`/`sunEl` override it (e.g. the glint scene
  // sweeps the azimuth to prove the streak tracks the sun).
  const sunAz = ctx.params.has('sunAz') ? numberParam(ctx.params, 'sunAz', env.sunAzimuth) : env.sunAzimuth;
  const sunEl = ctx.params.has('sunEl') ? numberParam(ctx.params, 'sunEl', env.sunElevation) : env.sunElevation;
  const fixedT = ctx.params.has('t') ? numberParam(ctx.params, 't', 0) : null;

  // Slice 02 keystone: the water route runs on the real 3D perspective camera and a
  // reverse-Z depth32float buffer — the finite plane now meets a true straight
  // horizon instead of the fake-projection dome/streak wedge.
  const shell = await createFrameShell(ctx.canvas, { enableGpuTimer: true, reverseZ: true });

  // An oblique framing that looks out to sea toward +y (yaw −π/2 puts the eye south
  // of the target, looking north over the plane's 1100-unit span). Infinite far
  // plane → the ground plane's vanishing line is the horizon. camera3d owns the
  // matrices; the legacy scalars only feed the water shader's distance-haze key,
  // which we anchor at the eye's ground footprint so haze grows with view distance.
  // Pitch is deliberately not so grazing that the near sea turns to a solid glint
  // sheet — the look scenes (foam/albedo) read the material, not a specular wall.
  // The framing is URL-tunable (pitch/dist/fov/targetY) for the eyeball checkpoint.
  const base = camName === 'campaign'
    ? { targetY: 200, distance: 240, pitch: 0.38, fovY: 0.70 }
    : { targetY: 140, distance: 190, pitch: 0.22, fovY: 0.78 };
  const cam3d: Camera3DParams = {
    target: [0, numberParam(ctx.params, 'targetY', base.targetY), 0],
    distance: numberParam(ctx.params, 'dist', base.distance),
    pitch: numberParam(ctx.params, 'pitch', base.pitch),
    yaw: -Math.PI / 2,
    fovY: numberParam(ctx.params, 'fov', base.fovY),
    aspect: 1000 / 600,
    near: 1,
  };
  const eye = eyePosition(cam3d);
  shell.setCamera({ x: eye[0], y: eye[1], zoom: 1, pitch: cam3d.pitch, yaw: cam3d.yaw, camera3d: cam3d });
  shell.setSun(sunAz, sunEl);

  // Sky clear from the preset's haze colour so the sea meets a matching horizon
  // (Slice 6 will grade the sea-to-sky seam properly).
  const clear: GPUColor = { r: env.hazeColor[0], g: env.hazeColor[1], b: env.hazeColor[2], a: 1 };

  // Gerstner is the one production water field (it won the Slice 1 bake-off; the IFFT
  // loser was deleted in Slice 11). This route renders the open-sea plane and stays
  // the shared renderer for every look scene (silhouette/foam/glint/albedo/haze/rhythm).
  const field = createWaterField(shell);
  const plane = new WaterPlanePass(shell, field, undefined, env, { real: true });

  const drawAt = (t: number) => {
    shell.setTime(t);
    shell.drawFrame({
      clear,
      precompute: (enc) => field.ensureFrame(enc, t),
      passes: [{
        id: 'water-bakeoff-plane', role: 'world-opaque', phase: 'world-depth', depth: 'read-write',
        draw: (pass) => plane.draw(pass),
      }],
    });
  };

  const publishStats = () => {
    const s = shell.stats();
    publish('water-bakeoff', true, {
      route: 'water-bakeoff',
      tech: field.id,
      compare: false,
      preset: presetName,
      camera: camName,
      timestampQuery: shell.info.caps.timestampQuery,
      gpuTimeMs: s.gpuTimeMs,
      fixedTime: fixedT,
      fieldResolution: field.stats().fieldResolution,
      cameraContract: s.cameraContract,
      // Slice 02: publish the depth identity + world-phase depth mode so a scene
      // can prove the water route is on the reverse-Z depth32float path.
      depth: s.depth,
      phases: s.phases,
    });
    ctx.status.innerHTML = reportTable({
      route: 'water-bakeoff',
      tech: field.id,
      camera: camName,
      preset: presetName,
      'GPU time (ms)': s.gpuTimeMs === null ? 'pending' : s.gpuTimeMs.toFixed(3),
    });
  };

  const t0 = performance.now();
  const tick = () => {
    drawAt(fixedT ?? (performance.now() - t0) / 1000);
    publishStats();
    requestAnimationFrame(tick);
  };
  tick();
}

// Slice 01 deliverable: a pure-CPU, WebGPU-free probe for the real 3D camera. It
// draws a world ground grid, a unit cube, and a formation of dots projected
// through `camera3d` on a 2D canvas — so perspective convergence and the
// project→unproject round-trip are inspectable even where headless/hardware
// WebGPU renders blank. Rig params come from the URL (?pitch&fov&distance&yaw) so
// the framing is sweepable without slider UI.
function routeCamera3dProbe(ctx: LabContext) {
  ctx.canvas.style.display = 'none';
  const W = 900, H = 600;
  const canvas = el('canvas', 'camera3d-probe') as HTMLCanvasElement;
  canvas.width = W;
  canvas.height = H;
  canvas.style.display = 'block';
  // Take the hidden WebGPU canvas's slot in the stage flex row (before it, so the
  // status panel stays on the right) rather than appending after the panel.
  ctx.canvas.before(canvas);
  const g = canvas.getContext('2d')!;

  const cam: Camera3DParams = {
    target: [numberParam(ctx.params, 'targetX', 0), numberParam(ctx.params, 'targetY', 0), numberParam(ctx.params, 'targetZ', 0)],
    distance: numberParam(ctx.params, 'distance', 260),
    pitch: numberParam(ctx.params, 'pitch', 0.5),
    yaw: numberParam(ctx.params, 'yaw', 0),
    fovY: numberParam(ctx.params, 'fov', 0.6),
    aspect: W / H,
    near: 1,
    far: numberParam(ctx.params, 'far', 6000),
  };

  const toPixel = (world: [number, number, number]): [number, number] | null => {
    const { ndc, clipW } = projectPoint(cam, world);
    if (clipW <= 0) return null; // behind the eye
    return [(ndc[0] * 0.5 + 0.5) * W, (0.5 - ndc[1] * 0.5) * H];
  };
  const segment = (a: [number, number, number], b: [number, number, number], style: string) => {
    const pa = toPixel(a), pb = toPixel(b);
    if (!pa || !pb) return;
    g.strokeStyle = style;
    g.beginPath();
    g.moveTo(pa[0], pa[1]);
    g.lineTo(pb[0], pb[1]);
    g.stroke();
  };

  g.fillStyle = '#0b1622';
  g.fillRect(0, 0, W, H);

  // Ground grid on z = 0.
  const EXT = 300, STEP = 30;
  for (let x = -EXT; x <= EXT; x += STEP) segment([x, -EXT, 0], [x, EXT, 0], '#24405c');
  for (let y = -EXT; y <= EXT; y += STEP) segment([-EXT, y, 0], [EXT, y, 0], '#24405c');

  // Unit cube (side 40) sitting on the ground at the target, to read depth/scale.
  const s = 20;
  const cx = cam.target[0], cy = cam.target[1];
  const corners: [number, number, number][] = [
    [cx - s, cy - s, 0], [cx + s, cy - s, 0], [cx + s, cy + s, 0], [cx - s, cy + s, 0],
    [cx - s, cy - s, 2 * s], [cx + s, cy - s, 2 * s], [cx + s, cy + s, 2 * s], [cx - s, cy + s, 2 * s],
  ];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const [a, b] of edges) segment(corners[a], corners[b], '#e8c887');

  // A formation of dots; also measures the project→unproject round-trip.
  let maxErr = 0, drawn = 0;
  for (let fx = -120; fx <= 120; fx += 24) {
    for (let fy = -120; fy <= 120; fy += 24) {
      const world: [number, number, number] = [fx, fy, 0];
      const px = toPixel(world);
      if (!px) continue;
      drawn++;
      const { ndc } = projectPoint(cam, world);
      const back = unprojectToPlaneZ(cam, ndc[0], ndc[1], 0);
      if (back) maxErr = Math.max(maxErr, Math.hypot(back[0] - fx, back[1] - fy, back[2]));
      g.fillStyle = '#6cc6ff';
      g.beginPath();
      g.arc(px[0], px[1], 3, 0, Math.PI * 2);
      g.fill();
    }
  }

  const eye = eyePosition(cam);
  ctx.status.innerHTML = reportTable({
    route: 'camera3d-probe',
    'pitch / fov / distance / yaw': `${cam.pitch.toFixed(2)} / ${cam.fovY.toFixed(2)} / ${cam.distance.toFixed(0)} / ${cam.yaw.toFixed(2)}`,
    'eye (world)': eye.map((v) => v.toFixed(1)).join(', '),
    'dots projected': drawn,
    'max round-trip error': maxErr.toExponential(2),
  });
  publish('camera3d-probe', true, {
    route: 'camera3d-probe',
    params: { pitch: cam.pitch, fovY: cam.fovY, distance: cam.distance, yaw: cam.yaw, aspect: cam.aspect },
    eye,
    dotsProjected: drawn,
    maxRoundTripError: maxErr,
  });
}

async function createConfiguredShell(canvas: HTMLCanvasElement, camera: { x: number; y: number; zoom: number; pitch?: number; yaw?: number; perspective?: number }, environment: BattleEnvironment = resolveBattleEnvironment('golden-hour')) {
  const shell = await createFrameShell(canvas);
  shell.setCamera(camera);
  applyBattleEnvironment(shell, environment);
  return shell;
}

function clearForEnvironment(environment: BattleEnvironment) {
  const [r, g, b, a] = environment.clear;
  return { r, g, b, a };
}

function grassModelShotConfig(gate: 'tuft' | 'patch'): {
  camera: { x: number; y: number; zoom: number; pitch: number; yaw: number; perspective: number };
  bounds: BattleGrassBounds;
  params: BattleGrassParams;
} {
  if (gate === 'patch') {
    return {
      camera: { x: 0, y: -0.6, zoom: 88, pitch: 0.74, yaw: -0.10, perspective: 0.020 },
      bounds: { x: -1.2, y: -0.9, width: 2.4, height: 1.8 },
      params: {
        seed: 0x2244,
        density: 10.5,
        maxTufts: 32,
        bladesPerTuft: 9,
        bladeHeight: 0.70,
        bladeWidth: 0.054,
        bend: 0.24,
        spread: 0.14,
        windPhase: 0.35,
        windStrength: 0.055,
      },
    };
  }
  return {
    camera: { x: 0, y: -0.08, zoom: 178, pitch: 0.84, yaw: -0.06, perspective: 0.024 },
    bounds: { x: -0.32, y: -0.28, width: 0.64, height: 0.56 },
    params: {
      seed: 0x1144,
      density: 4,
      maxTufts: 1,
      bladesPerTuft: 13,
      bladeHeight: 0.82,
      bladeWidth: 0.068,
      bend: 0.30,
      spread: 0.18,
      windPhase: 0.20,
      windStrength: 0.045,
    },
  };
}

function flatFieldFor(bounds: BattleGrassBounds): TerrainHeightField {
  return flatHeightField(
    bounds.x,
    bounds.y,
    Math.max(1, Math.ceil(bounds.width)),
    Math.max(1, Math.ceil(bounds.height)),
    1,
    'meters',
  );
}

async function createSkinnedPipeline(shell: RawFrameShell, accent: [number, number, number], vat?: Awaited<ReturnType<typeof loadPlaceholderVat>>, environment = resolveBattleEnvironment('golden-hour')) {
  return new SkinnedCrowdPipeline(shell, createPlaceholderSoldierMeshes(accent), vat ?? await loadPlaceholderVat(), undefined, {
    lighting: skinnedLightingForBattleEnvironment(environment),
  });
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

function foregroundCloseLabCameraProfileParam(params: URLSearchParams, key: string, fallback: ForegroundCloseLabCameraProfile): ForegroundCloseLabCameraProfile {
  const raw = params.get(key);
  return raw === 'b4b1-current' || raw === 'scale-repair-low' || raw === 'scale-repair-oblique' || raw === 'b4b1a0-test-env' ? raw : fallback;
}

function grassAccentStyleParam(params: URLSearchParams, key: string, fallback: GrassAccentStyle): GrassAccentStyle {
  const raw = params.get(key);
  return raw === 'root-shadow'
    || raw === 'soft-root-mass'
    || raw === 'soft-root-fiber'
    || raw === 'field-fiber-shell'
    || raw === 'field-fiber-shell-visibility'
    || raw === 'field-fiber-body'
    || raw === 'field-fiber-bundle'
    || raw === 'field-strand-mat'
    || raw === 'field-woven-mat'
    || raw === 'field-domain-shell'
    || raw === 'field-domain-micro-strand'
    || raw === 'alpha-impostor'
    || raw === 'billboard-cluster'
    || raw === 'volume-card'
    || raw === 'fiber-ribbon'
    || raw === 'hybrid-root-fiber'
    || raw === 'tuft'
    ? raw
    : fallback;
}

function grassAccentAggregationParam(params: URLSearchParams, key: string, fallback: GrassAccentAggregation): GrassAccentAggregation {
  const raw = params.get(key);
  return raw === 'clump' || raw === 'record' || raw === 'field-cell' || raw === 'field-near' || raw === 'field-subcell' ? raw : fallback;
}

function fiberShellVariantParam(params: URLSearchParams, key: string, fallback: GrassFiberShellVariant): GrassFiberShellVariant {
  const raw = params.get(key);
  return raw === 'off' || raw === 'normal' || raw === 'visibility' || raw === 'width' || raw === 'lift' || raw === 'view-thickness' ? raw : fallback;
}

function textureVolumeProfileParam(params: URLSearchParams, key: string, fallback: TextureVolumeProfile): TextureVolumeProfile {
  const raw = params.get(key);
  return raw === 'current' || raw === 'seated-soft' || raw === 'overlap-stagger' || raw === 'broken-lattice' ? raw : fallback;
}

function textureVolumeRenderModelParam(params: URLSearchParams, key: string, fallback: TextureVolumeRenderModel): TextureVolumeRenderModel {
  const raw = params.get(key);
  return raw === 'opaque-card'
    || raw === 'alpha-cutout'
    || raw === 'hard-cutout'
    || raw === 'dither-cutout'
    || raw === 'sparse-dither'
    ? raw
    : fallback;
}

function bodyDomainIdParam(params: URLSearchParams, key: string, fallback: 'field-strand-material' | 'field-continuous-strand-texture'): 'field-strand-material' | 'field-continuous-strand-texture' {
  const raw = params.get(key);
  if (raw === 'field-strand-material' || raw === 'field-continuous-strand-texture') return raw;
  return fallback;
}

function grassPrimitiveFamilyParam(params: URLSearchParams, key: string, fallback: GrassPrimitiveFamily): GrassPrimitiveFamily {
  const raw = params.get(key);
  return raw === 'legacy-tuft'
    || raw === 'root-shadow'
    || raw === 'soft-root-mass'
    || raw === 'soft-root-fiber'
    || raw === 'field-fiber-shell'
    || raw === 'field-fiber-body'
    || raw === 'field-fiber-bundle'
    || raw === 'field-strand-mat'
    || raw === 'field-woven-mat'
    || raw === 'field-domain-shell'
    || raw === 'field-domain-micro-strand'
    || raw === 'alpha-impostor'
    || raw === 'billboard-cluster'
    || raw === 'volume-card'
    || raw === 'texture-volume'
    || raw === 'texture-carrier'
    || raw === 'texture-micro-carrier'
    || raw === 'fiber-ribbon'
    || raw === 'hybrid-root-fiber'
    ? raw
    : fallback;
}

function accentStyleForPrimitiveFamily(family: GrassPrimitiveFamily, fiberShellVariant: GrassFiberShellVariant): GrassAccentStyle {
  if (family === 'field-fiber-shell') return fiberShellVariant === 'visibility' ? 'field-fiber-shell-visibility' : 'field-fiber-shell';
  if (family === 'field-fiber-body') return 'field-fiber-body';
  if (family === 'field-fiber-bundle') return 'field-fiber-bundle';
  if (family === 'field-strand-mat') return 'field-strand-mat';
  if (family === 'field-woven-mat') return 'field-woven-mat';
  if (family === 'field-domain-shell') return 'field-domain-shell';
  if (family === 'field-domain-micro-strand') return 'field-domain-micro-strand';
  if (family === 'alpha-impostor') return 'alpha-impostor';
  if (family === 'billboard-cluster') return 'billboard-cluster';
  if (family === 'volume-card' || family === 'texture-volume' || family === 'texture-carrier' || family === 'texture-micro-carrier') return 'volume-card';
  if (family === 'root-shadow') return 'root-shadow';
  if (family === 'soft-root-mass') return 'soft-root-mass';
  if (family === 'soft-root-fiber') return 'soft-root-fiber';
  if (family === 'fiber-ribbon') return 'fiber-ribbon';
  if (family === 'hybrid-root-fiber') return 'hybrid-root-fiber';
  return 'tuft';
}

function grassPrimitiveFamilyForAccentStyle(style: GrassAccentStyle): GrassPrimitiveFamily {
  if (style === 'field-fiber-shell' || style === 'field-fiber-shell-visibility') return 'field-fiber-shell';
  if (style === 'field-fiber-body') return 'field-fiber-body';
  if (style === 'field-fiber-bundle') return 'field-fiber-bundle';
  if (style === 'field-strand-mat') return 'field-strand-mat';
  if (style === 'field-woven-mat') return 'field-woven-mat';
  if (style === 'field-domain-shell') return 'field-domain-shell';
  if (style === 'field-domain-micro-strand') return 'field-domain-micro-strand';
  if (style === 'alpha-impostor') return 'alpha-impostor';
  if (style === 'billboard-cluster') return 'billboard-cluster';
  if (style === 'volume-card') return 'volume-card';
  if (style === 'root-shadow') return 'root-shadow';
  if (style === 'soft-root-mass') return 'soft-root-mass';
  if (style === 'soft-root-fiber') return 'soft-root-fiber';
  if (style === 'fiber-ribbon') return 'fiber-ribbon';
  if (style === 'hybrid-root-fiber') return 'hybrid-root-fiber';
  return 'legacy-tuft';
}

function grassPrimitiveFamilyForRequest(requested: GrassPrimitiveFamily, style: GrassAccentStyle): GrassPrimitiveFamily {
  if (requested === 'texture-volume' && style === 'volume-card') return 'texture-volume';
  if (requested === 'texture-carrier' && style === 'volume-card') return 'texture-carrier';
  if (requested === 'texture-micro-carrier' && style === 'volume-card') return 'texture-micro-carrier';
  return grassPrimitiveFamilyForAccentStyle(style);
}

function isClumpGrassAccentStyle(style: GrassAccentStyle): boolean {
  return style === 'root-shadow'
    || style === 'soft-root-mass'
    || style === 'soft-root-fiber'
    || style === 'alpha-impostor'
    || style === 'billboard-cluster'
    || style === 'volume-card';
}

function isWorkbenchGrassPrimitiveFamily(family: GrassPrimitiveFamily): boolean {
  return family === 'field-fiber-body' || family === 'field-fiber-bundle' || family === 'field-strand-mat' || family === 'field-woven-mat' || family === 'field-domain-shell' || family === 'field-domain-micro-strand' || family === 'alpha-impostor' || family === 'billboard-cluster' || family === 'volume-card' || family === 'texture-volume' || family === 'texture-carrier' || family === 'texture-micro-carrier';
}

function isFieldFiberShellStyle(style: GrassAccentStyle): boolean {
  return style === 'field-fiber-shell' || style === 'field-fiber-shell-visibility';
}

function isTextureGrassPrimitiveFamily(family: GrassPrimitiveFamily): boolean {
  return family === 'texture-volume' || family === 'texture-carrier' || family === 'texture-micro-carrier';
}

function animateShell(shell: RawFrameShell, status: HTMLElement, frame: () => FrameGraphCommands) {
  const tick = () => {
    shell.drawFrame(frame());
    if (!status.innerHTML) status.innerHTML = reportTable({ route: 'frame', ...shell.stats() });
    requestAnimationFrame(tick);
  };
  tick();
}

function liveFrameGraphContractFixtures(shell: RawFrameShell) {
  const fixtures = [
    {
      id: 'backgroundDepthMode',
      expected: 'non-world-depth',
      passes: [{ id: 'bad-background-depth', role: 'background-underpaint', phase: 'background', depth: 'read', draw: () => undefined }],
    },
    {
      id: 'worldMissingDepthMode',
      expected: 'must declare depth mode',
      passes: [{ id: 'bad-world-missing-depth', role: 'world-opaque', phase: 'world-depth', draw: () => undefined }],
    },
    {
      id: 'worldUnsupportedDepthMode',
      expected: 'must declare depth mode',
      passes: [{ id: 'bad-world-depth-mode', role: 'world-opaque', phase: 'world-depth', depth: 'sample', draw: () => undefined }],
    },
    {
      id: 'unsupportedPhase',
      expected: 'unsupported phase',
      passes: [{ id: 'bad-phase', role: 'overlay-effect', phase: 'transparent-world', draw: () => undefined }],
    },
    {
      id: 'missingSemanticRole',
      expected: 'must declare a semantic role',
      passes: [{ id: 'bad-missing-role', phase: 'world-depth', depth: 'read-write', draw: () => undefined }],
    },
    {
      id: 'mismatchedSemanticRole',
      expected: 'is incompatible with phase',
      passes: [{ id: 'bad-role-phase', role: 'world-opaque', phase: 'overlay', draw: () => undefined }],
    },
    {
      id: 'mismatchedDepthRole',
      expected: 'requires role',
      passes: [{ id: 'bad-depth-role', role: 'world-decal', phase: 'world-depth', depth: 'read-write', draw: () => undefined }],
    },
    {
      id: 'readOnlyBeforeWrite',
      expected: 'writes depth after read-only world decals have started',
      passes: [
        { id: 'early-world-decal', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: () => undefined },
        { id: 'late-world-opaque', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: () => undefined },
      ],
    },
    {
      id: 'topLevelTypeBucketPass',
      expected: 'is a type bucket, not a semantic frame pass',
      passes: [{
        id: 'treeBucket',
        label: 'Tree bucket',
        role: 'world-opaque',
        phase: 'world-depth',
        depth: 'read-write',
        batching: { strategy: 'instance-kind', buckets: ['conifer'] },
        draw: () => undefined,
      }],
    },
    {
      id: 'markersMissingLayer',
      expected: 'background markers must declare markerLayer',
      commands: {
        markers: [{ x: 0, y: 0, faction: 0 as const }],
      },
    },
  ];
  return fixtures.map((fixture) => {
    try {
      shell.drawFrame('commands' in fixture ? fixture.commands : { passes: fixture.passes as unknown as FrameGraphPass[] });
      return { id: fixture.id, expected: fixture.expected, rejected: false, diagnostics: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { id: fixture.id, expected: fixture.expected, rejected: message.includes(fixture.expected), diagnostics: [message] };
    }
  });
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
    shell.drawFrame({
      markers: [],
      passes: [{ id: 'animated-skinned-crowd', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => pipeline.draw(pass) }],
    });
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
    attribution: 'renderer-campaign-ui-fixture',
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
      selections.push({ x: mapNode.pos[0], y: mapNode.pos[1], z: 0, radius: mapNode.tier >= 3 ? 12.4 : 10.6, color: [0.31, 0.82, 0.39], kind: 'city' });
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
      selections.push({ x: army.x, y: army.y, z: 0, radius: 12.6, color: [0.31, 0.82, 0.39], kind: 'army' });
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
    __gpuCampaignUi?: {
      camera: typeof camera;
      armies: ArmyView[];
      cities: [number, CityView][];
      selectedArmy: number;
      selectedCity: number;
      lastPick: typeof lastPick;
      project(x: number, y: number): { x: number; y: number };
    };
  };
  w.__gpuCampaignUi = {
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

function projectNestedPoint(
  canvas: HTMLCanvasElement,
  camera: { x: number; y: number; zoom: number; pitch?: number; yaw?: number; perspective?: number },
  point: [number, number, number],
) {
  const c = Math.cos(camera.yaw ?? 0);
  const s = Math.sin(camera.yaw ?? 0);
  const dx = point[0] - camera.x;
  const dy = point[1] - camera.y;
  const rx = dx * c + dy * s;
  const ry = -dx * s + dy * c;
  const cosP = Math.max(0.2, Math.cos(camera.pitch ?? 0));
  const perspective = Math.max(0, camera.perspective ?? 0);
  const depth = Math.max(0.32, 1 + ry * perspective);
  return {
    x: (rx * camera.zoom) / depth + canvas.width * 0.5,
    y: canvas.height * 0.5 - ((ry * camera.zoom * cosP + point[2] * camera.zoom) / depth),
    world: point,
  };
}

function worldCameraAnchorAgreement(
  canvas: HTMLCanvasElement,
  camera: { x: number; y: number; zoom: number; pitch?: number; yaw?: number; perspective?: number },
  anchors: [string, [number, number, number]][],
) {
  const snapshot = { ...camera, width: canvas.width, height: canvas.height };
  const points = anchors.map(([id, point]) => {
    const cpu = worldToScreen(snapshot, point[0], point[1]);
    const gpu = projectNestedPoint(canvas, camera, point);
    const delta = Math.hypot(cpu[0] - gpu.x, cpu[1] - gpu.y);
    return { id, cpu, gpu: [gpu.x, gpu.y], delta };
  });
  return {
    maxDelta: points.reduce((max, point) => Math.max(max, point.delta), 0),
    points,
  };
}

function exposeBattleInputDebug(
  canvas: HTMLCanvasElement,
  camera: RendererBattlePickCamera,
  units: BattlePickUnit[],
  selectedUnits: number[],
  lastPick: { kind: string; unit: number; worldX: number; worldY: number; distance: number; boxUnits: number },
  lastOrder: { kind: string; unit: number; worldX: number; worldY: number; facing: number; hasTarget: boolean },
  controls: {
    advance(n: number): void;
    freezeAtTick(target: number): void | Promise<void>;
    camera(next: Partial<RendererBattlePickCamera>): void;
  },
) {
  const w = window as unknown as {
    __gpuBattleInput?: {
      camera: RendererBattlePickCamera;
      units: BattlePickUnit[];
      selectedUnits: number[];
      lastPick: typeof lastPick;
      lastOrder: typeof lastOrder;
      canvas: { width: number; height: number; clientWidth: number; clientHeight: number };
      advance(n: number): void;
      freezeAtTick(target: number): void | Promise<void>;
      setCamera(next: Partial<RendererBattlePickCamera>): void;
    };
  };
  w.__gpuBattleInput = {
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
  const w = window as unknown as { __rendererLabReady?: boolean; __rendererLabStats?: unknown };
  w.__rendererLabReady = true;
  w.__rendererLabStats = { ok, route, stats };
}

function reportTable(values: Record<string, unknown>) {
  const rows = Object.entries(values).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`).join('');
  return `<table>${rows}</table>`;
}

function issueList(issues: { code: string; message: string; path: string }[]) {
  if (issues.length === 0) return '';
  return `<ol>${issues.map((i) => `<li><b>${escapeHtml(i.code)}</b> ${escapeHtml(i.path)}: ${escapeHtml(i.message)}</li>`).join('')}</ol>`;
}


function graphList(report: ReturnType<typeof fullGameRenderGraphReport>) {
  const passes = report.passes
    .map((pass) => `<li><b>${escapeHtml(pass.id)}</b> <span>${escapeHtml(pass.label)}</span></li>`)
    .join('');
  return `<ol class="gpu-graph">${passes}</ol>`;
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
    .renderer-lab { height: 100vh; display: grid; grid-template-rows: 42px 1fr; }
    .renderer-lab.reference-shot { grid-template-rows: 1fr; }
    .renderer-lab.reference-shot .renderer-lab-nav, .renderer-lab.reference-shot .renderer-panel { display: none; }
    .renderer-lab.reference-shot .renderer-stage { grid-template-columns: 1fr; height: 100vh; max-height: 100vh; overflow: hidden; }
    .renderer-lab.reference-shot #renderer-canvas { height: 100vh; max-height: 100vh; }
    .renderer-lab-nav { display: flex; align-items: center; gap: 4px; overflow-x: auto; padding: 5px 8px; background: #242018; border-bottom: 1px solid #4d4432; }
    .renderer-lab-nav a { color: #c9bea5; text-decoration: none; font-size: 12px; padding: 6px 8px; border-radius: 4px; white-space: nowrap; }
    .renderer-lab-nav a.active, .renderer-lab-nav a:hover { background: #5b4e34; color: #fff7df; }
    .renderer-stage { min-height: 0; display: grid; grid-template-columns: 1fr 310px; position: relative; }
    #renderer-canvas { width: 100%; height: 100%; display: block; background: #aebfcf; }
    .renderer-panel { overflow: auto; border-left: 1px solid #4d4432; background: #191916; padding: 12px; color: #ded3bc; }
    .renderer-panel table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .renderer-panel th, .renderer-panel td { text-align: left; border-bottom: 1px solid #373228; padding: 5px 4px; vertical-align: top; }
    .renderer-panel th { width: 38%; color: #bcae8d; font-weight: 600; }
    .renderer-panel ol { padding-left: 20px; font-size: 12px; line-height: 1.45; }
    .renderer-panel .gpu-graph li { margin: 0 0 6px; }
    .renderer-panel .gpu-graph span { color: #cfc2a8; }
    .renderer-panel .renderer-status-list { list-style: none; padding-left: 0; }
    .renderer-panel .renderer-status-list li { margin: 0 0 8px; padding: 7px 8px; border: 1px solid #373228; border-radius: 5px; background: rgba(255,255,255,0.03); }
    .renderer-panel .renderer-status-list b { display: block; color: #f0dfb4; }
    .renderer-panel .renderer-status-list em { display: inline-block; margin: 3px 0; font-style: normal; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #e8d7a8; }
    .renderer-panel .renderer-status-list span { display: block; color: #cfc2a8; }
    .renderer-panel .renderer-status-list .pending { border-color: #7c6444; background: rgba(164,123,70,0.11); }
    .renderer-status.bad { color: #ffb2a2; }
    .fault-intro { margin: 0 0 10px; color: #bdb29b; font-size: 12px; line-height: 1.4; }
    .fault-controls { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 12px; }
    .fault-button { border: 1px solid #7c5d3a; border-radius: 5px; background: #2c2418; color: #f2e3bd; padding: 7px 10px; font-size: 12px; cursor: pointer; }
    .fault-button:hover { background: #41331f; }
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
    .renderer-battle-ui { position: absolute; inset: 0 310px 0 0; pointer-events: none; color: #efe7d4; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
    .renderer-battle-hud { position: absolute; top: 12px; left: 14px; display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: rgba(17,18,19,0.72); border: 1px solid rgba(214,184,103,0.38); border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,0.28); font-size: 12px; }
    .renderer-battle-hud b { color: #fff4c9; font-size: 12px; }
    .renderer-battle-summary { position: absolute; top: 54px; left: 14px; min-width: 210px; display: grid; grid-template-columns: 1fr auto; gap: 6px 10px; padding: 8px 10px; background: rgba(17,18,19,0.72); border: 1px solid rgba(126,151,191,0.42); border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,0.24); font-size: 12px; }
    .renderer-battle-summary b { color: #f5edd7; }
    .renderer-battle-summary i { grid-column: span 2; height: 5px; background: rgba(8,9,11,0.72); border-radius: 4px; overflow: hidden; }
    .renderer-battle-summary i em { display: block; height: 100%; }
    .renderer-battle-summary .hp em { background: #65bd50; }
    .renderer-battle-summary .coh em { background: #d9c75a; }
    .renderer-battle-summary .mor em { background: #c2554e; }
    /* Same fixed-size, shrink-wrapping, no-scroll grid as the live #unitcards
       (unitCard.ts writes --cols/--card-w/--card-h). */
    .renderer-unitcards { position: absolute; bottom: 58px; left: 50%; transform: translateX(-50%); display: grid; width: max-content; max-width: calc(100% - 36px); grid-template-columns: repeat(var(--cols, 1), var(--card-w, 72px)); grid-auto-rows: var(--card-h, 96px); gap: 3px; justify-content: center; align-content: end; overflow: hidden; padding: 11px 12px; pointer-events: auto; background: radial-gradient(circle at 9px 9px, rgba(234,204,142,0.95) 0 1.1px, rgba(58,42,22,0.95) 1.5px 2.7px, transparent 3.1px) padding-box, radial-gradient(circle at calc(100% - 9px) 9px, rgba(234,204,142,0.95) 0 1.1px, rgba(58,42,22,0.95) 1.5px 2.7px, transparent 3.1px) padding-box, radial-gradient(circle at 9px calc(100% - 9px), rgba(234,204,142,0.95) 0 1.1px, rgba(58,42,22,0.95) 1.5px 2.7px, transparent 3.1px) padding-box, radial-gradient(circle at calc(100% - 9px) calc(100% - 9px), rgba(234,204,142,0.95) 0 1.1px, rgba(58,42,22,0.95) 1.5px 2.7px, transparent 3.1px) padding-box, repeating-linear-gradient(96deg, rgba(255,228,168,0.035) 0 2px, rgba(0,0,0,0.04) 2px 4px) padding-box, linear-gradient(#5e4527, #2a1f11) padding-box, linear-gradient(#c79a54 0%, #6e5128 48%, #241a0e 100%) border-box; border: 4px solid transparent; border-radius: 5px; box-shadow: inset 0 1px 0 rgba(236,200,132,0.65), inset 0 0 0 2px rgba(16,10,5,0.78), inset 0 0 0 3px rgba(158,120,66,0.55), inset 0 -3px 8px rgba(0,0,0,0.6), 0 0 0 1px rgba(182,142,80,0.65), 0 9px 24px rgba(0,0,0,0.68); }
    .renderer-toolbar { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; align-items: center; padding: 7px 10px; pointer-events: auto; background: rgba(12,14,19,0.85); border: 1px solid #3a3f4d; border-radius: 8px; box-shadow: 0 4px 18px rgba(0,0,0,0.45); }
	    .renderer-toolbar button { font: 12px ui-monospace, Menlo, monospace; color: #c8cdd8; background: rgba(34,38,48,0.9); border: 1px solid #444a5a; border-radius: 6px; padding: 5px 10px; cursor: pointer; white-space: nowrap; }
	    .renderer-toolbar button.on { background: #4f774e; border-color: #84a76b; color: #fff; }
	    .renderer-toolbar button:disabled { opacity: 0.45; cursor: default; }
	    .renderer-campaign-ui { position: absolute; inset: 0 310px 0 0; pointer-events: none; color: #eadfca; font: 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
	    .renderer-campaign-hud { position: absolute; left: 12px; top: 12px; display: flex; align-items: center; gap: 12px; padding: 8px 10px; background: rgba(18,17,14,0.78); border: 1px solid rgba(177,143,82,0.45); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.32); }
	    .renderer-campaign-hud b { color: #f4dfaa; font-family: Cinzel, Georgia, serif; }
	    .renderer-campaign-panel { position: absolute; pointer-events: auto; width: 250px; max-height: calc(100% - 76px); overflow: auto; padding: 10px; background: linear-gradient(180deg,rgba(31,27,21,0.96),rgba(14,16,18,0.96)); border: 1px solid rgba(151,122,72,0.55); border-radius: 4px; box-shadow: 0 12px 30px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,236,186,0.12); }
	    .renderer-campaign-panel.army { right: 12px; top: 54px; }
	    .renderer-campaign-panel.city { right: 12px; bottom: 12px; }
	    .renderer-campaign-panel.diplomacy { left: 12px; top: 54px; width: 310px; }
	    .renderer-campaign-panel.classes { left: 12px; bottom: 12px; width: 250px; max-height: min(34%, 180px); }
	    .renderer-campaign-panel b { font-family: Cinzel, Georgia, serif; letter-spacing: 0.2px; color: #f1dfb1; }
	    .renderer-campaign-panel button { background: #202631; border: 1px solid #6c5b3e; border-radius: 3px; color: #eadfca; padding: 3px 8px; font: 11px ui-sans-serif, system-ui; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
	    .renderer-campaign-panel button.on, .renderer-campaign-panel button:hover:not(:disabled) { background: #3a3124; border-color: #b38a43; }
	    .renderer-campaign-panel button:disabled { opacity: 0.72; cursor: default; }
	    .renderer-campaign-panel input[type="checkbox"] { accent-color: #b38a43; }
	    .renderer-campaign-panel .cmp-title { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
	    .renderer-campaign-panel .cmp-ico { width: 14px; height: 14px; fill: currentColor; color: #caa45c; filter: drop-shadow(0 1px 0 rgba(0,0,0,0.35)); }
	    .renderer-campaign-panel .cmp-diplo-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 5px 0; padding: 6px; border-radius: 3px; background: rgba(255,255,255,0.05); }
	    .renderer-campaign-panel .cmp-swatch { width: 12px; height: 12px; border-radius: 2px; flex: none; box-shadow: 0 0 0 1px rgba(0,0,0,0.4); }
	    .renderer-campaign-panel .cmp-rel { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 1px 5px; border-radius: 2px; }
	    .renderer-campaign-panel .cmp-rel.war { background: #5a2330; color: #ff9a8a; }
	    .renderer-campaign-panel .cmp-rel.peace { background: #2a3a4a; color: #9ec5e8; }
	    .renderer-campaign-panel .cmp-rel.alliance { background: #2a4a32; color: #9ee8a8; }
	    .renderer-campaign-panel .cmp-pow { opacity: 0.72; font-size: 11px; }
	    .renderer-campaign-panel .cmp-diplo-acts { display: flex; gap: 4px; margin-top: 2px; flex-wrap: wrap; flex-basis: 100%; }
	    .renderer-campaign-panel .cmp-class-row { display: grid; grid-template-columns: 1fr; gap: 7px; padding: 9px 0; border-top: 1px solid rgba(169,133,76,0.3); }
	    .renderer-campaign-panel .cmp-class-name { font-family: Cinzel, Georgia, serif; font-weight: 700; color: #f0dcab; }
	    .renderer-campaign-panel .cmp-class-meta, .renderer-campaign-panel .cmp-city-meta { color: #b9aa8b; font-size: 11px; line-height: 1.25; }
	    .renderer-campaign-panel .cmp-unit-options { display: flex; flex-direction: column; gap: 4px; }
	    .renderer-campaign-panel .cmp-unit { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; background: rgba(42,36,28,0.84); padding: 6px; border: 1px solid rgba(119,94,55,0.35); border-radius: 3px; }
	    .renderer-campaign-panel .cmp-unit.sel { background: rgba(81,64,37,0.96); border-color: rgba(194,154,82,0.72); }
	    .renderer-campaign-panel .cmp-size, .renderer-campaign-panel .cmp-recruits, .renderer-campaign-panel .cmp-build-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 5px; }
	    @media (max-width: 760px) {
	      .renderer-stage { grid-template-columns: 1fr; grid-template-rows: 1fr 220px; }
	      .renderer-panel { border-left: 0; border-top: 1px solid #4d4432; }
	      .renderer-battle-ui { inset: 0 0 220px 0; }
	      .renderer-campaign-ui { inset: 0 0 220px 0; }
	      .renderer-campaign-panel.classes, .renderer-campaign-panel.diplomacy { display: none !important; }
      .renderer-battle-hud { max-width: calc(100% - 28px); overflow: hidden; }
      .renderer-battle-summary { display: none; }
      .renderer-unitcards { left: 12px; right: 12px; justify-content: flex-start; }
    }
  `;
  document.head.appendChild(style);
}
