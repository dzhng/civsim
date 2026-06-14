// Per-class formation coherence: the SAME breach (a column driving through a
// held line) against two classes with very different `weave` stats — a phalanx
// (rigid 0.2, should hold a near-flat wall) and skirmishers (drape 0.72, should
// dimple deeply and swarm). No global override: weave is released to the class
// stat (the live default). One clash frame each into shots/class-coherence/.
//   node vibe/class-coherence.mjs
import { openBattle } from './_lib.mjs';
import { mkdir } from 'node:fs/promises';

const TPS = 30;
const OUT = new URL('./shots/class-coherence/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

const fitIds = (page, ids) => page.evaluate((ids) => {
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

// cls: the class id of the held line. The column is always heavy sword (cls 0).
async function run(name, cls) {
  const { browser, page } = await openBattle('battle=duel&a=0&b=0&ai=off');
  const setup = await page.evaluate((cls) => {
    const HP = Math.PI / 2, X = 200;
    const line = window.__game.spawnClass(X, 0, HP, 600, 0, cls); // held line of `cls`
    window.__game.setFiles(line, 150);                           // same width for both: 4 deep
    const col = window.__game.spawnUnit(X, 90, -HP, 240, 8, 1);  // heavy column
    window.__game.setPace(col, 1); window.__game.attackMove(col, X, -40);
    return { ids: [line, col] };
  }, cls);
  await page.evaluate((n) => window.__game.advance(n), 70 * TPS);
  await fitIds(page, setup.ids);
  await page.evaluate(() => window.__game.freeze());
  await page.waitForTimeout(150);
  const surv = await page.evaluate((ids) => ({
    line: window.__game.unitInfo(ids[0])[15], col: window.__game.unitInfo(ids[1])[15],
  }), setup.ids);
  await page.screenshot({ path: `${OUT}${name}.png` });
  await browser.close();
  return surv;
}

const phalanx = await run('phalanx-w020', 3);     // Phalanx, weave 0.20
const skirm = await run('skirmishers-w072', 5);   // Skirmishers, weave 0.72
console.log(`phalanx    line ${phalanx.line}/600  col survivors ${phalanx.col}/240`);
console.log(`skirmisher line ${skirm.line}/600  col survivors ${skirm.col}/240`);
console.log(`\nshots -> ${OUT}`);
