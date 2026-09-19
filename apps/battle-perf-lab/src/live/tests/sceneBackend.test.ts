/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
const backend = vi.hoisted(() => ({
  render: vi.fn(),
  sceneDispose: vi.fn(),
  surfaceDispose: vi.fn(),
  gpuDispose: vi.fn(),
}));
vi.mock("vgpu", () => ({
  initFromDevice: async () => ({ dispose: backend.gpuDispose }),
  surface: () => ({ resize() {}, dispose: backend.surfaceDispose }),
}));
vi.mock("../../vgpu/battleScene", () => ({
  createVgpuBattleScene: async () => ({ render: backend.render, dispose: backend.sceneDispose }),
}));
import { createSceneBackend } from "../../sceneBackend";
import type { BattleSceneOptions } from "../../../../../packages/battle-renderer/src/sceneTypes";
test("vgpu submission remains synchronous before validation, and every owner is released even if surface cleanup fails", async () => {
  let validate!: () => void;
  const validation = new Promise<void>((resolve) => {
    validate = resolve;
  });
  let submitted = false;
  backend.render.mockImplementation(() => {
    submitted = true;
    return validation;
  });
  const owner = await createSceneBackend(
    "vgpu",
    {} as GPUDevice,
    {} as HTMLCanvasElement,
    {} as GPUCanvasContext,
    { width: 1, height: 1, outputFormat: "bgra8unorm" } as BattleSceneOptions,
  );
  const pending = owner.submitPresentation();
  expect(submitted).toBe(true);
  validate();
  await pending;
  backend.surfaceDispose.mockImplementationOnce(() => {
    throw Error("surface cleanup");
  });
  expect(() => owner.dispose()).toThrow("surface cleanup");
  expect(backend.sceneDispose).toHaveBeenCalledTimes(1);
  expect(backend.gpuDispose).toHaveBeenCalledTimes(1);
  owner.dispose();
  expect(backend.gpuDispose).toHaveBeenCalledTimes(1);
});
