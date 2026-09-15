// Shared numerical-control attachments; candidate runtimes borrow them.
export function nativeTarget(device: GPUDevice, size: readonly [number, number], samples: 1 | 4) {
  const owned: GPUTexture[] = [];
  const dispose = () => owned.forEach((texture) => texture.destroy());
  try {
    const create = (descriptor: GPUTextureDescriptor) => {
      const texture = device.createTexture(descriptor);
      owned.push(texture);
      return texture;
    };
    const color = create({
      size: [...size],
      format: "rgba16float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING,
    });
    const multisampled =
      samples === 4
        ? create({
            size: [...size],
            sampleCount: samples,
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
          })
        : null;
    const depth = create({
      size: [...size],
      sampleCount: samples,
      format: "depth32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    return {
      color,
      dispose,
      attachments: {
        color: (multisampled ?? color).createView(),
        resolveTarget: multisampled ? color.createView() : undefined,
        depth: depth.createView(),
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
