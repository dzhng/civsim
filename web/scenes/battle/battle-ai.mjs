import { battle5v5 } from "../worlds.mjs";

export const meta = {
  name: "battle-ai",
  kind: "flow",
  world: "battle-5v5",
  tier: "full",
  snapshots: ["battle-ai"],
  describe: "Small AI battle advances, fights, shoots, and renders its end state.",
};

export async function run(ctx) {
  const page = await battle5v5(ctx, { ai: "on", errorPrefix: "ai" });

  await page.evaluate(() => window.__game.freezeAtTick(30));
  const ammoBefore = await page.evaluate(() => {
    const rows = [];
    for (let u = 0; u < window.__game.stats().units; u++) rows.push(window.__game.unitInfo(u)[19]);
    return rows;
  });
  await page.evaluate(() => window.__game.advance(6000));
  const aiState = await page.evaluate(() => {
    let blueMoved = 0;
    let dead = 0;
    const ammoAfter = [];
    for (let u = 0; u < window.__game.stats().units; u++) {
      const i = window.__game.unitInfo(u);
      dead += i[7] - i[15];
      ammoAfter.push(i[19]);
      if (i[6] === 1 && i[1] < 100) blueMoved++;
    }
    return { blueMoved, dead, ammoAfter };
  });
  const ammoSpent = ammoBefore.reduce(
    (sum, before, u) => sum + Math.max(0, before - aiState.ammoAfter[u]),
    0,
  );
  ctx.check(
    "the AI advances its army",
    aiState.blueMoved >= 3,
    `${aiState.blueMoved} blue units left their line`,
  );
  ctx.check("the AI fights", aiState.dead > 300, `${aiState.dead} casualties`);
  ctx.check("archers volley the attackers on their own", ammoSpent > 0, `${ammoSpent} shots spent`);
  await page.evaluate(() => {
    const g = document.getElementById("gameover");
    if (g) g.style.display = "none";
  });
  await ctx.snap(page, "battle-ai", { threshold: 0.2, maxDiffRatio: 0.02 });

  await page.close();
}
