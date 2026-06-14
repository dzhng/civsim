// Shared plumbing for the vibe-check harnesses (web/vibe/*.mjs). These are NOT
// pass/fail gates — they spawn a scenario, screenshot it every N sim-seconds,
// and dump the frames somewhere you can flip through them. The verify harnesses
// assert; these just let you *look*. Shots land in web/vibe/shots/<name>/
// (gitignored — throwaway manual captures, never baselines).
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';

export const TPS = 30; // sim ticks per second (the harness's advance(300) == 10 s)
export const SHOTS_DIR = new URL('./shots/', import.meta.url).pathname;
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
  await page.waitForFunction(() => window.__ready === true, { timeout: 20000 });
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

/** Screenshot `name` every `stepSecs` sim-seconds until `done(sample)` (or
 *  `maxSteps`). Per step: position the camera (`frame`), freeze + hide the
 *  victory panel, snap to shots/<name>/t###s.png, log (`label`), then advance.
 *  `sample` returns a status object passed to `label`/`done`. */
export async function vibeCapture(page, name, {
  stepSecs = 30, maxSteps = 20, frame, sample, label, done,
} = {}) {
  const dir = `${SHOTS_DIR}${name}/`;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const shots = [];
  for (let step = 0; step <= maxSteps; step++) {
    if (frame) await frame();
    await page.evaluate(() => window.__game.freeze());
    // Keep the field visible at resolution: hide the VICTORY/DEFEAT panel.
    await page.evaluate(() => { const g = document.getElementById('gameover'); if (g) g.style.display = 'none'; });
    await page.waitForTimeout(120);
    const s = sample ? await sample() : {};
    const secs = step * stepSecs;
    const path = `${dir}t${String(secs).padStart(3, '0')}s.png`;
    await page.screenshot({ path });
    shots.push(path);
    if (label) console.log(label(secs, s));
    await page.evaluate(() => window.__game.freeze(false));
    if (done && done(s)) return { shots, resolved: true, dir };
    await page.evaluate((n) => window.__game.advance(n), stepSecs * TPS);
  }
  return { shots, resolved: false, dir };
}
