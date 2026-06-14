// Heavy-vs-heavy, two postures, side by side — the cleanest read on the
// offense/defense weave split because BOTH sides are the same class (only the
// ORDERS differ, so any difference in how the lines deform is the posture, not
// the stats).
//   shots/heavy-both/        both lines attack — two charges meet and grind,
//                            each front bowing to wrap the other (offense vs offense)
//   shots/heavy-attack-defend/  one line attacks, one holds — the attacker's
//                            front curls to envelop while the holder dimples back
//                            to keep its line whole and patch the breach
// A timeline (every 20 sim-seconds) so you watch the shape develop, not guess
// from one frame. node vibe/heavy-duel.mjs
import { openBattle, vibeCapture, fitDuel, duelSample, duelLabel } from './_lib.mjs';

// Unit 0 (team 0) spawns south facing north; unit 1 (team 1) north facing south.
async function version(name, order) {
  const { browser, page, errs } = await openBattle('battle=duel&a=0&b=0&ai=off');
  await page.evaluate((order) => {
    window.__game.setPace(0, 1); window.__game.setPace(1, 1);
    if (order === 'both') {
      window.__game.attackOrder(0, 1); window.__game.attackOrder(1, 0);
    } else {
      // 0 attacks; 1 is given NO order, so it holds its ground and defends
      // (advancing=false -> the line dimples instead of wrapping).
      window.__game.attackOrder(0, 1);
    }
  }, order);
  const { shots, resolved, dir } = await vibeCapture(page, name, {
    stepSecs: 20, maxSteps: 18,
    frame: () => fitDuel(page), sample: () => duelSample(page),
    label: duelLabel, done: (s) => s.victor >= 0,
  });
  console.log(`${name}: ${resolved ? `resolved in ${shots.length} frames` : 'UNRESOLVED'} -> ${dir}`);
  if (errs.length) console.log('  page errors:', errs.slice(0, 3));
  await browser.close();
}

await version('heavy-both', 'both');
await version('heavy-attack-defend', 'attackdefend');
