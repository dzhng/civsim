/** Control-only accounting on a borrowed device, restored before device teardown. */
export function trackBufferLifetime(device: GPUDevice) {
  const original = device.createBuffer;
  const live = new Set<GPUBuffer>();
  let created = 0;
  device.createBuffer = function (descriptor: GPUBufferDescriptor) {
    const buffer = original.call(device, descriptor);
    const destroy = buffer.destroy;
    live.add(buffer);
    created++;
    buffer.destroy = function () {
      destroy.call(buffer);
      live.delete(buffer);
    };
    return buffer;
  };
  return {
    liveCount: () => live.size,
    createdCount: () => created,
    restore() {
      device.createBuffer = original;
    },
  };
}
