import { battleDuel } from './worlds.mjs';

export const meta = {
  name: 'battle-mechanics',
  kind: 'flow',
  world: 'battle-duel',
  tier: 'full',
  snapshots: [],
  describe: 'Pivot, stamina recovery, and heavy-v-heavy melee smoke checks.',
};

export async function run(ctx) {
  const mech = await battleDuel(ctx, { errorPrefix: 'mech' });

  const h0 = await mech.evaluate(() => window.__game.unitInfo(0));
  await mech.evaluate(([x, y]) => {
    window.__game.setOrder(0, x, y - 80);
    window.__game.advance(500);
  }, [h0[0], h0[1]]);
  const midPivot = await mech.evaluate(() => window.__game.unitInfo(0));
  ctx.check('pivot keeps cohesion (no rag)', midPivot[4] > 0.3, `cohesion mid-pivot ${midPivot[4].toFixed(2)}`);
  await mech.evaluate(() => window.__game.advance(5400));
  const postPivot = await mech.evaluate(() => window.__game.unitInfo(0));
  const facingErr = Math.abs(postPivot[2] + Math.PI / 2);
  ctx.check('unit completed the 180', postPivot[12] === 0 && postPivot[4] > 0.85 && facingErr < 0.5,
    `facing ${postPivot[2].toFixed(2)} rad, cohesion ${postPivot[4].toFixed(2)}, target ${postPivot[12]}`);

  const la = await mech.evaluate(() => window.__game.unitInfo(0));
  await mech.evaluate(([x, y]) => {
    window.__game.setPace(0, 1);
    window.__game.setOrder(0, x + 250, y);
    window.__game.advance(1800);
  }, [la[0], la[1]]);
  const ran = await mech.evaluate(() => window.__game.unitInfo(0));
  ctx.check('running drains stamina', ran[8] < 0.75, `stamina ${ran[8].toFixed(2)} after 60s run`);
  await mech.evaluate(() => {
    const i = window.__game.unitInfo(0);
    window.__game.setPace(0, 0);
    window.__game.setOrder(0, i[0], i[1]);
    window.__game.advance(4500);
  });
  const rested = await mech.evaluate(() => window.__game.unitInfo(0));
  ctx.check('rest recovers stamina', rested[8] > ran[8] + 0.08, `stamina ${ran[8].toFixed(2)} -> ${rested[8].toFixed(2)}`);
  await mech.close();

  const meleePage = await battleDuel(ctx, { errorPrefix: 'melee' });
  const peakEngaged = await meleePage.evaluate(() => {
    window.__game.setPace(0, 1);
    window.__game.setPace(1, 1);
    window.__game.attackOrder(0, 1);
    window.__game.attackOrder(1, 0);
    window.__game.advance(2200);
    let peak = 0;
    for (let k = 0; k < 12; k++) {
      window.__game.advance(200);
      peak = Math.max(peak, window.__game.unitInfo(0)[16]);
    }
    return peak;
  });
  ctx.check('units are engaged mid-fight', peakEngaged > 20, `${peakEngaged} fighting at the peak`);
  const red = await meleePage.evaluate(() => window.__game.unitInfo(0));
  const blue = await meleePage.evaluate(() => window.__game.unitInfo(1));
  const redLosses = red[7] - red[15];
  const blueLosses = blue[7] - blue[15];
  ctx.check('melee inflicts casualties', redLosses + blueLosses > 3,
    `losses red ${redLosses} / blue ${blueLosses}`);
  ctx.check('melee is a grind, not annihilation', red[15] + blue[15] > 250,
    `${red[15]}/${red[7]} and ${blue[15]}/${blue[7]} still standing`);
  await meleePage.close();
}
