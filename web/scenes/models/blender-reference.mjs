import { PNG } from "pngjs";

export const meta = {
  name: "blender-reference",
  kind: "visual",
  world: "blender-export-oracle",
  tier: "full",
  snapshots: ["shared/soldiers/export/human", "shared/soldiers/export/mounted"],
  describe:
    "Original Blender fixtures: standard-loader surface parity, transformed ancestry, weighted bends and mounted local-track composition.",
};

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(`${ctx.target}/renderer/blender-reference?ref=1`);
    await page.waitForFunction(() => window.__blenderReference?.stats().frame > 0, undefined, {
      timeout: 60000,
    });
    for (const id of ["human", "mounted"]) {
      if (id !== "human")
        await page.evaluate((id) => window.__blenderReference.selectFixture(id), id);
      const initial = await page.evaluate(() => window.__blenderReference.stats());
      ctx.check(`${id}: authored GLB matches Blender evidence hash`, initial.hashMatches);
      ctx.check(
        `${id}: normalized authored influences survive export`,
        initial.maxInfluences === initial.maximumNonzeroWeights &&
          initial.weightSumError < 1e-6 &&
          (id !== "human" || initial.maxInfluences === 4),
        JSON.stringify({
          maxInfluences: initial.maxInfluences,
          weightSumError: initial.weightSumError,
        }),
      );
      const tiles = [];
      for (const [index, name] of initial.sampleNames.entries()) {
        for (const view of ["front", "side"]) {
          await page.selectOption("#reference-view", view, { force: true });
          const before = await page.evaluate((index) => {
            const before = window.__blenderReference.stats().frame;
            window.__blenderReference.sample(index);
            return before;
          }, index);
          await page.waitForFunction(
            (before) => window.__blenderReference.stats().frame > before,
            before,
          );
          await page.evaluate(() => window.__blenderReference.world.settlePresentedFrame());
          const result = await page.evaluate(() => window.__blenderReference.stats());
          ctx.check(
            `${id}/${name}/${view}: skinned vertices match Blender`,
            result.checkedVertices > 0 &&
              Number.isFinite(result.maxError) &&
              result.maxError <= result.toleranceMetres,
            JSON.stringify({
              vertices: result.checkedVertices,
              maxError: result.maxError,
              tolerance: result.toleranceMetres,
            }),
          );
          const shot = await page.screenshot();
          const firstFrame = await page.evaluate((index) => {
            const frame = window.__blenderReference.stats().frame;
            window.__blenderReference.sample(index);
            return frame;
          }, index);
          await page.waitForFunction(
            (frame) => window.__blenderReference.stats().frame > frame,
            firstFrame,
          );
          await page.evaluate(() => window.__blenderReference.world.settlePresentedFrame());
          ctx.check(
            `${id}/${name}/${view}: frozen frame repeats exactly`,
            shot.equals(await page.screenshot()),
          );
          tiles.push(PNG.sync.read(shot));
        }
      }
      // Each row is one authored sample: front, side. Full viewport captures
      // are reduced uniformly, never independently reframed to hide differences.
      const sheet = new PNG({ width: 1280, height: (tiles.length / 2) * 400 });
      tiles.forEach((tile, index) => {
        for (let y = 0; y < 400; y++)
          for (let x = 0; x < 640; x++) {
            const from = (y * 2 * tile.width + x * 2) * 4;
            const to =
              ((Math.floor(index / 2) * 400 + y) * sheet.width + (index % 2) * 640 + x) * 4;
            tile.data.copy(sheet.data, to, from, from + 4);
          }
      });
      await ctx.snap(page, `shared/soldiers/export/${id}`, { shot: PNG.sync.write(sheet) });
    }
    const beforeSwitches = await page.evaluate(() => window.__blenderReference.stats());
    await page.evaluate(() => {
      const select = document.querySelector("#reference-fixture");
      for (let i = 0; i < 20; i++) {
        select.value = i % 2 ? "human" : "mounted";
        select.dispatchEvent(new Event("change"));
      }
    });
    await page.waitForFunction(
      (frame) => window.__blenderReference.stats().frame > frame,
      beforeSwitches.frame,
    );
    const switched = await page.evaluate(() => window.__blenderReference.stats());
    ctx.check(
      "rapid fixture selection leaves one scene and no texture growth",
      switched.fixture === "human" &&
        switched.activeFixtureScenes === 1 &&
        switched.textures === beforeSwitches.textures,
      JSON.stringify({
        activeScenes: switched.activeFixtureScenes,
        texturesBefore: beforeSwitches.textures,
        texturesAfter: switched.textures,
      }),
    );
  } finally {
    await page.close();
  }
}
