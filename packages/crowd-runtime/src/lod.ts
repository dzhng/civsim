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

export function countLods(assignments: LodAssignment[]): LodCounts {
  const counts: LodCounts = { l0: 0, l1: 0, l2: 0, l3: 0 };
  for (const a of assignments) counts[`l${a.level}` as keyof LodCounts]++;
  return counts;
}

