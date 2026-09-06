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
): number {
  const span = 1.8 * (instance.mounted ? 1.45 : 1);
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
  const thresholds = [policy.l0Pixels, policy.l1Pixels, policy.l2Pixels];
  if (raw < prevLevel) {
    const boundary = thresholds[raw] ?? thresholds[thresholds.length - 1];
    return screenSize >= boundary + margin ? raw : prevLevel;
  }
  const boundary = thresholds[raw - 1] ?? thresholds[thresholds.length - 1];
  return screenSize <= boundary - margin ? raw : prevLevel;
}

/** View and shadow projections use one threshold policy. Impostors do not cast
 * shadows, so a contributing shadow view requires at least the coarsest mesh. */
export function assignLodForContributions(
  viewPixels: number,
  shadowPixels: number,
  prevLevel?: LodLevel,
  policy = DEFAULT_LOD_POLICY,
): LodAssignment {
  const screenSize = Math.max(policy.minScreenPixels, viewPixels, shadowPixels);
  let level =
    prevLevel === undefined
      ? assignLodForScreenSize(screenSize, policy)
      : lodWithHysteresis(prevLevel, screenSize, policy);
  if (shadowPixels > 0) level = Math.min(COARSEST_SHADOW_LOD, level) as LodLevel;
  return { level, screenSize };
}

export function assignCrowdLods(
  instances: CrowdInstance[],
  projection: ProjectionFootprint,
  policy = DEFAULT_LOD_POLICY,
  prevLevels?: ArrayLike<number>,
): LodAssignment[] {
  return instances.map((inst, i) => {
    return assignLodForContributions(
      instanceScreenSize(inst, projection),
      0,
      prevLevels?.[i] as LodLevel | undefined,
      policy,
    );
  });
}

export function countLods(assignments: LodAssignment[]): LodCounts {
  const counts: LodCounts = { l0: 0, l1: 0, l2: 0, l3: 0 };
  for (const a of assignments) counts[`l${a.level}` as keyof LodCounts]++;
  return counts;
}
