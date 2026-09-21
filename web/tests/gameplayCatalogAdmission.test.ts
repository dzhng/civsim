// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterEach, expect, test, vi } from "vitest";
import { assertGameplayAppearances } from "@packages/crowd-runtime/src/animationState";
import { presentationRenderer } from "./support/battleRendererPresentation";
import { APPEARANCE_DESCRIPTORS } from "@packages/soldier-assets/src/appearance";
import { loadAppearanceCatalog } from "@packages/soldier-assets/src/appearanceBundle";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Serve real shipped bundle bytes through the network boundary. Only the catalog
// changes: a valid nonempty subset must not masquerade as a gameplay roster.
async function serveCatalog(ids = [0]) {
  vi.stubGlobal("location", { href: "https://game.test/" });
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

test("gameplay catalog admission rejects missing roster appearances", async () => {
  await serveCatalog();
  const assets = await loadAppearanceCatalog("https://game.test/assets/soldiers/catalog.json");
  expect(() => assertGameplayAppearances(assets)).toThrow("Missing gameplay appearance 1");
});

test("reload rejects a missing current class and retains the last-good crowd and assets", async () => {
  const ids = APPEARANCE_DESCRIPTORS.map((_, id) => id);
  await serveCatalog(ids);
  const lastGood = await loadAppearanceCatalog("https://game.test/assets/soldiers/catalog.json");
  const { renderer } = presentationRenderer();
  renderer.soldierAssets = lastGood;
  await serveCatalog(ids.filter((id) => id !== 14));
  await expect(renderer.reloadSoldierAssets()).rejects.toThrow("Missing gameplay appearance 14");
  expect(renderer.soldierAssets).toBe(lastGood);
  expect(renderer.soldierAssets[14]).toBe(lastGood[14]);
});

test("complete gameplay catalogs admit while the loader permits explicit authoring subsets", async () => {
  await serveCatalog(APPEARANCE_DESCRIPTORS.map((_, id) => id));
  const url = "https://game.test/assets/soldiers/catalog.json";
  const complete = await loadAppearanceCatalog(url);
  expect(() => assertGameplayAppearances(complete)).not.toThrow();
  await serveCatalog();
  const subset = await loadAppearanceCatalog(url);
  expect(Object.keys(subset)).toEqual(["0"]);
  expect(subset[0].manifest.name).toBe("heavy-sword");
});
