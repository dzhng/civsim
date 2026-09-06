// @vitest-environment node
import { expect, test, vi } from "vitest";
import {
  decodeSoldierMesh,
  encodeSoldierMesh,
  loadAppearanceBundle,
} from "@packages/soldier-assets/src/appearanceBundle";
import {
  createPlaceholderSoldierMeshes,
  PLACEHOLDER_MATERIALS,
} from "@packages/soldier-assets/src/soldierMesh";

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
    "materials.json": PLACEHOLDER_MATERIALS,
    "near.json": tier(0),
    "mid.json": tier(1),
    "far.json": tier(2),
  };
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    requests.push(url);
    const value = files[new URL(url).pathname.split("/").pop()!];
    return new Response(JSON.stringify(value), { status: value ? 200 : 404 });
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
      files["materials.json"] = invalid?.length
        ? [...invalid, ...PLACEHOLDER_MATERIALS.slice(1)]
        : invalid;
      await expect(
        loadAppearanceBundle("https://assets.test/fixture/bundle.json").then(() => "accepted"),
      ).rejects.toThrow(/material/i);
    }
    files["materials.json"] = PLACEHOLDER_MATERIALS;
    (files["clips.json"] as { data: number[] }).data.pop();
    await expect(
      loadAppearanceBundle("https://assets.test/fixture/bundle.json").then(() => "accepted"),
    ).rejects.toThrow(/animation matrix data/);
  } finally {
    vi.unstubAllGlobals();
  }
});
