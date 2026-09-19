import { tgpu } from "typegpu";
import { initFromDevice, target } from "vgpu";
import type { CivsimEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import type { BattlePostGradeUniforms } from "../../../packages/game-renderer/src/environment/postParameters";
import type { buildBattleTerrainData } from "../../../packages/game-renderer/src/battle/terrainSceneData";
import type { FrameCameraSnapshot } from "../../../packages/battle-renderer/src/frameCamera";
import { createTypegpuEnvironment } from "../candidates/typegpu/environment";
import { createTypegpuTerrain } from "../candidates/typegpu/terrain";
import { TypegpuBattleFrame } from "../candidates/typegpu/frame";
import { createVgpuEnvironment } from "./vgpu/environment";
import { createVgpuTerrain } from "./vgpu/terrain";
import { VgpuBattleFrame } from "./vgpu/frame";
import { destroyVgpuTarget } from "./vgpu/targetLifetime";
/** Dedicated control driver: ground then opaque vista then translucent far fog. */
export async function createVistaControlBackend(
  backend: "typegpu" | "vgpu",
  device: GPUDevice,
  env: CivsimEnvironment,
  data: ReturnType<typeof buildBattleTerrainData>,
  width: number,
  height: number,
  samples: 1 | 4,
) {
  const releases: (() => void)[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of releases.reverse()) f();
  };
  try {
    if (backend === "typegpu") {
      const root = tgpu.initFromDevice({ device });
      releases.push(() => root.destroy());
      const environment = await createTypegpuEnvironment(device, env, undefined, samples);
      releases.push(environment.dispose);
      const frame = await TypegpuBattleFrame.create(
        device,
        environment,
        width,
        height,
        samples,
        "rgba16float",
      );
      releases.push(() => frame.dispose());
      const layers: Awaited<ReturnType<typeof createTypegpuTerrain>>[] = [];
      const ground = await createTypegpuTerrain(
        device,
        frame.cameraBuffer,
        environment,
        data.ground,
        null,
        { earthDistance: data.ground.earthDistance },
        "beauty",
        samples,
      );
      layers.push(ground);
      releases.push(ground.dispose);
      for (const r of data.vistaMeshes) {
        const layer = await createTypegpuTerrain(
          device,
          frame.cameraBuffer,
          environment,
          r.mesh,
          null,
          { vistaBand: r.name },
          "beauty",
          samples,
        );
        layers.push(layer);
        releases.push(layer.dispose);
      }
      const output = root
        .createTexture({ size: [width, height], format: "rgba16float" })
        .$usage("render");
      releases.push(() => output.destroy());
      return {
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
              for (const layer of layers) layer.draw(pass);
            },
            bloom,
          );
        },
        dispose,
      };
    }
    const gpu = await initFromDevice(device);
    releases.push(() => gpu.dispose());
    const environment = await createVgpuEnvironment(gpu, env, undefined, 3, samples);
    releases.push(environment.dispose);
    const frame = await VgpuBattleFrame.create(
      gpu,
      environment,
      width,
      height,
      samples,
      "rgba16float",
    );
    releases.push(() => frame.dispose());
    const layers: Awaited<ReturnType<typeof createVgpuTerrain>>[] = [];
    const ground = await createVgpuTerrain(
      gpu,
      frame.camera,
      environment,
      data.ground,
      null,
      { earthDistance: data.ground.earthDistance },
      "beauty",
      samples,
    );
    layers.push(ground);
    releases.push(ground.dispose);
    for (const r of data.vistaMeshes) {
      const layer = await createVgpuTerrain(
        gpu,
        frame.camera,
        environment,
        r.mesh,
        null,
        { vistaBand: r.name },
        "beauty",
        samples,
      );
      layers.push(layer);
      releases.push(layer.dispose);
    }
    const output = target(gpu, { size: [width, height], format: "rgba16float" });
    releases.push(() => destroyVgpuTarget(output));
    return {
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
            for (const layer of layers) layer.draw(pass);
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
