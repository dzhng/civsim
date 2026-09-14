/** Control-only accounting of real allocations on the borrowed native device.
 * Restore interception after backend disposal, before the harness destroys the device. */
export function trackTextureLifetime(device: GPUDevice) {
  const original = device.createTexture;
  const live = new Set<GPUTexture>();
  device.createTexture = function (descriptor: GPUTextureDescriptor) {
    const texture = original.call(device, descriptor);
    const destroy = texture.destroy;
    live.add(texture);
    texture.destroy = function () {
      destroy.call(texture);
      live.delete(texture);
    };
    return texture;
  };
  return {
    liveCount: () => live.size,
    restore() {
      device.createTexture = original;
    },
  };
}
