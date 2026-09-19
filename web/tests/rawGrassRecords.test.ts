// @vitest-environment node
import { test, expect, vi } from "vitest";
import { createRawGrass } from "../../packages/battle-renderer/src/world/grass";

test("native grass keeps pipelines stable across grow, shrink, empty and failed record admission", async () => {
  vi.stubGlobal("GPUBufferUsage", {
    STORAGE: 1,
    COPY_DST: 2,
    UNIFORM: 4,
    INDIRECT: 8,
    COPY_SRC: 16,
    VERTEX: 32,
    INDEX: 64,
  });
  vi.stubGlobal("GPUShaderStage", { COMPUTE: 1, VERTEX: 2, FRAGMENT: 4 });
  vi.stubGlobal("GPUColorWrite", { ALL: 15 });
  const allocated: { destroy: ReturnType<typeof vi.fn>; data: ArrayBuffer; size: number }[] = [];
  let fail = false;
  const device = {
    limits: { maxStorageBufferBindingSize: 1e6, maxBufferSize: 1e6 },
    createBuffer: ({ size }: { size: number }) => {
      const b = {
        size,
        data: new ArrayBuffer(size),
        getMappedRange() {
          return this.data;
        },
        unmap() {},
        destroy: vi.fn(),
      };
      allocated.push(b);
      return b;
    },
    createShaderModule: vi.fn(() => ({})),
    createBindGroupLayout: () => ({}),
    createBindGroup: () => ({}),
    createPipelineLayout: () => ({}),
    createComputePipelineAsync: vi.fn(async () => ({})),
    createRenderPipelineAsync: vi.fn(async () => ({})),
    pushErrorScope() {},
    popErrorScope: async () => (fail ? { message: "injected allocation failure" } : null),
    queue: {
      writeBuffer(buffer: { data: ArrayBuffer }, offset: number, source: ArrayBufferView) {
        new Uint8Array(buffer.data, offset, source.byteLength).set(
          new Uint8Array(source.buffer, source.byteOffset, source.byteLength),
        );
      },
    },
  };
  const geometry = { positions: new Float32Array(9), indices: new Uint16Array([0, 1, 2, 0]) };
  const runtime = await createRawGrass(
    device as unknown as GPUDevice,
    {} as GPUBindGroupLayout,
    { shader: "", layout: {}, bindGroup: {} } as never,
    new Float32Array(),
    [geometry, geometry, geometry],
  );
  try {
    const first = new Float32Array(32).fill(3);
    await runtime.updateRecords(first);
    expect(runtime.stats().recordCount).toBe(2);
    const grown = allocated.length;
    await runtime.updateRecords(new Float32Array(16).fill(7));
    expect(allocated.length).toBe(grown);
    expect(runtime.stats().recordCount).toBe(1);
    await runtime.updateRecords(new Float32Array());
    expect(runtime.stats().recordCount).toBe(0);
    fail = true;
    await expect(runtime.updateRecords(new Float32Array(64))).rejects.toThrow(
      "injected allocation failure",
    );
    expect(runtime.stats()).toMatchObject({ recordCount: 0, capacity: 2 });
    expect(device.createComputePipelineAsync).toHaveBeenCalledTimes(2);
    expect(device.createRenderPipelineAsync).toHaveBeenCalledTimes(2);
    fail = false;
    await runtime.updateRecords(first);
    expect(runtime.stats().recordCount).toBe(2);
  } finally {
    runtime.dispose();
    vi.unstubAllGlobals();
  }
  expect(allocated.every((b) => b.destroy.mock.calls.length > 0)).toBe(true);
});
