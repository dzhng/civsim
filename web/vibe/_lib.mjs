// Shared plumbing for the vibe-check harnesses (web/vibe/*.mjs). Each spawns a
// scenario and films it every N sim-seconds — a timeline you flip through to
// SEE a fight (does a rout flee home as a clump, does anyone launch into orbit).
// Every frame is also a pixel-regression baseline (via snapCheck): it lands in
// web/shots/vibe/<name>/ — committed, so the picture is both the thing
// you review AND a gate that turns red (with a highlighted diff in shots/diff/)
// when a downstream mechanics change moves the battle. Re-bless intended shifts
// with UPDATE_SHOTS=1; a scenario exits non-zero when any frame differs.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beginSnapshotFolderRefresh, finishSnapshotFolder, snapCheck } from '../snapshot.mjs';
import { encodeGif, pngToRGBA, downscaleRGBA } from '../shots/_gif.mjs';
import { GPU_HARDWARE_FLAGS, GPU_SWIFTSHADER_FLAGS } from '../renderer-probe-lib.mjs';

const SHOTS = fileURLToPath(new URL('../shots/', import.meta.url));

export const TPS = 30; // sim ticks per second (the harness's advance(300) == 10 s)
const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';
export const UNIT_CENTER_X = 30;
export const UNIT_CENTER_Y = 31;

/** Boot straight into a battle (e.g. 'battle=duel&a=0&b=0&ai=off') and wait for
 *  the debug bridge. Returns { browser, page, errs }. */
export async function openBattle(query) {
  const gpuArgs = process.env.VERIFY_GPU === '1'
    ? (process.env.VERIFY_GPU_ADAPTER === 'hardware' ? GPU_HARDWARE_FLAGS : GPU_SWIFTSHADER_FLAGS)
    : [];
  const launchOptions = { args: gpuArgs };
  if (process.env.VERIFY_HEADFUL === '1') {
    launchOptions.headless = false;
  }
  if (process.env.VERIFY_BROWSER_CHANNEL) {
    launchOptions.channel = process.env.VERIFY_BROWSER_CHANNEL;
  }
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${TARGET}/?${query}`);
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 20000 });
  await page.addStyleTag({
    content: `
      #hud, #buttons, #unitcards, #toolbar, #minimap, #manual, #pausemenu, #gameover {
        display: none !important;
      }
    `,
  });
  // Pin a deterministic starting tick. Boot accrues a wall-clock-VARIABLE handful
  // of real-time ticks before the harness takes control; in chaotic combat a few
  // ticks of offset compound into whole soldiers dying differently (6% of pixels
  // run-to-run). freezeAtTick freezes, then drives to an EXACT absolute tick — and
  // the sim is deterministic in total ticks-from-boot regardless of how they were
  // delivered — so every run reaches the identical seed-determined state. From
  // here orders are issued and the timeline stepped entirely under freeze().
  await page.evaluate(() => window.__game.freezeAtTick(90));
  await page.waitForTimeout(200); // let a frame render (frozen: no ticks accrue)
  return { browser, page, errs };
}

export async function closeBattle(browser, page) {
  try {
    if (page && !page.isClosed()) await page.close({ runBeforeUnload: false });
  } catch {}
  const timeoutMs = Number(process.env.VIBE_CLOSE_TIMEOUT_MS ?? 5000);
  const closed = await Promise.race([
    browser.close().then(() => true, () => false),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
  if (!closed) {
    const proc = typeof browser.process === 'function' ? browser.process() : null;
    if (proc && !proc.killed) proc.kill('SIGKILL');
  }
}

// Class ids (match class.rs / CLASS_NAMES).
export const CLS = {
  heavy: 0, light: 1, longsword: 2, phalanx: 3, archers: 4,
  skirmishers: 5, cavalry: 6, horsearchers: 7, artillery: 8, peasant: 9,
};

/** Fit both duel units (centroids + margin) into view — ~2.5 holds both lines
 *  when they spawn ~400 m apart, ~20 reads individual men once they collide. */
export const fitDuel = (page, opts = {}) => page.evaluate(([centerX, centerY, margin, minZoom]) => {
  const infos = [window.__game.unitInfo(0), window.__game.unitInfo(1)];
  const cv = document.getElementById('battlefield');
  const bounds = [];
  for (const u of [0, 1]) {
    const count = infos[u][7];
    const start = window.__game.soldierStartOf(u);
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, alive = 0;
    for (let i = start; i < start + count; i++) {
      if (window.__game.soldierAlive && window.__game.soldierAlive(i) <= 0) continue;
      alive++;
      const [x, y] = window.__game.soldierPos(i);
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
    }
    if (alive === 0) {
      minx = maxx = infos[u][centerX];
      miny = maxy = infos[u][centerY];
    }
    bounds.push({ unit: u, count, alive, minx, miny, maxx, maxy });
  }
  const stats = window.__game.stats?.();
  let selected = bounds;
  if (stats && (stats.victor === 0 || stats.victor === 1)) {
    selected = [bounds[stats.victor]];
  } else {
    const sorted = [...bounds].sort((a, b) => b.alive - a.alive);
    const large = sorted[0], small = sorted[1];
    if (small && small.alive <= Math.max(12, small.count * 0.18) && large.alive >= Math.max(2 * small.alive, 1)) {
      selected = [large];
    }
  }
  let minx = Math.min(...selected.map((b) => b.minx));
  let maxx = Math.max(...selected.map((b) => b.maxx));
  let miny = Math.min(...selected.map((b) => b.miny));
  let maxy = Math.max(...selected.map((b) => b.maxy));
  const spanX = (maxx - minx) + margin;
  const spanY = (maxy - miny) + margin;
  const c = window.__cam;
  c.x = (minx + maxx) / 2;
  c.y = (miny + maxy) / 2;
  c.pitch = 0;
  c.zoom = Math.max(minZoom, Math.min(20, Math.min(cv.width / spanX, cv.height / spanY)));
  c.clampView?.();
}, [UNIT_CENTER_X, UNIT_CENTER_Y, opts.margin ?? 90, opts.minZoom ?? 2.5]);

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
 *  shots/vibe/<name>/t###s.png (created on first run, diffed after),
 *  log (`label`), and advance. The freeze pins the fidget sway + shader clock,
 *  so a frame is byte-stable on the same code — a real regression target, not
 *  just an eyeball capture. `sample` returns a status object for `label`/`done`.
 *  Returns { frames, resolved, fails }; the script exits with `fails`. */
// The regression default stops on the verdict frame so every committed tile is
// framed around the fight, not a late tail where routed survivors have left the
// camera focus. Set VIBE_TAIL_FRAMES when intentionally filming aftermath.
const TAIL_FRAMES = Number(process.env.VIBE_TAIL_FRAMES ?? 0);

// Every timeline also ships a looping GIF (web/shots/vibe/<name>/timeline.gif) so
// the whole sequence can be WATCHED in one go at ~200 ms/frame, not flipped frame
// by frame. It's derived from the very screenshots the per-frame PNGs gate on
// (downscaled to keep the tracked file small), so it never costs a second capture
// pass. The PNGs stay the full-res regression baselines; the GIF is review-only.
const GIF_DELAY_CS = 20;   // 200 ms per frame
const GIF_DOWNSCALE = 2;   // 1280x800 -> 640x400
function writeIfChanged(path, data) {
  try {
    if (Buffer.compare(fs.readFileSync(path), data) === 0) return false;
  } catch {}
  fs.writeFileSync(path, data);
  return true;
}

function writeTimelineGif(name, shots, { preserveExisting = false } = {}) {
  if (shots.length === 0) return;
  const path = `${SHOTS}vibe/${name}/timeline.gif`;
  if (preserveExisting && fs.existsSync(path)) return;
  const frames = shots.map((buf) => downscaleRGBA(pngToRGBA(buf), GIF_DOWNSCALE));
  const gif = encodeGif(frames, frames[0].width, frames[0].height, GIF_DELAY_CS);
  fs.mkdirSync(`${SHOTS}vibe/${name}`, { recursive: true });
  writeIfChanged(path, gif);
}

export async function vibeCapture(page, name, {
  stepSecs = 30, maxSteps = 20, frame, sample, label, done,
  requireResolved = false,
  // The sim is fully deterministic (freezeAtTick pins the exact tick), so a frame
  // SHOULD be byte-identical — except headless SwiftShader rasterizes a dense
  // melee of overlapping alpha-blended soldiers with ~1% run-to-run wobble. A
  // higher per-pixel threshold ignores the AA edge jitter; the ratio caps the
  // count well below any real mechanics change (a moved soldier shifts a
  // contiguous block, not scattered edges — we measured 5–8% for a 3-tick offset).
  threshold = 0.2, maxDiffRatio = 0.02,
} = {}) {
  await beginSnapshotFolderRefresh(`vibe/${name}`);
  let fails = 0, frames = 0;
  const check = (label2, ok, detail) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'ok  ' : 'DIFF'} ${label2}${detail ? `  ${detail}` : ''}`);
  };
  // The sim is frozen from openBattle and STAYS frozen the whole timeline: a
  // frozen rAF loop adds zero ticks, so advance() is the only clock and every
  // frame lands on an exact, reproducible tick. Never freeze(false) here — that
  // would let wall-clock ticks slip in between steps and reintroduce the drift.
  let post = -1; // -1 until the verdict frame; then counts frames filmed since
  const gifShots = []; // one screenshot per frame, reused for the timeline GIF
  let result;
  let refreshedFrameChanged = false;
  for (let step = 0; ; step++) {
    if (frame) await frame();
    await page.waitForTimeout(120);
    // Keep the field visible at resolution: hide the VICTORY/DEFEAT panel the
    // scene pops on a verdict. Do it right before the shot, so it wins the race
    // with the frame loop that re-shows the panel.
    await page.evaluate(() => { const g = document.getElementById('gameover'); if (g) g.style.display = 'none'; });
    const s = sample ? await sample() : {};
    const secs = step * stepSecs;
    if (label) console.log(label(secs, s));
    // One screenshot per frame, reused for BOTH the pixel-regression compare and
    // the watch-the-whole-sequence GIF — so the timeline always ships a GIF with no
    // second capture pass, even under SNAP= (which filters the compare, not the film).
    const shot = await page.screenshot();
    gifShots.push(shot);
    const snap = await snapCheck(page, `vibe/${name}/t${String(secs).padStart(3, '0')}s`, check, { threshold, maxDiffRatio, shot });
    if (snap?.status === 'created' || snap?.status === 'updated') refreshedFrameChanged = true;
    frames++;
    if (post >= 0) post++;                       // optional post-verdict tail frame
    else if (done && done(s)) post = 0;          // this frame IS the verdict
    if (post >= TAIL_FRAMES) { result = { frames, resolved: true, fails }; break; }
    if (post < 0 && step >= maxSteps) {
      if (requireResolved) {
        fails++;
        console.log(`  FAIL ${name} capped before verdict at ${secs}s`);
      }
      result = { frames, resolved: false, fails };
      break;
    }
    await page.evaluate((n) => window.__game.advance(n), stepSecs * TPS);
  }
  const refresh = await finishSnapshotFolder(`vibe/${name}`);
  writeTimelineGif(name, gifShots, {
    preserveExisting: Boolean(process.env.UPDATE_SHOTS && !refreshedFrameChanged && refresh.pruned === 0),
  });
  return result;
}
