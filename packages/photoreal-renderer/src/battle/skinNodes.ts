import type { DataTexture } from "three/webgpu";
import { attribute, int, ivec2, textureLoad } from "three/tsl";

/** Four-weight matrix columns, shared by visible and shadow position nodes. */
export function weightedVatColumns(vat: DataTexture, frame: ReturnType<typeof int>) {
  const joints = attribute<"vec4">("joints", "vec4");
  const weights = attribute<"vec4">("weights", "vec4");
  return [0, 1, 2, 3].map((column) => {
    const sample = (joint: typeof joints.x) =>
      textureLoad(vat, ivec2(frame, int(joint).mul(4).add(column)));
    return sample(joints.x)
      .mul(weights.x)
      .add(sample(joints.y).mul(weights.y))
      .add(sample(joints.z).mul(weights.z))
      .add(sample(joints.w).mul(weights.w))
      .toVar();
  });
}
