import { attribute, uint } from "three/tsl";
import type { PaletteColumns } from "../../photoreal-renderer/src/battle/posePalette";

/** Four-weight matrix columns, shared by visible and shadow position nodes. */
export function weightedSkinColumns(
  palette: PaletteColumns,
  index: ReturnType<typeof uint>,
  bones: number,
) {
  const joints = attribute<"vec4">("joints", "vec4");
  const weights = attribute<"vec4">("weights", "vec4");
  return [0, 1, 2, 3].map((column) => {
    const sample = (joint: typeof joints.x) =>
      palette.element(
        index
          .mul(bones * 4)
          .add(uint(joint).mul(4))
          .add(column),
      );
    return sample(joints.x)
      .mul(weights.x)
      .add(sample(joints.y).mul(weights.y))
      .add(sample(joints.z).mul(weights.z))
      .add(sample(joints.w).mul(weights.w))
      .toVar();
  });
}

export const RENDERER_LIBRARY_ID = "native";

export function rawSkinningSource() {
  return {
    paletteElementType: "mat4x4f",
    functions: "",
    expression: `palette[paletteBase + u32(joints.x)] * weights.x
    + palette[paletteBase + u32(joints.y)] * weights.y
    + palette[paletteBase + u32(joints.z)] * weights.z
    + palette[paletteBase + u32(joints.w)] * weights.w`,
  };
}
