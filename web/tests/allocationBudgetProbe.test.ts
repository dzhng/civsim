// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  installAllocationBudgetProbe,
  type AllocationProbeDevice,
} from "../scenes/models/_allocation-budget-probe";

function fakeDevice() {
  const destroyed: object[] = [];
  const device = {
    createBuffer(descriptor: GPUBufferDescriptor) {
      return {
        label: descriptor.label ?? "",
        destroy() {
          destroyed.push(this);
        },
      } as GPUBuffer;
    },
    createTexture(descriptor: GPUTextureDescriptor) {
      return {
        label: descriptor.label ?? "",
        format: descriptor.format,
        destroy() {
          destroyed.push(this);
        },
      } as GPUTexture;
    },
    queue: { writeBuffer() {}, writeTexture() {}, copyExternalImageToTexture() {} },
  } satisfies AllocationProbeDevice;
  return { device: device as AllocationProbeDevice, destroyed };
}

test("buffer initialization, overlapping replacement and destruction are phase-correlated", () => {
  const { device, destroyed } = fakeDevice();
  const probe = installAllocationBudgetProbe(device);
  probe.phase("initialization");
  const first = device.createBuffer({ size: 64, usage: 8, mappedAtCreation: true });
  probe.phase("replacement");
  const second = device.createBuffer({ size: 128, usage: 8 });
  first.destroy();
  first.destroy();
  const report = probe.snapshot();
  assert.equal(report.total.bufferCreatedBytes, 192);
  assert.equal(report.total.mappedAtCreationBytes, 64);
  assert.equal(report.total.liveBytes, 128);
  assert.equal(report.total.peakLiveBytes, 192);
  assert.equal(report.total.destroyedResources, 1);
  assert.equal(report.phases.initialization.peakLiveBytes, 64);
  assert.equal(report.phases.replacement.startLiveBytes, 64);
  assert.equal(report.phases.replacement.peakLiveBytes, 192);
  assert.equal(destroyed.length, 2, "observer forwards repeated destroy without counting twice");
  second.destroy();
  assert.equal(probe.snapshot().total.liveBytes, 0);
  probe.dispose();
});

test("buffer upload ranges use typed-array elements but DataView and ArrayBuffer bytes", () => {
  const { device } = fakeDevice();
  const probe = installAllocationBudgetProbe(device);
  const buffer = device.createBuffer({ size: 256, usage: 8 });
  const storage = new ArrayBuffer(128);
  device.queue.writeBuffer(buffer, 0, new Float32Array(storage, 16, 8), 2, 3);
  device.queue.writeBuffer(buffer, 12, new Uint16Array(storage, 20, 8), 2);
  device.queue.writeBuffer(buffer, 24, new DataView(storage, 12, 20), 4, 8);
  device.queue.writeBuffer(buffer, 32, storage, 16, 24);
  device.queue.writeBuffer(buffer, 56, new DataView(storage, 12, 20), 4);
  assert.equal(probe.snapshot().total.writeBufferBytes, 12 + 12 + 8 + 24 + 16);
  assert.equal(probe.snapshot().total.writeBufferCalls, 5);
  probe.dispose();
});

test("texture upload payload excludes row padding and separately records source span", () => {
  const { device } = fakeDevice();
  const probe = installAllocationBudgetProbe(device);
  const texture = device.createTexture({ size: [8, 8, 2], format: "rgba8unorm", usage: 2 });
  device.queue.writeTexture(
    { texture },
    new Uint8Array(2048),
    { offset: 16, bytesPerRow: 256, rowsPerImage: 4 },
    [2, 3, 2],
  );
  device.queue.copyExternalImageToTexture({ source: {} as ImageBitmap }, { texture }, [3, 2]);
  const report = probe.snapshot().total;
  assert.equal(report.writeTextureBytes, 2 * 3 * 2 * 4);
  assert.equal(report.writeTextureSourceSpanBytes, 256 * 4 + 256 * 2 + 8);
  assert.equal(report.externalImageBytes, 3 * 2 * 4);
  assert.equal(report.writeTextureCalls, 1);
  assert.equal(report.externalImageCalls, 1);
  probe.dispose();
});

test("format-aware texture storage includes mip chains, array layers, 3D shrinkage and samples", () => {
  const { device } = fakeDevice();
  const probe = installAllocationBudgetProbe(device);
  const create = (descriptor: Omit<GPUTextureDescriptor, "usage">) =>
    device.createTexture({ ...descriptor, usage: 2 });
  create({ size: [8, 4, 2], format: "rgba8unorm", mipLevelCount: 4 });
  create({
    size: { width: 8, height: 4, depthOrArrayLayers: 4 },
    format: "r16float",
    dimension: "3d",
    mipLevelCount: 4,
  });
  create({ size: [8, 8], format: "bc1-rgba-unorm", mipLevelCount: 4 });
  create({ size: [12, 10], format: "astc-6x5-unorm", mipLevelCount: 1 });
  create({ size: [2, 2], format: "depth32float", sampleCount: 4 });
  create({ size: [2, 2], format: "depth24plus" });
  assert.equal(
    probe.snapshot().total.textureCreatedBytes,
    (32 + 8 + 2 + 1) * 2 * 4 + (128 + 16 + 2 + 1) * 2 + (4 + 1 + 1 + 1) * 8 + 4 * 16 + 4 * 4 * 4,
  );
  assert.equal(probe.snapshot().total.unknownTextureAllocations, 1);
  assert.equal(probe.snapshot().total.createdResources, 6);
  probe.dispose();
});

test("probe exclusions and disposal restore inherited and own methods without destroying assets", () => {
  const { device: original, destroyed } = fakeDevice();
  const device: AllocationProbeDevice = Object.create(original);
  const originalQueueDescriptor = Object.getOwnPropertyDescriptor(device.queue, "writeBuffer");
  const probe = installAllocationBudgetProbe(device);
  const measured = device.createBuffer({ size: 16, usage: 8 });
  const excluded = device.createBuffer({
    size: 1024,
    usage: 8,
    mappedAtCreation: true,
    label: "budget-probe:readback",
  });
  device.queue.writeBuffer(excluded, 0, new Uint8Array(1024));
  const texture = device.createTexture({
    size: [32, 32],
    format: "rgba8unorm",
    usage: 2,
    label: "budget-probe:texture",
  });
  device.queue.writeTexture({ texture }, new Uint8Array(4096), {}, [32, 32]);
  device.queue.copyExternalImageToTexture({ source: {} as ImageBitmap }, { texture }, [32, 32]);
  excluded.destroy();
  texture.destroy();
  const before = probe.snapshot();
  assert.equal(before.total.createdResources, 1);
  assert.equal(before.total.bufferCreatedBytes, 16);
  assert.equal(before.total.textureCreatedBytes, 0);
  assert.equal(
    before.total.writeBufferBytes +
      before.total.writeTextureBytes +
      before.total.externalImageBytes,
    0,
  );
  probe.dispose();
  probe.dispose();
  assert.equal(destroyed.length, 2, "disposal must not destroy application resources");
  assert.equal(Object.hasOwn(device, "createBuffer"), false);
  assert.equal(Object.hasOwn(device, "createTexture"), false);
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(device.queue, "writeBuffer"),
    originalQueueDescriptor,
  );
  measured.destroy();
  assert.deepEqual(
    probe.snapshot(),
    before,
    "disposal stops observation including existing resource wrappers",
  );
  assert.throws(() => probe.phase("late"), /disposed/);
});

test("synchronous API failures are forwarded and failed installation restores prior wrappers", () => {
  const { device } = fakeDevice();
  device.queue.writeBuffer = () => {
    throw new Error("rejected upload");
  };
  const probe = installAllocationBudgetProbe(device);
  const buffer = device.createBuffer({ size: 16, usage: 8 });
  assert.throws(() => device.queue.writeBuffer(buffer, 0, new Uint8Array(16)), /rejected upload/);
  assert.equal(probe.snapshot().total.writeBufferCalls, 0);
  probe.dispose();
  const originalBuffer = device.createBuffer;
  Object.defineProperty(device, "createTexture", { configurable: false });
  assert.throws(() => installAllocationBudgetProbe(device), TypeError);
  assert.equal(device.createBuffer, originalBuffer);
});
