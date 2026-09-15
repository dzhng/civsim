import { nativeTarget } from "../../src/controlTarget";
import type { CivsimEnvironment } from "../../../../packages/game-renderer/src/environment/environment";
import type { PhotorealBattleGroundMesh } from "../../../../packages/game-renderer/src/battle/groundPass";
import type { BattleHorizonLayout } from "../../../../packages/game-renderer/src/battle/horizonPass";
import type { TerrainMaterialOptions } from "../../src/shaders/terrainMaterial";
import { createRawEnvironment } from "../../src/raw/environment";
import { RawBattleTerrain } from "../../src/raw/terrain";
import { createTypegpuEnvironment } from "../typegpu/environment";
import { createTypegpuTerrain } from "../typegpu/terrain";

import { initFromDevice, target, frame } from "vgpu";
import { createVgpuEnvironment } from "../../src/vgpu/environment";
import { createVgpuTerrain } from "../../src/vgpu/terrain";
import { destroyVgpuTarget } from "../../src/vgpu/targetLifetime";

/** Only test lifecycle/attachment plumbing is shared; each runtime owns its passes. */
export async function createTerrainBackend(
  backend: "raw" | "typegpu" | "vgpu",
  device: GPUDevice,
  env: CivsimEnvironment,
  cameraBuffer: GPUBuffer,
  sampleCount: 1 | 4,
  invariantPosition: boolean,
  size: readonly [number, number],
  reportError: (message: string) => void,
) {
  if (backend === "vgpu") {
    const gpu = await initFromDevice(device);
    gpu.onError((error) => reportError(String(error)));
    const owned: { dispose(): void }[] = [];
    const dispose = () => {
      for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose();
      owned.length = 0;
      gpu.dispose();
    };
    try {
      const environment = await createVgpuEnvironment(gpu, env);
      owned.push(environment);
      const output = target(gpu, {
        size,
        format: "rgba16float",
        depth: "depth32float",
        msaa: sampleCount === 4,
      });
      owned.push({ dispose: () => destroyVgpuTarget(output) });
      const camera = gpu.device.wrapBuffer(cameraBuffer);
      owned.push(camera);
      return {
        exposure: environment.exposure,
        setView: environment.setView,
        dispose,
        async create(
          ground: PhotorealBattleGroundMesh,
          horizon: BattleHorizonLayout | null,
          options: TerrainMaterialOptions,
          mode: "material" | "beauty",
        ) {
          const terrain = await createVgpuTerrain(
            gpu,
            camera,
            environment,
            ground,
            horizon,
            options,
            mode,
            sampleCount,
          );
          return {
            setState: terrain.setState,
            dispose: terrain.dispose,
            async render() {
              await frame(gpu, (current) =>
                current.pass({ target: output, clear: [0, 0, 0, 0], clearDepth: 0 }, (pass) =>
                  terrain.draw(pass),
                ),
              ).done;
              await gpu.settled();
              return output.color.gpu;
            },
          };
        },
      };
    } catch (error) {
      dispose();
      throw error;
    }
  }
  const output = nativeTarget(device, size, sampleCount);
  if (backend === "typegpu") {
    try {
      const environment = await createTypegpuEnvironment(device, env);
      return {
        exposure: environment.exposure,
        setView: environment.setView,
        dispose() {
          environment.dispose();
          output.dispose();
        },
        async create(
          ground: PhotorealBattleGroundMesh,
          horizon: BattleHorizonLayout | null,
          options: TerrainMaterialOptions,
          mode: "material" | "beauty",
        ) {
          const terrain = await createTypegpuTerrain(
            device,
            cameraBuffer,
            environment,
            ground,
            horizon,
            options,
            mode,
            sampleCount,
          );
          return {
            setState: terrain.setState,
            dispose: terrain.dispose,
            async render() {
              terrain.render(output.attachments);
              return output.color;
            },
          };
        },
      };
    } catch (error) {
      output.dispose();
      throw error;
    }
  }
  try {
    const environment = await createRawEnvironment(device, env);
    const cameraLayout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" },
          },
        ],
      }),
      cameraGroup = device.createBindGroup({
        layout: cameraLayout,
        entries: [{ binding: 0, resource: { buffer: cameraBuffer } }],
      });
    return {
      exposure: environment.exposure,
      setView: environment.setView,
      dispose() {
        environment.dispose();
        output.dispose();
      },
      async create(
        ground: PhotorealBattleGroundMesh,
        horizon: BattleHorizonLayout | null,
        options: TerrainMaterialOptions,
        mode: "material" | "beauty",
      ) {
        const terrain = new RawBattleTerrain(
          device,
          cameraLayout,
          environment,
          ground,
          horizon,
          options,
          mode,
          sampleCount,
          invariantPosition,
        );
        return {
          setState: terrain.setState.bind(terrain),
          dispose: () => terrain.dispose(),
          async render() {
            const attachments = output.attachments;
            const encoder = device.createCommandEncoder();
            const pass = encoder.beginRenderPass({
              colorAttachments: [
                {
                  view: attachments.color,
                  resolveTarget: attachments.resolveTarget,
                  clearValue: [0, 0, 0, 0],
                  loadOp: "clear",
                  storeOp: "store",
                },
              ],
              depthStencilAttachment: {
                view: attachments.depth,
                depthClearValue: 0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
              },
            });
            terrain.encode(pass, cameraGroup);
            pass.end();
            device.queue.submit([encoder.finish()]);
            return output.color;
          },
        };
      },
    };
  } catch (error) {
    output.dispose();
    throw error;
  }
}
