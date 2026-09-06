// @vitest-environment node
import { expect, test, vi } from "vitest";
import {
  decodeSoldierMesh,
  encodeSoldierMesh,
  loadAppearanceBundle,
  loadAppearanceCatalog,
} from "@packages/soldier-assets/src/appearanceBundle";
import {
  createPlaceholderSoldierMeshes,
  PLACEHOLDER_MATERIALS,
} from "@packages/soldier-assets/src/soldierMesh";

test("normal-mapped bind frames are admitted per slot on all tiers and far content", async () => {
  const mesh = {
    positions: [0, 0, 0, 1, 0, 0],
    normals: [0, 0, 0, 0, 0, 1],
    colors: Array(8).fill(1),
    joints: Array(8).fill(0),
    weights: [1, 0, 0, 0, 1, 0, 0, 0],
    uvs: [0, 0, 1, 0],
    tangents: [0, 0, 0, 0, 1, 0, 0, -1],
    materialIds: [0, 1],
    factionMasks: [0, 0],
    indices: [0, 1, 0],
    indexFormat: "uint16",
  };
  const plain = { name: "plain", baseColor: [1, 1, 1, 1], roughness: 1, metallic: 0 };
  const files: Record<string, unknown> = {
    "bundle.json": {
      name: "mapped",
      mounted: false,
      skeleton: "rig.json",
      animation: "clips.json",
      materials: "materials.json",
      tiers: ["near.json", "mid.json", "far.json"],
      far: { mesh: "atlas.json", clip: "idle", phase: 0 },
      bounds: { center: [0, 0, 0], radius: 1 },
    },
    "rig.json": { bones: [{}], clips: [] },
    // Runtime does not rescan animation frames: source baking owns sampled-frame admission.
    "clips.json": {
      bones: 1,
      width: 1,
      height: 4,
      fps: 24,
      data: Array(16).fill(0),
      clips: [{ name: "idle", start: 0, frames: 1, loop: true, duration: 0 }],
    },
    "materials.json": {
      materials: [plain, { ...plain, textures: { normal: true } }],
      textures: {
        normal: {
          image: "normal.png",
          mimeType: "image/png",
          sampler: {
            magFilter: "linear",
            minFilter: "linear",
            mipmapFilter: "none",
            wrapS: "repeat",
            wrapT: "repeat",
          },
        },
      },
    },
    "normal.png": new Uint8Array([137, 80, 78, 71]),
    "near.json": mesh,
    "mid.json": mesh,
    "far.json": mesh,
    "atlas.json": mesh,
  };
  vi.stubGlobal("fetch", async (url: string) => {
    const value = files[new URL(url).pathname.split("/").pop()!];
    return new Response(
      value instanceof Uint8Array ? new Uint8Array(value) : JSON.stringify(value),
    );
  });
  try {
    const bundle = await loadAppearanceBundle("https://assets.test/bundle.json");
    expect(bundle.tiers[0].tangents[7]).toBe(-1);
    expect(bundle.tiers[0].tangents[3]).toBe(0);
    for (const path of ["near.json", "mid.json", "far.json", "atlas.json"]) {
      for (const tangent of [
        [0, 0, 0, 1],
        [0, 0, 1, 1],
        [1, 0, 0, 0],
      ]) {
        files[path] = { ...mesh, tangents: [...mesh.tangents.slice(0, 4), ...tangent] };
        await expect(loadAppearanceBundle("https://assets.test/bundle.json")).rejects.toThrow(
          /normal-mapped vertex 1/,
        );
      }
      files[path] = mesh;
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

test("an incomplete appearance fails instead of silently using placeholder distance content", async () => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          name: "heavy sword",
          skeleton: "rig.json",
          animation: "clips.json",
          materials: "materials.json",
          tiers: ["near.json"],
        }),
      ),
  );
  try {
    await expect(loadAppearanceBundle("https://assets.test/heavy/bundle.json")).rejects.toThrow(
      /three mesh tiers/,
    );
  } finally {
    vi.unstubAllGlobals();
  }
});

test("declared index width cannot silently wrap a large mesh", () => {
  const count = 65538;
  const mesh = {
    positions: Array(count * 3).fill(0),
    normals: Array(count * 3).fill(0),
    colors: Array(count * 4).fill(1),
    joints: Array(count * 4).fill(0),
    weights: Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
    uvs: Array(count * 2).fill(0),
    tangents: Array(count * 4).fill(0),
    materialIds: Array(count).fill(0),
    factionMasks: Array(count).fill(0),
    indices: [65535, 65536, 65537],
    indexFormat: "uint32" as const,
  };
  expect(Array.from(decodeSoldierMesh(mesh).indices)).toEqual([65535, 65536, 65537]);
  expect(() => decodeSoldierMesh({ ...mesh, indexFormat: "uint16" })).toThrow(/index width/);
});

test("a complete appearance loads distinct tiers and its own far mesh without narrowing", async () => {
  const original = createPlaceholderSoldierMeshes()[0];
  const mesh = encodeSoldierMesh(original);
  mesh.indexFormat = "uint32";
  const tier = (height: number) => ({
    ...mesh,
    positions: mesh.positions.map((v, i) => (i % 3 === 2 ? v + height : v)),
  });
  const files: Record<string, unknown> = {
    "bundle.json": {
      name: "fixture",
      mounted: false,
      skeleton: "rig.json",
      animation: "clips.json",
      materials: "materials.json",
      tiers: ["near.json", "mid.json", "far.json"],
      far: { mesh: "far.json", clip: "idle", phase: 0 },
      bounds: { center: [0, 0, 1], radius: 5 },
    },
    "rig.json": { bones: Array.from({ length: 7 }, () => ({})), clips: [] },
    "clips.json": {
      bones: 7,
      width: 1,
      height: 28,
      fps: 24,
      data: Array(112).fill(0),
      clips: [{ name: "idle", start: 0, frames: 1, loop: true, duration: 0 }],
    },
    "materials.json": { materials: PLACEHOLDER_MATERIALS, textures: {} },
    "near.json": tier(0),
    "mid.json": tier(1),
    "far.json": tier(2),
  };
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    requests.push(url);
    const value = files[new URL(url).pathname.split("/").pop()!];
    return new Response(
      value instanceof Uint8Array ? new Uint8Array(value) : JSON.stringify(value),
      {
        status: value ? 200 : 404,
      },
    );
  });
  try {
    const bundle = await loadAppearanceBundle("https://assets.test/fixture/bundle.json");
    expect(bundle.tiers[0].positions[2]).toBeCloseTo(original.positions[2]);
    expect(bundle.tiers[1].positions[2]).toBeCloseTo(original.positions[2] + 1);
    expect(bundle.tiers[2].positions[2]).toBeCloseTo(original.positions[2] + 2);
    expect(bundle.farMesh.positions[2]).toBe(bundle.tiers[2].positions[2]);
    expect(bundle.tiers[0].indices).toBeInstanceOf(Uint32Array);
    expect(requests.filter((url) => url.endsWith("/far.json"))).toHaveLength(1);
    expect(bundle.manifest.bounds.radius).toBe(5);
    const image = new Uint8Array([137, 80, 78, 71, 0, 255, 37]);
    const sampler = {
      magFilter: "nearest",
      minFilter: "linear",
      mipmapFilter: "nearest",
      wrapS: "mirror-repeat",
      wrapT: "clamp-to-edge",
    };
    files["checker.png"] = image;
    files["surface.json"] = {
      materials: PLACEHOLDER_MATERIALS.map((material) => ({
        ...material,
        textures: { baseColor: true, metallicRoughness: true },
      })),
      textures: {
        baseColor: { image: "images/checker.png", mimeType: "image/png", sampler },
        orm: { image: "images/checker.png", mimeType: "image/png", sampler },
      },
    };
    (files["bundle.json"] as { materials: string }).materials = "surfaces/surface.json";
    files["catalog.json"] = { appearances: { 0: "bundle.json", 14: "bundle.json" } };
    const catalog = await loadAppearanceCatalog("https://assets.test/fixture/catalog.json");
    expect(catalog[0].surface).toBe(catalog[14].surface);
    expect(catalog[0].surface.textures.baseColor?.image).toEqual(image);
    expect(catalog[0].surface.textures.baseColor?.image).toBe(
      catalog[0].surface.textures.orm?.image,
    );
    expect(catalog[0].surface.textures.baseColor?.sampler).toEqual(sampler);
    expect(
      requests.filter((url) => url === "https://assets.test/fixture/surfaces/images/checker.png"),
    ).toHaveLength(1);
    expect(
      (await loadAppearanceCatalog("https://assets.test/fixture/catalog.json"))[0].surface,
    ).not.toBe(catalog[0].surface);
    delete files["checker.png"];
    await expect(loadAppearanceBundle("https://assets.test/fixture/bundle.json")).rejects.toThrow(
      /image .*HTTP 404/,
    );
    (files["bundle.json"] as { materials: string }).materials = "materials.json";
    for (const invalid of [
      null,
      [],
      [null],
      [{ ...PLACEHOLDER_MATERIALS[0], baseColor: [1, 1, 1] }],
      [{ ...PLACEHOLDER_MATERIALS[0], baseColor: [1, 1, 1, null] }],
      [{ ...PLACEHOLDER_MATERIALS[0], roughness: undefined }],
      [{ ...PLACEHOLDER_MATERIALS[0], metallic: "0.5" }],
      [{ ...PLACEHOLDER_MATERIALS[0], metallic: 2 }],
    ]) {
      files["materials.json"] = {
        materials: invalid?.length ? [...invalid, ...PLACEHOLDER_MATERIALS.slice(1)] : invalid,
        textures: {},
      };
      await expect(
        loadAppearanceBundle("https://assets.test/fixture/bundle.json").then(() => "accepted"),
      ).rejects.toThrow(/material/i);
    }
    files["materials.json"] = { materials: PLACEHOLDER_MATERIALS, textures: {} };
    (files["clips.json"] as { data: number[] }).data.pop();
    await expect(
      loadAppearanceBundle("https://assets.test/fixture/bundle.json").then(() => "accepted"),
    ).rejects.toThrow(/animation matrix data/);
  } finally {
    vi.unstubAllGlobals();
  }
});
