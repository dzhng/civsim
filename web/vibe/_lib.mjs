// Shared plumbing for the vibe-check harnesses (web/vibe/*.mjs). Each spawns a
// scenario and films it every N sim-seconds — a timeline you flip through to
// SEE a fight (does a rout flee home as a clump, does anyone launch into orbit).
// Every frame is also a pixel-regression baseline (via snapCheck): it lands in
// web/shots/baseline/vibe/<name>/ — committed, so the picture is both the thing
// you review AND a gate that turns red (with a highlighted diff in shots/diff/)
// when a downstream mechanics change moves the battle. Re-bless intended shifts
// with UPDATE_SHOTS=1; a scenario exits non-zero when any frame differs.
import { chromium } from 'playwright';
import { snapCheck } from '../snapshot.mjs';

export const TPS = 30; // sim ticks per second (the harness's advance(300) == 10 s)
const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';

/** Boot straight into a battle (e.g. 'battle=duel&a=0&b=0&ai=off') and wait for
 *  the debug bridge. Returns { browser, page, errs }. */
export async function openBattle(query) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${TARGET}/?${query}`);
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 20000 });
  await page.waitForTimeout(500);
  return { browser, page, errs };
}

// Class ids (match class.rs / CLASS_NAMES).
export const CLS = {
  heavy: 0, light: 1, longsword: 2, phalanx: 3, archers: 4,
  skirmishers: 5, cavalry: 6, horsearchers: 7, artillery: 8, peasant: 9,
};

/** Fit both duel units (centroids + margin) into view — ~2.5 holds both lines
 *  when they spawn ~400 m apart, ~20 reads individual men once they collide. */
export const fitDuel = (page) => page.evaluate(() => {
  const a = window.__game.unitInfo(0), b = window.__game.unitInfo(1);
  const cv = document.getElementById('battlefield');
  const spanX = Math.abs(a[32] - b[32]) + 55, spanY = Math.abs(a[33] - b[33]) + 55;
  const c = window.__cam;
  c.x = (a[32] + b[32]) / 2; c.y = (a[33] + b[33]) / 2; c.pitch = 0;
  c.zoom = Math.max(2.5, Math.min(20, Math.min(cv.width / spanX, cv.height / spanY)));
  c.clampView?.();
});

/** Status of the two duel units (a = unit 0, b = unit 1). */
export const duelSample = (page) => page.evaluate(() => {
  const a = window.__game.unitInfo(0), b = window.__game.unitInfo(1);
  return {
    victor: window.__game.stats().victor,
    aAlive: a[15], aTotal: a[7], aCoh: a[4], aFight: a[16], aAmmo: a[19],
    bAlive: b[15], bTotal: b[7], bCoh: b[4], bFight: b[16], bAmmo: b[19],
  };
});

export const duelLabel = (secs, s) =>
  `t=${String(secs).padStart(3)}s  A ${s.aAlive}/${s.aTotal} (coh ${s.aCoh.toFixed(2)})  `
  + `B ${s.bAlive}/${s.bTotal} (coh ${s.bCoh.toFixed(2)})  fighting ${s.aFight}/${s.bFight}  victor ${s.victor}`;

/** Screenshot+regress `name` every `stepSecs` sim-seconds until `done(sample)`
 *  (or `maxSteps`). Per step: position the camera (`frame`), freeze + hide the
 *  victory panel, then snapCheck against the committed baseline
 *  shots/baseline/vibe/<name>/t###s.png (created on first run, diffed after),
 *  log (`label`), and advance. The freeze pins the fidget sway + shader clock,
 *  so a frame is byte-stable on the same code — a real regression target, not
 *  just an eyeball capture. `sample` returns a status object for `label`/`done`.
 *  Returns { frames, resolved, fails }; the script exits with `fails`. */
// Every scenario keeps filming this many frames PAST its verdict, so you always
// see the aftermath — above all HOW the loser routs (a clump fleeing toward its
// home edge, not a scatter). The tail is part of the harness, not a per-test
// option: a fight isn't done at the verdict, it's done when the field clears.
const TAIL_FRAMES = 3;

export async function vibeCapture(page, name, {
  stepSecs = 30, maxSteps = 20, frame, sample, label, done,
  // Full-battle scenes on headless SwiftShader wobble a few sub-pixel AA edges
  // run-to-run even when frozen; absorb that and nothing more.
  threshold = 0.1, maxDiffRatio = 0.004,
} = {}) {
  let fails = 0, frames = 0;
  const check = (label2, ok, detail) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'ok  ' : 'DIFF'} ${label2}${detail ? `  ${detail}` : ''}`);
  };
  let post = -1; // -1 until the verdict frame; then counts frames filmed since
  for (let step = 0; ; step++) {
    if (frame) await frame();
    await page.evaluate(() => window.__game.freeze());
    await page.waitForTimeout(120);
    // Keep the field visible at resolution: hide the VICTORY/DEFEAT panel the
    // scene pops on a verdict. Do it AFTER the settle, right before the shot, so
    // it wins the race with the frame loop that re-shows the panel.
    await page.evaluate(() => { const g = document.getElementById('gameover'); if (g) g.style.display = 'none'; });
    const s = sample ? await sample() : {};
    const secs = step * stepSecs;
    if (label) console.log(label(secs, s));
    await snapCheck(page, `vibe/${name}/t${String(secs).padStart(3, '0')}s`, check, { threshold, maxDiffRatio });
    frames++;
    await page.evaluate(() => window.__game.freeze(false));
    if (post >= 0) post++;                       // already past the verdict: film the tail
    else if (done && done(s)) post = 0;          // this frame IS the verdict
    if (post >= TAIL_FRAMES) return { frames, resolved: true, fails };
    if (post < 0 && step >= maxSteps) return { frames, resolved: false, fails }; // capped before a verdict
    await page.evaluate((n) => window.__game.advance(n), stepSecs * TPS);
  }
}
