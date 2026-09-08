// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterEach, expect, test, vi } from "vitest";
import { CampaignRenderer } from "../src/campaign/renderer";
import { loadAppearanceCatalog } from "@packages/soldier-assets/src/appearanceBundle";
import { createFrameShell } from "@packages/renderer-core/src/frameShell";
import { SkinnedCrowdPipeline } from "@packages/renderer-core/src/skinnedPipeline";

vi.mock("@packages/soldier-assets/src/appearanceBundle", () => ({
  loadAppearanceCatalog: vi.fn(),
}));
vi.mock("@packages/renderer-core/src/frameShell", () => ({ createFrameShell: vi.fn() }));
vi.mock("@packages/renderer-core/src/skinnedPipeline", () => ({
  SkinnedCrowdPipeline: { create: vi.fn() },
}));
// Terrain construction is unrelated to asynchronous GPU ownership.
vi.mock("../src/campaign/surface", () => ({ campaignSurface: () => ({}) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

test("campaign teardown during crowd preparation cannot publish or retain GPU owners", async () => {
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
  const shell = { destroy: vi.fn() };
  vi.mocked(createFrameShell).mockResolvedValue(
    shell as unknown as Awaited<ReturnType<typeof createFrameShell>>,
  );
  const crowd = { dispose: vi.fn() };
  let finish!: (value: SkinnedCrowdPipeline) => void;
  const preparing = new Promise<SkinnedCrowdPipeline>((resolve) => {
    finish = resolve;
  });
  vi.mocked(SkinnedCrowdPipeline.create).mockReturnValue(preparing);
  type Args = ConstructorParameters<typeof CampaignRenderer>;
  const renderer = new CampaignRenderer({} as Args[0], {} as Args[1], {} as Args[2], {} as Args[3]);
  await vi.waitFor(() => expect(SkinnedCrowdPipeline.create).toHaveBeenCalledOnce());
  renderer.destroy();
  finish(crowd as unknown as SkinnedCrowdPipeline);
  await renderer.ready;
  expect(renderer.stats().ready).toBe(false);
  expect(crowd.dispose).toHaveBeenCalledOnce();
  expect(shell.destroy).toHaveBeenCalledOnce();
  renderer.destroy();
  expect(crowd.dispose).toHaveBeenCalledOnce();
  expect(shell.destroy).toHaveBeenCalledOnce();
});
