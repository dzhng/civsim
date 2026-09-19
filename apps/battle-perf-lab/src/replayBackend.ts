import { createSceneBackend, type SceneBackend } from "./sceneBackend";
import { readU32Buffer } from "./numericalReadback";
import type { BattleSceneOptions } from "../../../packages/battle-renderer/src/sceneTypes";
export type ReplayBackend = SceneBackend;
export async function createReplayBackend(
  backend: ReplayBackend,
  device: GPUDevice,
  canvas: HTMLCanvasElement,
  context: GPUCanvasContext,
  options: BattleSceneOptions,
) {
  const owner = await createSceneBackend(backend, device, canvas, context, options);
  return {
    ...owner,
    readDiagnostics: () => {
      const scene = owner.scene;
      if ("grassRoutingBuffers" in scene)
        return Promise.all(
          scene.grassRoutingBuffers().map(async (layer) => {
            const [commands, records] = await Promise.all([
              readU32Buffer(device, layer.commands),
              readU32Buffer(device, layer.records, layer.recordCount * 64),
            ]);
            return {
              commands,
              records: new Float32Array(records.buffer),
              recordCount: layer.recordCount,
            };
          }),
        );
      return scene.readGrassDiagnostics();
    },
  };
}
