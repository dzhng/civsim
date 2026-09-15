import type { BattleSceneOptions } from "./sceneTypes";
import { resolveDeviceCaps } from "../../../packages/renderer-core/src/capabilities";

export type SceneBackend = "raw" | "typegpu" | "vgpu";

/** Library-owned construction/submission shared by live and replay. Device, canvas
 * and context are borrowed; vgpu additionally owns its wrapper and surface. */
export async function createSceneBackend(
  backend: SceneBackend,
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
      resizeOutput: (_width: number, _height: number) => {},
      submitPresentation() {
        const encoder = device.createCommandEncoder();
        scene.encode(encoder, context.getCurrentTexture().createView());
        device.queue.submit([encoder.finish()]);
      },
      dispose: () => scene.dispose(),
    };
  }
  if (backend === "typegpu") {
    const { createTypegpuBattleScene } = await import("../candidates/typegpu/battleScene");
    const scene = await createTypegpuBattleScene(device, options);
    return {
      scene,
      resizeOutput: (_width: number, _height: number) => {},
      submitPresentation() {
        const encoder = scene.createCommandEncoder();
        scene.encode(encoder, context.getCurrentTexture().createView());
        encoder.submit();
      },
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
    let disposed = false;
    return {
      scene,
      resizeOutput: (width: number, height: number) => output.resize([width, height]),
      submitPresentation: () => scene.render(output),
      dispose() {
        if (disposed) return;
        disposed = true;
        releaseOwned([() => scene.dispose(), () => output.dispose(), () => gpu.dispose()]);
      },
    };
  } catch (error) {
    releaseOwned([() => target?.dispose(), () => gpu.dispose()], [error]);
    throw error;
  }
}

function releaseOwned(releases: (() => void)[], errors: unknown[] = []) {
  for (const release of releases) {
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors, "Native scene ownership cleanup failed");
}
