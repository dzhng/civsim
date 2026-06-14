// Vibe check: OFFENSE — a wide ATTACKING line drives onto a narrow enemy block.
// The line's overlapping flanks should wrap inward and ENVELOP the block (the
// cloth blown into the ball). Eyeball web/vibe/shots/offense/.
//   Default heavy vs heavy. Override classes: ATK=6 DEF=0 node vibe/offense.mjs
import { openBattle, vibeCapture, CLS } from './_lib.mjs';

const ATK = Number(process.env.ATK ?? CLS.heavy); // unit 0, the wide attacking line
const DEF = Number(process.env.DEF ?? CLS.heavy); // unit 1, the narrow enemy

const { browser, page, errs } = await openBattle(`battle=duel&a=${ATK}&b=${DEF}&ai=off`);
await page.evaluate(() => {
  window.__game.setFiles(0, 70); // attacker: WIDE line
  window.__game.setFiles(1, 10); // enemy: NARROW block
  window.__game.setPace(0, 1);
  const d = window.__game.unitInfo(1);
  window.__game.attackMove(0, d[32], d[33]); // drive onto and over the block
  // the narrow enemy holds (no order) — the wide line should wrap it
});

const frame = () => page.evaluate(() => {
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const u of [0, 1]) {
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
});
const sample = () => page.evaluate(() => {
  const a = window.__game.unitInfo(0), b = window.__game.unitInfo(1);
  return { victor: window.__game.stats().victor, aAlive: a[15], aTotal: a[7], bAlive: b[15], bTotal: b[7] };
});
const label = (s, m) => `t=${String(s).padStart(3)}s  line ${m.aAlive}/${m.aTotal}  block ${m.bAlive}/${m.bTotal}  victor ${m.victor}`;

const { shots, dir } = await vibeCapture(page, process.env.NAME ?? 'offense', {
  stepSecs: 12, maxSteps: 16, frame, sample, label, done: (m) => m.victor >= 0,
});
console.log(`\n${shots.length} frames -> ${dir}`);
if (errs.length) console.log('page errors:', errs.slice(0, 3));
await browser.close();
