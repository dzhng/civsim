import type {
  ClipBlend,
  ClipSample,
  PoseSource,
  RiderBlend,
  SoldierPlayback,
} from "./actionTimeline";
import type { CrowdInstance } from "./instanceData";

/** Mutable playback shells are copied; frozen pose arrays already have a readonly
 * contract and stay shared. Dedicated samples preserve endpoint aliasing without
 * retaining a caller's mutable sample objects. */
function blendStorage() {
  const destination: ClipSample = { clip: "", phase: 0 };
  const sample: ClipSample = { clip: "", phase: 0 };
  const source: PoseSource = { kind: "clip", sample };
  const base = { kind: "base" } as const;
  const blend: RiderBlend = { source, destination, weight: 0 };
  return {
    blend,
    copy(input: ClipBlend | RiderBlend) {
      blend.weight = input.weight;
      if ("kind" in input.destination) blend.destination = base;
      else {
        destination.clip = input.destination.clip;
        destination.phase = input.destination.phase;
        blend.destination = destination;
      }
      if (input.source.kind === "frozen") blend.source = input.source;
      else {
        if (input.source.sample === input.destination) source.sample = destination;
        else {
          sample.clip = input.source.sample.clip;
          sample.phase = input.source.sample.phase;
          source.sample = sample;
        }
        blend.source = source;
      }
    },
  };
}

/** A standalone value copy of one submitted playback under the same shell rule.
 * Diagnostics hand this out so a record kept across frames cannot silently observe
 * a later submission through the frame pool's reused shells. */
export function copySoldierPlayback(playback: SoldierPlayback): SoldierPlayback {
  const base = blendStorage();
  base.copy(playback.base);
  const copy: SoldierPlayback = {
    appearanceId: playback.appearanceId,
    base: base.blend as ClipBlend,
  };
  if (playback.riderUpperBody) {
    const upper = blendStorage();
    upper.copy(playback.riderUpperBody);
    copy.riderUpperBody = upper.blend;
  }
  return copy;
}

/** Own the last submitted crowd without allocating new per-man records each
 * frame. Camera-only visibility updates read this state, never a mutable caller
 * array. A new submission overwrites the pool; callers must not retain its result
 * beyond that submission. */
export class CrowdFrameSnapshot {
  readonly instances: CrowdInstance[] = [];
  private readonly slots: {
    instance: CrowdInstance;
    base: ReturnType<typeof blendStorage>;
    upper: ReturnType<typeof blendStorage>;
    playback: SoldierPlayback;
  }[] = [];

  capture(input: readonly CrowdInstance[]): CrowdInstance[] {
    for (let i = 0; i < input.length; i++) {
      const value = input[i];
      let slot = this.slots[i];
      if (!slot) {
        const base = blendStorage(),
          upper = blendStorage();
        slot = this.slots[i] = {
          // Every retained record is born from this one literal, so the pool
          // shares a single shape instead of inheriting each first input's.
          instance: {
            x: 0,
            y: 0,
            facing: 0,
            classId: 0,
            faction: 0,
            alive: true,
            clip: "",
            phase: 0,
            seed: 0,
            mounted: false,
            lod: 0,
            playback: undefined,
            elevation: undefined,
          },
          base,
          upper,
          playback: {
            appearanceId: 0,
            base: base.blend as ClipBlend,
            riderUpperBody: undefined,
          },
        };
      }
      const instance = slot.instance;
      instance.x = value.x;
      instance.y = value.y;
      instance.facing = value.facing;
      instance.classId = value.classId;
      instance.faction = value.faction;
      instance.alive = value.alive;
      instance.clip = value.clip;
      instance.phase = value.phase;
      instance.seed = value.seed;
      instance.mounted = value.mounted;
      instance.lod = value.lod;
      // Optional fields are written on every capture, absent or not: a reused
      // slot would otherwise resurrect an old elevation or playback.
      instance.elevation = value.elevation;
      if (value.playback) {
        slot.base.copy(value.playback.base);
        slot.playback.appearanceId = value.playback.appearanceId;
        if (value.playback.riderUpperBody) {
          slot.upper.copy(value.playback.riderUpperBody);
          slot.playback.riderUpperBody = slot.upper.blend;
        } else slot.playback.riderUpperBody = undefined;
        instance.playback = slot.playback;
      } else instance.playback = undefined;
      this.instances[i] = instance;
    }
    this.instances.length = input.length;
    return this.instances;
  }

  clear(): void {
    this.instances.length = 0;
    this.slots.length = 0;
  }
}
