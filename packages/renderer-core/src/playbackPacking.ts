export const PLAYBACK_WORDS = 20;
export const PLAYBACK_HEADER_FLAGS = 0;
export const PLAYBACK_HEADER_BASE_WEIGHT = 1;
export const PLAYBACK_HEADER_UPPER_WEIGHT = 2;
export const PLAYBACK_HEADER_UPPER_MASK = 3;
export const PLAYBACK_BASE_SOURCE = 4;
export const PLAYBACK_BASE_DESTINATION = 8;
export const PLAYBACK_UPPER_SOURCE = 12;
export const PLAYBACK_UPPER_DESTINATION = 16;
export const PLAYBACK_BASE_FROZEN = 1;
export const PLAYBACK_UPPER_PRESENT = 2;
export const PLAYBACK_UPPER_FROZEN = 4;
export const PLAYBACK_UPPER_DEST_BASE = 8;

export interface PreparedPlayback {
  /** Uint32 words with Float32 weights/fractions bitcast through the same buffer. */
  controls: Uint32Array;
  uploads: { slot: number; data: Float32Array }[];
  residentSnapshotCount: number;
  /** Highest referenced slot + 1, including holes; not the number of live references. */
  requiredSnapshotSlots: number;
  visibleInstances: number;
}

/** One instance per loaded rig+animation generation; no global pose-identity cache. */
export class PlaybackPacker {
  private resident = new Map<readonly number[], number>();
  private pending?: { frame: PreparedPlayback; resident: Map<readonly number[], number> };
  private peakSlots = 0;

  constructor(
    readonly rig: ImportedRig,
    readonly animation: LocalAnimation,
  ) {
    if (rig.bones.length !== animation.bones)
      throw new Error("playback rig and animation joint counts differ");
  }

  /** Accessors read stable submitted values, never advance playback. A new plan supersedes
   * any unsubmitted plan, invalidating its possible overwrites. Mask offsets are absolute
   * words in the kernel's static appearance mask table, read only for an active overlay.
   * Optional control storage belongs to the caller; its active prefix is overwritten,
   * and must stay unchanged until the prepared frame has been submitted or discarded. */
  prepare(
    count: number,
    playbackAt: (index: number) => SoldierPlayback | ClipSample,
    upperMaskOffsetAt: (index: number) => number,
    controlStorage?: Uint32Array,
  ): PreparedPlayback {
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error("playback count must be a nonnegative safe integer");
    this.abandonPending();
    const needed = new Set<readonly number[]>();
    const collect = (source: PoseSource) => {
      if (source.kind === "frozen") {
        if (source.locals.length !== this.animation.bones * 10)
          throw new Error("frozen source does not match rig generation");
        needed.add(source.locals);
      }
    };
    for (let index = 0; index < count; index++) {
      const playback = playbackAt(index);
      if (!("base" in playback)) continue;
      collect(playback.base.source);
      if (playback.riderUpperBody) collect(playback.riderUpperBody.source);
    }
    const next = new Map<readonly number[], number>();
    for (const [source, slot] of this.resident) if (needed.has(source)) next.set(source, slot);
    const occupied = new Set(next.values());
    const uploads: PreparedPlayback["uploads"] = [];
    let free = 0;
    for (const source of needed)
      if (!next.has(source)) {
        while (occupied.has(free)) free++;
        const slot = free++;
        next.set(source, slot);
        occupied.add(slot);
        uploads.push({ slot, data: packLocalPose(source) });
      }
    const words = count * PLAYBACK_WORDS;
    if (controlStorage && controlStorage.length < words)
      throw new Error("playback control storage is too small");
    const controls = controlStorage ? controlStorage.subarray(0, words) : new Uint32Array(words);
    if (controlStorage) controls.fill(0);
    const floats = new Float32Array(controls.buffer, controls.byteOffset, controls.length);
    const clip = (sample: ClipSample, offset: number) => {
      const resolved = resolveLocalSample(this.animation, sample.clip, sample.phase);
      controls[offset] = resolved.sampleA;
      controls[offset + 1] = resolved.sampleB;
      floats[offset + 2] = resolved.fraction;
      controls[offset + 3] = resolved.stepMaskOffset;
    };
    const source = (value: PoseSource, offset: number) => {
      if (value.kind === "clip") clip(value.sample, offset);
      else controls[offset] = next.get(value.locals)!;
    };
    const weight = (value: number, offset: number) => {
      if (!Number.isFinite(value) || value < 0 || value > 1)
        throw new Error("playback blend weight must be from zero to one");
      floats[offset] = value;
    };
    for (let index = 0; index < count; index++) {
      const playback = playbackAt(index),
        offset = index * PLAYBACK_WORDS;
      if (!("base" in playback)) {
        floats[offset + PLAYBACK_HEADER_BASE_WEIGHT] = 1;
        clip(playback, offset + PLAYBACK_BASE_SOURCE);
        for (let word = 0; word < 4; word++)
          controls[offset + PLAYBACK_BASE_DESTINATION + word] =
            controls[offset + PLAYBACK_BASE_SOURCE + word];
        continue;
      }
      let flags = playback.base.source.kind === "frozen" ? PLAYBACK_BASE_FROZEN : 0;
      weight(playback.base.weight, offset + PLAYBACK_HEADER_BASE_WEIGHT);
      source(playback.base.source, offset + PLAYBACK_BASE_SOURCE);
      // Settled timeline lanes share the endpoint object; preserve its encoded bits.
      if (
        playback.base.source.kind === "clip" &&
        playback.base.source.sample === playback.base.destination
      )
        for (let word = 0; word < 4; word++)
          controls[offset + PLAYBACK_BASE_DESTINATION + word] =
            controls[offset + PLAYBACK_BASE_SOURCE + word];
      else clip(playback.base.destination, offset + PLAYBACK_BASE_DESTINATION);
      const upper = playback.riderUpperBody;
      if (upper) {
        const upperMaskOffset = upperMaskOffsetAt(index);
        if (
          !Number.isInteger(upperMaskOffset) ||
          upperMaskOffset < 0 ||
          upperMaskOffset > 0xffffffff
        )
          throw new Error("upper-body mask offset must fit Uint32");
        flags |= PLAYBACK_UPPER_PRESENT;
        if (upper.source.kind === "frozen") flags |= PLAYBACK_UPPER_FROZEN;
        controls[offset + PLAYBACK_HEADER_UPPER_MASK] = upperMaskOffset;
        weight(upper.weight, offset + PLAYBACK_HEADER_UPPER_WEIGHT);
        source(upper.source, offset + PLAYBACK_UPPER_SOURCE);
        if ("kind" in upper.destination) flags |= PLAYBACK_UPPER_DEST_BASE;
        else if (upper.source.kind === "clip" && upper.source.sample === upper.destination)
          for (let word = 0; word < 4; word++)
            controls[offset + PLAYBACK_UPPER_DESTINATION + word] =
              controls[offset + PLAYBACK_UPPER_SOURCE + word];
        else clip(upper.destination, offset + PLAYBACK_UPPER_DESTINATION);
      }
      controls[offset + PLAYBACK_HEADER_FLAGS] = flags;
    }
    let requiredSnapshotSlots = 0;
    for (const slot of next.values())
      requiredSnapshotSlots = Math.max(requiredSnapshotSlots, slot + 1);
    const frame = {
      controls,
      uploads,
      residentSnapshotCount: next.size,
      requiredSnapshotSlots,
      visibleInstances: count,
    };
    this.pending = { frame, resident: next };
    return frame;
  }

  /** Call only after the adapter has successfully queued this frame's uploads/submission. */
  commitPrepared(frame: PreparedPlayback): void {
    if (this.pending?.frame !== frame)
      throw new Error("playback plan is no longer pending in this rig generation");
    this.resident = this.pending.resident;
    this.peakSlots = Math.max(this.peakSlots, frame.requiredSnapshotSlots);
    this.pending = undefined;
  }

  discardPrepared(frame: PreparedPlayback): void {
    if (this.pending?.frame === frame) this.abandonPending();
  }

  private abandonPending(): void {
    if (!this.pending) return;
    // Some queue writes may have landed before a later upload/submission failed.
    // Conservatively forget overwritten identities; queued writes cannot be rolled back.
    const overwritten = new Set(this.pending.frame.uploads.map((upload) => upload.slot));
    for (const [source, slot] of this.resident)
      if (overwritten.has(slot)) this.resident.delete(source);
    this.pending = undefined;
  }

  /** A reset/reload never carries source identity or pending uploads into a new generation. */
  reset(): void {
    this.resident.clear();
    this.pending = undefined;
    this.peakSlots = 0;
  }

  get residentSnapshotCount(): number {
    return this.resident.size;
  }
  /** CPU slot-address high water only; GPU allocated capacity remains the adapter's policy. */
  get peakCommittedSnapshotSlots(): number {
    return this.peakSlots;
  }
}
import type {
  SoldierPlayback,
  PoseSource,
  ClipSample,
} from "../../crowd-runtime/src/actionTimeline";
import type { ImportedRig } from "../../soldier-assets/src/rig";
import {
  packLocalPose,
  resolveLocalSample,
  type LocalAnimation,
} from "../../soldier-assets/src/localAnimation";
