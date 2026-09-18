import { draw, type Gpu } from "vgpu";
export function typo(gpu: Gpu) {
  const shader = `struct Camera { time:f32 }; @group(0) @binding(0) var<uniform> cam:Camera;
  @vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {return vec4f(f32(i),cam.time,0,1);}
  @fragment fn fs()->@location(0) vec4f {return vec4f(1);}`;
  return draw(gpu, { shader, set: { camTypo: { time: 1 } } });
}
