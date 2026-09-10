// The production palette is column-major: four vec4f columns per joint.
// Keep all four influences and the left-to-right blend used by both renderers.
export fn spikeWeightedSkin(
  palette: ptr<storage, array<vec4f>, read>,
  instance: u32,
  bones: u32,
  joints: vec4f,
  weights: vec4f,
) -> mat4x4f {
  let base = instance * (bones * 4u);
  let x = base + u32(joints.x) * 4u;
  let y = base + u32(joints.y) * 4u;
  let z = base + u32(joints.z) * 4u;
  let w = base + u32(joints.w) * 4u;
  return mat4x4f(
    (*palette)[x] * weights.x + (*palette)[y] * weights.y + (*palette)[z] * weights.z + (*palette)[w] * weights.w,
    (*palette)[x + 1u] * weights.x + (*palette)[y + 1u] * weights.y + (*palette)[z + 1u] * weights.z + (*palette)[w + 1u] * weights.w,
    (*palette)[x + 2u] * weights.x + (*palette)[y + 2u] * weights.y + (*palette)[z + 2u] * weights.z + (*palette)[w + 2u] * weights.w,
    (*palette)[x + 3u] * weights.x + (*palette)[y + 3u] * weights.y + (*palette)[z + 3u] * weights.z + (*palette)[w + 3u] * weights.w,
  );
}
