import { reportedHighland } from "../_battle-reported-highland.mjs";

export const meta = {
  name: "battle-terrain-seams",
  kind: "visual",
  world: "battle-real",
  tier: "full",
  snapshots: ["terrain-seams-east-close", "terrain-seams-west-close"],
  describe:
    "Low battlefield views keep the generated mountain and carved shoreline surfaces connected.",
};
export async function run(ctx) {
  const page = await reportedHighland(ctx);
  try {
    // This gate judges the terrain. Keep unrelated HUD compositing out of its
    // pixel baseline; the controls flow separately checks destination feedback.
    await page.addStyleTag({ content: "#battle-hud { visibility: hidden !important; }" });
    for (const [name, yaw] of [
      ["east", -2.6],
      ["west", -0.5],
    ]) {
      await page.evaluate(async (yaw) => {
        const c = window.__cam,
          g = window.__game,
          u = g.unitInfo(4);
        c.zoom = 9.5;
        c.yaw = yaw;
        c.pitchBias = 0;
        c.setViewCenter(u[0] - 20, u[1] - 5);
        g.select(4);
        await g.freezeAtTick(120);
      }, yaw);
      await page.waitForFunction(
        () => !window.__game.stats().renderStats.terrain.grass.rebuild.pending,
      );
      await page.evaluate(() => window.__game.freezeAtTick(120));
      await ctx.snap(null, `terrain-seams-${name}-close`, {
        shot: await page.screenshot({ animations: "disabled" }),
        threshold: 0,
        maxDiffRatio: 0,
      });
    }
  } finally {
    await page.close();
  }
}
