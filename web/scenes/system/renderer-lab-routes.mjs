import { readdir, readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import {
  FRAME_GRAPH_PASS_ROLES,
  FRAME_GRAPH_DEPTH_ROLES,
  FRAME_GRAPH_ROLE_PHASES,
  GPU_DEPTH_FORMAT,
  GPU_DEPTH_MODES,
  GPU_WORLD_DEPTH_ATTACHMENT,
  PROJECTION_IDENTITY,
  hasFrameDepthPass,
  hasFramePass,
  hasFramePassRole,
  hasFramePhaseOrder,
} from "../_renderer-contract.mjs";

export const meta = {
  name: "renderer-lab-routes",
  kind: "flow",
  world: "none",
  tier: "full",
  snapshots: [],
  describe: "Fresh raw renderer lab routes render and expose deterministic stats.",
};

// Raw (bespoke WebGPU) lab routes only: every entry must publish the single
// PROJECTION_IDENTITY and render through the shared frame shell. The photoreal
// three.js routes (/renderer/photoreal-pbr, /renderer/photoreal-crowd) publish
// the { substrate, projection: 'camera3d', environment } identity instead and
// are gated by scenes/system/photoreal-substrate.mjs.
const routes = [
  [
    "frame-shell",
    (s) =>
      s?.ok &&
      s.route === "frame-shell" &&
      s.stats.atmosphere === "aegean-sky-haze" &&
      s.stats.cameraContract === "shared-world-camera-wgsl" &&
      frameGraphContractFixturesRejected(s.stats.frameGraphContractFixtures),
  ],
  [
    "assets",
    (s) =>
      s?.ok &&
      s.route === "assets" &&
      s.stats.badErrors > 0 &&
      s.stats.importUi?.paste &&
      s.stats.importUi?.file &&
      s.stats.importUi?.drop,
  ],
  [
    "crowd-data?count=1000",
    (s) => s?.ok && s.route === "crowd-data" && s.stats.stats.written === 1000,
  ],
  ["animation-state", (s) => s?.ok && s.route === "animation-state"],
  [
    "skinned-soldier?phase=0.25",
    (s) =>
      s?.ok &&
      s.route === "skinned-soldier" &&
      s.stats.instances === 1 &&
      s.stats.cameraContract === "shared-world-camera-wgsl",
  ],
  [
    "skinned-crowd?count=1200",
    (s) =>
      s?.ok &&
      s.route === "skinned-crowd" &&
      s.stats.count === 1200 &&
      s.stats.cameraContract === "shared-world-camera-wgsl",
  ],
  [
    "skinned-depth",
    (s) =>
      s?.ok &&
      s.route === "skinned-depth" &&
      s.stats.instances === 2 &&
      s.stats.drawCalls === 2 &&
      s.stats.cameraContract === "shared-world-camera-wgsl" &&
      s.stats.depth?.allocated === true &&
      hasFramePhaseOrder(s.stats.framePhases) &&
      hasFrameDepthPass(s.stats.framePhases, "skinned-depth-crowd", "read-write") &&
      hasFramePassRole(s.stats.framePhases, "skinned-depth-crowd", "world-opaque", "world-depth") &&
      s.stats.hostileDrawOrder ===
        `front-class-${s.stats.frontClass}-submitted-before-rear-class-${s.stats.rearClass}` &&
      s.stats.sample,
  ],
  [
    "battle-ground-cue-depth",
    (s) =>
      s?.ok &&
      s.route === "battle-ground-cue-depth" &&
      s.stats.instances === 1 &&
      s.stats.groundCues?.lineSegments === 5 &&
      s.stats.depth?.allocated === true &&
      s.stats.depth?.format === GPU_DEPTH_FORMAT &&
      hasFramePhaseOrder(s.stats.framePhases) &&
      hasFrameDepthPass(s.stats.framePhases, "battle-ground-cue-depth-crowd", "read-write") &&
      hasFrameDepthPass(s.stats.framePhases, "battle-ground-cue-depth-cues", "read") &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-ground-cue-depth-crowd",
        "world-opaque",
        "world-depth",
      ) &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-ground-cue-depth-cues",
        "world-decal",
        "world-depth",
      ) &&
      s.stats.hostileDrawOrder === "crowd-before-late-ground-cue" &&
      s.stats.samples?.coveredCueUnderSoldier &&
      s.stats.samples?.exposedCueControl,
  ],
  [
    "battle-effect-overlay",
    (s) =>
      s?.ok &&
      s.route === "battle-effect-overlay" &&
      s.stats.instances === 1 &&
      s.stats.effects?.lineSegments === 5 &&
      s.stats.depth?.allocated === true &&
      s.stats.depth?.format === GPU_DEPTH_FORMAT &&
      hasFramePhaseOrder(s.stats.framePhases) &&
      hasFrameDepthPass(s.stats.framePhases, "battle-effect-overlay-crowd", "read-write") &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-effect-overlay-crowd",
        "world-opaque",
        "world-depth",
      ) &&
      hasFramePass(s.stats.framePhases, "battle-effect-overlay-lines", "overlay") &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-effect-overlay-lines",
        "overlay-effect",
        "overlay",
      ) &&
      s.stats.samples?.effectOverSoldier &&
      s.stats.samples?.exposedEffectControl,
  ],
  [
    "lod?zoom=5",
    (s) =>
      s?.ok &&
      s.route === "lod" &&
      s.stats.counts.l1 + s.stats.counts.l2 + s.stats.counts.l3 + s.stats.counts.l0 === 1800,
  ],
  [
    "battle",
    (s) =>
      s?.ok &&
      s.route === "battle" &&
      s.stats.soldiers === 2400 &&
      s.stats.cameraContract === "shared-world-camera-wgsl",
  ],
  [
    "perf?count=900",
    (s) =>
      s?.ok &&
      s.route === "perf" &&
      s.stats.kind === "rendering-full-game-perf" &&
      s.stats.mode === "headless-liveness" &&
      s.stats.releaseBudget === "not-set" &&
      s.stats.scenes?.[0]?.id === "lab-skinned-crowd" &&
      s.stats.scenes[0].stats.count === 900 &&
      s.stats.scenes[0].frame.samples > 0,
  ],
  ["campaign", (s) => s?.ok && s.route === "campaign" && s.stats.markers > 0],
  [
    "campaign-map?preset=whole",
    (s) =>
      s?.ok &&
      s.route === "campaign-map" &&
      s.stats.roads > 20 &&
      s.stats.seaLanes > 0 &&
      s.stats.cityMarkers > 20 &&
      s.stats.visibleLabels > 5 &&
      s.stats.labelVertices > 20 &&
      s.stats.factions > 5 &&
      s.stats.territoryPixels > 10000 &&
      s.stats.borderSegments > 100 &&
      s.stats.waterLayer === "map-sea-mask" &&
      s.stats.cloudQuads === 1 &&
      s.stats.cameraContract === "shared-world-camera-wgsl" &&
      s.stats.territoryLayer === "raw-gpu-texture" &&
      s.stats.atmosphereLayer === "raw-gpu-clouds" &&
      s.stats.labelLayer === "raw-gpu-glyph-atlas",
  ],
  [
    "campaign-ui",
    (s) =>
      s?.ok &&
      s.route === "campaign-ui" &&
      s.stats.fixture === "controlled" &&
      s.stats.cityEntities === 2 &&
      s.stats.armyEntities === 1 &&
      s.stats.selections >= 2 &&
      s.stats.depth?.allocated === true &&
      s.stats.depth?.format === GPU_DEPTH_FORMAT &&
      hasFramePhaseOrder(s.stats.framePhases ?? s.stats.phases) &&
      hasFrameDepthPass(
        s.stats.framePhases ?? s.stats.phases,
        "campaign-ui-entities-opaque",
        "read-write",
      ) &&
      hasFramePassRole(
        s.stats.framePhases ?? s.stats.phases,
        "campaign-ui-entities-opaque",
        "world-opaque",
        "world-depth",
      ) &&
      hasFrameDepthPass(
        s.stats.framePhases ?? s.stats.phases,
        "campaign-ui-entity-shadows",
        "read",
      ) &&
      hasFramePassRole(
        s.stats.framePhases ?? s.stats.phases,
        "campaign-ui-entity-shadows",
        "world-decal",
        "world-depth",
      ) &&
      hasFrameDepthPass(s.stats.framePhases ?? s.stats.phases, "campaign-ui-selection", "read") &&
      hasFramePassRole(
        s.stats.framePhases ?? s.stats.phases,
        "campaign-ui-selection",
        "world-decal",
        "world-depth",
      ) &&
      s.stats.ui.armyPanel &&
      s.stats.ui.cityPanel &&
      s.stats.ui.autoReplenishToggle &&
      s.stats.ui.classRows >= 8 &&
      s.stats.ui.diplomacyRows >= 1 &&
      s.stats.labelLayer === "raw-gpu-glyph-atlas" &&
      s.stats.labelVertices > 0 &&
      s.stats.postCutoverScreenshots === "renderer-only",
  ],
  [
    "campaign-models?gate=city",
    (s) =>
      s?.ok &&
      s.route === "campaign-models" &&
      s.stats.gate === "city" &&
      s.stats.depth?.allocated === true &&
      hasFramePhaseOrder(s.stats.framePhases ?? s.stats.phases) &&
      s.stats.entityLayer === "raw-gpu-city-model-meshes" &&
      s.stats.standardLayer === "shared-3d-standard-asset" &&
      s.stats.samples?.cityStandard?.hiddenLowerCloth &&
      s.stats.samples?.cityStandard?.visibleUpperCloth,
  ],
  [
    "campaign-models?gate=garrison-outside",
    (s) =>
      s?.ok &&
      s.route === "campaign-models" &&
      s.stats.gate === "garrison-outside" &&
      s.stats.depth?.allocated === true &&
      hasFramePhaseOrder(s.stats.framePhases ?? s.stats.phases) &&
      s.stats.entityLayer === "raw-gpu-city-model-meshes" &&
      s.stats.standardLayer === "shared-3d-standard-asset" &&
      s.stats.samples?.garrison?.visibleShieldOutsideCity &&
      s.stats.samples?.garrison?.visibleStandardOutsideCity,
  ],
  [
    "campaign-models?gate=garrison-city",
    (s) =>
      s?.ok &&
      s.route === "campaign-models" &&
      s.stats.gate === "garrison-city" &&
      s.stats.depth?.allocated === true &&
      hasFramePhaseOrder(s.stats.framePhases ?? s.stats.phases) &&
      s.stats.entityLayer === "raw-gpu-city-model-meshes" &&
      s.stats.standardLayer === "shared-3d-standard-asset" &&
      s.stats.samples?.garrison?.hiddenShieldInsideWall &&
      s.stats.samples?.garrison?.visibleStandardAboveRoofs,
  ],
  [
    "campaign-models?gate=garrison-hidden",
    (s) =>
      s?.ok &&
      s.route === "campaign-models" &&
      s.stats.gate === "garrison-hidden" &&
      s.stats.depth?.allocated === true &&
      hasFramePhaseOrder(s.stats.framePhases ?? s.stats.phases) &&
      s.stats.entityLayer === "raw-gpu-city-model-meshes" &&
      s.stats.standardLayer === "shared-3d-standard-asset" &&
      s.stats.samples?.garrison?.hiddenBodyInsideCity &&
      s.stats.samples?.garrison?.hiddenStandardInsideCity,
  ],
  [
    "campaign-models?gate=selected-city",
    (s) =>
      s?.ok &&
      s.route === "campaign-models" &&
      s.stats.gate === "selected-city" &&
      s.stats.selections === 1 &&
      s.stats.depth?.allocated === true &&
      hasFramePhaseOrder(s.stats.framePhases ?? s.stats.phases) &&
      hasFrameDepthPass(s.stats.framePhases, "model-shot-selection", "read") &&
      hasFrameDepthPass(s.stats.framePhases, "model-shot-entities-opaque", "read-write") &&
      hasFrameDepthPass(s.stats.framePhases, "model-shot-entity-shadows", "read") &&
      hasFramePassRole(s.stats.framePhases, "model-shot-selection", "world-decal", "world-depth") &&
      hasFramePassRole(
        s.stats.framePhases,
        "model-shot-entities-opaque",
        "world-opaque",
        "world-depth",
      ) &&
      hasFramePassRole(
        s.stats.framePhases,
        "model-shot-entity-shadows",
        "world-decal",
        "world-depth",
      ) &&
      s.stats.samples?.selectionDepth?.occludedByCityCore &&
      s.stats.samples?.selectionDepth?.visibleOuterRing,
  ],
  [
    "campaign-models?gate=army",
    (s) =>
      s?.ok &&
      s.route === "campaign-models" &&
      s.stats.gate === "army" &&
      s.stats.selections === 1 &&
      s.stats.depth?.allocated === true &&
      hasFramePhaseOrder(s.stats.framePhases ?? s.stats.phases) &&
      hasFrameDepthPass(s.stats.framePhases, "model-shot-selection", "read") &&
      hasFrameDepthPass(s.stats.framePhases, "model-shot-entities-opaque", "read-write") &&
      hasFrameDepthPass(s.stats.framePhases, "model-shot-entity-shadows", "read") &&
      hasFramePassRole(s.stats.framePhases, "model-shot-selection", "world-decal", "world-depth") &&
      hasFramePassRole(
        s.stats.framePhases,
        "model-shot-entities-opaque",
        "world-opaque",
        "world-depth",
      ) &&
      hasFramePassRole(
        s.stats.framePhases,
        "model-shot-entity-shadows",
        "world-decal",
        "world-depth",
      ) &&
      s.stats.samples?.selectionDepth?.occludedByArmyCore &&
      s.stats.samples?.selectionDepth?.visibleOuterRing,
  ],
  [
    "campaign-models?gate=hostile-depth-order",
    (s) =>
      s?.ok &&
      s.route === "campaign-models" &&
      s.stats.gate === "hostile-depth-order" &&
      s.stats.hostileDrawOrder === "entities-before-late-scenery" &&
      s.stats.depth?.allocated === true &&
      s.stats.depth?.format === GPU_DEPTH_FORMAT &&
      hasFrameDepthPass(s.stats.framePhases, "model-shot-entities-opaque", "read-write") &&
      hasFrameDepthPass(s.stats.framePhases, "model-shot-scenery-opaque", "read-write") &&
      hasFrameDepthPass(s.stats.framePhases, "model-shot-entity-shadows", "read") &&
      hasFrameDepthPass(s.stats.framePhases, "model-shot-scenery-shadows", "read") &&
      s.stats.samples?.hostileDepthOrder?.flagOverLateTree &&
      s.stats.samples?.hostileDepthOrder?.lateTreeControl,
  ],
  [
    "shared-grass-models?gate=tuft",
    (s) =>
      s?.ok &&
      s.route === "shared-grass-models" &&
      s.stats.gate === "tuft" &&
      s.stats.tuftInstances === 1 &&
      // The authored tuft fixture is a single 13-blade tuft (bladeInstances =
      // tufts × bladesPerTuft); pin a non-trivial blade count, not a number the
      // fixture cannot reach.
      s.stats.bladeInstances >= 10 &&
      s.stats.cameraContract === "shared-world-camera-wgsl" &&
      hasFramePhaseOrder(s.stats.framePhases) &&
      hasFrameDepthPass(s.stats.framePhases, "shared-grass-model", "read-write") &&
      hasFramePassRole(s.stats.framePhases, "shared-grass-model", "world-opaque", "world-depth"),
  ],
  [
    "shared-standard-models?gate=battle-unit-azure",
    (s) =>
      s?.ok &&
      s.route === "shared-standard-models" &&
      s.stats.gate === "battle-unit-azure" &&
      s.stats.tier === "battle-unit" &&
      s.stats.faction === "azure" &&
      s.stats.standards === 1 &&
      s.stats.timeSeconds === 0.75 &&
      s.stats.weightChannel?.includes(">0 cloth") &&
      s.stats.waveContract?.includes("cam.time") &&
      s.stats.cameraContract === "shared-world-camera-wgsl" &&
      hasFramePhaseOrder(s.stats.framePhases) &&
      hasFrameDepthPass(s.stats.framePhases, "shared-standard-opaque", "read-write") &&
      hasFrameDepthPass(s.stats.framePhases, "shared-standard-shadow", "read") &&
      hasFramePassRole(
        s.stats.framePhases,
        "shared-standard-opaque",
        "world-opaque",
        "world-depth",
      ) &&
      hasFramePassRole(s.stats.framePhases, "shared-standard-shadow", "world-decal", "world-depth"),
  ],
  [
    "render-graph",
    (s) =>
      s?.ok &&
      s.route === "render-graph" &&
      s.stats.firstPass === "camera" &&
      s.stats.lastPass === "present" &&
      s.stats.passes >= 17 &&
      graphFramePhaseOrder(s.stats.graphFramePhases) &&
      s.stats.depthPasses?.includes("worldDepthClear") &&
      s.stats.depthPasses?.includes("battleTerrainProps") &&
      s.stats.depthPasses?.includes("battleCrowd") &&
      s.stats.depthPasses?.includes("battleGroundCues") &&
      s.stats.depthPasses?.includes("campaignSceneryOpaque") &&
      s.stats.depthPasses?.includes("campaignEntitiesOpaque") &&
      s.stats.depthPasses?.includes("campaignSceneryShadows") &&
      s.stats.depthPasses?.includes("campaignEntityShadows") &&
      s.stats.depthPasses?.includes("campaignRoads") &&
      s.stats.depthPasses?.includes("campaignSeaLanes") &&
      s.stats.depthPasses?.includes("campaignGroundSelection") &&
      hasGraphPassRole(
        s.stats.graphPassRoles,
        "battleTerrain",
        "background-underpaint",
        "background",
      ) &&
      hasGraphPassRole(
        s.stats.graphPassRoles,
        "campaignMapUnderpaint",
        "background-underpaint",
        "background",
      ) &&
      hasGraphPassRole(
        s.stats.graphPassRoles,
        "worldDepthClear",
        "world-depth-fill",
        "world-depth",
      ) &&
      hasGraphPassRole(
        s.stats.graphPassRoles,
        "battleTerrainProps",
        "world-opaque",
        "world-depth",
      ) &&
      hasGraphPassRole(s.stats.graphPassRoles, "battleCrowd", "world-opaque", "world-depth") &&
      hasGraphPassRole(s.stats.graphPassRoles, "battleGroundCues", "world-decal", "world-depth") &&
      hasGraphPassRole(
        s.stats.graphPassRoles,
        "campaignSceneryOpaque",
        "world-opaque",
        "world-depth",
      ) &&
      hasGraphPassRole(
        s.stats.graphPassRoles,
        "campaignEntitiesOpaque",
        "world-opaque",
        "world-depth",
      ) &&
      hasGraphPassRole(
        s.stats.graphPassRoles,
        "campaignSceneryShadows",
        "world-decal",
        "world-depth",
      ) &&
      hasGraphPassRole(
        s.stats.graphPassRoles,
        "campaignEntityShadows",
        "world-decal",
        "world-depth",
      ) &&
      hasGraphPassRole(s.stats.graphPassRoles, "campaignRoads", "world-decal", "world-depth") &&
      hasGraphPassRole(s.stats.graphPassRoles, "campaignSeaLanes", "world-decal", "world-depth") &&
      hasGraphPassRole(
        s.stats.graphPassRoles,
        "campaignGroundSelection",
        "world-decal",
        "world-depth",
      ) &&
      hasGraphPassRole(s.stats.graphPassRoles, "atmosphereOverlays", "overlay-effect", "overlay") &&
      hasGraphPassRole(s.stats.graphPassRoles, "battleEffectLines", "overlay-effect", "overlay") &&
      hasGraphPassRole(s.stats.graphPassRoles, "battleDebugOverlays", "overlay-debug", "overlay") &&
      hasGraphPassRole(s.stats.graphPassRoles, "campaignMarkers", "overlay-ui", "overlay") &&
      hasGraphPassRole(s.stats.graphPassRoles, "labelsAndHudAnchors", "overlay-ui", "overlay") &&
      hasGraphPassRole(s.stats.graphPassRoles, "gameUi", "overlay-ui", "overlay") &&
      hasGraphDepthPassMode(s.stats.depthPassModes, "worldDepthClear", "write") &&
      hasGraphDepthPassMode(s.stats.depthPassModes, "battleTerrainProps", "read-write") &&
      hasGraphDepthPassMode(s.stats.depthPassModes, "battleCrowd", "read-write") &&
      hasGraphDepthPassMode(s.stats.depthPassModes, "battleGroundCues", "read") &&
      hasGraphDepthPassMode(s.stats.depthPassModes, "campaignSceneryOpaque", "read-write") &&
      hasGraphDepthPassMode(s.stats.depthPassModes, "campaignEntitiesOpaque", "read-write") &&
      hasGraphDepthPassMode(s.stats.depthPassModes, "campaignSceneryShadows", "read") &&
      hasGraphDepthPassMode(s.stats.depthPassModes, "campaignEntityShadows", "read") &&
      hasGraphDepthPassMode(s.stats.depthPassModes, "campaignRoads", "read") &&
      hasGraphDepthPassMode(s.stats.depthPassModes, "campaignSeaLanes", "read") &&
      hasGraphDepthPassMode(s.stats.depthPassModes, "campaignGroundSelection", "read") &&
      depthContractFixturesRejected(s.stats.depthContractFixtures) &&
      bucketContractFixturesSatisfied(s.stats.bucketContractFixtures) &&
      s.stats.backgroundDepthPasses?.length === 0 &&
      s.stats.overlayDepthPasses?.length === 0 &&
      s.stats.depth?.allocated === true &&
      s.stats.depth?.format === GPU_DEPTH_FORMAT &&
      hasFramePhaseOrder(s.stats.framePhases) &&
      hasFramePass(s.stats.framePhases, "render-graph-nested-3d") &&
      hasFrameDepthPass(s.stats.framePhases, "render-graph-nested-3d", "read-write") &&
      hasFramePassRole(
        s.stats.framePhases,
        "render-graph-nested-3d",
        "world-opaque",
        "world-depth",
      ) &&
      s.stats.nested3d?.fixtures?.includes("flag-in-city") &&
      s.stats.nested3d?.fixtures?.includes("garrison-in-city-stub") &&
      s.stats.nested3d?.fixtures?.includes("rank-overlap"),
  ],
  [
    "world-camera",
    (s) =>
      s?.ok &&
      s.route === "world-camera" &&
      s.stats.cameraContract === "shared-world-camera-wgsl" &&
      s.stats.depth?.allocated === true &&
      s.stats.depth?.format === GPU_DEPTH_FORMAT &&
      hasFramePhaseOrder(s.stats.framePhases) &&
      hasFramePass(s.stats.framePhases, "world-camera-nested-3d") &&
      hasFrameDepthPass(s.stats.framePhases, "world-camera-nested-3d", "read-write") &&
      hasFramePassRole(
        s.stats.framePhases,
        "world-camera-nested-3d",
        "world-opaque",
        "world-depth",
      ) &&
      s.stats.anchorAgreement?.maxDelta < 0.05 &&
      s.stats.nested3d?.fixtures?.includes("flag-in-city") &&
      s.stats.nested3d?.fixtures?.includes("garrison-in-city-stub") &&
      s.stats.nested3d?.fixtures?.includes("rank-overlap"),
  ],
  [
    "battle-terrain?fixture=coast",
    (s) =>
      s?.ok &&
      s.route === "battle-terrain" &&
      s.stats.fixture === "coast" &&
      s.stats.waterQuads >= 3 &&
      s.stats.sceneryQuads >= 8 &&
      s.stats.worldPropQuads >= 4 &&
      s.stats.cameraContract === "shared-world-camera-wgsl",
  ],
  [
    "battle-terrain?fixture=melee",
    (s) =>
      s?.ok &&
      s.route === "battle-terrain" &&
      s.stats.fixture === "melee" &&
      s.stats.waterQuads >= 3 &&
      s.stats.sceneryQuads >= 8 &&
      s.stats.worldPropQuads >= 4 &&
      s.stats.selectionQuads === 0 &&
      s.stats.cameraContract === "shared-world-camera-wgsl",
  ],
  [
    "battle-grass?phase=0",
    (s) =>
      s?.ok &&
      s.route === "battle-grass" &&
      s.stats.gate === "flat-field" &&
      s.stats.tuftInstances > 300 &&
      s.stats.bladeInstances === s.stats.tuftInstances * 9 &&
      s.stats.cappedTufts > 0 &&
      s.stats.cameraContract === "shared-world-camera-wgsl" &&
      hasFrameDepthPass(s.stats.framePhases, "battle-grass-flat-field", "read-write") &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-grass-flat-field",
        "world-opaque",
        "world-depth",
      ),
  ],
  [
    "battle-grass-field?mode=packed-tilt",
    (s) =>
      s?.ok &&
      s.route === "battle-grass-field" &&
      s.stats.mode === "packed-tilt" &&
      s.stats.grass?.prepMode === "packed-field" &&
      s.stats.grass?.fieldRecords > 100 &&
      s.stats.grass?.fieldRejectedSlopeCells > 0 &&
      s.stats.grass?.packedStrideFloats === 16 &&
      s.stats.grass?.fieldRecordStrideFloats === 16 &&
      s.stats.grass?.instanceBytes === s.stats.grass?.fieldRecords * 16 * 4 &&
      s.stats.grass?.submittedTriangles > 0 &&
      s.stats.grass?.drawCalls === 1 &&
      hasFrameDepthPass(s.stats.framePhases, "battle-grass-field-packed-tilt", "read-write") &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-grass-field-packed-tilt",
        "world-opaque",
        "world-depth",
      ),
  ],
  [
    "battle-grass-field?mode=field-meadow",
    (s) =>
      s?.ok &&
      s.route === "battle-grass-field" &&
      s.stats.mode === "field-meadow" &&
      s.stats.grass?.prepMode === "packed-field" &&
      s.stats.grass?.fieldRecords > 100 &&
      s.stats.grass?.bladeInstances === 0 &&
      s.stats.grass?.drawCalls === 0 &&
      s.stats.ground?.meadow?.enabled === true &&
      s.stats.ground?.meadow?.source === "field" &&
      s.stats.ground?.meadow?.fieldRecords === s.stats.grass?.fieldRecords &&
      s.stats.ground?.meadow?.fieldCoverage > 0.5 &&
      s.stats.ground?.meadow?.avgDensity > 0.18 &&
      s.stats.ground?.meadow?.rootMassEnabled === false &&
      s.stats.ground?.meadow?.textureWidth > 1 &&
      hasFrameDepthPass(s.stats.framePhases, "battle-grass-field-packed-tilt", "read-write") &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-grass-field-packed-tilt",
        "world-opaque",
        "world-depth",
      ),
  ],
  [
    "battle-grass-field?mode=field-accent",
    (s) =>
      s?.ok &&
      s.route === "battle-grass-field" &&
      s.stats.mode === "field-accent" &&
      s.stats.grass?.prepMode === "packed-field" &&
      s.stats.grass?.fieldRecords > 100 &&
      s.stats.grass?.accentTufts > 20 &&
      s.stats.grass?.accentStyle === "field-fiber-shell" &&
      s.stats.grass?.accentAggregation === "field-near" &&
      s.stats.grass?.grassPrimitiveFamily === "field-fiber-shell" &&
      s.stats.grass?.fiberShellVariant === "normal" &&
      s.stats.grass?.accentClumps === 0 &&
      s.stats.grass?.accentSourceRecords > s.stats.grass?.accentTufts &&
      s.stats.grass?.fiberShellSourceRecords === s.stats.grass?.accentSourceRecords &&
      s.stats.grass?.fiberShellRecords === s.stats.grass?.accentTufts &&
      s.stats.grass?.fiberShellRibbons === s.stats.grass?.accentRibbons &&
      s.stats.grass?.fiberShellRibbons >= s.stats.grass?.fiberShellRecords &&
      s.stats.grass?.fiberShellDepthFar > s.stats.grass?.fiberShellDepthNear &&
      s.stats.grass?.fiberShellSubmittedTriangles === s.stats.grass?.submittedTriangles &&
      s.stats.grass?.tuftInstances === s.stats.grass?.accentTufts &&
      s.stats.grass?.tuftInstances < s.stats.grass?.fieldRecords &&
      s.stats.grass?.bladeInstances >= s.stats.grass?.tuftInstances &&
      s.stats.grass?.drawCalls === 1 &&
      s.stats.ground?.meadow?.enabled === true &&
      s.stats.ground?.meadow?.source === "field" &&
      s.stats.ground?.meadow?.fieldRecords === s.stats.grass?.fieldRecords &&
      s.stats.ground?.meadow?.fieldCoverage > 0.5 &&
      s.stats.ground?.meadow?.rootMassEnabled === true &&
      s.stats.ground?.meadow?.rootMassCoverage > 0.05 &&
      hasFrameDepthPass(s.stats.framePhases, "battle-grass-field-packed-tilt", "read-write") &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-grass-field-packed-tilt",
        "world-opaque",
        "world-depth",
      ),
  ],
  [
    "battle-grass-field?mode=foreground-close-lab",
    (s) =>
      s?.ok &&
      s.route === "battle-grass-field" &&
      s.stats.mode === "foreground-close-lab" &&
      s.stats.lab?.profile === "foreground-close-lab" &&
      s.stats.lab?.contract === "03B4C5B4B1" &&
      s.stats.lab?.reviewWindows?.closeHero &&
      s.stats.lab?.reviewWindows?.transition &&
      s.stats.lab?.reviewWindows?.midMass &&
      s.stats.lab?.foregroundWorldUnitsPerPixel < 0.012 &&
      s.stats.camera?.zoom > 90 &&
      s.stats.grass?.prepMode === "packed-field" &&
      s.stats.grass?.fieldRecords > 100 &&
      s.stats.grass?.accentStyle === "field-fiber-shell" &&
      s.stats.grass?.accentAggregation === "field-near" &&
      s.stats.grass?.grassPrimitiveFamily === "field-fiber-shell" &&
      s.stats.grass?.fiberShellVariant === "normal" &&
      s.stats.grass?.accentTufts > 20 &&
      s.stats.grass?.accentTufts < s.stats.grass?.fieldRecords &&
      s.stats.grass?.drawCalls === 1 &&
      s.stats.ground?.meadow?.enabled === true &&
      s.stats.ground?.meadow?.source === "field" &&
      s.stats.ground?.meadow?.rootMassEnabled === true &&
      hasFrameDepthPass(s.stats.framePhases, "battle-grass-field-packed-tilt", "read-write") &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-grass-field-packed-tilt",
        "world-opaque",
        "world-depth",
      ),
  ],
  [
    "battle-grass-field?mode=foreground-close-lab&labCameraProfile=scale-repair-low",
    (s) =>
      s?.ok &&
      s.route === "battle-grass-field" &&
      s.stats.mode === "foreground-close-lab" &&
      s.stats.lab?.profile === "foreground-close-lab" &&
      s.stats.lab?.contract === "03B4C5B4B1R" &&
      s.stats.lab?.cameraProfile === "scale-repair-low" &&
      s.stats.lab?.calibration === "neutral-scale-guides" &&
      s.stats.lab?.reviewWindows?.closeHero &&
      s.stats.lab?.reviewWindows?.transition &&
      s.stats.lab?.reviewWindows?.midMass &&
      s.stats.lab?.foregroundWorldUnitsPerPixel < 0.008 &&
      s.stats.camera?.zoom > 140 &&
      s.stats.camera?.pitch > 1.1 &&
      s.stats.grass?.prepMode === "packed-field" &&
      s.stats.grass?.fieldRecords > 100 &&
      s.stats.grass?.accentStyle === "field-fiber-shell" &&
      s.stats.grass?.accentAggregation === "field-near" &&
      s.stats.grass?.grassPrimitiveFamily === "field-fiber-shell" &&
      s.stats.grass?.fiberShellVariant === "normal" &&
      s.stats.grass?.accentTufts > 20 &&
      s.stats.grass?.accentTufts < s.stats.grass?.fieldRecords &&
      s.stats.grass?.drawCalls === 1 &&
      s.stats.ground?.meadow?.enabled === true &&
      s.stats.ground?.meadow?.source === "field" &&
      s.stats.ground?.meadow?.rootMassEnabled === true &&
      hasFrameDepthPass(s.stats.framePhases, "battle-grass-field-packed-tilt", "read-write") &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-grass-field-packed-tilt",
        "world-opaque",
        "world-depth",
      ),
  ],
  [
    "battle-grass-field?mode=foreground-close-lab&labCameraProfile=b4b1a0-test-env",
    (s) =>
      s?.ok &&
      s.route === "battle-grass-field" &&
      s.stats.mode === "foreground-close-lab" &&
      s.stats.lab?.profile === "foreground-close-lab" &&
      s.stats.lab?.contract === "03B4C5B4B1A0" &&
      s.stats.lab?.cameraProfile === "b4b1a0-test-env" &&
      s.stats.lab?.cropPurpose === "test-environment-comparability-not-body-acceptance" &&
      s.stats.lab?.calibration === "test-environment-review-windows" &&
      s.stats.lab?.reviewWindows?.closeHero &&
      s.stats.lab?.reviewWindows?.transition &&
      s.stats.lab?.reviewWindows?.midMass &&
      s.stats.lab?.foregroundWorldUnitsPerPixel < 0.006 &&
      s.stats.camera?.zoom > 170 &&
      s.stats.camera?.pitch > 1.15 &&
      s.stats.grass?.prepMode === "packed-field" &&
      s.stats.grass?.fieldRecords > 100 &&
      s.stats.grass?.accentStyle === "field-fiber-shell" &&
      s.stats.grass?.accentAggregation === "field-near" &&
      s.stats.grass?.grassPrimitiveFamily === "field-fiber-shell" &&
      s.stats.grass?.fiberShellVariant === "normal" &&
      s.stats.grass?.accentTufts > 20 &&
      s.stats.grass?.accentTufts < s.stats.grass?.fieldRecords &&
      s.stats.grass?.drawCalls === 1 &&
      s.stats.ground?.meadow?.enabled === true &&
      s.stats.ground?.meadow?.source === "field" &&
      s.stats.ground?.meadow?.rootMassEnabled === true &&
      hasFrameDepthPass(s.stats.framePhases, "battle-grass-field-packed-tilt", "read-write") &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-grass-field-packed-tilt",
        "world-opaque",
        "world-depth",
      ),
  ],
  [
    "battle-grass-field?mode=field-accent&grassPrimitiveFamily=volume-card",
    (s) =>
      s?.ok &&
      s.route === "battle-grass-field" &&
      s.stats.mode === "field-accent" &&
      s.stats.grass?.prepMode === "packed-field" &&
      s.stats.grass?.grassPrimitiveFamily === "volume-card" &&
      s.stats.grass?.grassPrimitiveBaseline === "field-fiber-shell-normal" &&
      s.stats.grass?.accentStyle === "volume-card" &&
      s.stats.grass?.accentAggregation === "clump" &&
      s.stats.grass?.accentClumps > 20 &&
      s.stats.grass?.accentSourceRecords > s.stats.grass?.accentTufts &&
      s.stats.grass?.grassPrimitiveSourceRecords === s.stats.grass?.accentSourceRecords &&
      s.stats.grass?.grassPrimitiveRecords === s.stats.grass?.accentTufts &&
      s.stats.grass?.grassPrimitiveClumps === s.stats.grass?.accentClumps &&
      s.stats.grass?.grassPrimitiveDepthFar > s.stats.grass?.grassPrimitiveDepthNear &&
      s.stats.grass?.submittedTriangles > 0 &&
      s.stats.grass?.submittedTriangles < 83200 &&
      s.stats.grass?.drawCalls === 1 &&
      s.stats.ground?.meadow?.enabled === true &&
      s.stats.ground?.meadow?.source === "field" &&
      s.stats.ground?.meadow?.rootMassEnabled === true &&
      hasFrameDepthPass(s.stats.framePhases, "battle-grass-field-packed-tilt", "read-write") &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-grass-field-packed-tilt",
        "world-opaque",
        "world-depth",
      ),
  ],
  [
    "battle-grass-field?mode=field-accent&grassPrimitiveFamily=texture-volume",
    (s) =>
      s?.ok &&
      s.route === "battle-grass-field" &&
      s.stats.mode === "field-accent" &&
      s.stats.grass?.prepMode === "packed-field" &&
      s.stats.grass?.grassPrimitiveFamily === "texture-volume" &&
      s.stats.grass?.grassPrimitiveBaseline === "field-fiber-shell-normal" &&
      s.stats.grass?.accentStyle === "volume-card" &&
      s.stats.grass?.accentAggregation === "field-cell" &&
      s.stats.grass?.accentClumps > 200 &&
      s.stats.grass?.accentSourceRecords > s.stats.grass?.accentTufts &&
      s.stats.grass?.grassPrimitiveSourceRecords === s.stats.grass?.accentSourceRecords &&
      s.stats.grass?.grassPrimitiveRecords === s.stats.grass?.accentTufts &&
      s.stats.grass?.grassPrimitiveClumps === s.stats.grass?.accentClumps &&
      s.stats.grass?.grassPrimitiveTextureWidth === 256 &&
      s.stats.grass?.grassPrimitiveTextureHeight === 64 &&
      s.stats.grass?.grassPrimitiveTextureTiles === 4 &&
      s.stats.grass?.grassPrimitiveTextureBytes === 65536 &&
      s.stats.grass?.grassPrimitiveDepthFar > s.stats.grass?.grassPrimitiveDepthNear &&
      s.stats.grass?.submittedTriangles > 0 &&
      s.stats.grass?.submittedTriangles < 83200 &&
      s.stats.grass?.drawCalls === 1 &&
      s.stats.ground?.meadow?.enabled === true &&
      s.stats.ground?.meadow?.source === "field" &&
      s.stats.ground?.meadow?.rootMassEnabled === true &&
      hasFrameDepthPass(s.stats.framePhases, "battle-grass-field-packed-tilt", "read-write") &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-grass-field-packed-tilt",
        "world-opaque",
        "world-depth",
      ),
  ],
  [
    "battle-grass-field?mode=field-accent&grassPrimitiveFamily=texture-carrier",
    (s) =>
      s?.ok &&
      s.route === "battle-grass-field" &&
      s.stats.mode === "field-accent" &&
      s.stats.grass?.prepMode === "packed-field" &&
      s.stats.grass?.grassPrimitiveFamily === "texture-carrier" &&
      s.stats.grass?.grassPrimitiveBaseline === "field-fiber-shell-normal" &&
      s.stats.grass?.accentStyle === "volume-card" &&
      s.stats.grass?.accentAggregation === "field-cell" &&
      s.stats.grass?.accentClumps > 500 &&
      s.stats.grass?.accentTufts === s.stats.grass?.accentClumps &&
      s.stats.grass?.accentSourceRecords > s.stats.grass?.accentTufts &&
      s.stats.grass?.grassPrimitiveSourceRecords === s.stats.grass?.accentSourceRecords &&
      s.stats.grass?.grassPrimitiveRecords === s.stats.grass?.accentTufts &&
      s.stats.grass?.grassPrimitiveClumps === s.stats.grass?.accentClumps &&
      s.stats.grass?.grassPrimitiveTextureWidth === 256 &&
      s.stats.grass?.grassPrimitiveTextureHeight === 64 &&
      s.stats.grass?.grassPrimitiveTextureTiles === 4 &&
      s.stats.grass?.grassPrimitiveTextureBytes === 65536 &&
      s.stats.grass?.grassPrimitiveDepthFar > s.stats.grass?.grassPrimitiveDepthNear &&
      s.stats.grass?.submittedTriangles > 0 &&
      s.stats.grass?.submittedTriangles < 83200 &&
      s.stats.grass?.drawCalls === 1 &&
      s.stats.ground?.meadow?.enabled === true &&
      s.stats.ground?.meadow?.source === "field" &&
      s.stats.ground?.meadow?.rootMassEnabled === true &&
      hasFrameDepthPass(s.stats.framePhases, "battle-grass-field-packed-tilt", "read-write") &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-grass-field-packed-tilt",
        "world-opaque",
        "world-depth",
      ),
  ],
  [
    "battle-grass-field?mode=field-accent&grassPrimitiveFamily=texture-micro-carrier",
    (s) =>
      s?.ok &&
      s.route === "battle-grass-field" &&
      s.stats.mode === "field-accent" &&
      s.stats.grass?.prepMode === "packed-field" &&
      s.stats.grass?.grassPrimitiveFamily === "texture-micro-carrier" &&
      s.stats.grass?.grassPrimitiveBaseline === "field-fiber-shell-normal" &&
      s.stats.grass?.accentStyle === "volume-card" &&
      s.stats.grass?.accentAggregation === "field-cell" &&
      s.stats.grass?.accentClumps > 900 &&
      s.stats.grass?.accentTufts > s.stats.grass?.accentClumps &&
      s.stats.grass?.accentTufts <= s.stats.grass?.accentClumps * 4 &&
      s.stats.grass?.grassPrimitiveSourceRecords === s.stats.grass?.accentSourceRecords &&
      s.stats.grass?.grassPrimitiveRecords === s.stats.grass?.accentTufts &&
      s.stats.grass?.grassPrimitiveClumps === s.stats.grass?.accentClumps &&
      s.stats.grass?.grassPrimitiveTextureWidth === 256 &&
      s.stats.grass?.grassPrimitiveTextureHeight === 64 &&
      s.stats.grass?.grassPrimitiveTextureTiles === 4 &&
      s.stats.grass?.grassPrimitiveTextureBytes === 65536 &&
      s.stats.grass?.grassPrimitiveMicroCards >= s.stats.grass?.accentTufts * 3 &&
      s.stats.grass?.grassPrimitiveDepthFar > s.stats.grass?.grassPrimitiveDepthNear &&
      s.stats.grass?.meshTriangles <= 8 &&
      s.stats.grass?.submittedTriangles > s.stats.grass?.accentTufts &&
      s.stats.grass?.submittedTriangles < 83200 &&
      s.stats.grass?.drawCalls === 1 &&
      s.stats.ground?.meadow?.enabled === true &&
      s.stats.ground?.meadow?.source === "field" &&
      s.stats.ground?.meadow?.rootMassEnabled === true &&
      hasFrameDepthPass(s.stats.framePhases, "battle-grass-field-packed-tilt", "read-write") &&
      hasFramePassRole(
        s.stats.framePhases,
        "battle-grass-field-packed-tilt",
        "world-opaque",
        "world-depth",
      ),
  ],
  [
    "battle-live?mode=5v5&ticks=36",
    (s) =>
      s?.ok &&
      s.route === "battle-live" &&
      s.stats.written > 1000 &&
      s.stats.units >= 10 &&
      s.stats.player > 0 &&
      s.stats.enemy > 0 &&
      s.stats.drawCalls >= 1 &&
      s.stats.drawCalls <= 15 &&
      s.stats.groundCues.lineSegments >= 20 &&
      hasFramePassRole(
        s.stats.framePhases ?? s.stats.phases,
        "battle-live-crowd",
        "world-opaque",
        "world-depth",
      ) &&
      hasFramePassRole(
        s.stats.framePhases ?? s.stats.phases,
        "battle-live-ground-cues",
        "world-decal",
        "world-depth",
      ) &&
      s.stats.cameraContract === "shared-world-camera-wgsl" &&
      s.stats.groundCues.cameraContract === "shared-world-camera-wgsl",
  ],
  [
    "battle-ui?mode=5v5&ticks=36",
    (s) =>
      s?.ok &&
      s.route === "battle-ui" &&
      s.stats.written > 1000 &&
      s.stats.units >= 10 &&
      s.stats.drawCalls >= 1 &&
      s.stats.drawCalls <= 15 &&
      s.stats.groundCues.lineSegments >= 20 &&
      hasFramePassRole(
        s.stats.framePhases ?? s.stats.phases,
        "battle-ui-crowd",
        "world-opaque",
        "world-depth",
      ) &&
      hasFramePassRole(
        s.stats.framePhases ?? s.stats.phases,
        "battle-ui-ground-cues",
        "world-decal",
        "world-depth",
      ) &&
      s.stats.ui.cards >= 8 &&
      s.stats.ui.toolbarButtons >= 5 &&
      s.stats.ui.postCutoverScreenshots === "renderer-only" &&
      s.stats.cameraContract === "shared-world-camera-wgsl" &&
      s.stats.groundCues.cameraContract === "shared-world-camera-wgsl",
  ],
  [
    "battle-input?mode=5v5&ticks=36",
    (s) =>
      s?.ok &&
      s.route === "battle-input" &&
      s.stats.written > 1000 &&
      s.stats.units >= 10 &&
      s.stats.drawCalls >= 1 &&
      s.stats.drawCalls <= 15 &&
      s.stats.groundCues.lineSegments >= 20 &&
      hasFramePassRole(
        s.stats.framePhases ?? s.stats.phases,
        "battle-input-crowd",
        "world-opaque",
        "world-depth",
      ) &&
      hasFramePassRole(
        s.stats.framePhases ?? s.stats.phases,
        "battle-input-ground-cues",
        "world-decal",
        "world-depth",
      ) &&
      s.stats.selectedUnits.length === 1 &&
      s.stats.ui.cards >= 8 &&
      s.stats.cameraContract === "shared-world-camera-wgsl" &&
      s.stats.groundCues.cameraContract === "shared-world-camera-wgsl",
  ],
];

function hasGraphDepthPassMode(passes, id, mode) {
  return (
    Array.isArray(passes) &&
    passes.some(
      (pass) =>
        pass?.id === id && pass?.mode === mode && pass?.attachment === GPU_WORLD_DEPTH_ATTACHMENT,
    )
  );
}

function hasGraphPassRole(passes, id, role, framePhase) {
  return (
    Array.isArray(passes) &&
    passes.some((pass) => pass?.id === id && pass?.role === role && pass?.framePhase === framePhase)
  );
}

function bucketContractFixturesSatisfied(fixtures) {
  const expected = new Set(["topLevelTypeBucketPass", "semanticPassWithTypeBatching"]);
  return (
    Array.isArray(fixtures) &&
    fixtures.length === expected.size &&
    fixtures.every((fixture) => expected.has(fixture?.id) && Array.isArray(fixture?.diagnostics)) &&
    fixtures.some(
      (fixture) => fixture?.id === "topLevelTypeBucketPass" && fixture?.rejected === true,
    ) &&
    fixtures.some(
      (fixture) => fixture?.id === "semanticPassWithTypeBatching" && fixture?.accepted === true,
    )
  );
}

function depthContractFixturesRejected(fixtures) {
  const expected = new Set([
    "readModeWritesDepth",
    "writeModeReadsDepth",
    "unsupportedDepthAttachment",
    "unsupportedDepthMode",
    "missingSemanticRole",
    "mismatchedSemanticRole",
    "readOnlyBeforeWrite",
  ]);
  return (
    Array.isArray(fixtures) &&
    fixtures.length === expected.size &&
    fixtures.every(
      (fixture) =>
        expected.has(fixture?.id) &&
        fixture?.rejected === true &&
        Array.isArray(fixture?.diagnostics) &&
        fixture.diagnostics.length > 0,
    )
  );
}

function frameGraphContractFixturesRejected(fixtures) {
  const expected = new Set([
    "backgroundDepthMode",
    "worldMissingDepthMode",
    "worldUnsupportedDepthMode",
    "unsupportedPhase",
    "missingSemanticRole",
    "mismatchedSemanticRole",
    "mismatchedDepthRole",
    "readOnlyBeforeWrite",
    "topLevelTypeBucketPass",
    "markersMissingLayer",
  ]);
  return (
    Array.isArray(fixtures) &&
    fixtures.length === expected.size &&
    fixtures.every(
      (fixture) =>
        expected.has(fixture?.id) &&
        fixture?.rejected === true &&
        Array.isArray(fixture?.diagnostics) &&
        fixture.diagnostics.length > 0,
    )
  );
}

function graphFramePhaseOrder(phases) {
  return Array.isArray(phases) && phases.join(" -> ") === "background -> world-depth -> overlay";
}

async function findPrivateCameraStructs() {
  const roots = [
    new URL("../../../packages/renderer-core/src/", import.meta.url),
    new URL("../../../packages/game-renderer/src/", import.meta.url),
    new URL("../../src/", import.meta.url),
  ];
  const allowed = new Set([
    new URL("../../../packages/renderer-core/src/cameraWgsl.ts", import.meta.url).pathname,
  ]);
  const matches = [];
  for (const root of roots) {
    for (const file of await tsFiles(root)) {
      if (allowed.has(file.pathname)) continue;
      const source = await readFile(file, "utf8");
      if (/\bstruct\s+Camera\s*\{/.test(source)) {
        matches.push(file.pathname.replace(new URL("../../../", import.meta.url).pathname, ""));
      }
    }
  }
  return matches.sort();
}

async function tsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(entry.name, dir);
    if (entry.isDirectory()) {
      files.push(...(await tsFiles(new URL(`${entry.name}/`, dir))));
    } else if (entry.isFile() && /\.(?:ts|tsx|mts)$/.test(entry.name)) {
      files.push(child);
    }
  }
  return files;
}

// Slice 01 device/error resilience: a raw createShaderModule on a non-campaign
// renderer surface skips the structured WGSL diagnostic and can blank the
// screen on a shader typo. compileShader.ts owns the one allowed raw call.
async function findRawShaderModuleFootguns() {
  const roots = [
    new URL("../../../packages/renderer-core/src/", import.meta.url),
    new URL("../../../packages/game-renderer/src/battle/", import.meta.url),
    new URL("../../../packages/game-renderer/src/fixtures/", import.meta.url),
    new URL("../../src/battle/", import.meta.url),
    new URL("../../../apps/renderer-lab/src/", import.meta.url),
  ];
  const allowed = new Set([
    new URL("../../../packages/renderer-core/src/compileShader.ts", import.meta.url).pathname,
  ]);
  const root = new URL("../../../", import.meta.url).pathname;
  const matches = [];
  for (const dir of roots) {
    for (const file of await tsFiles(dir)) {
      if (allowed.has(file.pathname)) continue;
      const source = await readFile(file, "utf8");
      if (/\.createShaderModule\s*\(/.test(source)) {
        matches.push(file.pathname.replace(root, ""));
      }
    }
  }
  return matches.sort();
}

// A renderer.ready promise without a .catch turns an init failure into an
// unhandled rejection and a silent blank canvas instead of a fatal-error panel.
async function findUnguardedRendererReadyFootguns() {
  const roots = [
    new URL("../../src/battle/", import.meta.url),
    new URL("../../src/campaign/", import.meta.url),
  ];
  const root = new URL("../../../", import.meta.url).pathname;
  const matches = [];
  for (const dir of roots) {
    for (const file of await tsFiles(dir)) {
      const source = await readFile(file, "utf8");
      if (/\.ready\s*\.then\s*\(/.test(source) && !/\.catch\s*\(/.test(source)) {
        matches.push(file.pathname.replace(root, ""));
      }
    }
  }
  return matches.sort();
}

async function findCampaignDepthOnlyFootguns() {
  const files = [
    new URL("../../../packages/game-renderer/src/campaign/entityPass.ts", import.meta.url),
    new URL("../../../packages/game-renderer/src/campaign/sceneryPass.ts", import.meta.url),
    new URL("../../../packages/game-renderer/src/campaign/selectionPass.ts", import.meta.url),
    new URL("../../../packages/game-renderer/src/campaign/mapPass.ts", import.meta.url),
    new URL("../../src/campaign/renderer.ts", import.meta.url),
    new URL("../../../apps/renderer-lab/src/router.ts", import.meta.url),
  ];
  const root = new URL("../../../", import.meta.url).pathname;
  const checks = [
    ["drawDepth method", /\bdrawDepth\s*\(/],
    ["parallel depth pipeline field", /\bprivate\s+depthPipeline\b/],
    ["phase-selected line class", /\blines\s*=\s*new\s+CampaignLinePass\b/],
  ];
  const matches = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const [label, pattern] of checks) {
      if (pattern.test(source)) matches.push(`${file.pathname.replace(root, "")}: ${label}`);
    }
  }
  return matches.sort();
}

async function findPhaseBrandFootguns() {
  const root = new URL("../../../", import.meta.url).pathname;
  const files = [
    {
      file: new URL("../../../packages/renderer-core/src/frameShell.ts", import.meta.url),
      checks: [
        [
          "frame shell imports shared depth contract",
          /import\s*\{[^}]*GPU_DEPTH_FORMAT[^}]*type\s+GpuDepthMode[^}]*\}\s*from\s*['"]\.\/depthContract['"]/,
        ],
        [
          "frame shell imports shared bucket-pass guard",
          /import\s*\{[\s\S]*?isTopLevelTypeBucketPass[\s\S]*?\}\s*from\s*['"]\.\/frameGraphContract['"]/,
        ],
        [
          "frame commands require explicit marker layer for background markers",
          /markerLayer\?:\s*Exclude<MarkerLayerIntent,\s*'none'>[\s\S]*?background markers must declare markerLayer/,
        ],
        [
          "frame stats publish marker layer intent",
          /markerLayer:\s*MarkerLayerIntent[\s\S]*?markerLayer:\s*this\.markerLayer/,
        ],
        [
          "frame graph command list is phase-branded",
          /export type FrameGraphPass[\s\S]*?phase:\s*'background'[\s\S]*?BackgroundRenderPass[\s\S]*?phase:\s*'world-depth'[\s\S]*?WorldRenderPass[\s\S]*?phase:\s*'overlay'[\s\S]*?OverlayRenderPass/,
        ],
        [
          "frame graph command list declares semantic roles",
          /export type FrameGraphPass[\s\S]*?role:\s*'background-underpaint'[\s\S]*?role:\s*'world-depth-fill'\s*\|\s*'world-opaque'\s*\|\s*'world-decal'[\s\S]*?role:\s*'overlay-ui'\s*\|\s*'overlay-effect'\s*\|\s*'overlay-debug'/,
        ],
        ["frame commands accept graph passes", /passes\?:\s*FrameGraphPass\[\]/],
        ["phase stats publish graph pass ids", /passIds:\s*string\[\]/],
        [
          "phase stats publish semantic roles",
          /passRoles:\s*Array<\{\s*id:\s*string;\s*role:\s*FrameGraphPassRole\s*\}>/,
        ],
        [
          "world-depth graph passes use shared depth mode",
          /export type FrameGraphDepthMode\s*=\s*GpuDepthMode[\s\S]*?phase:\s*'world-depth';[\s\S]*?depth:\s*FrameGraphDepthMode/,
        ],
        [
          "phase stats publish depth pass modes",
          /depthPasses:\s*Array<\{\s*id:\s*string;\s*mode:\s*FrameGraphDepthMode\s*\}>/,
        ],
        [
          "live frame shell rejects bucket-shaped pass ids",
          /isTopLevelTypeBucketPass\(candidate\.id\)[\s\S]*?is a type bucket, not a semantic frame pass/,
        ],
      ],
    },
    {
      file: new URL("../../../packages/game-renderer/src/renderGraph.ts", import.meta.url),
      checks: [
        [
          "render graph imports shared depth contract",
          /import\s*\{[^}]*GPU_DEPTH_FORMAT[^}]*GPU_WORLD_DEPTH_ATTACHMENT[^}]*type\s+GpuDepthMode[^}]*\}\s*from\s*['"]\.\.\/\.\.\/renderer-core\/src\/depthContract['"]/,
        ],
        [
          "render graph imports shared frame role contract",
          /import\s*\{[\s\S]*?frameGraphDepthRole[\s\S]*?frameGraphRolePhase[\s\S]*?isFrameGraphPassRole[\s\S]*?type\s+FrameGraphPassRole[\s\S]*?\}\s*from\s*['"]\.\.\/\.\.\/renderer-core\/src\/frameGraphContract['"]/,
        ],
        [
          "render graph imports shared bucket-pass guard",
          /import\s*\{[\s\S]*?isTopLevelTypeBucketPass[\s\S]*?\}\s*from\s*['"]\.\.\/\.\.\/renderer-core\/src\/frameGraphContract['"]/,
        ],
        ["render graph pass declares semantic role", /role\?:\s*FrameGraphPassRole/],
        [
          "render graph validates semantic roles",
          /frame-phase pass "\$\{pass\.id\}" must declare a semantic role[\s\S]*?frameGraphRolePhase\(pass\.role\)/,
        ],
        [
          "render graph validates role-depth compatibility",
          /frameGraphDepthRole\(pass\.depth\.mode\)[\s\S]*?requires role/,
        ],
        ["render graph pass depth uses shared mode type", /mode:\s*GpuDepthMode/],
        ["render graph pass depth uses shared format type", /format:\s*typeof\s+GPU_DEPTH_FORMAT/],
        [
          "render graph validates shared world depth attachment",
          /pass\.depth\.attachment\s*!==\s*GPU_WORLD_DEPTH_ATTACHMENT/,
        ],
        [
          "render graph rejects bucket-shaped pass ids",
          /isTopLevelTypeBucketPass\(pass\.id\)[\s\S]*?is a type bucket, not a semantic render-graph pass/,
        ],
      ],
    },
    {
      file: new URL("../../../packages/renderer-core/src/skinnedPipeline.ts", import.meta.url),
      checks: [
        ["skinned crowd draw requires world pass", /\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/],
      ],
    },
    {
      file: new URL("../../../packages/game-renderer/src/battle/terrainPass.ts", import.meta.url),
      checks: [
        [
          "battle terrain underpaint draw requires background pass",
          /\bdraw\s*\(\s*pass:\s*BackgroundRenderPass\s*\)/,
        ],
        [
          "battle terrain prop draw requires world pass",
          /\bdrawProps\s*\(\s*pass:\s*WorldRenderPass\s*\)/,
        ],
        ["battle terrain uses the shared projector", /projectWorld\s*\(/],
        [
          "battle terrain prop uses shared read-write depth material contract",
          /gpuWorldDepthStencil\s*\(\s*'read-write'\s*,\s*'greater-equal'\s*\)/,
        ],
      ],
    },
    {
      file: new URL("../../../packages/game-renderer/src/battle/groundCuePass.ts", import.meta.url),
      checks: [
        [
          "battle ground cue draw requires world pass",
          /\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/,
        ],
        ["battle ground cue uses the shared projector", /projectWorld\s*\(/],
        [
          "battle ground cue uses depth-read material contract",
          /gpuWorldDepthStencil\s*\(\s*'read'\s*\)/,
        ],
        ["selected unit cue helper uses ground-cue naming", /selectedUnitGroundCueVertices/],
      ],
    },
    {
      file: new URL(
        "../../../packages/game-renderer/src/battle/effectLinePass.ts",
        import.meta.url,
      ),
      checks: [
        [
          "battle effect line draw requires overlay pass",
          /\bdraw\s*\(\s*pass:\s*OverlayRenderPass\s*\)/,
        ],
        [
          "battle effect line does not use world depth stencil",
          (v) => !/gpuWorldDepthStencil|depthStencil/.test(v),
        ],
      ],
    },
    {
      file: new URL("../../../packages/game-renderer/src/battle/minimapPass.ts", import.meta.url),
      checks: [
        [
          "battle minimap draw requires overlay pass",
          /\bdraw\s*\(\s*pass:\s*OverlayRenderPass\s*\)/,
        ],
      ],
    },
    {
      // Since slice 08b the production battle renders through the photoreal
      // seam: BattleRenderer owns no bespoke passes and no frame shell.
      file: new URL("../../src/battle/renderer.ts", import.meta.url),
      checks: [
        [
          "battle renderer renders through the photoreal battle world seam",
          /PhotorealBattleWorld\.create\(this\.canvas[,)]/,
        ],
        [
          "battle renderer builds no bespoke frame shell or passes",
          (v) => !/createFrameShell|RawFrameShell|GPURenderPipeline/.test(v),
        ],
      ],
    },
    {
      file: new URL("../../../packages/game-renderer/src/fixtures/nested3d.ts", import.meta.url),
      checks: [
        ["nested fixture draw requires world pass", /\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/],
      ],
    },
    {
      file: new URL(
        "../../../packages/game-renderer/src/campaign/territoryPass.ts",
        import.meta.url,
      ),
      checks: [
        [
          "campaign territory draw requires world pass",
          /\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/,
        ],
      ],
    },
    {
      file: new URL(
        "../../../packages/game-renderer/src/campaign/atmospherePass.ts",
        import.meta.url,
      ),
      checks: [
        [
          "campaign clouds draw requires overlay pass",
          /export class CampaignCloudPass[\s\S]*?\bdraw\s*\(\s*pass:\s*OverlayRenderPass\s*\)/,
        ],
      ],
    },
    {
      file: new URL("../../../packages/game-renderer/src/campaign/entityPass.ts", import.meta.url),
      checks: [
        [
          "campaign entities opaque draw requires world pass",
          /\bdrawOpaque\s*\(\s*pass:\s*WorldRenderPass\s*\)/,
        ],
        [
          "campaign entities shadow draw requires world pass",
          /\bdrawShadows\s*\(\s*pass:\s*WorldRenderPass\s*\)/,
        ],
      ],
    },
    {
      file: new URL("../../../packages/game-renderer/src/campaign/sceneryPass.ts", import.meta.url),
      checks: [
        [
          "campaign scenery opaque draw requires world pass",
          /\bdrawOpaque\s*\(\s*pass:\s*WorldRenderPass\s*\)/,
        ],
        [
          "campaign scenery shadow draw requires world pass",
          /\bdrawShadows\s*\(\s*pass:\s*WorldRenderPass\s*\)/,
        ],
      ],
    },
    {
      file: new URL(
        "../../../packages/game-renderer/src/campaign/selectionPass.ts",
        import.meta.url,
      ),
      checks: [
        [
          "campaign selection draw requires world pass",
          /\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/,
        ],
      ],
    },
    {
      file: new URL("../../../packages/game-renderer/src/campaign/mapPass.ts", import.meta.url),
      checks: [
        [
          "campaign map draw requires background pass",
          /export class CampaignMapPass[\s\S]*?\bdraw\s*\(\s*pass:\s*BackgroundRenderPass\s*\)/,
        ],
        [
          "campaign flat lines draw requires background pass",
          /export class CampaignLinePass[\s\S]*?\bdraw\s*\(\s*pass:\s*BackgroundRenderPass\s*\)/,
        ],
        [
          "campaign world lines draw requires world pass",
          /export class CampaignWorldLinePass[\s\S]*?\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/,
        ],
        [
          "campaign road draw requires world pass",
          /export class CampaignRoadPass[\s\S]*?\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/,
        ],
        [
          "campaign markers draw requires overlay pass",
          /export class CampaignMarkerPass[\s\S]*?\bdraw\s*\(\s*pass:\s*OverlayRenderPass\s*\)/,
        ],
        [
          "campaign labels draw requires overlay pass",
          /export class CampaignLabelPass[\s\S]*?\bdraw\s*\(\s*pass:\s*OverlayRenderPass\s*\)/,
        ],
      ],
    },
  ];
  const matches = [];
  for (const { file, checks } of files) {
    const source = await readFile(file, "utf8");
    for (const [label, pattern] of checks) {
      const ok = typeof pattern === "function" ? pattern(source) : pattern.test(source);
      if (!ok) matches.push(`${file.pathname.replace(root, "")}: missing ${label}`);
    }
  }
  return matches.sort();
}

async function findRawRenderPassEncoderFootguns() {
  const root = new URL("../../../", import.meta.url).pathname;
  const sourceRoots = [
    new URL("../../../packages/game-renderer/src/", import.meta.url),
    new URL("../../src/", import.meta.url),
  ];
  const matches = [];
  for (const sourceRoot of sourceRoots) {
    for (const file of await tsFiles(sourceRoot)) {
      const source = await readFile(file, "utf8");
      const rawPassParams = source.match(/\b\w+\s*\([^)]*:\s*GPURenderPassEncoder\b/g) ?? [];
      if (rawPassParams.length > 0) {
        matches.push(
          `${file.pathname.replace(root, "")}: raw GPURenderPassEncoder parameter bypasses frame phase branding`,
        );
      }
    }
  }
  return matches.sort();
}

async function findAdHocFrameCallbackFootguns() {
  const root = new URL("../../../", import.meta.url).pathname;
  const files = [
    new URL("../../../packages/renderer-core/src/frameShell.ts", import.meta.url),
    new URL("../../../apps/renderer-lab/src/router.ts", import.meta.url),
    new URL("../../src/battle/renderer.ts", import.meta.url),
    new URL("../../src/campaign/renderer.ts", import.meta.url),
  ];
  const matches = [];
  const callbackPattern = /\b(?:background|world|overlay)\s*:\s*\(\s*pass\b/;
  const legacyFrameCommandPattern = /\b(?:background|world|overlay)\?:\s*\(pass:/;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (callbackPattern.test(source))
      matches.push(`${file.pathname.replace(root, "")}: callback-shaped drawFrame pass`);
    if (legacyFrameCommandPattern.test(source))
      matches.push(`${file.pathname.replace(root, "")}: legacy FrameCommands callback field`);
  }
  return matches.sort();
}

async function findWorldDepthPassMetadataFootguns() {
  const root = new URL("../../../", import.meta.url).pathname;
  const files = [
    new URL("../../../apps/renderer-lab/src/router.ts", import.meta.url),
    new URL("../../src/battle/renderer.ts", import.meta.url),
    new URL("../../src/campaign/renderer.ts", import.meta.url),
  ];
  const matches = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const passObjects = source.match(/\{[^{}]*phase:\s*'world-depth'[^{}]*\}/g) ?? [];
    for (const passObject of passObjects) {
      if (
        file.pathname.endsWith("/apps/renderer-lab/src/router.ts") &&
        /\bid:\s*'bad-/.test(passObject)
      )
        continue;
      if (!/\bdepth:\s*'(?:read|read-write|write)'/.test(passObject)) {
        const id = passObject.match(/\bid:\s*'([^']+)'/)?.[1] ?? "unknown pass";
        matches.push(`${file.pathname.replace(root, "")}: ${id} missing world-depth depth mode`);
      }
    }
  }
  return matches.sort();
}

async function findFrameGraphRoleFootguns() {
  const root = new URL("../../../", import.meta.url).pathname;
  const files = [
    new URL("../../../apps/renderer-lab/src/router.ts", import.meta.url),
    new URL("../../src/battle/renderer.ts", import.meta.url),
    new URL("../../src/campaign/renderer.ts", import.meta.url),
  ];
  const matches = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const passObjects = source.match(/\{[^{}]*id:\s*'[^']+'[^{}]*phase:\s*'[^']+'[^{}]*\}/g) ?? [];
    for (const passObject of passObjects) {
      if (
        file.pathname.endsWith("/apps/renderer-lab/src/router.ts") &&
        /\bid:\s*'bad-/.test(passObject)
      )
        continue;
      const phase = passObject.match(/\bphase:\s*'([^']+)'/)?.[1] ?? "";
      if (phase !== "background" && phase !== "world-depth" && phase !== "overlay") continue;
      if (
        !/\brole:\s*'(?:background-underpaint|world-depth-fill|world-opaque|world-decal|overlay-ui|overlay-effect|overlay-debug)'/.test(
          passObject,
        )
      ) {
        const id = passObject.match(/\bid:\s*'([^']+)'/)?.[1] ?? "unknown pass";
        matches.push(`${file.pathname.replace(root, "")}: ${id} missing semantic frame-graph role`);
      }
    }
  }
  return matches.sort();
}

async function findProductionScenarioContractFootguns() {
  const root = new URL("../../../", import.meta.url).pathname;
  const files = [
    {
      file: new URL("../battle/battle-renderer-default.mjs", import.meta.url),
      requires: ["hasBattleWorldDepthContract"],
    },
    {
      file: new URL("../battle/battle-input.mjs", import.meta.url),
      requires: ["hasBattleWorldDepthContract"],
    },
    {
      file: new URL("../campaign/campaign-production.mjs", import.meta.url),
      requires: ["hasCampaignWorldDepthContract"],
    },
    {
      file: new URL("../campaign/campaign-handoff.mjs", import.meta.url),
      requires: ["hasBattleWorldDepthContract", "hasCampaignWorldDepthContract"],
    },
    {
      file: new URL("../campaign/campaign-reinforcements.mjs", import.meta.url),
      requires: ["hasBattleWorldDepthContract"],
    },
    {
      file: new URL("../campaign/campaign-save-load.mjs", import.meta.url),
      requires: ["hasCampaignWorldDepthContract"],
    },
    {
      file: new URL("../campaign/campaign-conquest.mjs", import.meta.url),
      requires: ["hasCampaignWorldDepthContract"],
    },
    {
      file: new URL("../ui/menu-renderer-shell.mjs", import.meta.url),
      requires: ["hasBattleWorldDepthContract", "hasCampaignWorldDepthContract"],
    },
    {
      file: new URL("./full-game-rendering-performance.mjs", import.meta.url),
      requires: ["hasBattleWorldDepthContract", "hasCampaignWorldDepthContract"],
    },
  ];
  const matches = [];
  for (const { file, requires } of files) {
    const source = await readFile(file, "utf8");
    const label = file.pathname.replace(root, "");
    if (!/from\s+['"](?:\.\.\/|\.\/)_renderer-contract\.mjs['"]/.test(source)) {
      matches.push(`${label}: production scenario must import the shared WebGPU contract helper`);
    }
    for (const name of requires) {
      const uses = source.match(new RegExp(`\\b${name}\\b`, "g")) ?? [];
      if (uses.length < 2) matches.push(`${label}: missing ${name} assertion`);
    }
    if (/\bfunction\s+hasFramePhaseOrder\s*\(/.test(source)) {
      matches.push(
        `${label}: local phase-order helper is weaker than the shared depth-pass contract`,
      );
    }
  }
  return matches.sort();
}

async function findFrameGraphVerifierFootguns() {
  const root = new URL("../../../", import.meta.url).pathname;
  const file = new URL("../_renderer-contract.mjs", import.meta.url);
  const source = await readFile(file, "utf8");
  const label = file.pathname.replace(root, "");
  const checks = [
    [
      "reads shared frame graph contract source",
      /packages\/renderer-core\/src\/frameGraphContract\.ts/,
    ],
    [
      "exports shared frame phase kinds",
      /export\s+const\s+FRAME_PHASE_KINDS\s*=\s*readStringArrayConst\(\s*FRAME_GRAPH_CONTRACT_SOURCE,\s*["']FRAME_PHASE_KINDS["'],?\s*\)/,
    ],
    [
      "exports shared frame graph roles",
      /export\s+const\s+FRAME_GRAPH_PASS_ROLES\s*=\s*readStringArrayConst\(\s*FRAME_GRAPH_CONTRACT_SOURCE,\s*["']FRAME_GRAPH_PASS_ROLES["'],?\s*\)/,
    ],
    [
      "exports shared role phase map",
      /export\s+const\s+FRAME_GRAPH_ROLE_PHASES\s*=\s*readStringObjectConst\(\s*FRAME_GRAPH_CONTRACT_SOURCE,\s*["']FRAME_GRAPH_ROLE_PHASES["'],?\s*\)/,
    ],
    [
      "semantic role helper uses shared role phase map",
      /FRAME_GRAPH_ROLE_PHASES\[role\]\s*===\s*phase\.kind/,
    ],
  ];
  const matches = [];
  for (const [name, pattern] of checks) {
    if (!pattern.test(source)) matches.push(`${label}: missing ${name}`);
  }
  if (/role\s*===\s*['"]world-opaque['"]\s*\|\|/.test(source)) {
    matches.push(`${label}: hard-coded per-phase role union in scenario helper`);
  }
  if (Object.keys(FRAME_GRAPH_ROLE_PHASES).length === 0) {
    matches.push(`${label}: parsed shared frame role phase map is empty`);
  }
  for (const role of FRAME_GRAPH_PASS_ROLES) {
    if (!FRAME_GRAPH_ROLE_PHASES[role]) {
      matches.push(`${label}: parsed shared frame role phase map is missing "${role}"`);
    }
  }
  if (Object.keys(FRAME_GRAPH_DEPTH_ROLES).length === 0) {
    matches.push(`${label}: parsed shared frame depth-role map is empty`);
  }
  for (const mode of GPU_DEPTH_MODES) {
    if (!FRAME_GRAPH_DEPTH_ROLES[mode]) {
      matches.push(`${label}: parsed shared frame depth-role map is missing "${mode}"`);
    }
  }
  return matches.sort();
}

async function findDepthContractFootguns() {
  const root = new URL("../../../", import.meta.url).pathname;
  const sourceRoots = [
    new URL("../../../packages/renderer-core/src/", import.meta.url),
    new URL("../../../packages/game-renderer/src/", import.meta.url),
    new URL("../../../apps/renderer-lab/src/", import.meta.url),
  ];
  const allowed = new Set([
    new URL("../../../packages/renderer-core/src/depthContract.ts", import.meta.url).pathname,
  ]);
  const matches = [];
  for (const sourceRoot of sourceRoots) {
    for (const file of await tsFiles(sourceRoot)) {
      if (allowed.has(file.pathname)) continue;
      const source = await readFile(file, "utf8");
      if (/['"]depth24plus['"]/.test(source)) {
        matches.push(`${file.pathname.replace(root, "")}: hard-coded depth24plus format`);
      }
      if (
        /export\s+type\s+\w*DepthMode\s*=\s*(?=[^;]*'read')(?=[^;]*'read-write')(?=[^;]*'write')[^;]*;/.test(
          source,
        )
      ) {
        matches.push(`${file.pathname.replace(root, "")}: redeclared depth mode union`);
      }
      if (/['"]worldDepth['"]/.test(source)) {
        matches.push(`${file.pathname.replace(root, "")}: hard-coded worldDepth attachment`);
      }
    }
  }
  return matches.sort();
}

async function findWorldMaterialContractFootguns() {
  const root = new URL("../../../", import.meta.url).pathname;
  const files = [
    new URL("../../../packages/renderer-core/src/skinnedPipeline.ts", import.meta.url),
    new URL("../../../packages/game-renderer/src/fixtures/nested3d.ts", import.meta.url),
    new URL("../../../packages/game-renderer/src/campaign/entityPass.ts", import.meta.url),
    new URL("../../../packages/game-renderer/src/campaign/sceneryPass.ts", import.meta.url),
  ];
  const matches = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const label = file.pathname.replace(root, "");
    if (!/\bgpuOpaqueColorTarget\b/.test(source) || !/\bgpuWorldDepthStencil\b/.test(source)) {
      matches.push(
        `${label}: depth-writing world geometry must use the opaque world material contract`,
      );
    }
    if (/\bdepthWriteEnabled:\s*true\b/.test(source)) {
      matches.push(
        `${label}: inline depth-write pipeline state bypasses the world material contract`,
      );
    }
    if (/gpuWorldDepthStencil\s*\(\s*(?:true|false)\s*\)/.test(source)) {
      matches.push(`${label}: boolean world depth material bypasses explicit depth modes`);
    }
    if (/\bblend:\s*\{/.test(source)) {
      matches.push(
        `${label}: inline alpha blending is not allowed in depth-writing world geometry`,
      );
    }
  }

  for (const file of [
    new URL("../../../packages/game-renderer/src/campaign/entityPass.ts", import.meta.url),
    new URL("../../../packages/game-renderer/src/campaign/sceneryPass.ts", import.meta.url),
  ]) {
    const source = await readFile(file, "utf8");
    const label = file.pathname.replace(root, "");
    if (
      !/\bgpuAlphaBlendColorTarget\b/.test(source) ||
      !/materialClasses:\s*\['opaque-depth-write',\s*'shadow-depth-read'\]/.test(source)
    ) {
      matches.push(
        `${label}: shadows must be a named alpha depth-read material class, not part of opaque depth writes`,
      );
    }
  }

  return matches.sort();
}

function countPixels(png) {
  let warmGround = 0;
  let blue = 0;
  let red = 0;
  let water = 0;
  let sky = 0;
  let gold = 0;
  let green = 0;
  let cloud = 0;
  let minimapDark = 0;
  let minimapBlue = 0;
  let minimapRed = 0;
  let minimapGold = 0;
  let nonBlank = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const o = (y * png.width + x) * 4;
      const r = png.data[o],
        g = png.data[o + 1],
        b = png.data[o + 2];
      if (r + g + b > 60) nonBlank++;
      if (r > 100 && g > 90 && g < 190 && b < 150) warmGround++;
      if (b > 110 && r < 120 && g < 165) blue++;
      if (r > 130 && g < 125 && b < 125) red++;
      if (b > 115 && g > 110 && r < 150) water++;
      if (b > 170 && g > 160 && r > 130) sky++;
      if (r > 160 && g > 120 && b < 90) gold++;
      if (g > 145 && r < 130 && b < 130) green++;
      if (r > 170 && g > 175 && b > 165 && Math.abs(r - g) < 36 && Math.abs(g - b) < 44) cloud++;
      if (r < 45 && g < 45 && b < 40) minimapDark++;
      if (x < 240 && y > png.height - 210 && y < png.height - 8) {
        if (r < 45 && g < 45 && b < 40) minimapDark++;
        if (b > 130 && r < 130 && g > 80) minimapBlue++;
        if (r > 130 && g < 100 && b < 100) minimapRed++;
        if (r > 160 && g > 120 && b < 90) minimapGold++;
      }
    }
  }
  return {
    warmGround,
    blue,
    red,
    water,
    sky,
    gold,
    green,
    cloud,
    minimapDark,
    minimapBlue,
    minimapRed,
    minimapGold,
    nonBlank,
  };
}

function pixelByteDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let diff = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) diff++;
  return diff;
}

function patchStats(png, sample, radius = 4) {
  const cx = Math.max(0, Math.min(png.width - 1, Math.round(sample.x)));
  const cy = Math.max(0, Math.min(png.height - 1, Math.round(sample.y)));
  let red = 0;
  let flagRed = 0;
  let blue = 0;
  let tan = 0;
  let green = 0;
  let selectionGreen = 0;
  let gold = 0;
  let white = 0;
  let dark = 0;
  let foliage = 0;
  let navy = 0;
  let count = 0;
  for (let y = Math.max(0, cy - radius); y <= Math.min(png.height - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(png.width - 1, cx + radius); x++) {
      const o = (y * png.width + x) * 4;
      const r = png.data[o],
        g = png.data[o + 1],
        b = png.data[o + 2];
      if (r > 135 && g < 95 && b < 95) red++;
      if (r > 70 && g < 82 && b < 78 && r > g + 18 && r > b + 18) flagRed++;
      if (b > 120 && r < 110 && g < 140) blue++;
      if (r > 120 && g > 95 && g < 175 && b < 125) tan++;
      if (g > 135 && r < 120 && b < 120) green++;
      if (g > 135 && g > r + 20 && g > b + 45) selectionGreen++;
      if (r > 160 && g > 120 && b < 90) gold++;
      if (r > 190 && g > 190 && b > 165) white++;
      if (r < 90 && g < 80 && b < 70) dark++;
      // Canopy foliage at any lighting: green-dominant over red AND blue, so
      // shaded tree bodies count without catching ground grass (g ≈ r there).
      if (g > 55 && g > r + 25 && g > b + 25) foliage++;
      // Soldier cloth in shadow: blue-dominant but darker than the `blue` bin
      // (campaign figures read ≈ rgb(54, 72, 112) at the oblique review pitch).
      if (b > 70 && b > r + 25 && b > g + 25) navy++;
      count++;
    }
  }
  return {
    x: cx,
    y: cy,
    count,
    red,
    flagRed,
    blue,
    tan,
    green,
    selectionGreen,
    gold,
    white,
    dark,
    foliage,
    navy,
  };
}

export async function run(ctx) {
  const privateCameraStructs = await findPrivateCameraStructs();
  ctx.check(
    "source: camera WGSL is single-sourced",
    privateCameraStructs.length === 0,
    JSON.stringify({ privateCameraStructs }),
  );
  const campaignDepthOnlyFootguns = await findCampaignDepthOnlyFootguns();
  ctx.check(
    "source: campaign model/decal/line passes expose one phase-specific draw path",
    campaignDepthOnlyFootguns.length === 0,
    JSON.stringify({ campaignDepthOnlyFootguns }),
  );
  const phaseBrandFootguns = await findPhaseBrandFootguns();
  ctx.check(
    "source: renderer draw methods require branded frame phases",
    phaseBrandFootguns.length === 0,
    JSON.stringify({ phaseBrandFootguns }),
  );
  const rawRenderPassEncoderFootguns = await findRawRenderPassEncoderFootguns();
  ctx.check(
    "source: renderer pass helpers avoid raw render-pass parameters",
    rawRenderPassEncoderFootguns.length === 0,
    JSON.stringify({ rawRenderPassEncoderFootguns }),
  );
  const adHocFrameCallbackFootguns = await findAdHocFrameCallbackFootguns();
  ctx.check(
    "source: live frame submission uses graph pass lists",
    adHocFrameCallbackFootguns.length === 0,
    JSON.stringify({ adHocFrameCallbackFootguns }),
  );
  const worldDepthPassMetadataFootguns = await findWorldDepthPassMetadataFootguns();
  ctx.check(
    "source: world-depth frame passes declare depth modes",
    worldDepthPassMetadataFootguns.length === 0,
    JSON.stringify({ worldDepthPassMetadataFootguns }),
  );
  const frameGraphRoleFootguns = await findFrameGraphRoleFootguns();
  ctx.check(
    "source: live frame passes declare semantic roles",
    frameGraphRoleFootguns.length === 0,
    JSON.stringify({ frameGraphRoleFootguns }),
  );
  const productionScenarioContractFootguns = await findProductionScenarioContractFootguns();
  ctx.check(
    "source: production scenarios assert shared WebGPU depth contracts",
    productionScenarioContractFootguns.length === 0,
    JSON.stringify({ productionScenarioContractFootguns }),
  );
  const frameGraphVerifierFootguns = await findFrameGraphVerifierFootguns();
  ctx.check(
    "source: scenario helpers derive frame roles from the shared contract",
    frameGraphVerifierFootguns.length === 0,
    JSON.stringify({ frameGraphVerifierFootguns }),
  );
  const depthContractFootguns = await findDepthContractFootguns();
  ctx.check(
    "source: WebGPU depth format and attachment are single-sourced",
    depthContractFootguns.length === 0,
    JSON.stringify({ depthContractFootguns }),
  );
  const worldMaterialContractFootguns = await findWorldMaterialContractFootguns();
  ctx.check(
    "source: depth-writing world geometry uses opaque material contracts",
    worldMaterialContractFootguns.length === 0,
    JSON.stringify({ worldMaterialContractFootguns }),
  );
  const rawShaderModuleFootguns = await findRawShaderModuleFootguns();
  ctx.check(
    "source: every shader compiles through compileShader (structured WGSL errors)",
    rawShaderModuleFootguns.length === 0,
    JSON.stringify({ rawShaderModuleFootguns }),
  );
  const unguardedReadyFootguns = await findUnguardedRendererReadyFootguns();
  ctx.check(
    "source: every renderer.ready chain has a .catch fatal-error surface",
    unguardedReadyFootguns.length === 0,
    JSON.stringify({ unguardedReadyFootguns }),
  );

  for (const [route, predicate] of routes) {
    const page = await ctx.newPage({
      viewport: { width: 900, height: 620 },
      errorPrefix: `gpu-${route}`,
    });
    await page.goto(`${ctx.target}/renderer/${route}`);
    const expectedRoute = route.split("?")[0];
    await page.waitForFunction(
      (expected) =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.ok === true &&
        window.__rendererLabStats?.route === expected,
      expectedRoute,
      { timeout: 18000 },
    );
    await page.waitForTimeout(280);
    const stats = await page.evaluate(() => window.__rendererLabStats);
    ctx.check(`${route}: route stats satisfy contract`, predicate(stats), JSON.stringify(stats));
    // Clean-architecture invariant: every lab route publishes the SAME
    // projection/depth identity — one projector (camera3d viewProj, reverse-Z)
    // engine-wide.
    ctx.check(
      `${route}: route publishes the single projection identity`,
      stats?.projection === PROJECTION_IDENTITY,
      JSON.stringify({ projection: stats?.projection }),
    );
    const pixels = countPixels(PNG.sync.read(await page.screenshot()));
    ctx.check(
      `${route}: route rendered nonblank raw-WebGPU frame`,
      pixels.nonBlank > 200000 && pixels.warmGround > 8000,
      JSON.stringify(pixels),
    );
    if (route === "render-graph" || route === "world-camera") {
      const canvasPng = PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
      const samples = stats.stats.samples;
      const lower = patchStats(canvasPng, samples.occludedLowerStandard);
      const upper = patchStats(canvasPng, samples.visibleUpperFlag);
      const frontRank = patchStats(canvasPng, samples.frontRankOverlap);
      ctx.check(
        `${route}: city volume occludes the lower planted standard`,
        lower.red <= 8 && lower.tan > 8,
        JSON.stringify({ lower, sample: samples.occludedLowerStandard }),
      );
      ctx.check(
        `${route}: inserted standard remains visible above the city`,
        upper.red > 12,
        JSON.stringify({ upper, sample: samples.visibleUpperFlag }),
      );
      ctx.check(
        `${route}: front battle rank wins overlapping depth`,
        frontRank.blue > 12 && frontRank.red <= 10,
        JSON.stringify({ frontRank, sample: samples.frontRankOverlap }),
      );
    }
    if (route === "skinned-depth") {
      const canvasPng = PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
      const front = patchStats(canvasPng, stats.stats.sample, 7);
      ctx.check(
        `${route}: front skinned soldier wins hostile cross-bucket draw order`,
        front.blue > 12 && front.red <= 10,
        JSON.stringify({
          front,
          sample: stats.stats.sample,
          hostileDrawOrder: stats.stats.hostileDrawOrder,
        }),
      );
    }
    if (route === "battle-ground-cue-depth") {
      const canvasPng = PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
      const samples = stats.stats.samples;
      const covered = patchStats(canvasPng, samples.coveredCueUnderSoldier, 6);
      const exposed = patchStats(canvasPng, samples.exposedCueControl, 5);
      ctx.check(
        `${route}: skinned soldier occludes later-submitted ground cue`,
        covered.blue > 12 && covered.gold <= 8,
        JSON.stringify({
          covered,
          sample: samples.coveredCueUnderSoldier,
          hostileDrawOrder: stats.stats.hostileDrawOrder,
        }),
      );
      ctx.check(
        `${route}: late-submitted ground cue remains visible off the soldier`,
        exposed.gold > 12,
        JSON.stringify({ exposed, sample: samples.exposedCueControl }),
      );
    }
    if (route === "battle-effect-overlay") {
      const canvasPng = PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
      const samples = stats.stats.samples;
      const overSoldier = patchStats(canvasPng, samples.effectOverSoldier, 5);
      const exposed = patchStats(canvasPng, samples.exposedEffectControl, 5);
      ctx.check(
        `${route}: overlay effect line remains visible over skinned soldier`,
        overSoldier.white > 12,
        JSON.stringify({ overSoldier, sample: samples.effectOverSoldier }),
      );
      ctx.check(
        `${route}: overlay effect control remains visible off the soldier`,
        exposed.white > 12,
        JSON.stringify({ exposed, sample: samples.exposedEffectControl }),
      );
    }
    if (route === "campaign-models?gate=city") {
      const canvasPng = PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
      const samples = stats.stats.samples.cityStandard;
      const lower = patchStats(canvasPng, samples.hiddenLowerCloth, 5);
      const upper = patchStats(canvasPng, samples.visibleUpperCloth, 6);
      const cloth = patchStats(canvasPng, samples.rightFlyingCloth, 5);
      const offCloth = patchStats(canvasPng, samples.leftOfMastControl, 5);
      const mast = patchStats(canvasPng, samples.mastAboveCloth, 5);
      // City material spans tan walls AND terracotta roofs whose shaded sides
      // read in the `red` bin at the oblique review pitch; the cloth is the
      // darker `flagRed` bin, so absence of cloth = flagRed ≤ 8.
      ctx.check(
        `${route}: production city hides the lower embedded flag cloth`,
        lower.flagRed <= 8 && lower.tan + lower.red > 8,
        JSON.stringify({ lower, sample: samples.hiddenLowerCloth }),
      );
      ctx.check(
        `${route}: production city standard remains visible above the core`,
        upper.flagRed > 12,
        JSON.stringify({ upper, sample: samples.visibleUpperCloth }),
      );
      ctx.check(
        `${route}: production city standard uses centered shared cloth, not the old side panel`,
        cloth.flagRed > 12 && offCloth.flagRed <= 8,
        JSON.stringify({
          cloth,
          offCloth,
          clothSample: samples.rightFlyingCloth,
          offClothSample: samples.leftOfMastControl,
        }),
      );
      ctx.check(
        `${route}: production city mast remains visible above the cloth`,
        // The pole's warm-lit edge pixels bin as flagRed at the reference
        // banner scale; the durable claim is the dark pole reading above the
        // cloth, not the absence of warm bins.
        mast.dark > 10,
        JSON.stringify({ mast, sample: samples.mastAboveCloth }),
      );
    }
    if (route === "campaign-models?gate=garrison-outside") {
      const canvasPng = PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
      const samples = stats.stats.samples.garrison;
      const body = patchStats(canvasPng, samples.visibleShieldOutsideCity, 6);
      const standard = patchStats(canvasPng, samples.visibleStandardOutsideCity, 6);
      ctx.check(
        `${route}: outside-garrison army body is visible before entering the city`,
        // Figure cloth reads navy (shadow side) as often as bright blue —
        // both bins are soldier body.
        body.blue + body.navy > 12,
        JSON.stringify({ body, sample: samples.visibleShieldOutsideCity }),
      );
      ctx.check(
        `${route}: outside-garrison army standard is visible before entering the city`,
        standard.blue > 12,
        JSON.stringify({ standard, sample: samples.visibleStandardOutsideCity }),
      );
    }
    if (route === "campaign-models?gate=garrison-city") {
      const canvasPng = PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
      const samples = stats.stats.samples.garrison;
      const hidden = patchStats(canvasPng, samples.hiddenShieldInsideWall, 6);
      const visible = patchStats(canvasPng, samples.visibleStandardAboveRoofs, 6);
      ctx.check(
        `${route}: production city material occludes the garrisoned army body`,
        hidden.blue + hidden.navy <= 8 && hidden.tan + hidden.red > 80,
        JSON.stringify({ hidden, sample: samples.hiddenShieldInsideWall }),
      );
      ctx.check(
        `${route}: garrisoned army standard remains visible above the city`,
        visible.blue > 12,
        JSON.stringify({ visible, sample: samples.visibleStandardAboveRoofs }),
      );
    }
    if (route === "campaign-models?gate=garrison-hidden") {
      const canvasPng = PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
      const samples = stats.stats.samples.garrison;
      const body = patchStats(canvasPng, samples.hiddenBodyInsideCity, 6);
      const standard = patchStats(canvasPng, samples.hiddenStandardInsideCity, 6);
      const roof = patchStats(canvasPng, samples.occludingCityRoof, 6);
      ctx.check(
        `${route}: lowered garrison body is hidden by city material`,
        body.blue <= 8 && body.tan + body.red > 60,
        JSON.stringify({ body, sample: samples.hiddenBodyInsideCity }),
      );
      ctx.check(
        `${route}: lowered garrison standard is hidden by city material`,
        standard.blue <= 8 && standard.tan + standard.red > 40,
        JSON.stringify({ standard, sample: samples.hiddenStandardInsideCity }),
      );
      ctx.check(
        `${route}: city roof remains the visible occluder for the hidden garrison`,
        roof.tan + roof.red > 80,
        JSON.stringify({ roof, sample: samples.occludingCityRoof }),
      );
    }
    if (route === "campaign-models?gate=selected-city") {
      const canvasPng = PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
      const samples = stats.stats.samples.selectionDepth;
      const core = patchStats(canvasPng, samples.occludedByCityCore, 7);
      const ring = patchStats(canvasPng, samples.visibleOuterRing, 7);
      // Re-pinned (spec campaign-map-polish 12): the selection ring draws with
      // depth 'always' so raised terrain/geometry no longer clips it — the old
      // Reversed 2026-07-05 (David): the ring is a ground decal — the city
      // volume standing on it occludes the far arc, or the ring reads as
      // floating above the town. (The older "half-cut ring" complaint that
      // once forced depth-always no longer applies to today's city meshes:
      // the grounded ring keeps most of its arc.)
      ctx.check(
        `${route}: city core occludes the grounded selection ring`,
        core.selectionGreen <= 12,
        JSON.stringify({ core, sample: samples.occludedByCityCore }),
      );
      ctx.check(
        `${route}: selected city marker remains visible outside the city volume`,
        ring.selectionGreen > 80,
        JSON.stringify({ ring, sample: samples.visibleOuterRing }),
      );
    }
    if (route === "campaign-models?gate=army") {
      const canvasPng = PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
      const samples = stats.stats.samples.selectionDepth;
      const core = patchStats(canvasPng, samples.occludedByArmyCore, 6);
      const ring = patchStats(canvasPng, samples.visibleOuterRing, 6);
      // Figure cloth reads navy (shadow side) as often as bright blue at the
      // oblique review pitch — both bins are soldier body.
      // Reversed 2026-07-05 (David) — see the selected-city note above.
      ctx.check(
        `${route}: formation occludes the grounded selection ring`,
        core.selectionGreen <= 12,
        JSON.stringify({ core, sample: samples.occludedByArmyCore }),
      );
      ctx.check(
        `${route}: selected army marker remains visible outside the formation`,
        ring.selectionGreen > 80,
        JSON.stringify({ ring, sample: samples.visibleOuterRing }),
      );
    }
    if (route === "campaign-models?gate=hostile-depth-order") {
      const canvasPng = PNG.sync.read(await page.locator("#renderer-canvas").screenshot());
      const samples = stats.stats.samples.hostileDepthOrder;
      const flag = patchStats(canvasPng, samples.flagOverLateTree, 6);
      const tree = patchStats(canvasPng, samples.lateTreeControl, 7);
      ctx.check(
        `${route}: nearer city flag survives later-submitted scenery bucket`,
        flag.red + flag.flagRed > 12 && flag.foliage <= 8,
        JSON.stringify({
          flag,
          sample: samples.flagOverLateTree,
          hostileDrawOrder: stats.stats.hostileDrawOrder,
        }),
      );
      ctx.check(
        `${route}: late-submitted scenery bucket is visible elsewhere`,
        tree.foliage >= 16,
        JSON.stringify({ tree, sample: samples.lateTreeControl }),
      );
    }
    if (route === "assets") {
      await page.click("#asset-validate-json");
      await page.waitForFunction(
        () => window.__rendererLabStats?.stats?.imported !== null,
        undefined,
        { timeout: 5000 },
      );
      const imported = await page.evaluate(() => window.__rendererLabStats);
      ctx.check(
        `${route}: imported manifest validates through the workbench UI`,
        imported.stats.imported?.ok === false && imported.stats.imported.errors > 0,
        JSON.stringify(imported.stats.imported),
      );
    }
    if (
      route.includes("crowd") ||
      route === "battle" ||
      route.startsWith("battle-live") ||
      route.startsWith("battle-ui") ||
      route.startsWith("battle-input")
    ) {
      ctx.check(
        `${route}: player and enemy accents visible`,
        pixels.blue > 10 && pixels.red > 10,
        JSON.stringify(pixels),
      );
    }
    if (route.startsWith("battle-terrain")) {
      ctx.check(
        `${route}: Aegean water and nonblack sky visible`,
        pixels.water > 1200 && pixels.sky > 1200,
        JSON.stringify(pixels),
      );
      ctx.check(
        `${route}: warm ground and terrain highlights visible`,
        pixels.warmGround > 8000 && pixels.gold > 250,
        JSON.stringify(pixels),
      );
    }
    if (route.startsWith("campaign-map")) {
      ctx.check(
        `${route}: parchment map, territory, atmosphere, roads, and city pins are visible`,
        pixels.warmGround > 45000 &&
          pixels.water > 4000 &&
          pixels.cloud > 1500 &&
          pixels.red > 1000 &&
          pixels.minimapDark > 10000 &&
          stats.stats.borderSegments > 100,
        JSON.stringify(pixels),
      );
      const domLabelCount = await page.locator(".renderer-campaign-label").count();
      ctx.check(
        `${route}: campaign labels are rendered by the WebGPU glyph atlas`,
        stats.stats.labelLayer === "raw-gpu-glyph-atlas" &&
          stats.stats.visibleLabels >= 8 &&
          stats.stats.labelVertices >= stats.stats.visibleLabels * 6 &&
          domLabelCount === 0,
        JSON.stringify({
          labelLayer: stats.stats.labelLayer,
          visibleLabels: stats.stats.visibleLabels,
          labelVertices: stats.stats.labelVertices,
          labelAtlas: stats.stats.labelAtlas,
          domLabelCount,
        }),
      );
    }
    if (route.startsWith("campaign-ui")) {
      const ui = await page.evaluate(() => ({
        armyPanel: document.querySelector(".renderer-campaign-panel.army")?.textContent ?? "",
        cityPanel: document.querySelector(".renderer-campaign-panel.city")?.textContent ?? "",
        diplomacyRows: document.querySelectorAll(
          ".renderer-campaign-panel.diplomacy .cmp-diplo-row",
        ).length,
        classRows: document.querySelectorAll(".renderer-campaign-panel.classes .cmp-class-row")
          .length,
        replenish: document.querySelector("#cmp-auto-replenish") !== null,
      }));
      ctx.check(
        `${route}: WebGPU campaign entities and selection colors are visible`,
        pixels.warmGround > 45000 && pixels.red > 700 && pixels.green > 250 && pixels.gold > 600,
        JSON.stringify(pixels),
      );
      ctx.check(
        `${route}: retained campaign panels are visible over WebGPU`,
        ui.armyPanel.includes("Army 0") &&
          ui.cityPanel.includes("Roma") &&
          ui.diplomacyRows >= 1 &&
          ui.classRows >= 8 &&
          ui.replenish &&
          stats.stats.labelLayer === "raw-gpu-glyph-atlas" &&
          stats.stats.visibleLabels >= 1,
        JSON.stringify({
          ui,
          labels: {
            layer: stats.stats.labelLayer,
            visible: stats.stats.visibleLabels,
            vertices: stats.stats.labelVertices,
          },
        }),
      );
      const armyTarget = await page.evaluate(() => {
        const debug = window.__gpuCampaignUi;
        const army = debug.armies.find((a) => a.mine);
        if (!army) throw new Error("campaign-ui army missing");
        return debug.project(army.x, army.y);
      });
      await page.mouse.click(armyTarget.x, armyTarget.y);
      await page.waitForTimeout(120);
      const armyClicked = await page.evaluate(() => window.__rendererLabStats);
      ctx.check(
        `${route}: canvas click selects the rendered army marker`,
        armyClicked.stats.selectedArmy === 0 && armyClicked.stats.lastPick.kind === "army",
        JSON.stringify({
          target: armyTarget,
          stats: armyClicked.stats.lastPick,
          selectedArmy: armyClicked.stats.selectedArmy,
        }),
      );
      const cityTarget = await page.evaluate(() => window.__gpuCampaignUi.project(-28, 450));
      await page.mouse.click(cityTarget.x, cityTarget.y);
      await page.waitForTimeout(120);
      const cityClicked = await page.evaluate(() => window.__rendererLabStats);
      ctx.check(
        `${route}: canvas click opens the rendered city panel`,
        cityClicked.stats.selectedArmy === -1 &&
          cityClicked.stats.selectedCity === 0 &&
          cityClicked.stats.lastPick.kind === "city",
        JSON.stringify({
          target: cityTarget,
          stats: cityClicked.stats.lastPick,
          selectedCity: cityClicked.stats.selectedCity,
        }),
      );
    }
    if (
      route.startsWith("battle-live") ||
      route.startsWith("battle-ui") ||
      route.startsWith("battle-input")
    ) {
      ctx.check(`${route}: WebGPU ground cue visible`, pixels.gold > 250, JSON.stringify(pixels));
      ctx.check(
        `${route}: WebGPU minimap compositor visible`,
        stats.stats.minimap.units >= 10 &&
          pixels.minimapDark > 500 &&
          pixels.minimapBlue > 5 &&
          pixels.minimapRed > 5 &&
          pixels.minimapGold > 0,
        JSON.stringify({ stats: stats.stats.minimap, pixels }),
      );
    }
    if (route.startsWith("battle-ui")) {
      const ui = await page.evaluate(() => ({
        cards: document.querySelectorAll(".renderer-unitcards .ucard").length,
        selectedCards: document.querySelectorAll(".renderer-unitcards .ucard.sel").length,
        toolbarButtons: document.querySelectorAll(".renderer-toolbar button").length,
        hudText: document.querySelector(".renderer-battle-hud")?.textContent ?? "",
      }));
      ctx.check(
        `${route}: retained battle UI layer is visible over WebGPU`,
        ui.cards >= 8 &&
          ui.selectedCards === 1 &&
          ui.toolbarButtons >= 5 &&
          ui.hudText.includes("raw WebGPU"),
        JSON.stringify(ui),
      );
    }
    await page.close();
  }

  for (const dpr of [1, 2]) {
    const route = "battle-input?mode=5v5&ticks=36";
    const page = await ctx.newPage({
      viewport: { width: 900, height: 620 },
      deviceScaleFactor: dpr,
      errorPrefix: `renderer-battle-input-dpr${dpr}`,
    });
    await page.goto(`${ctx.target}/renderer/${route}`);
    await page.waitForFunction(
      () => window.__rendererLabReady === true && window.__gpuBattleInput,
      undefined,
      { timeout: 18000 },
    );
    await page.waitForTimeout(280);
    const unit = await frameBattleInputUnit(page);
    const target = await trueRenderedUnitScreen(page, unit);
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(120);
    const clicked = await page.evaluate(() => window.__rendererLabStats);
    ctx.check(
      `battle-input dpr${dpr}: left-click selects the rendered unit pixel`,
      clicked.stats.selectedUnits.includes(unit) && clicked.stats.lastPick.kind === "click",
      JSON.stringify({
        target,
        stats: clicked.stats.lastPick,
        selected: clicked.stats.selectedUnits,
      }),
    );

    const target2 = await trueRenderedUnitScreen(page, unit);
    await page.mouse.move(target2.x - 60, target2.y - 38);
    await page.mouse.down();
    await page.mouse.move(target2.x + 60, target2.y + 38, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    const boxed = await page.evaluate(() => window.__rendererLabStats);
    ctx.check(
      `battle-input dpr${dpr}: drag-box selects the rendered unit pixel`,
      boxed.stats.selectedUnits.includes(unit) &&
        boxed.stats.lastPick.kind === "box" &&
        boxed.stats.lastPick.boxUnits > 0,
      JSON.stringify({
        target: target2,
        stats: boxed.stats.lastPick,
        selected: boxed.stats.selectedUnits,
      }),
    );

    const orderTarget = await renderedWorldPoint(page, unit, -36, 18);
    await page.mouse.click(orderTarget.x, orderTarget.y, { button: "right" });
    await page.waitForTimeout(120);
    const ordered = await page.evaluate(() => window.__rendererLabStats);
    ctx.check(
      `battle-input dpr${dpr}: right-click issues a wasm move order`,
      ordered.stats.selectedOrder?.hasTarget &&
        ordered.stats.lastOrder.kind === "move" &&
        ordered.stats.lastOrder.unit === unit &&
        Math.hypot(
          ordered.stats.selectedOrder.targetX - orderTarget.worldX,
          ordered.stats.selectedOrder.targetY - orderTarget.worldY,
        ) < 1.5,
      JSON.stringify({
        target: orderTarget,
        selectedOrder: ordered.stats.selectedOrder,
        lastOrder: ordered.stats.lastOrder,
      }),
    );

    const zoomBefore = ordered.stats.camera.zoom;
    await page.mouse.move(orderTarget.x, orderTarget.y);
    await page.mouse.wheel(0, -220);
    await page.waitForTimeout(120);
    const zoomed = await page.evaluate(() => window.__rendererLabStats);
    ctx.check(
      `battle-input dpr${dpr}: wheel zoom updates the WebGPU camera`,
      zoomed.stats.camera.zoom > zoomBefore,
      JSON.stringify({ before: zoomBefore, after: zoomed.stats.camera.zoom }),
    );

    await page.evaluate(() => window.__gpuBattleInput.freezeAtTick(72));
    const canvas = page.locator("#renderer-canvas");
    const frozenA = await canvas.screenshot();
    await page.evaluate(() => window.__gpuBattleInput.freezeAtTick(72));
    const frozenB = await canvas.screenshot();
    const frozenStats = await page.evaluate(() => window.__rendererLabStats);
    const frozenPixelDiff = pixelByteDiff(PNG.sync.read(frozenA), PNG.sync.read(frozenB));
    ctx.check(
      `battle-input dpr${dpr}: freezeAtTick pins tick and pixels`,
      frozenStats.stats.ticks === 72 && frozenStats.stats.frozen === true && frozenPixelDiff === 0,
      JSON.stringify({
        ticks: frozenStats.stats.ticks,
        frozen: frozenStats.stats.frozen,
        bytesA: frozenA.length,
        bytesB: frozenB.length,
        cmp: Buffer.compare(frozenA, frozenB),
        pixelByteDiff: frozenPixelDiff,
      }),
    );
    await page.close();
  }
}

async function frameBattleInputUnit(page) {
  return page.evaluate(() => {
    const debug = window.__gpuBattleInput;
    const unit = debug.units.find((u) => u.team === 0) ?? debug.units[0];
    if (!unit) throw new Error("battle-input has no units to frame");
    debug.setCamera({
      x: unit.x,
      y: unit.y,
      zoom: Math.max(debug.camera.zoom, 2.6),
    });
    return unit.unit;
  });
}

async function trueRenderedUnitScreen(page, unitId = null) {
  return page.evaluate((requestedUnit) => {
    const debug = window.__gpuBattleInput;
    const c = debug.camera;
    const cv = document.getElementById("renderer-canvas");
    const rect = cv.getBoundingClientRect();
    // Projection comes from the harness itself (camera3d-backed), so this scene
    // cannot drift from what the route actually renders/picks with.
    const project = (target) => {
      const css = debug.project(target.x, target.y);
      return {
        unit: target.unit,
        team: target.team,
        x: css.x,
        y: css.y,
        canvasX: (css.x - rect.left) * (cv.width / cv.clientWidth),
        canvasY: (css.y - rect.top) * (cv.height / cv.clientHeight),
        dprWidth: cv.width,
        cssWidth: cv.clientWidth,
      };
    };
    let target = requestedUnit == null ? null : debug.units.find((u) => u.unit === requestedUnit);
    if (!target) {
      const margin = 80;
      const projected = debug.units.filter((u) => u.team === 0).map(project);
      const visible = projected.filter(
        (p) =>
          p.x >= rect.left + margin &&
          p.x <= rect.right - margin &&
          p.y >= rect.top + margin &&
          p.y <= rect.bottom - margin,
      );
      if (visible.length > 0) {
        return visible.sort(
          (a, b) =>
            Math.hypot(a.x - (rect.left + rect.width / 2), a.y - (rect.top + rect.height / 2)) -
            Math.hypot(b.x - (rect.left + rect.width / 2), b.y - (rect.top + rect.height / 2)),
        )[0];
      }
      target = debug.units
        .filter((u) => u.team === 0)
        .sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
    }
    if (!target) throw new Error(`unit ${requestedUnit ?? "visible player"} missing`);
    return project(target);
  }, unitId);
}

async function renderedWorldPoint(page, unitId, dxWorld, dyWorld) {
  return page.evaluate(
    ({ unit, dx, dy }) => {
      const debug = window.__gpuBattleInput;
      const base = debug.units.find((u) => u.unit === unit);
      if (!base) throw new Error(`unit ${unit} missing`);
      const cv = document.getElementById("renderer-canvas");
      const rect = cv.getBoundingClientRect();
      const worldX = base.x + dx;
      const worldY = base.y + dy;
      // Harness-owned projection (camera3d) — no hand-copied camera math here.
      const css = debug.project(worldX, worldY);
      return {
        unit,
        worldX,
        worldY,
        x: css.x,
        y: css.y,
        canvasX: (css.x - rect.left) * (cv.width / cv.clientWidth),
        canvasY: (css.y - rect.top) * (cv.height / cv.clientHeight),
      };
    },
    { unit: unitId, dx: dxWorld, dy: dyWorld },
  );
}
