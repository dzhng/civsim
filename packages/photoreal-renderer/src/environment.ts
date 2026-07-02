// applyCivsimEnvironment — dresses a PhotorealWorld from the ONE environment
// preset owner (CIVSIM_ENVIRONMENTS / BATTLE_ENVIRONMENTS in
// packages/game-renderer/src/environment/environment.ts): sun DirectionalLight,
// IBL environment, optional fog, and toneMappingExposure. New physical fields
// are ADDED to that owner, never forked into a parallel table — everything here
// is a pure function of the preset (pinned by web/tests/photorealEnvironment.test.ts).
//
// The IBL is a procedural equirect radiance texture (WebGPURenderer PMREMs it
// internally — real prefiltered IBL); it is the scaffolding stand-in the
// physical sky replaces at slice 10a.
import {
  Color,
  DataTexture,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FloatType,
  Fog,
  LinearFilter,
  RGBAFormat,
} from 'three';
import type { CivsimEnvironment, CivsimEnvironmentId } from '../../game-renderer/src/environment/environment';
import type { PhotorealWorld } from './world';

type Rgb = [number, number, number];

export interface PhotorealEnvironmentSpec {
  id: CivsimEnvironmentId;
  /** Unit vector toward the sun, from the preset azimuth/elevation (z-up). */
  sunDirection: Rgb;
  sunColor: Rgb;
  sunIntensity: number;
  skyZenithColor: Rgb;
  skyHorizonColor: Rgb;
  groundBounceColor: Rgb;
  hazeColor: Rgb;
  exposure: number;
  environmentIntensity: number;
  backgroundIntensity: number;
}

// Verdict-grade constants carried over from the 06 bake-off's winning probe.
const SUN_INTENSITY = 2.5;
const ENVIRONMENT_INTENSITY = 0.7;
const BACKGROUND_INTENSITY = 1.3;

/** The pure preset → physical-parameters mapping (no GPU, no scene mutation). */
export function photorealEnvironment(env: CivsimEnvironment): PhotorealEnvironmentSpec {
  const cosEl = Math.cos(env.sunElevation);
  return {
    id: env.id,
    sunDirection: [
      cosEl * Math.cos(env.sunAzimuth),
      cosEl * Math.sin(env.sunAzimuth),
      Math.sin(env.sunElevation),
    ],
    sunColor: [...env.keyColor],
    sunIntensity: SUN_INTENSITY,
    skyZenithColor: [...env.skyZenithColor],
    skyHorizonColor: [...env.skyHorizonColor],
    groundBounceColor: [...env.groundBounceColor],
    hazeColor: [...env.hazeColor],
    exposure: env.exposure,
    environmentIntensity: ENVIRONMENT_INTENSITY,
    backgroundIntensity: BACKGROUND_INTENSITY,
  };
}

export interface PhotorealEnvironmentOptions {
  /** 'sky' shows the IBL equirect as the background (open vistas); 'haze'
   *  clears to the preset haze colour (pairs with fog). Default 'sky'. */
  background?: 'sky' | 'haze';
  /** Linear fog in the preset haze colour; the distances are per-scene framing
   *  choices, the colour is the preset's. */
  fog?: { near: number; far: number };
}

export function applyCivsimEnvironment(
  world: PhotorealWorld,
  env: CivsimEnvironment,
  options: PhotorealEnvironmentOptions = {},
): PhotorealEnvironmentSpec {
  const spec = photorealEnvironment(env);
  const scene = world.scene;

  const sun = new DirectionalLight(new Color(...spec.sunColor), spec.sunIntensity);
  sun.position.set(spec.sunDirection[0] * 400, spec.sunDirection[1] * 400, spec.sunDirection[2] * 400);
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);

  const envTexture = makeEquirectEnvTexture(spec);
  scene.environment = envTexture;
  scene.environmentIntensity = spec.environmentIntensity;
  if ((options.background ?? 'sky') === 'sky') {
    scene.background = envTexture;
    scene.backgroundIntensity = spec.backgroundIntensity;
  } else {
    scene.background = new Color(...spec.hazeColor);
  }
  if (options.fog) {
    scene.fog = new Fog(new Color(...spec.hazeColor), options.fog.near, options.fog.far);
  }
  world.renderer.toneMappingExposure = spec.exposure;
  world.environmentId = spec.id;
  return spec;
}

// Procedural equirect radiance, authored as f(worldDir) in our z-up world
// (altitude = dir.z, sun blob along the preset sun direction), baked into
// three's y-up equirect parameterization so IBL lookups land correctly.
function makeEquirectEnvTexture(spec: PhotorealEnvironmentSpec): DataTexture {
  const w = 256;
  const h = 128;
  const data = new Float32Array(w * h * 4);
  const horizon = spec.skyHorizonColor;
  const zenith = spec.skyZenithColor;
  const ground = spec.groundBounceColor;
  const sun = spec.sunDirection;
  const sunTint = spec.sunColor;
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const lat = (v - 0.5) * Math.PI; // dir.y = sin(lat), three equirect convention
    const dy = Math.sin(lat);
    const cosLat = Math.cos(lat);
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const phi = (u - 0.5) * Math.PI * 2; // atan2(dir.z, dir.x)
      const dx = Math.cos(phi) * cosLat;
      const dz = Math.sin(phi) * cosLat;
      const alt = dz; // world up is +Z
      let r: number, g: number, b: number;
      if (alt >= 0) {
        const t = Math.pow(alt, 0.55);
        r = horizon[0] + (zenith[0] - horizon[0]) * t;
        g = horizon[1] + (zenith[1] - horizon[1]) * t;
        b = horizon[2] + (zenith[2] - horizon[2]) * t;
      } else {
        const t = Math.min(1, -alt / 0.35);
        r = horizon[0] + (ground[0] - horizon[0]) * t;
        g = horizon[1] + (ground[1] - horizon[1]) * t;
        b = horizon[2] + (ground[2] - horizon[2]) * t;
      }
      const s = Math.max(0, dx * sun[0] + dy * sun[1] + dz * sun[2]);
      const radiance = Math.pow(s, 40) * 1.6 + Math.pow(s, 900) * 120.0;
      r += radiance * sunTint[0];
      g += radiance * sunTint[1];
      b += radiance * sunTint[2];
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 1;
    }
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, FloatType);
  tex.mapping = EquirectangularReflectionMapping;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
