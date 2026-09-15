import { expect, test } from "vitest";
import { packCrowdFrame, crowdRigGroups } from "../../apps/battle-perf-lab/src/crowdData";
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
  const result = packCrowdFrame(
    instances,
    { levels: [0, 3, 2, 0], shadowLevels: [1, 0, 2, 1], visibility: [3, 3, 2, 0] },
    groups,
  );
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
  expect(() =>
    packCrowdFrame(instances, { levels: [0], shadowLevels: [0], visibility: [1] }, groups),
  ).toThrow("omits");
});
