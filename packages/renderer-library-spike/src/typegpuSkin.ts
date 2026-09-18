import tgpu, { d } from "typegpu";
import * as t3 from "@typegpu/three";
import { attribute, uint } from "three/tsl";
import type { Node } from "three/webgpu";
import type { PaletteColumns } from "../../photoreal-renderer/src/battle/posePalette";

export const RENDERER_LIBRARY_ID = "typegpu";

const paletteSchema = d.arrayOf(d.vec4f, 0);
// The bridge exposes storage as a runtime array, so passing d.ref loses its
// storage provenance. Specialize the accessor instead of returning/copying it.
const paletteAccess = tgpu.slot<{ source: { readonly $: d.v4f[] } }>();

// Column storage is byte-identical to the raw renderer's mat4x4 palette.
const weightedSkin = tgpu.fn(
  [d.u32, d.u32, d.vec4f, d.vec4f],
  d.mat4x4f,
)((index, bones, joints, weights) => {
  "use gpu";
  const base = index * bones * 4;
  const x = base + d.u32(joints.x) * 4;
  const y = base + d.u32(joints.y) * 4;
  const z = base + d.u32(joints.z) * 4;
  const w = base + d.u32(joints.w) * 4;
  return d.mat4x4f(
    paletteAccess.$.source.$[x]
      .mul(weights.x)
      .add(paletteAccess.$.source.$[y].mul(weights.y))
      .add(paletteAccess.$.source.$[z].mul(weights.z))
      .add(paletteAccess.$.source.$[w].mul(weights.w)),
    paletteAccess.$.source.$[x + 1]
      .mul(weights.x)
      .add(paletteAccess.$.source.$[y + 1].mul(weights.y))
      .add(paletteAccess.$.source.$[z + 1].mul(weights.z))
      .add(paletteAccess.$.source.$[w + 1].mul(weights.w)),
    paletteAccess.$.source.$[x + 2]
      .mul(weights.x)
      .add(paletteAccess.$.source.$[y + 2].mul(weights.y))
      .add(paletteAccess.$.source.$[z + 2].mul(weights.z))
      .add(paletteAccess.$.source.$[w + 2].mul(weights.w)),
    paletteAccess.$.source.$[x + 3]
      .mul(weights.x)
      .add(paletteAccess.$.source.$[y + 3].mul(weights.y))
      .add(paletteAccess.$.source.$[z + 3].mul(weights.z))
      .add(paletteAccess.$.source.$[w + 3].mul(weights.w)),
  );
}).$name("spikeWeightedSkin");

export function rawSkinningSource() {
  return {
    paletteElementType: "vec4f",
    functions: tgpu.resolve(
      [
        weightedSkin.with(paletteAccess, {
          source: tgpu["~unstable"].rawCodeSnippet("palette", paletteSchema, "readonly"),
        }),
      ],
      { names: "strict" },
    ),
    expression: "spikeWeightedSkin(u32(inst1.y), u32(inst1.z), joints, weights)",
  };
}

export function weightedSkinColumns(
  palette: PaletteColumns,
  index: ReturnType<typeof uint>,
  bones: number,
): Node<"vec4">[] {
  const source = t3.fromTSL(palette, paletteSchema);
  const paletteIndex = t3.fromTSL(index, d.u32);
  const joints = t3.fromTSL(attribute<"vec4">("joints", "vec4"), d.vec4f);
  const weights = t3.fromTSL(attribute<"vec4">("weights", "vec4"), d.vec4f);
  const skin = weightedSkin.with(paletteAccess, { source });
  const matrix = (t3.toTSL(() => {
    "use gpu";
    return skin(paletteIndex.$, d.u32(bones), joints.$, weights.$);
  }) as Node<"mat4">).toVar();
  // Three supports matrix column indexing; its published types only expose it for arrays.
  const columns = matrix as typeof matrix & {
    element(index: Node<"uint">): Node<"vec4">;
  };
  return [0, 1, 2, 3].map((column) => columns.element(uint(column)).toVar());
}
