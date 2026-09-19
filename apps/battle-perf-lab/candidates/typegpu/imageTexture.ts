import { typegpuTextureBytes } from "./textureUpload";
import { tgpu, d } from "typegpu";
import { imageMipBodyWgsl } from "../../../../packages/renderer-core/src/imageMipWgsl";
import type {
  ImageTextureOptions,
  RgbaTextureData,
} from "../../../../packages/renderer-core/src/imageTexture";
import { beginGpuAdmission } from "../../../../packages/battle-renderer/src/gpuAdmission";
const input = tgpu.bindGroupLayout({ source: { texture: d.texture2d() } });
const corners = tgpu.const(d.arrayOf(d.vec2f, 3), [
  d.vec2f(-1, -1),
  d.vec2f(3, -1),
  d.vec2f(-1, 3),
]);
const downsample = tgpu.fn([d.texture2d(), d.vec2f], d.vec4f)(imageMipBodyWgsl);
/** Borrowed device/image; typed texture and all mip passes owned here. */
export async function createTypegpuImageTexture(
  device: GPUDevice,
  image: ImageBitmap | RgbaTextureData,
  options: ImageTextureOptions,
) {
  const root = tgpu.initFromDevice({ device }),
    finish = beginGpuAdmission(device);
  let disposed = false;
  const owned: { destroy(): void }[] = [];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const r of owned) r.destroy();
    root.destroy();
  };
  try {
    const { width, height } = image;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > device.limits.maxTextureDimension2D ||
      height > device.limits.maxTextureDimension2D
    )
      throw new Error("Image texture dimensions exceed device limit");
    if ("data" in image && image.data.byteLength !== width * height * 4)
      throw Error("RGBA texture data must contain exactly four bytes per pixel");
    const format = options.colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm";
    const levels = options.generateMipmaps ? Math.floor(Math.log2(Math.max(width, height))) + 1 : 1;
    const texture = root
      .createTexture({ size: [width, height], format, mipLevelCount: levels })
      .$usage("sampled", "render");
    owned.push(texture);
    if ("data" in image) texture.write(typegpuTextureBytes(image.data));
    else texture.write(image);
    if (levels > 1) {
      const pipeline = root.createRenderPipeline({
        vertex: tgpu.vertexFn({
          in: { index: d.builtin.vertexIndex },
          out: { position: d.builtin.position },
        })(({ index }) => {
          "use gpu";
          return { position: d.vec4f(corners.$[index], 0, 1) };
        }),
        fragment: tgpu
          .fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })(
            `{return downsample(resources.source,in.position.xy);}`,
          )
          .$uses({ downsample, resources: input.$ }),
        targets: { format },
      });
      await pipeline.initAsync();
      const encoder = root["~unstable"].createCommandEncoder();
      for (let level = 1; level < levels; level++) {
        const group = root.createBindGroup(input, {
          source: texture.createView(d.texture2d(), { baseMipLevel: level - 1, mipLevelCount: 1 }),
        });
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: texture.createView("render", { baseMipLevel: level, mipLevelCount: 1 }),
              clearValue: [0, 0, 0, 0],
            },
          ],
        });
        pass.setPipeline(pipeline.with(group));
        pass.draw(3);
        pass.end();
      }
      encoder.submit();
    }
    await finish();
    return { texture, dispose };
  } catch (error) {
    dispose();
    await finish();
    throw error;
  }
}
