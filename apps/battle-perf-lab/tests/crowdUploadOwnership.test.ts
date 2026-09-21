/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
const state = vi.hoisted(() => ({ upload: vi.fn(), dispose: vi.fn() }));
// Isolate palette ownership from GPU geometry; the actual mesh upload and packer run.
vi.mock("../../../packages/battle-renderer/src/crowdData", async (original) => ({
  ...(await original<object>()),
  crowdRigGroups: () => [{ 0: { rig: {}, animation: {} }, 1: { rig: {}, animation: {} } }],
}));
vi.mock("../src/vgpu/posePalette", () => ({
  createVgpuPosePalette: async () => ({
    upload: state.upload,
    dispose: state.dispose,
    precompute() {},
  }),
}));
vi.mock("../../../packages/battle-renderer/src/world/posePalette", () => ({
  createTypegpuPosePalette: async () => ({
    upload: state.upload,
    dispose: state.dispose,
    precompute() {},
  }),
}));
vi.mock("typegpu", async () => {
  const mod = await vi.importActual<typeof import("../../../web/node_modules/typegpu/index.js")>(
    "../../../web/node_modules/typegpu/index.js",
  );
  return { ...mod, tgpu: { ...mod.tgpu, initFromDevice: () => ({ destroy() {} }) } };
});
import { createTypegpuCrowd } from "../../../packages/battle-renderer/src/world/crowd";
import { createVgpuCrowd } from "../src/vgpu/crowd";
const device = { pushErrorScope() {}, popErrorScope: async () => null };
const soldier = (classId: number) => ({
  x: 0,
  y: 0,
  facing: 0,
  classId,
  faction: 0,
  alive: true,
  clip: "idle",
  phase: 0,
  seed: 0,
  mounted: false,
  lod: 0,
});
const plan = { levels: [0, 0], shadowLevels: [0, 0], visibility: [3, 3] };
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const factories = {
  typegpu: () => createTypegpuCrowd(device as never, {}, {} as never, {} as never),
  vgpu: () => createVgpuCrowd({ device: { gpu: device } } as never, {}, {} as never, {} as never),
};
beforeEach(() => {
  state.upload.mockReset();
  state.dispose.mockReset();
});
for (const [backend, create] of Object.entries(factories)) {
  test(`${backend} keeps pending pose slots owned until upload completes`, async () => {
    const mesh = await create(),
      wait = deferred();
    const observed: number[] = [];
    state.upload.mockImplementationOnce(
      async (count: number, _pose: unknown, appearance: (i: number) => number) => {
        await wait.promise;
        for (let i = 0; i < count; i++) observed.push(appearance(i));
      },
    );
    const pending = mesh.upload([soldier(0), soldier(1)] as never, plan);
    await expect(mesh.upload([soldier(1)] as never, plan)).rejects.toThrow("already pending");
    wait.resolve();
    await pending;
    expect(observed).toEqual([0, 1]);
    await expect(mesh.upload([soldier(1)] as never, plan)).resolves.toBeUndefined();
    mesh.dispose();
  });
  test(`${backend} releases failed uploads and does not revive after disposal`, async () => {
    const mesh = await create(),
      wait = deferred();
    state.upload.mockImplementationOnce(() => wait.promise);
    const pending = mesh.upload([soldier(0)] as never, plan);
    const rejected = expect(pending).rejects.toThrow("failed palette");
    wait.reject(new Error("failed palette"));
    await rejected;
    expect(() => mesh.precompute({} as never)).toThrow("not ready");
    await mesh.upload([soldier(1)] as never, plan);
    const late = deferred();
    state.upload.mockImplementationOnce(() => late.promise);
    const last = mesh.upload([soldier(0)] as never, plan);
    const disposed = expect(last).rejects.toThrow("disposed");
    mesh.dispose();
    mesh.dispose();
    late.resolve();
    await disposed;
    expect(() => mesh.precompute({} as never)).toThrow("not ready");
    expect(state.dispose).toHaveBeenCalledTimes(1);
  });
}
