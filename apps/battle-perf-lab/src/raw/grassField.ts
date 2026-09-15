import { grassGeometries } from "../grassData";
import type { BladeFieldProfile } from "../../../../packages/game-renderer/src/battle/battleGrassResidency";
import { createGrassField } from "../grassField";
import { createRawGrass } from "./grass";
import type { RawEnvironment } from "./environment";
export async function createRawGrassField(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  environment: RawEnvironment,
  profile: BladeFieldProfile,
  sampleCount: 1 | 4 = 1,
) {
  const tiers = grassGeometries(profile);
  const layers: Awaited<ReturnType<typeof createRawGrass>>[] = [];
  try {
    for (let i = 0; i < 2; i++)
      layers.push(
        await createRawGrass(
          device,
          cameraLayout,
          environment,
          new Float32Array(),
          tiers,
          "rgba16float",
          sampleCount,
        ),
      );
    return {
      ...createGrassField<
        GPUCommandEncoder,
        GPURenderPassEncoder,
        GPUBindGroup,
        (typeof layers)[number]
      >(profile, [layers[0], layers[1]]),
      routingBuffers: () =>
        layers.map((layer) => ({ commands: layer.commands, visible: layer.visible, records: layer.recordBuffer, recordCount: layer.stats().recordCount })),
    };
  } catch (error) {
    for (const layer of layers) layer.dispose();
    throw error;
  }
}
