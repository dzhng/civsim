// Pixel-level screenshot regression for the verify harnesses.
//
// snapCheck(page, name, check) screenshots the page and compares it against
// the committed baseline in shots/baseline/<name>.png. A missing baseline is
// created and passes ("baseline created" — commit it). On mismatch the check
// fails and shots/diff/<name>.png (highlighted diff) + <name>-actual.png are
// written for inspection. Re-bless intentional UI changes with:
//
//   UPDATE_SHOTS=1 node verify.mjs / verify-campaign.mjs
//
// Snapshots only stay green if the moment is deterministic: fixed viewport,
// fixed camera, sim paused/frozen (battle: window.__game.freeze()), no
// wall-clock-driven pixels. Baselines are per-platform (font/GPU rasterization
// differs across OSes); the threshold below absorbs antialiasing wobble only.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const BASELINE = new URL('./shots/baseline/', import.meta.url).pathname;
const DIFF = new URL('./shots/diff/', import.meta.url).pathname;

/** Exact by default: rendering here is deterministic (fixed seed, frozen
 *  clocks, same GPU), so ANY differing pixel is a real change. Loosen
 *  threshold/maxDiffRatio only for a snap with a proven noise source. */
export async function snapCheck(page, name, check, { threshold = 0, maxDiffRatio = 0 } = {}) {
  // SNAP=<substr> runs only the snaps whose name contains <substr> (comma-OR).
  // The harness still drives all setup, but unmatched snaps are skipped — no
  // compare, no diff/actual written. Use it to iterate on one view fast.
  const only = process.env.SNAP;
  if (only && !only.split(',').some((s) => name.includes(s.trim()))) return;
  const shot = await page.screenshot();
  await mkdir(BASELINE, { recursive: true });
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
    await mkdir(DIFF, { recursive: true });
    await writeFile(DIFF + name + '.png', PNG.sync.write(diff));
    await writeFile(DIFF + name + '-actual.png', shot);
  }
  check(`snapshot ${name}`, ok,
    `${differing} px differ (${(ratio * 100).toFixed(4)}%)${ok ? '' : ` — see shots/diff/${name}.png`}`);
}
