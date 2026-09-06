import { LOCAL_ANIMATION_FLOATS_PER_JOINT } from "../../soldier-assets/src/localAnimation";

/** Logical slots stay stable through holes and growth; both playback layers share them. */
export const SNAPSHOT_BANK_COUNT = 2;
/** Samples, metadata, inverse binds, controls, the two snapshot banks, output. */
export const POSE_PALETTE_STORAGE_TYPES = [
  "vec4f",
  "u32",
  "mat4x4f",
  "vec4u",
  "vec4f",
  "vec4f",
  "mat4x4f",
] as const;

export function snapshotBank(slot: number): number {
  return slot % SNAPSHOT_BANK_COUNT;
}

export function snapshotBankFloatOffset(slot: number, bones: number): number {
  return Math.floor(slot / SNAPSHOT_BANK_COUNT) * bones * LOCAL_ANIMATION_FLOATS_PER_JOINT;
}

/** At most two frozen sources per body. Lowest-free slot reuse bounds holes by
 * retained output capacity too, so neither bank can outgrow an admitted output. */
export function growSnapshotBankCapacity(
  requiredSlots: number,
  previousCapacity: number,
  outputCapacity: number,
): number {
  const required = Math.max(1, Math.ceil(requiredSlots / SNAPSHOT_BANK_COUNT));
  return required > previousCapacity
    ? Math.min(Math.max(required, previousCapacity * 2), outputCapacity)
    : previousCapacity;
}
