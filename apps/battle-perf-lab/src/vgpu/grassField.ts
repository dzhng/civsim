import { grassGeometries } from "../grassData";
import type { Gpu, FramePass } from "vgpu";
import type { BladeFieldProfile } from "../../../../packages/game-renderer/src/battle/battleGrassResidency";
import { createGrassField } from "../grassField";
import { createVgpuGrass } from "./grass";
import type { VgpuEnvironment } from "./environment";
export async function createVgpuGrassField(
  gpu: Gpu,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  environment: VgpuEnvironment,
  profile: BladeFieldProfile,
  samples: 1 | 4 = 1,
) {
  const tiers = grassGeometries(profile);
  const layers: Awaited<ReturnType<typeof createVgpuGrass>>[] = [];
  try {
    for (let i = 0; i < 2; i++)
      layers.push(await createVgpuGrass(gpu, camera, environment, tiers, samples));
    const field = createGrassField<undefined, FramePass, undefined, (typeof layers)[number]>(
      profile,
      [layers[0], layers[1]],
    );
    return {
      ...field,
      route: () => field.route(undefined),
      draw: (pass: FramePass, prepass = false) => field.draw(pass, undefined, prepass),
      readDiagnostics: () => Promise.all(layers.map((l) => l.readDiagnostics())),
      readRouting: () => Promise.all(layers.map((l) => l.readRouting())),
    };
  } catch (error) {
    for (const l of layers) l.dispose();
    throw error;
  }
}
