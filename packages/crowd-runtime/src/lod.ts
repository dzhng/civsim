import type { CrowdInstance } from './instanceData';

export type LodLevel = 0 | 1 | 2 | 3;

export interface LodPolicy {
  l0Pixels: number;
  l1Pixels: number;
  l2Pixels: number;
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
};

export function assignLodForScreenSize(screenSize: number, policy = DEFAULT_LOD_POLICY): LodLevel {
  if (screenSize >= policy.l0Pixels) return 0;
  if (screenSize >= policy.l1Pixels) return 1;
  if (screenSize >= policy.l2Pixels) return 2;
  return 3;
}

export function assignCrowdLods(instances: CrowdInstance[], zoom: number, policy = DEFAULT_LOD_POLICY): LodAssignment[] {
  return instances.map((inst) => {
    // Every mounted class is taller on screen — drive the scale off the mount
    // flag, not a hardcoded class list that missed cavalry class 14.
    const mountedScale = inst.mounted ? 1.45 : 1;
    const screenSize = zoom * mountedScale * 1.8;
    return { level: assignLodForScreenSize(screenSize, policy), screenSize };
  });
}

export interface LodCamera {
  x: number;
  y: number;
  zoom: number;
}

/** Projected on-screen height of an instance: scales with zoom, falls with
 *  distance from the camera focus, so near soldiers are L0 and far ones coarsen. */
export function instanceScreenSize(x: number, y: number, camera: LodCamera, mounted: boolean): number {
  const dist = Math.hypot(x - camera.x, y - camera.y);
  const mountedScale = mounted ? 1.45 : 1;
  return (camera.zoom * 1.8 * mountedScale) / (1 + dist * 0.012);
}

// A level change only sticks once the size is past the boundary by `margin`, so
// instances hovering on a threshold don't flip tier every frame.
export function lodWithHysteresis(prevLevel: LodLevel, screenSize: number, policy = DEFAULT_LOD_POLICY, margin = 1.5): LodLevel {
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

/** Per-instance LOD by camera distance, with optional previous levels for
 *  hysteresis. The production battle path uses this instead of a binary switch. */
export function assignCrowdLodsByDistance(
  instances: CrowdInstance[],
  camera: LodCamera,
  policy = DEFAULT_LOD_POLICY,
  prevLevels?: ArrayLike<number>,
): LodAssignment[] {
  return instances.map((inst, i) => {
    const screenSize = instanceScreenSize(inst.x, inst.y, camera, inst.mounted);
    const level = prevLevels
      ? lodWithHysteresis((prevLevels[i] ?? 0) as LodLevel, screenSize, policy)
      : assignLodForScreenSize(screenSize, policy);
    return { level, screenSize };
  });
}

export function countLods(assignments: LodAssignment[]): LodCounts {
  const counts: LodCounts = { l0: 0, l1: 0, l2: 0, l3: 0 };
  for (const a of assignments) counts[`l${a.level}` as keyof LodCounts]++;
  return counts;
}

