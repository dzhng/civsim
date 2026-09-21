import type { BladeFieldProfile } from "../../../packages/game-renderer/src/battle/battleGrassResidency";
import {
  createGrassField,
  type GrassLayerRuntime,
} from "../../../packages/battle-renderer/src/grassField";
import {
  tgpu,
  type TgpuCommandEncoder,
  type TgpuRenderCommands,
  type TgpuBindGroup,
} from "typegpu";
import { frame, initFromDevice, target, type FramePass } from "vgpu";
import type { CivsimEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import { createRawEnvironment } from "./raw/world/environment";
import { createRawGrass } from "./raw/world/grass";
import { createTypegpuEnvironment } from "../../../packages/battle-renderer/src/world/environment";
import { createTypegpuGrass } from "../../../packages/battle-renderer/src/world/grass";
import { Camera, typegpuCameraLayout } from "../../../packages/battle-renderer/src/world/camera";
import { createVgpuEnvironment } from "./vgpu/environment";
import { createVgpuGrass } from "./vgpu/grass";
import { destroyVgpuTarget } from "./vgpu/targetLifetime";
import { nativeTarget } from "./controlTarget";
import { readU32Buffer } from "./numericalReadback";
import type { GrassGeometry } from "../../../packages/battle-renderer/src/grassData";
/** Numerical-control factory only. Each backend owns its compute/draw encoding and resource lifetime. */
export async function createGrassBackendControl(
  kind: "raw" | "typegpu" | "vgpu",
  device: GPUDevice,
  env: CivsimEnvironment,
  geometry: readonly GrassGeometry[],
  records: Float32Array,
  size: readonly [number, number],
  samples: 1 | 4,
  reportError: (s: string) => void,
  profile?: BladeFieldProfile,
) {
  if (kind === "vgpu") {
    const gpu = await initFromDevice(device),
      owned: (() => void)[] = [() => gpu.dispose()];
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      for (const f of owned.reverse()) f();
    };
    try {
      owned.push(gpu.onError((e) => reportError(String(e))));
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
      const layer = await controlLayers<
        undefined,
        FramePass,
        undefined,
        Awaited<ReturnType<typeof createVgpuGrass>>
      >(profile, () => createVgpuGrass(gpu, camera, environment, geometry, samples));
      owned.push(layer.dispose);
      await layer.first.updateRecords(records);
      return {
        field: layer.field,
        update: layer.first.update,
        updateRecords: layer.first.updateRecords,
        disposeGrass: layer.dispose,
        dispose,
        stats: layer.first.stats,
        setView: environment.setView,
        sky: environment.sky.lut.gpu,
        output: output.color.gpu,
        writeCamera: (data: Float32Array<ArrayBuffer>) => camera.write(data),
        readRoutes: layer.first.readRouting,
        readFieldRoutes: () => Promise.all(layer.layers.map((l) => l.readRouting())),
        async render(prepass = false, route = true) {
          if (route) layer.route(undefined);
          await frame(gpu, (current) =>
            current.pass({ target: output, clear: [0, 0, 0, 0], clearDepth: 0 }, (pass) =>
              layer.draw(pass, undefined, prepass),
            ),
          ).done;
          await gpu.settled();
        },
      };
    } catch (error) {
      dispose();
      throw error;
    }
  }
  const output = nativeTarget(device, size, samples),
    owned: (() => void)[] = [output.dispose];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of owned.reverse()) f();
  };
  try {
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
      const cameraGroup = root.createBindGroup(typegpuCameraLayout, { cam: camera });
      const environment = await createTypegpuEnvironment(device, env);
      owned.push(environment.dispose);
      const layer = await controlLayers<
        TgpuCommandEncoder,
        TgpuRenderCommands,
        TgpuBindGroup,
        Awaited<ReturnType<typeof createTypegpuGrass>>
      >(profile, () => createTypegpuGrass(device, environment, geometry, samples));
      owned.push(layer.dispose);
      await layer.first.updateRecords(records);
      return {
        field: layer.field,
        update: layer.first.update,
        updateRecords: layer.first.updateRecords,
        disposeGrass: layer.dispose,
        dispose,
        stats: layer.first.stats,
        setView: environment.setView,
        sky: environment.sky.lut,
        output: output.color,
        writeCamera: (data: Float32Array<ArrayBuffer>) => camera.write(data.buffer),
        async readFieldRoutes() {
          return Promise.all(
            layer.layers.map(async (l) => {
              const r = await l.readRouting();
              return {
                commands: Uint32Array.from(
                  r.commands.flatMap((c) => [
                    c.indexCount,
                    c.instanceCount,
                    c.firstIndex,
                    c.baseVertex,
                    c.firstInstance,
                  ]),
                ),
                visible: r.visible.map((v) => Uint32Array.from(v)),
              };
            }),
          );
        },
        async readRoutes() {
          const r = await layer.first.readRouting();
          return {
            commands: Uint32Array.from(
              r.commands.flatMap((c) => [
                c.indexCount,
                c.instanceCount,
                c.firstIndex,
                c.baseVertex,
                c.firstInstance,
              ]),
            ),
            visible: r.visible.map((v) => Uint32Array.from(v)),
          };
        },
        async render(prepass = false, route = true) {
          const encoder = root["~unstable"].createCommandEncoder();
          if (route) layer.route(encoder);
          const pass = encoder.beginRenderPass(attachments());
          layer.draw(pass, cameraGroup, prepass);
          pass.end();
          encoder.submit();
        },
      };
    }
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
    });
    const group = device.createBindGroup({
      layout,
      entries: [{ binding: 0, resource: { buffer: camera } }],
    });
    const layer = await controlLayers<
      GPUCommandEncoder,
      GPURenderPassEncoder,
      GPUBindGroup,
      Awaited<ReturnType<typeof createRawGrass>>
    >(profile, () =>
      createRawGrass(device, layout, environment, records, geometry, "rgba16float", samples),
    );
    owned.push(layer.dispose);
    return {
      field: layer.field,
      update: layer.first.update,
      updateRecords: layer.first.updateRecords,
      disposeGrass: layer.dispose,
      dispose,
      stats: layer.first.stats,
      setView: environment.setView,
      sky: environment.sky.lut,
      output: output.color,
      writeCamera: (data: Float32Array<ArrayBuffer>) => device.queue.writeBuffer(camera, 0, data),
      async readFieldRoutes() {
        return Promise.all(
          layer.layers.map(async (l) => ({
            commands: await readU32Buffer(device, l.commands),
            visible: await Promise.all(l.visible.map((b) => readU32Buffer(device, b))),
          })),
        );
      },
      async readRoutes() {
        return {
          commands: await readU32Buffer(device, layer.first.commands),
          visible: await Promise.all(layer.first.visible.map((b) => readU32Buffer(device, b))),
        };
      },
      async render(prepass = false, route = true) {
        const encoder = device.createCommandEncoder();
        if (route) layer.route(encoder);
        const pass = encoder.beginRenderPass(attachments());
        layer.draw(pass, group, prepass);
        pass.end();
        device.queue.submit([encoder.finish()]);
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

async function controlLayers<E, P, C, L extends GrassLayerRuntime<E, P, C>>(
  profile: BladeFieldProfile | undefined,
  create: () => Promise<L>,
) {
  const layers: L[] = [];
  try {
    for (let i = 0; i < (profile ? 2 : 1); i++) layers.push(await create());
    const first = layers[0],
      field = profile ? createGrassField<E, P, C, L>(profile, [layers[0], layers[1]]) : undefined;
    return {
      first,
      layers,
      field,
      route: (encoder: E) => (field ? field.route(encoder) : first.route(encoder)),
      draw: (pass: P, camera: C, prepass = false) =>
        field
          ? field.draw(pass, camera, prepass)
          : first.draw(pass, camera, prepass, true, "combined"),
      dispose: () => {
        if (field) field.dispose();
        else for (const layer of layers) layer.dispose();
      },
    };
  } catch (error) {
    for (const layer of layers) layer.dispose();
    throw error;
  }
}
