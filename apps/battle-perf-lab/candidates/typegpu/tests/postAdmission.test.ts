/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
const state = vi.hoisted(() => ({
  live: new Set<object>(),
  realized: new Set<object>(),
  failAfter: Infinity,
  unwraps: 0,
}));
vi.mock("typegpu", async (original) => {
  const actual = await original<typeof import("typegpu")>();
  const allocate = () => {
    const value = {
      $usage: () => value,
      destroy: () => state.live.delete(value),
      write() {},
      createView: () => value,
    };
    state.live.add(value);
    return value;
  };
  const pipeline = () => {
    const p = { with: () => p, initAsync: async () => {}, withColorAttachment: () => p, draw() {} };
    return p;
  };
  return {
    ...actual,
    tgpu: {
      ...actual.tgpu,
      initFromDevice: () => ({
        createTexture: allocate,
        createBuffer: allocate,
        createSampler: () => ({}),
        createBindGroup: () => ({}),
        createRenderPipeline: pipeline,
        unwrap(v: object) {
          if (++state.unwraps === state.failAfter) throw Error("injected lazy allocation failure");
          state.realized.add(v);
          return v;
        },
        destroy() {},
      }),
    },
  };
});
import { createTypegpuPost } from "../../../../../packages/battle-renderer/src/world/post";
const device = {
  pushErrorScope: vi.fn(),
  popErrorScope: vi.fn(async (): Promise<GPUError | null> => null),
} as unknown as GPUDevice;
beforeEach(() => {
  state.live.clear();
  state.realized.clear();
  state.unwraps = 0;
  state.failAfter = Infinity;
  vi.mocked(device.popErrorScope).mockReset().mockResolvedValue(null);
});
test("every post allocation is realized before return and all late admission failures release the chain", async () => {
  const post = await createTypegpuPost(device, {} as GPUTextureView, 128, 96);
  expect([...state.live].every((r) => state.realized.has(r))).toBe(true);
  const count = state.unwraps;
  post.dispose();
  expect(state.live.size).toBe(0);
  state.unwraps = 0;
  state.failAfter = count;
  await expect(createTypegpuPost(device, {} as GPUTextureView, 128, 96)).rejects.toThrow(
    "injected lazy allocation failure",
  );
  expect(state.live.size).toBe(0);
});
test("asynchronous GPU admission errors reject post initialization and release all resources", async () => {
  vi.mocked(device.popErrorScope).mockResolvedValueOnce({
    message: "injected GPU admission failure",
  } as GPUError);
  await expect(createTypegpuPost(device, {} as GPUTextureView, 128, 96)).rejects.toThrow(
    "injected GPU admission failure",
  );
  expect(state.live.size).toBe(0);
});
