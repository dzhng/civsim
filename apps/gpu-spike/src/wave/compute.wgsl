import { clothWave } from './wave.wgsl';
struct Sample { local: vec4f, settings: vec4f };
@group(0) @binding(0) var<storage, read> samples: array<Sample>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;
@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&samples)) { return; }
  let s = samples[i];
  output[i] = clothWave(s.local.xyz, s.local.w, s.settings.x, s.settings.y, s.settings.z, s.settings.w);
}
