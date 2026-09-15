import { allocationLifetime } from "./allocationLifetime";

/** Requested buffer bytes, not driver allocation size. */
export function trackBufferLifetime(device: GPUDevice, changed?: () => void) {
  const original = device.createBuffer;
  const allocations = allocationLifetime(changed);
  device.createBuffer = function (descriptor: GPUBufferDescriptor) {
    const buffer = original.call(device, descriptor);
    allocations.add(buffer, Number.isSafeInteger(descriptor.size) ? descriptor.size : null);
    return buffer;
  };
  return {
    liveCount: () => allocations.snapshot().liveCount,
    createdCount: () => allocations.snapshot().createdCount,
    snapshot: allocations.snapshot,
    restore() {
      device.createBuffer = original;
    },
  };
}
