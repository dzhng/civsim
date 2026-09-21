import { trackBufferLifetime } from "./bufferLifetimeCheck";
import { trackTextureLifetime } from "./textureLifetimeCheck";

/** Install before telemetry and backend construction. Observes public creation
 * and explicit destroy only: excludes imported/swapchain resources, driver
 * overhead and deferred reclamation. This is not physical VRAM usage. */
export function trackNativeGpuAllocations(device: GPUDevice) {
  let peakBytes = 0;
  let everUnknown = false;
  const changed = () => {
    const current = currentBytes();
    if (current === null) everUnknown = true;
    else peakBytes = Math.max(peakBytes, current);
  };
  const buffers = trackBufferLifetime(device, changed);
  const textures = trackTextureLifetime(device, changed);
  function currentBytes() {
    const b = buffers.snapshot().currentBytes;
    const t = textures.snapshot().currentBytes;
    return b === null || t === null ? null : b + t;
  }
  return {
    snapshot() {
      return {
        buffers: buffers.snapshot(),
        textures: textures.snapshot(),
        currentBytes: currentBytes(),
        peakBytes: everUnknown ? null : peakBytes,
      };
    },
    restore() {
      textures.restore();
      buffers.restore();
    },
  };
}
