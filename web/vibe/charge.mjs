// Vibe check: a charge into a HELD line. The defender (unit 1) braces — no order
// — while the attacker (unit 0) charges in at a run. This is the test bed for
// "points stop horse" and "a held braced line beats a frontal charge": does the
// charge crash in and shove (not launch men), does the pike wall halt a horse,
// does the braced line hold?
//   Default: cavalry charges a held phalanx (POINTS STOP HORSE).
//   Override: ATK=6 DEF=0 node vibe/charge.mjs  (cav into a held heavy line)
import { openBattle, vibeCapture, fitDuel, duelSample, duelLabel, CLS } from './_lib.mjs';

const ATK = Number(process.env.ATK ?? CLS.cavalry);  // unit 0, charges
const DEF = Number(process.env.DEF ?? CLS.phalanx);   // unit 1, holds (braced)

const { browser, page, errs } = await openBattle(`battle=duel&a=${ATK}&b=${DEF}&ai=off`);
// Attacker charges at a run; defender holds its ground (no order = braced).
await page.evaluate(() => {
  window.__game.setPace(0, 1);
  window.__game.attackOrder(0, 1);
});

const { shots, resolved, dir } = await vibeCapture(page, process.env.NAME ?? 'charge', {
  frame: () => fitDuel(page), sample: () => duelSample(page),
  label: duelLabel, done: (s) => s.victor >= 0,
});

console.log(resolved ? `\nresolved in ${shots.length} frames -> ${dir}` : `\nUNRESOLVED -> ${dir}`);
console.log('A = attacker (charging), B = defender (held)');
if (errs.length) console.log('page errors:', errs.slice(0, 3));
await browser.close();
