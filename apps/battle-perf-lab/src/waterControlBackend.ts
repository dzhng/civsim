import { tgpu } from "typegpu";
import { initFromDevice, target } from "vgpu";
import type { CivsimEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import type { PhotorealBattleGroundMesh } from "../../../packages/game-renderer/src/battle/groundPass";
import type { BattlePostGradeUniforms } from "../../../packages/game-renderer/src/environment/postParameters";
import type { FrameCameraSnapshot } from "../../../packages/battle-renderer/src/frameCamera";
import type { BattleWaterInput } from "../../../packages/battle-renderer/src/waterData";
import { checkWaterLifetime } from "./waterLifetimeCheck";
import { createTypegpuWater } from "../candidates/typegpu/water";
import { createTypegpuEnvironment } from "../candidates/typegpu/environment";
import { createTypegpuTerrain } from "../candidates/typegpu/terrain";
import { TypegpuBattleFrame } from "../candidates/typegpu/frame";
import { createVgpuWater } from "./vgpu/water";
import { createVgpuEnvironment } from "./vgpu/environment";
import { createVgpuTerrain } from "./vgpu/terrain";
import { VgpuBattleFrame } from "./vgpu/frame";
import { destroyVgpuTarget } from "./vgpu/targetLifetime";
/** Lab-only driver; each runtime owns its frame and all rendered resources. */
export async function createWaterControlBackend(
  backend: "typegpu" | "vgpu",
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
    if (backend === "typegpu") {
      const root = tgpu.initFromDevice({ device });
      release.push(() => root.destroy());
      const environment = await createTypegpuEnvironment(device, env, undefined, samples);
      release.push(environment.dispose);
      const frame = await TypegpuBattleFrame.create(
        device,
        environment,
        width,
        height,
        samples,
        "rgba16float",
      );
      release.push(() => frame.dispose());
      const create = (inputs: readonly BattleWaterInput[]) =>
        createTypegpuWater(device, frame.cameraGroup, environment, inputs, samples);
      const lifecycle = await checkWaterLifetime(device, create, input);
      const water = await create([input]);
      release.push(water.dispose);
      const terrain = await createTypegpuTerrain(
        device,
        frame.cameraBuffer,
        environment,
        ground,
        null,
        { earthDistance: ground.earthDistance },
        "beauty",
        samples,
      );
      release.push(terrain.dispose);
      const output = root
        .createTexture({ size: [width, height], format: "rgba16float" })
        .$usage("render");
      release.push(() => output.destroy());
      return {
        lifecycle,
        waterStats: water.stats,
        output: root.unwrap(output),
        setCamera: (
          snapshot: FrameCameraSnapshot,
          observer: readonly [number, number, number],
          grade: BattlePostGradeUniforms,
        ) => frame.setCamera(snapshot, observer, grade),
        async render(bloom: boolean) {
          frame.render(
            root.unwrap(output).createView(),
            () => {},
            (pass) => {
              if (input.kind === "lake") terrain.draw(pass);
              water.draw(pass);
            },
            bloom,
          );
        },
        dispose,
      };
    }
    const gpu = await initFromDevice(device);
    release.push(() => gpu.dispose());
    const environment = await createVgpuEnvironment(gpu, env, undefined, 3, samples);
    release.push(environment.dispose);
    const frame = await VgpuBattleFrame.create(
      gpu,
      environment,
      width,
      height,
      samples,
      "rgba16float",
    );
    release.push(() => frame.dispose());
    const create = (inputs: readonly BattleWaterInput[]) =>
      createVgpuWater(gpu, frame.camera, environment, inputs, samples);
    const lifecycle = await checkWaterLifetime(device, create, input);
    const water = await create([input]);
    release.push(water.dispose);
    const terrain = await createVgpuTerrain(
      gpu,
      frame.camera,
      environment,
      ground,
      null,
      { earthDistance: ground.earthDistance },
      "beauty",
      samples,
    );
    release.push(terrain.dispose);
    const output = target(gpu, { size: [width, height], format: "rgba16float" });
    release.push(() => destroyVgpuTarget(output));
    return {
      lifecycle,
      waterStats: water.stats,
      output: output.color.gpu,
      setCamera: (
        snapshot: FrameCameraSnapshot,
        observer: readonly [number, number, number],
        grade: BattlePostGradeUniforms,
      ) => frame.setCamera(snapshot, observer, grade),
      async render(bloom: boolean) {
        await frame.render(
          output,
          () => {},
          (pass) => {
            if (input.kind === "lake") terrain.draw(pass);
            water.draw(pass);
          },
          bloom,
        );
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
