import { expect, it } from "vitest";
import { packRigPaletteData } from "../../packages/renderer-core/src/rigPaletteData";
import { mat4Identity } from "../../packages/soldier-assets/src/localPose";
import { bakeLocalAnimation } from "../../packages/soldier-assets/src/localAnimation";
import type { ImportedRig } from "../../packages/soldier-assets/src/rig";

const rig: ImportedRig = {
  bones: ["root", "horse", "pelvis", "spine"].map((name, joint) => ({
    name,
    parent: [-1, 0, 0, 2][joint],
    bind: { T: [0, 0, joint], R: [0, 0, 0, 1], S: [1, 1, 1] },
    inverseBind: mat4Identity(),
  })),
  clips: [
    {
      name: "hold",
      duration: 1,
      tracks: { 1: { T: { times: [0, 1], values: [0, 0, 0, 0, 2, 0], interpolation: "STEP" } } },
    },
  ],
};

it("shares canonical rig data while resolving and deduplicating appearance masks", () => {
  const animation = bakeLocalAnimation(rig);
  const appearance = (joints: string[] | null) => ({
    manifest: { presentation: { riderUpperBodyJoints: joints } },
  });
  const packed = packRigPaletteData(rig, animation, {
    40: { manifest: { presentation: null } },
    41: appearance(["spine"]),
    42: appearance(["spine"]),
    43: appearance(["spine", "pelvis"]),
    44: appearance(["pelvis", "spine"]),
  });
  expect(Array.from(packed.metadata.subarray(0, 4))).toEqual([0xffffffff, 0, 0, 2]);
  expect(packed.stepBase).toBe(4);
  expect(packed.metadata.subarray(4, 4 + animation.stepMasks.length)).toEqual(animation.stepMasks);
  const mask = (id: number) => {
    const offset = packed.upperMaskOffsets.get(id)!;
    return Array.from(packed.metadata.subarray(offset, offset + rig.bones.length));
  };
  expect(mask(40)).toEqual([0, 0, 0, 0]);
  expect(mask(41)).toEqual([0, 0, 0, 1]);
  expect(mask(43)).toEqual([0, 0, 1, 1]);
  expect(packed.upperMaskOffsets.get(41)).toBe(packed.upperMaskOffsets.get(42));
  expect(packed.upperMaskOffsets.get(43)).toBe(packed.upperMaskOffsets.get(44));
  expect(packed.inverseBinds).toEqual(
    new Float32Array(rig.bones.flatMap((bone) => Array.from(bone.inverseBind))),
  );
});

it("rejects invalid hierarchy, missing mask joints and non-finite GPU inverse binds", () => {
  const animation = bakeLocalAnimation(rig);
  const outOfOrder = structuredClone(rig);
  outOfOrder.bones[1].parent = 2;
  expect(() => packRigPaletteData(outOfOrder, animation, {})).toThrow("must follow its parent");
  expect(() =>
    packRigPaletteData(rig, animation, {
      41: { manifest: { presentation: { riderUpperBodyJoints: ["missing"] } } },
    }),
  ).toThrow("missing joint missing");
  const overflow = structuredClone(rig);
  overflow.bones[0].inverseBind = Array(16).fill(Number.MAX_VALUE);
  expect(() => packRigPaletteData(overflow, animation, {})).toThrow("finite in Float32");
});
