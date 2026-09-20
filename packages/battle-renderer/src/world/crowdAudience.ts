import type { AppearanceBundle } from "../../../soldier-assets/src/appearanceBundle";
import type { ImpostorAtlasData } from "../../../soldier-assets/src/impostorAtlas";
import type { CrowdInstance } from "../../../crowd-runtime/src/instanceData";
import { copySoldierPlayback } from "../../../crowd-runtime/src/frameSnapshot";
import type { CrowdProjectionView } from "../../../crowd-runtime/src/visibility";
import { createCrowdAudienceHistory } from "../crowdAudienceHistory";
import type { GpuDeviceCaps } from "../../../renderer-core/src/capabilities";
import type { ImpostorView } from "../impostorData";
import type { RawEnvironment } from "./environment";
import type { SoldierPlayback } from "../../../crowd-runtime/src/actionTimeline";
import type { AdmittedSeatingMeasurement } from "../types";
import { createRawCrowd } from "./crowd";
import { createRawImpostors } from "./impostor";

/** Metres of agreement required between an instance's elevation and the surface
 * it is seated on. The source world's seating tolerance, unchanged. */
const SEATING_TOLERANCE_METRES = 1e-3;

/** The submitted pose of one soldier, as the crowd owner admitted it. */
export interface SoldierAnimDiagnostic {
  root: [number, number];
  clip: string;
  phase: number;
  playback: SoldierPlayback | undefined;
  duration: number;
}
/** Owns mesh/atlas GPU resources and the previous presentation's LOD history.
 * Assets, device, environment, cameras and pass attachments remain borrowed. */
export async function createRawCrowdAudience(
  device: GPUDevice,
  caps: GpuDeviceCaps,
  assets: Record<number, AppearanceBundle>,
  atlases: Record<number, ImpostorAtlasData>,
  cameraLayout: GPUBindGroupLayout,
  environment: RawEnvironment,
  sampleCount: 1 | 4 = 4,
) {
  const history = createCrowdAudienceHistory(assets, atlases);
  let mesh: Awaited<ReturnType<typeof createRawCrowd>> | undefined;
  const far = new Map<number, Awaited<ReturnType<typeof createRawImpostors>>>();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    history.dispose();
    for (const layer of far.values()) layer.dispose();
    far.clear();
    mesh?.dispose();
  };
  try {
    mesh = await createRawCrowd(device, caps, assets, cameraLayout, environment, { sampleCount });
    for (const id of history.ids)
      far.set(
        id,
        await createRawImpostors(device, atlases[id], cameraLayout, environment, sampleCount),
      );
    const meshOwner = mesh;
    const upload = (
      instances: readonly CrowdInstance[],
      views: readonly CrowdProjectionView[],
      view: ImpostorView,
    ) => {
      const publication = history.begin(instances, views);
      try {
        meshOwner.upload(publication.instances, publication.plan);
        for (const [id, layer] of far) layer.update(publication.groups.get(id)!, view);
        history.commit(publication, view);
      } catch (error) {
        history.abort(publication);
        throw error;
      }
    };
    /** Per-admitted-submission diagnostic records. Cleared whenever a new pose is
     * admitted, so a record's identity is the submission a caller observed and no
     * whole-army copy is taken for frames nobody inspects. */
    let diagnostics = { submission: -1, records: new Map<number, SoldierAnimDiagnostic>() };
    return {
      upload,
      admitted: () => history.admitted()?.instances ?? null,
      /** The submission this owner currently has admitted, or null while none is.
       *  O(1): the counter the history already keeps, so a consumer may record it
       *  on every presented frame without scanning anything. */
      admittedSubmission: () => history.admitted()?.submission ?? null,
      /** Re-measure EVERY admitted instance against `sampleHeightAt`. Verification
       *  only: no frame calls this, nothing is retained afterwards, and null means
       *  there was no admitted population to measure rather than a vacuous match. */
      verifySeating(
        sampleHeightAt: (x: number, y: number) => number,
      ): AdmittedSeatingMeasurement | null {
        const admitted = history.admitted();
        if (!admitted?.instances.length) return null;
        let matches = true,
          nonFinite = 0,
          worstDelta = 0,
          lo = Infinity,
          hi = -Infinity;
        for (const instance of admitted.instances) {
          const elevation = instance.elevation ?? 0;
          const height = sampleHeightAt(instance.x, instance.y);
          // `Math.abs(NaN) > tolerance` is false, so a nonfinite pair has to be
          // rejected explicitly instead of passing as agreement.
          if (!Number.isFinite(elevation) || !Number.isFinite(height)) {
            nonFinite++;
            matches = false;
            continue;
          }
          const delta = Math.abs(elevation - height);
          if (delta > worstDelta) worstDelta = delta;
          if (delta > SEATING_TOLERANCE_METRES) matches = false;
          if (elevation < lo) lo = elevation;
          if (elevation > hi) hi = elevation;
        }
        return {
          checked: admitted.instances.length,
          matches,
          span: lo <= hi ? Number((hi - lo).toFixed(3)) : 0,
          nonFinite,
          worstDelta,
          tolerance: SEATING_TOLERANCE_METRES,
        };
      },
      /** Distinct `classId`/`clip` pairs in the admitted pose, for admission checks. */
      admittedPoses() {
        const poses = new Set<string>();
        for (const instance of history.admitted()?.instances ?? [])
          poses.add(`${instance.classId}\u0000${instance.clip}`);
        return poses;
      },
      /** The submitted pose this owner actually admitted, never a caller's scratch. */
      debugSoldierAnim(index: number): SoldierAnimDiagnostic | null {
        const admitted = history.admitted();
        const instance = admitted?.instances[index];
        if (!admitted || !instance) return null;
        if (diagnostics.submission !== admitted.submission)
          diagnostics = { submission: admitted.submission, records: new Map() };
        let record = diagnostics.records.get(index);
        if (!record) {
          record = {
            root: [instance.x, instance.y],
            clip: instance.clip,
            phase: instance.phase,
            playback: instance.playback && copySoldierPlayback(instance.playback),
            duration: assets[instance.classId].animation.clips.find(
              (clip) => clip.name === instance.clip,
            )!.duration,
          };
          diagnostics.records.set(index, record);
        }
        return record;
      },
      reproject(views: readonly CrowdProjectionView[], view: ImpostorView) {
        history.check(true);
        if (history.matchesViews(views)) return false;
        upload(history.instances(), views, view);
        return true;
      },
      refreshCamera(view: ImpostorView) {
        history.refreshImpostors(view, (groups) => {
          for (const [id, layer] of far) layer.update(groups.get(id)!, view);
        });
      },
      precompute(encoder: GPUCommandEncoder) {
        history.check(true);
        meshOwner.precompute(encoder);
      },
      draw(pass: GPURenderPassEncoder, camera: GPUBindGroup, audience: "main" | "shadow" = "main") {
        history.check(true);
        meshOwner.draw(pass, camera, audience);
        if (audience === "main") for (const layer of far.values()) layer.draw(pass, camera);
      },
      stats() {
        history.check();
        return {
          ...history.stats(),
          mesh: meshOwner.stats(),
          impostors: Object.fromEntries([...far].map(([id, layer]) => [id, layer.stats()])),
        };
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
