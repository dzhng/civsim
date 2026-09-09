import { battleDuel } from "../worlds.mjs";
import { UNIT_INFO } from "../_battle-unit-info.mjs";

export const meta = {
  name: "battle-formation-orders",
  kind: "flow",
  world: "battle-duel",
  tier: "quick",
  snapshots: [],
  describe: "A formation order replaces only selected units' pending group-attack intent.",
};
export async function run(ctx) {
  const page = await battleDuel(ctx, { a: 12, b: 12, ai: "off", timeout: 300000 });
  try {
    const setup = await page.evaluate(async (info) => {
      const g = window.__game,
        c = window.__cam,
        u = g.unitInfo(0);
      g.freeze(true);
      const ally = g.spawnUnit(u[info.x] + 30, u[info.y], Math.PI / 2, 120, 12, 0);
      g.groupAttack([0, ally], 1);
      g.select(0);
      c.resetLook();
      c.zoom = 3;
      c.zoomAt(640, 400, c.params().distance / 150);
      c.setViewCenter(u[info.x], u[info.y] + 10);
      await g.freezeAtTick(240);
      const points = [
        [u[info.x] - 15, u[info.y] - 10],
        [u[info.x] + 15, u[info.y] - 10],
      ];
      return {
        ally,
        points: points.map((p) => c.worldToScreen(...p, g.heightAt(...p)).map(Math.round)),
      };
    }, UNIT_INFO);
    await page.mouse.move(...setup.points[0]);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(...setup.points[1], { steps: 6 });
    await page.mouse.up({ button: "right" });
    const result = await page.evaluate(
      ({ ally, info }) => {
        const g = window.__game;
        // Let the unselected unit reach the group's approach point, then deliver
        // its final attack; renderer timing is irrelevant to this order-state check.
        for (let i = 0; i < 40; i++) g.advance(60);
        return { selected: g.unitInfo(0)[info.mode], other: g.unitInfo(ally)[info.mode] };
      },
      { ally: setup.ally, info: UNIT_INFO },
    );
    ctx.check(
      "unselected group member still receives its attack",
      result.other === 1,
      JSON.stringify(result),
    );
    ctx.check(
      "selected member keeps its replacement formation order",
      result.selected === 0,
      JSON.stringify(result),
    );
  } finally {
    await page.close();
  }
}
