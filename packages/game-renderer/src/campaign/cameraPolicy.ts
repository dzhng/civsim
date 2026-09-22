import { smoothstep } from "../../../renderer-core/src/math";

export const CAMPAIGN_TILT_START_ZOOM = 0.62;
/** Fully tilted views keep every on-screen own-city card visible. */
export const CAMPAIGN_FULL_TILT_ZOOM = 1.6;
const CAMPAIGN_CLOSE_PITCH = 0.82;

/** Tilt away from the chart's top-down view, in radians. */
export function campaignPitch(zoom: number) {
  return CAMPAIGN_CLOSE_PITCH * campaignPhysicalViewWeight(zoom);
}

/** Chart-to-regional detail transition. Atmosphere supplies CSS pixels per
 * world unit, so DPR does not change optical depth. The legacy interaction
 * pitch also uses this curve; live projection remains owned by the rig. */
export function campaignPhysicalViewWeight(zoom: number) {
  return smoothstep(CAMPAIGN_TILT_START_ZOOM, CAMPAIGN_FULL_TILT_ZOOM, zoom);
}
