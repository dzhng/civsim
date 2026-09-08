import { PNG } from "pngjs";
import { requireSwiftShaderBaseline } from "./_swiftshader-baseline.ts";
import { APPEARANCE_DESCRIPTORS } from "../../../packages/soldier-assets/src/appearance.ts";

export const meta = {
  name: "battle-model-far-bundles",
  kind: "visual",
  world: "battle-models-mixed-appearance-distance",
  tier: "full",
  snapshots: [
    "front-near",
    "front-far-diagnostic",
    "front-far-production",
    "side-near",
    "side-far-diagnostic",
    "side-far-production",
    "roster-production-far",
  ].map((name) => `battle/far-bundles/${name}`),
  describe:
    "Production crowd appearance-specific far geometry, anchored against mesh tiers; close far inspection is diagnostic, roster view uses actual production LOD.",
};

export async function run(ctx) {
  requireSwiftShaderBaseline(meta.name);
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(
      `${ctx.target}/renderer/battle-models?ref=1&catalog=/assets/soldiers/fixtures/placeholder-soldiers/catalog.json`,
    );
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    await page.evaluate(() => window.__battleModels.freeze());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    for (const [name, yaw, diagnostic, roster] of [
      ["front-near", 0.15, false, false],
      ["front-far-diagnostic", 0.15, true, false],
      ["side-near", Math.PI / 2, false, false],
      ["side-far-diagnostic", Math.PI / 2, true, false],
      ["roster-production-far", 0.15, false, true],
    ]) {
      const result = await page.evaluate(
        async ({ yaw, diagnostic, roster }) => {
          const h = window.__battleModels;
          h.set({
            yaw,
            pitch: 1.15,
            zoom: roster ? 0.9 : 55,
            formation: false,
            clip: "idle",
            phase: 0,
          });
          while (h.stats().pendingDraw) await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          const world = h.world;
          const camera = structuredClone(world.stats().camera);
          const { farAdmissionCamera } = await import("/scenes/models/_far-inspection.ts");
          const ids = roster ? Object.keys(world.soldierAssets).map(Number) : [0, 14, 6];
          const instances = ids.flatMap((classId, index) => {
            const asset = world.soldierAssets[classId];
            const count = roster ? 16 : 1;
            return Array.from({ length: count }, (_, n) => ({
              x: roster ? ((index % 5) - 2) * 22 + (n % 4) * 2 : (index - 1) * 5 * Math.cos(yaw),
              y: roster
                ? (Math.floor(index / 5) - 1.5) * 22 + Math.floor(n / 4) * 2
                : (index - 1) * 5 * Math.sin(yaw),
              elevation: 0,
              facing: Math.PI / 2,
              classId,
              faction: 0,
              alive: true,
              frame: 0,
              clip: "idle",
              phase: 0,
              seed: 0,
              mounted: asset.manifest.mounted,
              lod: 0,
            }));
          });
          world.drawInstances(instances, diagnostic ? farAdmissionCamera(camera) : camera);
          world.render();
          await world.settlePresentedFrame();
          return { stats: world.stats(), count: instances.length, ids, inspectionCamera: camera };
        },
        { yaw, diagnostic, roster },
      );
      ctx.check(
        `${name}: full appearance submission`,
        result.stats.soldiers === result.count,
        JSON.stringify({ ids: result.ids, count: result.stats.soldiers }),
      );
      if (roster)
        ctx.check(
          `${name}: catalog covers every current appearance`,
          JSON.stringify(result.ids) === JSON.stringify(APPEARANCE_DESCRIPTORS.map((_, id) => id)),
          JSON.stringify(result.ids),
        );
      ctx.check(
        `${name}: expected representation`,
        diagnostic || roster
          ? result.stats.lod.impostors === result.count
          : result.stats.lod.skinned === result.count && result.stats.lod.impostors === 0,
        JSON.stringify(result.stats.lod),
      );
      const shadow = result.stats.crowd.shadowTierHistogram;
      ctx.check(
        `${name}: independent shadow audience stays mesh-only`,
        shadow.l3 === 0 && shadow.l0 + shadow.l1 + shadow.l2 > 0,
        JSON.stringify(shadow),
      );
      if (diagnostic) {
        const physical = await page.screenshot();
        await ctx.snap(page, `battle/far-bundles/${name.replace("diagnostic", "production")}`, {
          shot: physical,
          threshold: 0,
          maxDiffRatio: 0,
        });
        ctx.check(
          `${name}: production far pixels frozen`,
          physical.equals(await page.screenshot()),
        );
        // Magnify already-admitted far content; do not re-tier it with the close projection.
        await page.evaluate(async (camera) => {
          const world = window.__battleModels.world;
          world.setCamera(camera);
          world.render();
          await world.settlePresentedFrame();
        }, result.inspectionCamera);
      }
      const shot = await page.screenshot();
      if (name.startsWith("front-")) {
        const png = PNG.sync.read(shot);
        let polePixels = 0,
          sumX = 0;
        // Above the central phalangite's head, only its raised pike is dark.
        // Its right-hand grip must not jump left when switching representation.
        for (let y = 275; y < 325; y++)
          for (let x = 600; x < 700; x++) {
            const i = (y * png.width + x) * 4;
            if (png.data[i] + png.data[i + 1] + png.data[i + 2] < 330) {
              polePixels++;
              sumX += x;
            }
          }
        ctx.check(
          `${name}: pike remains on the mesh's right-hand side`,
          polePixels > 30 && sumX / polePixels > 650,
          JSON.stringify({ polePixels, centroidX: sumX / polePixels }),
        );
      }
      await ctx.snap(page, `battle/far-bundles/${name}`, { shot, threshold: 0, maxDiffRatio: 0 });
      ctx.check(`${name}: frozen pixels`, shot.equals(await page.screenshot()));
    }
  } finally {
    await page.close();
  }
}
