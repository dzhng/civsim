export type CrowdClip =
  | "idle"
  | "march"
  | "run"
  | "attack_a"
  | "hit_a"
  | "shoot"
  | "death_a"
  | "at_ease";

export interface AnimationState {
  clip: CrowdClip;
  phase: number;
  loop: boolean;
  deathVariant: number;
}

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
const MARCH_CYCLES_PER_SECOND = 0.28;
const RUN_CYCLES_PER_SECOND = 0.42;
const ATTACK_CYCLES_PER_SECOND = 0.5;
const HIT_CYCLES_PER_SECOND = 0.65;
const SHOOT_CYCLES_PER_SECOND = 0.55;
const IDLE_CYCLES_PER_SECOND = 0.04;

export function variationSeed(index: number, unit = 0): number {
  let h = (Math.imul(index + 1, 2246822507) ^ Math.imul(unit + 17, 3266489917)) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 668265263) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function animationForFrame(
  frame: number,
  tick: number,
  seed: number,
  alive = true,
  deathAge = 1,
): AnimationState {
  const seconds = tick * ANIMATION_SECONDS_PER_TICK;
  const phaseOffset = (seed & 1023) / 1024;
  if (!alive || frame === FRAME_FALLEN) {
    return { clip: "death_a", phase: clamp01(deathAge), loop: false, deathVariant: seed % 3 };
  }
  if (frame === FRAME_ATTACK || frame === 11) {
    return {
      clip: "attack_a",
      phase: fract(seconds * ATTACK_CYCLES_PER_SECOND + phaseOffset),
      loop: false,
      deathVariant: 0,
    };
  }
  if (frame === FRAME_HIT) {
    return {
      clip: "hit_a",
      phase: fract(seconds * HIT_CYCLES_PER_SECOND + phaseOffset),
      loop: false,
      deathVariant: 0,
    };
  }
  if (frame === FRAME_SHOOT) {
    return {
      clip: "shoot",
      phase: fract(seconds * SHOOT_CYCLES_PER_SECOND + phaseOffset),
      loop: false,
      deathVariant: 0,
    };
  }
  if (frame === FRAME_RUN_A || frame === FRAME_RUN_B) {
    return {
      clip: "run",
      phase: fract(
        seconds * RUN_CYCLES_PER_SECOND + phaseOffset + (frame === FRAME_RUN_B ? 0.5 : 0),
      ),
      loop: true,
      deathVariant: 0,
    };
  }
  if (frame === 1 || frame === 2) {
    return {
      clip: "march",
      phase: fract(seconds * MARCH_CYCLES_PER_SECOND + phaseOffset + (frame === 2 ? 0.5 : 0)),
      loop: true,
      deathVariant: 0,
    };
  }
  if (frame === FRAME_AT_EASE || frame === FRAME_STOW) {
    return { clip: "at_ease", phase: 0, loop: true, deathVariant: 0 };
  }
  return {
    clip: "idle",
    phase: fract(seconds * IDLE_CYCLES_PER_SECOND + phaseOffset),
    loop: true,
    deathVariant: 0,
  };
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
