// Production policy above the photoreal world: frozen frames, debug mode, and CPU timing.
import type { Camera } from "../shared/camera";
import { roundMs } from "@packages/renderer-core/src/math";
import {
  PhotorealBattleWorld,
  type BattleCameraSnapshot,
  type BattleTerrainOptions,
} from "@packages/photoreal-renderer/src/battle/battleWorld";
import {
  postGradeUniformsFromParams,
  type BattlePostGradeUniforms,
} from "@packages/photoreal-renderer/src/post/postChain";
import {
  getGraphicsSettings,
  graphicsQueryOverrides,
  resolveGraphicsSettings,
  subscribeGraphicsSettings,
  type GraphicsSettings,
} from "../shared/graphicsSettings";
import type { BattleReadoutInstance } from "@packages/photoreal-renderer/src/battle/readoutLayer";
import type { BattleStandardInstance } from "@packages/photoreal-renderer/src/battle/standardLayer";
import type { BattleTerrainGrid } from "@packages/game-renderer/src/battle/terrainFeatures";
import type { BattleEnvironmentId } from "@packages/game-renderer/src/environment/environment";
import { fatalSurfaceFor, showFatalErrorSurface } from "../shared/fatalError";

export interface BattleRendererOptions {
  environment?: BattleEnvironmentId | string | null;
  shadows?: string | null;
  post?: string | null;
  postGrade?: Partial<BattlePostGradeUniforms> | null;
  graphics?: GraphicsSettings;
}

export interface BattleRendererDisposeHook {
  dispose(): void;
}

export interface BattleRendererMemoryInfo {
  geometries: number;
  textures: number;
  programs: number | null;
}

export class BattleRenderer {
  readonly ready: Promise<void>;
  fixedTime: number | null = null;
  preserveFrozenEffects = false;

  private world: PhotorealBattleWorld | null = null;
  private pendingStatic: { soldierUnit: Uint32Array; teams: number[]; classes: number[] } | null =
    null;
  private pendingTerrain: { grid: BattleTerrainGrid; options: BattleTerrainOptions } | null = null;
  private triangleVerts = new Float32Array();
  private frozenFrameKey: string | null = null;
  private skipFrozenFrame = false;
  private blockMode = new URLSearchParams(location.search).get("debug") === "blocks";
  private framePerf = {
    buildMs: 0,
    uploadMs: 0,
    drawMs: 0,
    frameCpuMs: 0,
  };
  private frameStart = 0;
  private readoutFrameKey = "";
  private readonly environmentRequest: string | null;
  private readonly shadowRequest: GraphicsSettings["shadows"];
  private readonly grassQualityRequest: GraphicsSettings["grassQuality"];
  private graphicsUnsubscribe: (() => void) | null = null;
  private battleAudio: BattleRendererDisposeHook | null = null;
  private readonly onResize = () => this.resize();
  private readonly lifecycle = { disposed: false };
  private disposed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private options: BattleRendererOptions = {},
  ) {
    const params = new URLSearchParams(location.search);
    this.environmentRequest = params.get("env") ?? options.environment ?? null;
    const settings = resolveGraphicsSettings(
      location.search,
      options.graphics ?? getGraphicsSettings(),
    );
    this.shadowRequest = settings.shadows;
    this.grassQualityRequest = settings.grassQuality;
    this.ready = this.init();
    window.addEventListener("resize", this.onResize);
  }

  usesEnvironment(environment: BattleRendererOptions["environment"]): boolean {
    const params = new URLSearchParams(location.search);
    return (params.get("env") ?? environment ?? null) === this.environmentRequest;
  }

  usesGraphicsSettings(settings: GraphicsSettings): boolean {
    const next = resolveGraphicsSettings(location.search, settings);
    return next.shadows === this.shadowRequest && next.grassQuality === this.grassQualityRequest;
  }

  memoryInfo(): BattleRendererMemoryInfo | null {
    const info = this.world?.world.renderer.info;
    if (!info) return null;
    const programs = (info as unknown as { programs?: unknown }).programs;
    return {
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: Array.isArray(programs) ? programs.length : null,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifecycle.disposed = true;
    window.removeEventListener("resize", this.onResize);
    this.graphicsUnsubscribe?.();
    this.graphicsUnsubscribe = null;
    this.battleAudio?.dispose();
    this.battleAudio = null;
    this.world?.dispose();
    this.world = null;
  }

  setBattleAudio(audio: BattleRendererDisposeHook | null): void {
    if (this.battleAudio && this.battleAudio !== audio) this.battleAudio.dispose();
    this.battleAudio = audio;
  }

  clearBattleAudio(audio: BattleRendererDisposeHook): void {
    if (this.battleAudio === audio) this.battleAudio = null;
  }

  resize() {
    if (!this.world) return;
    this.world.resize(
      this.canvas.clientWidth || 1,
      this.canvas.clientHeight || 1,
      window.devicePixelRatio || 1,
    );
  }

  setStatic(soldierUnit: Uint32Array, teams: number[], classes: number[]) {
    this.frozenFrameKey = null;
    this.readoutFrameKey = "";
    this.triangleVerts = new Float32Array();
    if (this.world) {
      this.world.setStatic(soldierUnit, teams, classes);
    } else {
      this.pendingStatic = {
        soldierUnit: new Uint32Array(soldierUnit),
        teams: [...teams],
        classes: [...classes],
      };
    }
  }

  setTerrain(grid: BattleTerrainGrid, options: BattleTerrainOptions = {}) {
    if (this.world) {
      this.world.setTerrain(grid, options);
    } else {
      this.pendingTerrain = {
        grid: cloneTerrainGrid(grid),
        options: cloneTerrainOptions(options),
      };
    }
  }

  draw(
    positions: Float32Array,
    facings: Float32Array,
    frames: Float32Array,
    alive: Float32Array,
    count: number,
    camera: Camera,
    renderClass?: Uint8Array | number[] | null,
    simTick?: number,
    frameDt = 0,
  ) {
    if (!this.world) return;
    const frameKey =
      this.fixedTime !== null
        ? `${frozenFrameKey(camera, count)}|effects=${this.preserveFrozenEffects ? 1 : 0}`
        : null;
    if (frameKey && frameKey === this.frozenFrameKey) {
      this.skipFrozenFrame = true;
      this.framePerf = { buildMs: 0, uploadMs: 0, drawMs: 0, frameCpuMs: 0 };
      return;
    }
    this.skipFrozenFrame = false;
    this.frameStart = performance.now();
    const seconds = this.fixedTime ?? performance.now() / 1000;
    this.world.setTime(seconds);
    const cameraState = cameraSnapshot(camera);
    const buildStart = performance.now();
    this.world.draw(
      positions,
      facings,
      frames,
      alive,
      count,
      cameraState,
      renderClass,
      simTick ?? Math.floor(seconds * 30),
      frameDt,
    );
    const buildEnd = performance.now();
    if (this.blockMode) {
      this.world.uploadDebugBlocks(this.world.debugBlockTriangles(positions, alive, count));
    }
    const uploadEnd = performance.now();
    this.framePerf = {
      buildMs: buildEnd - buildStart,
      uploadMs: uploadEnd - buildEnd,
      drawMs: 0,
      frameCpuMs: uploadEnd - this.frameStart,
    };
  }

  drawTris(verts: Float32Array, camera: Camera) {
    if (!this.world) return;
    this.frozenFrameKey = null;
    this.skipFrozenFrame = false;
    const cameraState = cameraSnapshot(camera);
    this.triangleVerts = new Float32Array(verts);
    const uploadStart = performance.now();
    this.world.drawTris(verts, cameraState);
    this.framePerf.uploadMs += performance.now() - uploadStart;
  }

  drawTacticalLines(lines: BattleTacticalLineFrame, camera: Camera) {
    if (!this.world) return;
    if (this.skipFrozenFrame) return;
    const cameraState = cameraSnapshot(camera);
    if (this.frameStart === 0) this.frameStart = performance.now();
    this.world.setTime(this.fixedTime ?? performance.now() / 1000);
    const uploadStart = performance.now();
    // A frame without drawTris clears the previous frame's attack arcs.
    if (this.triangleVerts.length === 0) this.world.drawTris(this.triangleVerts, cameraState);
    this.framePerf.uploadMs += performance.now() - uploadStart;
    const drawStart = performance.now();
    this.world.drawTacticalLines(
      {
        groundCues:
          this.fixedTime !== null ? frozenSelectionGroundCues(lines.groundCues) : lines.groundCues,
        rings: lines.rings,
        effects:
          this.fixedTime !== null && !this.preserveFrozenEffects
            ? new Float32Array()
            : lines.effects,
      },
      cameraState,
    );
    const done = performance.now();
    this.framePerf.drawMs = done - drawStart;
    this.framePerf.frameCpuMs = done - this.frameStart;
    this.triangleVerts = new Float32Array();
    if (this.fixedTime !== null) {
      const staticSoldiers = this.world.stats().expectedSoldiers;
      this.frozenFrameKey = `${frozenFrameKey(camera, staticSoldiers)}|effects=${this.preserveFrozenEffects ? 1 : 0}`;
    } else {
      this.frozenFrameKey = null;
    }
  }

  /** True-projection pixels-per-world-meter; the chart projection diverges in swoop. */
  pxPerWorldAt(x: number, y: number, z: number): number {
    return this.world?.pxPerWorldAt(x, y, z) ?? 0;
  }

  setUnitReadouts(
    standards: readonly BattleStandardInstance[],
    readouts: readonly BattleReadoutInstance[],
  ) {
    if (!this.world) return;
    const key = readoutsKey(standards, readouts);
    if (key !== this.readoutFrameKey) {
      this.readoutFrameKey = key;
      this.frozenFrameKey = null;
      this.skipFrozenFrame = false;
    }
    this.world.uploadUnitReadouts(standards, readouts);
  }

  stats() {
    const worldStats = this.world?.stats();
    const performance = {
      buildMs: roundMs(this.framePerf.buildMs),
      uploadMs: roundMs(this.framePerf.uploadMs),
      drawMs: roundMs(this.framePerf.drawMs),
      frameCpuMs: roundMs(this.framePerf.frameCpuMs),
      gpuTimeMs: worldStats?.performance.gpuTimeMs ?? null,
    };
    return {
      ...worldStats,
      renderer: "gpu" as const,
      performance,
    };
  }

  /** Rendered surface height at a world point — playable terrain inside the
   *  field, generated vista apron/far-fog terrain outside it. This is the
   *  camera/anchor contract; soldier seating still uses the playable terrain
   *  sampler inside PhotorealBattleWorld. */
  heightAt(x: number, y: number): number {
    return this.surfaceHeightAt(x, y);
  }

  surfaceHeightAt(x: number, y: number): number {
    return this.world?.surfaceHeightAt(x, y) ?? 0;
  }

  debugSoldierAnim(index: number): { clip: string; phase: number; frame: number } | null {
    return this.world?.debugSoldierAnim(index) ?? null;
  }

  async settlePresentedFrame() {
    if (!this.world) return;
    await this.world.settlePresentedFrame();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await this.world.settlePresentedFrame();
  }

  private async init() {
    const params = new URLSearchParams(location.search);
    const settings = resolveGraphicsSettings(
      location.search,
      this.options.graphics ?? getGraphicsSettings(),
    );
    const world = await PhotorealBattleWorld.create(this.canvas, {
      environment: this.environmentRequest,
      shadows: params.get("shadows") ?? this.options.shadows ?? settings.shadows,
      post: params.get("post") ?? this.options.post,
      postGrade: postGradeUniformsFromParams(params) ?? this.options.postGrade ?? null,
      grassQuality: settings.grassQuality,
    });
    if (this.disposed) {
      world.dispose();
      return;
    }
    world.setGrassVisible(settings.grass);
    world.setFarGrassVisible(settings.farGrass);
    world.setBloomEnabled(settings.bloom);
    this.world = world;
    const overrides = graphicsQueryOverrides(location.search);
    this.graphicsUnsubscribe = subscribeGraphicsSettings((nextSettings) => {
      if (!this.world) return;
      const next = resolveGraphicsSettings(location.search, nextSettings);
      if (!overrides.grass) this.world.setGrassVisible(next.grass);
      if (!overrides.farGrass) this.world.setFarGrassVisible(next.farGrass);
      if (!overrides.bloom) this.world.setBloomEnabled(next.bloom);
    });
    const device = (world.world.renderer.backend as unknown as { device?: GPUDevice }).device;
    const lifecycle = this.lifecycle;
    const canvas = this.canvas;
    void device?.lost?.then((info) => {
      if (!lifecycle.disposed) {
        showFatalErrorSurface(canvas, fatalSurfaceFor("device-lost", info.message));
      }
    });
    if (this.pendingStatic) {
      world.setStatic(
        this.pendingStatic.soldierUnit,
        this.pendingStatic.teams,
        this.pendingStatic.classes,
      );
      this.pendingStatic = null;
    }
    if (this.pendingTerrain) {
      world.setTerrain(this.pendingTerrain.grid, this.pendingTerrain.options);
      this.pendingTerrain = null;
    }
    this.resize();
  }
}

function cloneTerrainGrid(grid: BattleTerrainGrid): BattleTerrainGrid {
  return {
    ...grid,
    tint: new Uint8Array(grid.tint),
    height: grid.height ? new Float32Array(grid.height) : undefined,
    rough: grid.rough ? new Float32Array(grid.rough) : undefined,
    speed: grid.speed ? new Float32Array(grid.speed) : undefined,
  };
}

function cloneTerrainOptions(options: BattleTerrainOptions): BattleTerrainOptions {
  return {
    ...options,
    vista: options.vista
      ? {
          shape: options.vista.shape,
          bands: options.vista.bands.map((band) => ({
            ...band,
            height: new Float32Array(band.height),
          })),
        }
      : null,
    lakeSurfaces: options.lakeSurfaces?.map((surface) => ({ ...surface })) ?? null,
  };
}

export interface BattleTacticalLineFrame {
  /** Ground cue lines, (x, y, r, g, b, a) per vertex. */
  groundCues: Float32Array;
  /** Per-soldier selection rings, (x, y, radius, r, g, b, a) per instance. */
  rings: Float32Array;
  effects: Float32Array;
}

/** Frozen snapshots keep short unit-anchored cue segments (facing ticks,
 *  queue diamonds, near path legs) but drop cross-field order lines, whose
 *  endpoints churn between runs. Selection rings travel in their own layer
 *  and pass through untouched. */
function frozenSelectionGroundCues(verts: Float32Array) {
  const stride = 6;
  const maxSegmentLength = 12;
  const out: number[] = [];
  for (let i = 0; i + stride * 2 <= verts.length; i += stride * 2) {
    const x0 = verts[i];
    const y0 = verts[i + 1];
    const x1 = verts[i + stride];
    const y1 = verts[i + stride + 1];
    if (Math.hypot(x1 - x0, y1 - y0) > maxSegmentLength) continue;
    for (let k = 0; k < stride * 2; k++) out.push(verts[i + k]);
  }
  return new Float32Array(out);
}

function readoutsKey(
  standards: readonly BattleStandardInstance[],
  readouts: readonly BattleReadoutInstance[],
) {
  let key = `${standards.length}/${readouts.length}`;
  for (const standard of standards) {
    key += `|${standard.unitId}:${Math.round(standard.x * 10)},${Math.round(standard.y * 10)},${Math.round(standard.z * 10)},${Math.round(standard.yaw * 100)},${Math.round(standard.scale * 100)},${standard.factionId},${standard.selected ? 1 : 0}`;
  }
  for (const readout of readouts) {
    key += `#${readout.unitId}:${Math.round(readout.x * 10)},${Math.round(readout.y * 10)},${Math.round(readout.z * 10)},${Math.round(readout.worldPerPx * 1000)},${readout.chips.map((c) => `${c.kind ?? ""}${c.text}`).join(",")}`;
  }
  return key;
}

function cameraSnapshot(camera: Camera): BattleCameraSnapshot {
  const [x, y] = camera.viewCenter();
  return {
    x,
    y,
    zoom: camera.zoom,
    zoomT: camera.zoomT,
    camera3d: camera.params(),
  };
}

function frozenFrameKey(camera: Camera, count: number) {
  const [x, y] = camera.viewCenter();
  return [
    roundKey(x),
    roundKey(y),
    roundKey(camera.zoom),
    roundKey(camera.pitch ?? 0),
    roundKey(camera.yaw ?? 0),
    roundKey(camera.zoomT ?? 0),
    count,
  ].join(":");
}

function roundKey(value: number) {
  return Number.isFinite(value) ? value.toFixed(4) : "nan";
}
