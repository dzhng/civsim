// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import * as THREE from "three/webgpu";
import { prepareSoldierSurface } from "@packages/soldier-assets/bake/impostors/soldierSurface";
import { createSoldierImageOwner } from "@packages/soldier-assets/bake/impostors/soldierImages";
import { uploadImageTexture } from "@packages/renderer-core/src/imageTexture";
import type { SoldierSampler, SoldierSurface } from "@packages/soldier-assets/src/material";

// Only the upload is faked; the module's byte accounting is the real one, so
// the reported payload is not a second copy of the formula.
vi.mock("@packages/renderer-core/src/imageTexture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@packages/renderer-core/src/imageTexture")>()),
  uploadImageTexture: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(uploadImageTexture).mockReset();
});

const sampler: SoldierSampler = {
  magFilter: "linear",
  minFilter: "linear",
  mipmapFilter: "linear",
  wrapS: "repeat",
  wrapT: "repeat",
};
/** What the asset loader produces: one buffer behind every copy of an image. */
const loadedImage = new Uint8Array([7, 7, 7]);
const renderer = { backend: { device: {} } } as unknown as THREE.WebGPURenderer;

function appearance(name: string, roughness: number): SoldierSurface {
  return {
    materials: [
      { name, baseColor: [1, 1, 1, 1], roughness, metallic: 0, textures: { baseColor: true } },
    ],
    textures: { baseColor: { image: loadedImage, mimeType: "image/png", sampler } },
  };
}

/** Each upload answers with its own GPU texture, so double-allocation is visible. */
function stubDevice() {
  const bitmaps: { close: ReturnType<typeof vi.fn> }[] = [];
  const uploaded: {
    width: number;
    height: number;
    mipLevelCount: number;
    destroy: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => {
      const bitmap = { close: vi.fn() };
      bitmaps.push(bitmap);
      return bitmap;
    }),
  );
  vi.mocked(uploadImageTexture).mockImplementation(async () => {
    const gpu = { width: 8, height: 4, mipLevelCount: 4, destroy: vi.fn() };
    uploaded.push(gpu);
    return gpu as unknown as GPUTexture;
  });
  return { bitmaps, uploaded };
}

test("appearances sharing loaded image bytes bind one GPU image and keep their own tables", async () => {
  const gpu = stubDevice();
  const owner = createSoldierImageOwner();
  const first = await prepareSoldierSurface(renderer, appearance("a", 0.2), undefined, owner);
  const second = await prepareSoldierSurface(renderer, appearance("b", 0.9), undefined, owner);

  expect(gpu.uploaded).toHaveLength(1);
  expect(gpu.bitmaps).toHaveLength(1);
  expect(second.images.baseColor).toBe(first.images.baseColor);
  expect(second.table).not.toBe(first.table);
  expect(second.table.image.data).not.toEqual(first.table.image.data);
  expect(owner.stats()).toEqual({
    allocated: [
      { channel: "baseColor", width: 8, height: 4, mipLevels: 4, bytes: 172, references: 2 },
    ],
    allocatedImages: 1,
    allocatedBytes: 172,
    references: 2,
    referencedBytes: 344,
  });
});

test("images differing in color space, mip policy or sampling are allocated separately", async () => {
  const gpu = stubDevice();
  const owner = createSoldierImageOwner();
  const variants: SoldierSurface[] = [
    // Same bytes read as a linear channel: a different upload format.
    {
      materials: [{ name: "n", baseColor: [1, 1, 1, 1], roughness: 1, metallic: 0 }],
      textures: { normal: { image: loadedImage, mimeType: "image/png", sampler } },
    },
    // Same bytes and channel, no mip chain.
    {
      materials: [{ name: "flat", baseColor: [1, 1, 1, 1], roughness: 1, metallic: 0 }],
      textures: {
        baseColor: {
          image: loadedImage,
          mimeType: "image/png",
          sampler: { ...sampler, mipmapFilter: "none" },
        },
      },
    },
    // Same bytes, channel and mip policy, different wrapping.
    {
      materials: [{ name: "clamped", baseColor: [1, 1, 1, 1], roughness: 1, metallic: 0 }],
      textures: {
        baseColor: {
          image: loadedImage,
          mimeType: "image/png",
          sampler: { ...sampler, wrapS: "clamp-to-edge" },
        },
      },
    },
  ];
  const prepared = [await prepareSoldierSurface(renderer, appearance("a", 0.2), undefined, owner)];
  for (const variant of variants)
    prepared.push(await prepareSoldierSurface(renderer, variant, undefined, owner));

  expect(gpu.uploaded).toHaveLength(4);
  expect(vi.mocked(uploadImageTexture).mock.calls.map((call) => call[2])).toEqual([
    { colorSpace: "srgb", generateMipmaps: true },
    { colorSpace: "linear", generateMipmaps: true },
    { colorSpace: "srgb", generateMipmaps: false },
    { colorSpace: "srgb", generateMipmaps: true },
  ]);
  expect(prepared[3].images.baseColor?.wrapS).toBe(THREE.ClampToEdgeWrapping);
  expect(prepared[0].images.baseColor?.wrapS).toBe(THREE.RepeatWrapping);
  expect(owner.stats().allocatedImages).toBe(4);
  expect(owner.stats().references).toBe(4);
});

test("a shared image survives one holder's disposal and is destroyed once by the last", async () => {
  const gpu = stubDevice();
  const owner = createSoldierImageOwner();
  const first = await prepareSoldierSurface(renderer, appearance("a", 0.2), undefined, owner);
  const second = await prepareSoldierSurface(renderer, appearance("b", 0.9), undefined, owner);

  first.dispose();
  first.dispose();
  expect(gpu.uploaded[0].destroy).not.toHaveBeenCalled();
  expect(owner.stats()).toMatchObject({ allocatedImages: 1, references: 1 });

  second.dispose();
  second.dispose();
  expect(gpu.uploaded[0].destroy).toHaveBeenCalledTimes(1);
  expect(owner.stats()).toMatchObject({ allocatedImages: 0, allocatedBytes: 0, references: 0 });
});

test("a reload's owner allocates its own images while the outgoing ones stay valid", async () => {
  const gpu = stubDevice();
  const staged = createSoldierImageOwner();
  const live = createSoldierImageOwner();
  const current = await prepareSoldierSurface(renderer, appearance("a", 0.2), undefined, live);
  const replacement = await prepareSoldierSurface(
    renderer,
    appearance("a", 0.2),
    undefined,
    staged,
  );

  expect(gpu.uploaded).toHaveLength(2);
  expect(replacement.images.baseColor).not.toBe(current.images.baseColor);

  current.dispose();
  expect(gpu.uploaded[0].destroy).toHaveBeenCalledTimes(1);
  expect(gpu.uploaded[1].destroy).not.toHaveBeenCalled();
  expect(staged.stats()).toMatchObject({ allocatedImages: 1, references: 1 });
});

test("a failed admission retains no image and leaves the owner able to retry", async () => {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ close: vi.fn() })),
  );
  const gpu = { width: 8, height: 4, mipLevelCount: 4, destroy: vi.fn() };
  vi.mocked(uploadImageTexture)
    .mockRejectedValueOnce(new Error("out of memory"))
    .mockResolvedValueOnce(gpu as unknown as GPUTexture);
  const owner = createSoldierImageOwner();

  await expect(
    prepareSoldierSurface(renderer, appearance("a", 0.2), undefined, owner),
  ).rejects.toThrow("out of memory");
  expect(owner.stats()).toMatchObject({ allocatedImages: 0, references: 0 });

  const retried = await prepareSoldierSurface(renderer, appearance("a", 0.2), undefined, owner);
  expect(retried.images.baseColor).toBeDefined();
  expect(owner.stats()).toMatchObject({ allocatedImages: 1, references: 1 });
  retried.dispose();
  expect(gpu.destroy).toHaveBeenCalledTimes(1);
});

test("cancellation during a shared load leaves the owner empty for the next preparation", async () => {
  const gpu = stubDevice();
  const owner = createSoldierImageOwner();
  let disposed = false;
  await expect(
    prepareSoldierSurface(
      renderer,
      appearance("a", 0.2),
      () => {
        if (disposed) throw new Error("battle world disposed");
        disposed = true;
      },
      owner,
    ),
  ).rejects.toThrow("battle world disposed");

  expect(gpu.uploaded).toHaveLength(0);
  expect(gpu.bitmaps[0].close).toHaveBeenCalledTimes(1);
  expect(owner.stats()).toMatchObject({ allocatedImages: 0, references: 0 });
});
