import type { ImpostorAtlasData } from "../../../packages/soldier-assets/src/impostorAtlas";
import { tgpu } from "typegpu";
import { initFromDevice, target, frame } from "vgpu";
import type { CivsimEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import type { CrowdInstance } from "../../../packages/crowd-runtime/src/instanceData";
import { cameraUniformData } from "../../../packages/renderer-core/src/cameraUniform";
import { viewMatrix, type Camera3DParams } from "../../../packages/renderer-core/src/camera3d";
import { GPU_DEPTH_FORMAT } from "../../../packages/renderer-core/src/depthContract";
import type { ImpostorView } from "../../../packages/battle-renderer/src/impostorData";
import type { WorldSurfaceDiagnostic } from "../../../packages/battle-renderer/src/shaders/environment";
import { createRawEnvironment, rawEnvironmentWgsl } from "../../../packages/battle-renderer/src/world/environment";
import { createRawImpostors } from "../../../packages/battle-renderer/src/world/impostor";
import { createTypegpuEnvironment } from "../candidates/typegpu/environment";
import { createTypegpuImpostors } from "../candidates/typegpu/impostor";
import { Camera, typegpuCameraLayout } from "../candidates/typegpu/camera";
import { createVgpuEnvironment } from "./vgpu/environment";
import { createVgpuImpostors } from "./vgpu/impostor";
import { destroyVgpuTarget } from "./vgpu/targetLifetime";
import { readHdrTexture } from "./numericalReadback";

export type ImpostorBackend = "raw" | "typegpu" | "vgpu";
export interface ImpostorControlLayer {
  update(source: readonly CrowdInstance[], view: ImpostorView): Float32Array<ArrayBuffer>;
  render(camera: Camera3DParams): Promise<GPUTexture>;
  stats(): {
    instances: number;
    draws: number;
    clipInvariant: boolean;
    castShadow: boolean;
    receiveShadow: boolean;
    atlasSource: string;
  };
  dispose(): void;
}
export interface ImpostorControlBackend {
  create(atlas: ImpostorAtlasData): Promise<ImpostorControlLayer>;
  borrowedResourcesAlive(): Promise<boolean>;
  dispose(): void;
}
/** Numerical-control adapter only. Each implementation owns its own resources and submission API. */
export async function createImpostorControlBackend(
  kind: ImpostorBackend,
  device: GPUDevice,
  env: CivsimEnvironment,
  samples: 1 | 4,
  width: number,
  height: number,
  errors: string[],
  diagnostic?: WorldSurfaceDiagnostic,
): Promise<ImpostorControlBackend> {
  const release: Array<() => void> = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of release.reverse()) f();
  };
  const cameraBytes = (camera: Camera3DParams) =>
    cameraUniformData({
      camera3d: camera,
      x: 0,
      y: 0,
      zoom: 8,
      width,
      height,
      sunAzimuth: 0,
      sunElevation: 0,
    });
  const finite = async (...textures: GPUTexture[]) =>
    (await Promise.all(textures.map((t) => readHdrTexture(device, t)))).every((p) =>
      p.every(Number.isFinite),
    );
  try {
    if (kind === "raw") {
      const environment = await createRawEnvironment(device, env);
      release.push(environment.dispose);
      if (diagnostic) environment.shader = rawEnvironmentWgsl(env, diagnostic);
      const camera = device.createBuffer({
        size: 192,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      release.push(() => camera.destroy());
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
      const output = device.createTexture({
        size: [width, height],
        format: "rgba16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      release.push(() => output.destroy());
      const msaa =
        samples === 4
          ? device.createTexture({
              size: [width, height],
              format: "rgba16float",
              sampleCount: samples,
              usage: GPUTextureUsage.RENDER_ATTACHMENT,
            })
          : undefined;
      if (msaa) release.push(() => msaa.destroy());
      const depth = device.createTexture({
        size: [width, height],
        format: GPU_DEPTH_FORMAT,
        sampleCount: samples,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      release.push(() => depth.destroy());
      return {
        create: async (atlas) => {
          const layer = await createRawImpostors(device, atlas, layout, environment, samples);
          return {
            ...layer,
            render: async (params) => {
              environment.setView(viewMatrix(params), [0, 0, 0]);
              device.queue.writeBuffer(camera, 0, cameraBytes(params));
              const encoder = device.createCommandEncoder();
              const pass = encoder.beginRenderPass({
                colorAttachments: [
                  {
                    view: (msaa ?? output).createView(),
                    resolveTarget: msaa ? output.createView() : undefined,
                    loadOp: "clear",
                    storeOp: "store",
                    clearValue: [0, 0, 0, 0],
                  },
                ],
                depthStencilAttachment: {
                  view: depth.createView(),
                  depthClearValue: 0,
                  depthLoadOp: "clear",
                  depthStoreOp: "store",
                },
              });
              layer.draw(pass, group);
              pass.end();
              device.queue.submit([encoder.finish()]);
              return output;
            },
          };
        },
        borrowedResourcesAlive: () => finite(output, environment.sky.lut),
        dispose,
      };
    }
    if (kind === "typegpu") {
      const root = tgpu.initFromDevice({ device });
      release.push(() => root.destroy());
      const environment = await createTypegpuEnvironment(device, env, diagnostic);
      release.push(environment.dispose);
      const camera = root.createBuffer(Camera).$usage("uniform");
      release.push(() => camera.destroy());
      const group = root.createBindGroup(typegpuCameraLayout, { cam: camera });
      const output = root
        .createTexture({ size: [width, height], format: "rgba16float" })
        .$usage("render");
      release.push(() => output.destroy());
      const msaa =
        samples === 4
          ? root
              .createTexture({ size: [width, height], format: "rgba16float", sampleCount: samples })
              .$usage("render")
          : undefined;
      if (msaa) release.push(() => msaa.destroy());
      const depth = root
        .createTexture({ size: [width, height], format: GPU_DEPTH_FORMAT, sampleCount: samples })
        .$usage("render");
      release.push(() => depth.destroy());
      return {
        create: async (atlas) => {
          const layer = await createTypegpuImpostors(device, atlas, environment, samples);
          return {
            ...layer,
            render: async (params) => {
              environment.setView(viewMatrix(params), [0, 0, 0]);
              camera.write(cameraBytes(params).buffer);
              const encoder = root["~unstable"].createCommandEncoder();
              const pass = encoder.beginRenderPass({
                colorAttachments: [
                  {
                    view: msaa ?? output,
                    resolveTarget: msaa ? output : undefined,
                    clearValue: [0, 0, 0, 0],
                  },
                ],
                depthStencilAttachment: { view: depth, depthClearValue: 0 },
              });
              layer.draw(pass, group);
              pass.end();
              encoder.submit();
              return root.unwrap(output);
            },
          };
        },
        borrowedResourcesAlive: () => finite(root.unwrap(output), environment.sky.lut),
        dispose,
      };
    }
    const gpu = await initFromDevice(device);
    release.push(() => gpu.dispose());
    const unsubscribe = gpu.onError((e) => errors.push(e.message));
    release.push(unsubscribe);
    const environment = await createVgpuEnvironment(gpu, env, diagnostic);
    release.push(environment.dispose);
    const camera = gpu.device.createBuffer({ size: 192, usage: ["uniform", "copy_dst"] });
    release.push(() => camera.destroy());
    const output = target(gpu, {
      size: [width, height],
      format: "rgba16float",
      depth: GPU_DEPTH_FORMAT,
      msaa: samples === 4,
      clearColor: [0, 0, 0, 0],
    });
    release.push(() => destroyVgpuTarget(output));
    return {
      create: async (atlas) => {
        const layer = await createVgpuImpostors(gpu, atlas, environment, camera, samples);
        return {
          ...layer,
          render: async (params) => {
            environment.setView(viewMatrix(params), [0, 0, 0]);
            camera.write(cameraBytes(params));
            await frame(gpu, (current) =>
              current.pass({ target: output, clear: [0, 0, 0, 0], clearDepth: 0 }, (pass) =>
                layer.draw(pass),
              ),
            ).done;
            return output.color.gpu;
          },
        };
      },
      borrowedResourcesAlive: () => finite(output.color.gpu, environment.sky.lut.gpu),
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
