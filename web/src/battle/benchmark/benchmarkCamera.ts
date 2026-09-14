import type { Camera } from "../../shared/camera";

// Provisional contact anchors scouted from the seeded battle at ticks 9000–18000.
// Changing anchors or timing changes the workload and requires a new version.
export const BENCHMARK_CAMERA_TOUR_VERSION = "contact-9000-v2";
export const BENCHMARK_CAMERA_PHASES = [
  { name: "tactical", startMs: 0, endMs: 30_000 },
  { name: "pan", startMs: 30_000, endMs: 90_000 },
  { name: "zoom", startMs: 90_000, endMs: 150_000 },
  { name: "horizon", startMs: 150_000, endMs: 210_000 },
  { name: "combined", startMs: 210_000, endMs: 270_000 },
  { name: "return", startMs: 270_000, endMs: 300_000 },
] as const;

export interface BenchmarkCameraSample {
  phase: (typeof BENCHMARK_CAMERA_PHASES)[number]["name"];
  center: [number, number];
  distance: number;
  yaw: number;
  pitch: number;
}

// Seconds, target X/Y, physical distance, yaw, pitch. Angles stay unwrapped so
// interpolation never introduces a discontinuous turn across ±pi.
const KEYFRAMES: readonly (readonly [number, number, number, number, number, number])[] = [
  [0, 75, -120, 200, -1.57, 0.65],
  [15, 90, -105, 175, -1.45, 0.6],
  [30, 65, -100, 210, -1.57, 0.65],
  [45, -85, -70, 220, -1.75, 0.65],
  [60, -120, -60, 200, -1.8, 0.65],
  [75, 0, -85, 230, -1.55, 0.65],
  [90, 110, -105, 200, -1.35, 0.65],
  [100, 100, -100, 45, -1.3, 0.4],
  [110, 70, -90, 250, -1.5, 0.65],
  [120, 0, -80, 900, -1.65, 0.8],
  [130, -85, -70, 200, -1.8, 0.6],
  [140, -95, -65, 45, -1.7, 0.4],
  [150, -50, -75, 250, -1.55, 0.15],
  [165, -60, -75, 300, -2.0, 0.15],
  [180, -80, -70, 350, -1.3, 0.15],
  [195, -50, -75, 300, -0.8, 0.15],
  [210, -80, -70, 250, -1.5, 0.15],
  [225, -60, -70, 70, -1.9, 0.45],
  [240, -110, -65, 900, -1.2, 0.8],
  [255, -70, -70, 100, -1.75, 0.45],
  [270, -60, -75, 250, -1.4, 0.65],
  [285, -90, -70, 180, -1.65, 0.6],
  [300, -75, -70, 200, -1.57, 0.65],
];

/** Random-access tour sampling: missed frames cannot shorten or change the path. */
export function sampleBenchmarkCamera(elapsedMs: number): BenchmarkCameraSample {
  const timeMs = Math.max(0, Math.min(300_000, elapsedMs));
  const phase = BENCHMARK_CAMERA_PHASES.find((entry) => timeMs < entry.endMs)?.name ?? "return";
  const seconds = timeMs / 1000;
  const nextIndex = KEYFRAMES.findIndex((key) => key[0] >= seconds);
  const next = KEYFRAMES[nextIndex < 0 ? KEYFRAMES.length - 1 : nextIndex];
  const previous = KEYFRAMES[Math.max(0, nextIndex - 1)];
  const fraction = next[0] === previous[0] ? 0 : (seconds - previous[0]) / (next[0] - previous[0]);
  const eased = fraction * fraction * (3 - 2 * fraction);
  const interpolate = (index: 1 | 2 | 3 | 4 | 5) =>
    previous[index] + (next[index] - previous[index]) * eased;
  return {
    phase,
    center: [interpolate(1), interpolate(2)],
    distance: interpolate(3),
    yaw: interpolate(4),
    pitch: interpolate(5),
  };
}

/** The production Camera retains distance inversion, terrain clearance and bounds.
 * Return intended framing; consumers record camera.params() separately as achieved. */
export function applyBenchmarkCamera(camera: Camera, elapsedMs: number): BenchmarkCameraSample {
  const sample = sampleBenchmarkCamera(elapsedMs);
  camera.zoomAt(0, 0, camera.params().distance / sample.distance);
  camera.yaw = sample.yaw;
  camera.pitchBias = 0;
  camera.pitchBias = camera.pitch - sample.pitch;
  camera.setViewCenter(...sample.center);
  camera.clampView();
  return sample;
}
