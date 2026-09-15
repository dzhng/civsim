import { grassGeometries } from "../../src/grassData";
import type { TgpuCommandEncoder, TgpuRenderCommands, TgpuBindGroup } from "typegpu";
import type { BladeFieldProfile } from "../../../../packages/game-renderer/src/battle/battleGrassResidency";
import { createGrassField } from "../../src/grassField";
import { createTypegpuGrass } from "./grass";
import type { TypegpuEnvironment } from "./environment";
export async function createTypegpuGrassField(
  device: GPUDevice,
  environment: TypegpuEnvironment,
  profile: BladeFieldProfile,
  samples: 1 | 4 = 1,
) {
  const tiers = grassGeometries(profile);
  const layers: Awaited<ReturnType<typeof createTypegpuGrass>>[] = [];
  try {
    for (let i = 0; i < 2; i++)
      layers.push(await createTypegpuGrass(device, environment, tiers, samples));
    return {
      ...createGrassField<
        TgpuCommandEncoder,
        TgpuRenderCommands,
        TgpuBindGroup,
        (typeof layers)[number]
      >(profile, [layers[0], layers[1]]),
      readRouting: () => Promise.all(layers.map((l) => l.readRouting())),
    };
  } catch (error) {
    for (const l of layers) l.dispose();
    throw error;
  }
}
