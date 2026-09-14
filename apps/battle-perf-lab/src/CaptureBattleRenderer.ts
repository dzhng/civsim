import {
  BattleRenderer as ProductionBattleRenderer,
  type BattleRendererOptions,
} from "../../../web/src/battle/renderer";
import {
  resolveGraphicsSettings,
  getGraphicsSettings,
} from "../../../web/src/shared/graphicsSettings";
import { resolveBattleEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import type { BattleReplayAssets, BattleReplayFrame, BattleReplaySettings } from "./fixture";
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
  frame: BattleReplayFrame;
  reference: ReturnType<ProductionBattleRenderer["stats"]>;
}

/** Installed only by the lab Vite config; ordinary builds perform no capture copies. */
export class BattleRenderer extends ProductionBattleRenderer {
  private staticCapture: Pick<BattleReplayAssets, "soldierUnit" | "teams" | "classes"> | null =
    null;
  private terrainCapture: Pick<BattleReplayAssets, "terrain" | "terrainOptions"> | null = null;
  private drawCapture: Draw | null = null;
  private triangleCapture: Float32Array = new Float32Array();
  private readoutCapture: Parameters<ProductionBattleRenderer["setUnitReadouts"]> = [[], []];
  private active: {
    benchmark: ReplayManifest["benchmark"];
    appearances: NonNullable<ProductionBattleRenderer["soldierAssets"]>;
    framebuffer: { width: number; height: number };
    window: ReplayWindow;
    assets: Blob;
    settings: Blob;
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
  private api;

  constructor(
    private readonly captureCanvas: HTMLCanvasElement,
    private readonly captureOptions: BattleRendererOptions = {},
  ) {
    super(captureCanvas, captureOptions);
    this.api = {
      start: (frameLimit = 30, byteLimit = 64 * 1024 * 1024) =>
        this.startCapture(frameLimit, byteLimit),
      cancel: () => this.finishCapture("cancelled"),
      status: () => ({
        active: this.active !== null,
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
    super.draw(...args);
    if (this.active) this.drawCapture = args;
  }

  override drawTris(...args: Parameters<ProductionBattleRenderer["drawTris"]>) {
    super.drawTris(...args);
    if (this.active) this.triangleCapture = args[0];
  }

  override setUnitReadouts(...args: Parameters<ProductionBattleRenderer["setUnitReadouts"]>) {
    super.setUnitReadouts(...args);
    this.readoutCapture = args;
  }

  override drawTacticalLines(...args: Parameters<ProductionBattleRenderer["drawTacticalLines"]>) {
    const before = this.frameMetrics().renderedFrameId;
    super.drawTacticalLines(...args);
    const metrics = this.frameMetrics();
    if (this.active && this.drawCapture && metrics.renderedFrameId !== before) {
      try {
        if (
          this.fixedTime !== null ||
          this.soldierAssets !== this.active.appearances ||
          this.captureCanvas.width !== this.active.framebuffer.width ||
          this.captureCanvas.height !== this.active.framebuffer.height
        )
          throw new Error("Frozen state, appearances or framebuffer changed during capture");
        const [positions, facings, playback, alive, count, , simTick, frameDt] = this.drawCapture;
        const reference = this.stats();
        const frame: BattleReplayFrame = {
          frameId: metrics.renderedFrameId,
          simTick,
          timeSeconds: reference.standards!.timeSeconds,
          frameDt: frameDt ?? 0,
          camera: reference.camera!,
          positions,
          facings,
          playback,
          alive,
          count,
          standards: this.readoutCapture[0],
          readouts: this.readoutCapture[1],
          triangles: this.triangleCapture,
          tacticalLines: args[0],
        };
        const stopped = this.active.window.append({
          frame,
          reference,
        } satisfies CapturedReplayFrame);
        if (stopped !== "recording") {
          const referenceImage =
            stopped === "frame-limit"
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
    this.drawCapture = null;
    this.triangleCapture = new Float32Array();
  }

  private startCapture(frameLimit: number, byteLimit: number): Promise<ReplayManifest> {
    if (this.active || this.finishing) throw new Error("Capture already in progress");
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
    if (benchmark && benchmark.phase !== "running")
      throw new Error("Wait for the benchmark's running phase before capture");
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
      ...this.staticCapture,
      ...this.terrainCapture,
      soldierCatalogUrl: "/assets/soldiers/catalog.json",
    };
    const assetBlob = encodeReplayValue(assets);
    const settingsBlob = encodeReplayValue(settings);
    const recording = new ReplayWindow(frameLimit, byteLimit, assetBlob.size + settingsBlob.size);
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
        appearances: this.soldierAssets!,
        framebuffer: { width: this.captureCanvas.width, height: this.captureCanvas.height },
        window: recording,
        assets: assetBlob,
        settings: settingsBlob,
        resolve,
        reject,
      };
    });
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
        sourceUrl: location.href,
        benchmark: active.benchmark,
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
