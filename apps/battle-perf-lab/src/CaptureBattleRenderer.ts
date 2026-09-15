import {
  beginGrassPublicationCapture,
  takeGrassPublications,
  type GrassPublication,
} from "./CaptureGrassResidency";
import { PresentationSpool, validateSpoolWindows, type SpoolWindow } from "./PresentationSpool";
import { readGrassDraws, readGroundInputs } from "./threeInspection";
import {
  capturedWorld,
  hasPresented,
  observePresentations,
  type PresentationEvent,
} from "./captureWorldRegistry";
import {
  BattleRenderer as ProductionBattleRenderer,
  type BattleRendererOptions,
} from "../../../web/src/battle/renderer";
import {
  resolveGraphicsSettings,
  getGraphicsSettings,
} from "../../../web/src/shared/graphicsSettings";
import { resolveBattleEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import type {
  BattleReplayAssets,
  BattleReplayFrame,
  BattleReplaySettings,
  BattleReplayCommand,
} from "./fixture";
import {
  encodeReplayValue,
  hashReplayBlob,
  hashLoadedAppearances,
  ReplayWindow,
} from "./replayArchive";
import { saveReplayArchive, type ReplayManifest } from "./captureStore";

type BenchmarkCaptureApi = {
  status(): NonNullable<ReplayManifest["benchmark"]>;
  cancel(): void;
};
const benchmarkApi = () =>
  (window as Window & { __game?: { benchmark?: BenchmarkCaptureApi } }).__game?.benchmark;

type Draw = Parameters<ProductionBattleRenderer["draw"]>;
export interface CapturedReplayFrame {
  animationFrame: number;
  grassPublications?: GrassPublication[];
  frame: BattleReplayFrame;
  reference: ReturnType<ProductionBattleRenderer["stats"]>;
}

/** Installed only by the lab Vite config; ordinary builds perform no capture copies. */
export class BattleRenderer extends ProductionBattleRenderer {
  declare readonly ready: Promise<void>;
  private sourceReady = false;
  private staticCapture: Pick<BattleReplayAssets, "soldierUnit" | "teams" | "classes"> | null =
    null;
  private terrainCapture: Pick<BattleReplayAssets, "terrain" | "terrainOptions"> | null = null;
  private simTick = 0;
  private spoolArmed: readonly SpoolWindow[] | null = null;
  private spool: PresentationSpool | null = null;
  private spoolSink = "";
  private commands: BattleReplayCommand[] = [];
  private active: {
    benchmark: ReplayManifest["benchmark"];
    stopAtRunning: boolean;
    appearances: NonNullable<ProductionBattleRenderer["soldierAssets"]>;
    framebuffer: { width: number; height: number };
    window: ReplayWindow;
    assets: Blob;
    ground: Blob;
    settings: Blob;
    resolve: (manifest: ReplayManifest) => void;
    reject: (error: unknown) => void;
  } | null = null;
  private armed: {
    resolve: (manifest: ReplayManifest) => void;
    reject: (error: unknown) => void;
  } | null = null;
  private finishing = false;
  private progress: {
    step: string;
    completed: number;
    total: number;
    bytes: number;
    frames: number;
    error?: string;
  } = {
    step: "idle",
    completed: 0,
    total: 0,
    bytes: 0,
    frames: 0,
  };
  private stopObserving: () => void;
  private api;

  constructor(
    private readonly captureCanvas: HTMLCanvasElement,
    private readonly captureOptions: BattleRendererOptions = {},
  ) {
    super(captureCanvas, captureOptions);
    const productionReady = this.ready;
    this.ready = productionReady.then(() => {
      this.sourceReady = true;
      if (this.spoolArmed) {
        this.startSpool();
      }
    });
    this.stopObserving = observePresentations(captureCanvas, {
      command: (command) => {
        if (this.active || this.armed || this.spoolArmed || this.spool) this.commands.push(command);
      },
      presented: (event) => this.capturePresentation(event),
    });
    this.api = {
      spool: (windows: readonly SpoolWindow[], sink: string) => {
        if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(sink))
          throw Error("Spool requires a local disk sink");
        this.spoolSink = sink;
        validateSpoolWindows(windows);
        if (
          this.sourceReady ||
          hasPresented(captureCanvas) ||
          this.active ||
          this.armed ||
          this.spool ||
          this.spoolArmed
        )
          throw new Error(
            "Arm spool capture before the first presentation, without another capture",
          );
        this.spoolArmed = structuredClone(windows);
      },
      spoolStatus: () => this.spool?.status() ?? { armed: this.spoolArmed !== null },
      spoolInputs: () => this.spool?.inputs ?? null,
      spoolIdentity: async () => {
        if (!this.spool?.status().sourceComplete || this.spool.status().queued)
          throw new Error("Drain the completed source recording before hashing assets");
        const appearances = await hashLoadedAppearances(this.soldierAssets!);
        const ground = encodeReplayValue(readGroundInputs(capturedWorld(this.captureCanvas)));
        return {
          appearances,
          groundHash: await hashReplayBlob(ground),
          groundBytes: ground.size,
          inputsHash: await hashReplayBlob(this.spool.inputs),
          benchmark: benchmarkApi()?.status(),
        };
      },
      stopSpool: () => {
        this.spoolArmed = null;
        this.spool?.dispose();
      },
      start: (frameLimit = 30, byteLimit = 64 * 1024 * 1024) =>
        this.startCapture(frameLimit, byteLimit),
      prelude: () => {
        if (hasPresented(captureCanvas))
          throw new Error("Arm the prelude before the first presentation");
        if (this.active || this.armed || this.finishing || this.spoolArmed || this.spool)
          throw new Error("Capture already in progress");
        return new Promise<ReplayManifest>((resolve, reject) => {
          this.armed = { resolve, reject };
        });
      },
      cancel: () => {
        this.armed?.reject(new Error("Prelude cancelled before first presentation"));
        this.armed = null;
        return this.finishCapture("cancelled");
      },
      status: () => ({
        active: this.active !== null,
        armed: this.armed !== null,
        finishing: this.finishing,
        frames: this.active?.window.frames.length ?? this.progress.frames,
        bytes: this.active?.window.bytes ?? this.progress.bytes,
        progress: { ...this.progress },
      }),
    };
    window.__battleCapture = this.api;
  }

  override setStatic(...args: Parameters<ProductionBattleRenderer["setStatic"]>) {
    super.setStatic(...args);
    if (this.active) {
      this.active.reject(new Error("Static army changed during capture"));
      this.active = null;
    }
    this.staticCapture = {
      soldierUnit: new Uint32Array(args[0]),
      teams: [...args[1]],
      classes: [...args[2]],
    };
  }

  override setTerrain(...args: Parameters<ProductionBattleRenderer["setTerrain"]>) {
    super.setTerrain(...args);
    if (this.active) {
      this.active.reject(new Error("Terrain changed during capture"));
      this.active = null;
    }
    this.terrainCapture = {
      terrain: structuredClone(args[0]),
      terrainOptions: structuredClone(args[1] ?? {}),
    };
  }

  override draw(...args: Draw) {
    this.simTick = args[6];
    super.draw(...args);
  }

  private startSpool() {
    beginGrassPublicationCapture();
    const { assets, settings } = this.captureInputs();
    this.spool = new PresentationSpool(
      this.captureCanvas,
      assets,
      settings,
      this.spoolArmed!,
      () => benchmarkApi()?.cancel(),
      this.spoolSink,
      () => readGrassDraws(capturedWorld(this.captureCanvas)),
    );
    this.spoolArmed = null;
  }

  private capturePresentation(event: PresentationEvent) {
    const grassPublications = takeGrassPublications();
    if (this.spool && this.commands.length) {
      const reference = this.stats();
      const benchmark = benchmarkApi()?.status();
      this.spool.offer(
        {
          frame: {
            frameId: event.sequence,
            simTick: this.simTick,
            timeSeconds: reference.standards!.timeSeconds,
            camera: reference.camera!,
            commands: this.commands,
          },
          reference,
          animationFrame: event.animationFrame,
          grassPublications,
        },
        benchmark?.elapsedMs ?? 0,
        benchmark?.phase === "running",
      );
    }
    if (this.armed && this.commands.length) {
      const armed = this.armed;
      this.armed = null;
      try {
        void this.startCapture(120, 128 * 1024 * 1024, true).then(armed.resolve, armed.reject);
      } catch (error) {
        armed.reject(error);
      }
    }
    if (this.active && this.commands.length) {
      try {
        if (
          this.fixedTime !== null ||
          this.soldierAssets !== this.active.appearances ||
          this.captureCanvas.width !== this.active.framebuffer.width ||
          this.captureCanvas.height !== this.active.framebuffer.height
        )
          throw new Error("Frozen state, appearances or framebuffer changed during capture");
        const reference = this.stats();
        const frame: BattleReplayFrame = {
          frameId: event.sequence,
          simTick: this.simTick,
          timeSeconds: reference.standards!.timeSeconds,
          camera: reference.camera!,
          commands: this.commands,
        };
        let stopped: ReplayManifest["stopped"] | "recording" = this.active.window.append({
          frame,
          reference,
          animationFrame: event.animationFrame,
          grassPublications,
        } satisfies CapturedReplayFrame);
        if (
          stopped === "recording" &&
          this.active.stopAtRunning &&
          benchmarkApi()?.status().phase === "running"
        )
          stopped = "running-boundary";
        if (stopped !== "recording") {
          const referenceImage =
            stopped === "frame-limit" || stopped === "running-boundary"
              ? new Promise<Blob>((resolve, reject) => {
                  this.captureCanvas.toBlob(
                    (blob) =>
                      blob ? resolve(blob) : reject(new Error("Source image capture failed")),
                    "image/png",
                  );
                })
              : undefined;
          void this.finishCapture(stopped, referenceImage, referenceImage ? frame.frameId : null);
        }
      } catch (error) {
        this.active?.reject(error);
        this.active = null;
      }
    }
    this.commands = [];
  }

  private startCapture(
    frameLimit: number,
    byteLimit: number,
    stopAtRunning = false,
  ): Promise<ReplayManifest> {
    if (this.active || this.finishing || this.spoolArmed || this.spool)
      throw new Error("Capture already in progress");
    if (!this.staticCapture || !this.terrainCapture || !this.soldierAssets || !this.stats().ready)
      throw new Error("Battle renderer is not ready for capture");
    if (this.fixedTime !== null || new URLSearchParams(location.search).get("debug") === "blocks")
      throw new Error(
        "Capture requires ordinary animated rendering, without frozen/debug substitutions",
      );
    if (frameLimit > 120 || byteLimit > 128 * 1024 * 1024)
      throw new RangeError(
        "Short capture windows are limited to 120 frames and 128 MiB of frame blobs",
      );
    const benchmark = benchmarkApi()?.status() ?? null;
    if (
      benchmark &&
      benchmark.phase !== "running" &&
      !(stopAtRunning && benchmark.phase === "preparing")
    )
      throw new Error("Wait for the benchmark's running phase before capture");
    const { assets, settings } = this.captureInputs();
    const assetBlob = encodeReplayValue(assets);
    const settingsBlob = encodeReplayValue(settings);
    const groundBlob = encodeReplayValue(readGroundInputs(capturedWorld(this.captureCanvas)));
    const recording = new ReplayWindow(
      frameLimit,
      byteLimit,
      assetBlob.size + settingsBlob.size + groundBlob.size,
    );
    this.progress = {
      step: "recording",
      completed: 0,
      total: frameLimit,
      bytes: recording.bytes,
      frames: 0,
    };
    return new Promise((resolve, reject) => {
      this.active = {
        benchmark: structuredClone(benchmark),
        stopAtRunning,
        appearances: this.soldierAssets!,
        framebuffer: { width: this.captureCanvas.width, height: this.captureCanvas.height },
        window: recording,
        assets: assetBlob,
        ground: groundBlob,
        settings: settingsBlob,
        resolve,
        reject,
      };
    });
  }

  private captureInputs() {
    const stats = this.stats();
    const params = new URLSearchParams(location.search);
    const graphics = resolveGraphicsSettings(
      location.search,
      this.captureOptions.graphics ?? getGraphicsSettings(),
    );
    const settings: BattleReplaySettings = {
      shadows: stats.shadows!.mode,
      grassQuality: stats.terrain!.grass.productionSamplingProfile.quality,
      grass: graphics.grass,
      farGrass: graphics.farGrass,
      bloom: stats.post!.bloom.enabled,
      environment: resolveBattleEnvironment(params.get("env") ?? this.captureOptions.environment)
        .id,
      post: stats.post!.enabled,
      postGrade: stats.post!.grade.uniforms,
      viewport: {
        width: this.captureCanvas.clientWidth,
        height: this.captureCanvas.clientHeight,
        pixelRatio: window.devicePixelRatio || 1,
      },
    };
    const assets: BattleReplayAssets = {
      ...this.staticCapture!,
      ...this.terrainCapture!,
      soldierCatalogUrl: "/assets/soldiers/catalog.json",
    };
    return { assets, settings };
  }

  private async finishCapture(
    stopped: ReplayManifest["stopped"],
    image?: Promise<Blob>,
    referenceFrameId: number | null = null,
  ): Promise<void> {
    const active = this.active;
    if (!active) return;
    this.active = null;
    this.finishing = true;
    const boundaryBenchmark = benchmarkApi()?.status() ?? null;
    // The boundary PNG has already copied the submitted canvas. End this explicitly
    // partial lab run so continued battle work cannot starve digest/IDB callbacks.
    if (active.benchmark) benchmarkApi()?.cancel();
    this.progress = {
      step: "source-image",
      completed: 0,
      total: 1,
      bytes: active.window.bytes,
      frames: active.window.frames.length,
    };
    try {
      const referenceImage = await image;
      this.progress.step = "grass-indirect-readback";
      const grassDraws = await readGrassDraws(capturedWorld(this.captureCanvas));
      if (active.window.bytes + (referenceImage?.size ?? 0) > active.window.byteLimit)
        throw new Error("Source image exceeds the total capture byte cap");
      const frameHashes: string[] = [];
      this.progress.step = "frame-hashes";
      this.progress.total = active.window.frames.length;
      for (const frame of active.window.frames) {
        frameHashes.push(await hashReplayBlob(frame));
        this.progress.completed = frameHashes.length;
      }
      const poseHashes: string[] = [];
      this.progress.step = "pose-hashes";
      this.progress.completed = 0;
      this.progress.total = active.window.poses.length;
      for (const pose of active.window.poses) {
        poseHashes.push(await hashReplayBlob(pose));
        this.progress.completed = poseHashes.length;
      }
      const appearances = await hashLoadedAppearances(
        active.appearances,
        (completed, total, bytes) => {
          this.progress.step = "appearance-hashes";
          this.progress.completed = completed;
          this.progress.total = total;
          this.progress.bytes = active.window.bytes + bytes;
        },
      );
      this.progress.step = "manifest-hashes";
      const manifest: ReplayManifest = {
        source: "production-presented",
        grassDraws,
        sourceUrl: location.href,
        benchmark: active.benchmark,
        boundaryBenchmark,
        provisional: true,
        capturedAt: new Date().toISOString(),
        stopped,
        timing: "capture-overhead-not-a-performance-run",
        framebuffer: active.framebuffer,
        referenceFrameId,
        referenceImageHash: referenceImage ? await hashReplayBlob(referenceImage) : null,
        frameCount: active.window.frames.length,
        frameBytes: active.window.frames.reduce((bytes, frame) => bytes + frame.size, 0),
        poseBytes: active.window.poses.reduce((bytes, pose) => bytes + pose.size, 0),
        windowBytes: active.window.bytes + (referenceImage?.size ?? 0),
        frameHashes,
        poseHashes,
        assetsHash: await hashReplayBlob(active.assets),
        groundHash: await hashReplayBlob(active.ground),
        groundBytes: active.ground.size,
        settingsHash: await hashReplayBlob(active.settings),
        loadedAppearanceHash: appearances.hash,
        assetsBytes: active.assets.size,
        settingsBytes: active.settings.size,
        loadedAppearanceEncodedBytes: appearances.encodedBytes,
        largestAppearanceBytes: appearances.largestAppearanceBytes,
      };
      this.progress.step = "indexeddb-save";
      await saveReplayArchive({
        manifest,
        assets: active.assets,
        settings: active.settings,
        frames: active.window.frames,
        poses: active.window.poses,
        referenceImage,
      });
      this.progress.step = "complete";
      this.progress.bytes = manifest.windowBytes;
      active.resolve(manifest);
    } catch (error) {
      this.progress.error = error instanceof Error ? error.message : String(error);
      active.reject(error);
    } finally {
      this.finishing = false;
    }
  }

  override dispose() {
    this.stopObserving();
    this.spoolArmed = null;
    this.spool?.dispose();
    this.armed?.reject(new Error("Renderer disposed before prelude"));
    this.armed = null;
    if (this.active) {
      this.active.reject(new Error("Renderer disposed during capture"));
      this.active = null;
    }
    if (window.__battleCapture === this.api) delete window.__battleCapture;
    super.dispose();
  }
}

declare global {
  interface Window {
    __battleCapture?: BattleRenderer["api"];
  }
}
