import type { AppearanceBundle } from "../../soldier-assets/src/appearanceBundle";

/** Bundle loading validates the schema; gameplay additionally excludes manual fixtures. */
export function assertGameplayAppearances(appearances: Record<number, AppearanceBundle>): void {
  for (const [id, appearance] of Object.entries(appearances)) {
    if (appearance.manifest.presentation === null)
      throw new Error(`Appearance ${id} is manual-only and cannot be used in gameplay`);
    for (const binding of Object.values(appearance.manifest.presentation.actions)) {
      if (!binding) continue;
      const local = appearance.rig.clips.find((clip) => clip.name === binding.clip);
      const vat = appearance.animation.clips.find((clip) => clip.name === binding.clip);
      if (
        !local ||
        !vat ||
        local.duration !== vat.duration ||
        local.loop !== vat.loop ||
        local.markers?.release !== vat.markers?.release
      )
        throw new Error(
          `Appearance ${id} action ${binding.clip} has missing or mismatched rig/VAT clip metadata`,
        );
    }
  }
}

export const MARCH_ENTER_SPEED_MPS = 0.4;
export const MARCH_EXIT_SPEED_MPS = 0.15;

export function marchingStateForSpeed(
  speedMps: number,
  wasMarching: boolean,
  enterSpeedMps = MARCH_ENTER_SPEED_MPS,
  exitSpeedMps = MARCH_EXIT_SPEED_MPS,
): boolean {
  if (!Number.isFinite(speedMps) || speedMps < 0) return wasMarching;
  return wasMarching ? speedMps > exitSpeedMps : speedMps > enterSpeedMps;
}
