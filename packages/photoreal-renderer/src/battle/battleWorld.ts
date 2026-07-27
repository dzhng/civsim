// PhotorealBattleWorld — the FULL production battle world on the three.js
// WebGPU + TSL substrate (born slice 08a at parity; physically lit since
// slice 09: sun + IBL + AgX from CIVSIM_ENVIRONMENTS, neutral-albedo
// standard materials). Accepts the EXACT production inputs BattleRenderer
// holds (terrain grid + tint + heightfield from setTerrain,
// buildCrowdInstances soldier frames, drawTris/drawTacticalLines Float32Array
// contracts). The sim firewall does not move: soldiers seat via the same CPU
// terrainHeightAt sampling; the only sim→renderer bridges stay
// buildCrowdInstances + terrainHeightAt.
//
// Scaffolding ledger rows owned here (README "Photoreal ladder invariants"):
//   - Parity-derived Gerstner sea shading (seaLayer) — dies at 12b–d.
// (10a's procedural-equirect IBL, 10b's THREE.Fog + per-material haze
// stand-ins, and 08a's blob-shadow decals are DEAD: SkyModel owns the sky,
// aerialPerspective the haze, and shadowRig casts REAL sun shadows since 11.)
// 08b swapped BattleRenderer's internals onto this class on the same canvas.
import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { buildCrowdInstances, type CrowdInstance } from "../../../crowd-runtime/src/instanceData";
import {
  battleEnvironmentStats,
  resolveBattleEnvironment,
  type BattleEnvironment,
} from "../../../game-renderer/src/environment/environment";
import {
  BATTLE_RELIEF_EXAGGERATION,
  deriveBattleEdgeRoles,
  type BattleGroundCover,
  type BattleSlopeBands,
  type BattleTerrainGrid,
} from "../../../game-renderer/src/battle/terrainFeatures";
import {
  battleMapByWasmId,
  buildBattleTerrainPresentation,
} from "../../../game-renderer/src/battle/mapCatalog";
import { buildPhotorealBattleGroundMesh } from "../../../game-renderer/src/battle/groundPass";
import { buildBattleHorizonLayout } from "../../../game-renderer/src/battle/horizonPass";
import {
  GRASS_FIELD_PACKED_STRIDE_FLOATS,
  createGrassFieldSampler,
  type GrassFieldSampler,
  type GrassFieldStats,
} from "../../../game-renderer/src/battle/grassField";
import { featuresToBattleScenery } from "../../../game-renderer/src/battle/terrainScenery";
import { eyePosition } from "../../../renderer-core/src/camera3d";
import {
  terrainHeightAt,
  type TerrainHeightField,
} from "../../../game-renderer/src/terrain/heightField";
import type { MarkerInstance } from "../../../renderer-core/src/frameShell";
import type { Camera3DParams } from "../../../renderer-core/src/camera3d";
import {
  loadClassMeshes,
  loadClassVats,
  loadPlaceholderKit,
  mountedClassesFromKit,
} from "../../../soldier-assets/src/placeholders";
import { createPlaceholderSoldierMeshTiers } from "../../../soldier-assets/src/soldierMesh";
import { PhotorealWorld } from "../world";
import { applyCivsimEnvironment } from "../environment";
import { applyCamera3d } from "../cameraBridge";
import { PHOTOREAL_PROJECTION, PHOTOREAL_SUBSTRATE } from "../stats";
import { createBattleFrameUniforms, type BattleFrameUniforms } from "./battleTsl";
import {
  BattleBackgroundQuads,
  createGroundMesh,
  createHorizonBlockerMesh,
  createVistaMesh,
  RENDER_ORDER,
  vistaSurfaceHeightAt,
  type BattleVistaGrid,
} from "./terrainLayer";
import type { GroundDetailTerm } from "./groundDetail";
import {
  createLakePlaneMesh,
  createOceanPlaneMesh,
  createSeaDisplacementSource,
  type BattleLakeSurfaceSpec,
  type SeaDisplacementSourceId,
} from "./seaLayer";
import {
  PhotorealBladeFieldLayer,
  createBladeFieldWindUniforms,
  createBladeFieldTransitionUniforms,
  type BladeFieldWindUniforms,
  type BladeFieldTierSpec,
  type BladeFieldTransitionProfile,
  type BladeFieldTransitionUniforms,
} from "./bladeFieldLayer";
import { updateWindUniforms } from "../../../game-renderer/src/battle/windSignal";
import { PhotorealScenery } from "./foliageLayer";
import { PhotorealCrowd, type CrowdVisibilityScope } from "./crowdLayer";
import {
  configureSunShadows,
  resolveSunShadowMode,
  type SunShadowMode,
  type SunShadowRig,
} from "./shadowRig";
import {
  PhotorealLineLayer,
  PhotorealMarkerLayer,
  PhotorealRingLayer,
  PhotorealTriangleLayer,
} from "./overlayLayer";
import { PhotorealReadoutLayer, type BattleReadoutInstance } from "./readoutLayer";
import { PhotorealStandardLayer, type BattleStandardInstance } from "./standardLayer";
import { BattlePostChain } from "../post/postChain";
import type { BattlePostGradeUniforms } from "../post/postChain";

export type { BattleVistaGrid } from "./terrainLayer";
export { vistaSurfaceHeightAt } from "./terrainLayer";
export type { BattleLakeSurfaceSpec } from "./seaLayer";

/** The camera fields BattleRenderer snapshots from the shared Camera each
 *  frame (renderer.ts cameraSnapshot) — the whole camera contract. */
export interface BattleCameraSnapshot {
  x: number;
  y: number;
  zoom: number;
  zoomT: number;
  camera3d: Camera3DParams;
}

export interface BattleTacticalLineFrame {
  groundCues: Float32Array;
  effects: Float32Array;
  /** Per-soldier selection rings, (x, y, radius, r, g, b) per instance. */
  rings: Float32Array;
}

type BattleGrassQuality = "low" | "standard" | "fine";

interface ProductionBladeFieldProfile {
  quality: BattleGrassQuality;
  source: string;
  seed: number;
  vistaVisibleRadiusM: number;
  vistaTransitionDefaults: BladeFieldTransitionProfile;
  closeVisibleRadiusM: number;
  rebuildMarginM: number;
  fieldCellSize: number;
  snapCellSize: number;
  clumpCellSize: number;
  maxRecords: number;
  minActiveRecords: number;
  closeDensityReferenceRecords?: number;
  closeDensityReferenceRadiusM?: number;
  lodStratifiedBudget: boolean;
  density: number;
  jitter: number;
  minNormalZ: number;
  lodNearRadiusM: number;
  lodMidRadiusM: number;
  baseHeight: number;
  heightJitter: number;
  baseWidth: number;
  widthJitter: number;
  baseBend: number;
  bendJitter: number;
  tiers: readonly BladeFieldTierSpec[];
}

const STANDARD_BLADE_FIELD_PROFILE = {
  quality: "standard",
  source:
    "GRASSFINE-L2D8 False Earth production profile: narrow curved mid blades plus zoom-aware near tier",
  seed: 0x5ea7_2026,
  // The active transition is scaled from this vista profile so blade thinning,
  // blade sink, and terrain far-grass rise share one owner at every zoom. (The
  // field itself is a static whole-map sample now — see the STATIC_GRASS_*
  // constants — not a camera-following disc; only this GPU transition tracks zoom.)
  vistaVisibleRadiusM: 260,
  // The FULL three-part structure at vista scale: dense blades, thinning
  // from the visible ring (260) through the blurred far band to 480, sink
  // from 380. Collapsing farEnd to the visible ring deleted the blur band
  // (far-tier survivors 22k -> 7k) - the active profile scales ALL of it.
  vistaTransitionDefaults: {
    edgeSinkStartM: 380,
    denseBladeEndM: 143,
    farGrassStartM: 260,
    farGrassEndM: 480,
    farSoftWidthScale: 1.6,
  } satisfies BladeFieldTransitionProfile,
  closeVisibleRadiusM: 40,
  // Vestigial since the static-field rework (the field never rebuilds on a
  // camera move) — retained only so the grass stats keep a stable shape.
  rebuildMarginM: 48,
  fieldCellSize: 0.42,
  snapCellSize: 48,
  clumpCellSize: 1.55,
  maxRecords: 160000,
  minActiveRecords: 18000,
  // Close/mid active-ring density. The lab close-gate ratified >12k records in
  // a 64m ring - but that lab envelope draws EVERY blade (survivorAlbedoBlend
  // === 0: no thinning, no height taper, no edge sink). Production applies all
  // three past the dense ring, culling ~2/3 of the records that fall in the
  // 22->74m band, so the same 12k/64m raw density rendered a bald mid-ground on
  // a mid-session close rebuild (fresh loads kept the 160k vista set and looked
  // full - the inconsistency David saw). Provision the raw density to net the
  // ratified VISIBLE carpet after production culls; capped by maxRecords.
  closeDensityReferenceRecords: 42000,
  closeDensityReferenceRadiusM: 64,
  lodStratifiedBudget: true,
  density: 1.0,
  jitter: 0.72,
  minNormalZ: 0.45,
  // Static sampler LOD anchors. At low eye heights the render tier thresholds
  // expand from the active transition, but the sampler budget still keeps this
  // 5/20m near/mid bias so vista frames do not spend 15-segment blades at 143m.
  lodNearRadiusM: 5,
  lodMidRadiusM: 20,
  baseHeight: 1.25,
  heightJitter: 0.62,
  baseWidth: 0.08,
  widthJitter: 0.2,
  baseBend: 0.62,
  bendJitter: 0.45,
  tiers: [
    { id: "near", lodTier: 0, segments: 15, minDistanceM: 0, maxDistanceM: 5 },
    { id: "mid", lodTier: 1, segments: 8, minDistanceM: 5, maxDistanceM: 20 },
    { id: "far", lodTier: 2, segments: 2, minDistanceM: 20, maxDistanceM: 480 },
  ],
} as const satisfies ProductionBladeFieldProfile;

const PRODUCTION_BLADE_FIELD_PROFILES: Record<BattleGrassQuality, ProductionBladeFieldProfile> = {
  low: {
    ...STANDARD_BLADE_FIELD_PROFILE,
    quality: "low",
    source:
      "GRASSFINE-L2D8 low profile: legacy 160k budget, fine near blades, low-segment mid tier",
    vistaTransitionDefaults: {
      ...STANDARD_BLADE_FIELD_PROFILE.vistaTransitionDefaults,
      farSoftWidthScale: 2.3,
    },
    fieldCellSize: 0.5,
    maxRecords: 160000,
    minActiveRecords: 12000,
    closeDensityReferenceRecords: 9000,
    heightJitter: 0.5,
    baseWidth: 0.09,
    widthJitter: 0.2,
    baseBend: 0.45,
    bendJitter: 0.35,
    tiers: [
      { id: "near", lodTier: 0, segments: 15, minDistanceM: 0, maxDistanceM: 5 },
      { id: "mid", lodTier: 1, segments: 5, minDistanceM: 5, maxDistanceM: 20 },
      { id: "far", lodTier: 2, segments: 2, minDistanceM: 20, maxDistanceM: 480 },
    ],
  },
  standard: STANDARD_BLADE_FIELD_PROFILE,
  fine: {
    ...STANDARD_BLADE_FIELD_PROFILE,
    quality: "fine",
    source: "GRASSFINE-L2D8 fine profile: 220k records, finer sampling cell, narrow curved blades",
    vistaTransitionDefaults: {
      ...STANDARD_BLADE_FIELD_PROFILE.vistaTransitionDefaults,
      farSoftWidthScale: 1.45,
    },
    fieldCellSize: 0.36,
    maxRecords: 220000,
    minActiveRecords: 24000,
    closeDensityReferenceRecords: 15000,
    baseWidth: 0.065,
    widthJitter: 0.16,
    tiers: [
      { id: "near", lodTier: 0, segments: 15, minDistanceM: 0, maxDistanceM: 5 },
      { id: "mid", lodTier: 1, segments: 8, minDistanceM: 5, maxDistanceM: 20 },
      { id: "far", lodTier: 2, segments: 2, minDistanceM: 20, maxDistanceM: 480 },
    ],
  },
};

const PRODUCTION_BLADE_FIELD_PROFILE = STANDARD_BLADE_FIELD_PROFILE;

// Static whole-map grass. The field is sampled ONCE over the entire map at a
// fixed UNIFORM density (no camera-follow, no rebuild); every frame the GPU
// route pass (bladeFieldLayer) culls it to a camera-relative disc, so draw cost
// and the near/far LOD look are unchanged while the multi-second resample lag is
// gone. Density is the one memory/look knob: one candidate blade per cell, so a
// smaller cell = denser grass = more records. 1.5m cell ≈ 0.44 blades/m², which
// lands under the record cap on a full 2400×1600 map's grass-eligible terrain.
const STATIC_GRASS_FIELD_CELL_M = 1.5;
const STATIC_GRASS_MAX_RECORDS = 1_000_000;
const MEADOW_FOCUS_RING_RADIUS_M = 300;
const MEADOW_FOCUS_RING_REBUILD_HYSTERESIS_M = 80;
const MEADOW_FOCUS_RING_SNAP_CELL_M = 48;
const MEADOW_FOCUS_RING_FIELD_CELL_M = 0.6;
const MEADOW_FOCUS_RING_BASE_WIDTH_M = 0.055;
const MEADOW_FOCUS_RING_MAX_RECORDS = 1_000_000;
const MEADOW_FOCUS_RING_DEDUPE_MARGIN_M = 20;
const GRASS_SAMPLE_SLICE_CELLS = 16384;
const GRASS_SAMPLE_SLICE_BUDGET_MS = 4;
// Zoomed-out past this vista fraction (0 = top-down overview, 1 = ground vista)
// blades project to a sub-pixel smear that only costs fill and cull, so grass is
// hidden outright — the "don't render grass at all when far out" contract.
const GRASS_ZOOM_CUTOFF_T = 0.5;

interface GrassSampleFocus {
  x: number;
  y: number;
  radius: number;
  maxRecords: number;
}

interface GrassSampleTask {
  key: string;
  focus: GrassSampleFocus;
  sampler: GrassFieldSampler;
  startedAt: number;
  buildMs: number;
  slices: number;
  maxSliceMs: number;
}

export class PhotorealBattleWorld {
  readonly world: PhotorealWorld;
  readonly camera = new THREE.PerspectiveCamera();
  private readonly environment: BattleEnvironment;
  private readonly disabledGroundDetail: GroundDetailTerm | null;
  private readonly grassProfile: ProductionBladeFieldProfile;
  private readonly frame: BattleFrameUniforms;
  private readonly sunDirectionScratch = new THREE.Vector3(0, 0, 1);
  private readonly background: BattleBackgroundQuads;
  private readonly grass: PhotorealBladeFieldLayer;
  private readonly scenery: PhotorealScenery;
  private readonly crowd: PhotorealCrowd;
  private readonly shadowRig: SunShadowRig;
  private readonly groundCues: PhotorealLineLayer;
  private readonly selectionRings: PhotorealRingLayer;
  private readonly effectLines: PhotorealLineLayer;
  private readonly debugTriangles: PhotorealTriangleLayer;
  private readonly debugBlocks: PhotorealTriangleLayer;
  private readonly markerLayer: PhotorealMarkerLayer;
  private readonly standardLayer: PhotorealStandardLayer;
  private readonly readoutLayer: PhotorealReadoutLayer;
  private readonly mountedClasses: number[];
  private readonly sea: ReturnType<typeof createSeaDisplacementSource>;
  private readonly post: BattlePostChain;

  private ground: THREE.Mesh | null = null;
  private horizonBlockers: THREE.Mesh | null = null;
  private vistaMeshes: THREE.Mesh[] = [];
  private oceanPlanes: THREE.Mesh[] = [];
  private lakePlanes: THREE.Mesh[] = [];
  private lakeSurfaces: BattleLakeSurfaceSpec[] = [];
  private sealedEdges: string[] = [];
  private groundTriangles = 0;
  private vistaTriangles = 0;

  private soldierUnit = new Uint32Array(0);
  private unitTeam: number[] = [];
  private unitClass: number[] = [];
  private staticSoldiers = 0;
  private terrainRect: [number, number, number, number] = [-220, -180, 440, 360];
  private terrainGrid: BattleTerrainGrid | null = null;
  private vistaGrid: BattleVistaGrid | null = null;
  private heightField: TerrainHeightField | null = null;
  private viewportHeight = 800;
  private groundCover: BattleGroundCover = "green-grass";
  private slopeBands: BattleSlopeBands | null = null;
  private grassBaseTerrainKey: string | null = null;
  private grassBaseRecords: Float32Array | null = null;
  private grassBaseSampleStats: GrassFieldStats | null = null;
  private grassFocusTerrainKey: string | null = null;
  private grassFocusRecords: Float32Array | null = null;
  private grassFocusSampleStats: GrassFieldStats | null = null;
  private grassPendingTerrainKey: string | null = null;
  private grassSampleTask: GrassSampleTask | null = null;
  private grassSampleStats: GrassFieldStats | null = null;
  private grassRebuildStats: {
    strategy: "static-whole-map" | "static-whole-map+camera-focus-ring";
    routeAnchor?: number[];
    coverageRadiusM: number;
    activeTransition: BladeFieldTransitionProfile | null;
    activeRecordBudget: number;
    vistaRecordBudget: number;
    areaBudgetScale: number;
    baseRecordCount: number;
    focusRecordCount: number;
    mergedRecordCount: number;
    focusRingEnabled: boolean;
    focusRingRadiusM: number;
    focusRingHysteresisM: number;
    focusRingSnapCellM: number;
    focusRingFieldCellM: number;
    focusRingBaseWidthM: number;
    focusRingMaxRecords: number;
    dedupeRadiusM: number;
    activeFocus: GrassSampleFocus | null;
    pendingFocus: GrassSampleFocus | null;
    pending: boolean;
    rebuilds: number;
    lastSampleMs: number;
    lastSlices: number;
    lastMaxSliceMs: number;
    inProgressCells: number;
    totalCells: number;
  } = {
    strategy: "static-whole-map",
    coverageRadiusM: PRODUCTION_BLADE_FIELD_PROFILE.vistaVisibleRadiusM,
    activeTransition: null as BladeFieldTransitionProfile | null,
    activeRecordBudget: STATIC_GRASS_MAX_RECORDS,
    vistaRecordBudget: PRODUCTION_BLADE_FIELD_PROFILE.maxRecords,
    areaBudgetScale: 1,
    baseRecordCount: 0,
    focusRecordCount: 0,
    mergedRecordCount: 0,
    focusRingEnabled: true,
    focusRingRadiusM: MEADOW_FOCUS_RING_RADIUS_M,
    focusRingHysteresisM: MEADOW_FOCUS_RING_REBUILD_HYSTERESIS_M,
    focusRingSnapCellM: MEADOW_FOCUS_RING_SNAP_CELL_M,
    focusRingFieldCellM: MEADOW_FOCUS_RING_FIELD_CELL_M,
    focusRingBaseWidthM: MEADOW_FOCUS_RING_BASE_WIDTH_M,
    focusRingMaxRecords: MEADOW_FOCUS_RING_MAX_RECORDS,
    dedupeRadiusM: MEADOW_FOCUS_RING_RADIUS_M - MEADOW_FOCUS_RING_DEDUPE_MARGIN_M,
    activeFocus: null as GrassSampleFocus | null,
    pendingFocus: null as GrassSampleFocus | null,
    pending: false,
    rebuilds: 0,
    lastSampleMs: 0,
    lastSlices: 0,
    lastMaxSliceMs: 0,
    inProgressCells: 0,
    totalCells: 0,
  };
  private grassEnabled = true;
  private readonly meadowFocusRingEnabled: boolean;
  private farGrassEnabled = true;
  private readonly grassTransition: BladeFieldTransitionUniforms;
  private readonly wind: BladeFieldWindUniforms = createBladeFieldWindUniforms();
  private activeGrassTransition: BladeFieldTransitionProfile;
  private cameraInitialized = false;
  private instances: CrowdInstance[] = [];
  private markers: MarkerInstance[] = [];
  private seating = { checked: 0, matches: true, span: 0 };
  private lastCamera: BattleCameraSnapshot = {
    x: 0,
    y: 0,
    zoom: 0,
    zoomT: 0,
    camera3d: {
      target: [0, 0, 0],
      distance: 100,
      pitch: Math.PI / 2 - 0.02,
      yaw: 0,
      fovY: 0.6,
      aspect: 1,
      near: 1,
    },
  };

  private constructor(
    world: PhotorealWorld,
    environment: BattleEnvironment,
    sea: ReturnType<typeof createSeaDisplacementSource>,
    meshes: ReturnType<typeof createPlaceholderSoldierMeshTiers>,
    vats: Awaited<ReturnType<typeof loadClassVats>>,
    kit: Awaited<ReturnType<typeof loadPlaceholderKit>>,
    shadowMode: SunShadowMode,
    postEnabled: boolean,
    postGrade: Partial<BattlePostGradeUniforms> | null,
    grassProfile: ProductionBladeFieldProfile,
    meadowFocusRingEnabled: boolean,
    disabledGroundDetail: GroundDetailTerm | null,
  ) {
    this.world = world;
    this.environment = environment;
    this.grassProfile = grassProfile;
    this.meadowFocusRingEnabled = meadowFocusRingEnabled;
    this.disabledGroundDetail = disabledGroundDetail;
    this.sea = sea;
    this.grassRebuildStats.coverageRadiusM = grassProfile.vistaVisibleRadiusM;
    this.grassRebuildStats.vistaRecordBudget = grassProfile.maxRecords;
    this.grassRebuildStats.activeRecordBudget = grassProfile.maxRecords;
    this.grassRebuildStats.areaBudgetScale = 1;
    this.grassRebuildStats.strategy = meadowFocusRingEnabled
      ? "static-whole-map+camera-focus-ring"
      : "static-whole-map";
    this.grassRebuildStats.focusRingEnabled = meadowFocusRingEnabled;
    this.grassTransition = createBladeFieldTransitionUniforms(
      activeGrassTransitionProfile(grassProfile, grassProfile.vistaVisibleRadiusM),
    );
    this.frame = createBattleFrameUniforms();
    this.frame.time = world.uTime;
    const scene = world.scene;
    const env = this.environment;

    // Slice 09 — lighting core: sun DirectionalLight + AgX tonemap (see
    // world.ts — AgX replaced ACES) +
    // per-preset exposure; slice 10a — the physical sky (SkyModel dome +
    // sky-view-LUT IBL, one source); slice 10b — the ONE aerial-perspective
    // owner (scene.fogNode) hazes every fog-enabled world material, replacing
    // the THREE.Fog stand-in AND the per-material albedo haze mixes. All
    // mapped from the ONE preset owner. (The reversed-depth sort comparators
    // moved to PhotorealWorld.create at 10a — substrate-wide contract.)
    applyCivsimEnvironment(world, env.environment, {
      // Aerial optical depth measured from the player's ground focus — the
      // tactical rig eye parks km out and would white gameplay framings out.
      aerialObserver: vec3(this.frame.focus, 0.0),
    });

    // Slice 11 — real cascaded sun shadows from the SAME environment sun,
    // adapter-tiered (csm hardware / single software / off lab-debug). The
    // 08a blob-shadow decal stand-ins are deleted; casters/receivers are
    // flagged where each mesh is built (terrain/foliage/crowd layers).
    this.shadowRig = configureSunShadows(
      world.renderer,
      world.sunLight!,
      env.environment,
      shadowMode,
    );

    this.background = new BattleBackgroundQuads(scene, this.frame, disabledGroundDetail);
    this.grass = new PhotorealBladeFieldLayer(
      scene,
      this.grassProfile.tiers,
      true,
      this.grassTransition,
      this.wind,
    );
    this.activeGrassTransition = this.grassTransition.profile;
    this.scenery = new PhotorealScenery(scene);
    this.crowd = new PhotorealCrowd(scene, meshes, vats, kit);
    this.mountedClasses = mountedClassesFromKit(kit);
    // Ground cues drape onto the canonical terrain surface (the same height
    // contract that seats soldiers and scenery) — a decal at flat z = 0 sinks
    // under any rise and vanishes. The lift clears the coarse ground mesh's
    // within-cell divergence from the bilinear field.
    this.groundCues = new PhotorealLineLayer(scene, 0.25, {
      alpha: 0.98, // the selection-ring weight — cues and rings are one style
      depthTest: true,
      renderOrder: RENDER_ORDER.groundCues,
      drape: { heightAt: (x, y) => this.heightAt(x, y), step: 4 },
    });
    this.selectionRings = new PhotorealRingLayer(scene, (x, y) => this.heightAt(x, y), 0.12);
    this.effectLines = new PhotorealLineLayer(scene, 0.0, {
      alpha: 0.92,
      depthTest: false,
      renderOrder: RENDER_ORDER.effectLines,
      perVertexZ: true,
    });
    this.debugBlocks = new PhotorealTriangleLayer(scene, RENDER_ORDER.debugBlocks);
    this.debugTriangles = new PhotorealTriangleLayer(scene, RENDER_ORDER.debugTriangles);
    this.markerLayer = new PhotorealMarkerLayer(scene);
    this.standardLayer = new PhotorealStandardLayer(scene, world.uTime);
    this.readoutLayer = new PhotorealReadoutLayer(scene);

    // Slice 15/P1 — the post chain: one bloom stage, the preset-gated look
    // grade, and the ONE tone-map applied at the tail. Threshold-disciplined
    // bloom means only the sky sun disc + the GGX sea glint spill; the grade is
    // full-frame linear HDR before AgX, never material-local. ?post=off (lab
    // A/B) bypasses the chain.
    this.post = new BattlePostChain(world.renderer, scene, this.camera, env.environment.id);
    this.post.enabled = postEnabled;
    if (postGrade) this.post.setGradeUniforms(postGrade);
    world.post = this.post;
  }

  static async create(
    canvas: HTMLCanvasElement,
    options: {
      environment?: string | null;
      shadows?: string | null;
      sea?: SeaDisplacementSourceId;
      post?: string | null;
      grassQuality?: BattleGrassQuality;
      /** Lab A/B only; production defaults to the approved camera-following meadow ring. */
      meadowFocusRing?: boolean;
      /** Lab/capture-only post-grade override; preset defaults apply when null. */
      postGrade?: Partial<BattlePostGradeUniforms> | null;
      /** Renderer-lab attribution only; production leaves every term enabled. */
      disabledGroundDetail?: GroundDetailTerm | null;
    } = {},
  ): Promise<PhotorealBattleWorld> {
    const environment = resolveBattleEnvironment(options.environment);
    const grassProfile = productionBladeFieldProfile(options.grassQuality);
    const [world, kit] = await Promise.all([
      PhotorealWorld.create(canvas, { antialias: false }),
      loadPlaceholderKit(),
    ]);
    const sea = createSeaDisplacementSource(options.sea ?? "gerstner-tsl");
    const vats = await loadClassVats(kit);
    // Classes with a baked real mesh (kit.classMeshes) replace all their
    // placeholder LOD tiers with it; every other class keeps the generated
    // placeholder. The baked mesh skins to the class VAT from kit.classVats.
    const classMeshes = await loadClassMeshes(kit);
    const meshes = createPlaceholderSoldierMeshTiers([0.06, 0.1, 0.98]);
    classMeshes.forEach((mesh, classId) => {
      if (mesh && meshes[classId]) meshes[classId] = meshes[classId].map(() => mesh);
    });
    // Shadow tier: adapter capability probe (SwiftShader → 'single'), lab
    // ?shadows= override wins. Resolved here because the adapter identity
    // only exists once the renderer is initialized.
    const shadowMode = resolveSunShadowMode(world.stats().device, options.shadows);
    // ?post=off (lab A/B only) bypasses the chain; production always runs it.
    const postEnabled = options.post !== "off";
    return new PhotorealBattleWorld(
      world,
      environment,
      sea,
      meshes,
      vats,
      kit,
      shadowMode,
      postEnabled,
      options.postGrade ?? null,
      grassProfile,
      // Default OFF pending the zoom gate: with the ring always on, the
      // perf:30k vista stop regressed to 37.25ms gpu median (> 33ms budget) —
      // the dense 300m ring is invisible at tactical zoom. The fixture (and
      // any close-camera surface) opts in explicitly until the ring is gated
      // by the grass zoom cutoff. See specs/meadow-polish.md P3.3.
      options.meadowFocusRing === true,
      options.disabledGroundDetail ?? null,
    );
  }

  setTime(seconds: number): void {
    this.world.setTime(seconds);
  }

  /** Toggle the bloom stage in place (slice-15a A/B: the sun-glint bloom on/off
   *  pair proving bloom did not re-break the 12e glint discipline). */
  setBloomEnabled(on: boolean): void {
    this.post.setBloomEnabled(on);
  }

  setPostGrade(uniforms: Partial<BattlePostGradeUniforms>): void {
    this.post.setGradeUniforms(uniforms);
  }

  /** Lab-only blade-field A/B hook; production leaves this on. */
  setGrassVisible(visible: boolean): void {
    this.grassEnabled = visible;
    this.grass.setVisible(visible);
    if (!visible) {
      this.grassSampleTask = null;
      this.grassPendingTerrainKey = null;
      this.grassRebuildStats.pending = false;
      this.grassRebuildStats.pendingFocus = null;
      this.grassRebuildStats.inProgressCells = 0;
      this.grassRebuildStats.totalCells = 0;
    }
  }

  /** Lab-only far blade-tier A/B hook; leaves near/mid close-gate density intact. */
  setFarGrassVisible(visible: boolean): void {
    this.farGrassEnabled = visible;
    this.grass.setFarTierVisible(visible);
    this.grassTransition.terrainDetailStrength.value = visible
      ? (this.activeGrassTransition.terrainDetailStrength ?? 1)
      : 0;
  }

  resize(width: number, height: number, pixelRatio = 1): void {
    this.viewportHeight = height;
    this.world.resize(width, height, pixelRatio);
  }

  /** Screen pixels per world meter at a world point, through the LIVE
   *  perspective camera. The battle rig's chart-style worldToScreen diverges
   *  from the true projection in the swoop regime, so legibility floors and
   *  billboard sizing must measure here — the camera is the only seam. */
  pxPerWorldAt(x: number, y: number, z: number): number {
    const dx = this.camera.position.x - x;
    const dy = this.camera.position.y - y;
    const dz = this.camera.position.z - z;
    const dist = Math.max(0.001, Math.hypot(dx, dy, dz));
    const fovRad = (this.camera.fov * Math.PI) / 180;
    return this.viewportHeight / (2 * dist * Math.tan(fovRad / 2));
  }

  setStatic(soldierUnit: Uint32Array, teams: number[], classes: number[]): void {
    this.soldierUnit = new Uint32Array(soldierUnit);
    this.unitTeam = teams.map((team) => (team === 1 ? 1 : 0));
    this.unitClass = classes.map((cls) => Math.max(0, Math.floor(cls || 0)));
    this.staticSoldiers = soldierUnit.length;
    this.instances = [];
    this.markers = [];
    this.crowd.upload([]);
    this.markerLayer.upload([]);
    this.standardLayer.upload([]);
    this.readoutLayer.upload([]);
    this.selectionRings.upload(new Float32Array());
    this.effectLines.upload(new Float32Array());
    this.debugTriangles.upload(new Float32Array());
    this.debugBlocks.upload(new Float32Array());
  }

  setTerrain(
    w: number,
    h: number,
    cell: number,
    ox: number,
    oy: number,
    tint?: Uint8Array,
    height?: Float32Array,
    wasmMapId?: number,
    slopeBands?: BattleSlopeBands | null,
    vista?: BattleVistaGrid | null,
    lakeSurfaces?: BattleLakeSurfaceSpec[] | null,
    rough?: Float32Array,
    speed?: Float32Array,
  ): void {
    this.terrainRect = [ox, oy, w * cell, h * cell];
    this.terrainGrid = tint
      ? {
          w,
          h,
          cell,
          ox,
          oy,
          tint: new Uint8Array(tint),
          height: height ? new Float32Array(height) : undefined,
          rough: rough ? new Float32Array(rough) : undefined,
          speed: speed ? new Float32Array(speed) : undefined,
        }
      : null;
    const catalog = wasmMapId !== undefined ? battleMapByWasmId(wasmMapId) : undefined;
    this.groundCover = catalog?.groundCover ?? "green-grass";
    this.slopeBands = slopeBands ?? null;
    this.vistaGrid = vista ?? null;
    this.lakeSurfaces = lakeSurfaces ? lakeSurfaces.map((surface) => ({ ...surface })) : [];
    this.applyTerrain();
  }

  /** Mirror of BattleRenderer.applyTerrain: one height field (with the shared
   *  render exaggeration) feeds ground, scenery seats, horizon, and soldiers. */
  private applyTerrain(): void {
    const grid = this.terrainGrid;
    if (!grid) return;
    const field: TerrainHeightField = grid.height
      ? {
          w: grid.w,
          h: grid.h,
          cell: grid.cell,
          ox: grid.ox,
          oy: grid.oy,
          height: grid.height,
          units: "meters",
          verticalScale: BATTLE_RELIEF_EXAGGERATION,
        }
      : {
          w: grid.w,
          h: grid.h,
          cell: grid.cell,
          ox: grid.ox,
          oy: grid.oy,
          height: new Float32Array(grid.w * grid.h),
          units: "meters",
          verticalScale: 1,
        };
    this.heightField = field;
    const presentation = buildBattleTerrainPresentation(
      {
        id: "live",
        edges: deriveBattleEdgeRoles(grid),
        groundCover: this.groundCover,
      },
      grid,
      0x5eed,
    );

    const scene = this.world.scene;
    if (this.ground) {
      scene.remove(this.ground);
      disposeMesh(this.ground);
    }
    const groundMesh = buildPhotorealBattleGroundMesh(grid, field, this.groundCover);
    this.groundTriangles = groundMesh.triangles;
    this.ground = createGroundMesh(this.frame, groundMesh, {
      slopeBands: this.slopeBands,
      farGrass: this.grassTransition,
      disabledGroundDetail: this.disabledGroundDetail,
      earthDistance: groundMesh.earthDistance,
    });
    scene.add(this.ground);

    if (this.horizonBlockers) {
      scene.remove(this.horizonBlockers);
      disposeMesh(this.horizonBlockers);
    }
    for (const mesh of this.vistaMeshes) {
      scene.remove(mesh);
      disposeMesh(mesh);
    }
    for (const plane of this.oceanPlanes) {
      scene.remove(plane);
      disposeMesh(plane);
    }
    for (const plane of this.lakePlanes) {
      scene.remove(plane);
      disposeMesh(plane);
    }
    this.vistaMeshes = [];
    this.oceanPlanes = [];
    this.lakePlanes = [];
    this.vistaTriangles = 0;
    if (this.vistaGrid) {
      this.sealedEdges = ["generated:vista"];
      this.horizonBlockers = null;
      for (const band of this.vistaGrid.bands) {
        const mesh = createVistaMesh(this.frame, band, this.groundCover, {
          slopeBands: this.slopeBands,
          farGrass: this.grassTransition,
          disabledGroundDetail: this.disabledGroundDetail,
        });
        if (!mesh) continue;
        this.vistaMeshes.push(mesh);
        this.vistaTriangles += (mesh.geometry.index?.count ?? 0) / 3;
        scene.add(mesh);
      }
    } else {
      const layout = buildBattleHorizonLayout(
        { ox: grid.ox, oy: grid.oy, w: grid.w, h: grid.h, cell: grid.cell },
        presentation.edges,
        field,
      );
      this.sealedEdges = layout.builtEdges.map((e) => `${e.side}:${e.role}`);
      this.horizonBlockers = createHorizonBlockerMesh(layout);
      if (this.horizonBlockers) scene.add(this.horizonBlockers);
      this.oceanPlanes = layout.oceanPlanes.map((spec) =>
        createOceanPlaneMesh(this.frame, spec, this.sea),
      );
      for (const plane of this.oceanPlanes) scene.add(plane);
    }
    this.lakePlanes = this.lakeSurfaces
      .map((spec) => createLakePlaneMesh(this.frame, spec, grid, this.sea))
      .filter((plane): plane is THREE.Mesh => plane !== null);
    for (const plane of this.lakePlanes) scene.add(plane);

    this.scenery.upload(featuresToBattleScenery(presentation.features, field, 0x77, grid));
    this.shadowRig.setWorldRect(this.terrainRect);
    this.background.setRects(this.terrainRect, expandedTerrainRect(this.terrainRect));
    this.grassBaseTerrainKey = null;
    this.grassBaseRecords = null;
    this.grassBaseSampleStats = null;
    this.grassFocusTerrainKey = null;
    this.grassFocusRecords = null;
    this.grassFocusSampleStats = null;
    this.grassPendingTerrainKey = null;
    this.grassSampleTask = null;
    this.grassSampleStats = null;
    this.grassRebuildStats.pending = false;
    this.grassRebuildStats.activeFocus = null;
    this.grassRebuildStats.pendingFocus = null;
    this.grassRebuildStats.baseRecordCount = 0;
    this.grassRebuildStats.focusRecordCount = 0;
    this.grassRebuildStats.mergedRecordCount = 0;
    this.grassRebuildStats.inProgressCells = 0;
    this.grassRebuildStats.totalCells = 0;
    this.updateGrassForCamera(eyePosition(this.lastCamera.camera3d)[2]);
  }

  private terrainHeightSampler(): ((x: number, y: number) => number) | undefined {
    const field = this.heightField;
    return field ? (x, y) => terrainHeightAt(field, x, y) : undefined;
  }

  /** Rendered surface height at a world point. Inside the playable field this
   *  is the sim terrain. Outside generated maps it is the vista apron/far-fog
   *  mesh, not the edge-clamped heightfield, so the close camera cannot dive
   *  under terrain that only the renderer knows about. */
  heightAt(x: number, y: number): number {
    const playable = this.heightField ? terrainHeightAt(this.heightField, x, y) : 0;
    const vista = this.vistaGrid ? vistaSurfaceHeightAt(this.vistaGrid, x, y) : null;
    if (this.isInsidePlayableRect(x, y))
      return vista === null ? playable : Math.max(playable, vista);
    return vista ?? playable;
  }

  surfaceHeightAt(x: number, y: number): number {
    return this.heightAt(x, y);
  }

  private isInsidePlayableRect(x: number, y: number): boolean {
    const [x0, y0, w, h] = this.terrainRect;
    return x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;
  }

  draw(
    positions: Float32Array,
    facings: Float32Array,
    frames: Float32Array,
    alive: Float32Array,
    count: number,
    camera: BattleCameraSnapshot,
    renderClass?: Uint8Array | number[] | null,
    simTick?: number,
    frameDt = 0,
  ): void {
    this.frame.dt.value = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
    this.setCamera(camera);
    const built = buildCrowdInstances({
      positions,
      facings,
      frames,
      alive,
      soldierUnit: this.soldierUnit,
      unitTeam: this.unitTeam,
      unitClass: this.unitClass,
      renderClass: renderClass ?? undefined,
      mountedClasses: this.mountedClasses,
      terrainHeight: this.terrainHeightSampler(),
      simTick: simTick ?? 0,
      count,
    });
    this.instances = built.instances;
    this.markers = [];
    this.updateSeating(built.instances);
    this.updateGrassForCamera(eyePosition(this.lastCamera.camera3d)[2]);
    applyCamera3d(this.camera, this.lastCamera.camera3d);
    this.shadowRig.update(this.camera);
    this.crowd.upload(this.instances, this.crowdVisibilityScope());
    this.markerLayer.upload(this.markers);
  }

  debugSoldierAnim(index: number): { clip: string; phase: number; frame: number } | null {
    return this.crowd.debugSoldierAnim(index);
  }

  uploadUnitReadouts(
    standards: readonly BattleStandardInstance[],
    readouts: readonly BattleReadoutInstance[],
  ): void {
    this.standardLayer.upload(standards);
    this.readoutLayer.upload(readouts);
    // Published for verification (battle-input banner-plant checks): the
    // banner anchors left the DOM for GPU billboards, so scenes consume the
    // owner's uploaded positions instead of re-deriving them.
    this.lastStandards = standards.map((s) => ({ unitId: s.unitId, x: s.x, y: s.y, z: s.z }));
  }
  private lastStandards: { unitId: number; x: number; y: number; z: number }[] = [];

  drawTris(verts: Float32Array, camera: BattleCameraSnapshot): void {
    this.setCamera(camera);
    this.debugTriangles.upload(verts);
  }

  /** Uploads debug block triangles (the ?debug=blocks surface). */
  uploadDebugBlocks(verts: Float32Array): void {
    this.debugBlocks.upload(verts);
  }

  /** The frame call: uploads the tactical-line decals/overlays and renders. */
  drawTacticalLines(lines: BattleTacticalLineFrame, camera: BattleCameraSnapshot): void {
    this.setCamera(camera);
    this.groundCues.upload(lines.groundCues);
    this.selectionRings.upload(lines.rings);
    this.effectLines.upload(lines.effects);
    this.render();
  }

  /** Pose the three camera from camera3d (the ONLY way — cameraBridge) and
   *  render the scene. drawTacticalLines calls this; routes may call it
   *  directly when they draw a static world. */
  render(): void {
    applyCamera3d(this.camera, this.lastCamera.camera3d);
    // Cascade splits track the live projection (the zoom rig moves fovY/pitch
    // continuously) — re-fit them after every camera pose.
    this.shadowRig.update(this.camera);
    if (this.world.sunLight) {
      this.sunDirectionScratch
        .copy(this.world.sunLight.position)
        .sub(this.world.sunLight.target.position)
        .normalize();
      this.grass.setSunDirection(this.sunDirectionScratch);
    }
    updateWindUniforms(this.wind, this.world.time);
    // ONE ground anchor owns both sampling and routing: the look target. A
    // footprint-centered sample puts most of the disc BEHIND a shallow-pitch
    // camera (at zoom 3 the eye grounds ~400m behind the frame) and the
    // routed target area starves at the disc rim. Eye height still selects
    // the band; the target owns where the disc lives.
    const eye = eyePosition(this.lastCamera.camera3d);
    const target = this.lastCamera.camera3d.target;
    this.updateGrassForCamera(eye[2]);
    // Zoom cutoff: hide the blades and skip the GPU route/cull pass entirely
    // once zoomed out past the resolvable range (blades would be a sub-pixel
    // smear). setVisible only toggles mesh.visible, so this is cheap per-frame.
    const grassOn = this.grassVisibleNow();
    this.grass.setVisible(grassOn);
    if (grassOn)
      this.grass.routeGpu(this.world.renderer, [eye[0], eye[1], eye[2]], [target[0], target[1]]);
    this.grassRebuildStats.routeAnchor = [
      Math.round(target[0]),
      Math.round(target[1]),
      Math.round(eye[0]),
      Math.round(eye[1]),
      Math.round(eye[2] * 10) / 10,
    ];
    this.crowd.refreshCamera(this.camera);
    this.markerLayer.setCameraBasis(this.camera);
    this.readoutLayer.setCameraBasis(this.camera);
    this.background.setStyle(this.lastCamera.zoom < 1.2 ? "wide-detail" : "default");
    this.world.render(this.camera);
  }

  private setCamera(camera: BattleCameraSnapshot): void {
    this.lastCamera = camera;
    this.cameraInitialized = true;
    this.frame.focus.value.set(camera.x, camera.y);
  }

  private crowdVisibilityScope(): CrowdVisibilityScope {
    const view = new THREE.Frustum();
    const mat = new THREE.Matrix4().multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    view.setFromProjectionMatrix(mat, this.camera.coordinateSystem, this.camera.reversedDepth);
    const shadowFrusta = this.shadowRig.cullingFrusta();
    return {
      camera: this.camera,
      lodCamera: { x: this.lastCamera.x, y: this.lastCamera.y, zoom: this.lastCamera.zoom },
      frusta: [view, ...shadowFrusta],
      viewFrusta: 1,
      shadowFrusta: shadowFrusta.length,
    };
  }

  private updateSeating(instances: CrowdInstance[]): void {
    const sampler = this.terrainHeightSampler();
    if (!sampler || instances.length === 0) {
      this.seating = { checked: 0, matches: true, span: 0 };
      return;
    }
    let matches = true;
    let lo = Infinity;
    let hi = -Infinity;
    for (const inst of instances) {
      const z = inst.elevation ?? 0;
      if (Math.abs(z - sampler(inst.x, inst.y)) > 1e-3) matches = false;
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
    this.seating = { checked: instances.length, matches, span: Number((hi - lo).toFixed(3)) };
  }

  /** Whether the blades should render at all this frame: on only when grass is
   *  enabled AND the view is zoomed in enough that blades are resolvable. Past
   *  the cutoff blades are a sub-pixel smear, so they are hidden and the GPU
   *  route pass is skipped (the render loop gates `routeGpu` on this too). */
  private grassVisibleNow(): boolean {
    return this.grassEnabled && this.lastCamera.zoomT >= GRASS_ZOOM_CUTOFF_T;
  }

  private updateGrassForCamera(eyeZ = 0): void {
    if (!this.grassEnabled) return;
    if (!this.terrainGrid || !this.heightField) return;
    // The visible falloff/LOD ring still tracks zoom — these are cheap GPU
    // uniforms, not a rebuild — so the near tier stays detailed and the GPU
    // cull radius shrinks when zoomed in.
    const visibleRadius = activeGrassVisibleRadiusM(this.grassProfile, eyeZ);
    const transition = activeGrassTransitionProfile(this.grassProfile, visibleRadius);
    this.activeGrassTransition = this.grass.setTransition(transition);
    this.grassTransition.terrainDetailStrength.value = this.farGrassEnabled
      ? (this.activeGrassTransition.terrainDetailStrength ?? 1)
      : 0;
    this.ensureBaseGrassRecords();
    this.grassRebuildStats.strategy = this.meadowFocusRingEnabled
      ? "static-whole-map+camera-focus-ring"
      : "static-whole-map";
    this.grassRebuildStats.focusRingEnabled = this.meadowFocusRingEnabled;
    this.grassRebuildStats.coverageRadiusM = this.meadowFocusRingEnabled
      ? MEADOW_FOCUS_RING_RADIUS_M
      : this.baseGrassFocus().radius;
    this.grassRebuildStats.activeTransition = this.activeGrassTransition;
    this.grassRebuildStats.activeRecordBudget = this.meadowFocusRingEnabled
      ? MEADOW_FOCUS_RING_MAX_RECORDS
      : STATIC_GRASS_MAX_RECORDS;

    if (!this.cameraInitialized) return;
    if (!this.meadowFocusRingEnabled) {
      this.grassSampleTask = null;
      this.grassPendingTerrainKey = null;
      this.grassRebuildStats.pending = false;
      this.grassRebuildStats.pendingFocus = null;
      this.grassRebuildStats.activeFocus = null;
      this.applyGrassRecordSets();
      return;
    }

    const target = this.lastCamera.camera3d.target;
    const focus = this.focusRingForCamera(target[0], target[1]);
    const key = this.grassSampleKey("focus", focus);
    const active = this.grassRebuildStats.activeFocus;
    const pending = this.grassRebuildStats.pendingFocus;
    if (!active) {
      if (key !== this.grassPendingTerrainKey) this.startGrassSampleTask(focus, key);
      return;
    }
    const currentCenter = pending ?? active;
    const needsMovedFocus =
      Math.hypot(target[0] - currentCenter.x, target[1] - currentCenter.y) >
      MEADOW_FOCUS_RING_REBUILD_HYSTERESIS_M;
    if (!needsMovedFocus) return;
    if (key === this.grassFocusTerrainKey || key === this.grassPendingTerrainKey) return;
    this.startGrassSampleTask(focus, key);
  }

  private baseGrassFocus(): GrassSampleFocus {
    const [ox, oy, w, h] = this.terrainRect;
    return {
      x: ox + w / 2,
      y: oy + h / 2,
      radius: Math.hypot(w, h) / 2,
      maxRecords: STATIC_GRASS_MAX_RECORDS,
    };
  }

  private focusRingForCamera(x: number, y: number): GrassSampleFocus {
    return {
      x: snapToGrassFocusGrid(x),
      y: snapToGrassFocusGrid(y),
      radius: MEADOW_FOCUS_RING_RADIUS_M,
      maxRecords: MEADOW_FOCUS_RING_MAX_RECORDS,
    };
  }

  private grassSampleKey(kind: "base" | "focus", focus: GrassSampleFocus): string {
    if (!this.terrainGrid) return "";
    const fieldCellSize =
      kind === "focus" ? MEADOW_FOCUS_RING_FIELD_CELL_M : STATIC_GRASS_FIELD_CELL_M;
    const baseWidth =
      kind === "focus" ? MEADOW_FOCUS_RING_BASE_WIDTH_M : this.grassProfile.baseWidth;
    return [
      kind,
      this.terrainGrid.w,
      this.terrainGrid.h,
      this.terrainGrid.cell,
      this.terrainGrid.ox,
      this.terrainGrid.oy,
      this.groundCover,
      this.grassProfile.source,
      fieldCellSize,
      baseWidth,
      focus.maxRecords,
      Math.round(focus.x),
      Math.round(focus.y),
      focus.radius,
    ].join(":");
  }

  private ensureBaseGrassRecords(): void {
    if (!this.terrainGrid || !this.heightField) return;
    const focus = this.baseGrassFocus();
    const key = this.grassSampleKey("base", focus);
    if (key === this.grassBaseTerrainKey && this.grassBaseRecords) return;
    const sampler = createGrassFieldSampler(this.terrainGrid, this.heightField, {
      seed: this.grassProfile.seed,
      focus,
      // UNIFORM whole-map density: one candidate blade per static cell, every
      // candidate accepted (density 1), no LOD-stratified centre concentration
      // — this retained far ring keeps the horizon populated under the dense
      // camera-following focus set.
      fieldCellSize: STATIC_GRASS_FIELD_CELL_M,
      snapCellSize: this.grassProfile.snapCellSize,
      clumpCellSize: this.grassProfile.clumpCellSize,
      maxRecords: focus.maxRecords,
      lodStratifiedBudget: false,
      density: 1,
      jitter: this.grassProfile.jitter,
      minNormalZ: this.grassProfile.minNormalZ,
      lodNearRadius: this.grassProfile.lodNearRadiusM / focus.radius,
      lodMidRadius: this.grassProfile.lodMidRadiusM / focus.radius,
      baseHeight: this.grassProfile.baseHeight,
      heightJitter: this.grassProfile.heightJitter,
      baseWidth: this.grassProfile.baseWidth,
      widthJitter: this.grassProfile.widthJitter,
      baseBend: this.grassProfile.baseBend,
      bendJitter: this.grassProfile.bendJitter,
    });
    const started = performance.now();
    while (!sampler.step(GRASS_SAMPLE_SLICE_CELLS)) {
      /* existing static whole-map build: retained and map-scoped */
    }
    const snapshot = sampler.finish();
    if (!snapshot) return;
    this.grassBaseTerrainKey = key;
    this.grassBaseRecords = snapshot.packedRecords;
    this.grassBaseSampleStats = snapshot.stats;
    this.grassSampleStats = this.grassFocusSampleStats ?? this.grassBaseSampleStats;
    this.grassRebuildStats.baseRecordCount = snapshot.stats.acceptedRecords;
    this.grassRebuildStats.lastSampleMs = Number((performance.now() - started).toFixed(3));
    this.grassRebuildStats.lastSlices = 1;
    this.grassRebuildStats.lastMaxSliceMs = this.grassRebuildStats.lastSampleMs;
    this.applyGrassRecordSets();
  }

  private startGrassSampleTask(focus: GrassSampleFocus, key: string): void {
    if (!this.terrainGrid || !this.heightField) return;
    const sampler = createGrassFieldSampler(this.terrainGrid, this.heightField, {
      seed: this.grassProfile.seed,
      focus,
      fieldCellSize: MEADOW_FOCUS_RING_FIELD_CELL_M,
      snapCellSize: MEADOW_FOCUS_RING_SNAP_CELL_M,
      clumpCellSize: this.grassProfile.clumpCellSize,
      maxRecords: focus.maxRecords,
      lodStratifiedBudget: false,
      density: 1,
      jitter: this.grassProfile.jitter,
      minNormalZ: this.grassProfile.minNormalZ,
      lodNearRadius: this.grassProfile.lodNearRadiusM / focus.radius,
      lodMidRadius: this.grassProfile.lodMidRadiusM / focus.radius,
      baseHeight: this.grassProfile.baseHeight,
      heightJitter: this.grassProfile.heightJitter,
      baseWidth: MEADOW_FOCUS_RING_BASE_WIDTH_M,
      widthJitter: this.grassProfile.widthJitter,
      baseBend: this.grassProfile.baseBend,
      bendJitter: this.grassProfile.bendJitter,
    });
    const task: GrassSampleTask = {
      key,
      focus,
      sampler,
      startedAt: performance.now(),
      buildMs: 0,
      slices: 0,
      maxSliceMs: 0,
    };
    this.grassSampleTask = task;
    this.grassPendingTerrainKey = key;
    this.grassRebuildStats.pending = true;
    this.grassRebuildStats.pendingFocus = focus;
    this.grassRebuildStats.totalCells = sampler.totalCells;
    this.grassRebuildStats.inProgressCells = 0;
    this.scheduleGrassSampleSlice(task);
  }

  private scheduleGrassSampleSlice(task: GrassSampleTask): void {
    scheduleNextFrame(() => this.runGrassSampleSlice(task));
  }

  private runGrassSampleSlice(task: GrassSampleTask): void {
    if (task !== this.grassSampleTask || !this.grassEnabled || !this.meadowFocusRingEnabled)
      return;
    const sliceStarted = performance.now();
    let done = false;
    do {
      done = task.sampler.step(GRASS_SAMPLE_SLICE_CELLS);
    } while (!done && performance.now() - sliceStarted < GRASS_SAMPLE_SLICE_BUDGET_MS);
    const sliceMs = performance.now() - sliceStarted;
    task.slices += 1;
    task.buildMs += sliceMs;
    task.maxSliceMs = Math.max(task.maxSliceMs, sliceMs);
    this.grassRebuildStats.inProgressCells = task.sampler.cellsProcessed;
    this.grassRebuildStats.totalCells = task.sampler.totalCells;
    this.grassRebuildStats.lastSlices = task.slices;
    this.grassRebuildStats.lastMaxSliceMs = Number(task.maxSliceMs.toFixed(3));
    if (done) this.completeGrassSampleTask(task);
    else this.scheduleGrassSampleSlice(task);
  }

  private completeGrassSampleTask(task: GrassSampleTask): void {
    if (task !== this.grassSampleTask) return;
    const snapshot = task.sampler.finish();
    if (!snapshot) {
      this.grassSampleTask = null;
      this.grassPendingTerrainKey = null;
      this.grassRebuildStats.pending = false;
      this.grassRebuildStats.pendingFocus = null;
      return;
    }
    const sampleMs = performance.now() - task.startedAt;
    this.grassFocusSampleStats = snapshot.stats;
    this.grassFocusRecords = snapshot.packedRecords;
    this.grassSampleStats = snapshot.stats;
    this.grassFocusTerrainKey = task.key;
    this.grassPendingTerrainKey = null;
    this.grassSampleTask = null;
    this.grassRebuildStats = {
      ...this.grassRebuildStats,
      activeFocus: task.focus,
      pendingFocus: null,
      pending: false,
      rebuilds: this.grassRebuildStats.rebuilds + 1,
      lastSampleMs: Number(sampleMs.toFixed(3)),
      lastSlices: task.slices,
      lastMaxSliceMs: Number(task.maxSliceMs.toFixed(3)),
      inProgressCells: task.sampler.cellsProcessed,
      totalCells: task.sampler.totalCells,
    };
    this.applyGrassRecordSets();
  }

  private applyGrassRecordSets(): void {
    const base = this.grassBaseRecords;
    const focus = this.meadowFocusRingEnabled ? this.grassFocusRecords : null;
    const activeFocus = this.grassRebuildStats.activeFocus;
    if (!base && !focus) {
      this.grass.applyPackedRecords(new Float32Array(), false);
      this.grassRebuildStats.baseRecordCount = 0;
      this.grassRebuildStats.focusRecordCount = 0;
      this.grassRebuildStats.mergedRecordCount = 0;
      return;
    }
    if (!focus || !activeFocus) {
      const records = base ?? new Float32Array();
      this.grass.applyPackedRecords(records, this.grassEnabled && records.length > 0);
      this.grassRebuildStats.baseRecordCount =
        records.length / GRASS_FIELD_PACKED_STRIDE_FLOATS;
      this.grassRebuildStats.focusRecordCount = 0;
      this.grassRebuildStats.mergedRecordCount =
        records.length / GRASS_FIELD_PACKED_STRIDE_FLOATS;
      return;
    }
    if (!base || base.length === 0) {
      this.grass.applyPackedRecords(focus, this.grassEnabled && focus.length > 0);
      this.grassRebuildStats.baseRecordCount = 0;
      this.grassRebuildStats.focusRecordCount = focus.length / GRASS_FIELD_PACKED_STRIDE_FLOATS;
      this.grassRebuildStats.mergedRecordCount = focus.length / GRASS_FIELD_PACKED_STRIDE_FLOATS;
      return;
    }

    const dedupeRadius = Math.max(0, activeFocus.radius - MEADOW_FOCUS_RING_DEDUPE_MARGIN_M);
    const dedupeSq = dedupeRadius * dedupeRadius;
    const farKeep = new Float32Array(base.length);
    let kept = 0;
    for (let o = 0; o < base.length; o += GRASS_FIELD_PACKED_STRIDE_FLOATS) {
      const dx = base[o] - activeFocus.x;
      const dy = base[o + 1] - activeFocus.y;
      if (dx * dx + dy * dy >= dedupeSq) {
        farKeep.set(base.subarray(o, o + GRASS_FIELD_PACKED_STRIDE_FLOATS), kept);
        kept += GRASS_FIELD_PACKED_STRIDE_FLOATS;
      }
    }
    const merged = new Float32Array(focus.length + kept);
    merged.set(focus, 0);
    merged.set(farKeep.subarray(0, kept), focus.length);
    this.grass.applyPackedRecords(merged, this.grassEnabled && merged.length > 0);
    this.grassRebuildStats.baseRecordCount = base.length / GRASS_FIELD_PACKED_STRIDE_FLOATS;
    this.grassRebuildStats.focusRecordCount = focus.length / GRASS_FIELD_PACKED_STRIDE_FLOATS;
    this.grassRebuildStats.mergedRecordCount = merged.length / GRASS_FIELD_PACKED_STRIDE_FLOATS;
    this.grassRebuildStats.dedupeRadiusM = dedupeRadius;
  }

  stats() {
    const world = this.world.stats();
    const crowdStats = this.crowd.stats();
    const visibleTierHistogram = crowdStats.visibleTierHistogram;
    const markerCount = visibleTierHistogram.l3;
    const skinnedCount =
      visibleTierHistogram.l0 + visibleTierHistogram.l1 + visibleTierHistogram.l2;
    const sea = this.sea.stats();
    return {
      renderer: "gpu" as const,
      ready: true,
      substrate: PHOTOREAL_SUBSTRATE,
      projection: PHOTOREAL_PROJECTION,
      environment: this.environment.environment.id,
      width: this.world.renderer.domElement.width,
      height: this.world.renderer.domElement.height,
      soldiers: this.instances.length + this.markers.length,
      expectedSoldiers: this.staticSoldiers,
      drawCalls: world.drawCalls,
      triangles: world.triangles,
      crowd: crowdStats,
      lod: { skinned: skinnedCount, impostors: markerCount },
      device: world.device,
      groundDetail: {
        disabled: this.disabledGroundDetail,
        earthEdges: this.ground?.userData.earthDistance ?? null,
      },
      // The engine depth convention, read off the live renderer: three owns the
      // depth buffer since 08b, posed reverse-Z to match camera3d.
      depth: {
        owner: "three-webgpu" as const,
        reversed: this.world.renderer.reversedDepthBuffer === true,
      },
      // Atmosphere ownership identity (10a sky tier; 10b adds the aerial owner).
      atmosphere: this.world.atmosphere,
      // Shadow ownership identity (11): WHICH tier cast the sun shadows —
      // the SwiftShader scene asserts 'single', hardware asserts 'csm'.
      shadows: this.shadowRig.identity(),
      // Post-chain ownership identity (15): bloom stage + the ONE tone-map.
      post: this.post.stats(),
      sea,
      camera: this.lastCamera,
      seating: { ...this.seating },
      terrain: this.ground
        ? {
            fixture: "sim-tint" as const,
            layer: "photoreal-battle-ground" as const,
            groundTriangles: this.groundTriangles,
            vistaTriangles: this.vistaTriangles,
            vista: this.vistaGrid
              ? {
                  bands: this.vistaGrid.bands.map((band) => ({
                    name: band.name,
                    width: band.w,
                    height: band.h,
                    cell: band.cell,
                    originX: band.ox,
                    originY: band.oy,
                    innerHalfW: band.innerHalfW,
                    innerHalfH: band.innerHalfH,
                    outerHalfW: band.outerHalfW,
                    outerHalfH: band.outerHalfH,
                  })),
                }
              : null,
            sealedEdges: [...this.sealedEdges],
            standards: this.lastStandards,
            sea: {
              ...sea,
              // `planes` keeps the legacy meaning (ocean planes only) - the
              // vista scene asserts generated maps have none; lakes report
              // separately.
              planes: this.oceanPlanes.length,
              oceanPlanes: this.oceanPlanes.length,
              lakePlanes: this.lakePlanes.length,
              lakeSurfaces: this.lakeSurfaces.map((surface) => ({ ...surface })),
            },
            groundCover: this.groundCover,
            slopeBands: this.slopeBands,
            environment: battleEnvironmentStats(this.environment),
            scenery: this.scenery.stats().scenery,
            grass: {
              ...this.grass.stats(),
              productionSamplingProfile: this.grassProfile,
              transitionOwner: "battleWorld.updateGrassForCamera" as const,
              activeTransition: this.activeGrassTransition,
              sample: this.grassSampleStats,
              rebuild: this.grassRebuildStats,
            },
          }
        : null,
      tacticalLines: {
        groundCues: this.groundCues.stats(),
        rings: this.selectionRings.stats(),
        effects: this.effectLines.stats(),
      },
      markers: this.markerLayer.stats(),
      standards: { ...this.standardLayer.stats(), timeSeconds: this.world.time },
      readouts: this.readoutLayer.stats(),
      performance: {
        gpuTimeMs: world.gpuTimeMs,
      },
    };
  }

  async settlePresentedFrame(): Promise<void> {
    if (this.cameraInitialized) this.updateGrassForCamera(eyePosition(this.lastCamera.camera3d)[2]);
    this.drainGrassSampleTaskForSettling();
    await this.world.settlePresentedFrame();
  }

  dispose(): void {
    this.shadowRig.dispose();
    this.world.dispose();
  }

  private drainGrassSampleTaskForSettling(): void {
    const task = this.grassSampleTask;
    if (!task) return;
    while (task === this.grassSampleTask && !task.sampler.step(GRASS_SAMPLE_SLICE_CELLS)) {
      task.slices += 1;
    }
    if (task === this.grassSampleTask) {
      task.slices += 1;
      this.completeGrassSampleTask(task);
    }
  }
}

/** setTerrain can rebuild a battle world in place (restarts); release both
 *  sides of the swapped meshes. */
function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const earthDistanceTexture = mesh.userData.earthDistanceTexture;
  if (earthDistanceTexture instanceof THREE.Texture) earthDistanceTexture.dispose();
  const material = mesh.material;
  if (Array.isArray(material)) material.forEach((m) => m.dispose());
  else material.dispose();
}

function productionBladeFieldProfile(
  quality: BattleGrassQuality | undefined,
): ProductionBladeFieldProfile {
  return quality ? PRODUCTION_BLADE_FIELD_PROFILES[quality] : PRODUCTION_BLADE_FIELD_PROFILE;
}

function activeGrassVisibleRadiusM(profile: ProductionBladeFieldProfile, eyeZ: number): number {
  if (eyeZ >= 60) return profile.vistaVisibleRadiusM;
  const band = Math.max(1, Math.min(4, Math.ceil(Math.max(0, eyeZ) / 15)));
  const bandRadii = [profile.closeVisibleRadiusM, 90, 160, profile.vistaVisibleRadiusM] as const;
  return bandRadii[band - 1];
}

function activeGrassTransitionProfile(
  profile: ProductionBladeFieldProfile,
  visibleRadiusM: number,
): BladeFieldTransitionProfile {
  const vista = profile.vistaTransitionDefaults;
  // This returns the zoom-scaled base transition. PhotorealBladeFieldLayer owns
  // the living-meadow far-density contract and normalizes the shared uniforms
  // with the production far reach, fan-out, and width lifts.
  // Scale the dense and far-soft anchors by the visible ring so near-tier detail
  // stays tied to eye height. The layer then extends the production far edge
  // and lower-far width over that base, which is what keeps mid-zoom foreground
  // coverage from falling back to scattered spikes.
  const scale = visibleRadiusM / Math.max(1, vista.farGrassStartM);
  const denseBladeEndM = Math.max(1, vista.denseBladeEndM * scale);
  const farGrassStartM = Math.max(1, vista.farGrassStartM * scale);
  const farGrassEndM = Math.max(2, vista.farGrassEndM * scale);
  const expandsNearTier = visibleRadiusM <= 90;
  const nearTierEndM = expandsNearTier ? denseBladeEndM : profile.lodNearRadiusM;
  const midTierEndM = expandsNearTier ? farGrassStartM : profile.lodMidRadiusM;
  return {
    denseBladeEndM,
    farGrassStartM,
    farGrassEndM,
    nearTierEndM,
    midTierEndM,
    farSoftWidthScale: vista.farSoftWidthScale,
    edgeSinkStartM: Math.max(1, (vista.edgeSinkStartM ?? vista.farGrassStartM) * scale),
  };
}

function snapToGrassFocusGrid(v: number): number {
  return (
    Math.floor(v / MEADOW_FOCUS_RING_SNAP_CELL_M + 1e-6) * MEADOW_FOCUS_RING_SNAP_CELL_M
  );
}

function scheduleNextFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => callback());
    return;
  }
  setTimeout(callback, 0);
}

/** BattleRenderer's expandedTerrainRect — the backdrop margin. */
function expandedTerrainRect([x, y, w, h]: [number, number, number, number]): [
  number,
  number,
  number,
  number,
] {
  const margin = Math.max(120, Math.max(w, h) * 0.22);
  return [x - margin, y - margin, w + margin * 2, h + margin * 2];
}
