import type { ImportedRig } from "../../soldier-assets/src/rig";
import type { LocalAnimation } from "../../soldier-assets/src/localAnimation";
import type { ClipSample, SoldierPlayback } from "../../crowd-runtime/src/actionTimeline";
import { PlaybackPacker, PLAYBACK_WORDS } from "../../renderer-core/src/playbackPacking";
import { packRigPaletteData } from "../../renderer-core/src/rigPaletteData";
import {
  growSnapshotBankCapacity,
  POSE_PALETTE_STORAGE_TYPES,
} from "../../renderer-core/src/posePaletteStorage";

type PoseLimits = Pick<
  GPUSupportedLimits,
  | "maxStorageBuffersPerShaderStage"
  | "maxBufferSize"
  | "maxStorageBufferBindingSize"
  | "maxComputeWorkgroupsPerDimension"
>;

/** CPU upload transaction only: candidate adapters own allocation, binding and commands. */
export class PoseUpload {
  readonly packer: PlaybackPacker;
  readonly staticData: ReturnType<typeof packRigPaletteData>;
  readonly bones: number;
  sizes = [16, 16, 16, 64]; // controls, snapshot banks, palette
  count = 0;
  snapshotUploadBytes = 0;
  constructor(
    readonly rig: ImportedRig,
    readonly animation: LocalAnimation,
    appearances: Parameters<typeof packRigPaletteData>[2],
    readonly limits: PoseLimits,
  ) {
    if (limits.maxStorageBuffersPerShaderStage < POSE_PALETTE_STORAGE_TYPES.length)
      throw new Error(`Pose requires ${POSE_PALETTE_STORAGE_TYPES.length} storage buffers`);
    this.bones = rig.bones.length;
    this.packer = new PlaybackPacker(rig, animation);
    this.staticData = packRigPaletteData(rig, animation, appearances);
  }
  check(bytes: number) {
    if (bytes > Math.min(this.limits.maxBufferSize, this.limits.maxStorageBufferBindingSize))
      throw new Error("Pose storage exceeds device limit");
  }
  prepare(
    count: number,
    playbackAt: (i: number) => SoldierPlayback | ClipSample,
    appearanceAt: (i: number) => number,
  ) {
    if (
      !Number.isInteger(count) ||
      count < 0 ||
      count > 0xffffff ||
      Math.ceil(count / 64) > this.limits.maxComputeWorkgroupsPerDimension
    )
      throw new Error("Pose count exceeds indexing/dispatch limit");
    this.check(count * PLAYBACK_WORDS * 4);
    this.check(count * this.bones * 64);
    const maskAt = (i: number) => {
      const mask = this.staticData.upperMaskOffsets.get(appearanceAt(i));
      if (mask === undefined) throw new Error("Pose appearance is not in rig group");
      return mask;
    };
    let frame = this.packer.prepare(count, playbackAt, maskAt);
    const grow = (old: number, bytes: number, alignment = 16) =>
      bytes <= old
        ? old
        : Math.max(
            old,
            Math.min(
              Math.max(bytes, old * 2, 128),
              Math.floor(
                Math.min(this.limits.maxBufferSize, this.limits.maxStorageBufferBindingSize) /
                  alignment,
              ) * alignment,
            ),
          );
    const controls = grow(this.sizes[0], count * PLAYBACK_WORDS * 4);
    const palette = grow(this.sizes[3], count * this.bones * 64, 64);
    const stride = this.bones * 48;
    const bank =
      growSnapshotBankCapacity(
        frame.requiredSnapshotSlots,
        Math.floor(this.sizes[1] / stride),
        Math.floor(palette / (this.bones * 64)),
      ) * stride;
    const sizes = [controls, Math.max(this.sizes[1], bank), Math.max(this.sizes[2], bank), palette];
    for (const bytes of sizes) this.check(bytes);
    if (sizes[1] !== this.sizes[1]) {
      this.packer.reset();
      frame = this.packer.prepare(count, playbackAt, maskAt);
    }
    return {
      frame,
      sizes,
      count,
      dispatch: new Uint32Array([count, this.staticData.stepBase, 0, 0]),
    };
  }
  commit(plan: ReturnType<PoseUpload["prepare"]>) {
    this.packer.commitPrepared(plan.frame);
    this.sizes = plan.sizes;
    this.count = plan.count;
    this.snapshotUploadBytes = plan.frame.uploads.reduce((n, u) => n + u.data.byteLength, 0);
  }
  discard(plan: ReturnType<PoseUpload["prepare"]>) {
    this.packer.discardPrepared(plan.frame);
  }
  stats() {
    return {
      instances: this.count,
      residentSnapshots: this.packer.residentSnapshotCount,
      snapshotUploadBytes: this.snapshotUploadBytes,
      controlBytes: this.sizes[0],
      snapshotBytes: this.sizes[1] + this.sizes[2],
      paletteBytes: this.sizes[3],
    };
  }
}
