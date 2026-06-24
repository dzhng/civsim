import { battleReal } from './worlds.mjs';

export const meta = {
  name: 'battle-cluster',
  kind: 'flow',
  world: 'battle-real',
  tier: 'full',
  snapshots: [],
  describe: 'Long 30k group-move check for cluster formation behavior.',
};

export async function run(ctx) {
  const page = await battleReal(ctx);
  await page.evaluate(() => window.__game.freezeAtTick(480));

  const clusterResult = await page.evaluate(() => {
    const before = [5, 6, 7].map((u) => {
      const i = window.__game.unitInfo(u);
      return [i[0], i[1]];
    });
    window.__game.groupMove([5, 6, 7], 250, -350);
    window.__game.advance(8200);
    const after = [5, 6, 7].map((u) => {
      const i = window.__game.unitInfo(u);
      return [i[0], i[1]];
    });
    return { before, after };
  });

  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const pairBefore = d(clusterResult.before[0], clusterResult.before[1]);
  const pairAfter = d(clusterResult.after[0], clusterResult.after[1]);
  const cavBefore = d(clusterResult.before[0], clusterResult.before[2]);
  const cavAfter = d(clusterResult.after[0], clusterResult.after[2]);
  ctx.check('cluster keeps line formation', Math.abs(pairAfter - pairBefore) < 25,
    `pair spacing ${pairBefore.toFixed(0)}m -> ${pairAfter.toFixed(0)}m`);
  ctx.check('far unit combines at the destination', cavAfter < cavBefore * 0.7 && cavAfter < 280,
    `detached-unit gap ${cavBefore.toFixed(0)}m -> ${cavAfter.toFixed(0)}m (compressed star: main radius + unit radius + margin)`);

  await page.close();
}
