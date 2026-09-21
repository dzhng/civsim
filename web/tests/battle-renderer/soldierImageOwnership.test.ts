// @vitest-environment node
import { vi, test, expect, afterEach } from "vitest";
// The uploader is the boundary this owner borrows, so it is mocked: what these
// suites measure is how many decodes and GPU images the owner actually asked
// for, and that each one is destroyed exactly once. Real allocation on a device
// is captured by the root's hardware run, not here.
vi.mock("../../../packages/battle-renderer/src/world/imageTexture", () => ({
  createTypegpuImageTexture: vi.fn(),
}));
import { createTypegpuImageTexture } from "../../../packages/battle-renderer/src/world/imageTexture";
import { createTypegpuSoldierImageOwner } from "../../../packages/battle-renderer/src/world/soldierImages";
import type { SoldierSampler, SoldierSurface } from "../../../packages/soldier-assets/src/material";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(createTypegpuImageTexture).mockReset();
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
const device = {} as GPUDevice;
const otherDevice = {} as GPUDevice;

/** Two appearances of the same baked texture with their own material tables. */
function appearance(name: string, roughness: number): SoldierSurface {
  return {
    materials: [
      { name, baseColor: [1, 1, 1, 1], roughness, metallic: 0, textures: { baseColor: true } },
    ],
    textures: { baseColor: { image: loadedImage, mimeType: "image/png", sampler } },
  };
}

type Uploaded = Awaited<ReturnType<typeof createTypegpuImageTexture>>;

/** Each upload answers with its own GPU image, so double-allocation is visible. */
function stubUploads(held?: Promise<void>) {
  const bitmaps: { close: ReturnType<typeof vi.fn> }[] = [];
  const decoded: unknown[] = [];
  vi.stubGlobal(
    "ImageData",
    class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    },
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (source: unknown) => {
      decoded.push(source);
      const bitmap = { close: vi.fn() };
      bitmaps.push(bitmap);
      return bitmap;
    }),
  );
  const images: { texture: object; dispose: ReturnType<typeof vi.fn> }[] = [];
  vi.mocked(createTypegpuImageTexture).mockImplementation(async (_device, _image, options) => {
    await held;
    const image = {
      texture: {
        props: {
          size: [8, 4],
          format: options.colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm",
          mipLevelCount: options.generateMipmaps ? 4 : 1,
        },
      },
      dispose: vi.fn(),
    };
    images.push(image);
    return image as unknown as Uploaded;
  });
  return {
    bitmaps,
    /** Every source the owner actually asked to decode. */
    decoded,
    images,
    uploadOptions: () => vi.mocked(createTypegpuImageTexture).mock.calls.map((call) => call[2]),
    uploadDevices: () => vi.mocked(createTypegpuImageTexture).mock.calls.map((call) => call[0]),
  };
}

test("appearances sharing loaded bytes bind one image even when their materials differ", async () => {
  const gpu = stubUploads();
  const owner = createTypegpuSoldierImageOwner(device);

  const first = await owner.acquire(appearance("a", 0.2), "baseColor");
  const second = await owner.acquire(appearance("b", 0.9), "baseColor");

  expect(second).toBe(first);
  expect(gpu.images).toHaveLength(1);
  expect(gpu.bitmaps).toHaveLength(1);
  expect(gpu.bitmaps[0].close).toHaveBeenCalledTimes(1);
  expect(owner.stats()).toEqual({
    allocated: [
      {
        channel: "baseColor",
        width: 8,
        height: 4,
        mipLevels: 4,
        format: "rgba8unorm-srgb",
        bytes: 172,
        references: 2,
      },
    ],
    allocatedImages: 1,
    allocatedBytes: 172,
    references: 2,
    referencedBytes: 344,
  });
});

test("images differing in color interpretation, mip policy, sampling or bytes stay separate", async () => {
  const gpu = stubUploads();
  const owner = createTypegpuSoldierImageOwner(device);
  const variants: [SoldierSurface, "baseColor" | "normal"][] = [
    // Same bytes read as a linear channel: a different upload format.
    [
      {
        materials: [{ name: "n", baseColor: [1, 1, 1, 1], roughness: 1, metallic: 0 }],
        textures: { normal: { image: loadedImage, mimeType: "image/png", sampler } },
      },
      "normal",
    ],
    // Same bytes and channel, no mip chain.
    [
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
      "baseColor",
    ],
    // Same bytes, channel and mip policy, different wrapping.
    [
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
      "baseColor",
    ],
    // A second appearance of the same picture the loader fetched separately.
    [
      {
        materials: [{ name: "copy", baseColor: [1, 1, 1, 1], roughness: 1, metallic: 0 }],
        textures: {
          baseColor: { image: new Uint8Array([7, 7, 7]), mimeType: "image/png", sampler },
        },
      },
      "baseColor",
    ],
  ];

  const textures = [await owner.acquire(appearance("a", 0.2), "baseColor")];
  for (const [surface, channel] of variants) textures.push(await owner.acquire(surface, channel));

  expect(new Set(textures).size).toBe(5);
  expect(gpu.images).toHaveLength(5);
  expect(gpu.uploadOptions()).toEqual([
    { colorSpace: "srgb", generateMipmaps: true },
    { colorSpace: "linear", generateMipmaps: true },
    { colorSpace: "srgb", generateMipmaps: false },
    { colorSpace: "srgb", generateMipmaps: true },
    { colorSpace: "srgb", generateMipmaps: true },
  ]);
  expect(owner.stats()).toMatchObject({ allocatedImages: 5, references: 5 });
});

test("appearances missing a channel share one fallback image per channel", async () => {
  const gpu = stubUploads();
  const owner = createTypegpuSoldierImageOwner(device);
  const first = appearance("a", 0.2);
  const second = appearance("b", 0.9);

  const fallbacks = [
    await owner.acquire(first, "orm"),
    await owner.acquire(second, "orm"),
    await owner.acquire(first, "normal"),
  ];

  expect(fallbacks[1]).toBe(fallbacks[0]);
  // Fallbacks stay attributable to their channel, so a linear normal fallback
  // is not reported as an orm image.
  expect(fallbacks[2]).not.toBe(fallbacks[0]);
  expect(gpu.images).toHaveLength(2);
  expect(gpu.decoded).toHaveLength(2);
  expect(gpu.decoded[0]).toMatchObject({
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([255, 255, 255, 255]),
  });
  expect(gpu.uploadOptions()).toEqual([
    { colorSpace: "linear", generateMipmaps: false },
    { colorSpace: "linear", generateMipmaps: false },
  ]);
  expect(owner.stats().allocated.map((image) => [image.channel, image.mipLevels])).toEqual([
    ["orm", 1],
    ["normal", 1],
  ]);
});

test("equal requests made while a creation is in flight share that one allocation", async () => {
  let admit!: () => void;
  const gpu = stubUploads(new Promise<void>((resolve) => (admit = resolve)));
  const owner = createTypegpuSoldierImageOwner(device);

  const both = Promise.all([
    owner.acquire(appearance("a", 0.2), "baseColor"),
    owner.acquire(appearance("b", 0.9), "baseColor"),
  ]);
  admit();
  const [first, second] = await both;

  expect(second).toBe(first);
  expect(gpu.images).toHaveLength(1);
  expect(gpu.bitmaps).toHaveLength(1);
  expect(vi.mocked(createTypegpuImageTexture)).toHaveBeenCalledTimes(1);
  expect(owner.stats()).toMatchObject({ allocatedImages: 1, references: 2 });
});

test("a failed decode retains nothing and leaves the owner able to retry", async () => {
  const gpu = stubUploads();
  vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error("corrupt PNG"));
  const owner = createTypegpuSoldierImageOwner(device);

  await expect(owner.acquire(appearance("a", 0.2), "baseColor")).rejects.toThrow("corrupt PNG");
  expect(gpu.images).toHaveLength(0);
  expect(owner.stats()).toMatchObject({ allocatedImages: 0, references: 0 });

  await owner.acquire(appearance("a", 0.2), "baseColor");
  expect(gpu.images).toHaveLength(1);
  expect(owner.stats()).toMatchObject({ allocatedImages: 1, references: 1 });
});

test("a failed upload closes its bitmap, retains no image and is retried once", async () => {
  const gpu = stubUploads();
  vi.mocked(createTypegpuImageTexture).mockRejectedValueOnce(new Error("out of memory"));
  const owner = createTypegpuSoldierImageOwner(device);

  await expect(owner.acquire(appearance("a", 0.2), "baseColor")).rejects.toThrow("out of memory");
  expect(gpu.bitmaps[0].close).toHaveBeenCalledTimes(1);
  expect(owner.stats()).toMatchObject({ allocatedImages: 0, references: 0 });

  const retried = await owner.acquire(appearance("b", 0.9), "baseColor");
  const again = await owner.acquire(appearance("a", 0.2), "baseColor");
  expect(again).toBe(retried);
  expect(gpu.images).toHaveLength(1);
  expect(owner.stats()).toMatchObject({ allocatedImages: 1, references: 2 });
});

test("disposal during a creation destroys the arriving image once and admits no more", async () => {
  let admit!: () => void;
  const gpu = stubUploads(new Promise<void>((resolve) => (admit = resolve)));
  const owner = createTypegpuSoldierImageOwner(device);

  const pending = owner.acquire(appearance("a", 0.2), "baseColor");
  owner.dispose();
  admit();

  await expect(pending).rejects.toThrow("disposed");
  expect(gpu.images).toHaveLength(1);
  expect(gpu.images[0].dispose).toHaveBeenCalledTimes(1);
  expect(gpu.bitmaps[0].close).toHaveBeenCalledTimes(1);
  expect(owner.stats()).toMatchObject({ allocatedImages: 0, references: 0 });

  await expect(owner.acquire(appearance("a", 0.2), "baseColor")).rejects.toThrow("disposed");
  expect(gpu.images).toHaveLength(1);
});

test("repeated disposal destroys each owned image exactly once", async () => {
  const gpu = stubUploads();
  const owner = createTypegpuSoldierImageOwner(device);
  const surface = appearance("a", 0.2);
  await owner.acquire(surface, "baseColor");
  await owner.acquire(appearance("b", 0.9), "baseColor");
  await owner.acquire(surface, "orm");

  owner.dispose();
  owner.dispose();

  expect(gpu.images).toHaveLength(2);
  for (const image of gpu.images) expect(image.dispose).toHaveBeenCalledTimes(1);
  expect(owner.stats()).toEqual({
    allocated: [],
    allocatedImages: 0,
    allocatedBytes: 0,
    references: 0,
    referencedBytes: 0,
  });
});

test("a replacement preparation allocates on its own device while the outgoing one stays valid", async () => {
  const gpu = stubUploads();
  const live = createTypegpuSoldierImageOwner(device);
  const staged = createTypegpuSoldierImageOwner(device);
  const elsewhere = createTypegpuSoldierImageOwner(otherDevice);

  const current = await live.acquire(appearance("a", 0.2), "baseColor");
  const replacement = await staged.acquire(appearance("a", 0.2), "baseColor");
  const foreign = await elsewhere.acquire(appearance("a", 0.2), "baseColor");

  expect(new Set([current, replacement, foreign]).size).toBe(3);
  expect(gpu.uploadDevices()).toEqual([device, device, otherDevice]);

  live.dispose();
  expect(gpu.images[0].dispose).toHaveBeenCalledTimes(1);
  expect(gpu.images[1].dispose).not.toHaveBeenCalled();
  expect(staged.stats()).toMatchObject({ allocatedImages: 1, references: 1 });
  expect(elsewhere.stats()).toMatchObject({ allocatedImages: 1, references: 1 });
});
