/** Who owns the battle frame, published beside the measurements so a check can
 * tell which renderer produced them. The counterpart of the photoreal seam's
 * `{ substrate, projection }`; it names this world, it does not stand in for
 * the depth, content or camera measurements themselves. */
export const RAW_BATTLE_SUBSTRATE = "raw-webgpu" as const;

/** camera3d is the only projector: every pass reads the one camera uniform this
 * world writes from `camera3d` params through `frameCamera`. */
export const RAW_BATTLE_PROJECTION = "camera3d" as const;
