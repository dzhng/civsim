import type { AppearanceBundle } from "../../../packages/soldier-assets/src/appearanceBundle";
import type { ImpostorAtlasData } from "../../../packages/soldier-assets/src/impostorAtlas";
import type { CrowdInstance } from "../../../packages/crowd-runtime/src/instanceData";
import {
  createCrowdLodBuffers,
  planCrowdLods,
  type CrowdProjectionView,
} from "../../../packages/crowd-runtime/src/visibility";

/** CPU publication policy shared by each resource owner. A failed upload cannot
 * advance either LOD history, and no partially uploaded audience may draw. */
export function createCrowdAudienceHistory(
  assets: Record<number, AppearanceBundle>,
  atlases: Record<number, ImpostorAtlasData>,
) {
  const ids = Object.keys(assets).map(Number);
  for (const id of ids)
    if (!atlases[id]) throw Error(`Missing prepared impostor atlas for appearance ${id}`);
  let previous = createCrowdLodBuffers(0),
    next = createCrowdLodBuffers(0),
    previousCount = 0;
  let mainVisible = 0,
    shadowOnly = 0,
    ready = false,
    disposed = false;
  type Publication = {
    count: number;
    plan: ReturnType<typeof planCrowdLods>;
    groups: Map<number, CrowdInstance[]>;
  };
  let pending: Publication | undefined;
  let selected = new Map<number, CrowdInstance[]>(ids.map((id) => [id, []]));
  const check = (needFrame = false) => {
    if (disposed) throw Error("Crowd audience disposed");
    if (needFrame && !ready) throw Error("Crowd audience frame is not ready");
  };
  return {
    ids,
    check,
    begin(instances: readonly CrowdInstance[], views: readonly CrowdProjectionView[]): Publication {
      check();
      if (pending) throw Error("Crowd audience upload already pending");
      ready = false;
      for (const instance of instances)
        if (!assets[instance.classId]) throw Error(`Missing appearance ${instance.classId}`);
      if (next.levels.length < instances.length)
        next = createCrowdLodBuffers(Math.max(instances.length, next.levels.length * 2));
      const plan = planCrowdLods(
        instances,
        views,
        assets,
        previous.levels.subarray(0, previousCount),
        undefined,
        previous.shadowLevels.subarray(0, previousCount),
        next,
      );
      const groups = new Map(ids.map((id) => [id, [] as CrowdInstance[]]));
      for (let i = 0; i < instances.length; i++) {
        const instance = instances[i];
        if (plan.visibility[i] & 1 && plan.levels[i] === 3)
          groups.get(instance.classId)!.push({
            ...instance,
            // Retain only the playback weight read by corpsePresentationStrength.
            // No pose arrays, samples or assets are cloned for camera refresh.
            playback:
              !instance.alive && instance.playback
                ? {
                    appearanceId: instance.playback.appearanceId,
                    base: { ...instance.playback.base },
                  }
                : undefined,
          });
      }
      pending = { count: instances.length, plan, groups };
      return pending;
    },
    commit(publication: Publication) {
      check();
      if (pending !== publication) throw Error("Crowd audience publication is not pending");
      [previous, next] = [next, previous];
      previousCount = publication.count;
      selected = publication.groups;
      mainVisible = publication.plan.viewVisible;
      shadowOnly = publication.plan.shadowOnly;
      pending = undefined;
      ready = true;
    },
    abort(publication: Publication) {
      if (pending === publication) pending = undefined;
    },
    refreshImpostors(update: (groups: ReadonlyMap<number, readonly CrowdInstance[]>) => void) {
      check(true);
      ready = false;
      update(selected);
      check();
      ready = true;
    },
    stats() {
      check();
      return { instances: previousCount, mainVisible, shadowOnly, ready };
    },
    dispose() {
      disposed = true;
      ready = false;
      pending = undefined;
      selected.clear();
      previous = createCrowdLodBuffers(0);
      next = createCrowdLodBuffers(0);
    },
  };
}
