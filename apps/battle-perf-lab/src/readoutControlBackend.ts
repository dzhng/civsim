import { tgpu } from "typegpu";
import { initFromDevice, target, frame } from "vgpu";
import { createTypegpuReadout } from "../../../packages/battle-renderer/src/world/readout";
import { createVgpuReadout } from "./vgpu/readout";
import { destroyVgpuTarget } from "./vgpu/targetLifetime";
export async function createReadoutControlBackend(
  backend: "typegpu" | "vgpu",
  device: GPUDevice,
  width: number,
  height: number,
  samples: 1 | 4,
) {
  const release: (() => void)[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of release.reverse()) f();
  };
  try {
    if (backend === "typegpu") {
      const root = tgpu.initFromDevice({ device });
      release.push(() => root.destroy());
      const readout = await createTypegpuReadout(device, samples);
      release.push(readout.dispose);
      const output = root
        .createTexture({ size: [width, height], format: "rgba16float" })
        .$usage("render");
      release.push(() => output.destroy());
      const color =
        samples === 4
          ? root
              .createTexture({ size: [width, height], format: "rgba16float", sampleCount: 4 })
              .$usage("render")
          : output;
      if (color !== output) release.push(() => color.destroy());
      const depth = root
        .createTexture({ size: [width, height], format: "depth32float", sampleCount: samples })
        .$usage("render");
      release.push(() => depth.destroy());
      return {
        output: root.unwrap(output),
        upload: readout.upload,
        setCamera: readout.setCamera,
        stats: readout.stats,
        async render(background: readonly number[]) {
          const encoder = root["~unstable"].createCommandEncoder(),
            pass = encoder.beginRenderPass({
              colorAttachments: {
                view: color,
                resolveTarget: samples === 4 ? output : undefined,
                clearValue: [background[0], background[1], background[2], 1],
              },
              depthStencilAttachment: { view: depth, depthClearValue: 1 },
            });
          try {
            readout.draw(pass);
          } finally {
            pass.end();
          }
          encoder.submit();
        },
        dispose,
      };
    }
    const gpu = await initFromDevice(device);
    release.push(() => gpu.dispose());
    const readout = await createVgpuReadout(device, samples);
    release.push(readout.dispose);
    const output = target(gpu, {
      size: [width, height],
      format: "rgba16float",
      depth: "depth32float",
      msaa: samples === 4,
    });
    release.push(() => destroyVgpuTarget(output));
    return {
      output: output.color.gpu,
      upload: readout.upload,
      setCamera: readout.setCamera,
      stats: readout.stats,
      async render(background: readonly number[]) {
        await frame(gpu, (current) =>
          current.pass(
            {
              target: output,
              clear: [background[0], background[1], background[2], 1],
              clearDepth: 1,
            },
            (pass) => readout.draw(pass),
          ),
        ).done;
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
