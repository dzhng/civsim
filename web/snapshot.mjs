// Pixel-level screenshot regression — the ONE primitive every visual shot flows
// through (verify harnesses, vibe timelines, model sheets). A committed
// baseline is at once the review artifact, the PR image-diff, and the gate.
//
// snapCheck(page, name, check) screenshots the page and compares it against
// the committed baseline in shots/<name>.png — each harness owns a subfolder
// (the name carries it, e.g. 'vibe/heavy-both/t020s'; scene owners pass an
// explicit baseDir such as shots/battle/ or shots/campaign/). A missing baseline is created and
// passes ("baseline created" — commit it), so a first run never spuriously
// fails. On mismatch the check fails and shots/diff/<name>.png (highlighted
// diff) + <name>-actual.png are written for inspection. Re-bless intentional
// changes (a UI tweak, a deliberate mechanics shift) with:
//
//   UPDATE_SHOTS=1 node verify-battle.mjs   # or vibe/all.mjs, shots/models/scripts/soldier-sheets.mjs
//
// Snapshots only stay green if the moment is deterministic: fixed viewport,
// fixed camera, sim paused/frozen (battle: window.__game.freeze()), no
// wall-clock-driven pixels. UPDATE_SHOTS only rewrites a baseline when decoded
// pixels changed, so PNG metadata/compression differences do not churn history.
// Baselines are per-platform (font/GPU rasterization differs across OSes); the
// threshold below absorbs antialiasing wobble only.

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const SHOTS = new URL("./shots/", import.meta.url).pathname;
const DIFF = new URL("./shots/diff/", import.meta.url).pathname;
const activeRefreshes = new Map();

function safeSnapshotPath(name) {
  if (name.startsWith("/") || name.split("/").some((part) => part === "..")) {
    throw new Error(`unsafe snapshot path: ${name}`);
  }
}

/** Start a baseline-folder refresh. Existing baselines stay in place during the
 *  run so UPDATE_SHOTS can skip byte churn when pixels are unchanged; finish
 *  with finishSnapshotFolder() to prune frames that were not regenerated. */
export async function beginSnapshotFolderRefresh(name) {
  if (!process.env.UPDATE_SHOTS) return;
  if (process.env.SNAP) {
    throw new Error(
      `Refusing UPDATE_SHOTS with SNAP while refreshing ${name}: ` +
        "timeline re-blesses must clear the whole folder first so stale frames cannot survive.",
    );
  }
  safeSnapshotPath(name);
  const dir = SHOTS + name;
  await mkdir(dir, { recursive: true });
  activeRefreshes.set(dir.endsWith("/") ? dir : `${dir}/`, new Set());
}

async function* pngFiles(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      yield* pngFiles(path);
    } else if (entry.isFile() && entry.name.endsWith(".png")) {
      yield path;
    }
  }
}

function markRefreshedSnapshot(path) {
  for (const [dir, touched] of activeRefreshes) {
    if (path.startsWith(dir)) touched.add(path);
  }
}

export async function finishSnapshotFolder(name) {
  if (!process.env.UPDATE_SHOTS) return { pruned: 0 };
  safeSnapshotPath(name);
  const dir = SHOTS + name;
  const key = dir.endsWith("/") ? dir : `${dir}/`;
  const touched = activeRefreshes.get(key);
  if (!touched) return { pruned: 0 };
  let pruned = 0;
  for await (const path of pngFiles(dir)) {
    if (!touched.has(path)) {
      await rm(path, { force: true });
      pruned++;
    }
  }
  activeRefreshes.delete(key);
  return { pruned };
}

function samePixels(a, b) {
  return a.width === b.width && a.height === b.height && Buffer.compare(a.data, b.data) === 0;
}

/** Tolerant by default: a per-pixel colour threshold absorbs anti-aliasing and
 *  the GPU/font rasterization that differs from machine to machine, and a small
 *  area budget lets a minor rendering tweak through — so a snap fails on a real
 *  change (layout, colour, a regressed feature), not on noise. `threshold` is
 *  pixelmatch's 0..1 per-pixel sensitivity; `maxDiffRatio` is the fraction of
 *  pixels allowed to differ. The budget sits just above measured rasterization
 *  noise (unchanged views drift ~1-2% machine-to-machine) and below a real
 *  rendering change (a moved road, a recoloured region run 2.5%+), so noise
 *  passes but an actual change still trips the gate and must be re-blessed.
 *  Tighten (pass 0,0) for a snap that must be exact. `baseDir` overrides the
 *  committed-baseline root (default shots/); scene owners pass shots/battle/,
 *  shots/campaign/, shots/ui/, or shots/models/ so each surface owns its folder. */
export async function snapCheck(
  page,
  name,
  check,
  { threshold = 0.12, maxDiffRatio = 0.02, shot, baseDir = SHOTS } = {},
) {
  // SNAP=<substr> runs only the snaps whose name contains <substr> (comma-OR).
  // The harness still drives all setup, but unmatched snaps are skipped — no
  // compare, no diff/actual written. Use it to iterate on one view fast.
  const only = process.env.SNAP;
  if (only && !only.split(",").some((s) => name.includes(s.trim()))) return;
  safeSnapshotPath(name);
  // `shot` lets callers that already hold a PNG buffer (a composited contact
  // sheet, a reused frame) skip the page.screenshot(); otherwise grab one now.
  if (!shot) shot = await page.screenshot();
  // name may carry a subfolder (e.g. 'vibe/heavy-both/t000s'); make it.
  await mkdir(baseDir + (name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : ""), {
    recursive: true,
  });
  const basePath = baseDir + name + ".png";
  let baseline = null;
  try {
    baseline = PNG.sync.read(await readFile(basePath));
  } catch {}

  if (!baseline || process.env.UPDATE_SHOTS) {
    if (baseline && process.env.UPDATE_SHOTS) {
      const cur = PNG.sync.read(shot);
      markRefreshedSnapshot(basePath);
      if (samePixels(baseline, cur)) {
        check(`snapshot ${name}`, true, "baseline unchanged");
        return { status: "unchanged" };
      }
    }
    await writeFile(basePath, shot);
    markRefreshedSnapshot(basePath);
    check(`snapshot ${name}`, true, baseline ? "baseline updated" : "baseline created");
    return { status: baseline ? "updated" : "created" };
  }

  const cur = PNG.sync.read(shot);
  if (cur.width !== baseline.width || cur.height !== baseline.height) {
    check(
      `snapshot ${name}`,
      false,
      `size ${cur.width}x${cur.height} vs baseline ${baseline.width}x${baseline.height}`,
    );
    return { status: "failed" };
  }
  const diff = new PNG({ width: cur.width, height: cur.height });
  const differing = pixelmatch(baseline.data, cur.data, diff.data, cur.width, cur.height, {
    threshold,
  });
  const ratio = differing / (cur.width * cur.height);
  const ok = ratio <= maxDiffRatio;
  if (!ok) {
    await mkdir(DIFF + (name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : ""), {
      recursive: true,
    });
    await writeFile(DIFF + name + ".png", PNG.sync.write(diff));
    await writeFile(DIFF + name + "-actual.png", shot);
  }
  check(
    `snapshot ${name}`,
    ok,
    `${differing} px differ (${(ratio * 100).toFixed(4)}%)${ok ? "" : ` — see shots/diff/${name}.png`}`,
  );
  return { status: ok ? "matched" : "failed" };
}
