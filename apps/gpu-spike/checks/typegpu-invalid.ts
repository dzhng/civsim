import tgpu, { d, type TgpuRoot } from "typegpu";
export function typo(root: TgpuRoot) {
  const Camera = d.struct({ time: d.f32 });
  const layout = tgpu.bindGroupLayout({ cam: { uniform: Camera } });
  const cam = root.createBuffer(Camera, { time: 1 }).$usage("uniform");
  return root.createBindGroup(layout, { camTypo: cam });
}
