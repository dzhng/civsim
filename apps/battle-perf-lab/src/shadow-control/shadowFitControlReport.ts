/** Evidence for the lab's whole-map shadow control (measurement build B).
 *
 * The control is a build-time substitution inside the SHARED shadow policy, so
 * neither the Three rig's identity block nor the native scene stats can name
 * it. This module is what the substituted owner reports through, and only a
 * build carrying the substitution ever imports it:
 *
 *   - `control` is COMPILED PROVENANCE. It names the fit the build asked for.
 *   - the counters and `latest` bounds beside it are RUNTIME EVIDENCE. They
 *     say what the fit actually produced, so a reader never has to take the
 *     requested name for the delivered map.
 *
 * The report is published on `globalThis` because the page-side capture and
 * trial harnesses are owned elsewhere; reading a global is how they reach this
 * without the control editing them.
 */

export const SHADOW_FIT_CONTROL_GLOBAL = "__battleShadowFitControl";
export const SHADOW_FIT_CONTROL_FLAG = "BATTLE_SHADOW_FIT";

/** The subset of a fit that decides which texels get rasterised. */
export interface ShadowFitControlMap {
  extent: number;
  worldUnitsPerTexel: number;
  normalBias: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
  coverage: number;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

export interface ShadowFitControlReport {
  /** Compiled provenance: the fit this build requested. */
  control: "whole-map-original";
  flag: typeof SHADOW_FIT_CONTROL_FLAG;
  /** The anchored site the control replaced, so a reader can check the claim. */
  owner: string;
  scope: string;
  /** Camera-driven fits the substituted owner produced since load. Terrain and
   *  sun updates that never posed a camera are not counted here; they reach the
   *  same whole-map fit through the policy's own fallback. */
  fits: number;
  /** How many DIFFERENT maps those fits rasterised. The control's whole claim
   *  is that camera motion never raises this past one. */
  distinctMaps: number;
  latest: ShadowFitControlMap | null;
}

const SCOPE =
  "lab-only build-time control: the shared policy's camera-driven fit is replaced by its own " +
  "whole-map fallback, so map size, biases, PCF softness, sun pose, depths and caster views " +
  "stay the shared policy's. Scene content, DPR and every other renderer path are untouched";

const report: ShadowFitControlReport = {
  control: "whole-map-original",
  flag: SHADOW_FIT_CONTROL_FLAG,
  owner: "packages/game-renderer/src/battle/shadowPolicy.ts SingleShadowPolicy#viewFit",
  scope: SCOPE,
  fits: 0,
  distinctMaps: 0,
  latest: null,
};

let signature = "";

/** Called by the substituted owner with the fit it is about to hand back. */
export function recordWholeMapShadowFit<Fit extends ShadowFitControlMap>(fit: Fit): Fit {
  report.fits++;
  const next = `${fit.extent}|${fit.near}|${fit.far}|${fit.position.join(",")}`;
  if (next !== signature) {
    signature = next;
    report.distinctMaps++;
  }
  report.latest = {
    extent: fit.extent,
    worldUnitsPerTexel: fit.worldUnitsPerTexel,
    normalBias: fit.normalBias,
    left: fit.left,
    right: fit.right,
    top: fit.top,
    bottom: fit.bottom,
    near: fit.near,
    far: fit.far,
    coverage: fit.coverage,
    position: [...fit.position],
    target: [...fit.target],
  };
  return fit;
}

export function shadowFitControlReport(): ShadowFitControlReport {
  return { ...report, latest: report.latest && { ...report.latest } };
}

/** Test seam: a fresh module per case is not available under one transformed graph. */
export function resetShadowFitControlReport(): void {
  report.fits = 0;
  report.distinctMaps = 0;
  report.latest = null;
  signature = "";
}

(globalThis as Record<string, unknown>)[SHADOW_FIT_CONTROL_GLOBAL] = report;
