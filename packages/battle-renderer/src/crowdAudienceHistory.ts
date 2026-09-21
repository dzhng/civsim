import type { ImpostorView } from "./impostorData";
import { CrowdFrameSnapshot } from "../../crowd-runtime/src/frameSnapshot";
import { CrowdViewState } from "../../crowd-runtime/src/viewState";
import type { AppearanceBundle } from "../../soldier-assets/src/appearanceBundle";
import type { ImpostorAtlasData } from "../../soldier-assets/src/impostorAtlas";
import type { CrowdInstance } from "../../crowd-runtime/src/instanceData";
import {
  createCrowdLodBuffers,
  planCrowdLods,
  type CrowdProjectionView,
} from "../../crowd-runtime/src/visibility";
import { emptyLodCounts, IMPOSTOR_LEVEL, LOD_COUNT_KEYS } from "../../crowd-runtime/src/lod";

/** The pose a history currently has admitted for drawing. `submission` counts
 * admitted poses rather than uploads, so every reader of an admitted crowd names
 * the same pose no matter how many times a moving camera republished it. */
export interface AdmittedCrowdPose {
  submission: number;
  instances: readonly CrowdInstance[];
}

/** CPU publication policy shared by each resource owner. A failed upload cannot
 * advance either LOD history, and no partially uploaded audience may draw. */
export function createCrowdAudienceHistory(
  assets: Record<number, AppearanceBundle>,
  atlases: Record<number, ImpostorAtlasData> | null,
) {
  const snapshot = new CrowdFrameSnapshot();
  const billboardView = new Float64Array(10);
  const rememberBillboardView = (view: ImpostorView) => {
    billboardView[0] = view.fovY;
    for (let i = 0; i < 3; i++) {
      billboardView[1 + i] = view.right[i];
      billboardView[4 + i] = view.up[i];
      billboardView[7 + i] = view.eye[i];
    }
  };
  const matchesBillboardView = (view: ImpostorView) => {
    if (billboardView[0] !== view.fovY) return false;
    for (let i = 0; i < 3; i++)
      if (
        billboardView[1 + i] !== view.right[i] ||
        billboardView[4 + i] !== view.up[i] ||
        billboardView[7 + i] !== view.eye[i]
      )
        return false;
    return true;
  };
  let viewState = new CrowdViewState(),
    nextViews = new CrowdViewState();
  const ids = Object.keys(assets).map(Number);
  for (const id of ids)
    if (atlases !== null && !atlases[id])
      throw Error(`Missing prepared impostor atlas for appearance ${id}`);
  let previous = createCrowdLodBuffers(0),
    next = createCrowdLodBuffers(0),
    previousCount = 0;
  let mainVisible = 0,
    shadowOnly = 0,
    ready = false,
    disposed = false;
  type Publication = {
    count: number;
    submission: number;
    instances: CrowdInstance[];
    plan: ReturnType<typeof planCrowdLods>;
    groups: Map<number, CrowdInstance[]>;
  };
  // Counts admitted poses, not uploads: a camera-only reprojection republishes the
  // same submitted pose and must not read as a new one.
  let submission = 0;
  let visibleTierHistogram = emptyLodCounts();
  let shadowTierHistogram = emptyLodCounts();
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
    /** The pose actually admitted for drawing, or null while none is. */
    admitted: (): AdmittedCrowdPose | null =>
      ready ? { submission, instances: snapshot.instances } : null,
    matchesViews: (views: readonly CrowdProjectionView[]) => ready && viewState.matches(views),
    begin(instances: readonly CrowdInstance[], views: readonly CrowdProjectionView[]): Publication {
      check();
      if (pending) throw Error("Crowd audience upload already pending");
      ready = false;
      nextViews.commit(views);
      const resubmitted = instances !== snapshot.instances;
      if (resubmitted) instances = snapshot.capture(instances);
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
      // Authoring catalogs deliberately omit atlases; preserve the planner's
      // visibility/hysteresis and cap only the drawable mesh tier.
      if (atlases === null) {
        plan.counts = emptyLodCounts();
        plan.shadowCounts = emptyLodCounts();
        for (let i = 0; i < instances.length; i++) {
          const lastMesh = assets[instances[i].classId].tiers.length - 1;
          plan.levels[i] = Math.min(plan.levels[i], lastMesh);
          plan.shadowLevels[i] = Math.min(plan.shadowLevels[i], lastMesh);
          plan.counts[LOD_COUNT_KEYS[plan.levels[i]]]++;
          if (plan.visibility[i] & 2) plan.shadowCounts[LOD_COUNT_KEYS[plan.shadowLevels[i]]]++;
        }
      }
      const groups = new Map(ids.map((id) => [id, [] as CrowdInstance[]]));
      for (let i = 0; i < instances.length; i++) {
        const instance = instances[i];
        if (plan.visibility[i] & 1 && plan.levels[i] === IMPOSTOR_LEVEL)
          groups.get(instance.classId)!.push(instance);
      }
      pending = {
        count: instances.length,
        submission: resubmitted ? submission + 1 : submission,
        instances: snapshot.instances,
        plan,
        groups,
      };
      return pending;
    },
    commit(publication: Publication, view: ImpostorView) {
      check();
      if (pending !== publication) throw Error("Crowd audience publication is not pending");
      [previous, next] = [next, previous];
      previousCount = publication.count;
      submission = publication.submission;
      selected = publication.groups;
      mainVisible = publication.plan.viewVisible;
      shadowOnly = publication.plan.shadowOnly;
      visibleTierHistogram = emptyLodCounts();
      for (let i = 0; i < previousCount; i++)
        if (previous.visibility[i] & 1) visibleTierHistogram[LOD_COUNT_KEYS[previous.levels[i]]]++;
      shadowTierHistogram = { ...publication.plan.shadowCounts };
      [viewState, nextViews] = [nextViews, viewState];
      rememberBillboardView(view);
      pending = undefined;
      ready = true;
    },
    abort(publication: Publication) {
      if (pending === publication) {
        pending = undefined;
        if (disposed) snapshot.clear();
      }
    },
    refreshImpostors(
      view: ImpostorView,
      update: (groups: ReadonlyMap<number, readonly CrowdInstance[]>) => void,
    ) {
      check(true);
      if (matchesBillboardView(view)) return;
      ready = false;
      update(selected);
      check();
      rememberBillboardView(view);
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
