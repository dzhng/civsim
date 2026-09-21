import { decodeRockDetail } from "../../../game-renderer/src/terrain/rockDetail";
import { imageTextureBytes } from "../../../renderer-core/src/imageTexture";
import { createTypegpuImageTexture } from "./imageTexture";

/** One immutable image per terrain scene; layers borrow it across replacements. */
export async function loadTypegpuRockDetail(device: GPUDevice) {
  const bitmap = await decodeRockDetail();
  try {
    const image = await createTypegpuImageTexture(device, bitmap, {
      colorSpace: "linear",
      generateMipmaps: true,
    });
    const mipLevels = Math.floor(Math.log2(Math.max(bitmap.width, bitmap.height))) + 1;
    return {
      ...image,
      stats: {
        width: bitmap.width,
        height: bitmap.height,
        mipLevels,
        bytes: imageTextureBytes(bitmap.width, bitmap.height, mipLevels),
      },
    };
  } finally {
    bitmap.close();
  }
}
export type TypegpuRockDetail = Awaited<ReturnType<typeof loadTypegpuRockDetail>>;
