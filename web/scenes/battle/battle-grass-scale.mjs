import { battleRendererReady } from "../worlds.mjs";

export const meta = {
  name: "battle-grass-scale",
  kind: "visual",
  world: "battle-real",
  tier: "full",
  snapshots: ["battle-grass-soldier-scale"],
  describe: "Close battlefield view pins grass height and blade width against standing soldiers.",
};

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1600, height: 900 } });
  try {
    await page.goto(`${ctx.target}?map=A&ai=off`);
    await page.waitForFunction(() => window.__game, undefined, { timeout: 60000 });
    await page.evaluate(() => window.__game.freeze(true));
    await battleRendererReady(page);
    await page.evaluate(() => {
      const unit = window.__game.unitInfo(0);
      const camera = window.__cam;
      camera.yaw = 0;
      camera.pitchBias = 0;
      camera.zoom = 9.5;
      camera.setViewCenter(unit[0], unit[1] - 2);
      camera.clampView?.();
    });
    await page.evaluate(() => window.__game.freezeAtTick(240));
    await page.waitForFunction(
      () => !window.__game.stats().renderStats.terrain.grass.rebuild.pending,
    );
    await page.evaluate(() => window.__game.freezeAtTick(240));
    await ctx.snap(null, "battle-grass-soldier-scale", {
      shot: await page.screenshot({ animations: "disabled" }),
      threshold: 0,
      maxDiffRatio: 0,
    });
  } finally {
    await page.close();
  }
}
