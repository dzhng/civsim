import type { CrowdInstance } from "./instanceData";
import { projectedSpanPixels, type ProjectionFootprint } from "../../renderer-core/src/camera3d";

export type LodLevel = 0 | 1 | 2 | 3;
/** All mesh tiers cast; impostors do not. Planner and draw producer share this boundary. */
export const COARSEST_SHADOW_LOD: LodLevel = 2;

export interface LodPolicy {
  l0Pixels: number;
  l1Pixels: number;
  l2Pixels: number;
  minScreenPixels: number;
}

export interface LodAssignment {
  level: LodLevel;
  screenSize: number;
}

export interface LodCounts {
  l0: number;
  l1: number;
  l2: number;
  l3: number;
}

export const DEFAULT_LOD_POLICY: LodPolicy = {
  l0Pixels: 18,
  l1Pixels: 9,
  l2Pixels: 4,
  minScreenPixels: 2.25,
};

export function assignLodForScreenSize(screenSize: number, policy = DEFAULT_LOD_POLICY): LodLevel {
  const size = Math.max(screenSize, policy.minScreenPixels);
  if (size >= policy.l0Pixels) return 0;
  if (size >= policy.l1Pixels) return 1;
  if (size >= policy.l2Pixels) return 2;
  return 3;
}

export function instanceScreenSize(
  instance: CrowdInstance,
  projection: ProjectionFootprint,
  modelScale = 1,
): number {
  const span = 1.8 * (instance.mounted ? 1.45 : 1) * modelScale;
  return projectedSpanPixels(
    projection,
    instance.x,
    instance.y,
    (instance.elevation ?? 0) + span / 2,
    span,
  );
}

// A level change only sticks once the size is past the boundary by `margin`, so
// instances hovering on a threshold don't flip tier every frame.
export function lodWithHysteresis(
  prevLevel: LodLevel,
  screenSize: number,
  policy = DEFAULT_LOD_POLICY,
  margin = 1.5,
): LodLevel {
  const raw = assignLodForScreenSize(screenSize, policy);
  if (raw === prevLevel) return prevLevel;
  const boundaryIndex = raw < prevLevel ? raw : raw - 1;
  const boundary =
    boundaryIndex === 0 ? policy.l0Pixels : boundaryIndex === 1 ? policy.l1Pixels : policy.l2Pixels;
  if (raw < prevLevel) {
    return screenSize >= boundary + margin ? raw : prevLevel;
  }
  return screenSize <= boundary - margin ? raw : prevLevel;
}

/** Each audience uses the same thresholds, but only shadow demand has a mesh floor. */
export function assignLodForProjection(
  pixels: number,
  shadow: boolean,
  prevLevel?: LodLevel,
  policy = DEFAULT_LOD_POLICY,
): LodAssignment {
  const screenSize = Math.max(policy.minScreenPixels, pixels);
  return { level: levelForProjection(pixels, shadow, prevLevel, policy), screenSize };
}

export function levelForProjection(
  pixels: number,
  shadow: boolean,
  prevLevel?: LodLevel,
  policy = DEFAULT_LOD_POLICY,
): LodLevel {
  const screenSize = Math.max(policy.minScreenPixels, pixels);
  let level =
    prevLevel === undefined
      ? assignLodForScreenSize(screenSize, policy)
      : lodWithHysteresis(prevLevel, screenSize, policy);
  if (shadow && pixels > 0) level = Math.min(COARSEST_SHADOW_LOD, level) as LodLevel;
  return level;
}

/** Caller-owned levels, using the same projected footprint as both render audiences. */
export function assignCrowdLodLevels(
  instances: readonly CrowdInstance[],
  projection: ProjectionFootprint,
  prevLevels: ArrayLike<number> | undefined,
  out: Uint8Array,
  policy = DEFAULT_LOD_POLICY,
): void {
  for (let i = 0; i < instances.length; i++)
    out[i] = levelForProjection(
      instanceScreenSize(instances[i], projection),
      false,
      prevLevels?.[i] as LodLevel | undefined,
      policy,
    );
}

export function assignCrowdLods(
  instances: CrowdInstance[],
  projection: ProjectionFootprint,
  policy = DEFAULT_LOD_POLICY,
  prevLevels?: ArrayLike<number>,
): LodAssignment[] {
  return instances.map((inst, i) => {
    return assignLodForProjection(
      instanceScreenSize(inst, projection),
      false,
      prevLevels?.[i] as LodLevel | undefined,
      policy,
    );
  });
}

export function countLods(levels: ArrayLike<number>, count = levels.length): LodCounts {
  // Plain counters, not a template-string key per instance: this runs over
  // the whole crowd every frame.
  let l0 = 0;
  let l1 = 0;
  let l2 = 0;
  let l3 = 0;
  for (let i = 0; i < count; i++) {
    const level = levels[i];
    if (level === 0) l0++;
    else if (level === 1) l1++;
    else if (level === 2) l2++;
    else l3++;
  }
  return { l0, l1, l2, l3 };
}
