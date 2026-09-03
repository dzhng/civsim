import { readFile } from "node:fs/promises";
import { approachTilesForCity, nearestIndependentCityFromRoma } from "../_campaign-map-helpers.mjs";
import { hasBattleWorldDepthContract } from "../_renderer-contract.mjs";
import { ready } from "../worlds.mjs";

export const meta = {
  name: "campaign-reinforcements",
  kind: "flow",
  world: "campaign-real",
  tier: "full",
  snapshots: [],
  describe: "Normal WebGPU campaign battle receives and renders a nearby reinforcement stack.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "campaign WebGPU reinforcements require VERIFY_GPU=1",
      true,
      "set VERIFY_GPU=1 to exercise the WebGPU campaign adapter",
    );
    return;
  }

  const map = JSON.parse(
    await readFile(new URL("../../public/data/campaign-map.json", import.meta.url)),
  );
  const target = nearestIndependentCityFromRoma(map);
  const approach = approachTilesForCity(map, target.index);
  ctx.check(
    "found a reinforcement approach to an independent city near Roma",
    target.index >= 0 && approach.edgeIndex >= 0,
    `${target.name} at ${Math.round(target.distanceKm)}km, edge ${approach.edgeIndex}`,
  );

  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "campaign-reinforcements",
  });
  await page.goto(ctx.target);
  await page.waitForFunction(() => window.__appShellStats?.gpu?.ok === true, undefined, {
    timeout: 18000,
  });
  await page.click("#menu-new-campaign");
  await ready(page, "__campaignReady", 30000);

  const staged = await page.evaluate(
    ([edgeIndex, mainTile, detachmentTile]) => {
      const c = window.__campaign;
      const before = c.armies().length;
      const main = c.armies().filter((army) => army.mine)[0];
      const splitOk = c.orderSplit(main.id, 0b10);
      const afterSplit = c.armies();
      const detachment = afterSplit
        .filter((army) => army.mine)
        .find((army) => army.id !== main.id && army.soldiers > 0);
      if (edgeIndex >= 0 && detachment) {
        c.place(main.id, 1, edgeIndex, mainTile);
        c.place(detachment.id, 1, edgeIndex, detachmentTile);
      }
      const afterPlace = c.armies();
      const placedMain = afterPlace.find((army) => army.id === main.id);
      const placedDetachment = detachment
        ? afterPlace.find((army) => army.id === detachment.id)
        : null;
      return {
        splitOk,
        before,
        after: afterSplit.length,
        mainId: main.id,
        detachmentId: detachment?.id ?? -1,
        mainSoldiers: placedMain?.soldiers ?? 0,
        detachmentSoldiers: placedDetachment?.soldiers ?? 0,
        distance:
          placedMain && placedDetachment
            ? Math.hypot(placedMain.x - placedDetachment.x, placedMain.y - placedDetachment.y)
            : -1,
      };
    },
    [approach.edgeIndex, approach.mainTile, approach.detachmentTile],
  );
  ctx.check(
    "split detaches and stages a nearby reinforcement stack",
    staged.splitOk === true &&
      staged.after === staged.before + 1 &&
      staged.detachmentId >= 0 &&
      staged.mainSoldiers > 0 &&
      staged.detachmentSoldiers > 0 &&
      staged.distance > 0 &&
      staged.distance < 60,
    JSON.stringify(staged),
  );

  let pending = { eid: -1, encounter: null };
  await page.evaluate((targetIndex) => {
    const main = window.__campaign.armies().filter((army) => army.mine)[0];
    window.__campaign.orderMove(main.id, 0, targetIndex, 0);
  }, target.index);
  for (let i = 0; i < 40 && pending.eid < 0; i++) {
    pending = await page.evaluate(() => {
      window.__campaign.tick(2000);
      const eid = window.__campaign.battleReady();
      return {
        eid,
        encounter: eid >= 0 ? JSON.parse(window.__campaign.encounterJson(eid)) : null,
      };
    });
  }
  ctx.check(
    "campaign forms a pending battle with reinforcements",
    pending.eid >= 0 && pending.encounter?.reinforcements > 0,
    JSON.stringify(pending),
  );

  await page.keyboard.press("1");
  await page.waitForSelector(".cmp-box", { timeout: 8000 });
  const modal = await page.evaluate(() => document.querySelector(".cmp-box")?.textContent ?? "");
  ctx.check(
    "initiation modal announces reinforcements",
    /will join/.test(modal),
    modal.replace(/\s+/g, " ").slice(0, 140),
  );

  await page.click("#cmp-fight");
  await page.waitForFunction(
    () => {
      const stats = window.__game?.stats?.();
      return (
        window.__ready === true &&
        stats?.renderer === "gpu" &&
        stats.renderStats?.ready === true &&
        stats.renderStats.soldiers === stats.soldiers
      );
    },
    undefined,
    { timeout: 30000 },
  );
  const initialBattle = await page.evaluate(() => window.__game.stats());
  const baseSoldiers = pending.encounter.attacker.soldiers + pending.encounter.defender.soldiers;
  const arrival = await page.evaluate((base) => {
    let stats = window.__game.stats();
    const trace = [{ step: 0, units: stats.units, soldiers: stats.soldiers }];
    for (let step = 1; step <= 90 && stats.soldiers <= base; step++) {
      window.__game.advance(600);
      stats = window.__game.stats();
      if (step % 10 === 0 || stats.soldiers > base) {
        trace.push({ step, units: stats.units, soldiers: stats.soldiers });
      }
    }
    return { stats, trace };
  }, baseSoldiers);
  await page.evaluate(() => window.__game.freezeAtTick(window.__game.tickCount()));
  const rendered = await page.evaluate(() => window.__game.stats());
  ctx.check(
    "reinforcement column arrives and renders in the WebGPU battle",
    rendered.renderer === "gpu" &&
      rendered.soldiers > baseSoldiers &&
      rendered.renderStats?.soldiers === rendered.soldiers &&
      rendered.renderStats?.expectedSoldiers === rendered.soldiers &&
      hasBattleWorldDepthContract(rendered.renderStats),
    JSON.stringify({
      units: [initialBattle.units, rendered.units],
      soldiers: [initialBattle.soldiers, rendered.soldiers],
      baseSoldiers,
      trace: arrival.trace,
      renderStats: rendered.renderStats,
    }),
  );

  await page.close();
}
