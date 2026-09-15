import type * as THREE from "three/webgpu";

export async function captureMipChain(
  renderer: THREE.WebGPURenderer,
  texture: THREE.Texture,
): Promise<Uint8Array[]> {
  // Control-only readback: the native renderer never depends on Three backend resources.
  const backend = renderer.backend as unknown as {
    device: GPUDevice;
    get(texture: THREE.Texture): { texture: GPUTexture };
  };
  const native = backend.get(texture).texture,
    result: Uint8Array[] = [];
  for (let mip = 0; mip < native.mipLevelCount; mip++) {
    const width = Math.max(1, native.width >> mip),
      height = Math.max(1, native.height >> mip),
      stride = Math.ceil((width * 4) / 256) * 256;
    const buffer = backend.device.createBuffer({
      size: stride * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    try {
      const encoder = backend.device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture: native, mipLevel: mip },
        { buffer, bytesPerRow: stride },
        [width, height],
      );
      backend.device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(buffer.getMappedRange()),
        bytes = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++)
        bytes.set(mapped.subarray(y * stride, y * stride + width * 4), y * width * 4);
      result.push(bytes);
    } finally {
      buffer.destroy();
    }
  }
  return result;
}
