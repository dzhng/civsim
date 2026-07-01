import type { RawFrameShell } from '../../../renderer-core/src/frameShell';
import type { SkinnedLightingEnvironment } from '../../../renderer-core/src/skinnedPipeline';

export type CivsimEnvironmentId = 'golden' | 'dusk' | 'overcast';

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
  /** Overall exposure; dusk is dim, not dark-albedo'd. */
  exposure: number;
}

export type BattleEnvironmentId = 'golden-hour' | 'overcast-foggy' | 'dusk';

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
  },
  dusk: {
    id: 'dusk',
    sunAzimuth: SUN_TOWARD_VIEW,
    sunElevation: 0.24,
    keyColor: [1.0, 0.6, 0.34],
    fillColor: [0.34, 0.40, 0.56],
    hazeColor: [0.72, 0.58, 0.5],
    exposure: 0.86,
  },
  overcast: {
    id: 'overcast',
    sunAzimuth: SUN_TOWARD_VIEW,
    sunElevation: 0.6,
    keyColor: [0.78, 0.82, 0.86],
    fillColor: [0.72, 0.76, 0.82],
    hazeColor: [0.84, 0.86, 0.88],
    exposure: 1.0,
  },
};

export type WaterEnvironment = CivsimEnvironment;
export const WATER_ENVIRONMENTS = CIVSIM_ENVIRONMENTS;

const BATTLE_ALIASES: Record<BattleEnvironmentId, CivsimEnvironmentId> = {
  'golden-hour': 'golden',
  'overcast-foggy': 'overcast',
  dusk: 'dusk',
};

export const BATTLE_ENVIRONMENTS: Record<BattleEnvironmentId, BattleEnvironment> = {
  'golden-hour': battleEnvironment('golden-hour'),
  'overcast-foggy': battleEnvironment('overcast-foggy'),
  dusk: battleEnvironment('dusk'),
};

export const DEFAULT_BATTLE_ENVIRONMENT = 'golden-hour' satisfies BattleEnvironmentId;

export function resolveBattleEnvironment(id: string | null | undefined): BattleEnvironment {
  if (id === 'overcast' || id === 'overcast-foggy') return BATTLE_ENVIRONMENTS['overcast-foggy'];
  if (id === 'golden' || id === 'golden-hour') return BATTLE_ENVIRONMENTS['golden-hour'];
  if (id === 'dusk') return BATTLE_ENVIRONMENTS.dusk;
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
