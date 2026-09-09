import { reportedHighland } from "../_battle-reported-highland.mjs";

export const meta = {
  name: "battle-camera-approach",
  kind: "visual",
  world: "battle-real",
  tier: "full",
  snapshots: ["camera-approach"],
  describe: "The close approach reveals the forward battlefield before reaching soldier height.",
};
export async function run(ctx) {
  const page = await reportedHighland(ctx);
  try {
    await page.evaluate(async () => {
      const c = window.__cam,
        g = window.__game,
        u = g.unitInfo(4);
      c.resetLook();
      c.zoom = 3;
      c.setViewCenter(u[0], u[1]);
      c.zoomAt(800, 450, c.params().distance / 25);
      c.setViewCenter(u[0], u[1]);
      g.select(4);
      await g.freezeAtTick(120);
    });
    await page.waitForFunction(
      () => !window.__game.stats().renderStats.terrain.grass.rebuild.pending,
    );
    await page.evaluate(() => window.__game.freezeAtTick(120));
    await ctx.snap(null, "camera-approach", {
      shot: await page.screenshot({ animations: "disabled" }),
      threshold: 0,
      maxDiffRatio: 0,
    });
  } finally {
    await page.close();
  }
}
