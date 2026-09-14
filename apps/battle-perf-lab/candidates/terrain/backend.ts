import type { CivsimEnvironment } from "../../../../packages/game-renderer/src/environment/environment";
import type { PhotorealBattleGroundMesh } from "../../../../packages/game-renderer/src/battle/groundPass";
import type { BattleHorizonLayout } from "../../../../packages/game-renderer/src/battle/horizonPass";
import type { TerrainMaterialOptions } from "../../src/shaders/terrainMaterial";
import { createRawEnvironment } from "../../src/raw/environment";
import { RawBattleTerrain } from "../../src/raw/terrain";
import { createTypegpuEnvironment } from "../typegpu/environment";
import { createTypegpuTerrain, type TerrainAttachments } from "../typegpu/terrain";

/** Only test lifecycle/attachment plumbing is shared; each runtime owns its passes. */
export async function createTerrainBackend(
  backend: "raw" | "typegpu",
  device: GPUDevice,
  env: CivsimEnvironment,
  cameraBuffer: GPUBuffer,
  sampleCount: 1 | 4,
  invariantPosition: boolean,
) {
  if (backend === "typegpu") {
    const environment = await createTypegpuEnvironment(device, env);
    return {
      exposure: environment.exposure,
      setView: environment.setView,
      dispose: environment.dispose,
      create: (
        ground: PhotorealBattleGroundMesh,
        horizon: BattleHorizonLayout | null,
        options: TerrainMaterialOptions,
        mode: "material" | "beauty",
      ) =>
        createTypegpuTerrain(
          device,
          cameraBuffer,
          environment,
          ground,
          horizon,
          options,
          mode,
          sampleCount,
        ),
    };
  }
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
    dispose: environment.dispose,
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
        render(attachments: TerrainAttachments) {
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
        },
      };
    },
  };
}
