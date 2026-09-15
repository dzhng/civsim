import { allocationLifetime } from "./allocationLifetime";
import { textureAllocationBytes } from "./textureAllocationBytes";

/** Restore after backend disposal, before destroying the borrowed device. */
export function trackTextureLifetime(device: GPUDevice, changed?: () => void) {
  const original = device.createTexture;
  const allocations = allocationLifetime(changed);
  device.createTexture = function (descriptor: GPUTextureDescriptor) {
    const texture = original.call(device, descriptor);
    allocations.add(
      texture,
      textureAllocationBytes({
        ...descriptor,
        size: {
          width: texture.width,
          height: texture.height,
          depthOrArrayLayers: texture.depthOrArrayLayers,
        },
      }),
    );
    return texture;
  };
  return {
    liveCount: () => allocations.snapshot().liveCount,
    snapshot: allocations.snapshot,
    restore() {
      device.createTexture = original;
    },
  };
}
