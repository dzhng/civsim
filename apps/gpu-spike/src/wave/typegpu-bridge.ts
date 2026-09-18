import tgpu, { d } from "typegpu";
import * as t3 from "@typegpu/three";
import type { Node } from "three/webgpu";
import { clothWave } from "./typegpu-wave";
import { waveSamples, assertWaveSamples, STANDARD_WAVE_BACK_LOBE } from "./samples";
export function waveNode(position: Node<"vec3">, weight: Node<"float">, time: Node<"float">) {
  const p = t3.fromTSL(position, d.vec3f),
    w = t3.fromTSL(weight, d.f32),
    t = t3.fromTSL(time, d.f32);
  return t3.toTSL(() => {
    "use gpu";
    return clothWave(p.$, w.$, 0.7, 0.7, t.$, STANDARD_WAVE_BACK_LOBE);
  });
}
export async function probe(device: GPUDevice) {
  const root = tgpu.initFromDevice({ device });
  try {
    const Sample = d.struct({ local: d.vec4f, settings: d.vec4f });
    const inputs = root.createReadonly(d.arrayOf(Sample, 512), waveSamples());
    const output = root.createMutable(d.arrayOf(d.f32, 512));
    const pipeline = root.createGuardedComputePipeline((i) => {
      "use gpu";
      const s = inputs.$[i];
      output.$[i] = clothWave(
        s.local.xyz,
        s.local.w,
        s.settings.x,
        s.settings.y,
        s.settings.z,
        s.settings.w,
      );
    });
    pipeline.dispatchThreads(512);
    const cpu = assertWaveSamples(
      waveSamples().map(({ local, settings }) =>
        clothWave(
          d.vec3f(local[0], local[1], local[2]),
          local[3],
          settings[0],
          settings[1],
          settings[2],
          settings[3],
        ),
      ),
    );
    return { ...assertWaveSamples(await output.read()), cpu };
  } finally {
    root.destroy();
  }
}
