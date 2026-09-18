import tgpu, { d, std } from "typegpu";
export const clothWave = tgpu.fn(
  [d.vec3f, d.f32, d.f32, d.f32, d.f32, d.f32],
  d.f32,
)((local, weight, phase, strength, time, backLobe) => {
  "use gpu";
  const primary = std.sin(time * 2.15 + phase + local.x * 5.2 + local.z * 1.25);
  const secondary = std.sin(time * 3.1 + phase * 0.71 + local.x * 9.4 - local.z * 0.52);
  const wave = primary * 0.74 + secondary * 0.26;
  const shaped = std.select(wave, wave * backLobe, wave > 0);
  return weight * strength * shaped;
});
