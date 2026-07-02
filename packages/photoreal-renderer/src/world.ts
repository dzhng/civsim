// PhotorealWorld — the ONE owner of the three.js WebGPU substrate for the
// photoreal ladder (spec: specs/3d-perspective-renderer, slices 07+). One
// WebGPURenderer + one Scene per route, driven by a manual rAF loop (never
// setAnimationLoop) and an OWNED time uniform.
//
// Determinism rule (encoded here, enforced forever): the TSL `time` node is
// BANNED in this package and everything built on it. All animation keys off
// setTime() + seeded RNG, so a fixed setTime renders byte-identical frames and
// snapCheck baselines stay byte-stable.
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { CivsimEnvironmentId } from '../../game-renderer/src/environment/environment';

export interface PhotorealWorldStats {
  drawCalls: number;
  triangles: number;
  /** GPU render-pass ms via trackTimestamp; null until resolved or when the
   *  adapter cannot deliver timestamps (failure-tolerant — SwiftShader stays green). */
  gpuTimeMs: number | null;
  timeSeconds: number;
}

export class PhotorealWorld {
  readonly renderer: THREE.WebGPURenderer;
  readonly scene: THREE.Scene;
  /** The one time uniform every animated TSL material in this world reads. */
  readonly uTime = uniform(0);
  /** Set by applyCivsimEnvironment — the stats identity field proving the ONE
   *  environment-preset owner (CIVSIM_ENVIRONMENTS) dressed this world. */
  environmentId: CivsimEnvironmentId | null = null;
  private timeSeconds = 0;
  private gpuTimeMs: number | null = null;
  private timestampBroken = false;

  private constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;
  }

  static async create(canvas: HTMLCanvasElement): Promise<PhotorealWorld> {
    const renderer = new THREE.WebGPURenderer({
      canvas,
      antialias: true,
      trackTimestamp: true,
      // The engine depth contract is reverse-Z (near → 1, far → 0); this option
      // makes three build the same projection cameraBridge produces CPU-side.
      reversedDepthBuffer: true,
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
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

  resize(width: number, height: number, pixelRatio = 1): void {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
  }

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
    this.pollGpuTime();
  }

  private pollGpuTime(): void {
    if (this.timestampBroken) return;
    try {
      void this.renderer
        .resolveTimestampsAsync(THREE.TimestampQuery.RENDER)
        .then(() => {
          const t = this.renderer.info.render.timestamp;
          if (typeof t === 'number' && t > 0) this.gpuTimeMs = t;
        })
        .catch(() => {
          this.timestampBroken = true;
        });
    } catch {
      this.timestampBroken = true;
    }
  }

  stats(): PhotorealWorldStats {
    return {
      drawCalls: this.renderer.info.render.drawCalls,
      triangles: this.renderer.info.render.triangles,
      gpuTimeMs: this.gpuTimeMs,
      timeSeconds: this.timeSeconds,
    };
  }

  /** Await the GPU queue so the presented frame is fully rasterized before a
   *  screenshot — the seam the byte-determinism scene checks lean on. */
  async settlePresentedFrame(): Promise<void> {
    const device = (this.renderer.backend as unknown as { device?: GPUDevice }).device;
    if (device) await device.queue.onSubmittedWorkDone();
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
