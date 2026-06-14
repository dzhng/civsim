// Vibe check: DEFENSE against MULTIPLE columns. A wide HELD line takes three
// narrow columns punching through it at once — the breach logic has to
// generalize (each column dimples the cloth locally, the line stays connected
// between them). Eyeball web/vibe/shots/multi-penetration/.
//
// Built with the raw spawn hook (light-infantry stats), spawned clear of the
// duel's two idle units up north so they sit off-frame.
import { openBattle, vibeCapture } from './_lib.mjs';

const { browser, page, errs } = await openBattle('battle=duel&a=0&b=0&ai=off');

// Spawn the scenario north of the idle duel pair: a wide held line (team 0) and
// three narrow columns (team 1) above it, each driving down through it.
const units = await page.evaluate(() => {
  const HP = Math.PI / 2;
  const X = 200; // east of the duel pair (at x=0), so they stay off-frame
  const LANES = [-65, 0, 65]; // far apart -> three DISTINCT breaches, not one merged bulge
  // a very wide held line at y=0 facing north (600/150 = 4 ranks)
  const def = window.__game.spawnUnit(X, 0, HP, 600, 150, 0);
  const cols = LANES.map((dx) => window.__game.spawnUnit(X + dx, 110, -HP, 90, 8, 1));
  for (let k = 0; k < cols.length; k++) {
    window.__game.setPace(cols[k], 1);
    // PLAIN move (no pursue) straight INTO the line on its own lane and hold —
    // pursue would make all three chase the centre and merge to one bulge; a
    // through-target lets them walk out the back without bogging. Aim AT the
    // line so each column drives in and sticks, bulging its own spot.
    window.__game.setOrder(cols[k], X + LANES[k], -5);
  }
  return { def, cols };
});

const ids = await page.evaluate((u) => [u.def, ...u.cols], units);

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
  const d = window.__game.unitInfo(ids[0]);
  return { defAlive: d[15], defTotal: d[7], defCoh: d[4] };
}, ids);
const label = (s, m) => `t=${String(s).padStart(3)}s  defender ${m.defAlive}/${m.defTotal} (coh ${m.defCoh.toFixed(2)})`;

const { shots, dir } = await vibeCapture(page, 'multi-penetration', {
  stepSecs: 12, maxSteps: 14, frame, sample, label, done: () => false,
});
console.log(`\n${shots.length} frames -> ${dir}`);
if (errs.length) console.log('page errors:', errs.slice(0, 3));
await browser.close();
