// Vibe check: a 1v1 duel, both blocks charging each other, screenshotted every
// 30 sim-seconds until one side breaks. Default is heavy-vs-heavy; override the
// matchup with class ids: `A=3 B=6 node vibe/1v1.mjs` (phalanx vs cavalry).
// Eyeball web/vibe/shots/1v1/ — do the lines meet and grind, does one rout, does
// nobody get launched into orbit?
import { openBattle, vibeCapture, fitDuel, duelSample, duelLabel } from './_lib.mjs';

const A = Number(process.env.A ?? 0); // class id, 0 = HeavyInfantry
const B = Number(process.env.B ?? 0);

const { browser, page, errs } = await openBattle(`battle=duel&a=${A}&b=${B}&ai=off`);
await page.evaluate(() => {
  window.__game.setPace(0, 1); window.__game.setPace(1, 1);
  window.__game.attackOrder(0, 1); window.__game.attackOrder(1, 0);
});

const { shots, resolved, dir } = await vibeCapture(page, process.env.NAME ?? '1v1', {
  frame: () => fitDuel(page), sample: () => duelSample(page),
  label: duelLabel, done: (s) => s.victor >= 0,
});

console.log(resolved ? `\nresolved in ${shots.length} frames -> ${dir}` : `\nUNRESOLVED -> ${dir}`);
if (errs.length) console.log('page errors:', errs.slice(0, 3));
await browser.close();
