import { battleDuel } from "../worlds.mjs";
import { UNIT_INFO } from "../_battle-unit-info.mjs";

export const meta = {
  name: "battle-formation-drag",
  kind: "visual",
  world: "battle-duel",
  tier: "full",
  snapshots: ["formation-drag-narrow", "formation-drag-wide"],
  describe: "A held front-edge drag keeps its left corner while widening and shedding ranks.",
};

export async function run(ctx) {
  const page = await battleDuel(ctx, { a: 12, b: 12, ai: "off", timeout: 300000 });
  try {
    await page.addStyleTag({ content: "#battle-hud { visibility: hidden !important; }" });
    await page.evaluate(async (info) => {
      const c = window.__cam,
        g = window.__game,
        u = g.unitInfo(0);
      g.select(0);
      c.resetLook();
      c.zoom = 3;
      c.zoomAt(640, 400, c.params().distance / 100);
      c.setViewCenter(u[info.x], u[info.y] + 20);
      await g.freezeAtTick(240);
    }, UNIT_INFO);
    const points = await page.evaluate((info) => {
      const c = window.__cam,
        g = window.__game,
        u = g.unitInfo(0);
      return [0, 12, 30].map((width) => {
        const x = u[info.x] - 15 + width,
          y = u[info.y] + 35;
        return c.worldToScreen(x, y, g.heightAt(x, y)).map(Math.round);
      });
    }, UNIT_INFO);
    await page.mouse.move(...points[0]);
    await page.mouse.down({ button: "right" });
    for (const [name, end] of [
      ["narrow", points[1]],
      ["wide", points[2]],
    ]) {
      const tick = name === "narrow" ? 240 : 241;
      await page.mouse.move(...end, { steps: 4 });
      await page.evaluate((t) => window.__game.freezeAtTickWithEffects(t), tick);
      await page.waitForFunction(
        () => !window.__game.stats().renderStats.terrain.grass.rebuild.pending,
        undefined,
        { timeout: 300000 },
      );
      await page.evaluate((t) => window.__game.freezeAtTickWithEffects(t), tick);
      await ctx.snap(null, `formation-drag-${name}`, {
        shot: await page.screenshot({ animations: "disabled" }),
        threshold: 0,
        maxDiffRatio: 0,
      });
    }
    await page.mouse.up({ button: "right" });
  } finally {
    await page.close();
  }
}
