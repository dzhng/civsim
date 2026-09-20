import type {
  BattleInstalledSceneDiagnostics,
  BattlePresentationReceipt,
  BattleRendererApi,
  BattleRendererDisposeHook,
  BattleRendererFrameMetrics,
  BattleRendererOptions,
  BattleRendererStats,
  BattleSubmissionIdentity,
} from "../../../../web/src/battle/battleRendererApi";
import type { BattlePresentation } from "../../../../web/src/battle/battlePresentation";
import { BattleGpuFrameTiming } from "../../../../web/src/battle/gpuFrameTiming";
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
import { battleDebugBlockTriangles } from "../../../../packages/game-renderer/src/battle/debugBlockData";
import { productionBladeFieldProfile } from "../../../../packages/game-renderer/src/battle/battleGrassResidency";
import {
  resolveBattleTerrainOptions,
  type BattleTerrainOptions,
} from "../../../../packages/game-renderer/src/battle/terrainOptions";
import type { BattleTerrainGrid } from "../../../../packages/game-renderer/src/battle/terrainFeatures";
import type { WorldRay } from "../../../../packages/renderer-core/src/camera3d";
import { claimCanvas } from "./canvasOwnership";
import { createSceneBackend, type SceneBackend } from "../sceneBackend";
import { createSceneLifecycle } from "../sceneLifecycle";
import { createTerrainPicking } from "../terrainPicking";
import { NativeGpuTelemetry, type NativeTimingQueryMode } from "../nativeGpuTelemetry";
import { trackNativeGpuAllocations } from "../nativeGpuAllocations";
import {
  beginGpuAdmission,
  GpuAdmissionBatch,
} from "../../../../packages/battle-renderer/src/gpuAdmission";
import type {
  BattleCrowdAssets,
  BattleSceneOptions,
  BattleTerrainInput,
} from "../../../../packages/battle-renderer/src/sceneTypes";
import { RAW_BATTLE_PROJECTION, RAW_BATTLE_SUBSTRATE } from "../../../../packages/battle-renderer/src/identity";

declare const __BATTLE_NATIVE_BACKEND__: SceneBackend;
/** Lab-only comparison override for the published impostor catalog. It is empty in
 * the product, which uses the offline bake published beside the appearance catalog. */
declare const __BATTLE_NATIVE_ATLAS_CATALOG__: string;
declare const __BATTLE_NATIVE_TIMING_QUERIES__: NativeTimingQueryMode;
const PUBLISHED_APPEARANCE_CATALOG = "/assets/soldiers/catalog.json";
const PUBLISHED_IMPOSTOR_CATALOG = "/assets/soldiers/impostors/catalog.json";
type Owner = Awaited<ReturnType<typeof createSceneBackend>>;
type Scene = Owner["scene"];
type View = Parameters<Scene["prepare"]>[0];
/** Crowd assets, replacement and admitted-pose diagnostics belong to the selected
 * raw world; the remaining comparison backends are retired at M9 and never owned them. */
type RawScene = Extract<Scene, { replaceCrowdAssets: unknown }>;
const rawScene = (scene: Scene | undefined): RawScene | null =>
  scene && "replaceCrowdAssets" in scene ? scene : null;
const twoFrames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

// Missing measurements stay explicit; the verification contract and rationale
// live in the live renderer README rather than being copied into each report.
const OPEN_DIAGNOSTIC_OBLIGATIONS = ["seating", "drawCalls", "grassRouting"] as const;

/** Lab-only frontend facade. Every GPU pass belongs to the selected native library;
 * the real menu, Game, ActionTimeline, input, HUD and benchmark remain production. */
export class BattleRenderer implements BattleRendererApi {
  readonly ready: Promise<void>;
  soldierAssets: Record<number, AppearanceBundle> | null = null;
  fixedTime: number | null = null;
  preserveFrozenEffects = false;
  private readonly backend = __BATTLE_NATIVE_BACKEND__;
  private readonly blockMode: boolean;
  private readonly timingQueries = __BATTLE_NATIVE_TIMING_QUERIES__;
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
  private telemetry: NativeGpuTelemetry | null = null;
  /** Joins presented frames to their own measured submission. It reads the
   *  observer's existing event stream through its own cursor, so the benchmark's
   *  raw event collection keeps its own. */
  private readonly frameTiming = new BattleGpuFrameTiming((after) => this.gpuEventsSince(after));
  private allocations: ReturnType<typeof trackNativeGpuAllocations> | null = null;
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
  /** The frame that actually presented: its view and the id it presented under,
   *  recorded as one record so a camera can never be published beside another
   *  frame's identity. Assigned only where the receipt is produced, so a
   *  preparation in flight, a submission that threw, or a presentation that
   *  failed after its draw all leave the previous presented frame standing. */
  private presentedFrame: { view: View; renderedFrameId: number } | null = null;
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
  private size = { width: 1, height: 1 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: BattleRendererOptions = {},
  ) {
    const params = new URLSearchParams(location.search);
    if (!["raw", "typegpu", "vgpu"].includes(this.backend))
      throw Error("Invalid native lab backend");
    if (!["enabled", "disabled"].includes(this.timingQueries))
      throw Error("Invalid native lab timing-query mode");
    // The debug-block view is implemented by the selected raw world only, like High.
    this.blockMode = params.get("debug") === "blocks";
    if (this.blockMode && this.backend !== "raw")
      throw Error(`The ${this.backend} candidate does not implement the source debug-block view`);
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
    // High is implemented by the selected raw world only; the discarded
    // candidates keep their fitted single map and reject it explicitly.
    if (resolveSunShadowMode("", this.settings.shadows) === "csm" && this.backend !== "raw")
      throw Error(`The ${this.backend} candidate implements the single shadow map, not High`);
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
  /** One published crowd generation: the shipped appearance catalog plus the offline
   *  property atlas baked beside it. A lab comparison run may redirect the atlas
   *  catalog; the product path resolves both from the published defaults. */
  private async assets(): Promise<BattleCrowdAssets> {
    const assets = await loadAppearanceCatalog(
      new URL(PUBLISHED_APPEARANCE_CATALOG, location.href).href,
    );
    this.check();
    assertGameplayAppearances(assets);
    const override =
      new URLSearchParams(location.search).get("atlas") || __BATTLE_NATIVE_ATLAS_CATALOG__;
    const url = new URL(override || PUBLISHED_IMPOSTOR_CATALOG, location.href);
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
  /** Every pose the crowd owner is presenting must exist in the replacement, both
   *  when it loads and again at admission: the simulation may submit new poses while
   *  the catalog load and the staged GPU resources wait. */
  private assertActivePoses(published: BattleCrowdAssets, scene: RawScene) {
    for (const pose of scene.admittedCrowdPoses()) {
      const [classId, clip] = pose.split("\u0000");
      if (!published.assets[Number(classId)]?.animation.clips.some((c) => c.name === clip))
        throw Error(`Reload does not contain active appearance ${classId} / clip ${clip}`);
    }
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
    const device = await adapter.requestDevice({
      // Requested independently of the timing-query control, so a disabled build
      // still runs on the same device configuration it is a control for.
      requiredFeatures: adapter.features.has("timestamp-query") ? ["timestamp-query"] : [],
    });
    this.device = device;
    this.releases.push(() => device.destroy());
    this.check();
    const allocations = trackNativeGpuAllocations(device);
    this.allocations = allocations;
    this.releases.push(() => allocations.restore());
    const telemetry = new NativeGpuTelemetry(device, this.backend, {
      timingQueries: this.timingQueries,
    });
    this.telemetry = telemetry;
    this.releases.push(() => telemetry.dispose());
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
      shadows: resolveSunShadowMode("", this.settings.shadows),
      debugBlocks: this.blockMode,
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
      await this.admitted(() => owner.scene.replaceTerrain(input));
      this.picking = createTerrainPicking(owner.scene.pickingMeshes());
      this.check(signal);
    }
    const { width, height } = this.size;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      await this.admitted(() => owner.scene.resize(width, height));
      this.check(signal);
      try {
        await this.admitted(() => owner.resizeOutput(width, height));
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
        const admissions = new GpuAdmissionBatch(this.device);
        const step = async (f: () => void | Promise<void>) => {
          await admissions.run(() => sync(f));
          this.check(signal);
        };
        const submit = async (source: "battle-draw" | "render-only") => {
          await admissions.settle();
          this.check(signal);
          await sync(() => this.submit(source));
          this.check(signal);
        };
        let failed = false;
        try {
          this.telemetry!.beginSubmission("battle-draw");
          await sync(() => this.reconcile(signal));
          this.check(signal);
          const c = packet.crowd;
          if (!c) throw Error("Native presentation requires admitted soldier assets");
          const key =
            packet.fixedTime === null
              ? null
              : `${frozenFrameKey(packet.camera, c.count)}|tick=${c.observationTick}|effects=${packet.preserveFrozenEffects ? 1 : 0}|${readoutsKey(c.standards, c.readouts)}`;
          if (key && key === this.frozenKey) {
            this.telemetry!.cancelSubmission();
            this.metrics = {
              ...this.metrics,
              skippedFrozenFrame: true,
              buildMs: 0,
              uploadMs: 0,
              drawMs: 0,
              frameCpuMs: cpuMs,
            };
            // The retained image carries the previous submission's identity, which
            // the timing join must not read as a newly presented frame.
            return this.presented({
              submitted: false,
              renderedFrameId: this.renderedFrameId,
              gpuSubmission: this.latestSubmission,
              submittedAtMs: performance.now(),
              cpuMs,
            });
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
          if (this.blockMode)
            await step(() =>
              rawScene(owner.scene)!.uploadDebugBlocks(
                battleDebugBlockTriangles({
                  positions: c.positions,
                  alive: c.alive,
                  count: c.count,
                  soldierUnit: this.staticData.soldierUnit,
                  unitTeam: this.staticData.teams,
                }),
              ),
            );
          if (c.triangles.length) await step(() => owner.scene.uploadTriangles(c.triangles));
          this.startupCallback = true;
          try {
            sync(() => startupAfterUploads?.());
          } finally {
            this.startupCallback = false;
          }
          if (this.startupRequested) {
            // The first startup render closes the pose+initial presentation record.
            // Later readiness renders have their own render-only measurement.
            if (!this.telemetry!.measuring) this.telemetry!.beginSubmission("render-only");
            await step(() => owner.scene.settleGrass(view.camera));
            await step(() => owner.scene.prepare(view));
            await submit("render-only");
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
          if (!this.telemetry!.measuring) this.telemetry!.beginSubmission("battle-draw");
          await step(() => owner.scene.prepare(view));
          await submit("battle-draw");
          drawMs = cpuMs - drawStart;
          if (this.startupRequested) {
            await this.device.queue.onSubmittedWorkDone();
            await twoFrames();
            this.check(signal);
            if (!this.telemetry!.measuring) this.telemetry!.beginSubmission("render-only");
            await step(() => owner.scene.settleGrass(view.camera));
            await step(() => owner.scene.prepare(view));
            await submit("render-only");
            this.readinessSubmissions++;
            await this.device.queue.onSubmittedWorkDone();
            this.check(signal);
            this.startupRequested = false;
            this.startupReady?.resolve();
            this.startupReady = null;
          }
          this.renderedFrameId++;
          this.presentedFrame = { view, renderedFrameId: this.renderedFrameId };
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
          return this.presented({
            submitted: true,
            renderedFrameId: this.renderedFrameId,
            gpuSubmission: this.latestSubmission,
            submittedAtMs: performance.now(),
            cpuMs,
          });
        } catch (error) {
          failed = true;
          throw error;
        } finally {
          // Drain before lifecycle ownership can release GPU resources. Keep the
          // operation/cancellation error if validation also failed during cleanup.
          if (failed) await admissions.settle().catch(() => {});
          else await admissions.settle();
        }
      });
    })();
    this.pendingPresentation = task;
    void task.then(
      () => {
        if (this.pendingPresentation === task) this.pendingPresentation = null;
      },
      (error) => {
        if (this.pendingPresentation === task) this.pendingPresentation = null;
        this.telemetry?.cancelSubmission();
        this.startupRequested = false;
        this.startupReady?.reject(error);
        this.startupReady = null;
      },
    );
    return task;
  }
  /** Every receipt the caller receives reaches the timing join first, so a frame's
   *  GPU cost is only ever reported under the identity that frame actually presented. */
  private presented(receipt: BattlePresentationReceipt): BattlePresentationReceipt {
    this.frameTiming.presented(receipt);
    return receipt;
  }
  private async admitted<T>(work: () => T | Promise<T>): Promise<T> {
    const admission = beginGpuAdmission(this.device);
    try {
      const pending = work();
      const accepted = admission();
      const [result] = await Promise.all([pending, accepted]);
      return result;
    } catch (error) {
      await admission().catch(() => {});
      throw error;
    }
  }
  private async submit(source: "battle-draw" | "render-only") {
    const telemetry = this.telemetry!;
    if (!telemetry.measuring) telemetry.beginSubmission(source);
    const admission = beginGpuAdmission(this.device);
    try {
      const pending = this.owner!.submitPresentation();
      const accepted = admission();
      const validation = Promise.all([pending, accepted]);
      const identity = telemetry.endSubmission(validation);
      await validation;
      if (!identity) throw Error("Native presentation submitted no command buffer");
      this.latestSubmission = identity;
    } catch (error) {
      telemetry.cancelSubmission();
      await admission().catch(() => {});
      throw error;
    }
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
      if (!this.presentedFrame) return;
      await this.lifecycle.run(async () => {
        const { view } = this.presentedFrame!;
        for (let i = 0; i < 2; i++) {
          this.check(signal);
          this.telemetry!.beginSubmission("render-only");
          await this.admitted(() => this.owner!.scene.settleGrass(view.camera));
          this.check(signal);
          await this.admitted(() => this.owner!.scene.prepare(view));
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
      () => {
        this.telemetry?.cancelSubmission();
      },
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
  frameMetrics() {
    return { ...this.metrics, gpuSubmission: this.latestSubmission };
  }
  gpuEventsSince(sequence: number) {
    return this.telemetry?.eventsSince(sequence) ?? null;
  }
  memoryInfo() {
    return null;
  }
  /** The pose the crowd owner actually admitted, not the instance scratch the next
   *  frame rebuilds in place. */
  debugSoldierAnim(index: number) {
    return rawScene(this.owner?.scene)?.debugSoldierAnim(index) ?? null;
  }
  /** Reload the published crowd after a bake. The replacement is staged: a failed
   *  load or admission keeps the last valid world, disposal releases the staged
   *  resources, and success keeps the current playback while invalidating the frozen
   *  presentation so the next frame actually resubmits. */
  reloadSoldierAssets(): Promise<void> {
    const prior = this.pendingPresentation,
      previous = this.readiness;
    const job = (async () => {
      await this.ready;
      await previous;
      await prior;
      this.check();
      const scene = rawScene(this.owner?.scene);
      if (!scene) throw Error(`The ${this.backend} comparison backend does not own crowd assets`);
      const published = await this.assets();
      this.check();
      this.assertActivePoses(published, scene);
      await this.lifecycle.run(async () => {
        await scene.replaceCrowdAssets(published, () => {
          this.check();
          this.assertActivePoses(published, scene);
        });
        this.check();
        this.soldierAssets = published.assets;
        // Replacement changes the drawn generation: the retained frozen image is no
        // longer what this crowd would present. Built instances stay, so playback continues.
        this.invalidate();
      });
    })();
    // Published synchronously, as in settlePresentedFrame: presentations started
    // from here on park on this barrier instead of racing the replacement into
    // scene ownership, and they do not inherit its failure.
    const barrier = job.then(
      () => {},
      () => {},
    );
    this.readiness = barrier;
    void barrier.then(() => {
      if (this.readiness === barrier) this.readiness = null;
    });
    return job;
  }
  stats(): BattleRendererStats {
    const scene = this.owner?.scene;
    // Scene content diagnostics belong to the selected raw world; the comparison
    // backends never owned them and report null rather than a shape.
    const installed = rawScene(scene)?.stats() ?? null;
    const native = installed ?? scene?.stats() ?? null;
    const gpuFrame = this.frameTiming.correlatedFrame();
    const presented = this.presentedFrame;
    const camera = presented?.view.camera ?? null;
    const diagnostics: BattleInstalledSceneDiagnostics = {
      // The population the installed static simulation data says must be drawn.
      // `soldiers` below it means the crowd owner is behind, not a smaller army.
      expectedSoldiers: this.staticData.soldierUnit.length,
      // Identity of the world actually installed. The comparison
      // backends are not this one and do not borrow its name.
      substrate: installed ? RAW_BATTLE_SUBSTRATE : null,
      projection: installed ? RAW_BATTLE_PROJECTION : null,
      environment: installed?.environment ?? null,
      // Detached from the caller's mutable snapshot. NOT the scene's
      // `preparedCamera`, which a preparation still in flight has already moved
      // past this one.
      camera: camera
        ? { ...camera, camera3d: { ...camera.camera3d, target: [...camera.camera3d.target] } }
        : null,
      presentedFrameId: presented?.renderedFrameId ?? null,
      depth: installed?.depth ?? null,
      // Unavailable, never a synthesized pass or a rotating sample presented as
      // a whole-population verdict: see `openObligations`.
      seating: null,
      drawCalls: null,
      openObligations: OPEN_DIAGNOSTIC_OBLIGATIONS,
    };
    return {
      ready: this.soldierAssets !== null && native?.crowd.ready === true,
      soldiers: native?.crowd.instances ?? 0,
      renderer: "gpu",
      device: this.deviceLabel,
      backend: this.backend,
      ...diagnostics,
      // Grass is its own owner; it is grouped with the surface it covers because
      // that is the content one check reads, not a copy of another stats tree.
      terrain: installed ? { ...installed.terrain, grass: installed.grass } : null,
      tacticalLines: installed?.tacticalLines ?? null,
      shadows: installed?.shadows ?? null,
      performance: {
        buildMs: this.metrics.buildMs,
        uploadMs: this.metrics.uploadMs,
        drawMs: this.metrics.drawMs,
        frameCpuMs: this.metrics.frameCpuMs,
        // The last presented frame whose own submission completed: its observed
        // span, gaps and compute included. Not a sum of overlapping passes, and
        // not the frame currently in flight — `gpuFrame` identifies which frame
        // it is. Null while nothing has completed.
        gpuTimeMs: gpuFrame?.observedGpuSpanMs ?? null,
        gpuTimeMetric: gpuFrame ? "correlated-complete-submission-span" : null,
        gpuFrame,
      },
      native,
      submission: {
        actualQueueSubmissions: this.telemetry?.submissionCount ?? 0,
        readinessSubmissions: this.readinessSubmissions,
        latest: this.latestSubmission,
      },
      gpuTiming: this.telemetry?.stats() ?? { supported: false },
      gpuCorrelation: this.frameTiming.status(),
      labBuild: {
        backend: this.backend,
        timingQueryFlag: "BATTLE_NATIVE_TIMING_QUERIES",
        timingQueries: this.timingQueries,
        scope:
          this.timingQueries === "disabled"
            ? "compile-time control: no timestamp query sets, no injected timestampWrites, no query resolve/copy submission and no timestamp readback; GPU timing is unavailable, never zero. CPU submission observation, admission scopes, device features and drawing are unchanged, so this is an incremental query/readback overhead control, not an uninstrumented renderer"
            : "compile-time default: this observer's timestamp queries, resolve/copy submission and readback are active",
      },
      allocations: this.allocations
        ? {
            scope: "requested buffer and texture bytes, including telemetry; not physical VRAM",
            ...this.allocations.snapshot(),
          }
        : null,
      cpuCoverage:
        "measured synchronous API calls and instance packing; asynchronous continuations are not CPU-profiled",
      picking: { triangles: this.picking?.triangles ?? 0 },
    };
  }
  dispose() {
    this.terrainAvailable();
    this.frameTiming.dispose();
    this.lifecycle.dispose();
    this.audio?.dispose();
    this.audio = null;
  }
}
