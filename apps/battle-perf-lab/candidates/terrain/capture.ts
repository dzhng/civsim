import { DataUtils } from "three/webgpu";
import { RawBattlePost } from "../../src/raw/post";
import {
  gradeStrengthForPreset,
  GRADE_SATURATION_BOOST,
  GRADE_CONTRAST,
  GRADE_SPLIT_TONE,
  GRADE_SHADOW_LIFT,
} from "../../../../packages/game-renderer/src/environment/postParameters";
import type { CivsimEnvironmentId } from "../../../../packages/game-renderer/src/environment/environment";

/** Diagnostic images use the already-controlled native post for both HDR arrays.
 * Numerical parity is checked before this common display transform. */
export async function captureHdr(
  device: GPUDevice,
  pixels: number[],
  width: number,
  height: number,
  preset: CivsimEnvironmentId,
  exposure: number,
) {
  const input = device.createTexture({
    size: [width, height],
    format: "rgba16float",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const output = device.createTexture({
    size: [width, height],
    format: "rgba8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
  const readback = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const post = new RawBattlePost(device, input.createView(), width, height);
  try {
    device.queue.writeTexture(
      { texture: input },
      Uint16Array.from(pixels, DataUtils.toHalfFloat),
      { bytesPerRow: width * 8 },
      [width, height],
    );
    post.setGrade(
      {
        strength: gradeStrengthForPreset(preset),
        saturationBoost: GRADE_SATURATION_BOOST,
        contrast: GRADE_CONTRAST,
        splitTone: GRADE_SPLIT_TONE,
        shadowLift: GRADE_SHADOW_LIFT,
      },
      exposure,
    );
    const encoder = device.createCommandEncoder();
    post.encode(encoder, output.createView(), true);
    encoder.copyTextureToBuffer({ texture: output }, { buffer: readback, bytesPerRow }, [
      width,
      height,
    ]);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const padded = new Uint8Array(readback.getMappedRange());
    const pixels8 = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      pixels8.set(padded.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.putImageData(new ImageData(pixels8, width, height), 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    post.dispose();
    input.destroy();
    output.destroy();
    readback.destroy();
  }
}
