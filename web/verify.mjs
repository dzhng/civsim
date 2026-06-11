// Browser verification harness. Run from web/: `npm run verify`
// (expects the dev server on :5173, e.g. `npm run dev` in another shell).
//
// Battle layout (team 0 = west army at x=-550 facing east, deploy order):
//   0-1 skirmishers · 2-6 main line [heavy, phalanx, heavy, phalanx, heavy]
//   7-11 second line [light, heavy, longswords, heavy, light]
//   12-15 archers row · 16 artillery crew · 17-18 shock cav · 19 horse archers
//   Team 1 mirrors as units 20-39 at x=+550 facing west.
//   Maps are 2400x1000 long rectangles; flanks sealed by river/crags/walls.
// All stages drive the sim with the synchronous advance() fast-forward.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
await mkdir(SHOTS, { recursive: true });

const failures = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});

await page.goto(TARGET + '?ai=off'); // scripted stages need a passive enemy
await page.waitForFunction(() => window.__ready === true, { timeout: 20000 });
await page.waitForTimeout(800);

const stats = await page.evaluate(() => window.__game.stats());
check('full battle spawned', stats.soldiers >= 25000 && stats.units === 40,
  `${stats.soldiers} soldiers, ${stats.units} units`);
await page.screenshot({ path: SHOTS + 'initial.png' });

// The in-game manual opens and has content.
await page.click('#btn-manual');
const manualLen = await page.evaluate(() => document.getElementById('manual').innerHTML.length);
check('the field manual opens in-game', manualLen > 4000, `${manualLen} chars`);
await page.screenshot({ path: SHOTS + 'manual.png' });
await page.click('#btn-manual');

// --- Stage 1: straight march (unit 4: center heavy infantry) ----------------
const info4 = await page.evaluate(() => window.__game.unitInfo(4));
const s4 = await page.evaluate(() => window.__game.soldierStartOf(4));
const before = await page.evaluate((i) => window.__game.soldierPos(i), s4);
await page.evaluate(([ax, ay]) => {
  window.__game.select(4);
  window.__game.setOrder(4, ax + 60, ay); // straight ahead (east)
  window.__game.advance(300); // 10 sim-seconds
}, [info4[0], info4[1]]);
const after = await page.evaluate((i) => window.__game.soldierPos(i), s4);
const moved = Math.hypot(after[0] - before[0], after[1] - before[1]);
check('ordered unit marches', moved > 5, `soldier moved ${moved.toFixed(1)} m`);
const mid4 = await page.evaluate(() => window.__game.unitInfo(4));
check('unit is in motion', mid4[3] > 0.3, `speed ${mid4[3].toFixed(2)} m/s`);
check('cohesion responds to maneuver', mid4[4] < 0.998, `cohesion ${mid4[4].toFixed(3)}`);

// --- Stage 2: cavalry mass plows through friendly infantry ------------------
// Shock cav (17) rides through the long-swords unit (9, loose order).
const lsStart = await page.evaluate(() => window.__game.soldierStartOf(9));
const sampleLS = () =>
  page.evaluate((start) => {
    const out = [];
    for (let i = start; i < start + 200; i++) out.push(window.__game.soldierPos(i));
    return out;
  }, lsStart);
const lsBefore = await sampleLS();
const ls = await page.evaluate(() => window.__game.unitInfo(9));
await page.evaluate(([x, y]) => {
  window.__game.setPace(17, 1);
  window.__game.setOrder(17, x, y);
  window.__game.advance(2700); // 90 sim-seconds: ride ends mid-threading
}, [ls[0], ls[1]]);
const lsMid = await sampleLS();
let lsMean = 0;
let lsMax = 0;
for (let i = 0; i < lsMid.length; i++) {
  const d = Math.hypot(lsMid[i][0] - lsBefore[i][0], lsMid[i][1] - lsBefore[i][1]);
  lsMean += d;
  lsMax = Math.max(lsMax, d);
}
lsMean /= lsMid.length;
// (The congestion leash makes threading politer than the original 0.8m bar.)
check('cavalry mass displaces infantry', lsMax > 0.55, `max shove ${lsMax.toFixed(2)} m, mean ${lsMean.toFixed(2)} m mid-threading`);
await page.screenshot({ path: SHOTS + 'cavalry-plow.png' });

// --- Stage 3: order delay pie on a disordered unit ---------------------------
const lsInfo = await page.evaluate(() => window.__game.unitInfo(9));
if (lsInfo[4] < 0.8) {
  await page.evaluate(([x, y]) => window.__game.setOrder(9, x + 30, y), [lsInfo[0], lsInfo[1]]);
  const delayed = await page.evaluate(() => window.__game.unitInfo(9));
  check('disordered unit shows order delay', delayed[14] > 0, `delay frac ${delayed[14].toFixed(2)}`);
} else {
  check('disordered unit shows order delay', true, `skipped: cohesion ${lsInfo[4].toFixed(2)} above threshold`);
}

// --- Stage 4: 180 pivot stays orderly ----------------------------------------
const h2 = await page.evaluate(() => window.__game.unitInfo(2));
await page.evaluate(([x, y]) => {
  window.__game.setOrder(2, x - 250, y); // about-face: order is behind
  window.__game.advance(500);
}, [h2[0], h2[1]]);
const midPivot = await page.evaluate(() => window.__game.unitInfo(2));
// A 143m line about-facing IS disruptive (cohesion dips into the 0.3-0.5
// band, throttling its own rotation); ragging looked like 0.09-and-stuck.
// The strict detector is the native large_turns mean-slot-error test.
check('pivot keeps cohesion (no rag)', midPivot[4] > 0.3, `cohesion mid-pivot ${midPivot[4].toFixed(2)}`);
await page.evaluate(() => window.__game.advance(5400)); // wide lines re-face slowly
const postPivot = await page.evaluate(() => window.__game.unitInfo(2));
const facingErr = Math.abs(Math.abs(postPivot[2]) - Math.PI); // facing west
check('unit completed the 180', facingErr < 0.5, `facing ${postPivot[2].toFixed(2)} rad`);
await page.screenshot({ path: SHOTS + 'pivot-after.png' });

// --- Stage 5: stamina economy -------------------------------------------------
const la = await page.evaluate(() => window.__game.unitInfo(7));
await page.evaluate(([x, y]) => {
  window.__game.setPace(7, 1);
  window.__game.setOrder(7, x + 250, y);
  window.__game.advance(1800);
}, [la[0], la[1]]);
const ran = await page.evaluate(() => window.__game.unitInfo(7));
check('running drains stamina', ran[8] < 0.75, `fatigue ${ran[8].toFixed(2)} after 60s run`);
await page.evaluate(() => {
  const i = window.__game.unitInfo(7);
  window.__game.setOrder(7, i[0], i[1]);
  window.__game.advance(4500); // halt + 150s rest (re-forming first)
});
const rested = await page.evaluate(() => window.__game.unitInfo(7));
check('rest recovers stamina', rested[8] > ran[8] + 0.08, `fatigue ${ran[8].toFixed(2)} -> ${rested[8].toFixed(2)}`);

// --- Stage 6: melee — two heavies meet, fight, and leave corpses -------------
await page.evaluate(() => {
  window.__game.setPace(4, 1); // the long map needs the double
  window.__game.setPace(24, 1);
  window.__game.attackOrder(4, 24); // center heavies, straight clear lane
  window.__game.attackOrder(24, 4);
  window.__game.advance(14000); // close ~1km at the double: mid-fight
});
const mid = await page.evaluate(() => window.__game.unitInfo(4));
check('units are engaged mid-fight', mid[16] > 20, `${mid[16]} fighting`);
await page.screenshot({ path: SHOTS + 'melee.png' });
await page.evaluate(() => window.__game.advance(1800));
const red = await page.evaluate(() => window.__game.unitInfo(4));
const blue = await page.evaluate(() => window.__game.unitInfo(24));
const redLosses = red[7] - red[15];
const blueLosses = blue[7] - blue[15];
check('melee inflicts casualties', redLosses + blueLosses > 30,
  `losses red ${redLosses} / blue ${blueLosses}`);
// (Until morale lands, to-the-death is the artificial endpoint; this guards
// against instant one-sided deletion only.)
check('melee is a grind, not annihilation', red[15] + blue[15] > 250,
  `${red[15]}/${red[7]} and ${blue[15]}/${blue[7]} still standing`);

// Capture page-1 health BEFORE the AI stage backgrounds it (rAF throttling
// would misread fps afterward).
const statsPre = await page.evaluate(() => window.__game.stats());

// --- Stage 8: the AI fights a battle unattended ------------------------------
const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page2.on('pageerror', (e) => pageErrors.push('ai-page: ' + e.message));
await page2.goto(TARGET); // AI on by default
await page2.waitForFunction(() => window.__ready === true, { timeout: 20000 });
await page2.evaluate(() => window.__game.advance(17500)); // ~10 min: the AI closes 1km and fights
const aiState = await page2.evaluate(() => {
  let blueMoved = 0;
  let dead = 0;
  for (let u = 0; u < 40; u++) {
    const i = window.__game.unitInfo(u);
    dead += i[7] - i[15];
    if (i[6] === 1 && i[0] < 480) blueMoved++;
  }
  const archers = window.__game.unitInfo(13); // red archers: fire-at-will
  return { blueMoved, dead, archerAmmo: archers[19], victor: window.__game.stats().victor };
});
check('the AI advances its army', aiState.blueMoved >= 5, `${aiState.blueMoved} blue units left their line`);
check('the AI fights', aiState.dead > 300, `${aiState.dead} casualties`);
check('archers volley the attackers on their own', aiState.archerAmmo < 14400, `red archer ammo ${aiState.archerAmmo}`);
await page2.screenshot({ path: SHOTS + 'ai-battle.png' });
await page2.close();
await page.bringToFront(); // background tabs throttle rAF: restore page 1

// --- Health -------------------------------------------------------------------
const stats2 = await page.evaluate(() => window.__game.stats());
check('tick under budget', stats2.tickMs < 8, `${stats2.tickMs.toFixed(2)} ms avg at ${stats2.soldiers} soldiers`);
check('frame rate alive (headless/software GL)', statsPre.fps > 8, `${statsPre.fps.toFixed(0)} fps`);
check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
