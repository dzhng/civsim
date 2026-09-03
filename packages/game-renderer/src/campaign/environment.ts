import type { RawFrameShell } from "../../../renderer-core/src/frameShell";

export interface CampaignEnvironment {
  /** Sun direction in the camera uniform's azimuth/elevation convention. */
  sunAzimuth: number;
  sunElevation: number;
  hazeColor: [number, number, number];
}

/** Camera-uniform direction used by shared effects and the skinned pipeline. */
export const CAMPAIGN_CAMERA_SUN_DIRECTION = [-0.4, -0.28, 0.87] as const;

export const CAMPAIGN_ENVIRONMENT: CampaignEnvironment = {
  sunAzimuth: Math.atan2(CAMPAIGN_CAMERA_SUN_DIRECTION[1], CAMPAIGN_CAMERA_SUN_DIRECTION[0]),
  sunElevation: Math.asin(
    CAMPAIGN_CAMERA_SUN_DIRECTION[2] / Math.hypot(...CAMPAIGN_CAMERA_SUN_DIRECTION),
  ),
  hazeColor: [0.8, 0.82, 0.8],
};

export function applyCampaignEnvironment(
  shell: RawFrameShell,
  env: CampaignEnvironment = CAMPAIGN_ENVIRONMENT,
): void {
  shell.setSun(env.sunAzimuth, env.sunElevation);
}

export function campaignEnvironmentWgsl(
  env: CampaignEnvironment = CAMPAIGN_ENVIRONMENT,
): string {
  return `const CAMPAIGN_HAZE = ${wgslVec3(env.hazeColor)};`;
}

function wgslVec3(value: readonly [number, number, number]): string {
  return `vec3f(${value.map((component) => component.toFixed(2)).join(", ")})`;
}
