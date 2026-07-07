// PhotorealBattleWorld — the FULL production battle world on the three.js
// WebGPU + TSL substrate (born slice 08a at parity; physically lit since
// slice 09: sun + IBL + ACES from CIVSIM_ENVIRONMENTS, neutral-albedo
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
import { buildBattleGroundMesh } from "../../../game-renderer/src/battle/groundPass";
import { buildBattleHorizonLayout } from "../../../game-renderer/src/battle/horizonPass";
import {
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
import {
  createLakePlaneMesh,
  createOceanPlaneMesh,
  createSeaDisplacementSource,
  type BattleLakeSurfaceSpec,
  type SeaDisplacementSourceId,
} from "./seaLayer";
import {
  PhotorealBladeFieldLayer,
  createBladeFieldTransitionUniforms,
  type BladeFieldTierSpec,
  type BladeFieldTransitionProfile,
  type BladeFieldTransitionUniforms,
} from "./bladeFieldLayer";
import { activeGrassRecordBudget } from "./grassBudget";
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
  // Dense blades follow the camera's ground position. The active transition is
  // scaled from this vista profile so blade thinning, blade sink, and terrain
  // far-grass rise share one owner at every zoom.
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
  // Records are sampled beyond the render ring so ordinary camera pans stay
  // inside an already-uploaded field. Rebuilds happen on this margin cadence,
  // not the old 8m sampler snap, which was the panning hitch source.
  rebuildMarginM: 48,
  fieldCellSize: 0.42,
  snapCellSize: 48,
  clumpCellSize: 1.55,
  maxRecords: 160000,
  minActiveRecords: 18000,
  // The lab close-gate profile that ratified the blade carpet accepts >12k
  // records in a 64m ring. Use that density for close/mid active rings instead
  // of deriving close density from the 528m vista sample.
  closeDensityReferenceRecords: 12000,
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

interface GrassSampleFocus {
  x: number;
  y: number;
  radius: number;
  maxRecords: number;
}

interface GrassSampleTask {
  key: string;
  focus: GrassSampleFocus;
  generation: number;
  sampler: GrassFieldSampler;
  startedAt: number;
  slices: number;
  maxSliceMs: number;
}

const GRASS_SAMPLE_SLICE_MS = 3.5;
const GRASS_SAMPLE_CELLS_PER_STEP = 512;

export class PhotorealBattleWorld {
  readonly world: PhotorealWorld;
  readonly camera = new THREE.PerspectiveCamera();
  private readonly environment: BattleEnvironment;
  private readonly grassProfile: ProductionBladeFieldProfile;
  private readonly frame: BattleFrameUniforms;
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
  private grassTerrainKey: string | null = null;
  private grassPendingTerrainKey: string | null = null;
  private grassSampleFocus: GrassSampleFocus | null = null;
  private grassSampleGeneration = 0;
  private grassSampleTask: GrassSampleTask | null = null;
  private grassSampleSliceScheduled = false;
  private grassSampleStats: GrassFieldStats | null = null;
  private grassRebuildStats: {
    strategy: "margin-raf-timesliced-swap";
    routeAnchor?: number[];
    focusRadiusM: number;
    rebuildMarginM: number;
    coverageRadiusM: number;
    activeTransition: BladeFieldTransitionProfile | null;
    activeRecordBudget: number;
    vistaRecordBudget: number;
    areaBudgetScale: number;
    activeFocus: GrassSampleFocus | null;
    pendingFocus: GrassSampleFocus | null;
    pending: boolean;
    rebuilds: number;
    skippedWithinMargin: number;
    coalescedRequests: number;
    lastSampleMs: number;
    lastSlices: number;
    lastMaxSliceMs: number;
    inProgressCells: number;
    totalCells: number;
  } = {
    strategy: "margin-raf-timesliced-swap",
    focusRadiusM: PRODUCTION_BLADE_FIELD_PROFILE.vistaVisibleRadiusM,
    rebuildMarginM: PRODUCTION_BLADE_FIELD_PROFILE.rebuildMarginM,
    coverageRadiusM:
      PRODUCTION_BLADE_FIELD_PROFILE.vistaVisibleRadiusM +
      PRODUCTION_BLADE_FIELD_PROFILE.rebuildMarginM,
    activeTransition: null as BladeFieldTransitionProfile | null,
    activeRecordBudget: PRODUCTION_BLADE_FIELD_PROFILE.maxRecords,
    vistaRecordBudget: PRODUCTION_BLADE_FIELD_PROFILE.maxRecords,
    areaBudgetScale: 1,
    activeFocus: null as GrassSampleFocus | null,
    pendingFocus: null as GrassSampleFocus | null,
    pending: false,
    rebuilds: 0,
    skippedWithinMargin: 0,
    coalescedRequests: 0,
    lastSampleMs: 0,
    lastSlices: 0,
    lastMaxSliceMs: 0,
    inProgressCells: 0,
    totalCells: 0,
  };
  private grassEnabled = true;
  private farGrassEnabled = true;
  private readonly grassTransition: BladeFieldTransitionUniforms;
  private activeGrassTransition: BladeFieldTransitionProfile;
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
    grassProfile: ProductionBladeFieldProfile,
  ) {
    this.world = world;
    this.environment = environment;
    this.grassProfile = grassProfile;
    this.sea = sea;
    this.grassRebuildStats.focusRadiusM = grassProfile.vistaVisibleRadiusM;
    this.grassRebuildStats.rebuildMarginM = grassProfile.rebuildMarginM;
    this.grassRebuildStats.coverageRadiusM =
      grassProfile.vistaVisibleRadiusM + grassProfile.rebuildMarginM;
    this.grassRebuildStats.vistaRecordBudget = grassProfile.maxRecords;
    this.grassRebuildStats.activeRecordBudget = grassProfile.maxRecords;
    this.grassRebuildStats.areaBudgetScale = 1;
    this.grassTransition = createBladeFieldTransitionUniforms(
      activeGrassTransitionProfile(grassProfile, grassProfile.vistaVisibleRadiusM),
    );
    this.activeGrassTransition = this.grassTransition.profile;
    this.frame = createBattleFrameUniforms();
    this.frame.time = world.uTime;
    const scene = world.scene;
    const env = this.environment;

    // Slice 09 — lighting core: sun DirectionalLight + ACES tonemap +
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

    this.background = new BattleBackgroundQuads(scene, this.frame);
    this.grass = new PhotorealBladeFieldLayer(
      scene,
      this.frame.time,
      this.grassProfile.tiers,
      true,
      this.grassTransition,
    );
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

    // Slice 15 — the post chain: one bloom stage over the whole scene pass, the
    // ONE tone-map applied at the tail. Threshold-disciplined (linear-HDR
    // luminance), so only the sky sun disc + the GGX sea glint spill; the
    // in-scene tactical overlays sit below threshold and the DOM HUD is outside
    // the canvas — neither blooms. ?post=off (lab A/B) bypasses the chain.
    this.post = new BattlePostChain(world.renderer, scene, this.camera);
    this.post.enabled = postEnabled;
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
      createPlaceholderSoldierMeshTiers([0.06, 0.1, 0.98]),
      vats,
      kit,
      shadowMode,
      postEnabled,
      grassProfile,
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
    const groundMesh = buildBattleGroundMesh(grid, field, this.groundCover);
    this.groundTriangles = groundMesh.triangles;
    this.ground = createGroundMesh(this.frame, groundMesh, {
      slopeBands: this.slopeBands,
      farGrass: this.grassTransition,
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
    this.grassTerrainKey = null;
    this.grassPendingTerrainKey = null;
    this.grassSampleFocus = null;
    this.grassSampleTask = null;
    this.grassSampleSliceScheduled = false;
    this.grassSampleGeneration++;
    this.grassRebuildStats.pending = false;
    this.grassRebuildStats.activeFocus = null;
    this.grassRebuildStats.pendingFocus = null;
    this.grassRebuildStats.inProgressCells = 0;
    this.grassRebuildStats.totalCells = 0;
    const terrainEye = eyePosition(this.lastCamera.camera3d);
    const terrainTarget = this.lastCamera.camera3d.target;
    this.updateGrassForCamera(terrainTarget[0], terrainTarget[1], terrainEye[2]);
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
  ): void {
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
    // Same anchor as the render path: the look target owns the focus. Two
    // callers with different anchors alternate sample keys every frame and
    // cancel each other's rebuild before it can finish.
    const uploadEye = eyePosition(this.lastCamera.camera3d);
    const uploadTarget = this.lastCamera.camera3d.target;
    this.updateGrassForCamera(uploadTarget[0], uploadTarget[1], uploadEye[2]);
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
    // ONE ground anchor owns both sampling and routing: the look target. A
    // footprint-centered sample puts most of the disc BEHIND a shallow-pitch
    // camera (at zoom 3 the eye grounds ~400m behind the frame) and the
    // routed target area starves at the disc rim. Eye height still selects
    // the band; the target owns where the disc lives.
    const eye = eyePosition(this.lastCamera.camera3d);
    const target = this.lastCamera.camera3d.target;
    this.updateGrassForCamera(target[0], target[1], eye[2]);
    if (this.grassEnabled)
      this.grass.routeGpu(this.world.renderer, [eye[0], eye[1], eye[2]], [
        target[0],
        target[1],
      ]);
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

  /** Focus-following blade-record window. The sampled disc carries a rebuild
   *  margin around the visible grass ring, so panning keeps routing the live
   *  GPU LOD from old records until the eye leaves that margin. */
  private updateGrassForCamera(focusX: number, focusY: number, eyeZ = 0): void {
    if (!this.grassEnabled) return;
    if (!this.terrainGrid || !this.heightField) return;
    const visibleRadius = activeGrassVisibleRadiusM(this.grassProfile, eyeZ);
    const transition = activeGrassTransitionProfile(this.grassProfile, visibleRadius);
    this.activeGrassTransition = this.grass.setTransition(transition);
    this.grassTransition.terrainDetailStrength.value = this.farGrassEnabled
      ? (this.activeGrassTransition.terrainDetailStrength ?? 1)
      : 0;
    // Camera-travel resampling scales with ZOOM and stays throttled (David's
    // renderer law): the higher the eye, the smaller blades project and the
    // wider the margin can stretch - a vista camera pans hundreds of metres
    // without a rebuild, a ground camera keeps the tight ring fresh.
    // Quantize the zoom-scaled margin to coarse steps: a continuous eyeZ
    // fed the rebuild KEY, so zooming churned a full grass rebuild every
    // frame (David's "still slow" report - the pan gate never zooms).
    const zoomScale = 1 + Math.round(Math.max(0, Math.min(3, eyeZ / 60 - 1)));
    const margin = this.grassProfile.rebuildMarginM * zoomScale;
    // Close zoom shrinks the ring (quantized bands, same churn rule): a low
    // eye sees a few dozen metres of ground - sampling the full far-grass
    // window there is pure rebuild cost and blade overdraw (the zoom-24/28
    // fps cliffs).
    // Sample to the ACTIVE blur-band end, not just the dense ring - the
    // 260-480m far band needs records to exist.
    const radius = transition.farGrassEndM + margin;
    const budget = activeGrassRecordBudget(this.grassProfile, radius);
    this.grassRebuildStats.coverageRadiusM = radius;
    this.grassRebuildStats.activeTransition = this.activeGrassTransition;
    this.grassRebuildStats.activeRecordBudget = budget.maxRecords;
    this.grassRebuildStats.areaBudgetScale = budget.areaScale;
    // The snap step scales DOWN with the ring: 48m stability cells suit the
    // 480m vista disc, but on a ~122m close ring a whole cell is a third of
    // the radius - the disc must track the target much closer.
    const step = Math.min(this.grassProfile.snapCellSize, Math.max(8, radius / 8));
    const focus = {
      x: snapGrassFocus(focusX, step),
      y: snapGrassFocus(focusY, step),
      radius,
      maxRecords: budget.maxRecords,
    };
    const key = this.grassSampleKey(focus);
    if (
      this.grassSampleFocus &&
      this.grassTerrainKey &&
      Math.hypot(focusX - this.grassSampleFocus.x, focusY - this.grassSampleFocus.y) <= margin &&
      key === this.grassTerrainKey
    ) {
      this.grassRebuildStats.skippedWithinMargin++;
      return;
    }
    if (key === this.grassTerrainKey || key === this.grassPendingTerrainKey) return;
    this.grassPendingTerrainKey = key;
    this.startGrassSampleTask(focus, key);
  }

  private grassSampleKey(focus: GrassSampleFocus): string {
    if (!this.terrainGrid) return "";
    return [
      this.terrainGrid.w,
      this.terrainGrid.h,
      this.terrainGrid.cell,
      this.terrainGrid.ox,
      this.terrainGrid.oy,
      this.groundCover,
      this.grassProfile.source,
      this.grassProfile.fieldCellSize,
      focus.maxRecords,
      Math.round(focus.x),
      Math.round(focus.y),
      focus.radius,
    ].join(":");
  }

  private startGrassSampleTask(focus: GrassSampleFocus, key: string): void {
    if (!this.terrainGrid || !this.heightField) return;
    if (this.grassSampleTask) this.grassRebuildStats.coalescedRequests++;
    const generation = ++this.grassSampleGeneration;
    const sampler = createGrassFieldSampler(this.terrainGrid, this.heightField, {
      seed: this.grassProfile.seed,
      focus,
      fieldCellSize: this.grassProfile.fieldCellSize,
      // Snap the disc on the SAME ring-scaled grid the focus was snapped to
      // (updateGrassForCamera). Passing the coarse 48 m profile cell here made
      // the sampler re-snap the already-snapped focus onto a wider grid,
      // displacing the close-ring record disc ~30 m off the look target and
      // starving the near tier (the bald ground-level frame).
      snapCellSize: Math.min(this.grassProfile.snapCellSize, Math.max(8, focus.radius / 8)),
      clumpCellSize: this.grassProfile.clumpCellSize,
      maxRecords: focus.maxRecords,
      lodStratifiedBudget: this.grassProfile.lodStratifiedBudget,
      density: this.grassProfile.density,
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
    this.grassSampleTask = {
      key,
      focus,
      generation,
      sampler,
      startedAt: performance.now(),
      slices: 0,
      maxSliceMs: 0,
    };
    this.grassRebuildStats.pending = true;
    this.grassRebuildStats.pendingFocus = focus;
    this.grassRebuildStats.inProgressCells = 0;
    this.grassRebuildStats.totalCells = sampler.totalCells;
    // The FIRST build (no live records yet) completes synchronously - an
    // empty field on the opening frame is worse than load-time cost, and
    // scenes read grass stats right after boot. Only REbuilds are sliced.
    if (this.grassTerrainKey === null) {
      while (!sampler.step(16384)) {
        /* run to completion */
      }
      this.runGrassSampleSlice();
      return;
    }
    this.scheduleGrassSampleSlice();
  }

  private scheduleGrassSampleSlice(): void {
    if (this.grassSampleSliceScheduled) return;
    this.grassSampleSliceScheduled = true;
    scheduleGrassSampleFrame(() => {
      this.grassSampleSliceScheduled = false;
      this.runGrassSampleSlice();
    });
  }

  private runGrassSampleSlice(): void {
    const task = this.grassSampleTask;
    if (!task || task.generation !== this.grassSampleGeneration) return;
    const sliceStarted = performance.now();
    let done = false;
    do {
      done = task.sampler.step(GRASS_SAMPLE_CELLS_PER_STEP);
    } while (!done && performance.now() - sliceStarted < GRASS_SAMPLE_SLICE_MS);
    const sliceMs = performance.now() - sliceStarted;
    task.slices++;
    task.maxSliceMs = Math.max(task.maxSliceMs, sliceMs);
    this.grassRebuildStats.inProgressCells = task.sampler.cellsProcessed;
    this.grassRebuildStats.totalCells = task.sampler.totalCells;
    if (!done) {
      this.scheduleGrassSampleSlice();
      return;
    }
    const snapshot = task.sampler.finish();
    if (!snapshot) {
      this.grassSampleTask = null;
      this.grassPendingTerrainKey = null;
      this.grassRebuildStats.pending = false;
      this.grassRebuildStats.pendingFocus = null;
      return;
    }
    const sampleMs = performance.now() - task.startedAt;
    this.grassSampleStats = snapshot.stats;
    this.grass.applyPackedRecords(
      snapshot.packedRecords,
      this.grassEnabled && snapshot.stats.acceptedRecords > 0,
    );
    this.grassTerrainKey = task.key;
    this.grassPendingTerrainKey = null;
    this.grassSampleFocus = task.focus;
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
    await this.world.settlePresentedFrame();
  }

  dispose(): void {
    this.shadowRig.dispose();
    this.world.dispose();
  }
}

/** setTerrain can rebuild a battle world in place (restarts); release both
 *  sides of the swapped meshes. */
function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const material = mesh.material;
  if (Array.isArray(material)) material.forEach((m) => m.dispose());
  else material.dispose();
}

function snapGrassFocus(value: number, step: number): number {
  // ROUND, never floor: a floored 48m grid displaces the disc up to ~34m per
  // axis, and at the close ring (r~122m) that pushed the stratified record
  // concentration ~60m off the look target - a bald frame at ground level
  // with all records "far". Rounding halves the worst error and keeps the
  // key-stability contract (same cell -> same key).
  return Math.round(value / step) * step;
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
  // The blade coverage EDGE (farGrassEndM) tracks the visible ring, and the
  // blur EXTENSION past it collapses to zero as the eye drops. At the vista the
  // ring sees far, so blades extend well past it (260 ring -> 480 edge); at a
  // ground-level eye you cannot resolve grass tens of metres out, so the carpet
  // ends AT the ring (40 ring -> 40 edge) and the khaki ground term takes over
  // past it. Anchoring the START on the ring (the old rule) instead stretched
  // the edge to ~74 m at max zoom, leaving blades where the checks expect bare
  // canopy and pushing the far-grass probe band off the bottom of the frame.
  // Scale by the VISIBLE ring against its vista-scale anchor (farGrassStartM
  // = where thinning begins = the ring); the blur band extends proportionally
  // past it (vista: 260 ring -> 480 blur end; low eye: 40 -> ~74). The battle
  // camera foreground sits tens of metres out even at high zoom, so the blade
  // carpet must reach past the ring - shrinking farGrassEndM to the ring blanks
  // the mid-zoom foreground (production-mid-grass).
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

function scheduleGrassSampleFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => callback());
    return;
  }
  setTimeout(callback, 16);
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
