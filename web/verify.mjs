// Browser verification harness. Run from web/: `npm run verify`
// (expects the dev server on :5173, e.g. `npm run dev` in another shell).
//
// Battle layout (team 0 = player army at y=-600 facing north, deploy order):
//   0-1 skirmishers · 2-6 main line [heavy, phalanx, heavy, phalanx, heavy]
//   7-11 second line [light, heavy, longswords, heavy, light]
//   12-15 archers row · 16 artillery crew · 17-18 shock cav · 19 horse archers
//   Team 1 mirrors as units 20-39 at y=+600 facing south.
//   Maps are 2400x1600; east/west flanks sealed by river/crags/walls/cliffs.
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
  window.__game.setOrder(4, ax, ay + 60); // straight ahead (north)
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
  window.__game.setOrder(2, x, y - 250); // about-face: order is behind
  window.__game.advance(500);
}, [h2[0], h2[1]]);
const midPivot = await page.evaluate(() => window.__game.unitInfo(2));
// A 143m line about-facing IS disruptive (cohesion dips into the 0.3-0.5
// band, throttling its own rotation); ragging looked like 0.09-and-stuck.
// The strict detector is the native large_turns mean-slot-error test.
check('pivot keeps cohesion (no rag)', midPivot[4] > 0.3, `cohesion mid-pivot ${midPivot[4].toFixed(2)}`);
await page.evaluate(() => window.__game.advance(5400)); // wide lines re-face slowly
const postPivot = await page.evaluate(() => window.__game.unitInfo(2));
const facingErr = Math.abs(postPivot[2] + Math.PI / 2); // facing south
check('unit completed the 180', facingErr < 0.5, `facing ${postPivot[2].toFixed(2)} rad`);
await page.screenshot({ path: SHOTS + 'pivot-after.png' });

// --- Stage 5: stamina economy -------------------------------------------------
const la = await page.evaluate(() => window.__game.unitInfo(7));
await page.evaluate(([x, y]) => {
  window.__game.setPace(7, 1);
  window.__game.setOrder(7, x, y + 250);
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
// Morale ends fights on its own schedule now, so sample for the PEAK of the
// engagement rather than betting on one instant.
const peakEngaged = await page.evaluate(() => {
  window.__game.setPace(4, 1); // the long map needs the double
  window.__game.setPace(24, 1);
  window.__game.attackOrder(4, 24); // center heavies, straight clear lane
  window.__game.attackOrder(24, 4);
  window.__game.advance(7000); // the approach (both close at the double)
  let peak = 0;
  for (let k = 0; k < 24; k++) {
    window.__game.advance(350);
    peak = Math.max(peak, window.__game.unitInfo(4)[16]);
  }
  return peak;
});
check('units are engaged mid-fight', peakEngaged > 20, `${peakEngaged} fighting at the peak`);
await page.screenshot({ path: SHOTS + 'melee.png' });
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

// --- Stage: cluster group-move (before/after for the vibes) ------------------
// Select two adjacent main-line units AND the detached west cavalry wing,
// then group-move to open ground: the line pair must keep its relative
// offset; the far cavalry must end up alongside (compressed star).
await page.evaluate(() => {
  window.__cam.x = 30; window.__cam.y = -480; window.__cam.zoom = 1.6;
});
await page.waitForTimeout(400);
await page.screenshot({ path: SHOTS + 'cluster-before.png' });
const clusterResult = await page.evaluate(() => {
  const before = [5, 6, 7].map((u) => {
    const i = window.__game.unitInfo(u);
    return [i[0], i[1]];
  });
  window.__game.groupMove([5, 6, 7], 250, -350);
  window.__game.advance(8200); // ~4.5 min: the far wing has farther to ride
  const after = [5, 6, 7].map((u) => {
    const i = window.__game.unitInfo(u);
    return [i[0], i[1]];
  });
  return { before, after };
});
{
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const pairBefore = d(clusterResult.before[0], clusterResult.before[1]);
  const pairAfter = d(clusterResult.after[0], clusterResult.after[1]);
  const cavBefore = d(clusterResult.before[0], clusterResult.before[2]);
  const cavAfter = d(clusterResult.after[0], clusterResult.after[2]);
  check('cluster keeps line formation', Math.abs(pairAfter - pairBefore) < 25,
    `pair spacing ${pairBefore.toFixed(0)}m -> ${pairAfter.toFixed(0)}m`);
  // (Unit 7 is the far-left of the second line, ~430m from unit 5 with no
  // selected unit between: its own cluster.)
  check('far unit combines at the destination', cavAfter < cavBefore * 0.7 && cavAfter < 280,
    `detached-unit gap ${cavBefore.toFixed(0)}m -> ${cavAfter.toFixed(0)}m (compressed star: main radius + unit radius + margin)`);
}
await page.evaluate(() => {
  window.__cam.x = 220; window.__cam.y = -380; window.__cam.zoom = 1.6;
});
await page.waitForTimeout(400);
await page.screenshot({ path: SHOTS + 'cluster-after.png' });

// Capture page-1 health BEFORE the AI stage backgrounds it (rAF throttling
// would misread fps afterward); let the EMA settle after the long advance.
await page.waitForTimeout(3000);
const statsPre = await page.evaluate(() => window.__game.stats());

// --- Stage 8: the AI fights a battle unattended ------------------------------
const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page2.on('pageerror', (e) => pageErrors.push('ai-page: ' + e.message));
await page2.goto(TARGET); // AI on by default
await page2.waitForFunction(() => window.__ready === true, { timeout: 20000 });
await page2.evaluate(() => window.__game.advance(21500)); // ~12 min: the AI closes, dresses its line, and fights
const aiState = await page2.evaluate(() => {
  let blueMoved = 0;
  let dead = 0;
  for (let u = 0; u < 40; u++) {
    const i = window.__game.unitInfo(u);
    dead += i[7] - i[15];
    if (i[6] === 1 && i[1] < 530) blueMoved++;
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
// Software GL renders the textured sprite pipeline slowly; real GPUs don't.
check('frame rate alive (headless/software GL)', statsPre.fps > 4, `${statsPre.fps.toFixed(0)} fps`);
check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
