import type { AppearanceBundle } from "../../soldier-assets/src/appearanceBundle";

export const CROWD_CLIPS = [
  "idle",
  "march",
  "run",
  "attack_a",
  "hit_a",
  "shoot",
  "death_a",
  "at_ease",
] as const;
export type CrowdClip = (typeof CROWD_CLIPS)[number];

/** Admit assets before a controller can ask for an action absent from their bake. */
export function assertCrowdClipCoverage(
  appearances: Record<number, Pick<AppearanceBundle, "animation">>,
  requiredClips: readonly CrowdClip[] = CROWD_CLIPS,
): void {
  for (const [id, appearance] of Object.entries(appearances)) {
    const names = new Set(appearance.animation.clips.map((clip) => clip.name));
    const missing = requiredClips.filter((clip) => !names.has(clip));
    if (missing.length)
      throw new Error(`Appearance ${id} is missing required crowd clips: ${missing.join(", ")}`);
  }
}

export interface AnimationState {
  clip: CrowdClip;
  phase: number;
  loop: boolean;
  deathVariant: number;
}

const FRAME_IDLE = 0;
const FRAME_ATTACK = 3;
const FRAME_FALLEN = 4;
const FRAME_AT_EASE = 6;
const FRAME_STOW = 7;
const FRAME_RUN_A = 8;
const FRAME_RUN_B = 9;
const FRAME_HIT = 10;
const FRAME_SHOOT = 12;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const fract = (v: number) => v - Math.floor(v);
const ANIMATION_SECONDS_PER_TICK = 1 / 30;
export const MARCH_CYCLES_PER_SECOND = 2.0;
export const RUN_CYCLES_PER_SECOND = 2.6;
const ATTACK_CYCLES_PER_SECOND = 0.5;
const HIT_CYCLES_PER_SECOND = 0.65;
const SHOOT_CYCLES_PER_SECOND = 0.55;
const IDLE_CYCLES_PER_SECOND = 0.04;
const COHERENT_PHASE_JITTER = 0.04;
const FIGHTING_BEAT_TICKS = 12;
export const MARCH_ENTER_SPEED_MPS = 0.4;
export const MARCH_EXIT_SPEED_MPS = 0.15;

export function variationSeed(index: number, unit = 0): number {
  let h = (Math.imul(index + 1, 2246822507) ^ Math.imul(unit + 17, 3266489917)) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 668265263) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function marchingStateForSpeed(
  speedMps: number,
  wasMarching: boolean,
  enterSpeedMps = MARCH_ENTER_SPEED_MPS,
  exitSpeedMps = MARCH_EXIT_SPEED_MPS,
): boolean {
  if (!Number.isFinite(speedMps) || speedMps < 0) return wasMarching;
  return wasMarching ? speedMps > exitSpeedMps : speedMps > enterSpeedMps;
}

export function animationForFrame(
  frame: number,
  tick: number,
  seed: number,
  alive = true,
  deathAge = 1,
): AnimationState {
  const seconds = tick * ANIMATION_SECONDS_PER_TICK;
  const phaseJitter = ((seed & 1023) / 1023 - 0.5) * COHERENT_PHASE_JITTER;
  const idlePhaseOffset = (seed & 1023) / 1024;
  if (!alive || frame === FRAME_FALLEN) {
    return { clip: "death_a", phase: clamp01(deathAge), loop: false, deathVariant: seed % 3 };
  }
  if (frame === FRAME_ATTACK || frame === 11) {
    return {
      clip: "attack_a",
      phase: fract(seconds * ATTACK_CYCLES_PER_SECOND + phaseJitter),
      loop: false,
      deathVariant: 0,
    };
  }
  if (frame === FRAME_HIT) {
    return {
      clip: "hit_a",
      phase: fract(seconds * HIT_CYCLES_PER_SECOND + phaseJitter),
      loop: false,
      deathVariant: 0,
    };
  }
  if (frame === FRAME_SHOOT) {
    return {
      clip: "shoot",
      phase: fract(seconds * SHOOT_CYCLES_PER_SECOND + phaseJitter),
      loop: false,
      deathVariant: 0,
    };
  }
  if (frame === FRAME_RUN_A || frame === FRAME_RUN_B) {
    return {
      clip: "run",
      phase: fract(
        seconds * RUN_CYCLES_PER_SECOND + phaseJitter + (frame === FRAME_RUN_B ? 0.5 : 0),
      ),
      loop: true,
      deathVariant: 0,
    };
  }
  if (frame === 1 || frame === 2) {
    return {
      clip: "march",
      phase: fract(seconds * MARCH_CYCLES_PER_SECOND + phaseJitter + (frame === 2 ? 0.5 : 0)),
      loop: true,
      deathVariant: 0,
    };
  }
  if (frame === FRAME_AT_EASE || frame === FRAME_STOW) {
    return { clip: "at_ease", phase: 0, loop: true, deathVariant: 0 };
  }
  return {
    clip: "idle",
    phase: fract(seconds * IDLE_CYCLES_PER_SECOND + idlePhaseOffset),
    loop: true,
    deathVariant: 0,
  };
}

export function fightingFrameForTick(simTick: number, soldierIndex: number): number {
  return (Math.floor(simTick / FIGHTING_BEAT_TICKS + soldierIndex * 0.7) & 1) !== 0
    ? FRAME_ATTACK
    : soldierIndex % 3 === 0
      ? FRAME_HIT
      : FRAME_IDLE;
}

export function animationForSoldierFrame(
  frame: number,
  opts: {
    soldierIndex: number;
    unitIndex?: number;
    simTick: number;
    alive?: boolean;
    deathAge?: number;
  },
): AnimationState {
  return animationForFrame(
    frame,
    opts.simTick,
    variationSeed(opts.soldierIndex, opts.unitIndex ?? 0),
    opts.alive ?? true,
    opts.deathAge ?? 1,
  );
}
