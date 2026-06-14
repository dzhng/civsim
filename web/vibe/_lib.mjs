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
