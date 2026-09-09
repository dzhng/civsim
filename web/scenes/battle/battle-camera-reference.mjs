import { reportedHighlandSetup } from "../_battle-reported-highland.mjs";
import { battleRendererReady } from "../worlds.mjs";

export const meta = {
  name: "battle-camera-reference",
  kind: "visual",
  world: "battle-real",
  tier: "full",
  snapshots: ["camera-reference-overview", "camera-reference-oblique", "camera-reference-closest"],
  describe: "Automatic zoom framing across the three supplied army-scale camera references.",
};

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1600, height: 900 } });
  try {
    await page.goto(
      `${ctx.target}/battle/run?${new URLSearchParams({
        setup: JSON.stringify({ ...reportedHighlandSetup, generatedSeed: "2062736894" }),
      })}`,
    );
    await page.waitForFunction(() => window.__game, undefined, { timeout: 300000 });
    await page.evaluate(() => window.__game.freeze(true));
    await battleRendererReady(page, 300000);
    // Camera framing owns the world pixels; the HUD has its own visual gates.
    await page.addStyleTag({ content: "#battle-hud { visibility: hidden !important; }" });
    await page.evaluate(() => window.__game.freezeAtTick(120));
    // Distances reproduce the visible soldier/formation scales in the supplied
    // references. The side-on middle view preserves its original heading.
    for (const [name, distance, yaw, center] of [
      ["overview", 500, -Math.PI / 2, [0, -590]],
      ["oblique", 100, 0, [-25, -600]],
      ["closest", 0, -Math.PI / 2, [-10, -574]],
    ]) {
      await page.evaluate(
        ({ distance, yaw, center }) => {
          const c = window.__cam;
          c.resetLook();
          c.yaw = yaw;
          c.zoom = 3;
          c.setViewCenter(...center);
          if (distance) c.zoomAt(800, 450, c.params().distance / distance);
          else c.zoomAt(800, 450, 1e6);
          c.setViewCenter(...center);
        },
        { distance, yaw, center },
      );
      await page.waitForFunction(
        () => !window.__game.stats().renderStats.terrain.grass.rebuild.pending,
        undefined,
        { timeout: 300000 },
      );
      await page.evaluate(() => window.__game.freezeAtTick(120));
      await ctx.snap(null, `camera-reference-${name}`, {
        shot: await page.screenshot({ animations: "disabled" }),
        threshold: 0,
        maxDiffRatio: 0,
      });
    }
  } finally {
    await page.close();
  }
}
