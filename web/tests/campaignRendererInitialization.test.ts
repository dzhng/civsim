// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterEach, expect, test, vi } from "vitest";
import { CampaignRenderer } from "../src/campaign/renderer";
import { loadAppearanceCatalog } from "@packages/soldier-assets/src/appearanceBundle";
import { PhotorealCampaignWorld } from "@packages/photoreal-renderer/src/campaign/campaignWorld";

vi.mock("@packages/soldier-assets/src/appearanceBundle", () => ({
  loadAppearanceCatalog: vi.fn(),
}));
vi.mock("@packages/photoreal-renderer/src/campaign/campaignWorld", () => ({
  PhotorealCampaignWorld: { createLandscape: vi.fn() },
}));
vi.mock("@packages/game-renderer/src/terrain/campaignSource", () => ({
  snapshotCampaignLandscape: () => ({}),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

test("campaign teardown during physical world creation cannot publish or retain GPU owners", async () => {
  vi.stubGlobal("location", { href: "http://localhost/", search: "" });
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  const fixtureRoot = new URL(
    "../public/assets/soldiers/fixtures/placeholder-soldiers/",
    import.meta.url,
  );
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(await readFile(new URL(`.${new URL(url).pathname}`, fixtureRoot))),
  );
  const actual = await vi.importActual<
    typeof import("@packages/soldier-assets/src/appearanceBundle")
  >("@packages/soldier-assets/src/appearanceBundle");
  vi.mocked(loadAppearanceCatalog).mockResolvedValue(
    await actual.loadAppearanceCatalog("http://fixture/catalog.json"),
  );
  const world = { dispose: vi.fn() };
  let finish!: (value: PhotorealCampaignWorld) => void;
  const preparing = new Promise<PhotorealCampaignWorld>((resolve) => {
    finish = resolve;
  });
  vi.mocked(PhotorealCampaignWorld.createLandscape).mockReturnValue(preparing);
  type Args = ConstructorParameters<typeof CampaignRenderer>;
  const renderer = new CampaignRenderer(
    { width: 1, height: 1 } as Args[0],
    { map: { attribution: "test" } } as Args[1],
    {} as Args[2],
    {} as Args[3],
  );
  await vi.waitFor(() => expect(PhotorealCampaignWorld.createLandscape).toHaveBeenCalledOnce());
  renderer.destroy();
  finish(world as unknown as PhotorealCampaignWorld);
  await renderer.ready;
  expect(renderer.stats().ready).toBe(false);
  expect(world.dispose).toHaveBeenCalledOnce();
  renderer.destroy();
  expect(world.dispose).toHaveBeenCalledOnce();
});
