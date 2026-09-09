import type { LocalAnimation } from "../../soldier-assets/src/localAnimation";
import type { AppearancePresentation } from "../../soldier-assets/src/presentation";
import type { ImportedRig } from "../../soldier-assets/src/rig";

type PaletteAppearance = {
  manifest: { presentation: Pick<AppearancePresentation, "riderUpperBodyJoints"> | null };
};

/** Static CPU data shared by Three/raw palette adapters; no GPU allocation or lifetime. */
export function packRigPaletteData(
  rig: ImportedRig,
  animation: Pick<LocalAnimation, "bones" | "stepMasks">,
  appearances: Readonly<Record<number, PaletteAppearance>>,
) {
  const bones = rig.bones.length;
  if (bones < 1 || bones !== animation.bones)
    throw new Error("palette rig and animation joint counts differ");
  const names = new Map<string, number>();
  const words: number[] = [];
  const inverseBinds = new Float32Array(bones * 16);
  rig.bones.forEach((bone, joint) => {
    if (!Number.isInteger(bone.parent) || bone.parent < -1 || bone.parent >= joint)
      throw new Error(`palette joint ${joint} must follow its parent`);
    if (names.has(bone.name)) throw new Error(`duplicate palette joint name ${bone.name}`);
    names.set(bone.name, joint);
    words.push(bone.parent < 0 ? 0xffffffff : bone.parent);
    if (bone.inverseBind.length !== 16) throw new Error("palette inverse bind requires 16 values");
    inverseBinds.set(Array.from(bone.inverseBind), joint * 16);
  });
  if (inverseBinds.some((value) => !Number.isFinite(value)))
    throw new Error("palette inverse binds must be finite in Float32");
  const stepBase = words.length;
  for (const value of animation.stepMasks) words.push(value);
  const masks = new Map<string, number>();
  const upperMaskOffsets = new Map<number, number>();
  for (const [id, appearance] of Object.entries(appearances)) {
    const mask = new Uint32Array(bones);
    for (const name of appearance.manifest.presentation?.riderUpperBodyJoints ?? []) {
      const joint = names.get(name);
      if (joint === undefined)
        throw new Error(`appearance ${id} upper mask references missing joint ${name}`);
      mask[joint] = 1;
    }
    const key = mask.join("");
    let offset = masks.get(key);
    if (offset === undefined) {
      offset = words.length;
      masks.set(key, offset);
      for (const value of mask) words.push(value);
    }
    upperMaskOffsets.set(Number(id), offset);
  }
  return { metadata: Uint32Array.from(words), inverseBinds, stepBase, upperMaskOffsets };
}
