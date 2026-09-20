import {
  cloneTerrainGrid,
  cloneTerrainOptions,
  frozenSelectionGroundCues,
  readoutsKey,
  cameraSnapshot,
  frozenFrameKey,
} from "./battlePresentationPolicy";
import type {
  BattlePresentationReceipt,
  BattleRendererApi,
  BattleRendererDisposeHook,
  BattleRendererFrameMetrics,
  BattleRendererMemoryInfo,
  BattleRendererOptions,
} from "./battleRendererApi";
import type { WorldRay } from "@packages/renderer-core/src/camera3d";
// Production policy above the photoreal world: frozen frames, debug mode, and CPU timing.
import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";
import type { SoldierPlayback } from "@packages/crowd-runtime/src/actionTimeline";
import type { BattlePresentation, BattleRenderCamera } from "./battlePresentation";
import { roundMs } from "@packages/renderer-core/src/math";
import { PhotorealBattleWorld } from "@packages/photoreal-renderer/src/battle/battleWorld";
import type { BattleTacticalLineFrame } from "@packages/battle-renderer/src/types";
import type { BattleTerrainOptions } from "@packages/game-renderer/src/battle/terrainOptions";
import { postGradeUniformsFromParams } from "@packages/game-renderer/src/environment/postParameters";
import { battleDebugBlockTriangles } from "@packages/game-renderer/src/battle/debugBlockData";
import {
  getGraphicsSettings,
  graphicsQueryOverrides,
  resolveGraphicsSettings,
  subscribeGraphicsSettings,
  type GraphicsSettings,
} from "../shared/graphicsSettings";
import type { BattleReadoutInstance } from "@packages/game-renderer/src/battle/readoutData";
import type { BattleStandardInstance } from "@packages/game-renderer/src/models/shared/battleStandardData";
import type { BattleTerrainGrid } from "@packages/game-renderer/src/battle/terrainFeatures";
import { fatalSurfaceFor, showFatalErrorSurface } from "../shared/fatalError";

export class BattleRenderer implements BattleRendererApi {
  readonly ready: Promise<void>;
  get soldierAssets(): Record<number, AppearanceBundle> | null {
    return this.world?.soldierAssets ?? null;
  }
  fixedTime: number | null = null;
  preserveFrozenEffects = false;

  private world: PhotorealBattleWorld | null = null;
  /** The published soldier/unit/team association, retained so the debug-block view
   * prepares its own geometry instead of reading it back out of the world. */
  private staticData = {
    soldierUnit: new Uint32Array(),
    teams: [] as number[],
    classes: [] as number[],
  };
  private staticPending = false;
  private pendingTerrain: { grid: BattleTerrainGrid; options: BattleTerrainOptions } | null = null;
  private triangleVerts = new Float32Array();
  private frozenFrameKey: string | null = null;
  private pendingFrozenFrameKey: string | null = null;
  private frozenCatalog: Record<number, AppearanceBundle> | null = null;
  private skipFrozenFrame = false;
  private benchmarkSeconds: number | null = null;
  private blockMode = new URLSearchParams(location.search).get("debug") === "blocks";
  private framePerf = {
    buildMs: 0,
    uploadMs: 0,
    drawMs: 0,
    frameCpuMs: 0,
  };
  private frameStart = 0;
  private renderedFrameId = 0;
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
    this.staticData = {
      soldierUnit: new Uint32Array(soldierUnit),
      teams: [...teams],
      classes: [...classes],
    };
    if (this.world) this.world.setStatic(soldierUnit, teams, classes);
    else this.staticPending = true;
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

  /** Uses the public draw hooks so source capture subclasses observe the same
   * readout/draw/triangle/render commands. Source submission remains synchronous. */
  present(
    packet: BattlePresentation,
    signal?: AbortSignal,
    startupAfterUploads?: () => void,
  ): BattlePresentationReceipt | Promise<BattlePresentationReceipt> {
    signal?.throwIfAborted();
    const start = performance.now();
    const before = this.renderedFrameId;
    this.benchmarkSeconds = packet.clock === "benchmark" ? packet.timeSeconds : null;
    const c = packet.crowd;
    if (c) {
      this.setUnitReadouts(c.standards, c.readouts);
      this.draw(
        c.positions,
        c.facings,
        c.playback,
        c.alive,
        c.count,
        packet.camera,
        c.observationTick,
        c.frameDt,
      );
      if (c.triangles.length) this.drawTris(c.triangles, packet.camera);
    }
    startupAfterUploads?.();
    signal?.throwIfAborted();
    this.drawTacticalLines(packet.tacticalLines, packet.camera);
    return {
      submitted: this.renderedFrameId !== before,
      renderedFrameId: this.renderedFrameId,
      gpuSubmission: this.frameMetrics().gpuSubmission,
      submittedAtMs: performance.now(),
      cpuMs: performance.now() - start,
    };
  }

  draw(
    positions: Float32Array,
    facings: Float32Array,
    playback: readonly SoldierPlayback[],
    alive: Float32Array,
    count: number,
    camera: BattleRenderCamera,
    observationTick: number,
    frameDt = 0,
  ) {
    if (!this.world) return;
    const frameKey =
      this.fixedTime !== null
        ? `${frozenFrameKey(camera, count)}|tick=${observationTick}|effects=${this.preserveFrozenEffects ? 1 : 0}`
        : null;
    this.pendingFrozenFrameKey = frameKey;
    if (
      frameKey &&
      frameKey === this.frozenFrameKey &&
      this.frozenCatalog === this.world.soldierAssets
    ) {
      this.skipFrozenFrame = true;
      this.framePerf = { buildMs: 0, uploadMs: 0, drawMs: 0, frameCpuMs: 0 };
      return;
    }
    this.skipFrozenFrame = false;
    this.frameStart = performance.now();
    this.world.setTime(this.environmentSeconds());
    const cameraState = cameraSnapshot(camera);
    const buildStart = performance.now();
    this.world.draw(positions, facings, playback, alive, count, cameraState, frameDt);
    const buildEnd = performance.now();
    if (this.blockMode) {
      this.world.uploadDebugBlocks(
        battleDebugBlockTriangles({
          positions,
          alive,
          count,
          soldierUnit: this.staticData.soldierUnit,
          unitTeam: this.staticData.teams,
        }),
      );
    }
    const uploadEnd = performance.now();
    this.framePerf = {
      buildMs: buildEnd - buildStart,
      uploadMs: uploadEnd - buildEnd,
      drawMs: 0,
      frameCpuMs: uploadEnd - this.frameStart,
    };
  }

  drawTris(verts: Float32Array, camera: BattleRenderCamera) {
    if (!this.world) return;
    this.frozenFrameKey = null;
    this.skipFrozenFrame = false;
    const cameraState = cameraSnapshot(camera);
    this.triangleVerts = new Float32Array(verts);
    const uploadStart = performance.now();
    this.world.drawTris(verts, cameraState);
    this.framePerf.uploadMs += performance.now() - uploadStart;
  }

  drawTacticalLines(lines: BattleTacticalLineFrame, camera: BattleRenderCamera) {
    if (!this.world) return;
    if (this.skipFrozenFrame) return;
    const cameraState = cameraSnapshot(camera);
    if (this.frameStart === 0) this.frameStart = performance.now();
    this.world.setTime(this.environmentSeconds());
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
    this.renderedFrameId += 1;
    this.framePerf.drawMs = done - drawStart;
    this.framePerf.frameCpuMs = done - this.frameStart;
    this.triangleVerts = new Float32Array();
    if (this.fixedTime !== null) {
      this.frozenFrameKey = this.pendingFrozenFrameKey;
      this.frozenCatalog = this.world.soldierAssets;
    } else {
      this.frozenFrameKey = null;
    }
  }

  private environmentSeconds(): number {
    return this.fixedTime ?? this.benchmarkSeconds ?? performance.now() / 1000;
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

  /** Small unrounded CPU snapshot; counts submissions, not physical presentation.
   * GPU query results are asynchronous render-pass-only values in stats(). */
  frameMetrics(): BattleRendererFrameMetrics {
    return {
      renderedFrameId: this.renderedFrameId,
      gpuSubmission: this.world?.gpuSubmissionIdentity() ?? null,
      skippedFrozenFrame: this.skipFrozenFrame,
      ...this.framePerf,
    };
  }

  gpuEventsSince(afterSequence: number) {
    return this.world?.gpuEventsSince(afterSequence) ?? null;
  }

  stats() {
    const worldStats = this.world?.stats();
    // The source runtime's value is its asynchronous render-pass-only total: it
    // belongs to no identified frame and is not a submission span. Name it for
    // what it is rather than letting a consumer read it as a frame total.
    const gpuTimeMs = worldStats?.performance.gpuTimeMs ?? null;
    const performance = {
      buildMs: roundMs(this.framePerf.buildMs),
      uploadMs: roundMs(this.framePerf.uploadMs),
      drawMs: roundMs(this.framePerf.drawMs),
      frameCpuMs: roundMs(this.framePerf.frameCpuMs),
      gpuTimeMs,
      gpuTimeMetric: gpuTimeMs === null ? null : ("source-render-pass-timestamp-sum" as const),
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
    return this.world?.surfaceHeightAt(x, y) ?? 0;
  }

  raycastGround(ray: WorldRay): [number, number, number] | null {
    return this.world?.raycastGround(ray) ?? null;
  }

  debugSoldierAnim(index: number) {
    return this.world?.debugSoldierAnim(index) ?? null;
  }

  async reloadSoldierAssets(): Promise<void> {
    await this.ready;
    if (!this.world) throw new Error("Battle renderer is not available");
    await this.world.reloadSoldierAssets();
  }

  async settlePresentedFrame(signal?: AbortSignal) {
    const world = this.world;
    const current = () => !signal?.aborted && !this.disposed && this.world === world;
    if (!world || !current()) return;
    await world.settlePresentedFrame();
    if (!current()) return;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if (!current()) return;
    await world.settlePresentedFrame();
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
    if (this.staticPending) {
      world.setStatic(this.staticData.soldierUnit, this.staticData.teams, this.staticData.classes);
      this.staticPending = false;
    }
    if (this.pendingTerrain) {
      world.setTerrain(this.pendingTerrain.grid, this.pendingTerrain.options);
      this.pendingTerrain = null;
    }
    this.resize();
  }
}
