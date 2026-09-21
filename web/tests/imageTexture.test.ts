import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { uploadImageTexture } from "../../packages/renderer-core/src/imageTexture";

beforeEach(() =>
  vi.stubGlobal("GPUTextureUsage", {
    COPY_DST: 2,
    COPY_SRC: 1,
    TEXTURE_BINDING: 4,
    RENDER_ATTACHMENT: 16,
  }),
);
afterEach(() => vi.unstubAllGlobals());

function boundary(failure: "copy" | "admission" | null) {
  const scopes: string[] = [];
  let destroyed = 0;
  const texture = {
    destroy: () => {
      destroyed++;
    },
  } as unknown as GPUTexture;
  const device = {
    limits: { maxTextureDimension2D: 64 },
    pushErrorScope: (scope: string) => scopes.push(scope),
    popErrorScope: () => {
      const scope = scopes.pop();
      return Promise.resolve(
        failure === "admission" && scope === "validation"
          ? { message: "injected GPU validation failure" }
          : null,
      );
    },
    createTexture: () => texture,
    queue: {
      copyExternalImageToTexture: () => {
        if (failure === "copy") throw new Error("injected synchronous copy failure");
      },
    },
  } as unknown as GPUDevice;
  return { device, texture, scopes, destroyed: () => destroyed };
}

it("rejects closed and oversized images before GPU allocation, leaving image ownership with caller", async () => {
  const device = { limits: { maxTextureDimension2D: 64 } } as GPUDevice;
  await expect(
    uploadImageTexture(device, { width: 0, height: 0 } as ImageBitmap, {
      colorSpace: "linear",
      generateMipmaps: true,
    }),
  ).rejects.toThrow("nonempty");
  await expect(
    uploadImageTexture(device, { width: 65, height: 2 } as ImageBitmap, {
      colorSpace: "srgb",
      generateMipmaps: true,
    }),
  ).rejects.toThrow("maxTextureDimension2D=64");
});

it("hands off a successful texture without closing the caller's image", async () => {
  const b = boundary(null);
  const image = { width: 8, height: 4 } as ImageBitmap;
  const result = await uploadImageTexture(b.device, image, {
    colorSpace: "linear",
    generateMipmaps: false,
  });
  expect(result).toBe(b.texture);
  expect(b.scopes).toEqual([]);
  expect(b.destroyed()).toBe(0);
  expect(image.width).toBe(8);
});

it.each(["copy", "admission"] as const)(
  "rolls back %s failure and pops scopes before yielding",
  async (failure) => {
    const b = boundary(failure);
    const pending = uploadImageTexture(b.device, { width: 8, height: 4 } as ImageBitmap, {
      colorSpace: "srgb",
      generateMipmaps: false,
    });
    expect(b.scopes).toEqual([]);
    await expect(pending).rejects.toThrow(
      failure === "copy" ? "synchronous copy" : "GPU validation",
    );
    expect(b.destroyed()).toBe(1);
  },
);

it("rejects truncated packed RGBA before opening GPU admission scopes", async () => {
  const device = { limits: { maxTextureDimension2D: 64 } } as GPUDevice;
  await expect(
    uploadImageTexture(
      device,
      { width: 2, height: 2, data: new Uint8Array(15) },
      {
        colorSpace: "linear",
        generateMipmaps: true,
      },
    ),
  ).rejects.toThrow("exactly four bytes per pixel");
});
