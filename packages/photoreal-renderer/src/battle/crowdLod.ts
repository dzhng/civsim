import type { CrowdInstance } from '../../../crowd-runtime/src/instanceData';
import {
  assignCrowdLodsByDistance,
  countLods,
  DEFAULT_LOD_POLICY,
  type LodAssignment,
  type LodCamera,
  type LodCounts,
  type LodPolicy,
} from '../../../crowd-runtime/src/lod';

interface PhotorealCrowdLodPlan {
  assignments: LodAssignment[];
  counts: LodCounts;
  policy: LodPolicy;
}

export function planPhotorealCrowdLods(
  instances: CrowdInstance[],
  camera: LodCamera,
  prevLevels?: ArrayLike<number>,
  policy = DEFAULT_LOD_POLICY,
): PhotorealCrowdLodPlan {
  const assignments = assignCrowdLodsByDistance(instances, camera, policy, prevLevels);
  return {
    assignments,
    counts: countLods(assignments),
    policy,
  };
}
