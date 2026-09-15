/** Shadow quality and fit policy shared by source and comparison runtimes.
 * These are the existing defaults; stronger tactical coverage is a later change. */
export type SunShadowMode = "csm" | "single" | "off";
export const CSM_CASCADES = 2;
export const CSM_MAP_SIZE = 2048;
export const SINGLE_MAP_SIZE = 1024;
// The limited cascade range keeps distant haze from spending close shadow texels.
export const SHADOW_MAX_FAR = 1500;
export const CSM_LIGHT_MARGIN = 300;
// Depth bias is normalized; normal bias is in world units.
export const SHADOW_BIAS = -0.00003;
export const SHADOW_NORMAL_BIAS = 0.6;
export const SHADOW_CAM_NEAR = 1;
export const SHADOW_CAM_FAR = 2500;

/** Aerosol turbidity broadens the sampling radius without a second light preset. */
export function shadowRadiusForTurbidity(turbidity: number): number {
  return Math.min(3, Math.max(1, 1 + (turbidity - 2) * 0.28));
}

/** All adapters currently use one soft map; explicit lab overrides select CSM/off. */
export function resolveSunShadowMode(
  _adapterLabel: string,
  override?: string | null,
): SunShadowMode {
  if (override === "off" || override === "single" || override === "csm") return override;
  return "single";
}

/** Existing whole-map fit, shared by control and native shadow orchestration. */
export function singleShadowFit(
  rect: readonly [number, number, number, number],
  unitSunDirection: readonly [number, number, number],
) {
  const [x, y, w, h] = rect,
    cx = x + w / 2,
    cy = y + h / 2;
  const half = Math.hypot(w, h) / 2 + 40,
    reach = half + 200;
  return {
    target: [cx, cy, 0] as [number, number, number],
    position: [
      cx + unitSunDirection[0] * reach,
      cy + unitSunDirection[1] * reach,
      unitSunDirection[2] * reach,
    ] as [number, number, number],
    left: -half,
    right: half,
    top: half,
    bottom: -half,
    near: 1,
    far: reach * 2,
  };
}
