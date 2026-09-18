import { attribute, mat4, uint } from "three/tsl";
import type { Node } from "three/webgpu";
import { tslExports } from "vgpu/three";
import type { PaletteColumns } from "../../photoreal-renderer/src/battle/posePalette";
import skin from "./vgpuSkin.wgsl";

export const RENDERER_LIBRARY_ID = "vgpu";

const { spikeWeightedSkin } = tslExports<{
  spikeWeightedSkin: {
    palette: Node;
    instance: Node;
    bones: Node;
    joints: Node;
    weights: Node;
  };
}>(skin)("spikeWeightedSkin");

/** Use the loader's resolved name: vgpu namespaces exported WGSL functions. */
export function rawSkinningSource() {
  const entry = skin.functionExports?.find((fn) => fn.name === "spikeWeightedSkin");
  if (!entry) throw new Error("vgpu skinning export metadata is missing");
  return {
    paletteElementType: "vec4f",
    functions: skin.wgsl,
    expression: `${entry.resolvedName}(&palette, u32(inst1.y), u32(inst1.z), joints, weights)`,
  };
}

/** Share the compiled WGSL kernel with the raw pipeline, retaining palette ownership. */
export function weightedSkinColumns(
  palette: PaletteColumns,
  index: ReturnType<typeof uint>,
  bones: number,
) {
  const joint = mat4(spikeWeightedSkin({
    palette,
    instance: index,
    bones: uint(bones),
    joints: attribute<"vec4">("joints", "vec4"),
    weights: attribute<"vec4">("weights", "vec4"),
  })).toVar() as unknown as {
    // Three supports matrix column access, but @types/three restricts element to arrays.
    element(index: Node<"uint">): Node<"vec4">;
  };
  return [0, 1, 2, 3].map((column) => joint.element(uint(column)).toVar());
}
