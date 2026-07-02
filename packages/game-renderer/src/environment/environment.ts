import type { RawFrameShell } from '../../../renderer-core/src/frameShell';
import type { SkinnedLightingEnvironment } from '../../../renderer-core/src/skinnedPipeline';

export type CivsimEnvironmentId = 'golden' | 'dusk' | 'noon' | 'overcast';

/** Physical lighting parameterization (photoreal ladder, slice 09+). The flat
 *  display-referred fields on CivsimEnvironment stay the bespoke WGSL knobs
 *  (campaign/water passes) until 16/17; the photoreal renderer lights the
 *  world from THIS block plus the shared sun/sky colours — mood lives in the
 *  environment, never baked into albedo. */
export interface CivsimPhysicalLight {
  /** Sun DirectionalLight intensity (linear radiance units). Overcast is a
   *  weak diffuse key; the bright flat sky (IBL) carries the high-key look. */
  sunIntensity: number;
  /** ACES toneMappingExposure for the preset. */
  exposure: number;
  /** Atmospheric turbidity — drives the physical sky model (slice 10a). */
  turbidity: number;
}

export interface CivsimEnvironment {
  id: CivsimEnvironmentId;
  /** Sun direction (radians) for this mood. */
  sunAzimuth: number;
  sunElevation: number;
  /** Warm/cool key (sun) light, also used for water glint. */
  keyColor: [number, number, number];
  /** Sky fill lifting shadows. */
  fillColor: [number, number, number];
  /** Aerial-perspective haze colour. */
  hazeColor: [number, number, number];
  /** Overall exposure; dusk is dim, not dark-albedo'd. (Bespoke display knob —
   *  the photoreal exposure is physical.exposure.) */
  exposure: number;
  /** Photoreal sky-dome gradient (drives the IBL environment until the physical
   *  sky lands in slice 10a): zenith → horizon above the horizon line, ground
   *  bounce below it. Linear radiance, not display colours. */
  skyZenithColor: [number, number, number];
  skyHorizonColor: [number, number, number];
  groundBounceColor: [number, number, number];
  physical: CivsimPhysicalLight;
}

export type BattleEnvironmentId = 'golden-hour' | 'overcast-foggy' | 'dusk' | 'noon';

export interface BattleEnvironment {
  id: BattleEnvironmentId;
  source: `CIVSIM_ENVIRONMENTS.${CivsimEnvironmentId}`;
  environment: CivsimEnvironment;
  clear: [number, number, number, number];
}

const SUN_TOWARD_VIEW = Math.PI / 2;

export const CIVSIM_ENVIRONMENTS: Record<CivsimEnvironmentId, CivsimEnvironment> = {
  golden: {
    id: 'golden',
    sunAzimuth: SUN_TOWARD_VIEW,
    sunElevation: 0.5,
    keyColor: [1.0, 0.86, 0.62],
    fillColor: [0.46, 0.58, 0.78],
    hazeColor: [0.82, 0.80, 0.70],
    exposure: 1.18,
    skyZenithColor: [0.16, 0.28, 0.52],
    skyHorizonColor: [0.60, 0.56, 0.46],
    groundBounceColor: [0.20, 0.17, 0.12],
    physical: { sunIntensity: 3.4, exposure: 1.12, turbidity: 2.6 },
  },
  dusk: {
    id: 'dusk',
    sunAzimuth: SUN_TOWARD_VIEW,
    sunElevation: 0.24,
    keyColor: [1.0, 0.6, 0.34],
    fillColor: [0.34, 0.40, 0.56],
    hazeColor: [0.72, 0.58, 0.5],
    exposure: 0.86,
    skyZenithColor: [0.09, 0.13, 0.30],
    skyHorizonColor: [0.52, 0.34, 0.26],
    groundBounceColor: [0.13, 0.10, 0.08],
    physical: { sunIntensity: 2.1, exposure: 0.92, turbidity: 3.6 },
  },
  noon: {
    id: 'noon',
    sunAzimuth: SUN_TOWARD_VIEW,
    sunElevation: 1.22,
    keyColor: [1.0, 0.98, 0.94],
    fillColor: [0.56, 0.66, 0.82],
    hazeColor: [0.80, 0.83, 0.86],
    exposure: 1.08,
    skyZenithColor: [0.19, 0.34, 0.62],
    skyHorizonColor: [0.64, 0.72, 0.80],
    groundBounceColor: [0.22, 0.20, 0.15],
    physical: { sunIntensity: 3.0, exposure: 1.05, turbidity: 2.0 },
  },
  overcast: {
    id: 'overcast',
    sunAzimuth: SUN_TOWARD_VIEW,
    sunElevation: 0.6,
    keyColor: [0.78, 0.82, 0.86],
    fillColor: [0.72, 0.76, 0.82],
    hazeColor: [0.84, 0.86, 0.88],
    exposure: 1.0,
    // Flat HIGH-KEY radiance (David's locked overcast mood): the bright grey
    // sky IS the light source — the IBL carries the day, the sun barely keys.
    skyZenithColor: [0.60, 0.66, 0.74],
    skyHorizonColor: [0.86, 0.89, 0.93],
    groundBounceColor: [0.30, 0.30, 0.28],
    physical: { sunIntensity: 0.4, exposure: 1.18, turbidity: 9.0 },
  },
};

export type WaterEnvironment = CivsimEnvironment;
export const WATER_ENVIRONMENTS = CIVSIM_ENVIRONMENTS;

const BATTLE_ALIASES: Record<BattleEnvironmentId, CivsimEnvironmentId> = {
  'golden-hour': 'golden',
  'overcast-foggy': 'overcast',
  dusk: 'dusk',
  noon: 'noon',
};

export const BATTLE_ENVIRONMENTS: Record<BattleEnvironmentId, BattleEnvironment> = {
  'golden-hour': battleEnvironment('golden-hour'),
  'overcast-foggy': battleEnvironment('overcast-foggy'),
  dusk: battleEnvironment('dusk'),
  noon: battleEnvironment('noon'),
};

export const DEFAULT_BATTLE_ENVIRONMENT = 'golden-hour' satisfies BattleEnvironmentId;

export function resolveBattleEnvironment(id: string | null | undefined): BattleEnvironment {
  if (id === 'overcast' || id === 'overcast-foggy') return BATTLE_ENVIRONMENTS['overcast-foggy'];
  if (id === 'golden' || id === 'golden-hour') return BATTLE_ENVIRONMENTS['golden-hour'];
  if (id === 'dusk') return BATTLE_ENVIRONMENTS.dusk;
  if (id === 'noon') return BATTLE_ENVIRONMENTS.noon;
  return BATTLE_ENVIRONMENTS[DEFAULT_BATTLE_ENVIRONMENT];
}

export function applyBattleEnvironment(shell: RawFrameShell, env: BattleEnvironment): void {
  shell.setSun(env.environment.sunAzimuth, env.environment.sunElevation);
}

export function environmentWgsl(prefix: 'WATER' | 'BATTLE', env: CivsimEnvironment): string {
  return `
const ${prefix}_KEY = ${wgslVec3(env.keyColor)};
const ${prefix}_FILL = ${wgslVec3(env.fillColor)};
const ${prefix}_HAZE = ${wgslVec3(env.hazeColor)};
const ${prefix}_EXPOSURE = ${env.exposure.toFixed(3)};
`;
}

export function waterEnvironmentWgsl(env: WaterEnvironment): string {
  return environmentWgsl('WATER', env);
}

export function battleEnvironmentWgsl(env: BattleEnvironment): string {
  return environmentWgsl('BATTLE', env.environment);
}

export function battleEnvironmentStats(env: BattleEnvironment) {
  return {
    id: env.id,
    source: env.source,
    sharedPreset: env.environment.id,
    waterAlias: `WATER_ENVIRONMENTS.${env.environment.id}`,
    sunAzimuth: round(env.environment.sunAzimuth),
    sunElevation: round(env.environment.sunElevation),
    keyColor: env.environment.keyColor,
    fillColor: env.environment.fillColor,
    hazeColor: env.environment.hazeColor,
    exposure: env.environment.exposure,
  };
}

export function skinnedLightingForBattleEnvironment(env: BattleEnvironment): SkinnedLightingEnvironment {
  return {
    source: env.source,
    sunAzimuth: env.environment.sunAzimuth,
    sunElevation: env.environment.sunElevation,
    keyColor: env.environment.keyColor,
    fillColor: env.environment.fillColor,
    exposure: env.environment.exposure,
  };
}

function battleEnvironment(id: BattleEnvironmentId): BattleEnvironment {
  const sourceId = BATTLE_ALIASES[id];
  const environment = CIVSIM_ENVIRONMENTS[sourceId];
  return {
    id,
    source: `CIVSIM_ENVIRONMENTS.${sourceId}`,
    environment,
    clear: [...environment.hazeColor, 1],
  };
}

function wgslVec3(c: readonly [number, number, number]): string {
  return `vec3f(${c[0].toFixed(3)}, ${c[1].toFixed(3)}, ${c[2].toFixed(3)})`;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
