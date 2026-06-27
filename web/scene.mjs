import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { snapCheck } from './snapshot.mjs';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';
const HERE = new URL('.', import.meta.url);
const SCENES_DIR = new URL('./scenes/', import.meta.url);
// Scene baselines live in their own shots/scenes/ folder, separate from the
// vibe/model/campaign snaps in their sibling folders under shots/.
const SCENES_SHOTS = new URL('./shots/scenes/', import.meta.url).pathname;

function parseArgs(argv) {
  const names = [];
  let full = false;
  let list = false;
  for (const arg of argv) {
    if (arg === '--full') full = true;
    else if (arg === '--list') list = true;
    else names.push(arg);
  }
  return { full, list, names };
}

async function loadScenes() {
  const files = (await readdir(SCENES_DIR))
    .filter((file) => file.endsWith('.mjs') && !file.startsWith('_') && file !== 'worlds.mjs')
    .sort();
  const scenes = [];
  for (const file of files) {
    const mod = await import(new URL(file, SCENES_DIR));
    if (!mod.meta || typeof mod.run !== 'function') {
      throw new Error(`scene ${file} must export meta and run()`);
    }
    scenes.push({ ...mod, file });
  }
  return scenes;
}

function matchesName(scene, names) {
  if (names.length === 0) return true;
  return names.some((name) => scene.meta.name === name || scene.meta.name.includes(name));
}

function matchesSnap(scene, filters) {
  if (filters.length === 0) return true;
  return (scene.meta.snapshots ?? []).some((snap) => filters.some((filter) => snap.includes(filter)));
}

function selectScenes(all, { full, names, includeNames }) {
  const snapFilters = (process.env.SNAP ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  let selected = all;

  if (includeNames) {
    const include = new Set(includeNames);
    selected = selected.filter((scene) => include.has(scene.meta.name));
  } else {
    selected = selected.filter((scene) => full || scene.meta.tier !== 'full' || names.length > 0);
  }

  selected = selected.filter((scene) => matchesName(scene, names));

  if (snapFilters.length > 0) {
    const anyMatch = all.filter((scene) => matchesSnap(scene, snapFilters));
    selected = selected.filter((scene) => matchesSnap(scene, snapFilters));
    if (selected.length === 0) {
      const matchedFull = anyMatch.filter((scene) => scene.meta.tier === 'full').map((s) => s.meta.name);
      if (!full && names.length === 0 && matchedFull.length > 0) {
        throw new Error(`SNAP matched only --full scenes: ${matchedFull.join(', ')}`);
      }
      const known = all.flatMap((scene) => scene.meta.snapshots ?? []).sort();
      throw new Error(`SNAP did not match any selected scene snapshot: ${snapFilters.join(', ')}\nKnown snapshots: ${known.join(', ')}`);
    }
  }

  if (selected.length === 0) {
    const known = all.map((scene) => scene.meta.name).sort();
    throw new Error(`No scenes matched. Known scenes: ${known.join(', ')}`);
  }

  return selected;
}

function createReporter() {
  const failures = [];
  const pageErrors = [];
  return {
    failures,
    pageErrors,
    check(scene, name, ok, detail) {
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${scene}: ${name}${detail ? `  (${detail})` : ''}`);
      if (!ok) failures.push(`${scene}: ${name}`);
    },
    wirePage(page, prefix = '') {
      page.on('pageerror', (e) => pageErrors.push(prefix + e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') pageErrors.push(prefix + m.text());
      });
    },
  };
}

async function runSelected(selected) {
  const browser = await chromium.launch();
  const reporter = createReporter();
  try {
    for (const scene of selected) {
      const local = {
        browser,
        target: TARGET,
        check: (name, ok, detail) => reporter.check(scene.meta.name, name, ok, detail),
        newPage: async (opts = {}) => {
          const page = await browser.newPage({
            viewport: opts.viewport ?? { width: 1280, height: 800 },
            deviceScaleFactor: opts.deviceScaleFactor,
          });
          reporter.wirePage(page, opts.errorPrefix ? `${scene.meta.name}/${opts.errorPrefix}: ` : `${scene.meta.name}: `);
          return page;
        },
        snap: async (page, name, opts = {}) => {
          await snapCheck(page, opts.baseline ?? name, local.check, { ...opts, baseDir: SCENES_SHOTS });
        },
      };
      await scene.run(local);
    }
    reporter.check('runner', 'no page errors', reporter.pageErrors.length === 0, reporter.pageErrors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
  console.log(reporter.failures.length ? `\n${reporter.failures.length} FAILURE(S)` : '\nALL CHECKS PASSED');
  return reporter.failures.length ? 1 : 0;
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const args = parseArgs(argv);
  const all = await loadScenes();
  if (args.list) {
    for (const scene of all) {
      console.log(`${scene.meta.name}\t${scene.meta.tier ?? 'quick'}\t${scene.meta.kind ?? 'flow'}\t${scene.meta.describe ?? ''}`);
    }
    return 0;
  }
  const selected = selectScenes(all, { ...args, includeNames: options.includeNames });
  return runSelected(selected);
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invoked) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error.message);
    process.exit(2);
  });
}
