import { texture, draw, frame, initFromDevice, type Draw, type Target } from "vgpu";
import { IMAGE_MIP_WGSL } from "../../../../packages/renderer-core/src/imageMipWgsl";
import type { ImageTextureOptions } from "../../../../packages/renderer-core/src/imageTexture";
import { beginGpuAdmission } from "../gpuAdmission";
import { mipTarget } from "./mipTarget";
/** vgpu owns texture, mip pipelines and Frame submission. Public queue only uploads external pixels. */
export async function createVgpuImageTexture(
  device: GPUDevice,
  image: ImageBitmap,
  options: ImageTextureOptions,
) {
  const gpu = await initFromDevice(device),
    finish = beginGpuAdmission(device);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    gpu.dispose();
  };
  try {
    const { width, height } = image;
    if (
      width < 1 ||
      height < 1 ||
      width > device.limits.maxTextureDimension2D ||
      height > device.limits.maxTextureDimension2D
    )
      throw new Error("Image texture dimensions exceed device limit");
    const format = options.colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm",
      levels = options.generateMipmaps ? Math.floor(Math.log2(Math.max(width, height))) + 1 : 1;
    const imageTexture = texture(gpu, {
      kind: "2d",
      size: [width, height],
      format,
      mipLevelCount: levels,
      usage: ["texture_binding", "copy_dst", "copy_src", "render_attachment"],
    });
    device.queue.copyExternalImageToTexture(
      { source: image, flipY: false },
      { texture: imageTexture.gpu, premultipliedAlpha: false, colorSpace: "srgb" },
      [width, height],
    );
    const stages: { output: Target; render: Draw }[] = [];
    for (let level = 1; level < levels; level++) {
      const output = mipTarget(imageTexture, level),
        render = draw(gpu, {
          shader: IMAGE_MIP_WGSL,
          vertices: 3,
          set: {
            source: imageTexture.gpu.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }),
          },
        });
      await render.compile(output);
      stages.push({ output, render });
    }
    if (stages.length)
      await frame(gpu, (current) => {
        for (const s of stages) current.pass(s.output, s.render);
      }).done;
    await finish();
    return { texture: imageTexture, dispose };
  } catch (error) {
    dispose();
    await finish();
    throw error;
  }
}
