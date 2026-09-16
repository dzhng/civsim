import { expect, test } from "vitest";
import { CrowdFramePacker, crowdRigGroups } from "../../apps/battle-perf-lab/src/crowdData";
import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import { mat4Identity } from "@packages/soldier-assets/src/localPose";
import { bakeLocalAnimation } from "@packages/soldier-assets/src/localAnimation";
import type { ImportedRig } from "@packages/soldier-assets/src/rig";
const rig: ImportedRig = {
  bones: [
    {
      name: "root",
      parent: -1,
      bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] },
      inverseBind: mat4Identity(),
    },
  ],
  clips: [],
};
// Only identity participates in crowd grouping; rendered mesh/material fields stay outside this pure fixture.
const appearance = { rig, animation: bakeLocalAnimation(rig) };
test("main and shadow tiers reuse one rig pose slot, including shadow-only and impostor casters", () => {
  const groups = crowdRigGroups({ 0: appearance, 17: appearance });
  expect(groups).toHaveLength(1);
  const instances = generatedFormation(4).map((p, i) => ({
    ...p,
    classId: i % 2 ? 17 : 0,
    x: i,
    elevation: 2 + i,
  }));
  const packer = new CrowdFramePacker(groups);
  const result = packer.pack(instances, {
    levels: [0, 3, 2, 0],
    shadowLevels: [1, 0, 2, 1],
    visibility: [3, 3, 2, 0],
  });
  expect(result.rigIndices).toEqual([[0, 1, 2]]);
  expect(result.impostorsPending).toBe(1);
  const main = result.packed.get(0)!.main[0],
    shadow = result.packed.get(0)!.shadow[1];
  expect(main[5]).toBe(0);
  expect(shadow[5]).toBe(main[5]);
  expect(main[8]).toBe(2);
  expect(result.packed.get(17)!.main.every((x) => x.length === 0)).toBe(true);
  expect(result.packed.get(17)!.shadow[0][5]).toBe(1);
  expect(result.packed.get(0)!.shadow[2][5]).toBe(2);
  expect(() => packer.pack(instances, { levels: [0], shadowLevels: [0], visibility: [1] })).toThrow(
    "omits",
  );
});

test("packing retains capacity but resets active records after shrink and empty frames", () => {
  const packer = new CrowdFramePacker(crowdRigGroups({ 0: appearance }));
  const instances = generatedFormation(100).map((p) => ({ ...p, classId: 0 }));
  const plan = {
    levels: new Uint8Array(100),
    shadowLevels: new Uint8Array(100),
    visibility: new Uint8Array(100).fill(3),
  };
  const storage = packer.pack(instances, plan).packed.get(0)!.main[0].buffer;
  instances[0] = { ...instances[0], x: 123, y: 456, facing: 2, faction: 1, elevation: 7 };
  const small = packer.pack(instances.slice(0, 1), plan);
  expect(small.rigIndices).toEqual([[0]]);
  expect(small.packed.get(0)!.main[0].buffer).toBe(storage);
  expect(Array.from(small.packed.get(0)!.main[0])).toEqual([
    123, 456, 2, 1, 1, 0, 0, 0, 7, 0, 0, 0,
  ]);
  const empty = packer.pack([], plan);
  expect(empty.rigIndices).toEqual([[]]);
  expect(empty.packed.get(0)!.main[0]).toHaveLength(0);
  expect(empty.packed.get(0)!.main[0].buffer).toBe(storage);
  plan.levels.fill(2);
  const moved = packer.pack(instances, plan);
  expect(moved.packed.get(0)!.main[0]).toHaveLength(0);
  expect(moved.packed.get(0)!.main[2]).toHaveLength(1200);
  plan.levels.fill(0);
  expect(packer.pack(instances, plan).packed.get(0)!.main[0].buffer).toBe(storage);
});

test("invalid packing cannot retain stale slots or counts in the next valid frame", () => {
  const packer = new CrowdFramePacker(crowdRigGroups({ 0: appearance }));
  const soldiers = generatedFormation(3).map((p) => ({ ...p, classId: 0 }));
  const plan = { levels: [0, 0, 0], shadowLevels: [0, 0, 0], visibility: [3, 3, 3] };
  packer.pack(soldiers, plan);
  expect(() => packer.pack([soldiers[0], { ...soldiers[1], classId: 99 }], plan)).toThrow(
    "Missing appearance",
  );
  expect(() => packer.pack(soldiers, { ...plan, levels: [0, 4, 0] })).toThrow("Invalid crowd tier");
  const valid = packer.pack(soldiers.slice(0, 1), plan);
  expect(valid.rigIndices).toEqual([[0]]);
  expect(valid.packed.get(0)!.main[0]).toHaveLength(12);
  expect(valid.packed.get(0)!.shadow[0][5]).toBe(0);
  expect(valid.impostorsPending).toBe(0);
});

test("interleaved rigs preserve independent ordered slots and packers never share buffers", () => {
  const other = { rig: { ...rig }, animation: bakeLocalAnimation(rig) };
  const groups = crowdRigGroups({ 0: appearance, 1: other, 2: appearance });
  const soldiers = generatedFormation(5).map((p, i) => ({ ...p, classId: [1, 0, 2, 1, 0][i] }));
  const plan = {
    levels: [0, 3, 1, 2, 0],
    shadowLevels: [0, 1, 2, 0, 1],
    visibility: [3, 3, 3, 3, 0],
  };
  const a = new CrowdFramePacker(groups),
    b = new CrowdFramePacker(groups);
  const result = a.pack(soldiers, plan),
    independent = b.pack(soldiers, plan);
  expect(result.rigIndices).toEqual([
    [1, 2],
    [0, 3],
  ]);
  expect(result.packed.get(2)!.main[1][5]).toBe(1);
  expect(result.packed.get(0)!.shadow[1][5]).toBe(0);
  expect(result.packed.get(1)!.main[2][5]).toBe(1);
  expect(result.packed.get(1)!.main[0].buffer).not.toBe(independent.packed.get(1)!.main[0].buffer);
  a.pack([], plan);
  expect(independent.packed.get(1)!.main[0]).toHaveLength(12);
});
