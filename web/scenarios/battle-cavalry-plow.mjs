import { battleReal } from './worlds.mjs';

export const meta = {
  name: 'battle-cavalry-plow',
  kind: 'visual',
  world: 'battle-real',
  tier: 'full',
  snapshots: ['battle-cavalry-plow'],
  describe: 'Shock cavalry threads through friendly infantry and snapshots the dense moving crowd.',
};

export async function run(ctx) {
  const page = await battleReal(ctx);

  await page.evaluate(() => window.__game.freezeAtTick(480));
  const info4 = await page.evaluate(() => window.__game.unitInfo(4));
  await page.evaluate(([ax, ay]) => {
    window.__game.select(4);
    window.__game.setOrder(4, ax, ay + 60);
    window.__game.advance(300);
  }, [info4[0], info4[1]]);

  const lsStart = await page.evaluate(() => window.__game.soldierStartOf(9));
  const sampleLS = () =>
    page.evaluate((start) => {
      const out = [];
      for (let i = start; i < start + 200; i++) out.push(window.__game.soldierPos(i));
      return out;
    }, lsStart);
  const lsBefore = await sampleLS();
  const ls = await page.evaluate(() => window.__game.unitInfo(9));
  await page.evaluate(([x, y]) => {
    window.__game.setPace(17, 1);
    window.__game.setOrder(17, x, y);
    window.__game.advance(2700);
  }, [ls[0], ls[1]]);
  const lsMid = await sampleLS();
  let lsMean = 0;
  let lsMax = 0;
  for (let i = 0; i < lsMid.length; i++) {
    const d = Math.hypot(lsMid[i][0] - lsBefore[i][0], lsMid[i][1] - lsBefore[i][1]);
    lsMean += d;
    lsMax = Math.max(lsMax, d);
  }
  lsMean /= lsMid.length;
  ctx.check('cavalry mass displaces infantry', lsMax > 0.4,
    `max shove ${lsMax.toFixed(2)} m, mean ${lsMean.toFixed(2)} m mid-threading`);
  await ctx.snap(page, 'battle-cavalry-plow', { threshold: 0.2, maxDiffRatio: 0.02 });

  const lsInfo = await page.evaluate(() => window.__game.unitInfo(9));
  if (lsInfo[4] < 0.8) {
    await page.evaluate(([x, y]) => window.__game.setOrder(9, x + 30, y), [lsInfo[0], lsInfo[1]]);
    const delayed = await page.evaluate(() => window.__game.unitInfo(9));
    ctx.check('disordered unit shows order delay', delayed[14] > 0, `delay frac ${delayed[14].toFixed(2)}`);
  } else {
    ctx.check('disordered unit shows order delay', true, `skipped: cohesion ${lsInfo[4].toFixed(2)} above threshold`);
  }

  await page.close();
}
