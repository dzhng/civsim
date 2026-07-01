import { battleReal } from "../worlds.mjs";

export const meta = {
  name: "battle-cavalry-plow",
  kind: "visual",
  world: "battle-real",
  tier: "full",
  snapshots: ["battle-cavalry-plow"],
  describe: "Shock cavalry threads through friendly infantry — snapshots the dense moving crowd.",
};

// VISUAL only: pose a cavalry unit threading up through friendly infantry and
// snapshot the dense moving crowd. The PHYSICS (mass shoves men aside, disorder
// delays orders) is pinned in Rust — `cavalry_mass_shoves_through_infantry` and
// `disordered_unit_delays_orders_with_visible_timer`. Here we only guard the look.
export async function run(ctx) {
  const page = await battleReal(ctx);

  await page.evaluate(() => window.__game.freezeAtTick(480));
  const info4 = await page.evaluate(() => window.__game.unitInfo(4));
  await page.evaluate(
    ([ax, ay]) => {
      window.__game.select(4);
      window.__game.setOrder(4, ax, ay + 60);
      window.__game.advance(300);
    },
    [info4[0], info4[1]],
  );

  const ls = await page.evaluate(() => window.__game.unitInfo(9));
  await page.evaluate(
    ([x, y]) => {
      window.__game.setPace(17, 1);
      window.__game.setOrder(17, x, y);
      window.__game.advance(2700);
    },
    [ls[0], ls[1]],
  );

  await ctx.snap(page, "battle-cavalry-plow", { threshold: 0.2, maxDiffRatio: 0.02 });
  await page.close();
}
