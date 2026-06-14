// Vibe check: a unit SURROUNDED (3v1). A single 16x16 SQUARE block (team 0) is
// closed on from front, side, AND back. Does the weave hold the square under
// pressure from every direction, or does it mess up? Then with ATTACK=1 the
// middle attacks the unit to its FRONT, so we see how OFFENSE behaves while the
// unit is pressed from its side and back at the same time.
//   node vibe/surround.mjs              # middle holds (square defence)
//   ATTACK=1 node vibe/surround.mjs     # middle attacks out, surrounded
import { openBattle, vibeCapture } from './_lib.mjs';

const ATTACK = process.env.ATTACK === '1';
const { browser, page, errs } = await openBattle('battle=duel&a=0&b=0&ai=off');

const units = await page.evaluate((attack) => {
  const X = 200; // east of the idle duel pair, off-frame
  const N = Math.PI / 2, S = -Math.PI / 2, W = Math.PI;
  // middle: a 256-man, 16-file SQUARE (team 0), facing north
  const mid = window.__game.spawnUnit(X, 0, N, 256, 16, 0);
  // three attackers (team 1): front (north), side (east), back (south)
  const front = window.__game.spawnUnit(X, 55, S, 130, 13, 1);
  const side = window.__game.spawnUnit(X + 55, 0, W, 130, 13, 1);
  const back = window.__game.spawnUnit(X, -55, N, 130, 13, 1);
  for (const u of [front, side, back]) { window.__game.setPace(u, 1); window.__game.attackMove(u, X, 0); }
  if (attack) { window.__game.setPace(mid, 1); window.__game.attackMove(mid, X, 30); } // sally into the FRONT unit
  return { mid, front, side, back };
}, ATTACK);
const ids = await page.evaluate((u) => [u.mid, u.front, u.side, u.back], units);

const frame = () => page.evaluate((ids) => {
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const u of ids) {
    const cnt = window.__game.unitInfo(u)[7];
    const start = window.__game.soldierStartOf(u);
    for (let i = start; i < start + cnt; i++) {
      const [x, y] = window.__game.soldierPos(i);
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
  }
  const cv = document.getElementById('battlefield');
  const c = window.__cam;
  c.pitch = 0; c.x = (minx + maxx) / 2; c.y = (miny + maxy) / 2;
  c.zoom = Math.max(3, Math.min(20, Math.min(cv.width / (maxx - minx + 40), cv.height / (maxy - miny + 40))));
  c.clampView?.();
}, ids);
const sample = () => page.evaluate((ids) => {
  const m = window.__game.unitInfo(ids[0]);
  return { midAlive: m[15], midTotal: m[7], midCoh: m[4] };
}, ids);
const label = (s, m) => `t=${String(s).padStart(3)}s  middle ${m.midAlive}/${m.midTotal} (coh ${m.midCoh.toFixed(2)})`;

const { shots, dir } = await vibeCapture(page, process.env.NAME ?? (ATTACK ? 'surround-attack' : 'surround'), {
  stepSecs: 12, maxSteps: 16, frame, sample, label, done: () => false,
});
console.log(`\n${shots.length} frames -> ${dir}`);
if (errs.length) console.log('page errors:', errs.slice(0, 3));
await browser.close();
