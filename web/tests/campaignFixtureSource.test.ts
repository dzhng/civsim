import { afterEach, expect, it, vi } from "vitest";
import { buildHandoffCampaign, buildTestCampaign } from "../src/campaign/fixtures";
import { RenderMask } from "../../packages/game-renderer/src/terrain/campaignSource";

afterEach(() => vi.unstubAllGlobals());

it("controlled green stages supply lowland geography to the physical terrain", async () => {
  vi.stubGlobal(
    "ImageData",
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    },
  );
  vi.stubGlobal("createImageBitmap", async (pixels: ImageData) => pixels);
  for (const build of [buildTestCampaign, buildHandoffCampaign]) {
    const { data } = await build();
    const pixels = data.bg as unknown as ImageData;
    const mask = new RenderMask(pixels.data, pixels.width, pixels.height, data.bgRect);
    expect([...new Set(mask.classes)]).toEqual([1]);
  }
});
