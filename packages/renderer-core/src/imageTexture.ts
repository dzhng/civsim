import { IMAGE_MIP_WGSL } from "./imageMipWgsl";
/** Image values are sampled in linear light; only base-color images use sRGB. */
export interface ImageTextureOptions {
  colorSpace: "srgb" | "linear";
  generateMipmaps: boolean;
}

/**
 * Prepare an immutable, caller-owned GPU texture. The caller also retains
 * ownership of image and may close it after this promise settles. No decoding,
 * resizing, CPU readback, or sampler policy belongs to this upload boundary.
 */
export async function uploadImageTexture(
  device: GPUDevice,
  image: ImageBitmap,
  options: ImageTextureOptions,
): Promise<GPUTexture> {
  const { width, height } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("Image texture requires a nonempty, open ImageBitmap");
  }
  const limit = device.limits.maxTextureDimension2D;
  if (width > limit || height > limit) {
    throw new Error(`Image texture ${width}x${height} exceeds maxTextureDimension2D=${limit}`);
  }
  const format: GPUTextureFormat = options.colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm";
  const mipLevelCount = options.generateMipmaps
    ? Math.floor(Math.log2(Math.max(width, height))) + 1
    : 1;
  device.pushErrorScope("out-of-memory");
  device.pushErrorScope("internal");
  device.pushErrorScope("validation");
  let texture: GPUTexture | undefined;
  let synchronousError: unknown;
  let failed = false;
  try {
    texture = device.createTexture({
      label: "image-texture",
      size: [width, height],
      mipLevelCount,
      format,
      usage:
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture(
      { source: image, flipY: false },
      { texture, premultipliedAlpha: false, colorSpace: "srgb" },
      [width, height],
    );
    if (mipLevelCount > 1) {
      const module = device.createShaderModule({
        label: "image-mip-area-mean",
        code: IMAGE_MIP_WGSL,
      });
      const pipeline = device.createRenderPipeline({
        label: "image-mip-area-mean",
        layout: "auto",
        vertex: { module, entryPoint: "vs" },
        fragment: { module, entryPoint: "fs", targets: [{ format }] },
      });
      const encoder = device.createCommandEncoder({ label: "image-mip-chain" });
      for (let level = 1; level < mipLevelCount; level++) {
        const input = texture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 });
        const output = texture.createView({ baseMipLevel: level, mipLevelCount: 1 });
        const bindings = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: input }],
        });
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: output,
              loadOp: "clear",
              storeOp: "store",
              clearValue: [0, 0, 0, 0],
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindings);
        pass.draw(3);
        pass.end();
      }
      device.queue.submit([encoder.finish()]);
    }
  } catch (error) {
    synchronousError = error;
    failed = true;
  }
  // Pop synchronously, before yielding: concurrent frame work must not enter
  // this upload's admission scopes. All scopes settle even if one rejects.
  const admission = await Promise.allSettled([
    device.popErrorScope(),
    device.popErrorScope(),
    device.popErrorScope(),
  ]);
  const errors = admission.flatMap((result) =>
    result.status === "rejected"
      ? [String(result.reason)]
      : result.value
        ? [result.value.message]
        : [],
  );
  if (failed || errors.length) {
    texture?.destroy();
    throw new Error(
      `Image texture preparation failed: ${[
        ...(failed ? [String(synchronousError)] : []),
        ...errors,
      ].join("; ")}`,
      { cause: synchronousError },
    );
  }
  return texture!;
}
