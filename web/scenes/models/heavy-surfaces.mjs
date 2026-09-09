import { PNG } from "pngjs";
import { requireSwiftShaderBaseline } from "./_swiftshader-baseline.ts";
import { PHOTOREAL_SUBSTRATE } from "../../../packages/photoreal-renderer/src/stats.ts";

const views = [
  { name: "front", yaw: 0.35, pitch: 1.4, zoom: 230, target: [0, 0, 0.95] },
  { name: "rear", yaw: Math.PI + 0.35, pitch: 1.4, zoom: 230, target: [0, 0, 0.95] },
  { name: "gameplay", yaw: 0.35, pitch: 0.42, zoom: 190, target: [0, 0, 0.95] },
  { name: "mail", yaw: Math.PI + 0.15, pitch: 1.4, zoom: 900, target: [0, 0, 1.32] },
  { name: "helmet", yaw: 0.45, pitch: 1.4, zoom: 1000, target: [0, 0, 1.67] },
  { name: "hand", yaw: 0, pitch: 1.4, zoom: 1500, target: [-0.5732, -0.051, 0.9024] },
  { name: "formation", yaw: 0.45, pitch: 0.9, zoom: 65, target: [0, 0, 0.95], formation: true },
];
const folder = "shared/soldiers/heavy-surfaces";
export const meta = {
  name: "heavy-surfaces",
  kind: "visual",
  world: "heavy-surfaces-candidate",
  tier: "full",
  snapshots: views.map(({ name }) => `${folder}/${name}`),
  describe:
    "Frozen heavy geometry under production daylight: clay left, local authored surfaces right; provisional only.",
};

export async function run(ctx) {
  requireSwiftShaderBaseline(meta.name);
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(
      `${ctx.target}/renderer/battle-models?ref=1&catalog=${encodeURIComponent("/assets/soldiers/candidates/heavy-surfaces/catalog.json")}`,
    );
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    await page.evaluate(() => window.__battleModels.freeze());
    for (const { name, ...camera } of views) {
      const sheet = new PNG({ width: 1280, height: 640 });
      const shots = [];
      for (const [column, classId] of [1, 0].entries()) {
        const before = await page.evaluate(
          ({ classId, camera }) => {
            const harness = window.__battleModels;
            const before = harness.stats().frame;
            harness.set({ classId, clip: "bend", phase: 0, formation: false, ...camera });
            return before;
          },
          { classId, camera },
        );
        await page.waitForFunction((frame) => window.__battleModels.stats().frame > frame, before);
        await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
        const stats = await page.evaluate(() => window.__battleModels.stats());
        ctx.check(
          `${name}/${classId}: production frozen presentation`,
          stats.render.substrate === PHOTOREAL_SUBSTRATE &&
            stats.sampled.phase === 0 &&
            stats.render.soldiers === (camera.formation ? 16 : 1),
          JSON.stringify(stats.sampled),
        );
        const crop = { x: 320, y: 96, width: 640, height: 640 };
        const shot = await page.screenshot({ clip: crop });
        const frame = await page.evaluate(() => {
          const harness = window.__battleModels;
          const frame = harness.stats().frame;
          harness.set({ phase: 0 });
          return frame;
        });
        await page.waitForFunction((frame) => window.__battleModels.stats().frame > frame, frame);
        await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
        ctx.check(
          `${name}/${classId}: newly rendered crop is byte-stable`,
          shot.equals(await page.screenshot({ clip: crop })),
        );
        shots.push(shot);
        PNG.bitblt(PNG.sync.read(shot), sheet, 0, 0, 640, 640, column * 640, 0);
      }
      ctx.check(`${name}: surface change reaches rendered pixels`, !shots[0].equals(shots[1]));
      await ctx.snap(page, `${folder}/${name}`, {
        shot: PNG.sync.write(sheet),
        threshold: 0,
        maxDiffRatio: 0,
      });
    }
  } finally {
    await page.close();
  }
}
