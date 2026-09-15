import type { BattleSceneOptions } from "./sceneTypes";
import { resolveDeviceCaps } from "../../../packages/renderer-core/src/capabilities";
import { readU32Buffer } from "./numericalReadback";

export type ReplayBackend = "raw" | "typegpu" | "vgpu";

/** Rendering and submission stay with the selected library. The fixture and
 * semantic command runner own neither pipelines nor backend resource lifetimes. */
export async function createReplayBackend(
  backend: ReplayBackend,
  device: GPUDevice,
  canvas: HTMLCanvasElement,
  context: GPUCanvasContext,
  options: BattleSceneOptions,
) {
  if (backend === "raw") {
    const { createRawBattleScene } = await import("./raw/battleScene");
    const scene = await createRawBattleScene(
      device,
      resolveDeviceCaps({
        adapterLimits: {
          maxBufferSize: device.limits.maxBufferSize,
          maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
        },
        deviceFeatures: device.features,
        powerPreference: "default",
      }),
      options,
    );
    return {
      scene,
      submitPresentation() {
        const encoder = device.createCommandEncoder();
        scene.encode(encoder, context.getCurrentTexture().createView());
        device.queue.submit([encoder.finish()]);
      },
      readDiagnostics: () =>
        Promise.all(
          scene.grassRoutingBuffers().map(async (layer) => {
            const [commands, records] = await Promise.all([
              readU32Buffer(device, layer.commands),
              readU32Buffer(device, layer.records, layer.recordCount * 64),
            ]);
            return {
              commands,
              records: new Float32Array(records.buffer),
              recordCount: layer.recordCount,
            };
          }),
        ),
      dispose: () => scene.dispose(),
    };
  }
  if (backend === "typegpu") {
    const { createTypegpuBattleScene } = await import("../candidates/typegpu/battleScene");
    const scene = await createTypegpuBattleScene(device, options);
    return {
      scene,
      submitPresentation() {
        const encoder = scene.createCommandEncoder();
        scene.encode(encoder, context.getCurrentTexture().createView());
        encoder.submit();
      },
      readDiagnostics: () => scene.readGrassDiagnostics(),
      dispose: () => scene.dispose(),
    };
  }
  const { initFromDevice, surface } = await import("vgpu");
  const { createVgpuBattleScene } = await import("./vgpu/battleScene");
  const gpu = await initFromDevice(device);
  let target: ReturnType<typeof surface> | undefined;
  try {
    target = surface(gpu, canvas, {
      size: [options.width, options.height],
      dpr: 1,
      autoResize: false,
      format: options.outputFormat,
      alphaMode: "opaque",
    });
    const scene = await createVgpuBattleScene(gpu, options);
    const output = target;
    return {
      scene,
      submitPresentation: () => scene.render(output),
      readDiagnostics: () => scene.readGrassDiagnostics(),
      dispose() {
        try {
          scene.dispose();
        } finally {
          output.dispose();
          gpu.dispose();
        }
      },
    };
  } catch (error) {
    target?.dispose();
    gpu.dispose();
    throw error;
  }
}
