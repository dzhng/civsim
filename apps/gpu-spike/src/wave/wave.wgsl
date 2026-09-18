export fn clothWave(local: vec3f, weight: f32, phase: f32, strength: f32, time: f32, backLobe: f32) -> f32 {
  let primary = sin(time * 2.15 + phase + local.x * 5.2 + local.z * 1.25);
  let secondary = sin(time * 3.1 + phase * 0.71 + local.x * 9.4 - local.z * 0.52);
  let wave = primary * 0.74 + secondary * 0.26;
  let shaped = select(wave, wave * backLobe, wave > 0.0);
  return weight * strength * shaped;
}
