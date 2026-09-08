import type { CrowdInstance } from './instanceData';

export type LodLevel = 0 | 1 | 2 | 3;

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

export function assignCrowdLods(instances: CrowdInstance[], zoom: number, policy = DEFAULT_LOD_POLICY): LodAssignment[] {
  return instances.map((inst) => {
    // Every mounted class is taller on screen; drive the scale off the mount
    // flag, not a hardcoded class list.
    const mountedScale = inst.mounted ? 1.45 : 1;
    const screenSize = Math.max(policy.minScreenPixels, zoom * mountedScale * 1.8);
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
export function instanceScreenSize(x: number, y: number, camera: LodCamera, mounted: boolean, policy = DEFAULT_LOD_POLICY): number {
  const dist = Math.hypot(x - camera.x, y - camera.y);
  const mountedScale = mounted ? 1.45 : 1;
  return Math.max(policy.minScreenPixels, (camera.zoom * 1.8 * mountedScale) / (1 + dist * 0.012));
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
    const screenSize = instanceScreenSize(inst.x, inst.y, camera, inst.mounted, policy);
    const level = prevLevels
      ? lodWithHysteresis((prevLevels[i] ?? 0) as LodLevel, screenSize, policy)
      : assignLodForScreenSize(screenSize, policy);
    return { level, screenSize };
  });
}

export function countLods(assignments: LodAssignment[]): LodCounts {
  // Plain counters, not a template-string key per instance: this runs over
  // the whole crowd every frame.
  let l0 = 0;
  let l1 = 0;
  let l2 = 0;
  let l3 = 0;
  for (let i = 0; i < assignments.length; i++) {
    const level = assignments[i].level;
    if (level === 0) l0++;
    else if (level === 1) l1++;
    else if (level === 2) l2++;
    else l3++;
  }
  return { l0, l1, l2, l3 };
}
