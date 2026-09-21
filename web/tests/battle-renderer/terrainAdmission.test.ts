// @vitest-environment node
import { vi, test, expect } from "vitest";
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
    const p = {
      with: () => p,
      withIndexBuffer: () => p,
      initAsync: async () => {},
      withColorAttachment: () => p,
      draw() {},
    };
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
import { createTypegpuTerrain } from "../../../packages/battle-renderer/src/world/terrain";
import type { TypegpuEnvironment } from "../../../packages/battle-renderer/src/world/environment";
const device = {
  pushErrorScope: vi.fn(),
  popErrorScope: vi.fn(async (): Promise<GPUError | null> => null),
} as unknown as GPUDevice;
const ground = {
  triangles: 1,
  vertices: new Float32Array(30),
  coverage: new Float32Array(9),
  surfaceColor: new Float32Array(9),
  indices: new Uint32Array([0, 1, 2]),
};
const environment = {
  layout: {},
  shade: () => {},
  geometryRoughnessFromView: () => {},
  sampleSunShadow: () => {},
  group: {},
} as unknown as TypegpuEnvironment;
test("asynchronous terrain resource errors reject the staged layer and release all resources", async () => {
  vi.mocked(device.popErrorScope).mockResolvedValueOnce({
    message: "terrain allocation failed",
  } as GPUError);
  await expect(
    createTypegpuTerrain(
      device,
      {} as GPUBuffer,
      environment,
      { texture: { createView: () => ({}) } } as never,
      ground,
      null,
    ),
  ).rejects.toThrow("terrain allocation failed");
  expect(state.live.size).toBe(0);
});
