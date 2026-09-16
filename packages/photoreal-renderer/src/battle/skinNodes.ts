import { attribute, Fn, If, mat4, uint } from "three/tsl";
import type { Vec4Node } from "./battleTsl";
import type { PaletteColumns } from "./posePalette";

/** Pinned @types/three omits matrix column access and types mat4 `addAssign` as mat3. */
type Mat4Columns = { element(column: number): Vec4Node };

/** Four-weight matrix columns, shared by visible and shadow position nodes.
 * Exact-zero influences after the first skip their palette loads; a skipped term
 * would add exactly zero, so x→y→z→w accumulation stays equal to the full blend. */
export function weightedPaletteColumns(
  palette: PaletteColumns,
  index: ReturnType<typeof uint>,
  bones: number,
) {
  const joints = attribute<"vec4">("joints", "vec4");
  const weights = attribute<"vec4">("weights", "vec4");
  const influence = (joint: typeof joints.x, weight: typeof weights.x) => {
    const bone = index
      .mul(bones * 4)
      .add(uint(joint).mul(4))
      .toVar();
    return mat4(
      palette.element(bone),
      palette.element(bone.add(1)),
      palette.element(bone.add(2)),
      palette.element(bone.add(3)),
    ).mul(weight);
  };
  const skin = Fn(() => {
    const blend = influence(joints.x, weights.x).toVar();
    for (const channel of ["y", "z", "w"] as const) {
      If(weights[channel].notEqual(0), () => {
        blend.assign(blend.add(influence(joints[channel], weights[channel])));
      });
    }
    return blend;
  })() as unknown as Mat4Columns;
  return [0, 1, 2, 3].map((column) => skin.element(column));
}
