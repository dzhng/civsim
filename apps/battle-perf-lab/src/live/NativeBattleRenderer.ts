import type {
  BattleRendererApi,
  BattleRendererFrameMetrics,
  BattleRendererStats,
  BattleSubmissionIdentity,
} from "../../../../web/src/battle/battleRendererApi";
import type {
  BattleRendererOptions,
  BattleRendererDisposeHook,
  BattlePresentationReceipt,
} from "../../../../web/src/battle/renderer";
import type { BattlePresentation } from "../../../../web/src/battle/battlePresentation";
import {
  cameraSnapshot,
  cloneTerrainGrid,
  cloneTerrainOptions,
  frozenFrameKey,
  frozenSelectionGroundCues,
  readoutsKey,
} from "../../../../web/src/battle/battlePresentationPolicy";
import {
  getGraphicsSettings,
  resolveGraphicsSettings,
  graphicsQueryOverrides,
  subscribeGraphicsSettings,
  type GraphicsSettings,
} from "../../../../web/src/shared/graphicsSettings";
import { fatalSurfaceFor, showFatalErrorSurface } from "../../../../web/src/shared/fatalError";
import {
  buildCrowdInstances,
  type CrowdInstance,
} from "../../../../packages/crowd-runtime/src/instanceData";
import { assertGameplayAppearances } from "../../../../packages/crowd-runtime/src/animationState";
import {
  loadAppearanceCatalog,
  type AppearanceBundle,
} from "../../../../packages/soldier-assets/src/appearanceBundle";
import {
  loadImpostorAtlas,
  type ImpostorAtlasData,
} from "../../../../packages/soldier-assets/src/impostorAtlas";
import { resolveBattleEnvironment } from "../../../../packages/game-renderer/src/environment/environment";
import {
  battlePostGrade,
  postGradeUniformsFromParams,
} from "../../../../packages/game-renderer/src/environment/postParameters";
import { resolveSunShadowMode } from "../../../../packages/game-renderer/src/battle/shadowPolicy";
import { productionBladeFieldProfile } from "../../../../packages/game-renderer/src/battle/battleGrassResidency";
import {
  resolveBattleTerrainOptions,
  type BattleTerrainOptions,
} from "../../../../packages/game-renderer/src/battle/terrainOptions";
import type { BattleTerrainGrid } from "../../../../packages/game-renderer/src/battle/terrainFeatures";
import { eyePosition, type WorldRay } from "../../../../packages/renderer-core/src/camera3d";
import { claimCanvas } from "./canvasOwnership";
import { createSceneBackend, type SceneBackend } from "../sceneBackend";
import { createSceneLifecycle } from "../sceneLifecycle";
import { createTerrainPicking } from "../terrainPicking";
import { beginGpuAdmission } from "../gpuAdmission";
import type { BattleSceneOptions, BattleTerrainInput } from "../sceneTypes";

declare const __BATTLE_NATIVE_BACKEND__: SceneBackend;
declare const __BATTLE_NATIVE_ATLAS_CATALOG__: string;
type Owner = Awaited<ReturnType<typeof createSceneBackend>>;
type View = Parameters<Owner["scene"]["prepare"]>[0];
const twoFrames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

/** Lab-only frontend facade. Every GPU pass belongs to the selected native library;
 * the real menu, Game, ActionTimeline, input, HUD and benchmark remain production. */
export class BattleRenderer implements BattleRendererApi {
  readonly ready: Promise<void>;
  soldierAssets: Record<number, AppearanceBundle> | null = null;
  fixedTime: number | null = null;
  preserveFrozenEffects = false;
  private readonly backend = __BATTLE_NATIVE_BACKEND__;
  private readonly environmentRequest: string | null;
  private readonly settings: GraphicsSettings;
  private visibility: Pick<GraphicsSettings, "grass" | "farGrass" | "bloom">;
  private readonly environment;
  private readonly post: boolean;
  private readonly grade;
  private readonly releases: (() => void)[] = [];
  private readonly lifecycle = createSceneLifecycle(() => {
    const errors: unknown[] = [];
    for (const release of this.releases.splice(0).reverse()) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    this.soldierAssets = null;
    this.picking = null;
    this.instances = [];
    if (errors.length) throw new AggregateError(errors, "Native live renderer cleanup failed");
  });
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private owner: Owner | null = null;
  private format!: GPUTextureFormat;
  private deviceLabel = "unavailable";
  private queueSubmissions = 0;
  private readinessSubmissions = 0;
  private latestSubmission: BattleSubmissionIdentity | null = null;
  private renderedFrameId = 0;
  private metrics: BattleRendererFrameMetrics = {
    renderedFrameId: 0,
    gpuSubmission: null,
    skippedFrozenFrame: false,
    buildMs: 0,
    uploadMs: 0,
    drawMs: 0,
    frameCpuMs: 0,
  };
  private pendingTerrain: BattleTerrainInput | null = null;
  private terrainAvailable!: () => void;
  private readonly terrainReady = new Promise<void>((resolve) => {
    this.terrainAvailable = resolve;
  });
  private staticData = { soldierUnit: new Uint32Array(), teams: [] as number[] };
  private instances: CrowdInstance[] = [];
  private picking: ReturnType<typeof createTerrainPicking> | null = null;
  private lastView: View | null = null;
  private frozenKey: string | null = null;
  private invalidation = 0;
  private pendingPresentation: Promise<BattlePresentationReceipt> | null = null;
  private readiness: Promise<void> | null = null;
  private startupCallback = false;
  private startupRequested = false;
  private startupReady: {
    resolve(): void;
    reject(error: unknown): void;
    promise: Promise<void>;
  } | null = null;
  private audio: BattleRendererDisposeHook | null = null;
  private readonly resized = () => this.resize();
  private size = { width: 1, height: 1, cssHeight: 1 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: BattleRendererOptions = {},
  ) {
    const params = new URLSearchParams(location.search);
    if (!["raw", "typegpu", "vgpu"].includes(this.backend))
      throw Error("Invalid native lab backend");
    if (!__BATTLE_NATIVE_ATLAS_CATALOG__)
      throw Error("Native live lab requires the prepared atlas catalog");
    if (params.get("debug") === "blocks")
      throw Error("Native live lab does not implement the source debug-block view");
    this.environmentRequest = params.get("env") ?? options.environment ?? null;
    this.environment = resolveBattleEnvironment(this.environmentRequest).environment;
    this.settings = resolveGraphicsSettings(
      location.search,
      options.graphics ?? getGraphicsSettings(),
    );
    this.visibility = {
      grass: this.settings.grass,
      farGrass: this.settings.farGrass,
      bloom: this.settings.bloom,
    };
    if (resolveSunShadowMode("", this.settings.shadows) === "csm")
      throw Error(
        "Native live comparison currently implements the source single shadow map, not CSM",
      );
    this.post = (params.get("post") ?? options.post) !== "off";
    this.grade = battlePostGrade(
      this.environment.id,
      postGradeUniformsFromParams(params) ?? options.postGrade ?? {},
    );
    this.resize();
    window.addEventListener("resize", this.resized);
    this.releases.push(() => window.removeEventListener("resize", this.resized));
    const overrides = graphicsQueryOverrides(location.search);
    this.releases.push(
      subscribeGraphicsSettings((next) => {
        const value = resolveGraphicsSettings(location.search, next);
        if (!overrides.grass) this.visibility.grass = value.grass;
        if (!overrides.farGrass) this.visibility.farGrass = value.farGrass;
        if (!overrides.bloom) this.visibility.bloom = value.bloom;
        this.invalidate();
      }),
    );
    const canvasOwner = claimCanvas(canvas);
    this.releases.unshift(canvasOwner.release);
    this.ready = this.lifecycle
      .run(async () => {
        await canvasOwner.ready;
        this.check();
        await this.init();
      })
      .catch((error) => {
        try {
          this.dispose();
        } catch (cleanup) {
          throw new AggregateError(
            [error, cleanup],
            "Native renderer initialization and cleanup failed",
          );
        }
        throw error;
      });
  }
  private invalidate() {
    this.invalidation++;
    this.frozenKey = null;
  }
  private check(signal?: AbortSignal) {
    this.lifecycle.check();
    signal?.throwIfAborted();
  }
  private async assets() {
    const assets = await loadAppearanceCatalog(
      new URL("/assets/soldiers/catalog.json", location.href).href,
    );
    assertGameplayAppearances(assets);
    const url = new URL(__BATTLE_NATIVE_ATLAS_CATALOG__, location.href);
    const response = await fetch(url);
    if (!response.ok) throw Error(`Atlas catalog ${response.status}`);
    const catalog = await response.json();
    const atlases: Record<number, ImpostorAtlasData> = {};
    for (const id of Object.keys(assets).map(Number)) {
      this.check();
      if (typeof catalog.appearances?.[id] !== "string")
        throw Error(`Missing prepared atlas ${id}`);
      atlases[id] = await loadImpostorAtlas(new URL(catalog.appearances[id], url).href, assets[id]);
    }
    return { assets, atlases };
  }
  private async init() {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw Error("WebGPU adapter unavailable");
    this.check();
    this.deviceLabel =
      [
        adapter.info.vendor,
        adapter.info.architecture,
        adapter.info.device,
        adapter.info.description,
      ]
        .filter(Boolean)
        .join(" ") || "WebGPU adapter";
    const device = await adapter.requestDevice();
    this.device = device;
    this.releases.push(() => device.destroy());
    this.check();
    const originalSubmit = device.queue.submit;
    device.queue.submit = (...args) => {
      originalSubmit.apply(device.queue, args);
      this.queueSubmissions++;
    };
    this.releases.push(() => {
      device.queue.submit = originalSubmit;
    });
    void device.lost.then((info) => {
      if (!this.lifecycle.disposed)
        showFatalErrorSurface(this.canvas, fatalSurfaceFor("device-lost", info.message));
    });
    const context = this.canvas.getContext("webgpu");
    if (!context) throw Error("WebGPU canvas unavailable");
    this.context = context;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.canvas.width = this.size.width;
    this.canvas.height = this.size.height;
    context.configure({ device, format: this.format, alphaMode: "opaque" });
    this.releases.push(() => context.unconfigure());
    const catalog = await this.assets();
    await this.terrainReady;
    this.check();
    const terrain = this.pendingTerrain!;
    this.pendingTerrain = null;
    const owner = await createSceneBackend(
      this.backend,
      device,
      this.canvas,
      context,
      this.sceneOptions(catalog, terrain),
    );
    this.owner = owner;
    this.releases.push(() => {
      const active = this.owner;
      this.owner = null;
      active?.dispose();
    });
    this.check();
    this.picking = createTerrainPicking(owner.scene.pickingMeshes());
    this.soldierAssets = catalog.assets;
  }
  private sceneOptions(
    catalog: {
      assets: Record<number, AppearanceBundle>;
      atlases: Record<number, ImpostorAtlasData>;
    },
    terrain: BattleTerrainInput,
  ): BattleSceneOptions {
    return {
      ...catalog,
      environment: this.environment,
      terrain,
      grassProfile: productionBladeFieldProfile(this.settings.grassQuality),
      width: this.size.width,
      height: this.size.height,
      samples: 1,
      outputFormat: this.format,
      shadows: this.settings.shadows !== "off",
      ...this.visibility,
      post: this.post,
      grade: this.grade,
    };
  }
  usesEnvironment(value: BattleRendererOptions["environment"]) {
    return (
      (new URLSearchParams(location.search).get("env") ?? value ?? null) === this.environmentRequest
    );
  }
  usesGraphicsSettings(value: GraphicsSettings) {
    const next = resolveGraphicsSettings(location.search, value);
    return (
      next.shadows === this.settings.shadows && next.grassQuality === this.settings.grassQuality
    );
  }
  setBattleAudio(audio: BattleRendererDisposeHook | null) {
    if (this.audio && this.audio !== audio) this.audio.dispose();
    this.audio = audio;
  }
  clearBattleAudio(audio: BattleRendererDisposeHook) {
    if (this.audio === audio) this.audio = null;
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.size = {
      width: Math.floor((this.canvas.clientWidth || 1) * dpr),
      height: Math.floor((this.canvas.clientHeight || 1) * dpr),
      cssHeight: this.canvas.clientHeight || 1,
    };
    this.invalidate();
  }
  setStatic(soldierUnit: Uint32Array, teams: number[], _classes: number[]) {
    this.check();
    this.staticData = { soldierUnit: new Uint32Array(soldierUnit), teams: [...teams] };
    this.instances = [];
    this.invalidate();
  }
  setTerrain(grid: BattleTerrainGrid, options: BattleTerrainOptions = {}) {
    this.check();
    const copied = cloneTerrainOptions(options);
    this.pendingTerrain = { grid: cloneTerrainGrid(grid), ...resolveBattleTerrainOptions(copied) };
    this.invalidate();
    this.terrainAvailable();
  }
  private async reconcile(signal?: AbortSignal) {
    const owner = this.owner!;
    if (this.pendingTerrain) {
      const input = this.pendingTerrain;
      this.pendingTerrain = null;
      await owner.scene.replaceTerrain(input);
      this.picking = createTerrainPicking(owner.scene.pickingMeshes());
      this.check(signal);
    }
    const { width, height } = this.size;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      await owner.scene.resize(width, height);
      this.check(signal);
      try {
        owner.resizeOutput(width, height);
        this.canvas.width = width;
        this.canvas.height = height;
      } catch (error) {
        this.dispose();
        throw error;
      }
    }
    owner.scene.setVisibility({ ...this.visibility, post: this.post });
  }
  present(
    packet: BattlePresentation,
    signal?: AbortSignal,
    startupAfterUploads?: () => void,
  ): Promise<BattlePresentationReceipt> {
    if (this.pendingPresentation)
      return Promise.reject(Error("Native presentation already pending"));
    const beforeReadiness = this.readiness;
    const generation = this.invalidation;
    const task = (async () => {
      await this.ready;
      await beforeReadiness;
      this.check(signal);
      return this.lifecycle.run(async () => {
        let cpuMs = 0,
          buildMs = 0,
          uploadMs = 0,
          drawMs = 0;
        const sync = <T>(f: () => T): T => {
          const start = performance.now();
          try {
            return f();
          } finally {
            cpuMs += performance.now() - start;
          }
        };
        const step = async (f: () => void | Promise<void>) => {
          const pending = sync(f);
          await pending;
          this.check(signal);
        };
        await step(() => this.reconcile(signal));
        const c = packet.crowd;
        if (!c) throw Error("Native presentation requires admitted soldier assets");
        const key =
          packet.fixedTime === null
            ? null
            : `${frozenFrameKey(packet.camera, c.count)}|tick=${c.observationTick}|effects=${packet.preserveFrozenEffects ? 1 : 0}|${readoutsKey(c.standards, c.readouts)}`;
        if (key && key === this.frozenKey) {
          this.metrics = {
            ...this.metrics,
            skippedFrozenFrame: true,
            buildMs: 0,
            uploadMs: 0,
            drawMs: 0,
            frameCpuMs: cpuMs,
          };
          return {
            submitted: false,
            renderedFrameId: this.renderedFrameId,
            gpuSubmission: this.latestSubmission,
            submittedAtMs: performance.now(),
            cpuMs,
          };
        }
        const view = { camera: cameraSnapshot(packet.camera), time: packet.timeSeconds };
        const owner = this.owner!;
        const buildStart = cpuMs;
        sync(() => {
          const built = buildCrowdInstances(
            {
              positions: c.positions,
              facings: c.facings,
              playback: c.playback,
              alive: c.alive,
              count: c.count,
              soldierUnit: this.staticData.soldierUnit,
              unitTeam: this.staticData.teams,
              mountedClasses: Object.entries(this.soldierAssets!)
                .filter(([, a]) => a.manifest.mounted)
                .map(([id]) => Number(id)),
              terrainHeight: owner.scene.seatingHeightAt,
            },
            this.instances,
          );
          this.instances = built.instances;
        });
        buildMs = cpuMs - buildStart;
        const uploadStart = cpuMs;
        await step(() => owner.scene.uploadReadouts(c.standards, c.readouts));
        await step(() => owner.scene.uploadCrowd(this.instances, view.camera, view.time));
        if (c.triangles.length) await step(() => owner.scene.uploadTriangles(c.triangles));
        this.startupCallback = true;
        try {
          sync(() => startupAfterUploads?.());
        } finally {
          this.startupCallback = false;
        }
        if (this.startupRequested) {
          await step(() => owner.scene.settleGrass(view.camera));
          await step(() => owner.scene.prepare(view));
          await step(() => this.submit("render-only"));
          this.readinessSubmissions++;
        }
        if (!c.triangles.length) await step(() => owner.scene.uploadTriangles(c.triangles));
        const lines = packet.tacticalLines;
        await step(() =>
          owner.scene.uploadTacticalLines({
            groundCues:
              packet.fixedTime === null
                ? lines.groundCues
                : frozenSelectionGroundCues(lines.groundCues),
            rings: lines.rings,
            effects:
              packet.fixedTime !== null && !packet.preserveFrozenEffects
                ? new Float32Array()
                : lines.effects,
          }),
        );
        uploadMs = cpuMs - uploadStart;
        const drawStart = cpuMs;
        await step(() => owner.scene.prepare(view));
        await step(() => this.submit("battle-draw"));
        drawMs = cpuMs - drawStart;
        this.lastView = view;
        if (this.startupRequested) {
          await this.device.queue.onSubmittedWorkDone();
          await twoFrames();
          this.check(signal);
          await step(() => owner.scene.settleGrass(view.camera));
          await step(() => owner.scene.prepare(view));
          await step(() => this.submit("render-only"));
          this.readinessSubmissions++;
          await this.device.queue.onSubmittedWorkDone();
          this.check(signal);
          this.startupRequested = false;
          this.startupReady?.resolve();
          this.startupReady = null;
        }
        this.renderedFrameId++;
        this.frozenKey = generation === this.invalidation ? key : null;
        this.metrics = {
          renderedFrameId: this.renderedFrameId,
          gpuSubmission: this.latestSubmission,
          skippedFrozenFrame: false,
          buildMs,
          uploadMs,
          drawMs,
          frameCpuMs: cpuMs,
        };
        return {
          submitted: true,
          renderedFrameId: this.renderedFrameId,
          gpuSubmission: this.latestSubmission,
          submittedAtMs: performance.now(),
          cpuMs,
        };
      });
    })();
    this.pendingPresentation = task;
    void task.then(
      () => {
        if (this.pendingPresentation === task) this.pendingPresentation = null;
      },
      (error) => {
        if (this.pendingPresentation === task) this.pendingPresentation = null;
        this.startupRequested = false;
        this.startupReady?.reject(error);
        this.startupReady = null;
      },
    );
    return task;
  }
  private async submit(source: "battle-draw" | "render-only") {
    const admission = beginGpuAdmission(this.device);
    const before = this.queueSubmissions;
    try {
      const pending = this.owner!.submitPresentation();
      const accepted = admission();
      await Promise.all([pending, accepted]);
    } catch (error) {
      await admission().catch(() => {});
      throw error;
    }
    if (this.queueSubmissions === before)
      throw Error("Native presentation submitted no command buffer");
    this.latestSubmission = { submissionId: this.queueSubmissions, source, backend: this.backend };
  }
  settlePresentedFrame(signal?: AbortSignal): Promise<void> {
    if (this.startupCallback) {
      this.startupRequested = true;
      if (!this.startupReady) {
        let resolve!: () => void, reject!: (error: unknown) => void;
        const promise = new Promise<void>((yes, no) => {
          resolve = yes;
          reject = no;
        });
        this.startupReady = { promise, resolve, reject };
      }
      return this.startupReady.promise;
    }
    const prior = this.pendingPresentation,
      previous = this.readiness;
    const job = (async () => {
      await this.ready;
      await previous;
      await prior;
      this.check(signal);
      if (!this.lastView) return;
      await this.lifecycle.run(async () => {
        const view = this.lastView!;
        for (let i = 0; i < 2; i++) {
          this.check(signal);
          await this.owner!.scene.settleGrass(view.camera);
          this.check(signal);
          await this.owner!.scene.prepare(view);
          this.check(signal);
          await this.submit("render-only");
          this.readinessSubmissions++;
          await this.device.queue.onSubmittedWorkDone();
          this.check(signal);
          if (i === 0) await twoFrames();
        }
      });
    })();
    // This is an ownership barrier, not the old scene's cancellation result.
    // The original returned job still reports its failure to its caller.
    const barrier = job.then(
      () => {},
      () => {},
    );
    this.readiness = barrier;
    const clear = () => {
      if (this.readiness === barrier) this.readiness = null;
    };
    void barrier.then(clear);
    return job;
  }
  heightAt(x: number, y: number) {
    return (
      this.picking?.surfaceHeightAt(x, y, (x, y) => this.owner?.scene.heightAt(x, y) ?? 0) ?? 0
    );
  }
  raycastGround(ray: WorldRay) {
    return this.picking?.raycast(ray) ?? null;
  }
  pxPerWorldAt(x: number, y: number, z: number) {
    const camera = this.lastView?.camera.camera3d;
    const eye = camera ? eyePosition(camera) : [0, 0, 0];
    const fov = camera?.fovY ?? (50 * Math.PI) / 180;
    return (
      this.size.cssHeight /
      (2 * Math.max(0.001, Math.hypot(eye[0] - x, eye[1] - y, eye[2] - z)) * Math.tan(fov / 2))
    );
  }
  frameMetrics() {
    return { ...this.metrics, gpuSubmission: this.latestSubmission };
  }
  gpuEventsSince(_sequence: number) {
    return null;
  }
  memoryInfo() {
    return null;
  }
  debugSoldierAnim(index: number) {
    const i = this.instances[index];
    return i ? { appearanceId: i.classId, playback: i.playback ?? null } : null;
  }
  async reloadSoldierAssets() {
    throw Error("Asset reload is not implemented by this functional native benchmark checkpoint");
  }
  stats(): BattleRendererStats {
    return {
      renderer: "gpu",
      device: this.deviceLabel,
      backend: this.backend,
      performance: {
        buildMs: this.metrics.buildMs,
        uploadMs: this.metrics.uploadMs,
        drawMs: this.metrics.drawMs,
        frameCpuMs: this.metrics.frameCpuMs,
        gpuTimeMs: null,
      },
      native: this.owner?.scene.stats() ?? null,
      submission: {
        actualQueueSubmissions: this.queueSubmissions,
        readinessSubmissions: this.readinessSubmissions,
        latest: this.latestSubmission,
      },
      gpuTiming: { available: false, reason: "native pass timestamp instrumentation pending" },
      cpuCoverage:
        "measured synchronous API calls and instance packing; asynchronous continuations are not CPU-profiled",
      picking: { triangles: this.picking?.triangles ?? 0 },
    };
  }
  dispose() {
    this.terrainAvailable();
    this.lifecycle.dispose();
    this.audio?.dispose();
    this.audio = null;
  }
}
