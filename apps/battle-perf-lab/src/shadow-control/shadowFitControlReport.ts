/** Read-time evidence for the lab's whole-map shadow control (measurement B).
 *
 * The substituted policy registers itself here once, at construction; the rest
 * is read on demand, so a camera update costs nothing extra and a reader gets
 * the installed policy's own state rather than a record kept alongside it.
 *
 * `control` is COMPILED PROVENANCE: it reaches a bundle only because the
 * substitution was compiled in, so it names the REQUESTED fit. `fit` and
 * `refits` are the CPU policy's chosen fit and its own rebuild count. Nothing
 * here observes shadow-map rasterisation, upload or draw submission — that
 * evidence exists only in a hardware run.
 */
import type {
  ShadowViewFit,
  SingleShadowPolicy,
} from "@packages/game-renderer/src/battle/shadowPolicy";

export const SHADOW_FIT_CONTROL_GLOBAL = "__battleShadowFitControl";
export const SHADOW_FIT_CONTROL_FLAG = "BATTLE_SHADOW_FIT";

/** The part of the owner's own fit that decides which ground one map covers. */
export type ShadowFitControlMap = Pick<
  ShadowViewFit,
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "near"
  | "far"
  | "extent"
  | "worldUnitsPerTexel"
  | "normalBias"
  | "coverage"
  | "position"
  | "target"
>;

/** All this module reads. Derived from the owner so it cannot drift from it. */
type ObservedPolicy = Pick<SingleShadowPolicy, "fit" | "refits">;

export interface ShadowFitControlReport {
  /** Compiled provenance: the fit this build requested. */
  control: "whole-map-original";
  flag: typeof SHADOW_FIT_CONTROL_FLAG;
  /** The anchored sites the control replaced, so a reader can check the claim. */
  owner: string;
  scope: string;
  /** False before a policy is built, and once a torn-down one is collected. */
  observed: boolean;
  /** The owner's OWN refit count: different maps it has installed since it was
   *  constructed. Held still by camera motion is this control's whole claim. */
  refits: number | null;
  fit: ShadowFitControlMap | null;
}

const OWNER =
  "packages/game-renderer/src/battle/shadowPolicy.ts SingleShadowPolicy: #viewFit returns " +
  "wholeMapFit(), and the constructor registers the policy here";

const SCOPE =
  "lab-only build-time control: the shared policy's camera-driven fit is replaced by its own " +
  "whole-map fallback, so map size, biases, PCF softness, sun pose, depths and caster views " +
  "stay the shared policy's. Scene content, DPR and every other renderer path are untouched. " +
  "Evidence here is the CPU policy's chosen fit only: it observes no rasterisation, upload or " +
  "submission";

/** Held weakly and latest-only: a torn-down world's policy stays collectable,
 *  and a collected one reports unobserved rather than as the live map. Each
 *  build has one live shadow owner (the Three rig, or the native shadow frame),
 *  so "most recently constructed" and "current" are the same policy there. */
let registered: WeakRef<ObservedPolicy> | null = null;

/** Called once per policy, by the substituted constructor. */
export function registerWholeMapShadowPolicy(policy: ObservedPolicy): void {
  registered = new WeakRef(policy);
}

/** A fresh snapshot per call: later policy updates never reach a returned
 *  report, and a reader that edits one never reaches the policy. */
export function shadowFitControlReport(): ShadowFitControlReport {
  const policy = registered?.deref();
  const fit = policy?.fit;
  return {
    control: "whole-map-original",
    flag: SHADOW_FIT_CONTROL_FLAG,
    owner: OWNER,
    scope: SCOPE,
    observed: policy !== undefined,
    refits: policy?.refits ?? null,
    fit: fit
      ? {
          left: fit.left,
          right: fit.right,
          top: fit.top,
          bottom: fit.bottom,
          near: fit.near,
          far: fit.far,
          extent: fit.extent,
          worldUnitsPerTexel: fit.worldUnitsPerTexel,
          normalBias: fit.normalBias,
          coverage: fit.coverage,
          position: [...fit.position],
          target: [...fit.target],
        }
      : null,
  };
}

// Page-side capture and trial harnesses are owned elsewhere; a global getter is
// how they reach this without the control editing them, and it keeps the read
// lazy so nothing here runs on a frame that nobody is reading.
Object.defineProperty(globalThis, SHADOW_FIT_CONTROL_GLOBAL, {
  configurable: true,
  get: shadowFitControlReport,
});
