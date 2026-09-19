import { tgpu } from "typegpu";
import { initFromDevice, frame, target } from "vgpu";
import type { CivsimEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import { createRawEnvironment } from "../../../packages/battle-renderer/src/world/environment";
import { createTypegpuEnvironment } from "../candidates/typegpu/environment";
import { createVgpuEnvironment } from "./vgpu/environment";
import { createRawStandards } from "../../../packages/battle-renderer/src/world/standards";
import { createTypegpuStandards } from "../candidates/typegpu/standards";
import { createVgpuStandards } from "./vgpu/standards";
import { Camera, typegpuCameraLayout } from "../candidates/typegpu/camera";
import { destroyVgpuTarget } from "./vgpu/targetLifetime";
import { nativeTarget } from "./controlTarget";
/** Test-only lifetime/attachment plumbing; each runtime owns encoding. */
export async function standardsControlBackend(
  kind: string,
  device: GPUDevice,
  env: CivsimEnvironment,
  size: readonly [number, number],
  samples: 1 | 4,
  onError: (s: string) => void,
  bufferCount: () => number,
) {
  async function initialize<T>(build: () => Promise<T>) {
    const before = bufferCount();
    const layer = await build();
    return { layer, initializedBuffers: bufferCount() - before };
  }
  const owned: (() => void)[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of owned.reverse()) f();
  };
  try {
    if (kind === "vgpu") {
      const gpu = await initFromDevice(device);
      owned.push(
        () => gpu.dispose(),
        gpu.onError((e) => onError(String(e))),
      );
      const environment = await createVgpuEnvironment(gpu, env);
      owned.push(environment.dispose);
      const camera = gpu.device.createBuffer({ size: 192, usage: ["uniform", "copy_dst"] });
      owned.push(() => camera.destroy());
      const output = target(gpu, {
        size,
        format: "rgba16float",
        depth: "depth32float",
        msaa: samples === 4,
      });
      owned.push(() => destroyVgpuTarget(output));
      const { layer, initializedBuffers } = await initialize(() =>
        createVgpuStandards(gpu, camera, environment, samples),
      );
      owned.push(layer.dispose);
      return {
        ...layer,
        initializedBuffers,
        disposeLayer: layer.dispose,
        dispose,
        output: output.color.gpu,
        setCamera(
          data: Float32Array<ArrayBuffer>,
          view: ArrayLike<number>,
          observer: readonly [number, number, number],
          time: number,
        ) {
          camera.write(data);
          environment.setView(view, observer);
          layer.setView(view, time);
        },
        async render() {
          await frame(gpu, (f) =>
            f.pass({ target: output, clear: [0, 0, 0, 0], clearDepth: 0 }, (p) => layer.draw(p)),
          ).done;
          await gpu.settled();
        },
      };
    }
    const output = nativeTarget(device, size, samples);
    owned.push(output.dispose);
    const attachments = () => ({
      colorAttachments: [
        {
          view: output.attachments.color,
          resolveTarget: output.attachments.resolveTarget,
          loadOp: "clear" as const,
          storeOp: "store" as const,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
      depthStencilAttachment: {
        view: output.attachments.depth,
        depthClearValue: 0,
        depthLoadOp: "clear" as const,
        depthStoreOp: "store" as const,
      },
    });
    if (kind === "typegpu") {
      const root = tgpu.initFromDevice({ device });
      owned.push(() => root.destroy());
      const camera = root.createBuffer(Camera).$usage("uniform");
      owned.push(() => camera.destroy());
      const group = root.createBindGroup(typegpuCameraLayout, { cam: camera });
      const environment = await createTypegpuEnvironment(device, env);
      owned.push(environment.dispose);
      const { layer, initializedBuffers } = await initialize(() =>
        createTypegpuStandards(device, environment, samples),
      );
      owned.push(layer.dispose);
      return {
        ...layer,
        initializedBuffers,
        disposeLayer: layer.dispose,
        dispose,
        output: output.color,
        setCamera(
          data: Float32Array<ArrayBuffer>,
          view: ArrayLike<number>,
          observer: readonly [number, number, number],
          time: number,
        ) {
          camera.write(data.buffer);
          environment.setView(view, observer);
          layer.setView(view, time);
        },
        async render() {
          const encoder = root["~unstable"].createCommandEncoder();
          const pass = encoder.beginRenderPass(attachments());
          layer.draw(pass, group);
          pass.end();
          encoder.submit();
        },
      };
    }
    if (kind !== "raw") throw Error("Unknown standards backend");
    const environment = await createRawEnvironment(device, env);
    owned.push(environment.dispose);
    const camera = device.createBuffer({
      size: 192,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    owned.push(() => camera.destroy());
    const layout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" },
          },
        ],
      }),
      group = device.createBindGroup({
        layout,
        entries: [{ binding: 0, resource: { buffer: camera } }],
      });
    const { layer, initializedBuffers } = await initialize(() =>
      createRawStandards(device, layout, environment, samples),
    );
    owned.push(layer.dispose);
    return {
      ...layer,
      initializedBuffers,
      disposeLayer: layer.dispose,
      dispose,
      output: output.color,
      setCamera(
        data: Float32Array<ArrayBuffer>,
        view: ArrayLike<number>,
        observer: readonly [number, number, number],
        time: number,
      ) {
        device.queue.writeBuffer(camera, 0, data);
        environment.setView(view, observer);
        layer.setView(view, time);
      },
      async render() {
        const encoder = device.createCommandEncoder(),
          pass = encoder.beginRenderPass(attachments());
        layer.draw(pass, group);
        pass.end();
        device.queue.submit([encoder.finish()]);
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
