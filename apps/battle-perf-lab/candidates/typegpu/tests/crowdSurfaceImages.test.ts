/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
// The consumer proof for the image owner: the real crowd preparation runs, with
// only the resource boundaries it borrows faked. The owner's own sharing and
// lifetime rules are pinned in soldierImageOwnership.test.ts; what this suite
// asks is whether the crowd actually goes through that owner, and whether its
// tables and samplers stay per appearance when the images do not.
const state = vi.hoisted(() => ({
  tables: [] as { format: string }[],
  samplers: [] as GPUSamplerDescriptor[],
  bindGroups: [] as Record<string, unknown>[],
}));
vi.mock("../../../../packages/battle-renderer/src/crowdData", async (original) => ({
  ...(await original<object>()),
  crowdRigGroups: () => [{ 0: { rig: {}, animation: {} }, 1: { rig: {}, animation: {} } }],
}));
vi.mock("../posePalette", () => ({
  createTypegpuPosePalette: async () => ({
    bones: 1,
    bindGroup: {},
    upload: vi.fn(),
    precompute: vi.fn(),
    stats: () => ({}),
    dispose: vi.fn(),
  }),
}));
vi.mock("typegpu", async (original) => {
  const actual = await original<typeof import("typegpu")>();
  const resource = () => {
    const value = {
      $usage: () => value,
      createView: () => value,
      write() {},
      destroy() {},
    };
    return value;
  };
  return {
    ...actual,
    tgpu: {
      ...actual.tgpu,
      initFromDevice: () => ({
        createTexture: (descriptor: { format: string }) => {
          state.tables.push(descriptor);
          return resource();
        },
        createBuffer: resource,
        createSampler: (descriptor: GPUSamplerDescriptor) => {
          state.samplers.push(descriptor);
          return {};
        },
        createBindGroup: (_layout: unknown, entries: Record<string, unknown>) => {
          state.bindGroups.push(entries);
          return {};
        },
        createRenderPipeline: () => ({ initAsync: async () => {} }),
        destroy() {},
      }),
    },
  };
});
vi.mock("../imageTexture", () => ({ createTypegpuImageTexture: vi.fn() }));
import { createTypegpuImageTexture } from "../imageTexture";
import { createTypegpuCrowd } from "../crowd";
import type {
  SoldierSampler,
  SoldierSurface,
} from "../../../../../packages/soldier-assets/src/material";

const sampler: SoldierSampler = {
  magFilter: "linear",
  minFilter: "linear",
  mipmapFilter: "linear",
  wrapS: "repeat",
  wrapT: "clamp-to-edge",
};
/** What the asset loader produces: one buffer behind every copy of an image. */
const loadedImage = new Uint8Array([7, 7, 7]);
const device = { pushErrorScope() {}, popErrorScope: async () => null } as unknown as GPUDevice;

/** Two appearances of one baked texture, each with its own material table. */
function appearance(name: string, roughness: number) {
  const surface: SoldierSurface = {
    materials: [
      { name, baseColor: [1, 1, 1, 1], roughness, metallic: 0, textures: { baseColor: true } },
    ],
    textures: { baseColor: { image: loadedImage, mimeType: "image/png", sampler } },
  };
  // No mesh tiers: this suite is about material preparation, and the geometry
  // buckets are owned by the upload/draw suites.
  return { rig: {}, animation: {}, surface, tiers: [] };
}

function stubUploads() {
  const images: { texture: object; dispose: ReturnType<typeof vi.fn> }[] = [];
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
  // A decoded PNG is 8x4 here; the fallback keeps its real 1x1 size, so the
  // reported payload is the one those images would actually cost.
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (source: { width?: number; height?: number }) => ({
      width: source.width ?? 8,
      height: source.height ?? 4,
      close: vi.fn(),
    })),
  );
  vi.mocked(createTypegpuImageTexture).mockImplementation(async (_device, bitmap, options) => {
    const image = {
      texture: {
        props: {
          size: [bitmap.width, bitmap.height],
          format: options.colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm",
          mipLevelCount: options.generateMipmaps ? 4 : 1,
        },
      },
      dispose: vi.fn(),
    };
    images.push(image);
    return image as unknown as Awaited<ReturnType<typeof createTypegpuImageTexture>>;
  });
  return images;
}

const crowd = () =>
  createTypegpuCrowd(
    device,
    { 0: appearance("a", 0.2), 1: appearance("b", 0.9) } as never,
    {} as never,
    { shade: () => {}, layout: {}, casterLayout: {}, group: {}, casterGroup: {} } as never,
  );

beforeEach(() => {
  state.tables.length = 0;
  state.samplers.length = 0;
  state.bindGroups.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(createTypegpuImageTexture).mockReset();
});

test("two appearances of one baked texture bind one image and keep their own tables", async () => {
  const images = stubUploads();
  const mesh = await crowd();

  // Three images for two appearances: the shared base colour, and one fallback
  // each for the normal and orm channels neither appearance authors.
  expect(images).toHaveLength(3);
  expect(state.bindGroups).toHaveLength(2);
  const [first, second] = state.bindGroups;
  expect(second.baseMap).toBe(first.baseMap);
  expect(second.normalMap).toBe(first.normalMap);
  expect(second.ormMap).toBe(first.ormMap);
  // Tables and samplers remain the appearance's own.
  expect(state.tables.map((table) => table.format)).toEqual(["rgba32float", "rgba32float"]);
  expect(second.materialTable).not.toBe(first.materialTable);
  expect(state.samplers).toHaveLength(6);
  expect(state.samplers[0]).toMatchObject({
    addressModeU: "repeat",
    addressModeV: "clamp-to-edge",
  });

  expect(mesh.stats().images).toMatchObject({
    allocatedImages: 3,
    references: 6,
    allocatedBytes: 180,
    referencedBytes: 360,
  });
  mesh.dispose();
});

test("crowd disposal destroys each shared image exactly once", async () => {
  const images = stubUploads();
  const mesh = await crowd();

  mesh.dispose();
  mesh.dispose();

  expect(images).toHaveLength(3);
  for (const image of images) expect(image.dispose).toHaveBeenCalledTimes(1);
  expect(mesh.stats().images).toMatchObject({ allocatedImages: 0, references: 0 });
});
