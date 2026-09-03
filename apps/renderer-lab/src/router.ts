import {
  createFrameShell,
  type BackgroundRenderPass,
  type FrameGraphCommands,
  type FrameGraphPass,
  type OverlayRenderPass,
  type RawFrameShell,
  type WorldRenderPass,
} from "@packages/renderer-core/src/frameShell";
import * as THREE from "three/webgpu";
import {
  PROJECTION_IDENTITY,
  screenToWorld,
  world3dToScreen,
  worldToScreen,
  type CameraSnapshot,
} from "@packages/renderer-core/src/cameraUniform";
import {
  GPU_DEPTH_FORMAT,
  GPU_WORLD_DEPTH_ATTACHMENT,
} from "@packages/renderer-core/src/depthContract";
import { requestGpuDevice, gpuFailureMessage } from "@packages/renderer-core/src/device";
import { assertStorageBufferFits } from "@packages/renderer-core/src/capabilities";
import { WORLD_CAMERA_WGSL } from "@packages/renderer-core/src/cameraWgsl";
import {
  gpuOpaqueColorTarget,
  gpuWorldDepthStencil,
} from "@packages/renderer-core/src/pipelineContracts";
import {
  compileShader,
  setShaderErrorHandler,
  shaderCompilationMessages,
  type ShaderCompilationMessage,
} from "@packages/renderer-core/src/compileShader";
import { fatalSurfaceFor, showFatalErrorSurface } from "../../../web/src/shared/fatalError";
import {
  Allegiance,
  CAMPAIGN_FIGURE_SIZE,
  campaignArmyStandardScale,
  campaignSettlementStandardScale,
  type ArmyView,
  type CityView,
} from "@packages/game-renderer/src/campaign/entityFrame";
import { SkinnedCrowdPipeline } from "@packages/renderer-core/src/skinnedPipeline";
import { animationForFrame } from "@packages/crowd-runtime/src/animationState";
import {
  buildCrowdInstances,
  generatedFormation,
  type CrowdInstance,
} from "@packages/crowd-runtime/src/instanceData";
import { buildStackCrowd } from "@packages/crowd-runtime/src/stackCrowd";
import {
  assignCrowdLods,
  assignCrowdLodsByDistance,
  countLods,
  lodWithHysteresis,
} from "@packages/crowd-runtime/src/lod";
import { SoldierShadowDecalPass } from "@packages/renderer-core/src/soldierShadowPass";
import {
  CLASS_DEPTH,
  CLASS_SPACING,
  UNIT_INFO,
  unitFiles,
} from "@packages/game-renderer/src/battle/unitInfoLayout";
import { CampaignCloudPass } from "@packages/game-renderer/src/campaign/atmospherePass";
import {
  applyCampaignEnvironment,
  CAMPAIGN_ENVIRONMENT,
} from "@packages/game-renderer/src/campaign/environment";
import {
  CampaignEntityPass,
  type CampaignEntityInstance,
} from "@packages/game-renderer/src/campaign/entityPass";
import {
  buildCampaignMapDrawData,
  CampaignLabelPass,
  CampaignMapPass,
  type CampaignMarker,
  CampaignMarkerPass,
  CampaignRoadPass,
  CampaignWorldLinePass,
  type CampaignLabel,
} from "@packages/game-renderer/src/campaign/mapPass";
import {
  CampaignSceneryPass,
  type CampaignSceneryInstance,
} from "@packages/game-renderer/src/campaign/sceneryPass";
import { PROP_REVIEW_GROUPS } from "@packages/game-renderer/src/models/shared/sceneryPropRegistry";
import {
  STANDARD_SIZE_TIER_IDS,
  standardSeed,
  standardWindPhase,
  standardWindStrength,
  type StandardSizeTier,
} from "@packages/game-renderer/src/models/shared/standardAsset";
import {
  SharedStandardPass,
  type StandardInstance,
} from "@packages/game-renderer/src/models/shared/standardPass";
import {
  BATTLE_RELIEF_EXAGGERATION,
  terrainHeightField,
  type BattleTerrainGrid,
} from "@packages/game-renderer/src/battle/terrainFeatures";
import { sampleGrassField } from "@packages/game-renderer/src/battle/grassField";
import {
  chartCamera3d,
  eyePosition,
  projectPoint,
  unprojectToPlaneZ,
  type Camera3DParams,
  type ChartCameraSpec,
} from "@packages/renderer-core/src/camera3d";
import {
  applyBattleEnvironment,
  battleEnvironmentStats,
  resolveBattleEnvironment,
  skinnedLightingForBattleEnvironment,
  type BattleEnvironment,
} from "@packages/game-renderer/src/environment/environment";
import { featuresToBattleScenery } from "@packages/game-renderer/src/battle/terrainScenery";
import {
  MeshBuilder,
  type Rgb,
} from "@packages/game-renderer/src/models/shared/meshBuilder";
import {
  CampaignSelectionPass,
  type CampaignSelectionInstance,
} from "@packages/game-renderer/src/campaign/selectionPass";
import {
  campaignBorderVertices,
  CampaignTerritoryPass,
} from "@packages/game-renderer/src/campaign/territoryPass";
import { Nested3dFixturePass } from "@packages/game-renderer/src/fixtures/nested3d";
import {
  loadPlaceholderKit,
  loadPlaceholderVat,
  mountedClassesFromKit,
  placeholderClipNames,
} from "@packages/soldier-assets/src/placeholders";
import {
  REAL_UNIT_CLASS_COUNT,
  PLACEHOLDER_RENDER_CLASS_COUNT,
  SHOCK_CAV_SIDEARM_CLASS,
  createPlaceholderSoldierMeshes,
  createPlaceholderSoldierMeshTiers,
} from "@packages/soldier-assets/src/soldierMesh";
import {
  badArtistPackFixture,
  validateRig,
  validateSoldierKit,
  type ImportedRig,
  type ValidationReport,
} from "@packages/soldier-assets/src/validate";
import { bakeGltf } from "@packages/soldier-assets/bake/gltf.mjs";
import type { VatBake, VatClip } from "@packages/soldier-assets/src/schema";
import { importedRigMesh } from "./importedRigMesh";
import { routePhotorealCrowd, routePhotorealPbr } from "./photorealRoutes";
import { routePhotorealBattle } from "./photorealBattleRoute";
import { routeBattleGroundTurf } from "./battleGroundTurfRoute";
import { PhotorealBattleWorld } from "@packages/photoreal-renderer/src/battle/battleWorld";
import { PhotorealBladeFieldLayer } from "@packages/photoreal-renderer/src/battle/bladeFieldLayer";
import { createPhotorealStatsPublisher } from "@packages/photoreal-renderer/src/stats";
import { seaDisplacementSourceFromParam } from "@packages/photoreal-renderer/src/battle/seaLayer";
import { UNIT_CLASS_BY_KEY, UnitClass, CLASS_NAMES } from "../../../web/src/battle/classData";
import { Camera } from "../../../web/src/shared/camera";
import type { UnitCardInit, UnitCardState } from "../../../web/src/battle/unitCard";
import { UnitCardsReact } from "../../../web/src/ui/hud/UnitCardsReact";
import { installViewportGate } from "../../../web/src/battle/viewportGate";
import { loadCampaignData, nearestLoc, type CampaignData } from "../../../web/src/campaign/data";
import { campaignSurface } from "../../../web/src/campaign/surface";
import { TerrainField } from "../../../web/src/campaign/terrain";
import { Territory, type FactionLabel } from "../../../web/src/campaign/territory";
import { readCampaignViews, type CampaignViews } from "../../../web/src/campaign/views";
import {
  campaignDomHtml,
  type ArmyRosterRow,
  type CityDetail,
  type ClassDoctrineRow,
  type DiplomacyRow,
} from "../../../web/src/campaign/panels";
import { mountCampaignHud } from "../../../web/src/ui/campaign/CampaignHud";
import type {
  CampaignTopBarActions,
  CampaignTopBarState,
} from "../../../web/src/ui/campaign/CampaignTopBar";
import { createHudStore } from "../../../web/src/ui/hudStore";

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
  "/renderer/device": routeDevice,
  "/renderer/capabilities": routeCapabilities,
  "/renderer/per-class-vat": routePerClassVat,
  "/renderer/soldier-materials": routeSoldierMaterials,
  "/renderer/mounted-units": routeMountedUnits,
  "/renderer/lod-tiers": routeLodTiers,
  "/renderer/battle-elevation": routeBattleElevation,
  "/renderer/asset-workbench": routeAssetWorkbench,
  "/renderer/fault-injection": routeFaultInjection,
  "/renderer/frame-shell": routeFrameShell,
  "/renderer/assets": routeAssets,
  "/renderer/crowd-data": routeCrowdData,
  "/renderer/animation-state": routeAnimationState,
  "/renderer/skinned-soldier": routeSkinnedSoldier,
  "/renderer/skinned-crowd": routeSkinnedCrowd,
  "/renderer/skinned-depth": routeSkinnedDepth,
  "/renderer/lod": routeLod,
  "/renderer/battle": routeBattle,
  "/renderer/campaign-map": routeCampaignMap,
  "/renderer/campaign-ui": routeCampaignUi,
  "/renderer/campaign-models": routeCampaignModelShots,
  "/renderer/shared-prop-models": routeSharedPropModelShots,
  "/renderer/shared-standard-models": routeSharedStandardModelShots,
  "/renderer/world-camera": routeWorldCamera,
  "/renderer/card-bar": routeCardBar,
  // Photoreal ladder (slices 07+): three.js WebGPU + TSL on the camera3d spine.
  "/renderer/photoreal-pbr": routePhotorealPbr,
  "/renderer/photoreal-crowd": routePhotorealCrowd,
  "/renderer/photoreal-battle": routePhotorealBattle,
  "/renderer/battle-ground-turf": routeBattleGroundTurf,
  "/renderer/blade-field": routeBladeField,
};

export async function mountRendererLab(path = location.pathname) {
  document.body.innerHTML = "";
  document.body.className = "renderer-lab-body";
  installStyles();
  const root = el("main", "renderer-lab");
  const nav = el("nav", "renderer-lab-nav");
  for (const key of Object.keys(routes)) {
    const a = document.createElement("a");
    a.href = key;
    a.textContent = key.replace("/renderer/", "");
    a.className = key === path ? "active" : "";
    nav.appendChild(a);
  }
  const stage = el("section", "renderer-stage");
  const canvas = document.createElement("canvas");
  canvas.id = "renderer-canvas";
  const panel = el("aside", "renderer-panel");
  const status = el("div", "renderer-status");
  panel.appendChild(status);
  stage.append(canvas, panel);
  root.append(nav, stage);
  document.body.appendChild(root);
  const route = routes[path] ?? routeDevice;
  try {
    await route({
      root,
      canvas,
      panel,
      status,
      path,
      params: new URLSearchParams(location.search),
    });
  } catch (error) {
    status.textContent = gpuFailureMessage(error);
    status.classList.add("bad");
    (
      window as unknown as { __rendererLabReady?: boolean; __rendererLabStats?: unknown }
    ).__rendererLabReady = true;
    (window as unknown as { __rendererLabStats?: unknown }).__rendererLabStats = {
      ok: false,
      error: String(error),
    };
  }
}

async function routeDevice(ctx: LabContext) {
  const info = await requestGpuDevice();
  const shell = await createFrameShell(ctx.canvas, { sun: CAMPAIGN_ENVIRONMENT });
  applyCampaignEnvironment(shell);
  const markers = generatedCrowd(18, -8, -4, 0).concat(generatedCrowd(18, 8, 2, 1));
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88]);
  pipeline.upload(markers);
  const ground = new LabGroundPass(shell, [-42, -28, 84, 56]);
  shell.setCamera(chartSnapshot({ x: 0, y: 0, zoom: 10, pitch: 0.25, yaw: 0 }, shell));
  shell.drawFrame({
    passes: [
      labGroundFramePass(ground, "device-ground"),
      skinnedCrowdPass(pipeline, "device-crowd"),
    ],
  });
  ctx.status.innerHTML = reportTable({
    route: "device",
    status: "WebGPU ready",
    vendor: info.vendor,
    architecture: info.architecture,
    format: info.format,
    features: info.features.length,
    markers: markers.length,
  });
  publish("device", true, { ...shell.stats(), vendor: info.vendor, features: info.features });
}

async function routeBladeField(ctx: LabContext) {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const [{ default: initWasm, Game }, world] = await Promise.all([
    import("../../../web/src/wasm/game_wasm.js"),
    PhotorealBattleWorld.create(ctx.canvas, {
      environment: ctx.params.get("env") ?? "overcast-foggy",
      shadows: ctx.params.get("shadows") ?? "off",
      sea: seaDisplacementSourceFromParam(ctx.params.get("sea")),
      post: ctx.params.get("post") ?? "off",
    }),
  ]);
  const wasm = await initWasm();
  (window as unknown as { __bladeFieldWorld?: PhotorealBattleWorld }).__bladeFieldWorld = world;
  const game = new Game(0x5eed_c0de);
  game.start_battle(ctx.params.get("map") === "B" ? 1 : 0);
  const ticks = Math.max(0, Math.floor(Number(ctx.params.get("ticks") ?? 60)));
  if (ticks > 0) game.advance_ticks(ticks);
  const wasmMapId = ctx.params.get("map") === "B" ? 1 : 0;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = ctx.canvas.clientWidth || 1280;
  const cssH = ctx.canvas.clientHeight || 800;
  world.resize(cssW, cssH, dpr);

  const grid: BattleTerrainGrid = {
    w: game.terrain_w(),
    h: game.terrain_h(),
    cell: game.terrain_cell(),
    ox: game.terrain_origin_x(),
    oy: game.terrain_origin_y(),
    tint: new Uint8Array(
      new Uint8Array(
        wasm.memory.buffer,
        game.terrain_tint_ptr(),
        game.terrain_w() * game.terrain_h(),
      ),
    ),
    height: new Float32Array(
      new Float32Array(
        wasm.memory.buffer,
        game.terrain_height_ptr(),
        game.terrain_w() * game.terrain_h(),
      ),
    ),
  };
  const field = { ...terrainHeightField(grid), verticalScale: BATTLE_RELIEF_EXAGGERATION };
  world.setStatic(new Uint32Array(0), [], []);
  world.setTerrain(grid.w, grid.h, grid.cell, grid.ox, grid.oy, grid.tint, grid.height, wasmMapId);

  const camera = new Camera(ctx.canvas);
  const mapW = grid.w * grid.cell;
  const mapH = grid.h * grid.cell;
  camera.bounds = [grid.ox, grid.oy, grid.ox + mapW, grid.oy + mapH];
  const topDownCos = 0.95;
  const tacticalZoom = Math.min((cssW * dpr) / mapW, (cssH * dpr) / topDownCos / mapH);
  camera.setRig(
    { min: Math.max(0.4, tacticalZoom), max: Math.max(8, tacticalZoom * 6) },
    { width: mapW, height: mapH },
  );
  camera.zoom = Number(ctx.params.get("zoom")) || 7.86;
  if (ctx.params.has("camYaw")) camera.yaw = Number(ctx.params.get("camYaw")) || 0;
  const cx = Number(ctx.params.get("cx")) || 0;
  const cy = ctx.params.has("cy") ? Number(ctx.params.get("cy")) : -650;
  const camDx = Number(ctx.params.get("camDx") ?? 0) || 0;
  const camDy = Number(ctx.params.get("camDy") ?? 0) || 0;
  camera.setViewCenter(cx + camDx, cy + camDy);
  camera.clampView();
  // Lab records cover the looked-at corridor (view-centre disc): on the shallow
  // close-gate rig only a target-centred disc reaches from the foreground to the
  // look point, so the whole frame carries grass. LOD bands off the eye
  // footprint (routeGpu anchor below); the production look-target anchor and its
  // far-LOD / near-eye edge treatments are fenced production-only in the blade
  // material so the lab keeps its fine tall clumped envelope.
  const [focusX, focusY] = camera.viewCenter();

  const grassOff =
    ctx.params.get("grass") === "off" ||
    ctx.params.get("bladeField") === "off" ||
    ctx.params.get("layer") === "off";
  const radius = Number(ctx.params.get("radius")) || 64;
  const snapshot = sampleGrassField(grid, field, {
    seed: 0x5ea7_2026,
    focus: { x: focusX, y: focusY, radius },
    fieldCellSize: Number(ctx.params.get("fieldCell")) || 0.42,
    snapCellSize: Number(ctx.params.get("snapCell")) || 8,
    clumpCellSize: Number(ctx.params.get("clumpCell")) || 1.55,
    // Defaults = the oracle-accepted close-gate profile (slice 10 sweep).
    maxRecords: Math.max(0, Math.floor(Number(ctx.params.get("maxRecords")) || 40000)),
    // 0.42: David's width contract - finer strands, lower density read as grass
    // at close range instead of an over-packed stipple carpet. 0.8 packed the
    // foreground into a high-frequency mat (raw-edge-stipple).
    density: Number(ctx.params.get("density")) || 0.42,
    jitter: 0.72,
    minNormalZ: 0.45,
    lodNearRadius: 5 / radius,
    lodMidRadius: 20 / radius,
    baseHeight: Number(ctx.params.get("bladeHeight")) || 1.25,
    heightJitter: Number(ctx.params.get("heightJitter")) || 0.5,
    baseWidth: Number(ctx.params.get("bladeWidth")) || 0.13,
    widthJitter: 0.22,
    baseBend: Number(ctx.params.get("baseBend")) || 0.45,
    bendJitter: Number(ctx.params.get("bendJitter")) || 0.35,
  });

  const bladeField = new PhotorealBladeFieldLayer(world.world.scene);
  bladeField.applyPackedRecords(snapshot.packedRecords, !grassOff);
  world.setGrassVisible(false);

  const cameraSnapshot = () => {
    const [x, y] = camera.viewCenter();
    return { x, y, zoom: camera.zoom, zoomT: camera.zoomT, camera3d: camera.params() };
  };
  const empty = new Float32Array();
  const renderFrame = (now: number) => {
    const seconds = ctx.params.has("t") ? Number(ctx.params.get("t")) || 0 : 0;
    world.setTime(seconds);
    camera.clampView();
    const frameCamera = cameraSnapshot();
    world.draw(empty, empty, empty, empty, 0, frameCamera, new Uint8Array(), ticks);
    world.setGrassVisible(false);
    bladeField.setVisible(!grassOff);
    const labEye = eyePosition(frameCamera.camera3d);
    bladeField.routeGpu(world.world.renderer, labEye, [labEye[0], labEye[1]]);
    world.render();
    const published = publishFrame(now);
    ctx.status.innerHTML = reportTable({
      route: "blade-field",
      substrate: published.substrate,
      environment: published.environment,
      records: snapshot.stats.acceptedRecords,
      lod: snapshot.stats.lodCounts.join("/"),
      drawCalls: bladeField.stats().drawCalls,
      triangles: bladeField.stats().submittedTriangles,
      snap: `${snapshot.stats.snapX}, ${snapshot.stats.snapY}`,
      hash: bladeField.stats().recordHash,
      layer: grassOff ? "off" : "on",
    });
    requestAnimationFrame(renderFrame);
  };
  const publishFrame = createBladeFieldPublisher(world, () => ({
    route: "blade-field",
    map: ctx.params.get("map") === "B" ? "B" : "A",
    fixture: "sim-tint",
    productionBattleIntegration: false,
    closeGateCompatible: true,
    layerDisabled: grassOff,
    camera: cameraSnapshot(),
    sample: snapshot.stats,
    bladeField: bladeField.stats(),
    renderStats: world.stats(),
  }));
  requestAnimationFrame(renderFrame);
}

function createBladeFieldPublisher(
  world: PhotorealBattleWorld,
  counts: () => Record<string, unknown>,
) {
  return createPhotorealStatsPublisher(world.world, "blade-field", counts);
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
      for (let k = 0; k < 4; k++)
        data[(row * width + col) * 4 + k] = vat.data[(row * vat.width + src) * 4 + k];
    }
  }
  return { ...vat, width, clips, data };
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
  const built = buildCrowdInstances({
    positions,
    soldierUnit,
    unitClass,
    terrainHeight: ridge,
    simTick: 90,
  });
  const instances = built.instances.map((inst) => ({ ...inst, facing: Math.PI / 2 }));

  // The elevation each instance received must equal the sampled terrain height.
  const elevationMatches = instances.every(
    (inst) => Math.abs((inst.elevation ?? 0) - ridge(inst.x, inst.y)) < 1e-6,
  );
  const elevationSpan =
    Math.max(...instances.map((i) => i.elevation ?? 0)) -
    Math.min(...instances.map((i) => i.elevation ?? 0));

  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 26,
    pitch: 0.3,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88], vat);
  const shadows = new SoldierShadowDecalPass(shell);

  const start = performance.now();
  const tick = () => {
    const phaseOffset = ((performance.now() - start) / 1000) * 0.6;
    pipeline.upload(instances, { forcedClip: "march", phaseOffset, size: 1 });
    shadows.upload(instances);
    shell.drawFrame({
      passes: [
        {
          id: "elevation-crowd",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass) => pipeline.draw(pass),
        },
        {
          id: "elevation-shadows",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass) => shadows.draw(pass),
        },
      ],
    });
    requestAnimationFrame(tick);
  };
  tick();
  ctx.status.innerHTML = reportTable({
    route: "battle-elevation",
    soldiers: instances.length,
    "elevation matches terrain": elevationMatches,
    "elevation span": elevationSpan.toFixed(2),
    shadows: shadows.stats().shadows,
  });
  publish("battle-elevation", true, {
    route: "battle-elevation",
    soldiers: instances.length,
    elevationMatches,
    elevationSpan,
    shadows: shadows.stats().shadows,
  });
}

async function routeLodTiers(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  const tiers = createPlaceholderSoldierMeshTiers([0.2, 0.42, 0.88]);
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 40,
    pitch: 0.18,
    yaw: 0,
  });
  const pipeline = new SkinnedCrowdPipeline(shell, tiers, vat);

  // Three soldiers side by side, explicitly L0/L1/L2, so detail reduction is
  // directly reviewable.
  const lineup = [0, 1, 2].map((lod) => ({
    ...crowdInstance((lod - 1) * 2.6, 0, 0, "at_ease"),
    lod,
  }));
  const triCounts = [0, 1, 2].map((lod) => tiers[0][lod].indices.length / 3);

  // The distance algorithm: a line of instances receding from the camera focus
  // must coarsen monotonically (near = L0, far = coarser).
  const probeCamera = { x: 0, y: 0, zoom: 20 };
  const probe = Array.from({ length: 16 }, (_, i) => ({
    ...crowdInstance(0, 0, 0, "idle"),
    y: i * 30,
  }));
  const probeLevels = assignCrowdLodsByDistance(probe, probeCamera).map((a) => a.level);
  const monotonic = probeLevels.every((lvl, i) => i === 0 || lvl >= probeLevels[i - 1]);
  const tiersReached = new Set(probeLevels).size;

  // Hysteresis: within the deadband around the L0/L1 boundary (size 18), an
  // instance keeps its previous tier instead of flipping every frame.
  const heldL0 = lodWithHysteresis(0, 17.5);
  const heldL1 = lodWithHysteresis(1, 18.5);

  animateSkinned(shell, pipeline, () => lineup, { phaseSpeed: 0.5, size: 1.4 });
  ctx.status.innerHTML = reportTable({
    route: "lod-tiers",
    "L0 / L1 / L2 triangles": triCounts.join(" / "),
    "tiers reduce geometry": triCounts[0] > triCounts[1] && triCounts[1] > triCounts[2],
    "distance bins coarsen": monotonic,
    "probe levels": probeLevels.join(""),
    "hysteresis holds at boundary": heldL0 === 0 && heldL1 === 1,
  });
  publish("lod-tiers", true, {
    route: "lod-tiers",
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
  const zoom = numberParam(ctx.params, "zoom", 6);
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 30,
    pitch: 0.16,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88], vat);
  const heavySword = UNIT_CLASS_BY_KEY[UnitClass.HeavySword];
  const mediumPhalanx = UNIT_CLASS_BY_KEY[UnitClass.MediumPhalanx];
  const shockCavalry = UNIT_CLASS_BY_KEY[UnitClass.ShockCavalry];
  const horseArchers = UNIT_CLASS_BY_KEY[UnitClass.HorseArchers];
  // Heavy sword and medium phalanx are foot; the cavalry classes and the
  // render-only shock-cav sidearm are mounted archetypes.
  const lineup = [
    crowdInstance(-6.0, heavySword, 0, "march", false),
    crowdInstance(-3.0, mediumPhalanx, 0, "march", false),
    crowdInstance(0, shockCavalry, 0, "march", true),
    crowdInstance(3.0, horseArchers, 1, "march", true),
    crowdInstance(6.0, SHOCK_CAV_SIDEARM_CLASS, 1, "march", true),
  ];
  const lods = assignCrowdLods(lineup, zoom);
  const byClass = (id: number) => lods[lineup.findIndex((s) => s.classId === id)].screenSize;
  const footSize = byClass(heavySword);
  const phalanxSize = byClass(mediumPhalanx);
  const mountedSizes = {
    [shockCavalry]: byClass(shockCavalry),
    [horseArchers]: byClass(horseArchers),
    [SHOCK_CAV_SIDEARM_CLASS]: byClass(SHOCK_CAV_SIDEARM_CLASS),
  };
  const allMountedScaled = Object.values(mountedSizes).every((s) => s > footSize + 0.01);
  const phalanxFoot = Math.abs(phalanxSize - footSize) < 0.01;
  const sidearmScaled = mountedSizes[SHOCK_CAV_SIDEARM_CLASS] > footSize + 0.01;
  const mountedEqual =
    mountedSizes[shockCavalry] === mountedSizes[horseArchers] &&
    mountedSizes[horseArchers] === mountedSizes[SHOCK_CAV_SIDEARM_CLASS];

  animateSkinned(shell, pipeline, () => lineup, { forcedClip: "march", phaseSpeed: 0.6, size: 1 });
  ctx.status.innerHTML = reportTable({
    route: "mounted-units",
    "foot LOD size": footSize.toFixed(2),
    "heavy sword / medium phalanx size": `${footSize.toFixed(2)} / ${phalanxSize.toFixed(2)}`,
    [`shock cav / horse archers / ${SHOCK_CAV_SIDEARM_CLASS} size`]: `${mountedSizes[shockCavalry].toFixed(2)} / ${mountedSizes[horseArchers].toFixed(2)} / ${mountedSizes[SHOCK_CAV_SIDEARM_CLASS].toFixed(2)}`,
    "all mounted scale": allMountedScaled,
    "medium phalanx remains foot": phalanxFoot,
    [`class ${SHOCK_CAV_SIDEARM_CLASS} scaled`]: sidearmScaled,
  });
  publish("mounted-units", true, {
    route: "mounted-units",
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
  const strength = numberParam(ctx.params, "strength", 1);
  const faction = integerParam(ctx.params, "team", 0, 0, 1) as 0 | 1;
  const classId = integerParam(ctx.params, "class", 0, 0, PLACEHOLDER_RENDER_CLASS_COUNT - 1);
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 86,
    pitch: 0.1,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88], vat);
  pipeline.setFactionMaskStrength(strength);
  const soldier = generatedFormation(1, { frame: 6, spacing: 1, faction, classId }).map((inst) => ({
    ...inst,
    x: 0,
    y: 0,
    facing: Math.PI / 2,
  }));
  animateSkinned(shell, pipeline, () => soldier, {
    forcedClip: "at_ease",
    phaseSpeed: 0,
    size: 1.6,
  });
  ctx.status.innerHTML = reportTable({
    route: "soldier-materials",
    "accent strength": strength.toFixed(2),
    faction,
    classId,
    note: "material-led body and shield; faction appears only on the upper sword-arm band",
  });
  publish("soldier-materials", true, {
    route: "soldier-materials",
    strength,
    faction,
    classId,
    ...pipeline.stats(),
  });
}

async function routePerClassVat(ctx: LabContext) {
  const placeholder = await loadPlaceholderVat();
  const kit = await loadPlaceholderKit();
  const stretched = stretchVat(placeholder, 2);
  const meshes = createPlaceholderSoldierMeshes([0.2, 0.42, 0.88]);
  // class 1 → its own 2x VAT; class 0 and everything else (e.g. class 5) → the
  // shared placeholder fallback.
  const vats = meshes.map((_, id) => (id === 1 ? stretched : placeholder));
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 70,
    pitch: 0.14,
    yaw: 0,
  });
  const pipeline = new SkinnedCrowdPipeline(shell, meshes, vats, kit);
  const soldiers = [
    crowdInstance(-3.4, 0, 0, "march"),
    crowdInstance(0, 1, 1, "march"),
    crowdInstance(3.4, 5, 0, "march"),
  ];

  const c0 = pipeline.classClip(0, "march");
  const c1 = pipeline.classClip(1, "march");
  const c5 = pipeline.classClip(5, "march");
  const stats = {
    route: "per-class-vat",
    vatVariants: pipeline.stats().vatVariants,
    class0Frames: c0.frames,
    class1Frames: c1.frames,
    class5Frames: c5.frames,
    divergence: c1.frames === c0.frames * 2,
    fallbackMatches: c5.frames === c0.frames,
  };
  ctx.status.innerHTML = reportTable({
    route: "per-class-vat",
    "VAT variants": stats.vatVariants,
    "class 0 march frames": stats.class0Frames,
    "class 1 march frames (2x VAT)": stats.class1Frames,
    "class 5 march frames (fallback)": stats.class5Frames,
    "per-class divergence": stats.divergence,
    "fallback to shared": stats.fallbackMatches,
  });

  const start = performance.now();
  const tick = () => {
    const phaseOffset = ((performance.now() - start) / 1000) * 0.6;
    pipeline.upload(soldiers, { forcedClip: "march", phaseOffset, size: 1 });
    shell.drawFrame({
      passes: [
        {
          id: "per-class-vat",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass) => pipeline.draw(pass),
        },
      ],
    });
    requestAnimationFrame(tick);
  };
  tick();
  publish("per-class-vat", true, stats);
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

function crowdInstance(
  x: number,
  classId: number,
  faction: 0 | 1 | 2,
  clip: string,
  mounted = false,
): CrowdInstance {
  return {
    x,
    y: 0,
    facing: Math.PI / 2,
    classId,
    faction,
    alive: true,
    frame: 0,
    clip,
    phase: 0,
    seed: 1,
    mounted,
    lod: 0,
  };
}

async function routeAssetWorkbench(ctx: LabContext) {
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 64,
    pitch: 0.16,
    yaw: 0,
  });
  const placeholderVat = await loadPlaceholderVat();
  const placeholderPipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88], placeholderVat);
  const placeholderInstances = [crowdInstance(-3.2, 0, 0, "march")];

  let importedPipeline: SkinnedCrowdPipeline | null = null;
  let importedInstances: CrowdInstance[] = [];
  let imported: WorkbenchImport | null = null;

  const loadGlb = (buffer: ArrayBuffer, source: string) => {
    try {
      const { rig, bake, boneNames } = bakeGltf(buffer, {
        fps: placeholderVat.fps,
        skeleton: "imported",
      });
      const report = validateRig(rig as ImportedRig);
      importedPipeline = new SkinnedCrowdPipeline(shell, importedRigMesh(rig as ImportedRig), bake);
      const clip = bake.clips[0]?.name ?? "idle";
      importedInstances = [crowdInstance(2.6, 0, 1, clip)];
      imported = {
        source,
        ok: report.ok,
        bones: rig.bones.length,
        clips: bake.clips.map((c) => c.name),
        boneNames,
        vat: `${bake.width}x${bake.height}`,
        report,
        error: null,
      };
    } catch (error) {
      importedPipeline = null;
      importedInstances = [];
      const message = error instanceof Error ? error.message : String(error);
      imported = {
        source,
        ok: false,
        bones: 0,
        clips: [],
        boneNames: [],
        vat: "",
        report: {
          ok: false,
          errors: [{ level: "error", code: "import", path: source, message }],
          warnings: [],
          issues: [{ level: "error", code: "import", path: source, message }],
        },
        error: message,
      };
    }
    renderPanel();
    publishStats();
  };

  // The default render proves the placeholder path is intact even before any
  // asset is dropped; we then load the checked-in test fixture beside it.
  try {
    const res = await fetch("/assets/soldiers/test/two-bone.glb");
    if (res.ok) loadGlb(await res.arrayBuffer(), "two-bone.glb (default fixture)");
  } catch {
    // fixture optional — the workbench still renders the placeholder alone
  }

  (
    window as unknown as { __assetWorkbench?: { loadBase64Glb(b64: string, name: string): void } }
  ).__assetWorkbench = {
    loadBase64Glb: (b64, name) =>
      loadGlb(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer, name),
  };

  const start = performance.now();
  const tick = () => {
    const phaseOffset = ((performance.now() - start) / 1000) * 0.7;
    placeholderPipeline.upload(placeholderInstances, { forcedClip: "march", phaseOffset, size: 1 });
    importedPipeline?.upload(importedInstances, {
      forcedClip: importedInstances[0]?.clip,
      phaseOffset,
      size: 1.4,
    });
    shell.drawFrame({
      passes: [
        {
          id: "asset-workbench",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass) => {
            placeholderPipeline.draw(pass);
            importedPipeline?.draw(pass);
          },
        },
      ],
    });
    requestAnimationFrame(tick);
  };
  tick();

  function renderPanel() {
    ctx.status.innerHTML = "";
    const intro = el("p", "fault-intro");
    intro.textContent =
      "Left: placeholder soldier (default path). Right: imported .glb skeleton baked live to a VAT. Drop a .glb to replace it.";
    ctx.status.appendChild(intro);
    const drop = el("div", "asset-workbench");
    drop.innerHTML = "<label>Import a rigged .glb</label>";
    const fileLabel = el("label", "asset-file");
    fileLabel.textContent = "Choose .glb";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = ".glb,.gltf,model/gltf-binary";
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (f) loadGlb(await f.arrayBuffer(), f.name);
    });
    fileLabel.appendChild(file);
    drop.appendChild(fileLabel);
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("drag");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
    drop.addEventListener("drop", async (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
      const f = e.dataTransfer?.files?.[0];
      if (f) loadGlb(await f.arrayBuffer(), f.name);
    });
    ctx.status.appendChild(drop);
    ctx.status.insertAdjacentHTML(
      "beforeend",
      reportTable({
        route: "asset-workbench",
        "placeholder soldier": "rendered (default intact)",
        "imported source": imported?.source ?? "none",
        "imported bones": imported?.bones ?? "—",
        "imported clips": imported?.clips.join(", ") || "—",
        "imported VAT": imported?.vat || "—",
        validation: imported
          ? imported.ok
            ? "OK"
            : `${imported.report.errors.length} error(s)`
          : "—",
      }),
    );
    if (imported && imported.report.issues.length > 0) {
      ctx.status.insertAdjacentHTML("beforeend", issueList(imported.report.issues));
    }
  }

  function publishStats() {
    publish("asset-workbench", true, {
      route: "asset-workbench",
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
  const sampleParam = integerParam(ctx.params, "msaa", 1, 1, 4);
  const shell = await createFrameShell(ctx.canvas, {
    sun: CAMPAIGN_ENVIRONMENT,
    enableGpuTimer: true,
    sampleCount: sampleParam,
  });
  const caps = shell.info.caps;

  // VAT storage-buffer guard: oversize is rejected before allocation; a real
  // size fits.
  let oversizeRejected = false;
  let oversizeMessage = "";
  try {
    assertStorageBufferFits(caps.maxStorageBufferBindingSize + 1, caps, "probe-oversize");
  } catch (error) {
    oversizeRejected = true;
    oversizeMessage = error instanceof Error ? error.message : String(error);
  }
  let realSizeFits = true;
  try {
    assertStorageBufferFits(1 << 20, caps, "probe-fits");
  } catch {
    realSizeFits = false;
  }

  shell.setCamera(chartSnapshot({ x: 0, y: 0, zoom: 9, pitch: 0.34, yaw: -0.12 }, shell));
  const markers = generatedCrowd(80, -10, -9, 0).concat(generatedCrowd(80, 10, 3, 1));
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88]);
  pipeline.upload(markers);
  const ground = new LabGroundPass(shell, [-42, -28, 84, 56]);
  const fixture = new Nested3dFixturePass(shell);
  const draw = (): FrameGraphCommands => ({
    passes: [
      labGroundFramePass(ground, "capabilities-ground"),
      {
        id: "capabilities-nested-3d",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => fixture.draw(pass),
      },
      skinnedCrowdPass(pipeline, "capabilities-crowd"),
    ],
  });

  const tick = () => {
    shell.drawFrame(draw());
    const stats = shell.stats();
    ctx.status.innerHTML = reportTable({
      route: "capabilities",
      "power preference": caps.powerPreference,
      "preferred format": shell.info.format,
      "depth format": stats.depth.format,
      maxStorageBufferBindingSize: caps.maxStorageBufferBindingSize,
      maxBufferSize: caps.maxBufferSize,
      "MSAA supported": caps.msaaSupported,
      "sample count": stats.sampleCount,
      "timestamp-query": caps.timestampQuery,
      "GPU time (ms)": stats.gpuTimeMs === null ? "pending" : stats.gpuTimeMs.toFixed(3),
      "VAT oversize rejected": oversizeRejected,
      "VAT real size fits": realSizeFits,
    });
    publish("capabilities", true, {
      route: "capabilities",
      caps,
      depth: stats.depth,
      grantedLimits: {
        maxStorageBufferBindingSize: shell.info.limits.maxStorageBufferBindingSize,
        maxBufferSize: shell.info.limits.maxBufferSize,
      },
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
  route: "fault-injection";
  initialFrameRendered: boolean;
  badShader: {
    triggered: boolean;
    errorCount: number;
    firstError: ShaderCompilationMessage | null;
    handlerFired: boolean;
  } | null;
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
    route: "fault-injection",
    initialFrameRendered: false,
    badShader: null,
    rejectedSubmission: null,
    deviceLoss: null,
    health: { fatal: false, deviceLost: false },
  };
  let handlerFired = false;
  setShaderErrorHandler(() => {
    handlerFired = true;
  });

  const shell = await createFrameShell(ctx.canvas, {
    sun: CAMPAIGN_ENVIRONMENT,
    onFatalError: (report) =>
      showFatalErrorSurface(
        ctx.canvas,
        fatalSurfaceFor(
          report.phase === "device-lost" ? "device-lost" : "submission",
          report.message,
        ),
      ),
  });
  shell.setCamera(chartSnapshot({ x: 0, y: 0, zoom: 10, pitch: 0.25, yaw: 0 }, shell));
  const markers = generatedCrowd(18, -8, -4, 0).concat(generatedCrowd(18, 8, 2, 1));
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88]);
  pipeline.upload(markers);
  const ground = new LabGroundPass(shell, [-42, -28, 84, 56]);
  const draw = (): FrameGraphCommands => ({
    passes: [
      labGroundFramePass(ground, "fault-injection-ground"),
      skinnedCrowdPass(pipeline, "fault-injection-crowd"),
    ],
  });
  shell.drawFrame(draw());
  state.initialFrameRendered = true;

  const sync = () => {
    state.health = { fatal: shell.health().fatal, deviceLost: shell.health().deviceLost };
    publish("fault-injection", true, state);
    renderPanel();
  };

  const injectBadShader = async () => {
    handlerFired = false;
    // Compile on a throwaway device so the bad shader's uncaptured error does
    // not mark the live shell fatal — each fault here is demonstrated in
    // isolation. The compile-error surfacing path is identical to production.
    const scratch = await requestGpuDevice();
    const module = compileShader(scratch.device, BAD_SHADER_WGSL, "fault-bad-shader");
    const messages = await shaderCompilationMessages(module, "fault-bad-shader");
    const errors = messages.filter((m) => m.type === "error");
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
    let message = "";
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
      if (prev.deviceLost) {
        resolve();
        return;
      }
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
    shell.drawFrame(draw()); // no-op while fatal
    state.deviceLoss = {
      triggered: true,
      reason: shell.health().lastError?.message ?? "",
      fatalSurface: Boolean(window.__gpuFatal),
    };
    sync();
    return state;
  };

  const api: FaultInjectionApi = { injectBadShader, rejectSubmission, forceDeviceLoss };
  (window as unknown as { __faultInjection?: FaultInjectionApi }).__faultInjection = api;

  function renderPanel() {
    ctx.status.innerHTML = "";
    const intro = el("p", "fault-intro");
    intro.textContent =
      "Force each GPU fault and confirm a visible, correct outcome — never a silent blank canvas.";
    ctx.status.appendChild(intro);
    const controls = el("div", "fault-controls");
    controls.append(
      faultButton("Inject bad shader", () => void injectBadShader()),
      faultButton("Reject submission", () => void rejectSubmission()),
      faultButton("Force device loss", () => void forceDeviceLoss()),
    );
    ctx.status.appendChild(controls);
    ctx.status.insertAdjacentHTML(
      "beforeend",
      reportTable({
        "initial frame": state.initialFrameRendered,
        "bad shader errors": state.badShader ? state.badShader.errorCount : "—",
        "bad shader first": state.badShader?.firstError
          ? `${state.badShader.firstError.line}:${state.badShader.firstError.column} ${state.badShader.firstError.message}`
          : "—",
        "rejected submission": state.rejectedSubmission
          ? `captured=${state.rejectedSubmission.captured}`
          : "—",
        "device loss": state.deviceLoss ? `reason=${state.deviceLoss.reason || "destroyed"}` : "—",
        "fatal surface": state.deviceLoss?.fatalSurface ?? false,
        "shell fatal": state.health.fatal,
      }),
    );
  }

  function faultButton(label: string, onClick: () => void) {
    const button = document.createElement("button");
    button.className = "fault-button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  sync();
}

async function routeFrameShell(ctx: LabContext) {
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 9,
    pitch: 0.38,
    yaw: -0.18,
  });
  const markers = generatedCrowd(80, -10, -9, 0).concat(generatedCrowd(80, 10, 3, 1));
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88]);
  const frameGraphContractFixtures = liveFrameGraphContractFixtures(shell);
  animateSkinned(shell, pipeline, () => markers);
  publish("frame-shell", true, {
    ...shell.stats(),
    markers: markers.length,
    frameGraphContractFixtures,
  });
}

async function routeAssets(ctx: LabContext) {
  const [kit, vat] = await Promise.all([loadPlaceholderKit(), loadPlaceholderVat()]);
  const good = validateSoldierKit(kit);
  const bad = validateSoldierKit(badArtistPackFixture());
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 72,
    pitch: 0.18,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88], vat);
  const soldier = generatedFormation(1, { frame: 1, spacing: 1, faction: 0 });
  animateSkinned(shell, pipeline, () => soldier, { phaseSpeed: 0.35 });
  const placeholderStats = {
    route: "assets",
    report: good,
    badErrors: bad.errors.length,
    clips: placeholderClipNames(kit),
    vat: { width: vat.width, height: vat.height, bones: vat.bones, clips: vat.clips.length },
    importUi: { paste: true, file: true, drop: true },
    imported: null as null | {
      source: string;
      ok: boolean;
      errors: number;
      warnings: number;
      issues: number;
    },
  };
  const publishAssets = (ok: boolean, imported = placeholderStats.imported) => {
    publish("assets", ok, { ...placeholderStats, imported });
  };
  const renderImportResult = (source: string, report: ValidationReport) => {
    const result = ctx.status.querySelector<HTMLElement>("#asset-import-result");
    if (!result) return;
    result.classList.toggle("bad", !report.ok);
    result.innerHTML =
      reportTable({
        imported: source,
        status: report.ok ? "passes manifest contract" : "fails manifest contract",
        errors: report.errors.length,
        warnings: report.warnings.length,
        issues: report.issues.length,
      }) + issueList(report.issues.slice(0, 10));
    publishAssets(report.ok, {
      source,
      ok: report.ok,
      errors: report.errors.length,
      warnings: report.warnings.length,
      issues: report.issues.length,
    });
  };
  const validateText = (source: string, text: string) => {
    try {
      renderImportResult(source, validateSoldierKit(JSON.parse(text)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      renderImportResult(source, {
        ok: false,
        errors: [{ level: "error", code: "manifest.json", path: "manifest", message }],
        warnings: [],
        issues: [{ level: "error", code: "manifest.json", path: "manifest", message }],
      });
    }
  };
  const badSample = JSON.stringify(badArtistPackFixture(), null, 2);
  ctx.status.innerHTML =
    reportTable({
      route: "assets",
      validation: good.ok ? "placeholder kit passes" : "placeholder kit fails",
      placeholderIssues: good.issues.length,
      badPackErrors: bad.errors.length,
      skeletons: Object.keys(kit.skeletons).length,
      archetypes: Object.keys(kit.archetypes).length,
      clips: placeholderClipNames(kit).join(", "),
      vat: `${vat.width}x${vat.height}`,
    }) +
    `
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
  ` +
    issueList(bad.errors.slice(0, 7));
  const textarea = ctx.status.querySelector<HTMLTextAreaElement>("#asset-manifest-json");
  const validateButton = ctx.status.querySelector<HTMLButtonElement>("#asset-validate-json");
  const fileInput = ctx.status.querySelector<HTMLInputElement>("#asset-file-input");
  const dropZone = ctx.status.querySelector<HTMLElement>("#asset-drop-zone");
  validateButton?.addEventListener("click", () =>
    validateText("pasted manifest", textarea?.value ?? ""),
  );
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    validateText(file.name, await file.text());
  });
  dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag");
  });
  dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("drag"));
  dropZone?.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag");
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    validateText(file.name, await file.text());
  });
  (
    window as unknown as {
      __gpuAssetWorkbench?: { validateManifest: (text: string, source?: string) => void };
    }
  ).__gpuAssetWorkbench = {
    validateManifest: (text, source = "debug manifest") => validateText(source, text),
  };
  publishAssets(good.ok);
}

async function routeCrowdData(ctx: LabContext) {
  const count = Number(ctx.params.get("count") ?? 1000);
  const player = generatedFormation(Math.floor(count / 2), {
    x: -18,
    y: -10,
    faction: 0,
    columns: 34,
    frame: 1,
  });
  const enemy = generatedFormation(count - player.length, {
    x: 18,
    y: 5,
    faction: 1,
    columns: 34,
    frame: 1,
  });
  const instances = player.concat(enemy);
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: -1,
    zoom: 4.8,
    pitch: 0.24,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88]);
  animateSkinned(shell, pipeline, () => instances);
  const packed = buildCrowdInstances(toCrowdBuildInputs(instances));
  publish("crowd-data", true, {
    route: "crowd-data",
    stats: packed.stats,
    packedFloats: packed.packed.length,
  });
}

async function routeAnimationState(ctx: LabContext) {
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 13,
    pitch: 0.2,
    yaw: 0,
  });
  const markers = generatedFormation(12, { frame: 1 }).map((instance, i) => ({
    ...instance,
    x: (i - 5.5) * 2.4,
    y: i % 2 ? 1.4 : -1.4,
    facing: Math.PI / 2,
    faction: (i % 2) as 0 | 1,
  }));
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88]);
  animateSkinned(shell, pipeline, () => markers, { size: 1.3 });
  const rows = Array.from({ length: 12 }, (_, frame) => {
    const state = animationForFrame(frame, 240, frame * 19, frame !== 4);
    return `<tr><td>${frame}</td><td>${state.clip}</td><td>${state.phase.toFixed(3)}</td><td>${state.loop}</td></tr>`;
  }).join("");
  ctx.status.innerHTML = `<table><tr><th>frame</th><th>clip</th><th>phase</th><th>loop</th></tr>${rows}</table>`;
  publish("animation-state", true, { frames: 12 });
}

async function routeSkinnedSoldier(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  const phase = numberParam(ctx.params, "phase", 0);
  const classId = integerParam(ctx.params, "class", 0, 0, PLACEHOLDER_RENDER_CLASS_COUNT - 1);
  const frame = integerParam(ctx.params, "frame", 1, 0, 11);
  const faction = integerParam(ctx.params, "team", 0, 0, 1) as 0 | 1;
  const facing = numberParam(ctx.params, "facing", Math.PI / 2);
  const clip = ctx.params.get("clip") ?? "march";
  const shell = await createConfiguredShell(ctx.canvas, {
    x: numberParam(ctx.params, "x", 0),
    y: numberParam(ctx.params, "y", 0),
    zoom: numberParam(ctx.params, "zoom", 86),
    pitch: numberParam(ctx.params, "pitch", 1.1),
    yaw: numberParam(ctx.params, "yaw", 0),
  });
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88], vat);
  const soldier = generatedFormation(1, { frame, spacing: 1, faction, classId }).map((inst) => ({
    ...inst,
    facing,
  }));
  animateSkinned(shell, pipeline, () => soldier, {
    phaseOffset: phase,
    forcedClip: clip,
    phaseSpeed: 0,
    size: numberParam(ctx.params, "size", 1),
  });
  ctx.status.innerHTML = reportTable({
    route: "skinned-soldier",
    classId,
    frame,
    clip,
    phase,
    facing: facing.toFixed(2),
    vertices: pipeline.stats().vertices,
    variants: pipeline.stats().meshVariants,
    vat: `${vat.width}x${vat.height}`,
  });
  publish("skinned-soldier", true, { ...pipeline.stats(), classId, frame, clip, phase, facing });
}

async function routeSkinnedCrowd(ctx: LabContext) {
  const count = Number(ctx.params.get("count") ?? 2000);
  const vat = await loadPlaceholderVat();
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: -2,
    zoom: 5.2,
    pitch: 1.1,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88], vat);
  const instances = generatedFormation(Math.floor(count / 2), {
    x: -20,
    y: -12,
    faction: 0,
    columns: 40,
    frame: 1,
  }).concat(
    generatedFormation(Math.ceil(count / 2), { x: 20, y: 4, faction: 1, columns: 40, frame: 8 }),
  );
  animateSkinned(shell, pipeline, () => instances, { phaseSpeed: 0.45 });
  ctx.status.innerHTML = reportTable({
    route: "skinned-crowd",
    count: instances.length,
    drawCalls: pipeline.stats().drawCalls,
    clips: pipeline.stats().clips.join(", "),
  });
  publish("skinned-crowd", true, { ...pipeline.stats(), count: instances.length });
}

async function routeSkinnedDepth(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  // Oblique review pitch: camera3d vertical scale is sin(pitch), so the old
  // near-top-down 0.18 collapsed soldiers to a few pixels. sin(1.1) ≈ 0.89
  // keeps the silhouette close to the pre-collapse full-z look.
  const camera = { x: 0, y: 0, zoom: 92, pitch: 1.1, yaw: 0 };
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88], vat);
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
      clip: "idle",
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
      clip: "idle",
      phase: 0.15,
      seed: 22,
      mounted: true,
      lod: 0,
    },
  ];
  pipeline.upload(instances, { forcedClip: "idle", phaseOffset: 0, size: 1.35 });
  const ground = new LabGroundPass(shell, [-4, -3, 8, 6]);
  shell.drawFrame({
    clear: { r: 0.7, g: 0.78, b: 0.62, a: 1 },
    passes: [
      labGroundFramePass(ground, "skinned-depth-ground"),
      {
        id: "skinned-depth-crowd",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => pipeline.draw(pass),
      },
    ],
  });
  const shellStats = shell.stats();
  const sampleCamera = chartCameraSnapshot(camera, shellStats.width, shellStats.height);
  const [sampleX, sampleY] = world3dToScreen(sampleCamera, -0.52 * 1.35, frontY, 1.36 * 1.35);
  const sample = { x: sampleX, y: sampleY, world: [-0.52 * 1.35, frontY, 1.36 * 1.35] };
  ctx.status.innerHTML = reportTable({
    route: "skinned-depth",
    contract: "front soldier is drawn before rear bucket",
    frontClass,
    rearClass,
    drawCalls: pipeline.stats().drawCalls,
    depth: shellStats.depth.allocated ? shellStats.depth.format : "none",
  });
  publish("skinned-depth", true, {
    ...pipeline.stats(),
    frontClass,
    rearClass,
    hostileDrawOrder: `front-class-${frontClass}-submitted-before-rear-class-${rearClass}`,
    sample,
    depth: shellStats.depth,
    framePhases: shellStats.phases,
  });
}

async function routeLod(ctx: LabContext) {
  const zoom = Number(ctx.params.get("zoom") ?? 5);
  const instances = generatedFormation(900, {
    x: -16,
    y: -10,
    faction: 0,
    columns: 30,
    frame: 1,
  }).concat(generatedFormation(900, { x: 16, y: 4, faction: 1, columns: 30, frame: 1 }));
  const lods = assignCrowdLods(instances, zoom);
  const counts = countLods(lods);
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: -1, zoom, pitch: 0.24, yaw: 0 });
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88]);
  const renderInstances = instances.map((instance, i) => ({ ...instance, lod: lods[i].level }));
  animateSkinned(shell, pipeline, () => renderInstances);
  ctx.status.innerHTML = reportTable({
    route: "lod",
    zoom,
    L0: counts.l0,
    L1: counts.l1,
    L2: counts.l2,
    L3: counts.l3,
  });
  publish("lod", true, { counts, zoom });
}

async function routeBattle(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: -3,
    zoom: 4.6,
    pitch: 0.34,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88], vat);
  const instances = generatedFormation(1200, {
    x: -21,
    y: -13,
    faction: 0,
    columns: 42,
    frame: 1,
  }).concat(generatedFormation(1200, { x: 21, y: 5, faction: 1, columns: 42, frame: 8 }));
  animateSkinned(shell, pipeline, () => instances, { phaseSpeed: 0.5 });
  ctx.status.innerHTML = reportTable({
    route: "battle",
    placeholderSoldiers: instances.length,
    renderer: "raw WebGPU",
    ui: "lab surface",
  });
  publish("battle", true, { ...pipeline.stats(), soldiers: instances.length });
}

async function routeCampaignMap(ctx: LabContext) {
  const [{ default: initWasm, Campaign }, { data, mapJson }] = await Promise.all([
    import("../../../web/src/wasm/game_wasm.js"),
    loadCampaignData(),
  ]);
  const wasm = await initWasm();
  const campaign = new Campaign(mapJson, 0x5eed_2026, 0);
  const views = readCampaignViews(campaign, wasm);
  const field = new TerrainField(data);
  const surface = campaignSurface(field);
  const territoryData = new Territory(data, field);
  territoryData.rebuild(views.cities);
  const preset = ctx.params.get("preset") ?? "whole";
  const camera = campaignPresetCamera(preset);
  const shell = await createConfiguredShell(ctx.canvas, camera);
  // The sea shimmer rides cam.time (pitch-gated); snap at a fixed t for deterministic
  // shots (default 0 = the still painted chart, matching production snapshots).
  shell.setTime(numberParam(ctx.params, "t", 0));
  const map = new CampaignMapPass(shell, data.bg, data.bgRect, { seaTintMix: 1 }, surface.mesh);
  const clouds = new CampaignCloudPass(shell, data.bgRect);
  const territory = new CampaignTerritoryPass(
    shell,
    {
      width: field.w,
      height: field.h,
      rgba: territoryData.rgba,
      rect: data.bgRect,
    },
    map.drawnCoast,
    undefined,
    surface.mesh,
  );
  const lines = new CampaignWorldLinePass(shell, "triangle-list");
  const roads = new CampaignRoadPass(shell);
  const borders = new CampaignWorldLinePass(shell);
  const labelPass = new CampaignLabelPass(shell);
  const drawData = buildCampaignMapDrawData(data, {
    roadScale: 0.78,
    // Same sampler split as production (web/src/campaign/renderer.ts): the
    // coarse area statistic fits sea labels, the full-res mask culls roads.
    surfaceAt: (x, y) => (surface.landAt(x, y, 10.5) ? "land" : "water"),
    roadSurfaceAt: (x, y) => (field.renderLandAt(x, y) ? "land" : "water"),
    heightAt: surface.heightAt,
  });
  lines.upload(drawData.lineVertices);
  roads.upload(drawData.roadMeshVertices);
  borders.upload(campaignBorderVertices(territoryData.borders));
  const labels = drawData.labels.concat(campaignFactionLabels(territoryData.labels));
  const labelLayer = labelPass.upload(labels, chartSnapshot(camera, shell));
  shell.drawFrame({
    clear: { r: 0.68, g: 0.72, b: 0.69, a: 1 },
    passes: [
      {
        id: "campaign-map-surface",
        role: "world-depth-fill",
        phase: "world-depth",
        depth: "write",
        draw: (pass) => map.draw(pass),
      },
      {
        id: "campaign-territory-wash",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => territory.draw(pass),
      },
      {
        id: "campaign-borders",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => borders.draw(pass),
      },
      {
        id: "campaign-roads",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => roads.draw(pass),
      },
      {
        id: "campaign-sea-lanes-depth",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => lines.draw(pass),
      },
      {
        id: "campaign-clouds",
        role: "overlay-effect",
        phase: "overlay",
        draw: (pass) => clouds.draw(pass),
      },
      {
        id: "campaign-labels",
        role: "overlay-ui",
        phase: "overlay",
        draw: (pass) => labelPass.draw(pass),
      },
    ],
  });
  ctx.status.innerHTML = reportTable({
    route: "campaign-map",
    preset,
    roads: drawData.stats.roads,
    seaLanes: drawData.stats.seaLanes,
    labels: `${labelLayer.visibleLabels}/${labelLayer.labels}`,
    factions: territoryData.labels.length,
    borders: borders.stats().segments,
    water: 0,
    clouds: clouds.stats().cloudQuads,
    visibleLabels: labelLayer.visibleLabels,
    labelLayer: "raw WebGPU glyph atlas",
    renderer: "raw WebGPU map + territory + atmosphere + labels",
  });
  publish("campaign-map", true, {
    ...drawData.stats,
    preset,
    camera,
    cameraContract: shell.stats().cameraContract,
    labels: labelLayer.labels,
    visibleLabels: labelLayer.visibleLabels,
    collisionCulls: labelLayer.collisionCulls,
    collisionCulledLabels: labelLayer.collisionCulledLabels,
    factions: territoryData.labels.length,
    territoryPixels: territory.stats().pixels,
    borderSegments: borders.stats().segments,
    waterFeatures: 0,
    waterLayer: "map-sea-mask",
    cloudQuads: clouds.stats().cloudQuads,
    labelAtlas: `${labelLayer.atlasWidth}x${labelLayer.atlasHeight}`,
    labelVertices: labelLayer.vertices,
    lineSegments: lines.stats().segments,
    roadTriangles: roads.stats().triangles,
    labelLayer: "raw-gpu-glyph-atlas",
    territoryLayer: "raw-gpu-texture",
    atmosphereLayer: "raw-gpu-clouds",
    postCutoverScreenshots: "renderer-only",
  });
}

async function routeCampaignUi(ctx: LabContext) {
  const [{ default: initWasm, Campaign }, fixture] = await Promise.all([
    import("../../../web/src/wasm/game_wasm.js"),
    loadCampaignUiFixture(),
  ]);
  const wasm = await initWasm();
  const campaign = new Campaign(fixture.mapJson, 0x5eed_2026, 0);
  const data = fixture.data;
  const preset = ctx.params.get("preset") ?? "fixture";
  const camera = campaignPresetCamera(preset);
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const ground = new LabGroundPass(shell, campaignBgTerrainRect(data.bgRect));
  const lines = new CampaignWorldLinePass(shell, "triangle-list");
  const roads = new CampaignRoadPass(shell);
  const entities = new CampaignEntityPass(shell);
  const standards = new SharedStandardPass(shell);
  const selection = new CampaignSelectionPass(shell);
  const labelPass = new CampaignLabelPass(shell);
  const drawData = buildCampaignMapDrawData(data, { roadScale: 0.78 });
  lines.upload(drawData.lineVertices);
  roads.upload(drawData.roadMeshVertices);
  const host = ctx.canvas.parentElement ?? ctx.root;
  host.querySelector(".renderer-campaign-ui")?.remove();
  const uiRoot = document.createElement("div");
  uiRoot.className = "renderer-campaign-ui";
  uiRoot.innerHTML = campaignDomHtml();
  host.appendChild(uiRoot);
  const noop = () => {};
  const topBarStore = createHudStore<CampaignTopBarState>({
    dateText: "",
    goldText: "",
    paused: true,
    speed: 0,
    factionView: false,
    fog: false,
    diploOpen: true,
    classesOpen: true,
  });
  const topBarActions: CampaignTopBarActions = {
    pause: noop,
    speed: noop,
    factions: noop,
    fog: noop,
    diplomacy: noop,
    classes: noop,
    save: noop,
    exit: noop,
  };
  const campaignHud = mountCampaignHud(
    uiRoot.querySelector("#cmp-hud-root")!,
    topBarStore,
    topBarActions,
  );
  const armyPanel = uiRoot.querySelector("#cmp-army") as HTMLDivElement;
  const cityPanel = uiRoot.querySelector("#cmp-city") as HTMLDivElement;
  const diplomacyPanel = uiRoot.querySelector("#cmp-diplomacy") as HTMLDivElement;
  const classesPanel = uiRoot.querySelector("#cmp-classes") as HTMLDivElement;
  const recruitClasses = JSON.parse(campaign.unit_class_names_json()) as string[];
  let views = readCampaignViews(campaign, wasm);
  let selectedArmy = views.armies.find((army) => army.mine)?.id ?? -1;
  if (selectedArmy >= 0) {
    campaign.debug_place(selectedArmy, 1, 0, 4);
    views = readCampaignViews(campaign, wasm);
  }
  let selectedCity = data.map.nodes.findIndex(
    (node) => node.kind === "city" && node.owner === "rome",
  );
  let lastPick = { kind: "initial", army: selectedArmy, city: selectedCity, worldX: 0, worldY: 0 };

  const draw = (reason = "draw") => {
    views = readCampaignViews(campaign, wasm);
    const entityFrame = buildCampaignEntityFrame(
      data,
      views,
      campaign.player_faction(),
      selectedArmy,
      selectedCity,
    );
    entities.upload(entityFrame.entities);
    standards.upload(entityFrame.standards);
    selection.upload(entityFrame.selections);
    const labels = drawData.labels.concat(campaignArmyLabels(views.armies));
    const labelLayer = labelPass.upload(labels, chartSnapshot(camera, shell));
    shell.drawFrame({
      clear: { r: 0.68, g: 0.72, b: 0.69, a: 1 },
      passes: [
        labGroundFramePass(ground, "campaign-ui-ground"),
        {
          id: "campaign-ui-entities-opaque",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass) => entities.drawOpaque(pass),
        },
        {
          id: "campaign-ui-standards-opaque",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass) => standards.drawOpaque(pass),
        },
        {
          id: "campaign-ui-entity-shadows",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass) => entities.drawShadows(pass),
        },
        {
          id: "campaign-ui-standard-shadows",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass) => standards.drawShadows(pass),
        },
        {
          id: "campaign-ui-roads",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass) => roads.draw(pass),
        },
        {
          id: "campaign-ui-sea-lanes-depth",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass) => lines.draw(pass),
        },
        {
          id: "campaign-ui-selection",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass) => selection.draw(pass),
        },
        {
          id: "campaign-ui-labels",
          role: "overlay-ui",
          phase: "overlay",
          draw: (pass) => labelPass.draw(pass),
        },
      ],
    });
    const tick = campaign.current_tick();
    const day = Math.floor(tick / 1440) + 1;
    const mins = tick % 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(Math.floor(mins % 60)).padStart(2, "0");
    topBarStore.set({
      dateText: `Day ${day}, ${hh}:${mm}  PAUSED`,
      goldText: `${campaign.treasury().toLocaleString()} gold`,
      paused: true,
      speed: 0,
      factionView: false,
      fog: false,
      diploOpen: true,
      classesOpen: true,
    });
    const roster =
      selectedArmy < 0
        ? null
        : (JSON.parse(campaign.army_roster_json(selectedArmy)) as ArmyRosterRow[] | null);
    if (selectedArmy < 0 || !roster) {
      campaignHud.setArmy(null);
    } else {
      const armyId = selectedArmy;
      const me = views.armies.find((army) => army.id === armyId);
      campaignHud.setArmy({
        armyId,
        roster,
        me,
        buddy: undefined,
        spotIdx: -1,
        autoReplenish: campaign.army_auto_replenish(armyId),
        onAutoReplenish: (on) => {
          campaign.order_auto_replenish(armyId, on);
          draw("replenish");
        },
        onHalt: noop,
        onAmbush: noop,
        onCamp: noop,
        onSplit: noop,
        onMerge: noop,
      });
    }
    const city = selectedCity < 0 ? undefined : views.cities.get(selectedCity);
    const detail = city
      ? (JSON.parse(campaign.city_json(selectedCity)) as CityDetail | null)
      : null;
    if (!city || !detail) {
      campaignHud.setCity(null);
    } else {
      const node = data.map.nodes[selectedCity];
      campaignHud.setCity({
        name: node.name,
        tier: node.tier,
        factionName: data.map.factions[city.owner]?.name ?? "?",
        garrison: city.garrison,
        queue: city.queue,
        mineCity: city.owner === campaign.player_faction(),
        detail,
        recruitClasses,
        onPolicy: noop,
        onRecruit: noop,
      });
    }
    const diplomacy = JSON.parse(campaign.diplomacy_json()) as DiplomacyRow[];
    campaignHud.setDiplomacy({ list: diplomacy, onAction: noop });
    const classRows = JSON.parse(campaign.class_doctrine_json()) as ClassDoctrineRow[];
    campaignHud.setClasses({
      rows: classRows,
      onSelectUnit: noop,
      onSelectSize: noop,
      onApply: noop,
    });
    const uiStats = {
      armyPanel: armyPanel.style.display !== "none",
      cityPanel: cityPanel.style.display !== "none",
      diplomacyRows: diplomacyPanel.querySelectorAll(".cmp-diplo-row").length,
      classRows: classesPanel.querySelectorAll(".cmp-class-row").length,
      autoReplenishToggle: armyPanel.querySelector("#cmp-auto-replenish") !== null,
      rendererSurfaces: 3,
      domSurfaces: 5,
      postCutoverScreenshots: "renderer-only",
    };
    ctx.status.innerHTML = reportTable({
      route: "campaign-ui",
      fixture: fixture.kind,
      reason,
      armies: views.armies.length,
      cities: views.cities.size,
      selectedArmy,
      selectedCity,
      entities: entityFrame.entities.length,
      standards: entityFrame.standards.length,
      selections: entityFrame.selections.length,
      labels: `${labelLayer.visibleLabels}/${labelLayer.labels}`,
      panels: `army:${uiStats.armyPanel} city:${uiStats.cityPanel}`,
      renderer: "raw WebGPU campaign entities + retained DOM panels",
    });
    publishCampaignUiDebug(ctx.canvas, camera, views, selectedArmy, selectedCity, lastPick);
    publish("campaign-ui", true, {
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
      standards: entityFrame.standards.length,
      standardLayer: standards.stats().layer,
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
      postCutoverScreenshots: "renderer-only",
    });
  };

  ctx.canvas.addEventListener("click", (event) => {
    const hit = campaignPick(
      event.clientX,
      event.clientY,
      ctx.canvas,
      camera,
      shell.stats(),
      data,
      views,
    );
    selectedArmy = hit.army;
    if (hit.army >= 0) selectedCity = -1;
    else selectedCity = hit.city;
    lastPick = {
      kind: hit.kind,
      army: hit.army,
      city: hit.city,
      worldX: hit.worldX,
      worldY: hit.worldY,
    };
    draw("click");
  });
  ctx.canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (selectedArmy < 0) return;
    const world = campaignCssToWorld(
      event.clientX,
      event.clientY,
      ctx.canvas,
      camera,
      shell.stats(),
    );
    const loc = nearestLoc(data.map, world.x, world.y, 60 / camera.zoom);
    if (loc) campaign.order_move(selectedArmy, loc.kind, loc.a, loc.b);
    draw("order");
  });

  draw();
}

interface LabGroundShaderStyle {
  oliveLow: string;
  oliveHigh: string;
  dry: string;
  lightFleckLow: string;
  lightFleckHigh: string;
  darkFleckLow: string;
  darkFleckHigh: string;
  stoneFleckLow: string;
  stoneFleckHigh: string;
  speckleStrength: string;
  dryMixBase: string;
  trampleMix: string;
  stubbleColor: string;
  stubbleStrength: string;
  darkFleckColor: string;
  darkFleckStrength: string;
  stoneFleckStrength: string;
  dustStrength: string;
  aerialStrength: string;
}

const LAB_GROUND_STYLE: LabGroundShaderStyle = {
  oliveLow: 'vec3f(0.43, 0.56, 0.22)',
  oliveHigh: 'vec3f(0.66, 0.69, 0.33)',
  dry: 'vec3f(0.76, 0.67, 0.39)',
  lightFleckLow: '0.884',
  lightFleckHigh: '0.990',
  darkFleckLow: '0.820',
  darkFleckHigh: '0.982',
  stoneFleckLow: '0.924',
  stoneFleckHigh: '0.996',
  speckleStrength: '0.315',
  dryMixBase: '0.22',
  trampleMix: '0.15',
  stubbleColor: 'vec3f(0.53, 0.48, 0.25)',
  stubbleStrength: '0.055',
  darkFleckColor: 'vec3f(0.47, 0.43, 0.32)',
  darkFleckStrength: '0.38',
  stoneFleckStrength: '0.30',
  dustStrength: '0.14',
  aerialStrength: '0.22',
};

function labGroundWgsl(style: LabGroundShaderStyle) {
  return `
${WORLD_CAMERA_WGSL}
struct VsOut { @builtin(position) pos: vec4f, @location(0) world: vec2f, @location(1) dist: f32 };
@vertex
fn vs(@location(0) world: vec2f) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld(vec3f(world, 0.0));
  out.world = world;
  out.dist = length(world - cam.focus);
  return out;
}
fn hash(p: vec2f) -> f32 {
  let p3 = fract(vec3f(p.xyx) * 0.1031);
  let q = p3 + dot(p3, p3.yzx + vec3f(33.33));
  return fract((q.x + q.y) * q.z);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
    mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x),
    u.y,
  );
}
fn ridged(p: vec2f) -> f32 {
  let r = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
  return r * r;
}
fn groundHeight(p: vec2f) -> f32 {
  let broad = vnoise(p * 0.018 + vec2f(8.1, 2.4)) * 0.58;
  let folds = ridged(vec2f(p.x * 0.052 + p.y * 0.018, p.y * 0.038 - p.x * 0.012)) * 0.26;
  let scratch = ridged(vec2f(p.x * 0.42 + p.y * 0.09, p.y * 0.26)) * 0.16;
  return broad + folds + scratch;
}
@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let fine = vnoise(in.world * 2.2);
  let mid = vnoise(in.world * 0.47 + vec2f(5.2, 1.8));
  let broad = vnoise(in.world * 0.085 + vec2f(0.7, 9.3));
  let relief = groundHeight(in.world);
  let hx = groundHeight(in.world + vec2f(1.8, 0.0)) - relief;
  let hy = groundHeight(in.world + vec2f(0.0, 1.8)) - relief;
  let sun = normalize(vec3f(-0.46, -0.34, 0.82));
  let normal = normalize(vec3f(-hx * 1.45, -hy * 1.45, 1.0));
  let lambert = clamp(dot(normal, sun), 0.0, 1.0);
  let grazing = smoothstep(0.16, 0.86, ridged(vec2f(in.world.x * 0.12 + in.world.y * 0.03, in.world.y * 0.09)));
  let olive = mix(${style.oliveLow}, ${style.oliveHigh}, mid * 0.66 + fine * 0.16 + relief * 0.18);
  let dry = ${style.dry};
  let scrubPatch = smoothstep(0.50, 0.86, broad) * (1.0 - smoothstep(0.86, 0.98, fine));
  let trample = smoothstep(0.72, 0.98, vnoise((in.world + vec2f(13.0, -7.0)) * 0.18));
  let rakedDust = smoothstep(0.58, 0.92, grazing) * (0.08 + relief * 0.08);
  let seed = floor(in.world * 6.8);
  let fleck = hash(seed);
  let blade = hash(seed + vec2f(19.0, 41.0));
  let pebble = hash(seed + vec2f(73.0, 11.0));
  let stubble = smoothstep(0.66, 0.95, ridged(vec2f(in.world.x * 1.26 + in.world.y * 0.18, in.world.y * 0.84)));
  let lightFleck = smoothstep(${style.lightFleckLow}, ${style.lightFleckHigh}, fleck) * (0.46 + 0.54 * fine);
  let darkFleck = smoothstep(${style.darkFleckLow}, ${style.darkFleckHigh}, blade) * (1.0 - smoothstep(0.76, 0.98, broad));
  let stoneFleck = smoothstep(${style.stoneFleckLow}, ${style.stoneFleckHigh}, pebble) * (0.36 + relief * 0.46);
  let speckle = lightFleck * ${style.speckleStrength};
  var grass = mix(olive, dry, ${style.dryMixBase} + trample * ${style.trampleMix});
  grass = mix(grass, vec3f(0.31, 0.39, 0.18), scrubPatch * 0.34);
  grass = mix(grass, vec3f(0.88, 0.75, 0.47), rakedDust);
  grass *= 0.70 + lambert * 0.34;
  grass += vec3f(0.13, 0.12, 0.055) * speckle;
  grass = mix(grass, ${style.stubbleColor}, stubble * ${style.stubbleStrength});
  grass = mix(grass, grass * ${style.darkFleckColor}, darkFleck * ${style.darkFleckStrength});
  grass = mix(grass, vec3f(0.46, 0.43, 0.32), stoneFleck * ${style.stoneFleckStrength});
  let dust = ${style.dustStrength} * smoothstep(18.0, 96.0, in.dist);
  let aerial = smoothstep(120.0, 420.0, in.dist);
  let sunBleached = mix(grass, vec3f(0.86, 0.72, 0.46), dust);
  let haze = vec3f(0.78, 0.75, 0.64);
  return vec4f(mix(sunBleached, haze, aerial * ${style.aerialStrength}), 1.0);
}`;
}

class LabGroundPass {
  private readonly pipeline: GPURenderPipeline;
  private readonly vertexBuffer: GPUBuffer;

  constructor(private readonly shell: RawFrameShell, rect: [number, number, number, number]) {
    const module = compileShader(shell.device, labGroundWgsl(LAB_GROUND_STYLE), "lab-ground");
    this.pipeline = shell.device.createRenderPipeline({
      label: "lab-ground-pipeline",
      layout: shell.device.createPipelineLayout({
        bindGroupLayouts: [shell.cameraBindGroupLayout],
      }),
      vertex: {
        module,
        entryPoint: "vs",
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] },
        ],
      },
      fragment: { module, entryPoint: "fs", targets: [{ format: shell.info.format }] },
      primitive: { topology: "triangle-strip" },
      multisample: { count: shell.sampleCount },
    });
    this.vertexBuffer = shell.device.createBuffer({
      label: "lab-ground-quad",
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.setRect(rect);
  }

  draw(pass: BackgroundRenderPass) {
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(4);
  }

  private setRect([x, y, w, h]: [number, number, number, number]) {
    this.shell.device.queue.writeBuffer(
      this.vertexBuffer,
      0,
      new Float32Array([x, y, x + w, y, x, y + h, x + w, y + h]),
    );
  }
}

function labGroundFramePass(ground: LabGroundPass, id: string): FrameGraphPass {
  return {
    id,
    role: "background-underpaint",
    phase: "background",
    draw: (pass) => ground.draw(pass),
  };
}

const MODEL_SHOT_GROUND_DEPTH_WGSL = `
${WORLD_CAMERA_WGSL}
@vertex
fn vs(@location(0) world: vec2f) -> @builtin(position) vec4f {
  return projectWorld(vec3f(world, 0.0));
}
@fragment
fn fs() -> @location(0) vec4f {
  return vec4f(0.0);
}`;

// The fixture ground as a real depth surface, mirroring the production
// campaign frame (campaign-map-surface is a world-depth-fill). Writes reverse-Z
// ground depth without touching color — the lab-owned background terrain stays
// the visual — so below-ground fixtures (the hidden garrison) are genuinely
// underground while ground decals (z ≥ 0.03) still pass their reads.
class ModelShotGroundDepthPass {
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GPUBuffer;

  constructor(private shell: RawFrameShell) {
    const module = compileShader(
      shell.device,
      MODEL_SHOT_GROUND_DEPTH_WGSL,
      "model-shot-ground-depth",
    );
    this.pipeline = shell.device.createRenderPipeline({
      label: "model-shot-ground-depth-pipeline",
      layout: shell.device.createPipelineLayout({
        bindGroupLayouts: [shell.cameraBindGroupLayout],
      }),
      vertex: {
        module,
        entryPoint: "vs",
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [{ format: shell.info.format, writeMask: 0 }],
      },
      primitive: { topology: "triangle-strip" },
      depthStencil: gpuWorldDepthStencil("write"),
    });
    this.vertexBuffer = shell.device.createBuffer({
      label: "model-shot-ground-depth-quad",
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  setRect([x, y, w, h]: [number, number, number, number]) {
    this.shell.device.queue.writeBuffer(
      this.vertexBuffer,
      0,
      new Float32Array([x, y, x + w, y, x, y + h, x + w, y + h]),
    );
  }

  draw(pass: WorldRenderPass) {
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(4);
  }
}

async function routeCampaignModelShots(ctx: LabContext) {
  const gate = campaignModelShot(ctx.params.get("gate"));
  const camera = campaignModelShotCamera(gate);
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const entities = new CampaignEntityPass(shell);
  const standards = new SharedStandardPass(shell);
  const scenery = new CampaignSceneryPass(shell);
  const roads = new CampaignRoadPass(shell);
  const selection = new CampaignSelectionPass(shell);
  const labelPass = new CampaignLabelPass(shell);
  const frame = campaignModelShotFrame(gate);
  const standardLiveries =
    gate === "standard-liveries"
      ? await campaignModelShotStandardLiveries(ctx.canvas, camera)
      : null;
  if (standardLiveries) {
    frame.standards.push(...standardLiveries.standards);
    frame.armyAnchors.push(...standardLiveries.armyAnchors);
    frame.terrainRect = standardLiveries.terrainRect;
  }
  const cityStandardSamples = campaignModelShotCityStandardSamples(gate, ctx.canvas, camera);
  const clouds = frame.cloudRect ? new CampaignCloudPass(shell, frame.cloudRect) : null;
  const markerPass = standardLiveries?.markers.length ? new CampaignMarkerPass(shell) : null;
  entities.upload(frame.entities);
  scenery.upload(frame.scenery);
  roads.upload(frame.roads);
  selection.upload(frame.selections);
  if (markerPass && standardLiveries) markerPass.upload(standardLiveries.markers);
  standards.upload(frame.standards);
  const labelLayer = labelPass.upload(frame.labels, chartSnapshot(camera, shell));
  // Army stacks draw the shared skinned crowd (matching the production campaign
  // renderer), so this isolated 'army'/'garrison-*' review shows the real
  // representative figures + grounding shadow, not just the standard banner.
  let soldierCrowd: SkinnedCrowdPipeline | null = null;
  let soldierShadows: SoldierShadowDecalPass | null = null;
  let modelCrowd: CrowdInstance[] = [];
  if (gate !== "standard-liveries") {
    const soldierKit = await loadPlaceholderKit();
    soldierCrowd = new SkinnedCrowdPipeline(
      shell,
      createPlaceholderSoldierMeshes([0.3, 0.36, 0.74]),
      await loadPlaceholderVat(),
      soldierKit,
    );
    soldierShadows = new SoldierShadowDecalPass(shell);
    const modelStackRoster = [4, 0, 3, 0, 2, 1];
    modelCrowd = frame.armyAnchors.flatMap((entity, i) =>
      buildStackCrowd(modelStackRoster, {
        unitCount: 20,
        stackUnitCap: 20,
        x: entity.x,
        y: entity.y,
        faction: 0,
        seed: 100 + i,
        clip: "idle",
        phase: 0,
        mountedClasses: mountedClassesFromKit(soldierKit),
        spacing: CAMPAIGN_FIGURE_SIZE * 1.1,
        terrainHeight: () => entity.z ?? 0,
      }),
    );
    soldierCrowd.upload(modelCrowd, { size: CAMPAIGN_FIGURE_SIZE });
    soldierShadows.upload(modelCrowd, { radius: 0.62 * CAMPAIGN_FIGURE_SIZE });
  }
  // The occlusion/visibility samples derive from the crowd actually drawn, so
  // the sampled points always have a real soldier where the check expects one.
  const garrisonSamples = campaignModelShotGarrisonSamples(gate, ctx.canvas, camera, modelCrowd);
  const selectionSamples = campaignModelShotSelectionSamples(gate, ctx.canvas, camera, modelCrowd);
  const hostileDepthOrder = gate === "hostile-depth-order";
  const groundDepth = new ModelShotGroundDepthPass(shell);
  groundDepth.setRect(frame.terrainRect);
  const ground = new LabGroundPass(shell, frame.terrainRect);
  const entityOpaquePass: FrameGraphPass = {
    id: "model-shot-entities-opaque",
    role: "world-opaque",
    phase: "world-depth",
    depth: "read-write",
    draw: (pass) => entities.drawOpaque(pass),
  };
  const sceneryOpaquePass: FrameGraphPass = {
    id: "model-shot-scenery-opaque",
    role: "world-opaque",
    phase: "world-depth",
    depth: "read-write",
    draw: (pass) => scenery.drawOpaque(pass),
  };
  const standardsOpaquePass: FrameGraphPass = {
    id: "model-shot-standards-opaque",
    role: "world-opaque",
    phase: "world-depth",
    depth: "read-write",
    draw: (pass) => standards.drawOpaque(pass),
  };
  const passes: FrameGraphPass[] = [
    labGroundFramePass(ground, "model-shot-ground"),
    {
      id: "model-shot-ground-depth",
      role: "world-depth-fill",
      phase: "world-depth",
      depth: "write",
      draw: (pass) => groundDepth.draw(pass),
    },
    ...(hostileDepthOrder
      ? [entityOpaquePass, standardsOpaquePass, sceneryOpaquePass]
      : [sceneryOpaquePass, entityOpaquePass, standardsOpaquePass]),
    ...(soldierCrowd
      ? [
          {
            id: "model-shot-soldier-crowd",
            role: "world-opaque" as const,
            phase: "world-depth" as const,
            depth: "read-write" as const,
            draw: (pass: WorldRenderPass) => soldierCrowd.draw(pass),
          },
        ]
      : []),
    {
      id: "model-shot-scenery-shadows",
      role: "world-decal",
      phase: "world-depth",
      depth: "read",
      draw: (pass) => scenery.drawShadows(pass),
    },
    {
      id: "model-shot-entity-shadows",
      role: "world-decal",
      phase: "world-depth",
      depth: "read",
      draw: (pass) => entities.drawShadows(pass),
    },
    {
      id: "model-shot-standard-shadows",
      role: "world-decal",
      phase: "world-depth",
      depth: "read",
      draw: (pass) => standards.drawShadows(pass),
    },
    ...(soldierShadows
      ? [
          {
            id: "model-shot-soldier-shadows",
            role: "world-decal" as const,
            phase: "world-depth" as const,
            depth: "read" as const,
            draw: (pass: WorldRenderPass) => soldierShadows.draw(pass),
          },
        ]
      : []),
    {
      id: "model-shot-roads",
      role: "world-decal",
      phase: "world-depth",
      depth: "read",
      draw: (pass) => roads.draw(pass),
    },
    {
      id: "model-shot-selection",
      role: "world-decal",
      phase: "world-depth",
      depth: "read",
      draw: (pass) => selection.draw(pass),
    },
    ...(clouds
      ? [
          {
            id: "model-shot-clouds",
            role: "overlay-effect" as const,
            phase: "overlay" as const,
            draw: (pass: OverlayRenderPass) => clouds.draw(pass),
          },
        ]
      : []),
    ...(markerPass
      ? [
          {
            id: "model-shot-markers",
            role: "overlay-ui" as const,
            phase: "overlay" as const,
            draw: (pass: OverlayRenderPass) => markerPass.draw(pass),
          },
        ]
      : []),
    {
      id: "model-shot-labels",
      role: "overlay-ui",
      phase: "overlay",
      draw: (pass) => labelPass.draw(pass),
    },
  ];
  shell.drawFrame({
    clear: { r: 0.09, g: 0.1, b: 0.1, a: 1 },
    passes,
  });
  ctx.status.innerHTML = reportTable({
    route: "campaign-models",
    gate,
    purpose: "isolated campaign model screenshot gate",
    entities: frame.entities.length,
    standards: frame.standards.length,
    scenery: frame.scenery.length,
    roadTriangles: roads.stats().triangles,
    cloudQuads: clouds?.stats().cloudQuads ?? 0,
    labels: `${labelLayer.visibleLabels}/${labelLayer.labels}`,
    markers: markerPass?.stats().markers ?? 0,
    factions: standardLiveries?.factions ?? "n/a",
    cityStandard: cityStandardSamples ? "embedded-depth-sampled" : "n/a",
    garrison: garrisonSamples ? "army-inside-city-depth-sampled" : "n/a",
    selectionDepth: selectionSamples ? "ground-decal-occlusion-sampled" : "n/a",
    hostileDrawOrder: hostileDepthOrder ? "entities-before-late-scenery" : "normal",
    renderer: "raw WebGPU campaign model passes",
  });
  const samples = {
    ...(cityStandardSamples ? { cityStandard: cityStandardSamples } : {}),
    ...(garrisonSamples ? { garrison: garrisonSamples } : {}),
    ...(selectionSamples ? { selectionDepth: selectionSamples } : {}),
    ...(hostileDepthOrder
      ? { hostileDepthOrder: campaignModelShotHostileDepthSamples(ctx.canvas, camera) }
      : {}),
    ...(standardLiveries
      ? {
          liveryCells: standardLiveries.liveryCells,
          standardLiveryGrid: standardLiveries.grid,
        }
      : {}),
    // Drawn crowd anchors (world x, y) — lets scene tooling reason about the
    // review fixture from published data instead of duplicating the stack build.
    crowd: modelCrowd.map((inst) => [inst.x, inst.y]),
  };
  publish("campaign-models", true, {
    route: "campaign-models",
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
    markers: markerPass?.stats().markers ?? 0,
    factions: standardLiveries?.factions,
    labelLayer: labelLayer.layer,
    entityLayer: entities.stats().layer,
    standardLayer: standards.stats().layer,
    standardStats: standards.stats(),
    depth: shell.stats().depth,
    framePhases: shell.stats().phases,
    hostileDrawOrder: hostileDepthOrder ? "entities-before-late-scenery" : "normal",
    samples,
    postCutoverScreenshots: "renderer-only",
  });
}

// Reusable scenery props posed for model-sheet review: each family alone on
// neutral ground, no cities, labels, roads, water, or fog. The compositions are
// owned by the shared prop registry so battle and campaign review the same poses.
async function routeSharedPropModelShots(ctx: LabContext) {
  const requested = ctx.params.get("gate");
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
  const ground = new LabGroundPass(shell, [-18, -12, 36, 24]);
  shell.drawFrame({
    clear: { r: 0.09, g: 0.1, b: 0.1, a: 1 },
    passes: [
      labGroundFramePass(ground, "shared-prop-ground"),
      {
        id: "shared-prop-opaque",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => scenery.drawOpaque(pass),
      },
      {
        id: "shared-prop-shadows",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => scenery.drawShadows(pass),
      },
    ],
  });
  ctx.status.innerHTML = reportTable({
    route: "shared-prop-models",
    gate: group.id,
    purpose: "isolated shared scenery prop model sheet",
    props: instances.length,
    renderer: "raw WebGPU shared scenery library meshes",
  });
  publish("shared-prop-models", true, {
    route: "shared-prop-models",
    gate: group.id,
    camera,
    props: instances.length,
    sceneryStats: scenery.stats(),
    depth: shell.stats().depth,
    framePhases: shell.stats().phases,
    postCutoverScreenshots: "renderer-only",
  });
}

// Shared standard review: one gate per size tier x faction livery. The route
// deliberately consumes the shared asset/pass, not the campaign army marker or
// DOM banner approximations, so slices 11/13 can port the same contract.
// Review-only config (cameras, gate table) lives here; the asset module carries
// only the production contract.
const STANDARD_REVIEW_FACTIONS = ["azure", "crimson"] as const;

// The look-at point sits on the ground plane, so a tall standard extends
// up-screen from its base: aim north of the pole by ~cloth mid-height
// (compensated through the pitch) to center the flag, and zoom so the full
// pole + finial fills the frame height with margin.
const STANDARD_REVIEW_CAMERA_BY_TIER: Record<StandardSizeTier, ChartCameraSpec> = {
  "battle-unit": { x: 0.05, y: 4.4, zoom: 90, pitch: 1.08, yaw: -0.05 },
  "campaign-army": { x: 0.05, y: 5.1, zoom: 68, pitch: 1.08, yaw: -0.05 },
  "settlement-banner": { x: 0.05, y: 8.1, zoom: 53, pitch: 1.08, yaw: -0.05 },
};

const STANDARD_REVIEW_GATES = STANDARD_SIZE_TIER_IDS.flatMap((tier) =>
  STANDARD_REVIEW_FACTIONS.map((factionId) => ({
    id: `${tier}-${factionId}`,
    tier,
    factionId,
    camera: STANDARD_REVIEW_CAMERA_BY_TIER[tier],
    windPhase: standardWindPhase(standardSeed(tier, factionId)),
    windStrength: standardWindStrength(tier),
    timeSeconds: 0.75,
  })),
);

async function routeSharedStandardModelShots(ctx: LabContext) {
  const gate =
    STANDARD_REVIEW_GATES.find((candidate) => candidate.id === ctx.params.get("gate")) ??
    STANDARD_REVIEW_GATES[0];
  const timeSeconds = numberParam(ctx.params, "time", gate.timeSeconds);
  const shell = await createConfiguredShell(ctx.canvas, gate.camera);
  shell.setTime(timeSeconds);
  const standards = new SharedStandardPass(shell);
  const instance: StandardInstance = {
    x: 0,
    y: 0,
    tier: gate.tier,
    factionId: gate.factionId,
    yaw: -0.02,
    windPhase: gate.windPhase,
    windStrength: numberParam(ctx.params, "windStrength", gate.windStrength),
  };
  standards.upload([instance]);
  const ground = new LabGroundPass(shell, [-9, -6, 18, 13]);
  shell.drawFrame({
    clear: { r: 0.09, g: 0.1, b: 0.1, a: 1 },
    passes: [
      labGroundFramePass(ground, "shared-standard-ground"),
      {
        id: "shared-standard-opaque",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => standards.drawOpaque(pass),
      },
      {
        id: "shared-standard-shadow",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => standards.drawShadows(pass),
      },
    ],
  });
  const stats = standards.stats();
  ctx.status.innerHTML = reportTable({
    route: "shared-standard-models",
    gate: gate.id,
    tier: gate.tier,
    faction: gate.factionId,
    purpose: "isolated shared 3D standard model sheet",
    timeSeconds: timeSeconds.toFixed(2),
    windPhase: gate.windPhase.toFixed(3),
    windStrength: instance.windStrength?.toFixed(3) ?? gate.windStrength.toFixed(3),
    renderer: "raw WebGPU shared standard asset",
  });
  publish("shared-standard-models", true, {
    route: "shared-standard-models",
    gate: gate.id,
    tier: gate.tier,
    faction: gate.factionId,
    camera: gate.camera,
    timeSeconds,
    windPhase: gate.windPhase,
    windStrength: instance.windStrength ?? gate.windStrength,
    reviewGates: STANDARD_REVIEW_GATES.map((reviewGate) => reviewGate.id),
    ...stats,
    cameraContract: shell.stats().cameraContract,
    depth: shell.stats().depth,
    framePhases: shell.stats().phases,
    postCutoverScreenshots: "renderer-only",
  });
}

type CampaignModelShot =
  | "city"
  | "garrison-outside"
  | "garrison-city"
  | "garrison-hidden"
  | "hostile-depth-order"
  | "town"
  | "army"
  | "road"
  | "road-only"
  | "selected-city"
  | "standard-liveries"
  | "labels"
  | "terrain-grass-scrub"
  | "terrain-stone-relief"
  | "cloud-fog";

const CAMPAIGN_MODEL_SHOTS: CampaignModelShot[] = [
  "city",
  "garrison-outside",
  "garrison-city",
  "garrison-hidden",
  "hostile-depth-order",
  "town",
  "army",
  "road",
  "road-only",
  "selected-city",
  "standard-liveries",
  "labels",
  "terrain-grass-scrub",
  "terrain-stone-relief",
  "cloud-fog",
];

const MODEL_SHOT_CITY_POSITION: [number, number] = [0.0, -1.8];
const MODEL_SHOT_CITY_RADIUS = 6.6;
const MODEL_SHOT_GARRISON_ARMY_POSITION: [number, number] = [0.65, -1.65];
const MODEL_SHOT_OUTSIDE_GARRISON_ARMY_POSITION: [number, number] = [-7.1, -1.85];
const MODEL_SHOT_HIDDEN_GARRISON_ARMY_POSITION: [number, number] = [0.0, 3.0];
const MODEL_SHOT_GARRISON_ARMY_RADIUS = 7.0;
// Deep enough that the WHOLE standard (mesh top ≈ 7.9 world after army scale)
// sits below z = 0, so the route's ground depth-fill genuinely buries it —
// under one true projector "hidden" means occluded, not painted last.
const MODEL_SHOT_HIDDEN_GARRISON_Z = -8.0;
// The hostile-depth-order late tree: behind (north of) the city flag with its
// canopy volume kept strictly north of the cloth plane (canopy min y
// = y − (0.19 + 0.40)·size > flag y ≈ −1.75), so along the flag's sightline
// the earlier-drawn flag is genuinely NEARER and only depth (not submit
// order) keeps it visible in front of the late scenery bucket.
const MODEL_SHOT_LATE_TREE = { x: -1.34, y: 3.1, size: 8.0 };

function campaignModelShot(value: string | null): CampaignModelShot {
  return CAMPAIGN_MODEL_SHOTS.includes(value as CampaignModelShot)
    ? (value as CampaignModelShot)
    : "city";
}

function campaignModelShotCamera(gate: CampaignModelShot) {
  // Occlusion gates (city/garrison/selection/hostile-depth) need the oblique
  // review pitch so vertical city geometry occludes again under camera3d
  // (sightline to the embedded cloth must pass through the wall/roof volume);
  // the ground-centric gates keep their original chart-like framing.
  // Framed for the reference-scale settlement banner: the pole tops out
  // ~15 world units, so the close gates aim higher and pull back to keep
  // finial-to-ground in frame.
  const close = { x: 0, y: 3.2, zoom: 20, pitch: 1.05, yaw: 0 };
  // The outside garrison stands west of the city; recentre between them so the
  // army body (its west shield reaches x ≈ −9.3) stays fully in frame.
  if (gate === "garrison-outside") return { ...close, x: -2.2 };
  // Zoom 10 keeps every livery cell (and its screen-space marker) inside the
  // 970 px lab canvas: the perspective pitch widens the bottom rows, and at
  // zoom 12 corner markers projected off-canvas, so their pixel gates sampled
  // clamped garbage. y = -4 lifts the grid so the bottom row's standards sit
  // fully in frame (the top rows have headroom, the models rise upward).
  if (gate === "standard-liveries") return { x: 0, y: -4, zoom: 10, pitch: 0.54, yaw: 0 };
  if (gate === "road" || gate === "road-only")
    return { x: 0, y: -1.3, zoom: 30, pitch: 0.54, yaw: 0 };
  if (gate === "terrain-grass-scrub") return { x: 0, y: -0.3, zoom: 40, pitch: 0.56, yaw: 0 };
  if (gate === "terrain-stone-relief") return { x: 0, y: -0.4, zoom: 40, pitch: 0.56, yaw: 0 };
  if (gate === "cloud-fog") return { x: 0, y: 0, zoom: 26, pitch: 0.5, yaw: 0 };
  return close;
}

function campaignModelShotFrame(gate: CampaignModelShot) {
  const red: [number, number, number] = [0.7, 0.18, 0.16];
  const amber: [number, number, number] = [0.58, 0.52, 0.42];
  const green: [number, number, number] = [0.31, 0.82, 0.39];
  const neutral: [number, number, number] = [0.93, 0.78, 0.3];
  const entities: CampaignEntityInstance[] = [];
  const standards: StandardInstance[] = [];
  const armyAnchors: { x: number; y: number; z?: number }[] = [];
  const scenery: CampaignSceneryInstance[] = [];
  const selections: CampaignSelectionInstance[] = [];
  const labels: CampaignLabel[] = [];
  let roads: Float32Array<ArrayBufferLike> = new Float32Array();
  let terrainRect: [number, number, number, number] = [-18, -12, 36, 24];
  let cloudRect: { min: [number, number]; max: [number, number] } | null = null;
  const addCity = (
    x: number,
    y: number,
    radius: number,
    text: string,
    faction = red,
    allegiance = green,
    selected = false,
    settlementBanner = true,
  ) => {
    entities.push({ x, y, radius, faction, allegiance, kind: "city", strength: 1 });
    if (settlementBanner) {
      const scale = campaignSettlementStandardScale(radius);
      standards.push({
        x: x + 0.08 * scale,
        y: y + 0.04 * scale,
        tier: "settlement-banner",
        factionId: "azure",
        livery: { field: faction },
        scale,
        windPhase: standardWindPhase(standardSeed("settlement-banner", `model-city:${text}`)),
      });
    }
    labels.push({
      text,
      x,
      y: y - 4.7,
      kind: "city",
      size: 14,
      priority: 5,
      icon: "city",
      iconColor: allegiance,
    });
    if (selected)
      selections.push({ x, y, z: 0, radius: radius * 1.34, color: green, kind: "city" });
  };
  const addArmy = (x: number, y: number, selected = false) => {
    const radius = 5.5;
    standards.push({
      x,
      y,
      tier: "campaign-army",
      factionId: "azure",
      livery: { field: red },
      scale: campaignArmyStandardScale(radius),
      windPhase: standardWindPhase(standardSeed("campaign-army", `model-army:${x}:${y}`)),
    });
    armyAnchors.push({ x, y });
    labels.push({
      text: "1ST LEGION",
      x,
      y,
      kind: "army",
      size: 13,
      priority: 5,
      icon: "army",
      iconColor: green,
      screenOffsetY: 54,
    });
    if (selected) selections.push({ x, y, z: 0, radius: 6.5, color: green, kind: "army" });
  };

  if (gate === "city")
    addCity(
      MODEL_SHOT_CITY_POSITION[0],
      MODEL_SHOT_CITY_POSITION[1],
      MODEL_SHOT_CITY_RADIUS,
      "ROMA",
      red,
      green,
      true,
    );
  if (gate === "hostile-depth-order") {
    addCity(
      MODEL_SHOT_CITY_POSITION[0],
      MODEL_SHOT_CITY_POSITION[1],
      MODEL_SHOT_CITY_RADIUS,
      "ROMA",
      red,
      green,
      true,
    );
    scenery.push({
      x: MODEL_SHOT_LATE_TREE.x,
      y: MODEL_SHOT_LATE_TREE.y,
      size: MODEL_SHOT_LATE_TREE.size,
      kind: "broadleaf",
      shade: 0.72,
    });
  }
  if (gate === "garrison-outside") {
    addCity(
      MODEL_SHOT_CITY_POSITION[0],
      MODEL_SHOT_CITY_POSITION[1],
      MODEL_SHOT_CITY_RADIUS,
      "ROMA",
      red,
      green,
      true,
    );
    standards.push({
      x: MODEL_SHOT_OUTSIDE_GARRISON_ARMY_POSITION[0],
      y: MODEL_SHOT_OUTSIDE_GARRISON_ARMY_POSITION[1],
      tier: "campaign-army",
      factionId: "azure",
      livery: { field: [0.16, 0.34, 0.78] },
      scale: campaignArmyStandardScale(MODEL_SHOT_GARRISON_ARMY_RADIUS),
      windPhase: standardWindPhase(standardSeed("campaign-army", "model-garrison-outside")),
    });
    armyAnchors.push({
      x: MODEL_SHOT_OUTSIDE_GARRISON_ARMY_POSITION[0],
      y: MODEL_SHOT_OUTSIDE_GARRISON_ARMY_POSITION[1],
    });
  }
  if (gate === "garrison-city") {
    addCity(
      MODEL_SHOT_CITY_POSITION[0],
      MODEL_SHOT_CITY_POSITION[1],
      MODEL_SHOT_CITY_RADIUS,
      "ROMA",
      red,
      green,
      true,
      false,
    );
    standards.push({
      x: MODEL_SHOT_GARRISON_ARMY_POSITION[0],
      y: MODEL_SHOT_GARRISON_ARMY_POSITION[1],
      tier: "campaign-army",
      factionId: "azure",
      livery: { field: [0.16, 0.34, 0.78] },
      scale: campaignArmyStandardScale(MODEL_SHOT_GARRISON_ARMY_RADIUS),
      windPhase: standardWindPhase(standardSeed("campaign-army", "model-garrison-city")),
    });
    armyAnchors.push({
      x: MODEL_SHOT_GARRISON_ARMY_POSITION[0],
      y: MODEL_SHOT_GARRISON_ARMY_POSITION[1],
    });
  }
  if (gate === "garrison-hidden") {
    addCity(
      MODEL_SHOT_CITY_POSITION[0],
      MODEL_SHOT_CITY_POSITION[1],
      MODEL_SHOT_CITY_RADIUS,
      "ROMA",
      red,
      green,
      true,
      false,
    );
    standards.push({
      x: MODEL_SHOT_HIDDEN_GARRISON_ARMY_POSITION[0],
      y: MODEL_SHOT_HIDDEN_GARRISON_ARMY_POSITION[1],
      z: MODEL_SHOT_HIDDEN_GARRISON_Z,
      tier: "campaign-army",
      factionId: "azure",
      livery: { field: [0.16, 0.34, 0.78] },
      scale: campaignArmyStandardScale(MODEL_SHOT_GARRISON_ARMY_RADIUS),
      windPhase: standardWindPhase(standardSeed("campaign-army", "model-garrison-hidden")),
    });
    armyAnchors.push({
      x: MODEL_SHOT_HIDDEN_GARRISON_ARMY_POSITION[0],
      y: MODEL_SHOT_HIDDEN_GARRISON_ARMY_POSITION[1],
      z: MODEL_SHOT_HIDDEN_GARRISON_Z,
    });
  }
  if (gate === "selected-city")
    addCity(
      MODEL_SHOT_CITY_POSITION[0],
      MODEL_SHOT_CITY_POSITION[1],
      MODEL_SHOT_CITY_RADIUS,
      "ROMA",
      red,
      green,
      true,
    );
  if (gate === "town") addCity(0.0, -1.8, 5.0, "NEAPOLIS", amber, neutral, true);
  if (gate === "army") addArmy(0.0, -2.2, true);
  if (gate === "road" || gate === "road-only") {
    roads = roadGateVertices([
      [-8.7, -2.0],
      [-2.5, -2.4],
      [2.5, -2.4],
      [8.7, -2.0],
    ]);
    if (gate === "road") {
      addCity(-8.4, -2.0, 5.5, "ROMA");
      addCity(8.4, -2.0, 5.0, "NEAPOLIS", amber, neutral);
    }
  }
  if (gate === "terrain-grass-scrub") {
    scenery.push(
      { x: -3.8, y: 2.2, size: 3.7, kind: "conifer" },
      { x: -1.5, y: 2.0, size: 3.2, kind: "broadleaf" },
      { x: 1.2, y: 2.3, size: 4.0, kind: "broadleaf" },
      { x: 3.6, y: 1.8, size: 3.0, kind: "conifer" },
      { x: -5.2, y: 1.6, size: 2.7, kind: "conifer", shade: 0.5 },
      { x: 5.0, y: 1.3, size: 2.4, kind: "broadleaf", shade: 0.55 },
    );
  }
  if (gate === "terrain-stone-relief") {
    scenery.push(
      { x: -2.4, y: 4.2, size: 6.6, kind: "mountain" },
      { x: 2.7, y: 3.8, size: 5.4, kind: "mountain" },
      { x: -3.2, y: -6.2, size: 4.0, kind: "rock" },
      { x: 0.2, y: -6.4, size: 4.8, kind: "rock" },
      { x: 3.3, y: -5.8, size: 3.5, kind: "rock" },
    );
  }
  if (gate === "terrain-stone-relief") {
    scenery.push(
      { x: -5.4, y: 1.1, size: 2.9, kind: "rock", shade: 0.62 },
      { x: 5.3, y: 0.7, size: 2.6, kind: "rock", shade: 0.58 },
    );
  }
  if (gate === "cloud-fog") {
    terrainRect = [-22, -14, 44, 28];
    cloudRect = { min: [-22, -14], max: [22, 14] };
  }
  if (gate === "labels") {
    addCity(-3.8, -2.0, 4.6, "ROMA");
    addArmy(2.0, -2.2);
    labels.push({
      text: "LATIUM",
      x: -1.5,
      y: 4.0,
      kind: "faction",
      size: 18,
      priority: 4,
      angle: -0.06,
    });
    labels.push({
      text: "Tyrrhenian Sea",
      x: 0.0,
      y: -7.0,
      kind: "sea",
      size: 17,
      priority: 3,
      angle: -0.12,
    });
  }
  return {
    entities,
    standards,
    armyAnchors,
    scenery,
    selections,
    labels,
    roads,
    terrainRect,
    cloudRect,
  };
}

async function campaignModelShotStandardLiveries(
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
) {
  const res = await fetch("/data/campaign-map.json");
  const map = (await res.json()) as {
    factions: { name: string; color: [number, number, number] }[];
  };
  const columns = 6;
  const spacing: [number, number] = [15, 7.5];
  const rows = Math.ceil(map.factions.length / columns);
  const width = (columns - 1) * spacing[0];
  const height = Math.max(0, rows - 1) * spacing[1];
  const standards: StandardInstance[] = [];
  const armyAnchors: { x: number; y: number }[] = [];
  const markers: CampaignMarker[] = [];
  const liveryCells = map.factions.map((faction, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * spacing[0] - width / 2;
    const y = height / 2 - row * spacing[1];
    const color: [number, number, number] = [
      faction.color[0] / 255,
      faction.color[1] / 255,
      faction.color[2] / 255,
    ];
    const markerAnchor: [number, number] = [x + 5, y];
    const markerSample = projectNestedPoint(canvas, camera, [markerAnchor[0], markerAnchor[1], 0]);
    standards.push({
      x,
      y,
      tier: "campaign-army",
      factionId: "azure",
      livery: { field: color },
      scale: campaignArmyStandardScale(6.4),
      windPhase: standardWindPhase(standardSeed("campaign-army", `campaign-faction:${index}`)),
    });
    armyAnchors.push({ x, y });
    markers.push({
      x: markerAnchor[0],
      y: markerAnchor[1],
      radius: 9,
      faction: color,
      allegiance: color,
      kind: "army",
      selected: false,
    });
    return {
      faction: index,
      name: faction.name,
      color: faction.color,
      meshAnchor: [x, y] as [number, number],
      markerAnchor,
      markerPx: [markerSample.x, markerSample.y] as [number, number],
    };
  });
  // Generous pad: the pitched camera shows a trapezoid of ground, so a tight
  // rect leaves the frame's far corners on the void-dark clear color.
  const pad = 40;
  const terrainRect: [number, number, number, number] = [
    -width / 2 - pad,
    -height / 2 - pad,
    width + pad * 2 + 5,
    height + pad * 2,
  ];
  return {
    standards,
    armyAnchors,
    markers,
    terrainRect,
    liveryCells,
    factions: map.factions.length,
    grid: { columns, rows, spacing },
  };
}

// Derived from the fixture's world geometry (a point inside the city flag's
// pennant cloth, and a point inside the late broadleaf's canopy) via the
// route's own projector, so the samples follow the camera.
function campaignModelShotHostileDepthSamples(canvas: HTMLCanvasElement, camera: ChartCameraSpec) {
  const scale = campaignSettlementStandardScale(MODEL_SHOT_CITY_RADIUS);
  const bannerAnchor = [
    MODEL_SHOT_CITY_POSITION[0] + 0.08 * scale,
    MODEL_SHOT_CITY_POSITION[1] + 0.04 * scale,
  ];
  const flag = projectNestedPoint(canvas, camera, [
    bannerAnchor[0] + 0.34 * scale,
    bannerAnchor[1] - 0.088 * scale,
    5.15 * scale,
  ]);
  // Sample the sunlit west side of the upper canopy — the ez-tree oak carries
  // its leaf mass around the crown (mesh z ≈ 0.9-1.3), not at mid-trunk, and
  // the cutout foliage only reads reliably where the crown is dense and lit.
  const tree = projectNestedPoint(canvas, camera, [
    MODEL_SHOT_LATE_TREE.x - 0.25 * MODEL_SHOT_LATE_TREE.size,
    MODEL_SHOT_LATE_TREE.y,
    1.0 * MODEL_SHOT_LATE_TREE.size,
  ]);
  return {
    flagOverLateTree: { ...flag, note: "visible city flag in front of late scenery" },
    lateTreeControl: { ...tree, note: "late scenery bucket visible away from the flag" },
  };
}

function campaignModelShotCityStandardSamples(
  gate: CampaignModelShot,
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
) {
  if (gate !== "city" && gate !== "selected-city") return null;
  const scale = campaignSettlementStandardScale(MODEL_SHOT_CITY_RADIUS);
  const base: [number, number] = [
    MODEL_SHOT_CITY_POSITION[0] + 0.08 * scale,
    MODEL_SHOT_CITY_POSITION[1] + 0.04 * scale,
  ];
  const worldPoint = (local: [number, number, number]) =>
    projectNestedPoint(canvas, camera, [
      base[0] + local[0] * scale,
      base[1] + local[1] * scale,
      local[2] * scale,
    ]);
  return {
    // Below the cloth bottom: the towering banner clears the roofline, so
    // the building zone must show roofs, never cloth.
    hiddenLowerCloth: worldPoint([0.28, -0.088, 2.3]),
    visibleUpperCloth: worldPoint([0.34, -0.088, 5.18]),
    plantedMastCore: worldPoint([0.0, 0.0, 2.35]),
    rightFlyingCloth: worldPoint([0.42, -0.088, 5.06]),
    leftOfMastControl: worldPoint([-0.84, -0.088, 5.06]),
    // Bare pole between cloth top (5.6) and finial bottom (~6.45).
    mastAboveCloth: worldPoint([0.0, 0.0, 6.0]),
  };
}

function campaignModelShotGarrisonSamples(
  gate: CampaignModelShot,
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
  crowd: CrowdInstance[] = [],
) {
  if (gate !== "garrison-outside" && gate !== "garrison-city" && gate !== "garrison-hidden")
    return null;
  // Building-relative samples scale with the CITY MESH (authored at ~5 world
  // units per radius), not with the standard's banner scale.
  const cityScale = MODEL_SHOT_CITY_RADIUS / 5.0;
  const armyScale = campaignArmyStandardScale(MODEL_SHOT_GARRISON_ARMY_RADIUS);
  const armyBase =
    gate === "garrison-outside"
      ? MODEL_SHOT_OUTSIDE_GARRISON_ARMY_POSITION
      : gate === "garrison-hidden"
        ? MODEL_SHOT_HIDDEN_GARRISON_ARMY_POSITION
        : MODEL_SHOT_GARRISON_ARMY_POSITION;
  const armyZ = gate === "garrison-hidden" ? MODEL_SHOT_HIDDEN_GARRISON_Z : 0;
  const cityPoint = (local: [number, number, number]) =>
    projectNestedPoint(canvas, camera, [
      MODEL_SHOT_CITY_POSITION[0] + local[0] * cityScale,
      MODEL_SHOT_CITY_POSITION[1] + local[1] * cityScale,
      local[2] * cityScale,
    ]);
  const armyPoint = (local: [number, number, number]) =>
    projectNestedPoint(canvas, camera, [
      armyBase[0] + local[0] * armyScale,
      armyBase[1] + local[1] * armyScale,
      armyZ + local[2] * armyScale,
    ]);
  if (gate === "garrison-outside") {
    // The outside army body is the drawn soldier crowd: sample the torso of its
    // west-most figure (the crowd is the visible "shield wall", not a fixed
    // offset on the old army entity mesh).
    const west = crowd.reduce(
      (best: CrowdInstance | null, inst) => (best === null || inst.x < best.x ? inst : best),
      null,
    );
    const bodyWorld: [number, number, number] = west
      ? [west.x, west.y, 1.8]
      : [armyBase[0], armyBase[1], 1.8];
    return {
      state: "outside-city",
      visibleShieldOutsideCity: projectNestedPoint(canvas, camera, bodyWorld),
      visibleStandardOutsideCity: armyPoint([0.34, -0.078, 4.02]),
      cityControl: cityPoint([-0.62, 0.08, 1.5]),
    };
  }
  if (gate === "garrison-hidden") {
    return {
      state: "hidden-inside-city",
      hiddenBodyInsideCity: armyPoint([-0.46, -0.42, 0.98]),
      hiddenStandardInsideCity: armyPoint([0.34, -0.078, 4.02]),
      occludingCityRoof: cityPoint([0.34, 0.04, 4.94]),
    };
  }
  return {
    state: "partial-inside-city",
    hiddenShieldInsideWall: armyPoint([-0.46, -0.42, 0.98]),
    visibleStandardAboveRoofs: armyPoint([0.34, -0.078, 4.02]),
    occludingCityWall: cityPoint([-0.62, 0.08, 1.5]),
  };
}

// Selection rings are ground ellipses (selectionPass: y semi-axis 0.76 for
// cities / 0.64 for armies, opaque band around d ≈ 0.94–0.96 of the radius,
// lifted 0.045 above the ground). Sample the NORTH arc point — behind the
// fixture volume at the oblique review pitch, so geometry must occlude it —
// and the EAST arc point on open ground, both derived from the same world
// geometry the route draws instead of fixed crop pixels.
function campaignModelShotSelectionSamples(
  gate: CampaignModelShot,
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
  crowd: CrowdInstance[] = [],
) {
  if (gate === "selected-city") {
    const ring = MODEL_SHOT_CITY_RADIUS * 1.34;
    const [cx, cy] = MODEL_SHOT_CITY_POSITION;
    return {
      occludedByCityCore: {
        ...projectNestedPoint(canvas, camera, [cx, cy + ring * 0.76 * 0.96, 0.045]),
        note: "north ring arc behind the city core; buildings must paint over the ground selection decal",
      },
      visibleOuterRing: {
        ...projectNestedPoint(canvas, camera, [cx + ring * 0.96, cy, 0.045]),
        note: "east ring arc on exposed ground beside the city",
      },
    };
  }
  if (gate === "army") {
    // addArmy: army at (0, -2.2) with selection radius 6.5. The sampled north
    // arc segment must hide behind a soldier that is actually drawn, so work in
    // SCREEN space: for each drawn figure, find the arc azimuth whose screen x
    // matches the figure's feet, and accept it when the arc's screen row lands
    // on the figure's torso/head band (≈ 40–85 px above the feet at this
    // framing — lower rows leave ring pixels between the shins, higher rows
    // clear the head). Sample behind the best-centred candidate.
    const ring = 6.5;
    const arcAt = (x: number) =>
      -2.2 + 0.95 * 0.64 * ring * Math.sqrt(Math.max(0, 1 - (x / (0.95 * ring)) ** 2));
    let occludedSample: { x: number; y: number; world: [number, number, number] } | null = null;
    let occluderScore = Infinity;
    for (const inst of crowd) {
      if (Math.abs(inst.x) > ring * 0.58) continue;
      const feet = projectNestedPoint(canvas, camera, [inst.x, inst.y, 0]);
      // The arc azimuth whose screen x lines up with this figure's feet.
      let best: { x: number; y: number; world: [number, number, number] } | null = null;
      let bestDx = Infinity;
      for (let sx = -ring * 0.58; sx <= ring * 0.58; sx += 0.05) {
        const candidate = projectNestedPoint(canvas, camera, [sx, arcAt(sx), 0.045]);
        const dx = Math.abs(candidate.x - feet.x);
        if (dx < bestDx) {
          bestDx = dx;
          best = candidate;
        }
      }
      if (!best || bestDx > 3) continue;
      const above = feet.y - best.y;
      if (above < 40 || above > 85) continue;
      const score = Math.abs(above - 60);
      if (score < occluderScore) {
        occluderScore = score;
        occludedSample = best;
      }
    }
    return {
      occludedByArmyCore: {
        ...(occludedSample ?? projectNestedPoint(canvas, camera, [0, arcAt(0), 0.045])),
        note: "north ring arc behind a drawn soldier torso; figures must paint over the ground selection decal",
      },
      visibleOuterRing: {
        ...projectNestedPoint(canvas, camera, [ring * 0.94, -2.2, 0.045]),
        note: "east ring arc on exposed ground beside the formation",
      },
    };
  }
  return null;
}

function roadGateVertices(points: [number, number][]) {
  return buildCampaignMapDrawData(
    {
      map: {
        nodes: [],
        edges: [{ kind: "road", via: points }],
        factions: [],
      },
    },
    { roadScale: 0.34 },
  ).roadMeshVertices;
}

function campaignBgTerrainRect(rect: {
  min: [number, number];
  max: [number, number];
}): [number, number, number, number] {
  return [rect.min[0], rect.min[1], rect.max[0] - rect.min[0], rect.max[1] - rect.min[1]];
}

async function routeWorldCamera(ctx: LabContext) {
  const mode = ctx.params.get("mode") === "battle" ? "battle" : "campaign";
  // Both modes need the oblique review pitch (> ~0.75) so the nested3d wall
  // occludes the planted-standard sample under the real camera3d projector.
  const camera =
    mode === "battle"
      ? { x: 0, y: -0.6, zoom: 42, pitch: 1.0, yaw: -0.1 }
      : { x: 0, y: -0.6, zoom: 38, pitch: 1.1, yaw: -0.04 };
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const nested = new Nested3dFixturePass(shell);
  const ground = new LabGroundPass(shell, [-14, -7, 28, 15]);
  shell.drawFrame({
    passes: [
      labGroundFramePass(ground, "world-camera-ground"),
      {
        id: "world-camera-nested-3d",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => nested.draw(pass),
      },
    ],
  });
  const shellStats = shell.stats();
  const anchorAgreement = worldCameraAnchorAgreement(ctx.canvas, camera, [
    ["city-ground", [-2.62, 0.1, 0.0]],
    ["garrison-ground", [-3.1, -0.72, 0.0]],
    ["rank-ground", [4.3, -1.2, 0.0]],
    ["ring-ground", [-2.2, -0.55, 0.0]],
  ]);
  const nestedStats = nested.stats();
  ctx.status.innerHTML =
    reportTable({
      route: "world-camera",
      status: "shared camera/depth contract",
      mode,
      camera: `pitch ${camera.pitch.toFixed(2)}, yaw ${camera.yaw.toFixed(2)}`,
      depth: shellStats.depth.allocated
        ? `${shellStats.depth.format} ${shellStats.depth.width}x${shellStats.depth.height}`
        : "not allocated",
      cameraWgsl: "packages/renderer-core/src/cameraWgsl.ts",
      maxAnchorDeltaPx: anchorAgreement.maxDelta.toFixed(4),
      nestedFixtures: nestedStats.fixtures.join(", "),
    }) +
    `<p class="renderer-note"><a href="/renderer/world-camera?mode=campaign">campaign camera</a> · <a href="/renderer/world-camera?mode=battle">battle camera</a></p>`;
  publish("world-camera", true, {
    mode,
    camera,
    depth: shellStats.depth,
    framePhases: shellStats.phases,
    nested3d: nestedStats,
    cameraContract: "shared-world-camera-wgsl",
    anchorAgreement,
    samples: {
      occludedLowerStandard: projectNestedPoint(ctx.canvas, camera, [-2.62, 0.1, 1.35]),
      visibleUpperFlag: projectNestedPoint(ctx.canvas, camera, [-1.2, 0.1, 3.7]),
      frontRankOverlap: projectNestedPoint(ctx.canvas, camera, [4.3, -1.2, 1.08]),
    },
  });
}

async function routeCardBar(ctx: LabContext) {
  const count = Math.max(1, Math.min(60, Number(ctx.params.get("count") ?? 20)));
  const band = el("div", "renderer-unitcards");
  band.id = "unitcards";
  ctx.root.appendChild(band);

  // Reuse the live "window too small" gate (index.html's CSS survives the lab
  // mount, but its element doesn't — recreate it) so the scene can exercise the
  // min-window placeholder headlessly.
  const tooSmall = el("div", "");
  tooSmall.id = "viewport-too-small";
  tooSmall.innerHTML =
    '<div class="vts-panel"><h2>Window too small</h2><p>The battle needs a window of at least 1180 &times; 640. Please enlarge the window to play.</p></div>';
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
    alive: 180 - ((i * 13) % 170),
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
    route: "card-bar",
    count,
    rows: grid.rows,
    cols: grid.cols,
    cardW: grid.cardW,
    degenerate: grid.degenerate,
    bandWidth: band.clientWidth,
  });
  publish("card-bar", true, { count, grid, lastSelect, bandWidth: band.clientWidth });
}

function chartCameraSnapshot(spec: ChartCameraSpec, width: number, height: number): CameraSnapshot {
  return {
    x: spec.x,
    y: spec.y,
    zoom: spec.zoom,
    width,
    height,
    camera3d: chartCamera3d(spec, height),
  };
}

// The setCamera form of the same conversion (the shell owns width/height).
function chartSnapshot(
  spec: ChartCameraSpec,
  shell: RawFrameShell,
): Omit<CameraSnapshot, "width" | "height"> {
  return {
    x: spec.x,
    y: spec.y,
    zoom: spec.zoom,
    camera3d: chartCamera3d(spec, shell.stats().height),
  };
}

async function createConfiguredShell(
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
  environment: BattleEnvironment = resolveBattleEnvironment("golden-hour"),
) {
  const shell = await createFrameShell(canvas, { sun: environment.environment });
  shell.setCamera(chartSnapshot(camera, shell));
  applyBattleEnvironment(shell, environment);
  return shell;
}

async function createSkinnedPipeline(
  shell: RawFrameShell,
  accent: [number, number, number],
  vat?: Awaited<ReturnType<typeof loadPlaceholderVat>>,
  environment = resolveBattleEnvironment("golden-hour"),
) {
  return new SkinnedCrowdPipeline(
    shell,
    createPlaceholderSoldierMeshes(accent),
    vat ?? (await loadPlaceholderVat()),
    undefined,
    {
      lighting: skinnedLightingForBattleEnvironment(environment),
    },
  );
}

function skinnedCrowdPass(pipeline: SkinnedCrowdPipeline, id: string): FrameGraphPass {
  return {
    id,
    role: "world-opaque",
    phase: "world-depth",
    depth: "read-write",
    draw: (pass) => pipeline.draw(pass),
  };
}

function numberParam(params: URLSearchParams, key: string, fallback: number) {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function integerParam(
  params: URLSearchParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Math.floor(numberParam(params, key, fallback));
  return Math.max(min, Math.min(max, value));
}

function liveFrameGraphContractFixtures(shell: RawFrameShell) {
  const fixtures = [
    {
      id: "backgroundDepthMode",
      expected: "non-world-depth",
      passes: [
        {
          id: "bad-background-depth",
          role: "background-underpaint",
          phase: "background",
          depth: "read",
          draw: () => undefined,
        },
      ],
    },
    {
      id: "worldMissingDepthMode",
      expected: "must declare depth mode",
      passes: [
        {
          id: "bad-world-missing-depth",
          role: "world-opaque",
          phase: "world-depth",
          draw: () => undefined,
        },
      ],
    },
    {
      id: "worldUnsupportedDepthMode",
      expected: "must declare depth mode",
      passes: [
        {
          id: "bad-world-depth-mode",
          role: "world-opaque",
          phase: "world-depth",
          depth: "sample",
          draw: () => undefined,
        },
      ],
    },
    {
      id: "unsupportedPhase",
      expected: "unsupported phase",
      passes: [
        {
          id: "bad-phase",
          role: "overlay-effect",
          phase: "transparent-world",
          draw: () => undefined,
        },
      ],
    },
    {
      id: "missingSemanticRole",
      expected: "must declare a semantic role",
      passes: [
        {
          id: "bad-missing-role",
          phase: "world-depth",
          depth: "read-write",
          draw: () => undefined,
        },
      ],
    },
    {
      id: "mismatchedSemanticRole",
      expected: "is incompatible with phase",
      passes: [
        { id: "bad-role-phase", role: "world-opaque", phase: "overlay", draw: () => undefined },
      ],
    },
    {
      id: "mismatchedDepthRole",
      expected: "requires role",
      passes: [
        {
          id: "bad-depth-role",
          role: "world-decal",
          phase: "world-depth",
          depth: "read-write",
          draw: () => undefined,
        },
      ],
    },
    {
      id: "readOnlyBeforeWrite",
      expected: "writes depth after read-only world decals have started",
      passes: [
        {
          id: "early-world-decal",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: () => undefined,
        },
        {
          id: "late-world-opaque",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: () => undefined,
        },
      ],
    },
    {
      id: "topLevelTypeBucketPass",
      expected: "is a type bucket, not a semantic frame pass",
      passes: [
        {
          id: "treeBucket",
          label: "Tree bucket",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          batching: { strategy: "instance-kind", buckets: ["conifer"] },
          draw: () => undefined,
        },
      ],
    },
  ];
  return fixtures.map((fixture) => {
    try {
      shell.drawFrame({ passes: fixture.passes as unknown as FrameGraphPass[] });
      return { id: fixture.id, expected: fixture.expected, rejected: false, diagnostics: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        id: fixture.id,
        expected: fixture.expected,
        rejected: message.includes(fixture.expected),
        diagnostics: [message],
      };
    }
  });
}

function animateSkinned(
  shell: RawFrameShell,
  pipeline: SkinnedCrowdPipeline,
  getInstances: () => CrowdInstance[],
  opts: {
    forcedClip?: string | null;
    phaseOffset?: number;
    phaseSpeed?: number;
    size?: number;
    afterFrame?: () => void;
  } = {},
) {
  const start = performance.now();
  const ground = new LabGroundPass(shell, [-42, -28, 84, 56]);
  const tick = () => {
    const phaseOffset =
      (opts.phaseOffset ?? 0) + ((performance.now() - start) / 1000) * (opts.phaseSpeed ?? 0);
    pipeline.upload(getInstances(), { forcedClip: opts.forcedClip, phaseOffset, size: opts.size });
    shell.drawFrame({
      passes: [
        labGroundFramePass(ground, "animated-skinned-ground"),
        {
          id: "animated-skinned-crowd",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass) => pipeline.draw(pass),
        },
      ],
    });
    opts.afterFrame?.();
    requestAnimationFrame(tick);
  };
  tick();
}

function generatedCrowd(count: number, x: number, y: number, faction: 0 | 1 | 2): CrowdInstance[] {
  return generatedFormation(count, {
    x,
    y,
    faction: faction === 2 ? 0 : faction,
    columns: Math.ceil(Math.sqrt(count)),
    frame: 1,
  }).map((instance) => ({ ...instance, faction }));
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

function campaignPresetCamera(preset: string) {
  const presets: Record<
    string,
    { x: number; y: number; zoom: number; pitch: number; yaw: number }
  > = {
    fixture: { x: 0, y: 450, zoom: 6.0, pitch: 0, yaw: 0 },
    whole: { x: -100, y: 250, zoom: 0.16, pitch: 0, yaw: 0 },
    roma: { x: -456, y: 446, zoom: 2.5, pitch: 0, yaw: 0 },
    gaul: { x: -1020, y: 938, zoom: 2.2, pitch: 0, yaw: 0 },
    nile: { x: 1131, y: -686, zoom: 2.2, pitch: 0, yaw: 0 },
    alps: { x: -450, y: 1080, zoom: 1.8, pitch: 0, yaw: 0 },
    political: { x: 180, y: 520, zoom: 0.58, pitch: 0, yaw: 0 },
  };
  return presets[preset] ?? presets.whole;
}

async function loadCampaignUiFixture(): Promise<{
  kind: "controlled";
  data: CampaignData;
  mapJson: string;
}> {
  const y = 450;
  const map = {
    half_w: 70,
    half_h: 520,
    attribution: "renderer-campaign-ui-fixture",
    nodes: [
      { id: 1, name: "Roma", pos: [-28, y], kind: "city", tier: 2, port: false, owner: "rome" },
      {
        id: 2,
        name: "Neapolis",
        pos: [30, y],
        kind: "city",
        tier: 2,
        port: false,
        owner: "independents",
      },
    ],
    edges: [
      {
        a: 1,
        b: 2,
        kind: "road",
        via: [
          [-28, y],
          [-6, y + 4],
          [12, y - 3],
          [30, y],
        ],
        tiles: Array(10).fill("open"),
      },
    ],
    ambush_spots: [],
    factions: [
      { id: "rome", name: "Rome", color: [190, 48, 42], playable: true },
      { id: "independents", name: "Independent", color: [132, 122, 102], playable: false },
    ],
    start_armies: [
      {
        faction: "rome",
        at: "Roma",
        roster: [
          ["MediumInfantry", 1000],
          ["MediumSpear", 500],
          ["Archers", 500],
          ["ShockCavalry", 300],
        ],
      },
    ],
  } as unknown as CampaignData["map"];
  const bgRect = { min: [-54, y - 32] as [number, number], max: [56, y + 34] as [number, number] };
  const cv = document.createElement("canvas");
  cv.width = 1;
  cv.height = 1;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#c9b277";
  g.fillRect(0, 0, 1, 1);
  const bg = await createImageBitmap(cv);
  const nodeIndex = new Map(map.nodes.map((node, i) => [node.id, i]));
  return { kind: "controlled", data: { map, bg, bgRect, nodeIndex }, mapJson: JSON.stringify(map) };
}

function buildCampaignEntityFrame(
  data: CampaignData,
  views: CampaignViews,
  playerFaction: number,
  selectedArmy: number,
  selectedCity: number,
) {
  const entities: CampaignEntityInstance[] = [];
  const standards: StandardInstance[] = [];
  const selections: CampaignSelectionInstance[] = [];
  let cityEntities = 0;
  let armyEntities = 0;
  for (let node = 0; node < data.map.nodes.length; node++) {
    const mapNode = data.map.nodes[node];
    if (mapNode.kind !== "city") continue;
    const city = views.cities.get(node);
    const owner =
      city?.owner ??
      Math.max(
        0,
        data.map.factions.findIndex((faction) => faction.id === mapNode.owner),
      );
    const allegiance = owner === playerFaction ? Allegiance.Friend : Allegiance.Neutral;
    entities.push({
      x: mapNode.pos[0],
      y: mapNode.pos[1],
      radius: mapNode.tier >= 3 ? 8.4 : 7.0,
      faction: factionColor(data, owner),
      allegiance: allegianceColor(allegiance),
      kind: "city",
      strength: Math.min(1, (city?.garrison ?? 600) / 1200),
    });
    const scale = campaignSettlementStandardScale(mapNode.tier >= 3 ? 8.4 : 7.0);
    standards.push({
      x: mapNode.pos[0] + 0.08 * scale,
      y: mapNode.pos[1] + 0.04 * scale,
      tier: "settlement-banner",
      factionId: "azure",
      livery: { field: factionColor(data, owner) },
      scale,
      windPhase: standardWindPhase(standardSeed("settlement-banner", `campaign-ui-city:${node}`)),
    });
    cityEntities++;
    if (node === selectedCity) {
      selections.push({
        x: mapNode.pos[0],
        y: mapNode.pos[1],
        z: 0,
        radius: mapNode.tier >= 3 ? 12.4 : 10.6,
        color: [0.31, 0.82, 0.39],
        kind: "city",
      });
    }
  }
  for (const army of views.armies) {
    standards.push({
      x: army.x,
      y: army.y,
      tier: "campaign-army",
      factionId: "azure",
      livery: { field: factionColor(data, army.faction) },
      scale: campaignArmyStandardScale(9.8),
      windPhase: standardWindPhase(standardSeed("campaign-army", `campaign-ui-army:${army.id}`)),
    });
    armyEntities++;
    if (army.id === selectedArmy) {
      selections.push({
        x: army.x,
        y: army.y,
        z: 0,
        radius: 12.6,
        color: [0.31, 0.82, 0.39],
        kind: "army",
      });
    }
  }
  return { entities, standards, selections, cityEntities, armyEntities };
}

function factionColor(data: CampaignData, faction: number): [number, number, number] {
  const color = data.map.factions[faction]?.color ?? [146, 126, 92];
  return [color[0] / 255, color[1] / 255, color[2] / 255];
}

function allegianceColor(allegiance: Allegiance): [number, number, number] {
  if (allegiance === Allegiance.Friend) return [0.31, 0.82, 0.39];
  if (allegiance === Allegiance.Foe) return [0.88, 0.27, 0.23];
  return [0.93, 0.78, 0.3];
}

function campaignArmyLabels(armies: ArmyView[]): CampaignLabel[] {
  return armies.map((army) => ({
    text: army.mine ? `Army ${army.id}` : `Host ${army.id}`,
    x: army.x,
    y: army.y - 18,
    kind: "army" as const,
    size: 13,
    priority: 4,
  }));
}

function campaignFactionLabels(labels: FactionLabel[]): CampaignLabel[] {
  return labels.map((label) => ({
    text: label.name,
    x: label.x,
    y: label.y,
    kind: "faction" as const,
    size: Math.max(13, Math.min(label.minor ? 16 : 22, label.radiusKm / (label.minor ? 12 : 20))),
    priority: label.minor ? 2 : 4,
    angle: -0.06,
  }));
}

function campaignPick(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
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
  if (army >= 0) return { kind: "army", army, city: -1, worldX: world.x, worldY: world.y };
  // Scan city nodes directly instead of nearestLoc: roads run THROUGH city
  // nodes, so a click a fraction off the node centre is marginally closer to
  // the road polyline than to the node and nearestLoc resolves it to an edge
  // location — a city click must never race the road under it.
  let city = -1;
  let bestCityD = 18;
  data.map.nodes.forEach((node, index) => {
    if (node.kind !== "city") return;
    const d = Math.hypot(node.pos[0] - world.x, node.pos[1] - world.y);
    if (d < bestCityD) {
      bestCityD = d;
      city = index;
    }
  });
  if (city >= 0) return { kind: "city", army: -1, city, worldX: world.x, worldY: world.y };
  return { kind: "empty", army: -1, city: -1, worldX: world.x, worldY: world.y };
}

function campaignCssToWorld(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
  stats: { width: number; height: number },
) {
  const rect = canvas.getBoundingClientRect();
  const px = (clientX - rect.left) * (canvas.width / Math.max(1, canvas.clientWidth));
  const py = (clientY - rect.top) * (canvas.height / Math.max(1, canvas.clientHeight));
  const [x, y] = screenToWorld(chartCameraSnapshot(camera, stats.width, stats.height), px, py);
  return { x, y };
}

function publishCampaignUiDebug(
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
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
    project: (x: number, y: number) =>
      campaignWorldToCss(x, y, canvas, camera, { width: canvas.width, height: canvas.height }),
  };
}

function campaignWorldToCss(
  x: number,
  y: number,
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
  stats: { width: number; height: number },
) {
  const rect = canvas.getBoundingClientRect();
  const [px, py] = worldToScreen(chartCameraSnapshot(camera, stats.width, stats.height), x, y);
  return {
    x: rect.left + px * (canvas.clientWidth / Math.max(1, canvas.width)),
    y: rect.top + py * (canvas.clientHeight / Math.max(1, canvas.height)),
  };
}

function projectNestedPoint(
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
  point: [number, number, number],
) {
  const snapshot = chartCameraSnapshot(camera, canvas.width, canvas.height);
  const [x, y] = world3dToScreen(snapshot, point[0], point[1], point[2]);
  return { x, y, world: point };
}

// CPU/GPU agreement under the ONE projection owner (camera3d): project each
// ground anchor through worldToScreen, unproject the pixel back through
// screenToWorld, and report the round-trip delta in device pixels (world
// delta × camera.zoom). Both directions ride the same chartCamera3d matrices
// the shell renders with, so any drift is a real projection bug.
function worldCameraAnchorAgreement(
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
  anchors: [string, [number, number, number]][],
) {
  const snapshot = chartCameraSnapshot(camera, canvas.width, canvas.height);
  const points = anchors.map(([id, point]) => {
    const screen = worldToScreen(snapshot, point[0], point[1]);
    const world = screenToWorld(snapshot, screen[0], screen[1]);
    const delta = Math.hypot(world[0] - point[0], world[1] - point[1]) * camera.zoom;
    return { id, screen, roundTrip: world, delta };
  });
  return {
    maxDelta: points.reduce((max, point) => Math.max(max, point.delta), 0),
    points,
  };
}

function publish(route: string, ok: boolean, stats: unknown) {
  const w = window as unknown as {
    __rendererLabReady?: boolean;
    __rendererLabStats?: {
      ok: boolean;
      route: string;
      projection: typeof PROJECTION_IDENTITY;
      stats: unknown;
    };
  };
  w.__rendererLabReady = true;
  // Every route publishes the engine's one projection/depth identity so the
  // scene suite can prove one projector engine-wide.
  w.__rendererLabStats = { ok, route, projection: PROJECTION_IDENTITY, stats };
}

function reportTable(values: Record<string, unknown>) {
  const rows = Object.entries(values)
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`)
    .join("");
  return `<table>${rows}</table>`;
}

function issueList(issues: { code: string; message: string; path: string }[]) {
  if (issues.length === 0) return "";
  return `<ol>${issues.map((i) => `<li><b>${escapeHtml(i.code)}</b> ${escapeHtml(i.path)}: ${escapeHtml(i.message)}</li>`).join("")}</ol>`;
}

function el(tag: string, className: string) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function installStyles() {
  const style = document.createElement("style");
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
    /* Same fixed-size, shrink-wrapping, no-scroll grid as the live #unitcards
       (unitCard.ts writes --cols/--card-w/--card-h). */
    .renderer-unitcards { position: absolute; bottom: 58px; left: 50%; transform: translateX(-50%); display: grid; width: max-content; max-width: calc(100% - 36px); grid-template-columns: repeat(var(--cols, 1), var(--card-w, 72px)); grid-auto-rows: var(--card-h, 96px); gap: 3px; justify-content: center; align-content: end; overflow: hidden; padding: 11px 12px; pointer-events: auto; background: radial-gradient(circle at 9px 9px, rgba(234,204,142,0.95) 0 1.1px, rgba(58,42,22,0.95) 1.5px 2.7px, transparent 3.1px) padding-box, radial-gradient(circle at calc(100% - 9px) 9px, rgba(234,204,142,0.95) 0 1.1px, rgba(58,42,22,0.95) 1.5px 2.7px, transparent 3.1px) padding-box, radial-gradient(circle at 9px calc(100% - 9px), rgba(234,204,142,0.95) 0 1.1px, rgba(58,42,22,0.95) 1.5px 2.7px, transparent 3.1px) padding-box, radial-gradient(circle at calc(100% - 9px) calc(100% - 9px), rgba(234,204,142,0.95) 0 1.1px, rgba(58,42,22,0.95) 1.5px 2.7px, transparent 3.1px) padding-box, repeating-linear-gradient(96deg, rgba(255,228,168,0.035) 0 2px, rgba(0,0,0,0.04) 2px 4px) padding-box, linear-gradient(#5e4527, #2a1f11) padding-box, linear-gradient(#c79a54 0%, #6e5128 48%, #241a0e 100%) border-box; border: 4px solid transparent; border-radius: 5px; box-shadow: inset 0 1px 0 rgba(236,200,132,0.65), inset 0 0 0 2px rgba(16,10,5,0.78), inset 0 0 0 3px rgba(158,120,66,0.55), inset 0 -3px 8px rgba(0,0,0,0.6), 0 0 0 1px rgba(182,142,80,0.65), 0 9px 24px rgba(0,0,0,0.68); }
	    .renderer-campaign-ui { position: absolute; inset: 0 310px 0 0; pointer-events: none; color: #eadfca; font: 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
	    .renderer-campaign-hud { position: absolute; left: 12px; top: 12px; display: flex; align-items: center; gap: 12px; padding: 8px 10px; background: rgba(18,17,14,0.78); border: 1px solid rgba(177,143,82,0.45); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.32); }
	    .renderer-campaign-hud b { color: #f4dfaa; font-family: Cinzel, Georgia, serif; }
	    /* Lab LAYOUT only: the bronze panel MATERIAL is owned by campaignDomHtml's
	     * .cmp-panel rules (the same chrome as the game). The fixture pins panels
	     * absolutely inside its box so they never cover the canvas click targets
	     * (the game positions them fixed to the viewport). */
	    .renderer-campaign-ui .renderer-campaign-panel { position: absolute; pointer-events: auto; width: 250px; max-height: calc(100% - 76px); overflow: auto; }
	    .renderer-campaign-ui .renderer-campaign-panel.army { right: 12px; top: 54px; left: auto; bottom: auto; }
	    .renderer-campaign-ui .renderer-campaign-panel.city { right: 12px; bottom: 12px; left: auto; top: auto; }
	    .renderer-campaign-ui .renderer-campaign-panel.diplomacy { left: 12px; top: 54px; right: auto; bottom: auto; width: 310px; }
	    .renderer-campaign-ui .renderer-campaign-panel.classes { left: 12px; bottom: 12px; right: auto; top: auto; width: 250px; max-height: min(34%, 180px); }
	    .renderer-campaign-panel b { font-family: Cinzel, Georgia, serif; letter-spacing: 0.2px; color: #f1dfb1; }
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
	      .renderer-campaign-ui { inset: 0 0 220px 0; }
	      .renderer-campaign-panel.classes, .renderer-campaign-panel.diplomacy { display: none !important; }
      .renderer-unitcards { left: 12px; right: 12px; justify-content: flex-start; }
    }
  `;
  document.head.appendChild(style);
}
