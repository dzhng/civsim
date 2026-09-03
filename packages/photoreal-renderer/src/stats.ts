// The photoreal stats seam: publishes the __rendererLabStats shape backed by
// renderer.info (draw calls / triangles) + trackTimestamp GPU ms, plus the
// ownership identity fields { substrate, projection, environment } so scenes
// can assert every photoreal surface reports the same single owners (README
// "Photoreal ladder invariants").
import type { PhotorealWorld } from './world';

export const PHOTOREAL_SUBSTRATE = 'threejs-webgpu-tsl';
// The pose/projection owner: cameraBridge.applyCamera3d is the only way a
// three camera gets posed, and camera3d is the only projector behind it.
export const PHOTOREAL_PROJECTION = 'camera3d';

interface PhotorealPublishedStats {
  ok: true;
  route: string;
  substrate: typeof PHOTOREAL_SUBSTRATE;
  projection: typeof PHOTOREAL_PROJECTION;
  environment: string | null;
  stats: Record<string, unknown> & {
    frames: number;
    medianMs: number | null;
    p95Ms: number | null;
    drawCalls: number;
    triangles: number;
    gpuTimeMs: number | null;
    timeSeconds: number;
  };
}

const WARMUP_FRAMES = 60;
const SAMPLE_CAP = 300;

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** Returns a per-frame publisher; call it once per rAF, after world.render(). */
export function createPhotorealStatsPublisher(
  world: PhotorealWorld,
  route: string,
  counts: () => Record<string, unknown>,
): (nowMs: number) => PhotorealPublishedStats {
  const samples: number[] = [];
  let lastTime: number | null = null;
  let frameIndex = 0;

  return function publishFrame(nowMs: number): PhotorealPublishedStats {
    if (lastTime !== null && frameIndex > WARMUP_FRAMES) {
      samples.push(nowMs - lastTime);
      if (samples.length > SAMPLE_CAP) samples.shift();
    }
    lastTime = nowMs;
    frameIndex += 1;

    const sorted = [...samples].sort((a, b) => a - b);
    const published: PhotorealPublishedStats = {
      ok: true,
      route,
      substrate: PHOTOREAL_SUBSTRATE,
      projection: PHOTOREAL_PROJECTION,
      environment: world.environmentId,
      stats: {
        ...counts(),
        ...world.stats(),
        frames: samples.length,
        medianMs: quantile(sorted, 0.5),
        p95Ms: quantile(sorted, 0.95),
      },
    };
    const w = window as unknown as { __rendererLabReady?: boolean; __rendererLabStats?: unknown };
    w.__rendererLabReady = true;
    w.__rendererLabStats = published;
    return published;
  };
}
