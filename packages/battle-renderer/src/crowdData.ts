import { growableBufferCapacity } from "../../renderer-core/src/bufferCapacity";
import type { AppearanceBundle } from "../../soldier-assets/src/appearanceBundle";
import {
  corpsePresentationStrength,
  type CrowdInstance,
} from "../../crowd-runtime/src/instanceData";
import { COARSEST_SHADOW_LOD, IMPOSTOR_LEVEL } from "../../crowd-runtime/src/lod";
export type CrowdAudience = "main" | "shadow";
export interface CrowdAudiencePlan {
  levels: ArrayLike<number>;
  shadowLevels: ArrayLike<number>;
  visibility: ArrayLike<number>;
}
export function crowdRigGroups<T extends Pick<AppearanceBundle, "rig" | "animation">>(
  assets: Record<number, T>,
) {
  const groups: Record<number, T>[] = [];
  for (const [id, bundle] of Object.entries(assets)) {
    let group = groups.find((g) => {
      const a = Object.values(g)[0];
      return a.rig === bundle.rig && a.animation === bundle.animation;
    });
    if (!group) {
      group = {};
      groups.push(group);
    }
    group[Number(id)] = bundle;
  }
  return groups;
}
type PackedAudiences = { main: Float32Array<ArrayBuffer>[]; shadow: Float32Array<ArrayBuffer>[] };
class CrowdBucket {
  data = new Float32Array(0);
  length = 0;
  append(p: CrowdInstance, slot: number) {
    const end = this.length + 12;
    if (end > this.data.length) {
      const next = new Float32Array(growableBufferCapacity(this.data.byteLength, end * 4) / 4);
      next.set(this.data.subarray(0, this.length));
      this.data = next;
    }
    const d = this.data,
      i = this.length;
    d[i] = p.x;
    d[i + 1] = p.y;
    d[i + 2] = p.facing;
    d[i + 3] = p.faction;
    d[i + 4] = 1;
    d[i + 5] = slot;
    d[i + 6] = 0;
    d[i + 7] = 0;
    d[i + 8] = p.elevation ?? 0;
    d[i + 9] = 0;
    d[i + 10] = corpsePresentationStrength(p);
    d[i + 11] = 0;
    this.length = end;
  }
}
/** Result storage belongs to this packer and remains valid until its next pack call. */
export class CrowdFramePacker {
  private readonly owners = new Map<number, number>();
  private readonly buckets = new Map<number, { main: CrowdBucket[]; shadow: CrowdBucket[] }>();
  private readonly result: {
    rigIndices: number[][];
    packed: Map<number, PackedAudiences>;
    impostorsPending: number;
  };
  constructor(groups: readonly Record<number, Pick<AppearanceBundle, "rig" | "animation">>[]) {
    this.result = { rigIndices: groups.map(() => []), packed: new Map(), impostorsPending: 0 };
    groups.forEach((group, owner) => {
      for (const key of Object.keys(group)) {
        const id = Number(key);
        this.owners.set(id, owner);
        this.buckets.set(id, {
          main: Array.from({ length: IMPOSTOR_LEVEL }, () => new CrowdBucket()),
          shadow: Array.from({ length: IMPOSTOR_LEVEL }, () => new CrowdBucket()),
        });
        this.result.packed.set(id, { main: [], shadow: [] });
      }
    });
  }
  pack(instances: readonly CrowdInstance[], plan: CrowdAudiencePlan) {
    if (
      plan.levels.length < instances.length ||
      plan.shadowLevels.length < instances.length ||
      plan.visibility.length < instances.length
    )
      throw new Error("Crowd plan omits instances");
    const result = this.result;
    for (const indices of result.rigIndices) indices.length = 0;
    for (const b of this.buckets.values())
      for (const audience of ["main", "shadow"] as const)
        for (const bucket of b[audience]) bucket.length = 0;
    result.impostorsPending = 0;
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i],
        owner = this.owners.get(inst.classId);
      if (owner === undefined) throw new Error(`Missing appearance ${inst.classId}`);
      if (!plan.visibility[i]) continue;
      const main = (plan.visibility[i] & 1) !== 0,
        shadow = (plan.visibility[i] & 2) !== 0;
      const m = plan.levels[i],
        s = plan.shadowLevels[i];
      if (
        (main && (m < 0 || m > IMPOSTOR_LEVEL || !Number.isInteger(m))) ||
        (shadow && (s < 0 || s > COARSEST_SHADOW_LOD || !Number.isInteger(s)))
      )
        throw new Error("Invalid crowd tier");
      if (main && m === IMPOSTOR_LEVEL) result.impostorsPending++;
      if ((!main || m === IMPOSTOR_LEVEL) && !shadow) continue;
      const indices = result.rigIndices[owner],
        slot = indices.length;
      indices.push(i);
      const b = this.buckets.get(inst.classId)!;
      if (main && m !== IMPOSTOR_LEVEL) b.main[m].append(inst, slot);
      if (shadow) b.shadow[s].append(inst, slot);
    }
    for (const [id, b] of this.buckets) {
      const packed = result.packed.get(id)!;
      for (const audience of ["main", "shadow"] as const)
        for (let lod = 0; lod < IMPOSTOR_LEVEL; lod++) {
          const bucket = b[audience][lod];
          packed[audience][lod] = bucket.data.subarray(0, bucket.length);
        }
    }
    return result;
  }
}
