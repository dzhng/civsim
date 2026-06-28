import { battleReal } from '../worlds.mjs';

export const meta = {
  name: 'battle-smoke',
  kind: 'flow',
  world: 'battle-real',
  tier: 'quick',
  snapshots: ['battle-initial', 'battle-banner', 'battle-manual'],
  describe: 'Large battle boot, render snapshots, basic movement, and perf health.',
};

export async function run(ctx) {
  const { check, snap } = ctx;
  const page = await battleReal(ctx);

  const stats = await page.evaluate(() => window.__game.stats());
  check('full battle spawned', stats.soldiers >= 15000 && stats.units === 40,
    `${stats.soldiers} soldiers, ${stats.units} units`);

  const camFit = await page.evaluate(() => {
    const c = window.__cam;
    const cv = document.getElementById('battlefield');
    const old = { x: c.x, y: c.y, zoom: c.zoom, pitch: c.pitch };
    c.pitch = 0;
    c.zoom = 0.001;
    c.x = 999999;
    c.y = -999999;
    c.clampView?.();
    const [x0, y0, x1, y1] = c.bounds;
    const fieldW = x1 - x0;
    const fieldH = y1 - y0;
    const fit = Math.min(cv.width / fieldW, cv.height / fieldH);
    const out = {
      zoom: c.zoom,
      fit,
      x: c.x,
      y: c.y,
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      viewW: cv.width / c.zoom,
      viewH: cv.height / c.zoom,
      fieldW,
      fieldH,
    };
    Object.assign(c, old);
    c.clampView?.();
    return out;
  });
  check('battle camera zoom-out fits the playable field',
    camFit.zoom >= camFit.fit * 0.999 && camFit.viewW >= camFit.fieldW * 0.999 && camFit.viewH >= camFit.fieldH * 0.999,
    `zoom ${camFit.zoom.toFixed(3)}, fit ${camFit.fit.toFixed(3)}`);
  check('battle camera cannot pan away when fully zoomed out',
    Math.abs(camFit.x - camFit.cx) < 0.01 && Math.abs(camFit.y - camFit.cy) < 0.01,
    `camera (${camFit.x.toFixed(1)},${camFit.y.toFixed(1)}) center (${camFit.cx.toFixed(1)},${camFit.cy.toFixed(1)})`);

  // Pixel regression on deterministic battle states: fixed tick, camera, and
  // frozen shader clock. SwiftShader has a tiny sub-pixel wobble on silhouettes.
  await page.evaluate(() => window.__game.freezeAtTick(240));
  await page.waitForTimeout(150);
  await snap(page, 'battle-initial', { maxDiffRatio: 0.0008 });
  await page.evaluate(() => window.__game.freeze(false));

  await page.evaluate(() => {
    const a = window.__game.unitInfo(0);
    const c = window.__cam;
    c.x = a[30];
    c.y = a[31] + 2;
    c.zoom = 13;
    c.clampView?.();
  });
  await page.evaluate(() => window.__game.freezeAtTick(480));
  await page.waitForTimeout(150);
  await snap(page, 'battle-banner', { maxDiffRatio: 0.0008 });

  await page.click('#btn-menu');
  await page.click('#pause-manual');
  const manualLen = await page.evaluate(() => document.getElementById('manual').innerHTML.length);
  check('the field manual opens in-game', manualLen > 4000, `${manualLen} chars`);
  await snap(page, 'battle-manual', { maxDiffRatio: 0.0008 });
  await page.evaluate(() => { document.getElementById('manual').style.display = 'none'; });

  const info4 = await page.evaluate(() => window.__game.unitInfo(4));
  const s4 = await page.evaluate(() => window.__game.soldierStartOf(4));
  const before = await page.evaluate((i) => window.__game.soldierPos(i), s4);
  await page.evaluate(([ax, ay]) => {
    window.__game.select(4);
    window.__game.setOrder(4, ax, ay + 60);
    window.__game.advance(300);
  }, [info4[0], info4[1]]);
  const after = await page.evaluate((i) => window.__game.soldierPos(i), s4);
  const moved = Math.hypot(after[0] - before[0], after[1] - before[1]);
  check('ordered unit marches', moved > 5, `soldier moved ${moved.toFixed(1)} m`);
  const mid4 = await page.evaluate(() => window.__game.unitInfo(4));
  check('unit is in motion', mid4[3] > 0.3, `speed ${mid4[3].toFixed(2)} m/s`);
  check('cohesion responds to maneuver', mid4[4] < 0.998, `cohesion ${mid4[4].toFixed(3)}`);

  await page.evaluate(() => window.__game.freeze(false));
  await page.waitForTimeout(3000);
  const statsPre = await page.evaluate(() => window.__game.stats());
  const stats2 = await page.evaluate(() => window.__game.stats());
  check('tick under budget', stats2.tickMs < 60, `${stats2.tickMs.toFixed(2)} ms avg at ${stats2.soldiers} soldiers`);
  check('frame rate alive (headless/software GL)', statsPre.fps > 4, `${statsPre.fps.toFixed(0)} fps`);

  await page.close();
}
