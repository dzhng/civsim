import { beforeEach, expect, test, vi } from "vitest";
import { FrameBudgetProbe } from "../scenes/models/_frame-budget-probe";

beforeEach(() => {
  vi.stubGlobal("GPUBufferUsage", { QUERY_RESOLVE: 512, COPY_SRC: 4, COPY_DST: 8, MAP_READ: 1 });
  vi.stubGlobal("GPUMapMode", { READ: 1 });
});

function fakeDevice() {
  const pending: { resolve: () => void; reject: (error: Error) => void; data: BigUint64Array }[] =
    [];
  const resources: { destroy: ReturnType<typeof vi.fn> }[] = [];
  const submissions: unknown[] = [];
  const device = {
    features: new Set(["timestamp-query"]),
    createShaderModule: vi.fn(),
    createComputePipeline: vi.fn(),
    createQuerySet: () => {
      const query = { destroy: vi.fn() };
      resources.push(query);
      return query;
    },
    createBuffer: () => {
      const data = new BigUint64Array([100n, 2_000_100n]);
      const buffer = {
        destroy: vi.fn(),
        unmap: vi.fn(),
        mapState: "unmapped",
        getMappedRange: () => data.buffer,
        mapAsync: () =>
          new Promise<void>((resolve, reject) => {
            buffer.mapState = "pending";
            pending.push({
              data,
              resolve: () => {
                buffer.mapState = "mapped";
                resolve();
              },
              reject,
            });
          }),
      };
      resources.push(buffer);
      return buffer;
    },
    createCommandEncoder: () => ({
      beginComputePass: (descriptor: unknown) => ({
        end: () => submissions.push(descriptor),
        setPipeline: vi.fn(),
        dispatchWorkgroups: vi.fn(),
      }),
      resolveQuerySet: vi.fn(),
      copyBufferToBuffer: vi.fn(),
      finish: () => ({}),
    }),
    queue: { submit: vi.fn() },
  };
  return { device: device as unknown as GPUDevice, pending, resources, submissions };
}

test("delayed readbacks retain frame identity and a saturated ring still draws", async () => {
  const gpu = fakeDevice();
  const probe = new FrameBudgetProbe(gpu.device, 2);
  const draws: number[] = [];
  probe.measure(10, () => draws.push(10));
  probe.measure(11, () => draws.push(11));
  probe.measure(12, () => draws.push(12));
  expect(draws).toEqual([10, 11, 12]);
  expect(probe.takeResults()).toEqual([{ frameId: 12, status: "dropped" }]);
  gpu.pending[1].data[1] = 5_000_100n;
  gpu.pending[1].resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(probe.takeResults()).toEqual([{ frameId: 11, status: "measured", gpuQueueMs: 5 }]);
  gpu.pending[0].resolve();
  await probe.drain();
  expect(probe.takeResults()).toEqual([{ frameId: 10, status: "measured", gpuQueueMs: 2 }]);
  probe.dispose();
  expect(gpu.resources.every((r) => r.destroy.mock.calls.length === 1)).toBe(true);
});

test("a synchronous map failure releases its slot instead of turning later frames into drops", async () => {
  const gpu = fakeDevice();
  const create = gpu.device.createBuffer.bind(gpu.device);
  gpu.device.createBuffer = (descriptor) => {
    const buffer = create(descriptor);
    if (descriptor.usage & GPUBufferUsage.MAP_READ) {
      const map = buffer.mapAsync.bind(buffer);
      buffer.mapAsync = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error("map failed");
        })
        .mockImplementation(map);
    }
    return buffer;
  };
  const probe = new FrameBudgetProbe(gpu.device, 1);
  probe.measure(0, () => {});
  await probe.drain();
  expect(probe.takeResults()).toEqual([
    { frameId: 0, status: "error", message: "Error: map failed" },
  ]);
  probe.measure(1, () => {});
  expect(gpu.pending).toHaveLength(1);
  gpu.pending[0].resolve();
  await probe.drain();
  expect(probe.takeResults()).toEqual([{ frameId: 1, status: "measured", gpuQueueMs: 2 }]);
  probe.dispose();
});

test("failed or invalid readbacks never publish the preceding successful duration", async () => {
  const gpu = fakeDevice();
  const probe = new FrameBudgetProbe(gpu.device, 1);
  probe.measure(0, () => {});
  gpu.pending[0].resolve();
  await probe.drain();
  probe.takeResults();
  probe.measure(1, () => {});
  gpu.pending[1].reject(new Error("lost"));
  await probe.drain();
  expect(probe.takeResults()).toEqual([{ frameId: 1, status: "error", message: "Error: lost" }]);
  probe.measure(2, () => {});
  gpu.pending[2].data[1] = 0n;
  gpu.pending[2].resolve();
  await probe.drain();
  expect(probe.takeResults()).toEqual([
    { frameId: 2, status: "error", message: "Error: Invalid frame GPU timestamps" },
  ]);
  probe.dispose();
});

test("disposal cancels publication without destroying a resource twice", async () => {
  const gpu = fakeDevice();
  const probe = new FrameBudgetProbe(gpu.device, 1);
  probe.measure(4, () => {});
  probe.dispose();
  probe.dispose();
  gpu.pending[0].resolve();
  await probe.drain();
  expect(probe.takeResults()).toEqual([
    { frameId: 4, status: "error", message: "Error: Frame budget probe disposed during readback" },
  ]);
  expect(gpu.resources.every((r) => r.destroy.mock.calls.length === 1)).toBe(true);
  expect(() => probe.measure(5, () => {})).toThrow("disposed");
});

test("partial construction failure releases every previously created resource", () => {
  const gpu = fakeDevice();
  const create = gpu.device.createBuffer.bind(gpu.device);
  gpu.device.createBuffer = vi
    .fn()
    .mockImplementationOnce(create)
    .mockImplementationOnce(() => {
      throw new Error("allocation failed");
    });
  expect(() => new FrameBudgetProbe(gpu.device, 2)).toThrow("allocation failed");
  expect(gpu.resources).toHaveLength(2);
  expect(gpu.resources.every((r) => r.destroy.mock.calls.length === 1)).toBe(true);
});

test("submission failure preserves drawing and callback failure propagates with its original frame", () => {
  const gpu = fakeDevice();
  const probe = new FrameBudgetProbe(gpu.device, 1);
  const draw = vi.fn();
  vi.mocked(gpu.device.queue.submit).mockImplementationOnce(() => {
    throw new Error("submit failed");
  });
  probe.measure(0, draw);
  expect(draw).toHaveBeenCalledTimes(1);
  expect(probe.takeResults()).toEqual([
    { frameId: 0, status: "error", message: "Error: submit failed" },
  ]);
  expect(() =>
    probe.measure(1, () => {
      throw new Error("draw failed");
    }),
  ).toThrow("draw failed");
  expect(probe.takeResults()).toEqual([
    { frameId: 1, status: "error", message: "Error: draw failed" },
  ]);
  expect(() => probe.measure(1, draw)).toThrow("increase strictly");
  probe.dispose();
});

test("both timestamp brackets surround the synchronous frame submission", async () => {
  const gpu = fakeDevice();
  const probe = new FrameBudgetProbe(gpu.device, 1);
  probe.measure(0, () => gpu.submissions.push("frame"));
  expect(gpu.submissions).toEqual([
    { timestampWrites: { querySet: gpu.resources[0], beginningOfPassWriteIndex: 0 } },
    "frame",
    { timestampWrites: { querySet: gpu.resources[0], endOfPassWriteIndex: 1 } },
  ]);
  gpu.pending[0].resolve();
  await probe.drain();
  probe.dispose();
});

test("a backend that elides empty passes still writes both frame timestamps", async () => {
  const gpu = fakeDevice();
  let dispatches = 0;
  const encode = gpu.device.createCommandEncoder.bind(gpu.device);
  gpu.device.createCommandEncoder = (descriptor) => {
    const encoder = encode(descriptor);
    const begin = encoder.beginComputePass.bind(encoder);
    encoder.beginComputePass = (passDescriptor) => ({
      ...begin(passDescriptor),
      setPipeline: () => {},
      dispatchWorkgroups: () => {
        dispatches++;
      },
    });
    return encoder;
  };
  const probe = new FrameBudgetProbe(gpu.device, 1);
  probe.measure(0, () => {});
  if (dispatches !== 2) gpu.pending[0].data.fill(0n);
  gpu.pending[0].resolve();
  await probe.drain();
  expect(probe.takeResults()).toEqual([{ frameId: 0, status: "measured", gpuQueueMs: 2 }]);
  probe.dispose();
});
