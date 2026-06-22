// Vibe check: a thin column punches the MIDDLE of a wide HELD line. The
// defender (unit 1, no order = braced) should fold in on the breach and wrap the
// column — its flank men turning inward — not stand rigid while the column walks
// through, and not dissolve into a uniform blob. Watch web/shots/baseline/vibe/penetration/.
//   Default: a heavy column vs a wide held heavy line.
//   Override: COL=6 DEF=0 node vibe/penetration.mjs   (cavalry column)
import { openBattle, vibeCapture, CLS } from './_lib.mjs';

const COL = Number(process.env.COL ?? CLS.heavy);  // unit 0, the penetrating column
const DEF = Number(process.env.DEF ?? CLS.heavy);  // unit 1, the held defender

const { browser, page, errs } = await openBattle(`battle=duel&a=${COL}&b=${DEF}&ai=off`);
await page.evaluate(() => {
  window.__game.setFiles(1, 70); // defender: WIDE, thin line
  window.__game.setFiles(0, 8);  // column: NARROW, deep
  window.__game.setPace(0, 1);   // the column charges in at a run
  const d = window.__game.unitInfo(1);
  window.__game.attackMove(0, d[32], d[33] + 90); // drive THROUGH the centre and out the back
  // defender (unit 1) gets NO order — it holds and must react to the breach.
});

// Fit both units' full footprint (the line is wide), flat top-down.
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
  return { victor: window.__game.stats().victor, aAlive: a[15], aTotal: a[7], bAlive: b[15], bTotal: b[7], bCoh: b[4] };
});
const label = (s, m) =>
  `t=${String(s).padStart(3)}s  column ${m.aAlive}/${m.aTotal}  defender ${m.bAlive}/${m.bTotal} (coh ${m.bCoh.toFixed(2)})  victor ${m.victor}`;

const { frames, fails } = await vibeCapture(page, process.env.NAME ?? 'penetration', {
  stepSecs: 12, maxSteps: 16, frame, sample, label, done: (m) => m.victor >= 0,
});

console.log(`\n${frames} frames`);
if (errs.length) console.log('page errors:', errs.slice(0, 3));
await browser.close();
process.exit(fails);
