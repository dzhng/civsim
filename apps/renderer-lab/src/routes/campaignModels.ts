import {
  type FrameGraphPass,
  type OverlayRenderPass,
  type RawFrameShell,
  type WorldRenderPass,
} from "@packages/renderer-core/src/frameShell";
import { WORLD_CAMERA_WGSL } from "@packages/renderer-core/src/cameraWgsl";
import { gpuWorldDepthStencil } from "@packages/renderer-core/src/pipelineContracts";
import { compileShader } from "@packages/renderer-core/src/compileShader";
import {
  CAMPAIGN_FIGURE_SIZE,
  campaignArmyStandardScale,
  campaignSettlementStandardScale,
} from "@packages/game-renderer/src/campaign/entityFrame";
import { SkinnedCrowdPipeline } from "@packages/renderer-core/src/skinnedPipeline";
import { type CrowdInstance } from "@packages/crowd-runtime/src/instanceData";
import { buildStackCrowd } from "@packages/crowd-runtime/src/stackCrowd";
import { SoldierShadowDecalPass } from "@packages/renderer-core/src/soldierShadowPass";
import { CampaignCloudPass } from "@packages/game-renderer/src/campaign/atmospherePass";
import {
  CampaignEntityPass,
  type CampaignEntityInstance,
} from "@packages/game-renderer/src/campaign/entityPass";
import {
  CampaignLabelPass,
  type CampaignMarker,
  CampaignMarkerPass,
  CampaignRoadPass,
  type CampaignLabel,
} from "@packages/game-renderer/src/campaign/mapPass";
import { buildCampaignMapDrawData } from "@packages/game-renderer/src/campaign/roadGeometry";
import {
  CampaignSceneryPass,
  type CampaignSceneryInstance,
} from "@packages/game-renderer/src/campaign/sceneryPass";
import {
  standardSeed,
  standardWindPhase,
} from "@packages/game-renderer/src/models/shared/standardAsset";
import {
  SharedStandardPass,
  type StandardInstance,
} from "@packages/game-renderer/src/models/shared/standardPass";
import { type ChartCameraSpec } from "@packages/renderer-core/src/camera3d";
import {
  CampaignSelectionPass,
  type CampaignSelectionInstance,
} from "@packages/game-renderer/src/campaign/selectionPass";
import { loadAppearanceCatalog } from "@packages/soldier-assets/src/appearanceBundle";
import { projectNestedPoint } from "../labCampaign";
import {
  type LabContext,
  LabGroundPass,
  chartSnapshot,
  createCampaignShell,
  labGroundFramePass,
  publish,
  reportTable,
} from "../labShell";

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

export async function route(ctx: LabContext) {
  const gate = campaignModelShot(ctx.params.get("gate"));
  const camera = campaignModelShotCamera(gate);
  const shell = await createCampaignShell(ctx.canvas, camera);
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
    const appearances = await loadAppearanceCatalog(
      new URL("/assets/soldiers/catalog.json", location.href).href,
    );
    const mountedClasses = Object.entries(appearances)
      .filter(([, bundle]) => bundle.manifest.mounted)
      .map(([id]) => Number(id));
    soldierCrowd = await SkinnedCrowdPipeline.create(shell, appearances);
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
        clipForClass: (id) => appearances[id].manifest.presentation!.actions.atEase!.clip,
        phase: 0,
        mountedClasses,
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
    precompute: (encoder) => soldierCrowd?.precompute(encoder),
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
  // Sample the sunlit upper crown; a trunk-height sample cannot prove
  // leaf color through the cutout foliage.
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
    // offset on the army entity mesh).
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
