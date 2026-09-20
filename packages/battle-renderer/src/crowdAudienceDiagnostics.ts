import { copySoldierPlayback } from "../../crowd-runtime/src/frameSnapshot";
import type { SoldierPlayback } from "../../crowd-runtime/src/actionTimeline";
import type { AppearanceBundle } from "../../soldier-assets/src/appearanceBundle";
import type { AdmittedCrowdPose } from "./crowdAudienceHistory";
import type { AdmittedSeatingMeasurement } from "./types";

/** Metres of agreement required between an instance's elevation and the surface
 * it claims to sit on. */
const SEATING_TOLERANCE_METRES = 1e-3;

/** The submitted pose of one soldier, as the crowd owner admitted it. */
export interface SoldierAnimDiagnostic {
  root: [number, number];
  clip: string;
  phase: number;
  playback: SoldierPlayback | undefined;
  duration: number;
}

/** Diagnostic reads of the pose an audience currently has admitted. An audience's
 * LOD history is the only input, so every backend answers these from one
 * implementation; nothing here inspects GPU resources. No frame calls any of them:
 * each answer is computed when a caller asks, off the history's own admitted
 * snapshot, so a presented frame neither scans nor copies the army. */
export function createCrowdAudienceDiagnostics(
  history: { admitted(): AdmittedCrowdPose | null },
  assets: Record<number, AppearanceBundle>,
) {
  /** Per-admitted-submission records. Cleared whenever a new pose is admitted, so a
   * record's identity is the submission a caller observed and no whole-army copy is
   * taken for frames nobody inspects. */
  let records = new Map<number, SoldierAnimDiagnostic>(),
    recordedSubmission = -1;
  return {
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
      if (recordedSubmission !== admitted.submission) {
        recordedSubmission = admitted.submission;
        records = new Map();
      }
      let record = records.get(index);
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
        records.set(index, record);
      }
      return record;
    },
  };
}
