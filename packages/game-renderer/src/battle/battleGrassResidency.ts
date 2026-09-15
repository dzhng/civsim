import {
  eyePosition,
  viewMatrix,
  projMatrix,
  projectionFootprint,
  projectedSpanPixels,
  type Camera3DParams,
} from "../../../renderer-core/src/camera3d";
import {
  createGrassFieldSampler,
  type GrassFieldSampler,
  type GrassFieldStats,
} from "./grassField";
import type { BattleGroundCover, BattleTerrainGrid } from "./terrainFeatures";
import type { TerrainHeightField } from "../terrain/heightField";
import {
  transitionSnapshot,
  transitionProfileForTiers,
  LIVING_MEADOW_FAR_DENSITY_PROFILE,
  type BladeFieldTierSpec,
  type BladeFieldTransitionProfile,
} from "./bladeFieldPolicy";

export interface GrassResidencyLayer {
  revision: number;
  records: Float32Array | null;
  visible: boolean;
  circle: { center: [number, number]; radiusSq: number; enabled: boolean } | null;
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
const MEADOW_FOCUS_RING_REBUILD_HYSTERESIS_M = 80;
const MEADOW_FOCUS_RING_SNAP_CELL_M = 48;
const MEADOW_FOCUS_RING_FIELD_CELL_M = 0.6;
const MEADOW_FOCUS_RING_MAX_RECORDS = 1_000_000;
const MEADOW_FOCUS_RING_DEDUPE_MARGIN_M = 20;
const MEADOW_RING_MIN_PIXELS = 1.5;
const MEADOW_RING_RELEASE_PIXELS = 1;
const GRASS_SAMPLE_SLICE_CELLS = 16384;
const GRASS_SAMPLE_SLICE_BUDGET_MS = 4;
const GRASS_MIN_PIXELS = 0.5;

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
  slices: number;
  maxSliceMs: number;
}

export interface GrassRebuildStats {
  strategy: "static-whole-map+camera-focus-ring";
  activeRecordBudget: number;
  vistaRecordBudget: number;
  areaBudgetScale: number;
  pending: boolean;
  rebuilds: number;
  lastSampleMs: number;
  lastSlices: number;
  lastMaxSliceMs: number;
}

interface GrassRebuildState extends GrassRebuildStats {
  activeFocus: GrassSampleFocus | null;
  pendingFocus: GrassSampleFocus | null;
  inProgressCells: number;
  totalCells: number;
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
  private baseCircle: GrassResidencyLayer["circle"] = null;
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
  private baseSampleStats: GrassFieldStats | null = null;
  private focusTerrainKey: string | null = null;
  private focusRecords: Float32Array | null = null;
  private focusSampleStats: GrassFieldStats | null = null;
  private pendingTerrainKey: string | null = null;
  private sampleTask: GrassSampleTask | null = null;
  private sampleStats: GrassFieldStats | null = null;
  private enabled = true;
  private focusRingEngaged = false;
  private farEnabled = true;
  private activeTransition: BladeFieldTransitionProfile;
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
      strategy: "static-whole-map+camera-focus-ring",
      activeRecordBudget: profile.maxRecords,
      vistaRecordBudget: profile.maxRecords,
      areaBudgetScale: 1,
      pending: false,
      rebuilds: 0,
      lastSampleMs: 0,
      lastSlices: 0,
      lastMaxSliceMs: 0,
      activeFocus: null,
      pendingFocus: null,
      inProgressCells: 0,
      totalCells: 0,
    };
  }

  setTerrain(grid: BattleTerrainGrid, field: TerrainHeightField, cover: BattleGroundCover): void {
    this.terrainGrid = grid;
    this.heightField = field;
    this.groundCover = cover;
    this.terrainRect = [grid.ox, grid.oy, grid.w * grid.cell, grid.h * grid.cell];
    this.baseTerrainKey = null;
    this.baseRecords = null;
    this.baseSampleStats = null;
    this.focusTerrainKey = null;
    this.focusRecords = null;
    this.focusSampleStats = null;
    this.pendingTerrainKey = null;
    this.sampleTask = null;
    this.sampleStats = null;
    this.rebuild.pending = false;
    this.rebuild.activeFocus = null;
    this.rebuild.pendingFocus = null;
    this.rebuild.inProgressCells = 0;
    this.rebuild.totalCells = 0;
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
    this.rebuild.activeRecordBudget = focusRingActive
      ? STATIC_GRASS_MAX_RECORDS + MEADOW_FOCUS_RING_MAX_RECORDS
      : STATIC_GRASS_MAX_RECORDS;
    this.sampleStats =
      focusRingActive && this.focusSampleStats ? this.focusSampleStats : this.baseSampleStats;
    this.updateRoutingState();

    if (!focusRingActive) {
      this.sampleTask = null;
      this.pendingTerrainKey = null;
      this.rebuild.pending = false;
      this.rebuild.pendingFocus = null;
      this.sampleStats = this.baseSampleStats;
      this.updateRoutingState();
      return;
    }

    const focus = this.focusRingForCamera(view.x, view.y);
    const key = this.sampleKey("focus", focus);
    const active = this.rebuild.activeFocus;
    const pending = this.rebuild.pendingFocus;
    if (!active) {
      if (key !== this.pendingTerrainKey) this.startSampleTask(focus, key);
      return;
    }
    const currentCenter = pending ?? active;
    const moved =
      Math.hypot(view.x - currentCenter.x, view.y - currentCenter.y) >
      MEADOW_FOCUS_RING_REBUILD_HYSTERESIS_M;
    if (!moved || key === this.focusTerrainKey || key === this.pendingTerrainKey) return;
    this.startSampleTask(focus, key);
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
    this.sampleTask = null;
    this.pendingTerrainKey = null;
    this.rebuild.pending = false;
    this.rebuild.pendingFocus = null;
    this.rebuild.inProgressCells = 0;
    this.rebuild.totalCells = 0;
  }

  stats(): GrassResidencyStats {
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

  settle(): void {
    const task = this.sampleTask;
    if (task) {
      while (task === this.sampleTask && !task.sampler.step(GRASS_SAMPLE_SLICE_CELLS)) {
        task.slices += 1;
      }
      if (task === this.sampleTask) {
        task.slices += 1;
        this.completeSampleTask(task);
      }
    }
  }

  dispose(): void {
    this.sampleTask = null;
    this.baseRecords = null;
    this.focusRecords = null;
  }

  private visibleNow(): boolean {
    return this.enabled && (this.view?.bladePixels ?? 0) >= GRASS_MIN_PIXELS;
  }

  private ringVisibleNow(): boolean {
    return (
      this.visibleNow() &&
      this.focusRingEngaged &&
      this.focusRecords !== null &&
      this.rebuild.activeFocus !== null
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

  private focusRingForCamera(x: number, y: number): GrassSampleFocus {
    return {
      x: snapToGrassFocusGrid(x),
      y: snapToGrassFocusGrid(y),
      radius: MEADOW_FOCUS_RING_RADIUS_M,
      maxRecords: MEADOW_FOCUS_RING_MAX_RECORDS,
    };
  }

  private sampleKey(kind: "base" | "focus", focus: GrassSampleFocus): string {
    if (!this.terrainGrid) return "";
    const fieldCellSize =
      kind === "focus" ? MEADOW_FOCUS_RING_FIELD_CELL_M : STATIC_GRASS_FIELD_CELL_M;
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
    this.baseSampleStats = snapshot.stats;
    this.sampleStats = this.focusSampleStats ?? this.baseSampleStats;
    this.rebuild.lastSampleMs = Number((this.clock.now() - started).toFixed(3));
    this.rebuild.lastSlices = 1;
    this.rebuild.lastMaxSliceMs = this.rebuild.lastSampleMs;
    this.baseRevision++;
    this.updateRoutingState();
  }

  private startSampleTask(focus: GrassSampleFocus, key: string): void {
    if (!this.terrainGrid || !this.heightField) return;
    const sampler = createGrassFieldSampler(this.terrainGrid, this.heightField, {
      seed: this.profile.seed,
      focus,
      fieldCellSize: MEADOW_FOCUS_RING_FIELD_CELL_M,
      snapCellSize: MEADOW_FOCUS_RING_SNAP_CELL_M,
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
    const task: GrassSampleTask = {
      key,
      focus,
      sampler,
      startedAt: this.clock.now(),
      slices: 0,
      maxSliceMs: 0,
    };
    this.sampleTask = task;
    this.pendingTerrainKey = key;
    this.rebuild.pending = true;
    this.rebuild.pendingFocus = focus;
    this.rebuild.totalCells = sampler.totalCells;
    this.rebuild.inProgressCells = 0;
    this.clock.schedule(() => this.runSampleSlice(task));
  }

  private runSampleSlice(task: GrassSampleTask): void {
    if (task !== this.sampleTask || !this.enabled || !this.focusRingEngaged) return;
    const sliceStarted = this.clock.now();
    let done = false;
    do {
      done = task.sampler.step(GRASS_SAMPLE_SLICE_CELLS);
    } while (!done && this.clock.now() - sliceStarted < GRASS_SAMPLE_SLICE_BUDGET_MS);
    const sliceMs = this.clock.now() - sliceStarted;
    task.slices += 1;
    task.maxSliceMs = Math.max(task.maxSliceMs, sliceMs);
    this.rebuild.inProgressCells = task.sampler.cellsProcessed;
    this.rebuild.totalCells = task.sampler.totalCells;
    this.rebuild.lastSlices = task.slices;
    this.rebuild.lastMaxSliceMs = Number(task.maxSliceMs.toFixed(3));
    if (done) this.completeSampleTask(task);
    else this.clock.schedule(() => this.runSampleSlice(task));
  }

  private completeSampleTask(task: GrassSampleTask): void {
    if (task !== this.sampleTask) return;
    const snapshot = task.sampler.finish();
    if (!snapshot) {
      this.sampleTask = null;
      this.pendingTerrainKey = null;
      this.rebuild.pending = false;
      this.rebuild.pendingFocus = null;
      return;
    }
    this.focusSampleStats = snapshot.stats;
    this.focusRecords = snapshot.packedRecords;
    this.sampleStats = snapshot.stats;
    this.focusTerrainKey = task.key;
    this.pendingTerrainKey = null;
    this.sampleTask = null;
    this.rebuild.activeFocus = task.focus;
    this.rebuild.pendingFocus = null;
    this.rebuild.pending = false;
    this.rebuild.rebuilds += 1;
    this.rebuild.lastSampleMs = Number((this.clock.now() - task.startedAt).toFixed(3));
    this.rebuild.lastSlices = task.slices;
    this.rebuild.lastMaxSliceMs = Number(task.maxSliceMs.toFixed(3));
    this.rebuild.inProgressCells = task.sampler.cellsProcessed;
    this.rebuild.totalCells = task.sampler.totalCells;
    this.ringRevision++;
    this.updateRoutingState();
  }

  snapshot() {
    const ringVisible = this.ringVisible;
    return {
      base: {
        revision: this.baseRevision,
        records: this.baseRecords,
        visible: this.baseVisible,
        circle: this.baseCircle,
      } satisfies GrassResidencyLayer,
      ring: {
        revision: this.ringRevision,
        records: this.focusRecords,
        visible: ringVisible,
        circle: null,
      } satisfies GrassResidencyLayer,
      transition: this.activeTransition,
      farVisible: this.farEnabled,
      terrainDetailStrength: this.farEnabled
        ? (this.activeTransition.terrainDetailStrength ?? 1)
        : 0,
      wedge: this.wedge,
    };
  }

  private updateRoutingState(): void {
    this.baseVisible = this.visibleNow();
    this.ringVisible = this.ringVisibleNow();
    const active = this.rebuild.activeFocus;
    const radius = Math.max(0, MEADOW_FOCUS_RING_RADIUS_M - MEADOW_FOCUS_RING_DEDUPE_MARGIN_M);
    this.baseCircle =
      this.ringVisible && active
        ? { center: [active.x, active.y], radiusSq: radius * radius, enabled: true }
        : null;
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
