// Vibe check: missile troops vs an advancing line. The shooter (unit 1) holds
// and looses on its own (fire-at-will) while the advancer (unit 0) crosses the
// field at a run. Eyeball web/shots/baseline/vibe/missile/ — do arrows actually fly, does
// the charging line thin out crossing the open ground, do the shooters get run
// down once contact lands (light troops shouldn't win a melee)?
//   Default: heavy infantry advances on held archers.
//   Override: ADV=6 SHOOT=5 node vibe/missile.mjs  (cavalry onto skirmishers)
import { openBattle, vibeCapture, fitDuel, duelSample, CLS } from './_lib.mjs';

const ADV = Number(process.env.ADV ?? CLS.heavy);    // unit 0, advances
const SHOOT = Number(process.env.SHOOT ?? CLS.archers); // unit 1, holds + shoots

const { browser, page, errs } = await openBattle(`battle=duel&a=${ADV}&b=${SHOOT}&ai=off`);
// Advancer charges; shooter holds and fires at will (on by default for missiles).
await page.evaluate(() => {
  window.__game.setPace(0, 1);
  window.__game.attackOrder(0, 1);
});

const label = (secs, s) =>
  `t=${String(secs).padStart(3)}s  advancer ${s.aAlive}/${s.aTotal} (coh ${s.aCoh.toFixed(2)})  `
  + `shooter ${s.bAlive}/${s.bTotal} ammo ${s.bAmmo}  fighting ${s.aFight}/${s.bFight}  victor ${s.victor}`;

const { frames, resolved, fails } = await vibeCapture(page, process.env.NAME ?? 'missile', {
  frame: () => fitDuel(page), sample: () => duelSample(page),
  label, done: (s) => s.victor >= 0,
});

console.log(resolved ? `\nresolved in ${frames} frames` : `\nUNRESOLVED`);
if (errs.length) console.log('page errors:', errs.slice(0, 3));
await browser.close();
process.exit(fails);
