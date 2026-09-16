import { CrowdFrameSnapshot } from "../../../packages/crowd-runtime/src/frameSnapshot";
import { CrowdViewState } from "../../../packages/crowd-runtime/src/viewState";
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
  const snapshot = new CrowdFrameSnapshot();
  let viewState = new CrowdViewState(),
    nextViews = new CrowdViewState();
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
    instances: CrowdInstance[];
    plan: ReturnType<typeof planCrowdLods>;
    groups: Map<number, CrowdInstance[]>;
  };
  let visibleTierHistogram = { l0: 0, l1: 0, l2: 0, l3: 0 };
  let shadowTierHistogram = { l0: 0, l1: 0, l2: 0, l3: 0 };
  let pending: Publication | undefined;
  let selected = new Map<number, CrowdInstance[]>(ids.map((id) => [id, []]));
  const check = (needFrame = false) => {
    if (disposed) throw Error("Crowd audience disposed");
    if (needFrame && !ready) throw Error("Crowd audience frame is not ready");
  };
  return {
    ids,
    check,
    instances: () => snapshot.instances,
    matchesViews: (views: readonly CrowdProjectionView[]) => ready && viewState.matches(views),
    begin(instances: readonly CrowdInstance[], views: readonly CrowdProjectionView[]): Publication {
      check();
      if (pending) throw Error("Crowd audience upload already pending");
      ready = false;
      nextViews.commit(views);
      if (instances !== snapshot.instances) instances = snapshot.capture(instances);
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
          groups.get(instance.classId)!.push(instance);
      }
      pending = { count: instances.length, instances: snapshot.instances, plan, groups };
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
      visibleTierHistogram = { l0: 0, l1: 0, l2: 0, l3: 0 };
      for (let i = 0; i < previousCount; i++)
        if (previous.visibility[i] & 1)
          visibleTierHistogram[`l${previous.levels[i]}` as keyof typeof visibleTierHistogram]++;
      shadowTierHistogram = { ...publication.plan.shadowCounts };
      [viewState, nextViews] = [nextViews, viewState];
      pending = undefined;
      ready = true;
    },
    abort(publication: Publication) {
      if (pending === publication) {
        pending = undefined;
        if (disposed) snapshot.clear();
      }
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
      return {
        instances: previousCount,
        mainVisible,
        shadowOnly,
        ready,
        visibleTierHistogram: { ...visibleTierHistogram },
        shadowTierHistogram: { ...shadowTierHistogram },
      };
    },
    dispose() {
      disposed = true;
      ready = false;
      selected.clear();
      // An asynchronous mesh upload still reads this admitted array after awaits.
      // Its abort releases the storage after the upload has actually settled.
      if (!pending) snapshot.clear();
      viewState.clear();
      nextViews.clear();
      previous = createCrowdLodBuffers(0);
      next = createCrowdLodBuffers(0);
    },
  };
}
