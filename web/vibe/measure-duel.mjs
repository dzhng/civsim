// Mechanical acceptance test for a duel (default heavy-v-heavy, both attack).
// Three hard criteria, measured every half-second, not eyeballed:
//   1. COHESION: both units stay >0.8 until one routs (formations hold).
//   2. NO CROSSING: one unit starts on top, one on bottom — the top unit's
//      centroid-y must stay above the bottom unit's for the WHOLE fight. A flip
//      is a crisscross OR a swirl (orbiting also swaps top/bottom).
//   3. ROUT THE RIGHT WAY: a routing unit flees toward its OWN side — the top
//      unit's centroid moves further up (+y), the bottom unit further down.
// Usage (from web/, dev server up):
//   ATK=0 DEF=0 node vibe/measure-duel.mjs
import { openBattle, closeBattle, UNIT_CENTER_Y } from './_lib.mjs';

const ATK = Number(process.env.ATK ?? 0);
const DEF = Number(process.env.DEF ?? 0);
const POSTURE = process.env.POSTURE ?? 'both';
const SECS = Number(process.env.SECS ?? 300);
const TPS = 30;

const { browser, page } = await openBattle(`battle=duel&a=${ATK}&b=${DEF}&ai=off`);
await page.evaluate((posture) => {
  window.__game.setPace(0, 1); window.__game.setPace(1, 1);
  window.__game.attackOrder(0, 1);
  if (posture === 'both') window.__game.attackOrder(1, 0);
}, POSTURE);

const sample = () => page.evaluate((centerY) => {
  const a = window.__game.unitInfo(0), b = window.__game.unitInfo(1);
  return {
    aCoh: a[4], bCoh: b[4], aRout: a[21], bRout: b[21],
    aAlive: a[15], bAlive: b[15], aY: a[centerY], bY: b[centerY],
    victor: window.__game.stats().victor,
  };
}, UNIT_CENTER_Y);

const s0 = await sample();
const topIsA = s0.aY > s0.bY;                 // which unit starts on top (higher y)
const topY = (s) => (topIsA ? s.aY : s.bY);
const botY = (s) => (topIsA ? s.bY : s.aY);

let minCohPreRout = 1, minCohAt = 0;
let crossed = false, crossedAt = -1, minGapY = Infinity, minGapYAt = 0;
let firstRoutAt = -1;
let topRoutY = null, botRoutY = null;          // top/bottom centroid-y at their rout onset

for (let t = 0; t <= SECS * TPS; t += 15) {    // sample every 0.5 s
  const s = await sample();
  const secs = t / TPS;
  const topRouting = topIsA ? s.aRout > 0.5 : s.bRout > 0.5;
  const botRouting = topIsA ? s.bRout > 0.5 : s.aRout > 0.5;
  const anyRout = topRouting || botRouting || s.victor >= 0;
  if (anyRout && firstRoutAt < 0) firstRoutAt = secs;
  if (topRouting && topRoutY === null) topRoutY = topY(s);
  if (botRouting && botRoutY === null) botRoutY = botY(s);

  if (firstRoutAt < 0 && s.aAlive > 5 && s.bAlive > 5) {
    const lo = Math.min(s.aCoh, s.bCoh);
    if (lo < minCohPreRout) { minCohPreRout = lo; minCohAt = secs; }
  }
  const gapY = topY(s) - botY(s);              // must stay > 0
  if (gapY < minGapY) { minGapY = gapY; minGapYAt = secs; }
  if (gapY <= 0 && !crossed) { crossed = true; crossedAt = secs; }

  if (s.victor >= 0) {
    // capture final flee positions a beat after the verdict
    await page.evaluate((n) => window.__game.advance(n), 5 * TPS);
    const sf = await sample();
    var finalTopY = topY(sf), finalBotY = botY(sf);
    break;
  }
  await page.evaluate((n) => window.__game.advance(n), 15);
}

console.log(`\n=== ${ATK}v${DEF}-${POSTURE} mechanical test ===`);
console.log(`1. cohesion >0.8 until rout:  min=${minCohPreRout.toFixed(2)} @${minCohAt}s  => ${minCohPreRout > 0.8 ? 'PASS' : 'FAIL'}` +
  (firstRoutAt >= 0 ? ` (rout/verdict @${firstRoutAt}s)` : ' (no rout in window)'));
console.log(`2. top stays on top (no cross/swirl): minGapY=${minGapY.toFixed(1)}m @${minGapYAt}s  => ${crossed ? `FAIL crossed @${crossedAt}s` : 'PASS'}`);
if (typeof finalTopY === 'number' && topRoutY !== null) {
  console.log(`3. top routs UP:   ${(finalTopY - topRoutY).toFixed(1)}m  => ${finalTopY - topRoutY > 0 ? 'PASS' : 'FAIL'}`);
} else if (typeof finalTopY === 'number' && botRoutY !== null) {
  console.log(`3. bottom routs DOWN: ${(finalBotY - botRoutY).toFixed(1)}m  => ${finalBotY - botRoutY < 0 ? 'PASS' : 'FAIL'}`);
} else {
  console.log(`3. rout direction:  no clean rout captured in window`);
}
await closeBattle(browser, page);
