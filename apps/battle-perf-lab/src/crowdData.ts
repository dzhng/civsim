import type { AppearanceBundle } from "../../../packages/soldier-assets/src/appearanceBundle";
import {
  corpsePresentationStrength,
  type CrowdInstance,
} from "../../../packages/crowd-runtime/src/instanceData";
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
/** Both audiences reference one palette slot per included instance; LOD/visibility remain caller policy. */
export function packCrowdFrame(
  instances: readonly CrowdInstance[],
  plan: CrowdAudiencePlan,
  groups: readonly Record<number, Pick<AppearanceBundle, "rig" | "animation">>[],
) {
  if ([plan.levels, plan.shadowLevels, plan.visibility].some((v) => v.length < instances.length))
    throw new Error("Crowd plan omits instances");
  const owners = new Map<number, number>(),
    rigIndices = groups.map((g, i) => {
      for (const id of Object.keys(g)) owners.set(Number(id), i);
      return [] as number[];
    });
  const buckets = new Map<number, { main: number[][]; shadow: number[][] }>();
  for (const id of owners.keys()) buckets.set(id, { main: [[], [], []], shadow: [[], [], []] });
  const slots = new Uint32Array(instances.length);
  let impostorsPending = 0;
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i],
      owner = owners.get(inst.classId);
    if (owner === undefined) throw new Error(`Missing appearance ${inst.classId}`);
    if (!plan.visibility[i]) continue;
    const main = (plan.visibility[i] & 1) !== 0,
      shadow = (plan.visibility[i] & 2) !== 0,
      m = plan.levels[i],
      s = plan.shadowLevels[i];
    if (
      (main && (m < 0 || m > 3 || !Number.isInteger(m))) ||
      (shadow && (s < 0 || s > 2 || !Number.isInteger(s)))
    )
      throw new Error("Invalid crowd tier");
    if (main && m === 3) impostorsPending++;
    if ((!main || m === 3) && !shadow) continue;
    slots[i] = rigIndices[owner].length;
    rigIndices[owner].push(i);
    if (main && m !== 3) buckets.get(inst.classId)!.main[m].push(i);
    if (shadow) buckets.get(inst.classId)!.shadow[s].push(i);
  }
  const packed = new Map<
    number,
    { main: Float32Array<ArrayBuffer>[]; shadow: Float32Array<ArrayBuffer>[] }
  >();
  for (const [id, b] of buckets) {
    const pack = (lists: number[][]) =>
      lists.map((indices) => {
        const data = new Float32Array(indices.length * 12);
        indices.forEach((i, j) => {
          const p = instances[i];
          data.set(
            [
              p.x,
              p.y,
              p.facing,
              p.faction,
              1,
              slots[i],
              0,
              0,
              p.elevation ?? 0,
              0,
              corpsePresentationStrength(p),
              0,
            ],
            j * 12,
          );
        });
        return data;
      });
    packed.set(id, { main: pack(b.main), shadow: pack(b.shadow) });
  }
  return { rigIndices, packed, impostorsPending };
}
