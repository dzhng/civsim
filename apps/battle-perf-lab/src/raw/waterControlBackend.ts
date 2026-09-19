import { createRawEnvironment } from "../../../../packages/battle-renderer/src/world/environment";
import { RawBattleFrame } from "../../../../packages/battle-renderer/src/world/frame";
import { RawBattleWater } from "../../../../packages/battle-renderer/src/world/water";
import { RawBattleTerrain } from "../../../../packages/battle-renderer/src/world/terrain";
import type { CivsimEnvironment } from "../../../../packages/game-renderer/src/environment/environment";
import type { PhotorealBattleGroundMesh } from "../../../../packages/game-renderer/src/battle/groundPass";
import type { BattlePostGradeUniforms } from "../../../../packages/game-renderer/src/environment/postParameters";
import type { FrameCameraSnapshot } from "../../../../packages/battle-renderer/src/frameCamera";
import type { BattleWaterInput } from "../../../../packages/battle-renderer/src/waterData";
/** Raw control driver for the shared source fixture, not a fallback for other runtimes. */
export async function createRawWaterControlBackend(
  device: GPUDevice,
  env: CivsimEnvironment,
  input: BattleWaterInput,
  ground: PhotorealBattleGroundMesh,
  width: number,
  height: number,
  samples: 1 | 4,
) {
  const release: (() => void)[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of release.reverse()) f();
  };
  try {
    const environment = await createRawEnvironment(device, env, samples);
    release.push(environment.dispose);
    const frame = new RawBattleFrame(device, environment, width, height, samples, "rgba16float");
    release.push(() => frame.dispose());
    const terrain = new RawBattleTerrain(
      device,
      frame.cameraLayout,
      environment,
      ground,
      null,
      { earthDistance: ground.earthDistance },
      "beauty",
      samples,
    );
    release.push(() => terrain.dispose());
    const water = new RawBattleWater(device, frame.cameraLayout, environment, [input], samples);
    release.push(() => water.dispose());
    const output = device.createTexture({
      size: [width, height],
      format: "rgba16float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    release.push(() => output.destroy());
    return {
      lifecycle: undefined,
      waterStats: () => water.stats(),
      output,
      setCamera: (
        snapshot: FrameCameraSnapshot,
        observer: readonly [number, number, number],
        grade: BattlePostGradeUniforms,
      ) => frame.setCamera(snapshot, observer, grade),
      async render(bloom: boolean) {
        const encoder = device.createCommandEncoder();
        frame.encode(
          encoder,
          output.createView(),
          (pass, camera) => {
            if (input.kind === "lake") terrain.encode(pass, camera);
            water.encode(pass, camera);
          },
          bloom,
        );
        device.queue.submit([encoder.finish()]);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
