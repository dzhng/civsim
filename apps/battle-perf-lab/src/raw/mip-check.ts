import { tgpu } from "typegpu";
import { createTypegpuImageTexture } from "../../candidates/typegpu/imageTexture";
import { createVgpuImageTexture } from "../vgpu/imageTexture";
import { uploadImageTexture } from "../../../../packages/renderer-core/src/imageTexture";
import { trackTextureLifetime } from "../textureLifetimeCheck";
async function run() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No adapter");
  const device = await adapter.requestDevice();
  const errors: string[] = [];
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const lifetime = trackTextureLifetime(device),
    typed = tgpu.initFromDevice({ device });
  const read = async (t: GPUTexture, mip: number) => {
    const width = Math.max(1, t.width >> mip),
      height = Math.max(1, t.height >> mip),
      row = Math.ceil((width * 4) / 256) * 256,
      b = device.createBuffer({
        size: row * height,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
    try {
      const e = device.createCommandEncoder();
      e.copyTextureToBuffer({ texture: t, mipLevel: mip }, { buffer: b, bytesPerRow: row }, [
        width,
        height,
      ]);
      device.queue.submit([e.finish()]);
      await b.mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(b.getMappedRange()),
        out = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++)
        out.set(bytes.subarray(y * row, y * row + width * 4), y * width * 4);
      return out;
    } finally {
      b.destroy();
    }
  };
  const results = [];
  try {
    for (const colorSpace of ["srgb", "linear"] as const)
      for (const [width, height] of [
        [32, 16],
        [33, 3],
        [1, 17],
        [19, 1],
      ]) {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i++) data[i] = (i * 37 + (i % 7) * 59) % 256;
        const bitmap = await createImageBitmap(new ImageData(data, width, height)),
          options = { colorSpace, generateMipmaps: true };
        const reference = await uploadImageTexture(device, bitmap, options);
        try {
          for (const backend of ["typegpu", "vgpu"] as const) {
            const candidate =
              backend === "typegpu"
                ? await createTypegpuImageTexture(device, bitmap, options)
                : await createVgpuImageTexture(device, bitmap, options);
            try {
              const output =
                "gpu" in candidate.texture
                  ? candidate.texture.gpu
                  : typed.unwrap(candidate.texture);
              let maxDifference = 0;
              const mips = [];
              for (let mip = 0; mip < reference.mipLevelCount; mip++) {
                const a = await read(output, mip),
                  b = await read(reference, mip);
                let max = 0;
                for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
                maxDifference = Math.max(maxDifference, max);
                mips.push({ mip, maxDifference: max });
              }
              results.push({
                backend,
                colorSpace,
                width,
                height,
                mips,
                maxDifference,
                passed: maxDifference <= 1,
              });
            } finally {
              candidate.dispose();
            }
          }
        } finally {
          reference.destroy();
          bitmap.close();
        }
      }
    typed.destroy();
    return {
      results,
      errors,
      liveTextures: lifetime.liveCount(),
      adapter: {
        vendor: adapter.info.vendor,
        architecture: adapter.info.architecture,
        description: adapter.info.description,
      },
      passed: results.every((r) => r.passed) && errors.length === 0 && lifetime.liveCount() === 0,
    };
  } finally {
    typed.destroy();
    lifetime.restore();
    device.destroy();
  }
}
run()
  .then((r) => Object.assign(window, { __mip: r }))
  .catch((e) =>
    Object.assign(window, { __mip: { passed: false, error: String(e), stack: e.stack } }),
  );
