// Pixel-level screenshot regression — the ONE primitive every visual shot flows
// through (verify harnesses, vibe timelines, model turntable). A committed
// baseline is at once the review artifact, the PR image-diff, and the gate.
//
// snapCheck(page, name, check) screenshots the page and compares it against
// the committed baseline in shots/baseline/<name>.png (name may carry a
// subfolder, e.g. 'vibe/heavy-both/t020s'). A missing baseline is created and
// passes ("baseline created" — commit it), so a first run never spuriously
// fails. On mismatch the check fails and shots/diff/<name>.png (highlighted
// diff) + <name>-actual.png are written for inspection. Re-bless intentional
// changes (a UI tweak, a deliberate mechanics shift) with:
//
//   UPDATE_SHOTS=1 node verify-battle.mjs   # or vibe/all.mjs, vibe/turntable.mjs
//
// Snapshots only stay green if the moment is deterministic: fixed viewport,
// fixed camera, sim paused/frozen (battle: window.__game.freeze()), no
// wall-clock-driven pixels. Baselines are per-platform (font/GPU rasterization
// differs across OSes); the threshold below absorbs antialiasing wobble only.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const BASELINE = new URL('./shots/baseline/', import.meta.url).pathname;
const DIFF = new URL('./shots/diff/', import.meta.url).pathname;

function safeSnapshotPath(name) {
  if (name.startsWith('/') || name.split('/').some((part) => part === '..')) {
    throw new Error(`unsafe snapshot path: ${name}`);
  }
}

/** Clear a baseline folder before a full re-bless, so shorter regenerated
 *  timelines cannot leave stale frames behind. Deliberately disabled with SNAP:
 *  a targeted one-frame update should not erase the rest of the folder. */
export async function clearSnapshotFolder(name) {
  if (!process.env.UPDATE_SHOTS || process.env.SNAP) return;
  safeSnapshotPath(name);
  await rm(BASELINE + name, { recursive: true, force: true });
  await mkdir(BASELINE + name, { recursive: true });
}

/** Exact by default: rendering here is deterministic (fixed seed, frozen
 *  clocks, same GPU), so ANY differing pixel is a real change. Loosen
 *  threshold/maxDiffRatio only for a snap with a proven noise source. */
export async function snapCheck(page, name, check, { threshold = 0, maxDiffRatio = 0, shot } = {}) {
  // SNAP=<substr> runs only the snaps whose name contains <substr> (comma-OR).
  // The harness still drives all setup, but unmatched snaps are skipped — no
  // compare, no diff/actual written. Use it to iterate on one view fast.
  const only = process.env.SNAP;
  if (only && !only.split(',').some((s) => name.includes(s.trim()))) return;
  safeSnapshotPath(name);
  // `shot` lets callers that already hold a PNG buffer (a composited contact
  // sheet, a reused frame) skip the page.screenshot(); otherwise grab one now.
  if (!shot) shot = await page.screenshot();
  // name may carry a subfolder (e.g. 'vibe/heavy-both/t000s'); make it.
  await mkdir(BASELINE + (name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : ''), { recursive: true });
  const basePath = BASELINE + name + '.png';
  let baseline = null;
  try {
    baseline = PNG.sync.read(await readFile(basePath));
  } catch {}

  if (!baseline || process.env.UPDATE_SHOTS) {
    await writeFile(basePath, shot);
    check(`snapshot ${name}`, true, baseline ? 'baseline updated' : 'baseline created');
    return;
  }

  const cur = PNG.sync.read(shot);
  if (cur.width !== baseline.width || cur.height !== baseline.height) {
    check(`snapshot ${name}`, false,
      `size ${cur.width}x${cur.height} vs baseline ${baseline.width}x${baseline.height}`);
    return;
  }
  const diff = new PNG({ width: cur.width, height: cur.height });
  const differing = pixelmatch(baseline.data, cur.data, diff.data, cur.width, cur.height, { threshold });
  const ratio = differing / (cur.width * cur.height);
  const ok = ratio <= maxDiffRatio;
  if (!ok) {
    await mkdir(DIFF + (name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : ''), { recursive: true });
    await writeFile(DIFF + name + '.png', PNG.sync.write(diff));
    await writeFile(DIFF + name + '-actual.png', shot);
  }
  check(`snapshot ${name}`, ok,
    `${differing} px differ (${(ratio * 100).toFixed(4)}%)${ok ? '' : ` — see shots/diff/${name}.png`}`);
}
