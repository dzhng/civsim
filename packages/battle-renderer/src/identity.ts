/** Declared ownership identity of one battle world: who produced the physical
 * measurements published beside it, and the single projector every one of its
 * passes reads. It is a declaration, not a measurement — it names the world, and
 * it stands in for none of the depth, content or camera reports it travels with.
 * The counterpart of the photoreal seam's `{ substrate, projection }`. Each world
 * declares its own; a candidate that has not named itself declares nothing rather
 * than borrowing another world's name. */
export interface BattleWorldIdentity {
  substrate: string;
  /** camera3d is the only projector: every pass reads the one camera uniform the
   *  world writes from `camera3d` params through the shared `frameCamera`. */
  projection: "camera3d";
}

/** The raw WebGPU world in this package. */
export const RAW_BATTLE_IDENTITY = {
  substrate: "raw-webgpu",
  projection: "camera3d",
} as const satisfies BattleWorldIdentity;
