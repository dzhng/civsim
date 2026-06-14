// Sweep the formation-WEAVE level on a DEFENCE scenario (a column into a wide
// held line) and an OFFENCE scenario (a wide line onto a narrow block), so we
// can see how weave changes both the LOOK and the OUTCOME. For each level it
// drops one clash frame into web/vibe/shots/weave-sweep/ and prints survivors.
//   node vibe/weave-sweep.mjs            # levels 0, .25, .5, .75, 1
import { openBattle } from './_lib.mjs';
import { mkdir } from 'node:fs/promises';

const LEVELS = [0, 0.25, 0.5, 0.75, 1.0];
const TPS = 30;
const OUT = new URL('./shots/weave-sweep/', import.meta.url).pathname;
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

// scenario: returns { ids, defenderId, attackerId } after spawning + ordering.
async function run(kind, weave) {
  const { browser, page } = await openBattle('battle=duel&a=0&b=0&ai=off');
  await page.evaluate((w) => window.__game.setWeave(w), weave);
  const setup = await page.evaluate((kind) => {
    const HP = Math.PI / 2, X = 200;
    if (kind === 'def') {
      const line = window.__game.spawnUnit(X, 0, HP, 600, 150, 0);  // wide held line
      const col = window.__game.spawnUnit(X, 90, -HP, 240, 8, 1);   // deep column
      window.__game.setPace(col, 1); window.__game.attackMove(col, X, -40);
      return { ids: [line, col], who: line };
    } else {
      const line = window.__game.spawnUnit(X, 0, HP, 400, 100, 0);  // wide attacking line
      const block = window.__game.spawnUnit(X, 55, -HP, 150, 12, 1); // narrow block
      window.__game.setPace(line, 1); window.__game.attackMove(line, X, 70);
      return { ids: [line, block], who: block }; // track the BLOCK's survival (how wrapped)
    }
  }, kind);
  await page.evaluate((n) => window.__game.advance(n), 80 * TPS); // ~80 sim-seconds in
  await fitIds(page, setup.ids);
  await page.evaluate(() => window.__game.freeze());
  await page.waitForTimeout(150);
  const surv = await page.evaluate((ids) => ({
    a: window.__game.unitInfo(ids[0])[15], aT: window.__game.unitInfo(ids[0])[7],
    b: window.__game.unitInfo(ids[1])[15], bT: window.__game.unitInfo(ids[1])[7],
  }), setup.ids);
  await page.screenshot({ path: `${OUT}${kind}-w${String(weave).replace('.', '')}.png` });
  await browser.close();
  return surv;
}

console.log('weave   defence (line/240col)        offence (line/block)');
for (const w of LEVELS) {
  const d = await run('def', w);
  const o = await run('off', w);
  console.log(
    `${w.toFixed(2)}    line ${d.a}/${d.aT} col ${d.b}/${d.bT}      `
    + `line ${o.a}/${o.aT} block ${o.b}/${o.bT}`);
}
console.log(`\nshots -> ${OUT}`);
