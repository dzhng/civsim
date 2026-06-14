// Vibe check: a 1v1 duel, screenshotted every 30 sim-seconds until one side
// breaks. Both blocks charge each other (ai off). Default is heavy-vs-heavy;
// override the matchup with class ids: `A=3 B=6 node vibe/1v1.mjs` (phalanx vs
// cavalry). Eyeball the frames in web/vibe/shots/1v1/ — do the lines meet and
// grind, does one rout, does nobody get launched into orbit?
import { openBattle, vibeCapture } from './_lib.mjs';

const A = Number(process.env.A ?? 0); // class id, 0 = HeavyInfantry
const B = Number(process.env.B ?? 0);

const { browser, page, errs } = await openBattle(`battle=duel&a=${A}&b=${B}&ai=off`);

// Both blocks charge each other at a run.
await page.evaluate(() => {
  window.__game.setPace(0, 1); window.__game.setPace(1, 1);
  window.__game.attackOrder(0, 1); window.__game.attackOrder(1, 0);
});

const frame = () => page.evaluate(() => {
  // Fit both units (centroids + a margin): ~2.5 holds both lines when they
  // spawn ~400 m apart, ~20 reads individual men once they collide.
  const a = window.__game.unitInfo(0), b = window.__game.unitInfo(1);
  const cv = document.getElementById('battlefield');
  const spanX = Math.abs(a[32] - b[32]) + 55, spanY = Math.abs(a[33] - b[33]) + 55;
  const c = window.__cam;
  c.x = (a[32] + b[32]) / 2; c.y = (a[33] + b[33]) / 2; c.pitch = 0;
  c.zoom = Math.max(2.5, Math.min(20, Math.min(cv.width / spanX, cv.height / spanY)));
  c.clampView?.();
});

const sample = () => page.evaluate(() => {
  const a = window.__game.unitInfo(0), b = window.__game.unitInfo(1);
  return {
    victor: window.__game.stats().victor,
    aAlive: a[15], aTotal: a[7], aCoh: a[4], aFight: a[16],
    bAlive: b[15], bTotal: b[7], bCoh: b[4], bFight: b[16],
  };
});

const label = (secs, s) =>
  `t=${String(secs).padStart(3)}s  blue ${s.aAlive}/${s.aTotal} (coh ${s.aCoh.toFixed(2)})  `
  + `red ${s.bAlive}/${s.bTotal} (coh ${s.bCoh.toFixed(2)})  fighting ${s.aFight}/${s.bFight}  victor ${s.victor}`;

const { shots, resolved, dir } = await vibeCapture(page, '1v1', {
  frame, sample, label, done: (s) => s.victor >= 0,
});

console.log(resolved ? `\nresolved in ${shots.length} frames -> ${dir}` : `\nUNRESOLVED -> ${dir}`);
if (errs.length) console.log('page errors:', errs.slice(0, 3));
await browser.close();
