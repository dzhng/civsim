// Vibe check: watch a ROUT play out. Same duel as 1v1, but instead of stopping
// at the verdict it keeps screenshotting (every 20 sim-seconds) for ~100 s after
// one side breaks — so you can see HOW the broken unit flees. It should run off
// as a clump toward its OWN side (its home edge), not scatter across the field.
//   Default heavy-vs-heavy; override with A=/B= class ids.
import { openBattle, vibeCapture, fitDuel, duelSample, duelLabel } from './_lib.mjs';

const A = Number(process.env.A ?? 0);
const B = Number(process.env.B ?? 0);

const { browser, page, errs } = await openBattle(`battle=duel&a=${A}&b=${B}&ai=off`);
await page.evaluate(() => {
  window.__game.setPace(0, 1); window.__game.setPace(1, 1);
  window.__game.attackOrder(0, 1); window.__game.attackOrder(1, 0);
});

let post = 0;
const { shots, dir } = await vibeCapture(page, process.env.NAME ?? 'rout', {
  stepSecs: 20, maxSteps: 40,
  frame: () => fitDuel(page), sample: () => duelSample(page), label: duelLabel,
  done: (s) => { if (s.victor >= 0) post++; return post > 5; }, // ~100 s of flight after the verdict
});

console.log(`\n${shots.length} frames -> ${dir}`);
if (errs.length) console.log('page errors:', errs.slice(0, 3));
await browser.close();
