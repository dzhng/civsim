import {
  eyePosition,
  viewMatrix,
  projMatrix,
  projectionFootprint,
  projectedSpanPixels,
  type Camera3DParams,
} from "../../../renderer-core/src/camera3d";
import {
  GRASS_FIELD_PACKED_STRIDE_FLOATS,
  createGrassFieldSampler,
  type GrassFieldCellRange,
  type GrassFieldStats,
} from "./grassField";
import { GrassFocusTileField, type GrassRecordEdit } from "./grassFocusTiles";
import { GRASS_COVERAGE_MARGIN_M, type GrassRouteMask } from "./grassCoverage";
import { hashPackedRecords } from "./bladeFieldRecordHash";
import type { BattleGroundCover, BattleTerrainGrid } from "./terrainFeatures";
import type { TerrainHeightField } from "../terrain/heightField";
import {
  transitionSnapshot,
  transitionProfileForTiers,
  LIVING_MEADOW_FAR_DENSITY_PROFILE,
  type BladeFieldTransition,
  type BladeFieldTierSpec,
  type BladeFieldTransitionProfile,
} from "./bladeFieldPolicy";

export interface GrassResidencyLayer {
  /** Bumps only when `records` must be re-read whole: a different buffer, or a
   *  loading settle that published more ranges than it kept. Camera motion
   *  never bumps it, so no camera gesture is a whole-buffer upload. */
  revision: number;
  /** For the focus ring this is one persistent capacity buffer, mutated in
   *  place; only `[0, recordCount)` is live. */
  records: Float32Array | null;
  recordCount: number;
  /** Records a consumer must be able to address: the focus ring's edit ranges
   *  reach past the live prefix, so GPU storage is sized from this. */
  recordCapacity: number;
  /** Identity of the live range. The focus ring's is a resident-tile-set hash,
   *  so it does not depend on the order tiles happened to land in slots. */
  recordHash: string;
  /** Bumps once per publication step. */
  editSerial: number;
  /** Ranges written since the consumer last took them, bounded by one step.
   *  Read here; take them with `takeRingEdits` when they will be uploaded. */
  edits: readonly GrassRecordEdit[];
  visible: boolean;
  /** Which half of the ground this layer owns. Base and ring carry the same
   *  coverage with opposite senses, so together they partition it exactly. */
  mask: GrassRouteMask | null;
}
export interface GrassResidencySchedule {
  now(): number;
  schedule(callback: () => void): void;
}
const frameSchedule: GrassResidencySchedule = {
  now: () => performance.now(),
  schedule: (callback) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(callback);
    else setTimeout(callback, 0);
  },
};

export type BattleGrassQuality = "low" | "standard" | "fine";

export interface BladeFieldProfile {
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
  vistaVisibleRadiusM: 260,
  vistaTransitionDefaults: {
    edgeSinkStartM: 380,
    denseBladeEndM: 143,
    farGrassStartM: 260,
    farGrassEndM: 480,
    farSoftWidthScale: 1.6,
  } satisfies BladeFieldTransitionProfile,
  closeVisibleRadiusM: 40,
  rebuildMarginM: 48,
  fieldCellSize: 0.42,
  snapCellSize: 48,
  clumpCellSize: 1.55,
  maxRecords: 160000,
  minActiveRecords: 18000,
  closeDensityReferenceRecords: 42000,
  closeDensityReferenceRadiusM: 64,
  lodStratifiedBudget: true,
  density: 1.0,
  jitter: 0.72,
  minNormalZ: 0.45,
  lodNearRadiusM: 5,
  lodMidRadiusM: 20,
  // Height jitter and clump shaping keep the tallest tips below a standing knee (~0.5 m).
  baseHeight: 0.26,
  heightJitter: 0.62,
  baseWidth: 0.004,
  widthJitter: 0.2,
  baseBend: 0.62,
  bendJitter: 0.45,
  // Knee-height blades need few curve segments; retain the midpoint for canopy coverage.
  tiers: [
    { id: "near", lodTier: 0, segments: 4, minDistanceM: 0, maxDistanceM: 5 },
    { id: "mid", lodTier: 1, segments: 2, minDistanceM: 5, maxDistanceM: 20 },
    { id: "far", lodTier: 2, segments: 2, minDistanceM: 20, maxDistanceM: 480 },
  ],
} as const satisfies BladeFieldProfile;

const PRODUCTION_BLADE_FIELD_PROFILES: Record<BattleGrassQuality, BladeFieldProfile> = {
  low: {
    ...STANDARD_BLADE_FIELD_PROFILE,
    quality: "low",
    source: "GRASSFINE-L2D8 low profile: 160k budget, fine near blades, low-segment mid tier",
    vistaTransitionDefaults: {
      ...STANDARD_BLADE_FIELD_PROFILE.vistaTransitionDefaults,
      farSoftWidthScale: 2.3,
    },
    fieldCellSize: 0.5,
    maxRecords: 160000,
    minActiveRecords: 12000,
    closeDensityReferenceRecords: 9000,
    heightJitter: 0.5,
    widthJitter: 0.2,
    baseBend: 0.45,
    bendJitter: 0.35,
    tiers: [
      { id: "near", lodTier: 0, segments: 3, minDistanceM: 0, maxDistanceM: 5 },
      { id: "mid", lodTier: 1, segments: 2, minDistanceM: 5, maxDistanceM: 20 },
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
    widthJitter: 0.16,
    tiers: [
      { id: "near", lodTier: 0, segments: 15, minDistanceM: 0, maxDistanceM: 5 },
      { id: "mid", lodTier: 1, segments: 6, minDistanceM: 5, maxDistanceM: 20 },
      { id: "far", lodTier: 2, segments: 2, minDistanceM: 20, maxDistanceM: 480 },
    ],
  },
};

const STATIC_GRASS_FIELD_CELL_M = 1.5;
const STATIC_GRASS_MAX_RECORDS = 1_000_000;
const MEADOW_FOCUS_RING_RADIUS_M = 300;
const MEADOW_FOCUS_RING_SNAP_CELL_M = 48;
const MEADOW_FOCUS_RING_FIELD_CELL_M = 0.6;
const MEADOW_FOCUS_RING_DEDUPE_MARGIN_M = 20;
/** Radius of the coverage the focus field samples around its snapped centre. */
const MEADOW_FOCUS_RING_COVER_RADIUS_M =
  MEADOW_FOCUS_RING_RADIUS_M - MEADOW_FOCUS_RING_DEDUPE_MARGIN_M;
/** Residency granularity. 24 m divides the 48 m focus snap and the 0.6 m field
 *  cell, so a tile is exactly 40x40 cells and adjacent tiles partition the
 *  world. Smaller tiles track the cover circle more tightly and shrink every
 *  per-frame bound; larger ones waste records on the rim. */
const MEADOW_FOCUS_TILE_M = 24;
/** Retained slot ceiling: 640 x 1600 records x 64 B = 65.5 MB, and above the
 *  616-tile worst case of one cover circle plus a 48 m step. */
const MEADOW_FOCUS_TILE_SLOTS = 640;
/** How far past a snap boundary the camera must travel before the request
 *  follows it, so hovering on the boundary cannot thrash the two circles. */
const MEADOW_FOCUS_SNAP_DEADBAND_M = 12;
/** Tiles copied, hashed and uploaded per publication step. */
const MEADOW_FOCUS_TILE_PUBLISH_PER_STEP = 8;
const MEADOW_RING_MIN_PIXELS = 1.5;
const MEADOW_RING_RELEASE_PIXELS = 1;
const GRASS_SAMPLE_SLICE_CELLS = 16384;
const GRASS_SAMPLE_SLICE_BUDGET_MS = 4;
const GRASS_MIN_PIXELS = 0.5;
const NO_RECORD_EDITS: readonly GrassRecordEdit[] = [];

interface GrassSampleFocus {
  x: number;
  y: number;
  radius: number;
  maxRecords: number;
}

/** The snapped centre of a focus generation. Its coverage is a tile set, not a
 *  sampler disc, so it carries no capacity of its own. */
interface GrassFocusCenter {
  x: number;
  y: number;
}

export interface GrassRebuildStats {
  strategy: "static-whole-map+camera-focus-tiles";
  activeRecordBudget: number;
  vistaRecordBudget: number;
  areaBudgetScale: number;
  pending: boolean;
  rebuilds: number;
  lastSampleMs: number;
  lastSlices: number;
  lastMaxSliceMs: number;
  /** Bumps per coalesced camera demand; `activeGeneration` trails it until the
   *  cover circle is entirely resident. */
  requestedGeneration: number;
  activeGeneration: number;
  pendingAgeMs: number;
  requiredTiles: number;
  residentTiles: number;
  missingTiles: number;
  /** Fixed work bounds, so a reader can check the per-step ceiling directly. */
  publishTilesPerStep: number;
  tileSlotRecords: number;
  tileCells: number;
  slotCapacity: number;
  retainedRecordBytes: number;
  /** Actual work, separated from work thrown away. */
  sampledTiles: number;
  sampledCells: number;
  publishedRecords: number;
  publishedBytes: number;
  evictedTiles: number;
  cancelledTiles: number;
  cancelledCells: number;
  /** Published circles dropped because retaining them alongside the requested
   *  circle no longer fit in the slot ceiling. */
  retiredFocusGenerations: number;
  /** Edge of the tile both route passes quantise the coverage test to, so a
   *  reader can confirm the base field's hole and the focus field's grass are
   *  the same shape rather than a circle and a staircase. */
  coverageTileM: number;
  /** Radius of the coverage handed to the route passes. */
  coverageRadiusM: number;
  /** Radius the tiles were sampled at. Strictly larger, so every tile the GPU
   *  claims for the focus field was sampled. */
  coverageSampledRadiusM: number;
  /** Resident tiles backing the published coverage. */
  publishedCoverageTiles: number;
  /** Every tile the published dedupe circle culls the base field inside is
   *  resident. False here would mean a hole in the ground. */
  activeCoverageResident: boolean;
}

interface GrassRebuildState extends GrassRebuildStats {
  activeFocus: GrassFocusCenter | null;
  pendingFocus: GrassFocusCenter | null;
}

export interface GrassResidencyStats {
  productionSamplingProfile: BladeFieldProfile;
  transitionOwner: "battleGrassResidency.update";
  activeTransition: BladeFieldTransitionProfile;
  sample: GrassFieldStats | null;
  rebuild: GrassRebuildStats;
  detail: {
    bladePixels: number;
    baseMinPixels: number;
    ringMinPixels: number;
    ringReleasePixels: number;
    focusRingActive: boolean;
  };
}

interface BattleGrassView {
  x: number;
  y: number;
  bladePixels: number;
  eyeZ: number;
}

export class BattleGrassResidency {
  private baseMask: GrassRouteMask | null = null;
  private ringMask: GrassRouteMask | null = null;
  private baseVisible = false;
  private ringVisible = false;
  private baseRevision = 0;
  private ringRevision = 0;
  private wedge: ReturnType<typeof grassRouteCullWedgeForCamera> | null = null;
  private terrainGrid: BattleTerrainGrid | null = null;
  private heightField: TerrainHeightField | null = null;
  private groundCover: BattleGroundCover = "green-grass";
  private terrainRect: [number, number, number, number] = [-220, -180, 440, 360];
  private baseTerrainKey: string | null = null;
  private baseRecords: Float32Array | null = null;
  private baseRecordHash = "00000000";
  private baseSampleStats: GrassFieldStats | null = null;
  private focusTiles: GrassFocusTileField | null = null;
  private focusRequest: GrassFocusCenter | null = null;
  private activeRadiusM = 0;
  private activeCoverKeys: ReadonlySet<number> = new Set();
  private sampleScheduled = false;
  private requestedAt = 0;
  private sampleStats: GrassFieldStats | null = null;
  private enabled = true;
  private focusRingEngaged = false;
  private farEnabled = true;
  private activeTransition: Readonly<BladeFieldTransition>;
  private view: BattleGrassView | null = null;
  private rebuild: GrassRebuildState;

  constructor(
    private readonly profile: BladeFieldProfile,
    initialTransition: BladeFieldTransitionProfile,
    private readonly changed: () => void = () => {},
    private readonly clock: GrassResidencySchedule = frameSchedule,
  ) {
    this.activeTransition = transitionSnapshot(
      transitionProfileForTiers(
        profile.tiers,
        initialTransition,
        LIVING_MEADOW_FAR_DENSITY_PROFILE,
      ),
    );
    this.rebuild = {
      strategy: "static-whole-map+camera-focus-tiles",
      activeRecordBudget: profile.maxRecords,
      vistaRecordBudget: profile.maxRecords,
      areaBudgetScale: 1,
      pending: false,
      rebuilds: 0,
      lastSampleMs: 0,
      lastSlices: 0,
      lastMaxSliceMs: 0,
      requestedGeneration: 0,
      activeGeneration: 0,
      pendingAgeMs: 0,
      requiredTiles: 0,
      residentTiles: 0,
      missingTiles: 0,
      publishTilesPerStep: MEADOW_FOCUS_TILE_PUBLISH_PER_STEP,
      tileSlotRecords: 0,
      tileCells: 0,
      slotCapacity: 0,
      retainedRecordBytes: 0,
      sampledTiles: 0,
      sampledCells: 0,
      publishedRecords: 0,
      publishedBytes: 0,
      evictedTiles: 0,
      cancelledTiles: 0,
      cancelledCells: 0,
      retiredFocusGenerations: 0,
      coverageTileM: MEADOW_FOCUS_TILE_M,
      coverageRadiusM: this.activeRadiusM,
      coverageSampledRadiusM: this.activeRadiusM + GRASS_COVERAGE_MARGIN_M / 2,
      publishedCoverageTiles: 0,
      activeCoverageResident: true,
      activeFocus: null,
      pendingFocus: null,
    };
  }

  setTerrain(grid: BattleTerrainGrid, field: TerrainHeightField, cover: BattleGroundCover): void {
    this.terrainGrid = grid;
    this.heightField = field;
    this.groundCover = cover;
    this.terrainRect = [grid.ox, grid.oy, grid.w * grid.cell, grid.h * grid.cell];
    this.baseTerrainKey = null;
    this.baseRecords = null;
    this.baseRecordHash = "00000000";
    this.baseSampleStats = null;
    this.sampleStats = null;
    // The capacity buffer, its GPU mirror and the shared materials are all
    // built with the terrain, so no zoom gesture pays for a large allocation.
    this.focusTiles = this.createFocusTiles();
    this.focusRequest = null;
    this.activeCoverKeys = new Set();
    this.sampleScheduled = false;
    this.rebuild.pending = false;
    this.rebuild.activeFocus = null;
    this.activeRadiusM = 0;
    this.rebuild.pendingFocus = null;
    this.rebuild.activeGeneration = 0;
    this.baseVisible = false;
    this.ringVisible = false;
    this.baseRevision++;
    this.ringRevision++;
    this.changed();
  }

  update(camera: Camera3DParams, viewportHeight: number): void {
    const projection = projectionFootprint(
      viewMatrix(camera),
      projMatrix(camera),
      viewportHeight,
      camera.near,
    );
    const view: BattleGrassView = {
      x: camera.target[0],
      y: camera.target[1],
      eyeZ: eyePosition(camera)[2],
      bladePixels: projectedSpanPixels(projection, ...camera.target, this.profile.baseHeight),
    };
    this.view = view;
    if (!this.enabled || !this.terrainGrid || !this.heightField) return;
    const visibleRadius = activeGrassVisibleRadiusM(this.profile, view.eyeZ);
    const transition = activeGrassTransitionProfile(this.profile, visibleRadius);
    this.activeTransition = transitionSnapshot(
      transitionProfileForTiers(this.profile.tiers, transition, LIVING_MEADOW_FAR_DENSITY_PROFILE),
    );
    this.ensureBaseRecords();
    const focusRingActive = this.updateFocusRingDetailGate();
    const focusRecordCapacity = this.focusTiles
      ? this.focusTiles.slotCapacity * this.focusTiles.slotRecords
      : 0;
    this.rebuild.activeRecordBudget = focusRingActive
      ? STATIC_GRASS_MAX_RECORDS + focusRecordCapacity
      : STATIC_GRASS_MAX_RECORDS;
    this.sampleStats = focusRingActive
      ? (this.focusTiles?.sampleStats() ?? this.baseSampleStats)
      : this.baseSampleStats;
    this.updateRoutingState();

    if (!focusRingActive) {
      this.focusTiles?.clearRequest();
      this.focusRequest = null;
      this.rebuild.pending = false;
      this.rebuild.pendingFocus = null;
      this.sampleStats = this.baseSampleStats;
      return;
    }

    const tiles = this.focusTiles;
    if (!tiles) return;
    const focus = this.focusRingForCamera(view.x, view.y);
    if (!this.focusRequest || this.focusRequest.x !== focus.x || this.focusRequest.y !== focus.y) {
      // Coalesce to the latest demand. Resident tiles satisfy it immediately and
      // the tile in flight only restarts if the new circle no longer wants it,
      // so travel re-sorts the request instead of replaying its prefix.
      this.focusRequest = focus;
      this.requestedAt = this.clock.now();
      this.rebuild.lastSlices = 0;
      this.rebuild.lastMaxSliceMs = 0;
      tiles.request(focus.x, focus.y, MEADOW_FOCUS_RING_COVER_RADIUS_M);
      this.rebuild.requestedGeneration += 1;
      this.rebuild.pendingFocus = focus;
      this.admitCoveredFocus();
      this.updateRoutingState();
    }
    this.rebuild.pending = tiles.pending;
    this.scheduleSampleSlice();
  }

  prepareRender(camera: Camera3DParams, viewportHeight: number): void {
    this.update(camera, viewportHeight);
    this.wedge = this.ringVisibleNow()
      ? grassRouteCullWedgeForCamera(camera, MEADOW_FOCUS_RING_RADIUS_M)
      : null;
    this.updateRoutingState();
  }

  setFarVisible(visible: boolean): void {
    this.farEnabled = visible;
    this.changed();
  }

  setVisible(visible: boolean): void {
    this.enabled = visible;
    this.updateRoutingState();
    if (visible) return;
    // Resident tiles stay: they are the cache a re-engaged camera reuses.
    this.focusTiles?.clearRequest();
    this.focusRequest = null;
    this.rebuild.pending = false;
    this.rebuild.pendingFocus = null;
  }

  stats(): GrassResidencyStats {
    const tiles = this.focusTiles;
    const rebuild: GrassRebuildStats = {
      strategy: this.rebuild.strategy,
      activeRecordBudget: this.rebuild.activeRecordBudget,
      vistaRecordBudget: this.rebuild.vistaRecordBudget,
      areaBudgetScale: this.rebuild.areaBudgetScale,
      pending: this.rebuild.pending,
      rebuilds: this.rebuild.rebuilds,
      lastSampleMs: this.rebuild.lastSampleMs,
      lastSlices: this.rebuild.lastSlices,
      lastMaxSliceMs: this.rebuild.lastMaxSliceMs,
      requestedGeneration: this.rebuild.requestedGeneration,
      activeGeneration: this.rebuild.activeGeneration,
      pendingAgeMs: this.rebuild.pending
        ? Number((this.clock.now() - this.requestedAt).toFixed(3))
        : 0,
      requiredTiles: tiles?.requiredTiles ?? 0,
      residentTiles: tiles?.residentTiles ?? 0,
      missingTiles: tiles?.missingTiles ?? 0,
      publishTilesPerStep: MEADOW_FOCUS_TILE_PUBLISH_PER_STEP,
      tileSlotRecords: tiles?.slotRecords ?? 0,
      tileCells: tiles?.tileCells ?? 0,
      slotCapacity: tiles?.slotCapacity ?? 0,
      retainedRecordBytes: tiles?.records.byteLength ?? 0,
      sampledTiles: tiles?.sampledTiles ?? 0,
      sampledCells: tiles?.sampledCells ?? 0,
      publishedRecords: tiles?.publishedRecords ?? 0,
      publishedBytes: (tiles?.publishedRecords ?? 0) * 64,
      evictedTiles: tiles?.evictedTiles ?? 0,
      cancelledTiles: tiles?.cancelledTiles ?? 0,
      cancelledCells: tiles?.cancelledCells ?? 0,
      retiredFocusGenerations: this.rebuild.retiredFocusGenerations,
      coverageTileM: MEADOW_FOCUS_TILE_M,
      coverageRadiusM: this.activeRadiusM,
      coverageSampledRadiusM: this.activeRadiusM + GRASS_COVERAGE_MARGIN_M / 2,
      publishedCoverageTiles: this.baseMask ? this.activeCoverKeys.size : 0,
      activeCoverageResident:
        this.rebuild.activeFocus === null || (tiles?.hasAll(this.activeCoverKeys) ?? false),
    };
    return {
      productionSamplingProfile: this.profile,
      detail: {
        bladePixels: this.view?.bladePixels ?? 0,
        baseMinPixels: GRASS_MIN_PIXELS,
        ringMinPixels: MEADOW_RING_MIN_PIXELS,
        ringReleasePixels: MEADOW_RING_RELEASE_PIXELS,
        focusRingActive: this.focusRingEngaged,
      },
      transitionOwner: "battleGrassResidency.update",
      activeTransition: this.activeTransition,
      sample: this.sampleStats,
      rebuild,
    };
  }

  /** Loading-only: drive the same bounded publication steps to completion. */
  settle(): void {
    const tiles = this.focusTiles;
    if (!tiles || !this.enabled || !this.focusRingEngaged) return;
    const started = this.clock.now();
    // Admitting a focus retires the previous circle's tiles, which is itself
    // publication work; settle until both have drained.
    let dropped = false;
    for (let pass = 0; pass < 4 && tiles.pending; pass++) {
      dropped = tiles.settle(() => this.clock.now()) || dropped;
      this.sampleStats = tiles.sampleStats() ?? this.baseSampleStats;
      this.admitCoveredFocus();
    }
    // Settling discarded the ranges it published, so the consumer re-reads the
    // live range whole. This is the only path that asks for that, and it only
    // asks when it actually dropped something.
    if (dropped) this.ringRevision++;
    this.rebuild.lastSampleMs = Number((this.clock.now() - started).toFixed(3));
    this.updateRoutingState();
    this.rebuild.pending = tiles.pending;
  }

  dispose(): void {
    this.baseRecords = null;
    this.focusTiles?.dispose();
    this.focusTiles = null;
    this.focusRequest = null;
    this.rebuild.activeFocus = null;
    this.activeRadiusM = 0;
    this.activeCoverKeys = new Set();
    this.baseMask = null;
    this.ringMask = null;
    this.baseVisible = false;
    this.ringVisible = false;
  }

  private visibleNow(): boolean {
    return this.enabled && (this.view?.bladePixels ?? 0) >= GRASS_MIN_PIXELS;
  }

  /** The focus field draws only published coverage, so with no admitted focus
   *  it draws nothing and the base field owns the whole ground. */
  private ringVisibleNow(): boolean {
    return (
      this.visibleNow() &&
      this.focusRingEngaged &&
      this.rebuild.activeFocus !== null &&
      (this.focusTiles?.recordCount ?? 0) > 0
    );
  }

  private updateFocusRingDetailGate(): boolean {
    const pixels = this.view?.bladePixels ?? 0;
    this.focusRingEngaged = this.focusRingEngaged
      ? pixels >= MEADOW_RING_RELEASE_PIXELS
      : pixels >= MEADOW_RING_MIN_PIXELS;
    return this.focusRingEngaged;
  }

  private baseFocus(): GrassSampleFocus {
    const [ox, oy, w, h] = this.terrainRect;
    return {
      x: ox + w / 2,
      y: oy + h / 2,
      radius: Math.hypot(w, h) / 2,
      maxRecords: STATIC_GRASS_MAX_RECORDS,
    };
  }

  private focusRingForCamera(x: number, y: number): GrassFocusCenter {
    const current = this.focusRequest;
    // A camera hovering on a snap boundary must not flip the request every
    // frame: each flip retires the other circle's tiles and re-samples them.
    if (
      current &&
      Math.max(
        Math.abs(x - (current.x + MEADOW_FOCUS_RING_SNAP_CELL_M / 2)),
        Math.abs(y - (current.y + MEADOW_FOCUS_RING_SNAP_CELL_M / 2)),
      ) <
        MEADOW_FOCUS_RING_SNAP_CELL_M / 2 + MEADOW_FOCUS_SNAP_DEADBAND_M
    ) {
      return current;
    }
    return { x: snapToGrassFocusGrid(x), y: snapToGrassFocusGrid(y) };
  }

  private sampleKey(kind: "base", focus: GrassSampleFocus): string {
    if (!this.terrainGrid) return "";
    const fieldCellSize = STATIC_GRASS_FIELD_CELL_M;
    return [
      kind,
      this.terrainGrid.w,
      this.terrainGrid.h,
      this.terrainGrid.cell,
      this.terrainGrid.ox,
      this.terrainGrid.oy,
      this.groundCover,
      this.profile.source,
      fieldCellSize,
      this.profile.baseWidth,
      focus.maxRecords,
      Math.round(focus.x),
      Math.round(focus.y),
      focus.radius,
    ].join(":");
  }

  private ensureBaseRecords(): void {
    if (!this.terrainGrid || !this.heightField) return;
    const focus = this.baseFocus();
    const key = this.sampleKey("base", focus);
    if (key === this.baseTerrainKey && this.baseRecords) return;
    const sampler = createGrassFieldSampler(this.terrainGrid, this.heightField, {
      seed: this.profile.seed,
      focus,
      fieldCellSize: STATIC_GRASS_FIELD_CELL_M,
      snapCellSize: this.profile.snapCellSize,
      clumpCellSize: this.profile.clumpCellSize,
      maxRecords: focus.maxRecords,
      lodStratifiedBudget: false,
      density: 1,
      jitter: this.profile.jitter,
      minNormalZ: this.profile.minNormalZ,
      lodNearRadius: this.profile.lodNearRadiusM / focus.radius,
      lodMidRadius: this.profile.lodMidRadiusM / focus.radius,
      baseHeight: this.profile.baseHeight,
      heightJitter: this.profile.heightJitter,
      baseWidth: this.profile.baseWidth,
      widthJitter: this.profile.widthJitter,
      baseBend: this.profile.baseBend,
      bendJitter: this.profile.bendJitter,
    });
    const started = this.clock.now();
    while (!sampler.step(GRASS_SAMPLE_SLICE_CELLS)) {
      // The whole-map base field is built once per terrain.
    }
    const snapshot = sampler.finish();
    if (!snapshot) return;
    this.baseTerrainKey = key;
    this.baseRecords = snapshot.packedRecords;
    this.baseRecordHash = hashPackedRecords(snapshot.packedRecords);
    this.baseSampleStats = snapshot.stats;
    this.sampleStats = this.focusTiles?.sampleStats() ?? this.baseSampleStats;
    this.rebuild.lastSampleMs = Number((this.clock.now() - started).toFixed(3));
    this.rebuild.lastSlices = 1;
    this.rebuild.lastMaxSliceMs = this.rebuild.lastSampleMs;
    this.baseRevision++;
    this.updateRoutingState();
  }

  /** One sampler per residency tile: the ring's parameters live here, the
   *  persistent store owns which tile is next and where it lands. */
  private createFocusTiles(): GrassFocusTileField | null {
    const grid = this.terrainGrid;
    const field = this.heightField;
    if (!grid || !field) return null;
    return new GrassFocusTileField({
      tileM: MEADOW_FOCUS_TILE_M,
      fieldCellSize: MEADOW_FOCUS_RING_FIELD_CELL_M,
      slotLimit: MEADOW_FOCUS_TILE_SLOTS,
      publishPerStep: MEADOW_FOCUS_TILE_PUBLISH_PER_STEP,
      terrainRect: this.terrainRect,
      sampleTile: (
        cells: GrassFieldCellRange,
        centerX: number,
        centerY: number,
        slotRecords: number,
      ) =>
        createGrassFieldSampler(grid, field, {
          seed: this.profile.seed,
          // Placement is cell-derived, so a tile sampled once stays valid for
          // every later focus. Only `lodTier` bands off this centre, and no
          // shader reads it.
          focus: { x: centerX, y: centerY, radius: MEADOW_FOCUS_RING_RADIUS_M },
          cells,
          fieldCellSize: MEADOW_FOCUS_RING_FIELD_CELL_M,
          snapCellSize: MEADOW_FOCUS_RING_FIELD_CELL_M,
          clumpCellSize: this.profile.clumpCellSize,
          maxRecords: slotRecords,
          lodStratifiedBudget: false,
          density: 1,
          jitter: this.profile.jitter,
          minNormalZ: this.profile.minNormalZ,
          lodNearRadius: this.profile.lodNearRadiusM / MEADOW_FOCUS_RING_RADIUS_M,
          lodMidRadius: this.profile.lodMidRadiusM / MEADOW_FOCUS_RING_RADIUS_M,
          baseHeight: this.profile.baseHeight,
          heightJitter: this.profile.heightJitter,
          baseWidth: this.profile.baseWidth,
          widthJitter: this.profile.widthJitter,
          baseBend: this.profile.baseBend,
          bendJitter: this.profile.bendJitter,
        }),
      releaseProtection: () => this.retireActiveFocus(),
    });
  }

  /**
   * Take the ranges a consumer is about to upload. Publication is held to one
   * unconsumed step, so this is also what lets the next one run: the per-step
   * bound and the per-render bound are the same number only because the
   * consumer, not the scheduler, decides when the next step may happen.
   */
  takeRingEdits(): readonly GrassRecordEdit[] {
    const edits = this.focusTiles?.takeEdits() ?? NO_RECORD_EDITS;
    this.scheduleSampleSlice();
    return edits;
  }

  private scheduleSampleSlice(): void {
    const tiles = this.focusTiles;
    if (this.sampleScheduled || !tiles?.pending || tiles.edits.length > 0) return;
    this.sampleScheduled = true;
    this.clock.schedule(() => this.runSampleSlice());
  }

  private runSampleSlice(): void {
    this.sampleScheduled = false;
    const tiles = this.focusTiles;
    if (!tiles || !this.enabled || !this.focusRingEngaged) return;
    const started = this.clock.now();
    const serial = tiles.editSerial;
    const remaining = tiles.step(() => this.clock.now(), GRASS_SAMPLE_SLICE_BUDGET_MS);
    const sliceMs = this.clock.now() - started;
    this.rebuild.lastSlices += 1;
    this.rebuild.lastSampleMs = Number(sliceMs.toFixed(3));
    this.rebuild.lastMaxSliceMs = Math.max(this.rebuild.lastMaxSliceMs, Number(sliceMs.toFixed(3)));
    if (tiles.editSerial !== serial) this.onFocusTilesPublished();
    this.rebuild.pending = remaining;
    if (remaining) this.scheduleSampleSlice();
    else this.changed();
  }

  private onFocusTilesPublished(): void {
    this.sampleStats = this.focusTiles?.sampleStats() ?? this.baseSampleStats;
    this.admitCoveredFocus();
    this.updateRoutingState();
  }

  /** Publish the resident inner disc immediately, growing it as tiles arrive.
   * The previous disc remains protected until the new center has coverage. */
  private admitCoveredFocus(): void {
    const tiles = this.focusTiles;
    const focus = this.focusRequest;
    if (!tiles || !focus) return;
    if (tiles.requiredTiles === 0) {
      this.retireActiveFocus();
      this.rebuild.activeGeneration = this.rebuild.requestedGeneration;
      this.rebuild.pendingFocus = null;
      return;
    }
    const radius = tiles.residentRadius;
    if (radius <= 0) return;
    if (tiles.missingTiles === 0) {
      this.rebuild.activeGeneration = this.rebuild.requestedGeneration;
      this.rebuild.pendingFocus = null;
    }
    const active = this.rebuild.activeFocus;
    if (active && active.x === focus.x && active.y === focus.y && this.activeRadiusM === radius)
      return;
    this.rebuild.activeFocus = focus;
    this.activeRadiusM = radius;
    this.rebuild.rebuilds += 1;
    this.activeCoverKeys = tiles.coverKeys(focus.x, focus.y, radius + GRASS_COVERAGE_MARGIN_M / 2);
    tiles.protect(this.activeCoverKeys);
  }

  /** Retained slots can no longer hold both circles: drop the published
   *  coverage rather than evict tiles it still claims. The base field takes the
   *  whole ground back at base density; nothing goes bald. */
  private retireActiveFocus(): void {
    if (!this.rebuild.activeFocus) return;
    this.rebuild.activeFocus = null;
    this.activeRadiusM = 0;
    this.rebuild.retiredFocusGenerations += 1;
    this.activeCoverKeys = new Set();
    this.focusTiles?.protect(this.activeCoverKeys);
  }

  snapshot() {
    const ringVisible = this.ringVisible;
    return {
      base: {
        revision: this.baseRevision,
        records: this.baseRecords,
        recordCount: (this.baseRecords?.length ?? 0) / GRASS_FIELD_PACKED_STRIDE_FLOATS,
        recordCapacity: (this.baseRecords?.length ?? 0) / GRASS_FIELD_PACKED_STRIDE_FLOATS,
        recordHash: this.baseRecordHash,
        editSerial: this.baseRevision,
        edits: NO_RECORD_EDITS,
        visible: this.baseVisible,
        mask: this.baseMask,
      } satisfies GrassResidencyLayer,
      ring: {
        revision: this.ringRevision,
        records: this.focusTiles?.records ?? null,
        recordCount: this.focusTiles?.recordCount ?? 0,
        recordCapacity: this.focusTiles?.recordCapacity ?? 0,
        recordHash: this.focusTiles?.hash ?? "00000000",
        editSerial: this.focusTiles?.editSerial ?? 0,
        edits: this.focusTiles?.edits ?? NO_RECORD_EDITS,
        visible: ringVisible,
        mask: this.ringMask,
      } satisfies GrassResidencyLayer,
      transition: this.activeTransition,
      farVisible: this.farEnabled,
      terrainDetailStrength: this.farEnabled
        ? (this.activeTransition.terrainDetailStrength ?? 1)
        : 0,
      wedge: this.wedge,
    };
  }

  /**
   * Publish one coverage to both route passes. The base drops the records it
   * covers and the focus field keeps exactly those, so the tiles that arrived
   * for a focus the owner has not admitted yet draw nothing - they do not sit
   * on top of the base field at double density while the camera travels.
   */
  private updateRoutingState(): void {
    this.baseVisible = this.visibleNow();
    this.ringVisible = this.ringVisibleNow();
    const active = this.ringVisible ? this.rebuild.activeFocus : null;
    if (!active) {
      this.baseMask = null;
      this.ringMask = null;
    } else {
      const radiusSq = this.activeRadiusM * this.activeRadiusM;
      const coverage = {
        center: [active.x, active.y] as [number, number],
        radiusSq,
        tileM: MEADOW_FOCUS_TILE_M,
        enabled: true,
      };
      this.baseMask = { ...coverage, keepInside: false };
      this.ringMask = { ...coverage, keepInside: true };
    }
    this.changed();
  }
}

export function productionBladeFieldProfile(quality?: BattleGrassQuality): BladeFieldProfile {
  return quality ? PRODUCTION_BLADE_FIELD_PROFILES[quality] : STANDARD_BLADE_FIELD_PROFILE;
}

export function initialBladeFieldTransition(
  profile: BladeFieldProfile,
): BladeFieldTransitionProfile {
  return activeGrassTransitionProfile(profile, profile.vistaVisibleRadiusM);
}

function activeGrassVisibleRadiusM(profile: BladeFieldProfile, eyeZ: number): number {
  if (eyeZ >= 60) return profile.vistaVisibleRadiusM;
  const band = Math.max(1, Math.min(4, Math.ceil(Math.max(0, eyeZ) / 15)));
  const bandRadii = [profile.closeVisibleRadiusM, 90, 160, profile.vistaVisibleRadiusM] as const;
  return bandRadii[band - 1];
}

function activeGrassTransitionProfile(
  profile: BladeFieldProfile,
  visibleRadiusM: number,
): BladeFieldTransitionProfile {
  const vista = profile.vistaTransitionDefaults;
  const scale = visibleRadiusM / Math.max(1, vista.farGrassStartM);
  const denseBladeEndM = Math.max(1, vista.denseBladeEndM * scale);
  const farGrassStartM = Math.max(1, vista.farGrassStartM * scale);
  const farGrassEndM = Math.max(2, vista.farGrassEndM * scale);
  const expandsNearTier = visibleRadiusM <= 90;
  return {
    denseBladeEndM,
    farGrassStartM,
    farGrassEndM,
    nearTierEndM: expandsNearTier ? denseBladeEndM : profile.lodNearRadiusM,
    midTierEndM: expandsNearTier ? farGrassStartM : profile.lodMidRadiusM,
    farSoftWidthScale: vista.farSoftWidthScale,
    edgeSinkStartM: Math.max(1, (vista.edgeSinkStartM ?? vista.farGrassStartM) * scale),
  };
}

function snapToGrassFocusGrid(value: number): number {
  return Math.floor(value / MEADOW_FOCUS_RING_SNAP_CELL_M + 1e-6) * MEADOW_FOCUS_RING_SNAP_CELL_M;
}

function grassRouteCullWedgeForCamera(camera: Camera3DParams, radiusM: number) {
  const eye = eyePosition(camera);
  const fx = camera.target[0] - eye[0];
  const fy = camera.target[1] - eye[1];
  const length = Math.hypot(fx, fy);
  if (length < 1e-6) {
    return {
      forward: [0, 1] as [number, number],
      side: [1, 0] as [number, number],
      halfWidthSlope: 1,
      backMarginM: 0,
      farMarginM: 0,
      enabled: false,
    };
  }
  const forward: [number, number] = [fx / length, fy / length];
  const side: [number, number] = [forward[1], -forward[0]];
  const tanHalfX = Math.tan(camera.fovY / 2) * Math.max(0.5, camera.aspect);
  return {
    forward,
    side,
    halfWidthSlope: Math.max(0.65, tanHalfX * 1.18),
    backMarginM: radiusM * 0.58,
    farMarginM: radiusM * 1.08,
    enabled: true,
  };
}
