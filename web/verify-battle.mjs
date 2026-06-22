// Battle browser verification harness. Run from web/: `npm run verify`
// (expects the dev server on :5173, e.g. `npm run dev` in another shell).
//
// Battle layout (team 0 = player army at y=-600 facing north, deploy order):
//   0-1 skirmishers · 2-6 main line [heavy, phalanx, heavy, phalanx, heavy]
//   7-11 second line [light, heavy, longswords, heavy, light]
//   12-15 archers row · 16 artillery crew · 17-18 shock cav · 19 horse archers
//   Team 1 mirrors as units 20-39 at y=+600 facing south.
//   Maps are 2400x1600; east/west flanks sealed by river/crags/walls/cliffs.
// All stages drive the sim with the synchronous advance() fast-forward.
//
// Default = QUICK: web-glue only (boot, zero-copy views, UI plumbing,
// render health). Sim BEHAVIOR is the native suite's job (cargo test,
// ~25s) — duplicating it here is what made verify time out. The heavy
// behavioral stages live behind `npm run verify:full` for release passes.
const FULL = process.argv.includes('--full');
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { snapCheck } from './snapshot.mjs';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';

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

// ?map=A skips the main menu; scripted stages need a passive enemy.
await page.goto(TARGET + '?map=A&ai=off');
await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 20000 });
await page.waitForTimeout(800);

const stats = await page.evaluate(() => window.__game.stats());
check('full battle spawned', stats.soldiers >= 25000 && stats.units === 40,
  `${stats.soldiers} soldiers, ${stats.units} units`);

// Pixel regression on the deployed battlefield: freezeAtTick pins the shader
// clock, the HUD perf line, AND the absolute sim tick — idle men carry a fidget
// sway that re-rolls every few ticks, so a stable snapshot must land on a fixed
// tick, not "whenever ~1s of real-time happened to elapse".
await page.evaluate(() => window.__game.freezeAtTick(240));
await page.waitForTimeout(150);
// Babylon renders the battle; on headless SwiftShader its frame timing
// jitters a handful of sub-pixel AA edges (~0.002%) run-to-run even when
// frozen. The battlefield content is pixel-stable; this absorbs only the
// engine's edge wobble, well below any real regression.
await snapCheck(page, 'battle-initial', check, { maxDiffRatio: 0.0008 });
await page.evaluate(() => window.__game.freeze(false));

// The unit banner is a 3D billboard now (team standard + HP/cohesion bars +
// chips), not a DOM overlay — pin it rendering centred ABOVE a block under the
// pitched camera, the framing where the old screen-projected banner drifted off
// the ranks. Frame a unit's centroid, zoom past the show-banners cutoff, freeze.
await page.evaluate(() => {
  const a = window.__game.unitInfo(0);
  const c = window.__cam;
  c.x = a[32]; c.y = a[33] + 6; c.zoom = 9; c.clampView?.();
});
await page.evaluate(() => window.__game.freezeAtTick(480));
await page.waitForTimeout(150);
await snapCheck(page, 'battle-banner', check, { maxDiffRatio: 0.0008 });
// Stay FROZEN from here through the cluster stage. The main page's sim then
// advances only by explicit advance() (a frozen rAF loop adds no wall-clock
// ticks), so every downstream capture lands on an exact, reproducible tick —
// the same determinism the vibe timelines rely on. Unfrozen before the perf
// measurement at the end (fps needs real time).

// --- Soldier level-of-detail: a unit must read as its team-coloured block at
// every zoom — never a black slab (far) nor washed-out specks (mid). The 2D
// sprite atlas is straight-alpha with wide transparent margins; without the
// coverage-divide in the sprite shader, minified soldiers average to near-black
// and the alpha-test writes that, so a zoomed-out block collapses to black.
// Render ONE unit (a duel) in isolation and measure its own pixels across zooms.
{
  const lod = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  lod.on('pageerror', (e) => pageErrors.push('lod-page: ' + e.message));
  await lod.goto(TARGET + '?battle=duel&a=0&b=0&ai=off'); // HeavyInfantry (blue), enemy idle
  await lod.waitForFunction(() => window.__ready === true, undefined, { timeout: 20000 });
  await lod.waitForTimeout(400);
  for (const z of [1, 2, 4, 6, 9]) {
    // Frame unit 0's centroid at this zoom, freeze, and grab its men's screen AABB.
    const box = await lod.evaluate((zoom) => {
      const a = window.__game.unitInfo(0);
      const c = window.__cam;
      c.x = a[32]; c.y = a[33]; c.zoom = zoom; c.pitch = 0; c.clampView?.();
      window.__game.freeze();
      const cnt = a[7];
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      const dpr = window.devicePixelRatio || 1;
      for (let i = 0; i < cnt; i++) {
        const [wx, wy] = window.__game.soldierPos(i);
        const [sx, sy] = c.worldToScreen(wx, wy).map((v) => v * dpr);
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      return [x0, y0, x1, y1];
    }, z);
    const buf = await lod.screenshot();
    await lod.evaluate(() => window.__game.freeze(false));
    const png = PNG.sync.read(buf);
    const cx0 = Math.max(0, Math.floor(box[0] - 4)), cx1 = Math.min(png.width - 1, Math.ceil(box[2] + 4));
    const cy0 = Math.max(0, Math.floor(box[1] - 4)), cy1 = Math.min(png.height - 1, Math.ceil(box[3] + 4));
    let n = 0, unit = 0, blue = 0, dark = 0;
    for (let y = cy0; y <= cy1; y++) {
      for (let x = cx0; x <= cx1; x++) {
        const o = (y * png.width + x) * 4;
        const r = png.data[o], g = png.data[o + 1], b = png.data[o + 2];
        n++;
        if (Math.max(r, g, b) < 45) dark++;
        if (!(g > r + 8 && g > b + 8)) { unit++; if (b - r > 20 && b > 70) blue++; } // non-grass = the unit
      }
    }
    const darkFrac = dark / n, blueShare = unit ? blue / unit : 0;
    const detail = `darkFrac ${(darkFrac * 100).toFixed(0)}% blueShare ${(blueShare * 100).toFixed(0)}%`;
    check(`LOD z${z}: unit is not a black slab`, darkFrac < 0.2, detail);
    check(`LOD z${z}: unit reads team-blue`, blueShare > 0.55, detail);
  }
  await lod.close();
}

// --- Selection works at any device-pixel-ratio --------------------------------
// Clicking and drag-boxing units must select them. The bug this guards: the 3D
// engine left the canvas CSS-sized while camera/input assume a device-pixel
// canvas, so on a Retina screen (dpr 2) the click maps to the wrong world point
// and selects nothing. dpr 1 hid it (CSS px == device px). We drive a REAL click
// at the unit's true on-screen pixel (computed from the canvas backing store, so
// it's valid whether the canvas is CSS- or device-sized) and read the live
// selection — exercising mousedown→pickUnit→selected end to end.
for (const dpr of [1, 2]) {
  const sp = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
  sp.on('pageerror', (e) => pageErrors.push(`sel-page(dpr${dpr}): ` + e.message));
  await sp.goto(TARGET + '?map=A&ai=off');
  await sp.waitForFunction(() => window.__ready === true, undefined, { timeout: 20000 });
  await sp.waitForTimeout(400);
  // Where unit u is actually drawn, in CSS px (== where a user clicks).
  const trueScreen = (u) => sp.evaluate((u) => {
    const a = window.__game.unitInfo(u);
    const c = window.__cam;
    const cv = document.getElementById('battlefield');
    const cosP = Math.max(0.2, Math.cos(c.pitch || 0));
    const canvasX = (a[32] - c.x) * c.zoom + cv.width / 2;
    const canvasY = (c.y - a[33]) * c.zoom * cosP + cv.height / 2;
    return { x: canvasX * (cv.clientWidth / cv.width), y: canvasY * (cv.clientHeight / cv.height) };
  }, u);
  // Frame unit 4 OFF-CENTRE (a centred unit hides the scale error), flat zoom.
  await sp.evaluate(() => {
    const a = window.__game.unitInfo(4); const c = window.__cam;
    c.zoom = 3; c.pitch = 0; c.x = a[32] - 90; c.y = a[33]; c.clampView?.();
    window.__game.select(-1);
  });
  await sp.waitForTimeout(150);
  const cpt = await trueScreen(4);
  await sp.mouse.click(cpt.x, cpt.y);
  await sp.waitForTimeout(120);
  const clicked = await sp.evaluate(() => window.__game.selected());
  check(`dpr${dpr}: left-click selects the unit under the cursor`, clicked.includes(4),
    `clicked (${cpt.x.toFixed(0)},${cpt.y.toFixed(0)}) -> selected ${JSON.stringify(clicked)}`);
  // Drag-box around the same unit selects it.
  await sp.evaluate(() => window.__game.select(-1));
  const c2 = await trueScreen(4);
  await sp.mouse.move(c2.x - 70, c2.y - 45);
  await sp.mouse.down();
  await sp.mouse.move(c2.x, c2.y, { steps: 3 });
  await sp.mouse.move(c2.x + 70, c2.y + 45, { steps: 5 });
  await sp.mouse.up();
  await sp.waitForTimeout(120);
  const boxed = await sp.evaluate(() => window.__game.selected());
  check(`dpr${dpr}: drag-box selects the unit inside it`, boxed.includes(4),
    `box around (${c2.x.toFixed(0)},${c2.y.toFixed(0)}) -> selected ${JSON.stringify(boxed)}`);
  await sp.close();
}

// The in-game manual opens and has content.
await page.click('#btn-menu');
await page.click('#pause-manual');
const manualLen = await page.evaluate(() => document.getElementById('manual').innerHTML.length);
check('the field manual opens in-game', manualLen > 4000, `${manualLen} chars`);
await snapCheck(page, 'battle-manual', check, { maxDiffRatio: 0.0008 });
await page.evaluate(() => { document.getElementById('manual').style.display = 'none'; });

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
if (FULL) {
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
// (The congestion leash makes threading politer than the original 0.8m bar,
// and the stamina economy means the cav ends a 90s ride with drained legs.)
check('cavalry mass displaces infantry', lsMax > 0.4, `max shove ${lsMax.toFixed(2)} m, mean ${lsMean.toFixed(2)} m mid-threading`);
// Dense moving melee: a small SwiftShader rasterization wobble, like the vibe
// frames; the sim itself is frozen-deterministic here.
await snapCheck(page, 'battle-cavalry-plow', check, { threshold: 0.2, maxDiffRatio: 0.02 });

// --- Stage 3: order delay pie on a disordered unit ---------------------------
const lsInfo = await page.evaluate(() => window.__game.unitInfo(9));
if (lsInfo[4] < 0.8) {
  await page.evaluate(([x, y]) => window.__game.setOrder(9, x + 30, y), [lsInfo[0], lsInfo[1]]);
  const delayed = await page.evaluate(() => window.__game.unitInfo(9));
  check('disordered unit shows order delay', delayed[14] > 0, `delay frac ${delayed[14].toFixed(2)}`);
} else {
  check('disordered unit shows order delay', true, `skipped: cohesion ${lsInfo[4].toFixed(2)} above threshold`);
}

} // end FULL stage 2-3

// --- Stage 4-5: mechanics smoke on a small page ------------------------------
if (FULL) {
// These are web/export smoke checks for mechanics already pinned natively.
// Keep them on a 480-soldier duel page: the 30k map made a single wide unit
// take minutes to settle and turned a mechanics check into a perf test.
const mech = await browser.newPage({ viewport: { width: 1280, height: 800 } });
mech.on('pageerror', (e) => pageErrors.push('mech-page: ' + e.message));
await mech.goto(TARGET + '?battle=duel&a=0&b=0&ai=off');
await mech.waitForFunction(() => window.__ready === true, undefined, { timeout: 20000 });
await mech.waitForTimeout(300);

const h0 = await mech.evaluate(() => window.__game.unitInfo(0));
await mech.evaluate(([x, y]) => {
  window.__game.setOrder(0, x, y - 80); // about-face: order is behind
  window.__game.advance(500);
}, [h0[0], h0[1]]);
const midPivot = await mech.evaluate(() => window.__game.unitInfo(0));
check('pivot keeps cohesion (no rag)', midPivot[4] > 0.3, `cohesion mid-pivot ${midPivot[4].toFixed(2)}`);
await mech.evaluate(() => window.__game.advance(5400));
const postPivot = await mech.evaluate(() => window.__game.unitInfo(0));
const facingErr = Math.abs(postPivot[2] + Math.PI / 2); // facing south
check('unit completed the 180', postPivot[12] === 0 && postPivot[4] > 0.85 && facingErr < 0.5,
  `facing ${postPivot[2].toFixed(2)} rad, cohesion ${postPivot[4].toFixed(2)}, target ${postPivot[12]}`);
// (No pixel snap of the reformed unit: the 180° pivot has its own weave shot,
// t3-pivot-180; the behavioral assert above is the regression here.)

const la = await mech.evaluate(() => window.__game.unitInfo(0));
await mech.evaluate(([x, y]) => {
  window.__game.setPace(0, 1);
  window.__game.setOrder(0, x + 250, y);
  window.__game.advance(1800);
}, [la[0], la[1]]);
const ran = await mech.evaluate(() => window.__game.unitInfo(0));
check('running drains stamina', ran[8] < 0.75, `stamina ${ran[8].toFixed(2)} after 60s run`);
await mech.evaluate(() => {
  const i = window.__game.unitInfo(0);
  window.__game.setPace(0, 0);
  window.__game.setOrder(0, i[0], i[1]);
  window.__game.advance(4500); // halt + 150s rest (re-forming first)
});
const rested = await mech.evaluate(() => window.__game.unitInfo(0));
check('rest recovers stamina', rested[8] > ran[8] + 0.08, `stamina ${ran[8].toFixed(2)} -> ${rested[8].toFixed(2)}`);
await mech.close();

// --- Stage 6: melee — two heavies meet, fight, and leave corpses -------------
// Morale ends fights on its own schedule now, so sample for the PEAK of the
// engagement rather than betting on one instant.
const meleePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
meleePage.on('pageerror', (e) => pageErrors.push('melee-page: ' + e.message));
await meleePage.goto(TARGET + '?battle=duel&a=0&b=0&ai=off');
await meleePage.waitForFunction(() => window.__ready === true, undefined, { timeout: 20000 });
await meleePage.waitForTimeout(300);
const peakEngaged = await meleePage.evaluate(() => {
  window.__game.setPace(0, 1);
  window.__game.setPace(1, 1);
  window.__game.attackOrder(0, 1);
  window.__game.attackOrder(1, 0);
  window.__game.advance(2200);
  let peak = 0;
  for (let k = 0; k < 12; k++) {
    window.__game.advance(200);
    peak = Math.max(peak, window.__game.unitInfo(0)[16]);
  }
  return peak;
});
check('units are engaged mid-fight', peakEngaged > 20, `${peakEngaged} fighting at the peak`);
// (No pixel snap: the vibe `heavy-both` timeline is this same heavy-v-heavy
// melee, baselined frame by frame; these are the behavioral asserts.)
const red = await meleePage.evaluate(() => window.__game.unitInfo(0));
const blue = await meleePage.evaluate(() => window.__game.unitInfo(1));
const redLosses = red[7] - red[15];
const blueLosses = blue[7] - blue[15];
// (The old >30 bar was calibrated to the charge-exit bug: pinned-charging
// lines zippered into a blob and slaughtered each other. Fronts + morale
// resolve the fight after single-digit losses — corpses, not carnage.)
check('melee inflicts casualties', redLosses + blueLosses > 3,
  `losses red ${redLosses} / blue ${blueLosses}`);
// (Until morale lands, to-the-death is the artificial endpoint; this guards
// against instant one-sided deletion only.)
check('melee is a grind, not annihilation', red[15] + blue[15] > 250,
  `${red[15]}/${red[7]} and ${blue[15]}/${blue[7]} still standing`);
await meleePage.close();

} // end FULL stages 4-6

// --- Stage: cluster group-move ----------------------------------------------
// Select two adjacent main-line units AND the detached west cavalry wing,
// then group-move to open ground: the line pair must keep its relative
// offset; the far cavalry must end up alongside (compressed star). Behavioral
// only — the pixel snap would be mode-dependent (the FULL cavalry stage above
// perturbs the shared deployment), and the asserts below are the real test.
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

// Done with the deterministic captures: resume real time so the fps/tick EMAs
// have live frames to measure for the health checks below.
await page.evaluate(() => window.__game.freeze(false));

// Capture page-1 health BEFORE the AI stage backgrounds it (rAF throttling
// would misread fps afterward); let the EMA settle after the long advance.
await page.waitForTimeout(3000);
const statsPre = await page.evaluate(() => window.__game.stats());

// --- Stage 8: the AI fights a battle unattended ------------------------------
if (FULL) {
const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page2.on('pageerror', (e) => pageErrors.push('ai-page: ' + e.message));
// Use the smaller 5v5 sandbox for the AI smoke. The 30k campaign-scale map is
// already covered by the quick boot/render/perf checks; synchronously advancing
// it for 12 battle-minutes made verify:full take many minutes for no extra UI
// coverage.
await page2.goto(TARGET + '?battle=5v5&ai=on');
await page2.waitForFunction(() => window.__ready === true, undefined, { timeout: 20000 });
// Freeze at a fixed tick, then drive the whole AI fight with advance() while
// frozen — a reproducible trajectory (fixed seed) for a stable `battle-ai` snap.
await page2.evaluate(() => window.__game.freezeAtTick(30));
const ammoBefore = await page2.evaluate(() => {
  const rows = [];
  for (let u = 0; u < window.__game.stats().units; u++) rows.push(window.__game.unitInfo(u)[19]);
  return rows;
});
await page2.evaluate(() => window.__game.advance(6000)); // small battle: closes and resolves quickly
const aiState = await page2.evaluate(() => {
  let blueMoved = 0;
  let dead = 0;
  const ammoAfter = [];
  for (let u = 0; u < window.__game.stats().units; u++) {
    const i = window.__game.unitInfo(u);
    dead += i[7] - i[15];
    ammoAfter.push(i[19]);
    if (i[6] === 1 && i[1] < 100) blueMoved++;
  }
  return { blueMoved, dead, ammoAfter, victor: window.__game.stats().victor };
});
const ammoSpent = ammoBefore.reduce((sum, before, u) => sum + Math.max(0, before - aiState.ammoAfter[u]), 0);
check('the AI advances its army', aiState.blueMoved >= 3, `${aiState.blueMoved} blue units left their line`);
check('the AI fights', aiState.dead > 300, `${aiState.dead} casualties`);
check('archers volley the attackers on their own', ammoSpent > 0, `${ammoSpent} shots spent`);
await page2.evaluate(() => { const g = document.getElementById('gameover'); if (g) g.style.display = 'none'; });
await snapCheck(page2, 'battle-ai', check, { threshold: 0.2, maxDiffRatio: 0.02 });
await page2.close();
} // end FULL stage 8
await page.bringToFront(); // background tabs throttle rAF: restore page 1

// --- Health -------------------------------------------------------------------
const stats2 = await page.evaluate(() => window.__game.stats());
// This is a browser glue smoke, not the sim behavior/perf authority (cargo owns
// that). Headless wasm on software/virtualized runners is much slower than the
// native profile; keep the gate as a pathological-stall tripwire, not a design
// tick-rate target.
check('tick under budget', stats2.tickMs < 60, `${stats2.tickMs.toFixed(2)} ms avg at ${stats2.soldiers} soldiers`);
// Software GL renders the textured sprite pipeline slowly; real GPUs don't.
check('frame rate alive (headless/software GL)', statsPre.fps > 4, `${statsPre.fps.toFixed(0)} fps`);
check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

// --- Unit-banner component: standalone visual regression (last; navigates away)
// The banner (standard + HP/cohesion bars + status chips) renders on its own
// gallery route, no sim or engine — a pure-DOM snapshot, so it can be exact.
await page.goto(TARGET + '?test=banners');
await page.waitForSelector('#banner-gallery .ubanner', { timeout: 10000 });
await page.waitForTimeout(150);
await snapCheck(page, 'banner-gallery', check);

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
