// Vibe check: OFFENSE — a WIDE attacking line drives onto a NARROW block. The
// flanks overlap the block with no enemy in front of them, so on the offensive
// they should curl IN and the cloth should DRAPE around it (envelop). Eyeball
// web/shots/vibe/offense/. Built with the spawn hook so the block is narrow and
// shallow enough to actually engage (a deep tank just stalls the line).
import { openBattle, vibeCapture } from './_lib.mjs';

const { browser, page, errs } = await openBattle('battle=duel&a=0&b=0&ai=off');

const units = await page.evaluate(() => {
  const HP = Math.PI / 2;
  const X = 200; // east of the idle duel pair
  const HEAVY = 0;
  // wide attacking line (team 0), ~3 deep, facing north toward the block
  const atk = window.__game.spawnClass(X, -13, HP, 210, 70, HEAVY, 0);
  // narrow enemy block (team 1), held
  const def = window.__game.spawnClass(X, 13, -HP, 120, 12, HEAVY, 1);
  window.__game.setPace(atk, 1);
  window.__game.attackOrder(atk, def);
  return { atk, def };
});
const ids = await page.evaluate((u) => [u.atk, u.def], units);

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
  const a = window.__game.unitInfo(ids[0]), b = window.__game.unitInfo(ids[1]);
  return { lineAlive: a[15], lineTotal: a[7], blockAlive: b[15], blockTotal: b[7] };
}, ids);
const label = (s, m) => `t=${String(s).padStart(3)}s  line ${m.lineAlive}/${m.lineTotal}  block ${m.blockAlive}/${m.blockTotal}`;

const { frames, fails } = await vibeCapture(page, process.env.NAME ?? 'offense', {
  stepSecs: 12, maxSteps: 12, frame, sample, label, done: () => false,
});
console.log(`\n${frames} frames`);
if (errs.length) console.log('page errors:', errs.slice(0, 3));
await browser.close();
process.exit(fails);
