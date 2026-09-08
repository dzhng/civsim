import type { CrowdInstance } from '../../../crowd-runtime/src/instanceData';
import {
  assignCrowdLodLevels,
  countLods,
  DEFAULT_LOD_POLICY,
  type LodCamera,
  type LodCounts,
  type LodPolicy,
} from '../../../crowd-runtime/src/lod';

interface PhotorealCrowdLodPlan {
  /** One tier per instance, valid for `instances.length` entries. */
  levels: Uint8Array;
  counts: LodCounts;
  policy: LodPolicy;
}

/** Tier every instance for this frame. `out` is reused when it is large
 *  enough, so the per-frame plan allocates nothing once the crowd has grown. */
export function planPhotorealCrowdLods(
  instances: readonly CrowdInstance[],
  camera: LodCamera,
  prevLevels?: ArrayLike<number>,
  out?: Uint8Array,
  policy = DEFAULT_LOD_POLICY,
): PhotorealCrowdLodPlan {
  const levels = out && out.length >= instances.length ? out : new Uint8Array(instances.length);
  assignCrowdLodLevels(instances, camera, prevLevels, levels, policy);
  return {
    levels,
    counts: countLods(levels, instances.length),
    policy,
  };
}
