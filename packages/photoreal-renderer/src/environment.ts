// applyCivsimEnvironment — dresses a PhotorealWorld from the ONE environment
// preset owner (CIVSIM_ENVIRONMENTS / BATTLE_ENVIRONMENTS in
// packages/game-renderer/src/environment/environment.ts): the physical sky
// (SkyModel — background dome + IBL + sun tint, slice 10a), the sun
// DirectionalLight, an optional THREE.Fog haze (stand-in, dies at 10b), and
// toneMappingExposure. New physical fields are ADDED to that owner, never
// forked into a parallel table — everything here is a pure function of the
// preset (pinned by web/tests/photorealEnvironment.test.ts).
import { Color, DirectionalLight, Fog, SRGBColorSpace } from 'three';
import type { CivsimEnvironment, CivsimEnvironmentId } from '../../game-renderer/src/environment/environment';
import { SkyModel, skyModelParams } from './atmosphere/skyModel';
import type { PhotorealWorld } from './world';

type Rgb = [number, number, number];

export interface PhotorealEnvironmentSpec {
  id: CivsimEnvironmentId;
  /** Unit vector toward the sun, from the preset azimuth/elevation (z-up). */
  sunDirection: Rgb;
  /** Sun DirectionalLight colour — LINEAR rgb, derived from the sky model's
   *  atmospheric transmittance (slice 10a), never the authored keyColor. */
  sunColor: Rgb;
  sunIntensity: number;
  hazeColor: Rgb;
  exposure: number;
  /** Atmospheric turbidity — drives the physical sky + aerial haze. */
  turbidity: number;
  environmentIntensity: number;
}

// Verdict-grade constant carried over from the 06 bake-off's winning probe.
const ENVIRONMENT_INTENSITY = 0.7;

/** The pure preset → physical-parameters mapping (no GPU, no scene mutation).
 *  Sun intensity / exposure / turbidity come from the preset's physical block
 *  (CivsimPhysicalLight) — per-preset knobs on the ONE owner. */
export function photorealEnvironment(env: CivsimEnvironment): PhotorealEnvironmentSpec {
  const cosEl = Math.cos(env.sunElevation);
  const sky = skyModelParams(env);
  return {
    id: env.id,
    sunDirection: [
      cosEl * Math.cos(env.sunAzimuth),
      cosEl * Math.sin(env.sunAzimuth),
      Math.sin(env.sunElevation),
    ],
    sunColor: [...sky.sunLightColor],
    sunIntensity: env.physical.sunIntensity,
    hazeColor: [...env.hazeColor],
    exposure: env.physical.exposure,
    turbidity: env.physical.turbidity,
    environmentIntensity: ENVIRONMENT_INTENSITY,
  };
}

export interface PhotorealEnvironmentOptions {
  /** Linear fog in the preset haze colour; the distances are per-scene framing
   *  choices, the colour is the preset's. Stand-in — dies at 10b. */
  fog?: { near: number; far: number };
}

export function applyCivsimEnvironment(
  world: PhotorealWorld,
  env: CivsimEnvironment,
  options: PhotorealEnvironmentOptions = {},
): PhotorealEnvironmentSpec {
  const spec = photorealEnvironment(env);
  const scene = world.scene;

  // The physical sky (10a): one SkyModel owns the background dome, the IBL
  // equirect (scene.environment IS the sky-view LUT — ambient always agrees
  // with the visible sky), and the sun tint below.
  const sky = new SkyModel(env);
  sky.bake(world.renderer);
  scene.add(sky.mesh);
  scene.environment = sky.lut.texture;
  scene.environmentIntensity = spec.environmentIntensity;
  world.atmosphere = { sky: sky.identity() };

  // The sun: direction from the preset angles, colour from the SAME sky
  // parameterization (linear transmittance — no display conversion).
  const sun = new DirectionalLight(new Color(...spec.sunColor), spec.sunIntensity);
  sun.position.set(spec.sunDirection[0] * 400, spec.sunDirection[1] * 400, spec.sunDirection[2] * 400);
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);

  if (options.fog) {
    scene.fog = new Fog(displayColor(spec.hazeColor), options.fog.near, options.fog.far);
  }
  world.renderer.toneMappingExposure = spec.exposure;
  world.environmentId = spec.id;
  return spec;
}

/** Preset haze colours are display-referred (the bespoke swapchain values);
 *  convert at this seam so the scene lights in linear space. */
function displayColor([r, g, b]: Rgb): Color {
  return new Color().setRGB(r, g, b, SRGBColorSpace);
}
