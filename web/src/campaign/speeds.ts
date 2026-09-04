/** Campaign fast-forward: tick multipliers and the labels the player sees for
 * them. The date readout and the top-bar buttons both read these, so they can
 * never disagree. Labels are the player-facing rate names, not the multipliers. */
export const CAMPAIGN_SPEEDS = [1, 2, 4] as const;
export const CAMPAIGN_SPEED_LABELS = ["1x", "3x", "10x"] as const;
