import { attribute, uint } from "three/tsl";
import type { PaletteColumns } from "./posePalette";

/** Four-weight matrix columns, shared by visible and shadow position nodes. */
export function weightedPaletteColumns(
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
