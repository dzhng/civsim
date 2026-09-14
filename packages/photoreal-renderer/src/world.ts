// PhotorealWorld — the ONE owner of the three.js WebGPU substrate for the
// photoreal ladder. One
// WebGPURenderer + one Scene per route, driven by a manual rAF loop (never
// setAnimationLoop) and an OWNED time uniform.
//
// Determinism rule (encoded here, enforced forever): the TSL `time` node is
// BANNED in this package and everything built on it. All animation keys off
// setTime() + seeded RNG, so a fixed setTime renders byte-identical frames and
// snapCheck baselines stay byte-stable.
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import type { CivsimEnvironmentId } from "../../game-renderer/src/environment/environment";

// The ONE tone-map operator, engine-wide. Applied
// by the renderer's output — or, when a post chain is installed, by three's
// renderOutput at the tail of the chain (world.post never re-decides it).
//
// AgX carries the reference's warm golden-hour cast
// with a soft highlight rolloff on the sun disc / sea glint and lower
// far-distance contrast (true aerial perspective). Its one
// cost, slightly muted team pips, stays legible (they remain unambiguous) and
// is a team-colour-layer concern, not the grade's.
const BATTLE_TONE_MAPPING: THREE.ToneMapping = THREE.AgXToneMapping;

interface SortItem {
  groupOrder: number | null;
  renderOrder: number | null;
  z: number | null;
  id: number | null;
}

/** A post-processing chain the world routes its final render through. When
 *  null, render() draws straight to the swapchain. Kept as a minimal
 *  interface so world.ts owns no post dependency — the battle world installs a
 *  BattlePostChain; lab/other routes stay chain-free. */
interface WorldPostRenderer {
  render(scene: THREE.Scene, camera: THREE.Camera): void;
}

interface PhotorealWorldStats {
  drawCalls: number;
  triangles: number;
  /** GPU render-pass ms via trackTimestamp; null until resolved or when the
   *  adapter cannot deliver timestamps (failure-tolerant — SwiftShader stays green). */
  gpuTimeMs: number | null;
  timeSeconds: number;
  /** Adapter identity ("vendor / architecture / description") — the perf gates
   *  read this to prove a hardware run measured a real (non-software) adapter. */
  device: string;
}

export class PhotorealWorld {
  readonly renderer: THREE.WebGPURenderer;
  readonly scene: THREE.Scene;
  /** The one time uniform every animated TSL material in this world reads. */
  readonly uTime = uniform(0);
  /** Optional post-processing chain; when set, render() routes the
   *  final frame through it (bloom + the ONE tone-map at the tail). */
  post: WorldPostRenderer | null = null;
  /** Set by applyCivsimEnvironment — the stats identity field proving the ONE
   *  environment-preset owner (CIVSIM_ENVIRONMENTS) dressed this world. */
  environmentId: CivsimEnvironmentId | null = null;
  /** Set by applyCivsimEnvironment — the atmosphere ownership identity
   *  (which sky tier rendered, which aerial owner hazed) for the stats seam. */
  atmosphere: Record<string, unknown> | null = null;
  /** Set by applyCivsimEnvironment — the ONE sun light, so shadowRig can
   *  configure how it casts without re-deriving it. */
  sunLight: THREE.DirectionalLight | null = null;
  private timeSeconds = 0;
  private gpuTimeMs: number | null = null;
  private readonly timestampReadbacks = new Set<Promise<void>>();
  private disposed = false;
  private environmentDisposer: (() => void) | null = null;
  // Snapshotted at render(): three's internal animation loop calls
  // info.reset() every browser frame, so live info.render counts read 0
  // whenever stats() runs outside the render call's own task.
  private lastDrawCalls = 0;
  private lastTriangles = 0;

  private constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;
  }

  static async create(
    canvas: HTMLCanvasElement,
    options: { antialias?: boolean } = {},
  ): Promise<PhotorealWorld> {
    const renderer = new THREE.WebGPURenderer({
      canvas,
      // Default on; the single-sample battle world opts out (the production battle
      // shell renders at sampleCount 1, and 4× MSAA visibly washes out the
      // sub-pixel crowd at gameplay zoom).
      antialias: options.antialias ?? true,
      trackTimestamp: true,
      // The engine depth contract is reverse-Z (near → 1, far → 0); this option
      // makes three build the same projection cameraBridge produces CPU-side.
      reversedDepthBuffer: true,
    });
    // three's WebGPU node materials include shadow sampling in the lighting
    // graph only when the renderer shadow-map contract is active at build time.
    // Shadow-casting lights still opt in per world/lab route; enabling the
    // renderer here prevents post/pass nodes from caching a no-shadow graph.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = BATTLE_TONE_MAPPING;
    // TSL/three@0.185 HAZARD: with
    // `reversedDepthBuffer` three sorts its render lists then REVERSES them
    // wholesale (RenderList.sort → list.reverse()), inverting renderOrder
    // semantics — a low-renderOrder backdrop/sky would draw LAST and cover
    // the world. These comparators pre-invert every axis so the post-reverse
    // order is the classic painter contract (renderOrder asc; opaque
    // front-to-back, transparent back-to-front) every photoreal world layers
    // by; the sky dome uses the painter band on lab routes too.
    renderer.setOpaqueSort(
      (a: SortItem, b: SortItem) =>
        (b.groupOrder ?? 0) - (a.groupOrder ?? 0) ||
        (b.renderOrder ?? 0) - (a.renderOrder ?? 0) ||
        (b.z ?? 0) - (a.z ?? 0) ||
        (b.id ?? 0) - (a.id ?? 0),
    );
    renderer.setTransparentSort(
      (a: SortItem, b: SortItem) =>
        (b.groupOrder ?? 0) - (a.groupOrder ?? 0) ||
        (b.renderOrder ?? 0) - (a.renderOrder ?? 0) ||
        (a.z ?? 0) - (b.z ?? 0) ||
        (b.id ?? 0) - (a.id ?? 0),
    );
    await renderer.init();
    return new PhotorealWorld(renderer, new THREE.Scene());
  }

  /** Drive the owned time uniform; the only clock promoted code may animate from. */
  setTime(seconds: number): void {
    this.timeSeconds = seconds;
    this.uTime.value = seconds;
  }

  get time(): number {
    return this.timeSeconds;
  }

  ownEnvironment(dispose: () => void): void {
    this.environmentDisposer?.();
    this.environmentDisposer = dispose;
  }

  resize(width: number, height: number, pixelRatio = 1): void {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
  }

  render(camera: THREE.Camera): void {
    if (this.disposed) return;
    if (this.post) this.post.render(this.scene, camera);
    else this.renderer.render(this.scene, camera);
    this.lastDrawCalls = this.renderer.info.render.drawCalls;
    this.lastTriangles = this.renderer.info.render.triangles;
    this.pollGpuTime();
  }

  private pollGpuTime(): void {
    // Pinned Three exposes this allocation gate; its published Backend type omits it.
    const backend = this.renderer.backend as typeof this.renderer.backend & {
      trackTimestamp: boolean;
    };
    if (!backend.trackTimestamp) return;
    const failed = () => {
      backend.trackTimestamp = false;
      this.gpuTimeMs = null;
    };
    try {
      // The independent pools must both drain, even though the standing metric
      // deliberately reports render passes only (not a correlated frame total).
      const readback = Promise.all([
        this.renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER).catch(failed),
        this.renderer.resolveTimestampsAsync(THREE.TimestampQuery.COMPUTE).catch(failed),
      ])
        .then(() => {
          if (!backend.trackTimestamp || this.disposed) return;
          const t = this.renderer.info.render.timestamp;
          if (typeof t === "number" && t > 0) this.gpuTimeMs = t;
        })
        .catch(failed)
        .finally(() => {
          this.timestampReadbacks.delete(readback);
        });
      this.timestampReadbacks.add(readback);
    } catch {
      failed();
    }
  }

  stats(): PhotorealWorldStats {
    return {
      drawCalls: this.lastDrawCalls,
      triangles: this.lastTriangles,
      gpuTimeMs: this.gpuTimeMs,
      timeSeconds: this.timeSeconds,
      device: this.deviceLabel(),
    };
  }

  /** Same "vendor / architecture / description" format the bespoke shell
   *  published (GPUDevice.adapterInfo; 'unknown' before init/without support). */
  private deviceLabel(): string {
    const device = (this.renderer.backend as unknown as { device?: GPUDevice }).device;
    const info = (device as (GPUDevice & { adapterInfo?: GPUAdapterInfo }) | undefined)
      ?.adapterInfo;
    if (!info) return "unknown";
    return (
      [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ") || "unknown"
    );
  }

  /** Await the GPU queue so the presented frame is fully rasterized before a
   *  screenshot — the seam the byte-determinism scene checks lean on. */
  async settlePresentedFrame(): Promise<void> {
    const device = (this.renderer.backend as unknown as { device?: GPUDevice }).device;
    if (device) await device.queue.onSubmittedWorkDone();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.environmentDisposer?.();
    this.environmentDisposer = null;
    const context = (this.renderer.backend as unknown as { context?: GPUCanvasContext }).context;
    context?.unconfigure?.();
    // Three destroys query buffers in dispose(), even while mapAsync is pending.
    // Release the canvas now so a replacement can bind it, but let outstanding
    // readbacks finish before destroying its buffers.
    if (this.timestampReadbacks.size)
      void Promise.all(this.timestampReadbacks).then(() => this.renderer.dispose());
    else this.renderer.dispose();
  }
}
