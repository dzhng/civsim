import { trackBufferLifetime } from "./bufferLifetimeCheck";
import { trackTextureLifetime } from "./textureLifetimeCheck";
import { tgpu } from "typegpu";
import { initFromDevice, target } from "vgpu";
import type { CivsimEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import type { BattlePostGradeUniforms } from "../../../packages/game-renderer/src/environment/postParameters";
import type { FrameCameraSnapshot } from "./frameCamera";
import type { BackdropKind } from "./shaders/backdrop";
import { createRawEnvironment } from "./raw/environment";
import { RawBattleFrame } from "./raw/frame";
import { createRawBackdrop } from "./raw/backdrop";
import { createTypegpuEnvironment } from "../candidates/typegpu/environment";
import { TypegpuBattleFrame } from "../candidates/typegpu/frame";
import { createTypegpuBackdrop } from "../candidates/typegpu/backdrop";
import { createVgpuEnvironment } from "./vgpu/environment";
import { VgpuBattleFrame } from "./vgpu/frame";
import { createVgpuBackdrop } from "./vgpu/backdrop";
import { destroyVgpuTarget } from "./vgpu/targetLifetime";
/** Matched control only; each branch owns its complete sky/background/post encoding. */
export async function createBackdropControlBackend(
  backend: "raw" | "typegpu" | "vgpu",
  device: GPUDevice,
  env: CivsimEnvironment,
  width: number,
  height: number,
  samples: 1 | 4,
) {
  const releases: (() => void)[] = [];
  let disposed = false;
  const own = <T extends { dispose(): void } | { destroy(): void }>(r: T) => {
    releases.push(() => ("dispose" in r ? r.dispose() : r.destroy()));
    return r;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of releases.reverse()) f();
  };
  try {
    if (backend === "raw") {
      const environment = own(await createRawEnvironment(device, env, samples));
      const frame = own(
        new RawBattleFrame(device, environment, width, height, samples, "rgba16float"),
      );
      const admission = await checkAdmission(device, () =>
        createRawBackdrop(device, frame.cameraLayout, environment, samples),
      );
      const backdrop = own(
        await createRawBackdrop(device, frame.cameraLayout, environment, samples),
      );
      const output = own(
        device.createTexture({
          size: [width, height],
          format: "rgba16float",
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        }),
      );
      return {
        admission,
        output,
        setRects: backdrop.setRects,
        setStyle: backdrop.setStyle,
        setCamera: (
          s: FrameCameraSnapshot,
          o: readonly [number, number, number],
          g: BattlePostGradeUniforms,
        ) => frame.setCamera(s, o, g),
        async render(only?: BackdropKind) {
          const encoder = device.createCommandEncoder();
          frame.encode(
            encoder,
            output.createView(),
            (pass, group) => backdrop.encode(pass, group, only),
            false,
          );
          device.queue.submit([encoder.finish()]);
        },
        dispose,
      };
    }
    if (backend === "typegpu") {
      const root = tgpu.initFromDevice({ device });
      releases.push(() => root.destroy());
      const environment = own(await createTypegpuEnvironment(device, env, undefined, samples));
      const frame = own(
        await TypegpuBattleFrame.create(device, environment, width, height, samples, "rgba16float"),
      );
      const cameraBuffer = frame.cameraBuffer;
      // Exclude admission of caller-owned lazy lighting resources from the component failure scope.
      root.unwrap(environment.group);
      const admission = await checkAdmission(
        device,
        () => createTypegpuBackdrop(device, cameraBuffer, environment, samples),
        true,
      );
      const backdrop = own(await createTypegpuBackdrop(device, cameraBuffer, environment, samples));
      const output = own(
        root.createTexture({ size: [width, height], format: "rgba16float" }).$usage("render"),
      );
      return {
        admission,
        output: root.unwrap(output),
        setRects: backdrop.setRects,
        setStyle: backdrop.setStyle,
        setCamera: (
          s: FrameCameraSnapshot,
          o: readonly [number, number, number],
          g: BattlePostGradeUniforms,
        ) => frame.setCamera(s, o, g),
        async render(only?: BackdropKind) {
          frame.render(
            root.unwrap(output).createView(),
            () => {},
            (pass) => backdrop.draw(pass, only),
            false,
          );
        },
        dispose,
      };
    }
    const gpu = await initFromDevice(device);
    releases.push(() => gpu.dispose());
    const environment = own(await createVgpuEnvironment(gpu, env, undefined, 3, samples));
    const frame = own(
      await VgpuBattleFrame.create(gpu, environment, width, height, samples, "rgba16float"),
    );
    const admission = await checkAdmission(
      device,
      () => createVgpuBackdrop(gpu, frame.camera, environment, samples),
      true,
    );
    const backdrop = own(await createVgpuBackdrop(gpu, frame.camera, environment, samples));
    const output = target(gpu, { size: [width, height], format: "rgba16float" });
    releases.push(() => destroyVgpuTarget(output));
    return {
      admission,
      output: output.color.gpu,
      setRects: backdrop.setRects,
      setStyle: backdrop.setStyle,
      setCamera: (
        s: FrameCameraSnapshot,
        o: readonly [number, number, number],
        g: BattlePostGradeUniforms,
      ) => frame.setCamera(s, o, g),
      async render(only?: BackdropKind) {
        await frame.render(
          output,
          () => {},
          (pass) => backdrop.draw(pass, only),
          false,
        );
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

async function checkAdmission(
  device: GPUDevice,
  create: () => Promise<{ dispose(): void }>,
  validation = false,
) {
  const results = [];
  for (const boundary of validation
    ? ["second-buffer", "bind-group", "validation"]
    : ["second-buffer", "bind-group"]) {
    const buffers = trackBufferLifetime(device),
      textures = trackTextureLifetime(device);
    const originalBuffer = device.createBuffer,
      originalGroup = device.createBindGroup;
    let calls = 0,
      rejected = false,
      errorMessage = "";
    try {
      device.createBuffer = function (...args) {
        if (boundary === "second-buffer" && ++calls === 2)
          throw Error("Injected backdrop buffer failure");
        return originalBuffer.apply(this, args);
      };
      if (boundary === "bind-group")
        device.createBindGroup = function () {
          throw Error("Injected backdrop bind-group failure");
        };
      if (boundary === "validation")
        device.createBindGroup = function (descriptor) {
          const entries = [...descriptor.entries];
          return originalGroup.call(this, {
            ...descriptor,
            entries: [...entries, ...entries.slice(0, 1)],
          });
        };
      try {
        const value = await create();
        value.dispose();
      } catch (error) {
        rejected = true;
        errorMessage = String(error);
      }
      const liveBuffers = buffers.liveCount(),
        liveTextures = textures.liveCount();
      if (!rejected || liveBuffers || liveTextures)
        throw Error(
          `Backdrop ${boundary} failure: ${JSON.stringify({ rejected, liveBuffers, liveTextures, errorMessage })}`,
        );
      results.push({ boundary, rejected, liveBuffers, liveTextures });
    } finally {
      device.createBuffer = originalBuffer;
      device.createBindGroup = originalGroup;
      buffers.restore();
      textures.restore();
    }
  }
  return results;
}
