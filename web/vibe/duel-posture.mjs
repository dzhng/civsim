// A duel in a chosen POSTURE — the one duel harness for "two lines meet". Unit 0
// (team 0, spawned south) always attacks; POSTURE decides unit 1 (team 1, north):
//   both  — it attacks back: two charges meet, each front bowing to wrap the other
//   hold  — it stands and DEFENDS: advancing=false, so its line dimples to stay
//           whole while the attacker's front frays curling in to envelop
// Class-vs-class via ATK/DEF ids (see README). A timeline every 20 sim-seconds so
// the shape develops on screen instead of being guessed from one frame.
//   ATK=0 DEF=0 POSTURE=both node vibe/duel-posture.mjs   # heavy v heavy, both attack
//   ATK=0 DEF=3 POSTURE=hold node vibe/duel-posture.mjs   # heavy attacks a holding phalanx
import { openBattle, vibeCapture, fitDuel, duelSample, duelLabel } from './_lib.mjs';

const ATK = Number(process.env.ATK ?? 0);       // class id, 0 = HeavySword
const DEF = Number(process.env.DEF ?? 0);
const POSTURE = process.env.POSTURE ?? 'both';  // 'both' | 'hold'
const NAME = process.env.NAME ?? `duel-${ATK}v${DEF}-${POSTURE}`;

const { browser, page, errs } = await openBattle(`battle=duel&a=${ATK}&b=${DEF}&ai=off`);
await page.evaluate((posture) => {
  window.__game.setPace(0, 1); window.__game.setPace(1, 1);
  window.__game.attackOrder(0, 1);                          // unit 0 always attacks
  if (posture === 'both') window.__game.attackOrder(1, 0);  // else unit 1 holds + defends
}, POSTURE);

const { shots, resolved, dir } = await vibeCapture(page, NAME, {
  stepSecs: 20, maxSteps: 18,
  frame: () => fitDuel(page), sample: () => duelSample(page),
  label: duelLabel, done: (s) => s.victor >= 0,
});
console.log(`${NAME}: ${resolved ? `resolved in ${shots.length} frames` : 'UNRESOLVED'} -> ${dir}`);
if (errs.length) console.log('  page errors:', errs.slice(0, 3));
await browser.close();
