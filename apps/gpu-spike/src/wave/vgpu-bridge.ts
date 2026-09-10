import { tslExports } from "vgpu/three";
import { initFromDevice, compute, storage } from "vgpu";
import type { Node } from "three/webgpu";
import wave from "./wave.wgsl";
import computeShader from "./compute.wgsl";
import { waveSamples, assertWaveSamples, STANDARD_WAVE_BACK_LOBE } from "./samples";
const exported = tslExports(wave)("clothWave");
export function waveNode(position: Node<"vec3">, weight: Node<"float">, time: Node<"float">) {
  return exported.clothWave({
    local: position,
    weight,
    phase: 0.7,
    strength: 0.7,
    time,
    backLobe: STANDARD_WAVE_BACK_LOBE,
  });
}
export async function probe(device: GPUDevice) {
  const gpu = await initFromDevice(device);
  try {
    const packed = new Float32Array(waveSamples().flatMap((s) => [...s.local, ...s.settings]));
    const samples = storage(gpu, packed.byteLength, "read");
    samples.write(packed);
    const output = storage(gpu, 512 * 4, "read-write");
    const pipeline = compute(gpu, computeShader, { set: { samples, output } });
    pipeline.dispatch(8);
    return assertWaveSamples(new Float32Array(await output.read()));
  } finally {
    gpu.dispose();
  }
}
