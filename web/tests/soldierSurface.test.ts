// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import * as THREE from "three/webgpu";
import { prepareSoldierSurface } from "@packages/soldier-assets/bake/impostors/soldierSurface";
import { uploadImageTexture } from "@packages/renderer-core/src/imageTexture";
import type { SoldierSurface } from "@packages/soldier-assets/src/material";

// Only the upload is faked; the module's byte accounting is the real one.
vi.mock("@packages/renderer-core/src/imageTexture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@packages/renderer-core/src/imageTexture")>()),
  uploadImageTexture: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(uploadImageTexture).mockReset();
});

const sampler = {
  magFilter: "nearest",
  minFilter: "linear",
  mipmapFilter: "nearest",
  wrapS: "mirror-repeat",
  wrapT: "clamp-to-edge",
} as const;
function source(): SoldierSurface {
  const image = { image: new Uint8Array([1]), mimeType: "image/png" as const, sampler };
  return {
    materials: [
      {
        name: "fixture",
        baseColor: [1, 1, 1, 1],
        roughness: 0.8,
        metallic: 0.2,
        textures: { baseColor: true, normal: true },
      },
    ],
    textures: { baseColor: image, normal: image },
  };
}
const renderer = { backend: { device: {} } } as unknown as THREE.WebGPURenderer;

test.each(["decode", "upload"])(
  "world disposal during image %s stops further preparation and releases acquired resources",
  async (stage) => {
    let disposed = false;
    const bitmap = { close: vi.fn() };
    const decode = vi.fn().mockImplementation(async () => {
      if (stage === "decode") disposed = true;
      return bitmap;
    });
    vi.stubGlobal("createImageBitmap", decode);
    const gpu = { width: 8, height: 4, mipLevelCount: 4, destroy: vi.fn() };
    vi.mocked(uploadImageTexture).mockImplementation(async () => {
      if (stage === "upload") disposed = true;
      return gpu as unknown as GPUTexture;
    });
    const tableDispose = vi.spyOn(THREE.DataTexture.prototype, "dispose");
    await expect(
      prepareSoldierSurface(renderer, source(), () => {
        if (disposed) throw new Error("battle world disposed");
      }),
    ).rejects.toThrow("battle world disposed");
    expect(decode).toHaveBeenCalledTimes(1);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(uploadImageTexture).toHaveBeenCalledTimes(stage === "decode" ? 0 : 1);
    expect(gpu.destroy).toHaveBeenCalledTimes(stage === "upload" ? 1 : 0);
    expect(tableDispose).toHaveBeenCalledTimes(1);
  },
);

test("prepared surfaces preserve declared sampling and own GPU images independently of wrappers", async () => {
  const bitmaps = [{ close: vi.fn() }, { close: vi.fn() }];
  const decode = vi.fn().mockResolvedValueOnce(bitmaps[0]).mockResolvedValueOnce(bitmaps[1]);
  vi.stubGlobal("createImageBitmap", decode);
  const gpu = [0, 1].map(() => ({ width: 8, height: 4, mipLevelCount: 4, destroy: vi.fn() }));
  vi.mocked(uploadImageTexture)
    .mockResolvedValueOnce(gpu[0] as unknown as GPUTexture)
    .mockResolvedValueOnce(gpu[1] as unknown as GPUTexture);
  const prepared = await prepareSoldierSurface(renderer, source());
  expect(decode.mock.calls[0][1]).toEqual({
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
    imageOrientation: "none",
  });
  expect(vi.mocked(uploadImageTexture).mock.calls.map((call) => call[2])).toEqual([
    { colorSpace: "srgb", generateMipmaps: true },
    { colorSpace: "linear", generateMipmaps: true },
  ]);
  expect(prepared.images.baseColor?.colorSpace).toBe(THREE.SRGBColorSpace);
  expect(prepared.images.normal?.colorSpace).toBe(THREE.NoColorSpace);
  expect(prepared.images.baseColor?.minFilter).toBe(THREE.LinearMipmapNearestFilter);
  expect(prepared.images.baseColor?.magFilter).toBe(THREE.NearestFilter);
  expect(prepared.images.baseColor?.wrapS).toBe(THREE.MirroredRepeatWrapping);
  expect(prepared.images.baseColor?.wrapT).toBe(THREE.ClampToEdgeWrapping);
  for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledTimes(1);
  prepared.images.baseColor!.dispose();
  expect(gpu[0].destroy).not.toHaveBeenCalled();
  prepared.dispose();
  prepared.dispose();
  for (const image of gpu) expect(image.destroy).toHaveBeenCalledTimes(1);
});

test.each(["decode", "upload"])(
  "a later %s failure closes bitmaps and rolls back prior GPU ownership",
  async (failure) => {
    const first = { close: vi.fn() },
      second = { close: vi.fn() };
    const decode = vi.fn().mockResolvedValueOnce(first);
    if (failure === "decode") decode.mockRejectedValueOnce(new Error("broken image decode"));
    else decode.mockResolvedValueOnce(second);
    vi.stubGlobal("createImageBitmap", decode);
    const gpu = { width: 8, height: 4, mipLevelCount: 4, destroy: vi.fn() };
    vi.mocked(uploadImageTexture)
      .mockResolvedValueOnce(gpu as unknown as GPUTexture)
      .mockRejectedValueOnce(new Error("broken image upload"));
    const tableDispose = vi.spyOn(THREE.DataTexture.prototype, "dispose");
    await expect(prepareSoldierSurface(renderer, source())).rejects.toThrow(
      `broken image ${failure}`,
    );
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).toHaveBeenCalledTimes(failure === "upload" ? 1 : 0);
    expect(gpu.destroy).toHaveBeenCalledTimes(1);
    expect(tableDispose).toHaveBeenCalledTimes(1);
  },
);
