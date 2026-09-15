// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterEach, expect, test, vi } from "vitest";
import { PhotorealBattleWorld } from "@packages/photoreal-renderer/src/battle/battleWorld";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { PhotorealCrowd } from "@packages/photoreal-renderer/src/crowd/crowdLayer";
import { APPEARANCE_DESCRIPTORS } from "@packages/soldier-assets/src/appearance";
import { loadAppearanceCatalog } from "@packages/soldier-assets/src/appearanceBundle";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Serve real shipped bundle bytes through the network boundary. Only the catalog
// changes: a valid nonempty subset must not masquerade as a gameplay roster.
async function serveCatalog(ids = [0]) {
  vi.stubGlobal("window", { location: { href: "https://game.test/" } });
  const root = new URL("../public/assets/soldiers/", import.meta.url);
  const catalog = JSON.parse(await readFile(new URL("catalog.json", root), "utf8"));
  vi.stubGlobal("fetch", async (input: string) => {
    const path = new URL(input).pathname.replace("/assets/soldiers/", "");
    if (path === "catalog.json")
      return new Response(
        JSON.stringify({
          appearances: Object.fromEntries(ids.map((id) => [id, catalog.appearances[0]])),
        }),
      );
    return new Response(await readFile(new URL(path, root)));
  });
}

test("gameplay initial load rejects missing roster appearances before GPU preparation", async () => {
  await serveCatalog();
  const prepare = vi.spyOn(PhotorealWorld, "create").mockRejectedValue(new Error("GPU boundary"));
  await expect(PhotorealBattleWorld.create({} as HTMLCanvasElement)).rejects.toThrow(
    "Missing gameplay appearance 1",
  );
  expect(prepare).not.toHaveBeenCalled();
});

test("reload rejects a missing current class and retains the last-good crowd and assets", async () => {
  const ids = APPEARANCE_DESCRIPTORS.map((_, id) => id);
  await serveCatalog(ids);
  const url = "https://game.test/assets/soldiers/catalog.json";
  const lastGood = await loadAppearanceCatalog(url);
  const crowd = { dispose: vi.fn() };
  // Start at the public reload boundary with an already-admitted world. GPU
  // resources are opaque here; the real loader and admission gate remain live.
  const world = Object.assign(Object.create(PhotorealBattleWorld.prototype), {
    disposed: false,
    gameplay: true,
    soldierCatalogUrl: url,
    world: { renderer: {}, scene: {} },
    crowd,
    soldierAssets: lastGood,
  }) as PhotorealBattleWorld;
  await serveCatalog(ids.filter((id) => id !== 14));
  const prepare = vi.spyOn(PhotorealCrowd, "create").mockRejectedValue(new Error("GPU boundary"));
  // Production battle reload has no manual activePose argument.
  await expect(world.reloadSoldierAssets()).rejects.toThrow("Missing gameplay appearance 14");
  expect(world.soldierAssets).toBe(lastGood);
  expect(world.soldierAssets[14]).toBe(lastGood[14]);
  expect(crowd.dispose).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
});

test("complete gameplay and manual subset initial loads reach GPU preparation", async () => {
  const prepare = vi.spyOn(PhotorealWorld, "create").mockRejectedValue(new Error("GPU boundary"));
  await serveCatalog(APPEARANCE_DESCRIPTORS.map((_, id) => id));
  await expect(PhotorealBattleWorld.create({} as HTMLCanvasElement)).rejects.toThrow(
    "GPU boundary",
  );
  await serveCatalog();
  await expect(
    PhotorealBattleWorld.create({} as HTMLCanvasElement, { gameplay: false }),
  ).rejects.toThrow("GPU boundary");
  expect(prepare).toHaveBeenCalledTimes(2);
});

test("manual reload publishes a valid subset without requiring the gameplay roster", async () => {
  await serveCatalog();
  const oldCrowd = { dispose: vi.fn() };
  const replacement = { dispose: vi.fn() } as unknown as PhotorealCrowd;
  const world = Object.assign(Object.create(PhotorealBattleWorld.prototype), {
    disposed: false,
    gameplay: false,
    soldierCatalogUrl: "https://game.test/assets/soldiers/catalog.json",
    world: { renderer: {}, scene: {} },
    crowd: oldCrowd,
    soldierAssets: {},
  }) as PhotorealBattleWorld;
  vi.spyOn(PhotorealCrowd, "create").mockResolvedValue(replacement);
  await world.reloadSoldierAssets();
  expect(world.soldierAssets[0].manifest.name).toBe("heavy-sword");
  expect(world.soldierAssets[14]).toBeUndefined();
  expect(oldCrowd.dispose).toHaveBeenCalledOnce();
  expect(replacement.dispose).not.toHaveBeenCalled();
});
