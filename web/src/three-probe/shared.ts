// Shared camera/lighting/stats helpers for the three.js WebGPU bake-off probes.
// World convention: Z-UP, XY ground plane, matching the bespoke prong exactly.
import * as THREE from 'three/webgpu';

// three@0.185 ships no types (see three-shims.d.ts); spike-scoped aliases so
// signatures stay readable without THREE.* in type positions.
type Renderer = any;
type Camera = any;
type Scene = any;

export interface CameraPreset {
  target: [number, number, number];
  distance: number;
  yaw: number;
  pitch: number;
  fovY: number; // radians
}

export function createOrbitCamera(preset: CameraPreset, aspect: number, far = 5000): Camera {
  const camera = new THREE.PerspectiveCamera((preset.fovY * 180) / Math.PI, aspect, 1, far);
  camera.up.set(0, 0, 1);
  const [tx, ty, tz] = preset.target;
  const cp = Math.cos(preset.pitch);
  camera.position.set(
    tx + preset.distance * Math.cos(preset.yaw) * cp,
    ty + preset.distance * Math.sin(preset.yaw) * cp,
    tz + preset.distance * Math.sin(preset.pitch),
  );
  camera.lookAt(new THREE.Vector3(tx, ty, tz));
  return camera;
}

// Golden-hour sun: az = PI/2, el = 0.5 → sun to the north, 28.6 degrees up.
const SUN_AZ = Math.PI / 2;
const SUN_EL = 0.5;
export const SUN_DIR = new THREE.Vector3(
  Math.cos(SUN_EL) * Math.cos(SUN_AZ),
  Math.cos(SUN_EL) * Math.sin(SUN_AZ),
  Math.sin(SUN_EL),
).normalize();

export const SUN_COLOR = new THREE.Color(1.0, 0.86, 0.62);
export const FILL_COLOR = new THREE.Color(0.46, 0.58, 0.78);
export const HAZE_COLOR = new THREE.Color(0.82, 0.80, 0.70);

export function addGoldenHourLights(scene: Scene) {
  const sun = new THREE.DirectionalLight(SUN_COLOR, 2.5);
  sun.position.copy(SUN_DIR).multiplyScalar(400);
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);
  // Hemisphere fill; +Z is up in this world so aim the light along +Z.
  const fill = new THREE.HemisphereLight(FILL_COLOR, new THREE.Color(0.38, 0.34, 0.26), 0.8);
  fill.position.set(0, 0, 1);
  scene.add(fill);
  return sun;
}

export async function createRenderer(): Promise<Renderer> {
  const renderer = new THREE.WebGPURenderer({ forceWebGL: false, antialias: true, trackTimestamp: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  document.body.appendChild(renderer.domElement);
  await renderer.init();
  return renderer;
}

export interface ProbeStats {
  route: string;
  substrate: 'threejs';
  cameraPreset: string | null;
  soldiers: number;
  trees: number;
  grassBlades: number;
  frames: number;
  medianMs: number | null;
  p95Ms: number | null;
  gpuTimeMs: number | null;
  drawCalls: number | null;
}

export interface StatsCounts {
  cameraPreset?: string | null;
  soldiers?: number;
  trees?: number;
  grassBlades?: number;
}

declare global {
  interface Window {
    __rendererLabReady?: boolean;
    __probeStats?: ProbeStats;
  }
}

const WARMUP_FRAMES = 60;
const SAMPLE_CAP = 300;

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}

/** Call the returned function once per rAF frame, after renderer.render(). */
export function createStatsTracker(route: string, renderer: Renderer, counts: StatsCounts = {}) {
  const samples: number[] = [];
  let frameIndex = 0;
  let lastTime: number | null = null;
  let gpuTimeMs: number | null = null;
  let timestampBroken = false;

  return function tick(nowMs: number) {
    if (frameIndex === 0) window.__rendererLabReady = true;
    if (lastTime !== null && frameIndex > WARMUP_FRAMES) {
      samples.push(nowMs - lastTime);
      if (samples.length > SAMPLE_CAP) samples.shift();
    }
    lastTime = nowMs;
    frameIndex += 1;

    if (!timestampBroken) {
      try {
        void renderer.resolveTimestampsAsync('render' as never).then(() => {
          const t = renderer.info.render.timestamp;
          if (typeof t === 'number' && t > 0) gpuTimeMs = t;
        }).catch(() => { timestampBroken = true; });
      } catch {
        timestampBroken = true;
      }
    }

    const sorted = [...samples].sort((a, b) => a - b);
    window.__probeStats = {
      route,
      substrate: 'threejs',
      cameraPreset: counts.cameraPreset ?? null,
      soldiers: counts.soldiers ?? 0,
      trees: counts.trees ?? 0,
      grassBlades: counts.grassBlades ?? 0,
      frames: samples.length,
      medianMs: quantile(sorted, 0.5),
      p95Ms: quantile(sorted, 0.95),
      gpuTimeMs,
      drawCalls: renderer.info.render.drawCalls ?? null,
    };
  };
}

export function handleResize(renderer: Renderer, camera: Camera) {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
