// The acceptance test for the offense-wrap rule (issue 1): a WIDE line vs a
// narrow deep COLUMN, both attacking head-on. The line overhangs the column on
// both flanks — those files have nothing ahead — so the LINE should break and
// wrap; the column's whole narrow front is engaged, so it should HOLD formation.
// (Compare to heavy-both, equal widths: neither wraps.) Timeline into
// shots/line-v-column/. node vibe/line-v-column.mjs
import { openBattle, vibeCapture } from './_lib.mjs';

const TPS = 30;
const { browser, page, errs } = await openBattle('battle=duel&a=0&b=0&ai=off');
const ids = await page.evaluate(() => {
  const HP = Math.PI / 2, X = 200;
  const line = window.__game.spawnUnit(X, -30, HP, 300, 100, 0);  // wide: 100 files, 3 deep
  const col = window.__game.spawnUnit(X, 30, -HP, 300, 12, 1);    // narrow column: 12 files, 25 deep
  window.__game.setPace(line, 1); window.__game.setPace(col, 1);
  window.__game.attackOrder(line, col); window.__game.attackOrder(col, line);
  return [line, col];
}, undefined);

const fit = () => page.evaluate((ids) => {
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
  const cv = document.getElementById('battlefield'); const c = window.__cam;
  c.pitch = 0; c.x = (minx + maxx) / 2; c.y = (miny + maxy) / 2;
  c.zoom = Math.max(3, Math.min(20, Math.min(cv.width / (maxx - minx + 50), cv.height / (maxy - miny + 50))));
  c.clampView?.();
}, ids);

const sample = () => page.evaluate((ids) => {
  const a = window.__game.unitInfo(ids[0]), b = window.__game.unitInfo(ids[1]);
  return { lineAlive: a[15], lineCoh: a[4], colAlive: b[15], colCoh: b[4], victor: window.__game.stats().victor };
}, ids);

const { dir } = await vibeCapture(page, 'line-v-column', {
  stepSecs: 15, maxSteps: 24, frame: fit, sample,
  label: (s, x) => `t=${String(s).padStart(3)}s  line ${x.lineAlive} (coh ${x.lineCoh.toFixed(2)})  column ${x.colAlive} (coh ${x.colCoh.toFixed(2)})  victor ${x.victor}`,
  done: (x) => x.victor >= 0,
});
console.log(`-> ${dir}`);
if (errs.length) console.log('page errors:', errs.slice(0, 3));
await browser.close();
