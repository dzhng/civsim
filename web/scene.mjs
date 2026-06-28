import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { snapCheck } from './snapshot.mjs';
import { WEBGPU_HARDWARE_FLAGS, WEBGPU_SWIFTSHADER_FLAGS } from './webgpu-probe-lib.mjs';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';
const HERE = new URL('.', import.meta.url);
const ROOT = new URL('../', import.meta.url);
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
  const checks = [];
  return {
    failures,
    pageErrors,
    checks,
    check(scene, name, ok, detail) {
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${scene}: ${name}${detail ? `  (${detail})` : ''}`);
      checks.push({ scenario: scene, name, ok: Boolean(ok), detail: detail ?? '' });
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
  const webgpuArgs = process.env.VERIFY_WEBGPU === '1'
    ? (process.env.VERIFY_WEBGPU_ADAPTER === 'hardware' ? WEBGPU_HARDWARE_FLAGS : WEBGPU_SWIFTSHADER_FLAGS)
    : [];
  const launchOptions = {
    args: webgpuArgs,
  };
  if (process.env.VERIFY_HEADFUL === '1') {
    launchOptions.headless = false;
  }
  if (process.env.VERIFY_BROWSER_CHANNEL) {
    launchOptions.channel = process.env.VERIFY_BROWSER_CHANNEL;
  }
  if (process.env.VERIFY_SLOW_MO) {
    const slowMo = Number(process.env.VERIFY_SLOW_MO);
    if (!Number.isFinite(slowMo) || slowMo < 0) {
      throw new Error(`VERIFY_SLOW_MO must be a non-negative number, got ${process.env.VERIFY_SLOW_MO}`);
    }
    launchOptions.slowMo = slowMo;
  }
  const browser = await chromium.launch(launchOptions);
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
      try {
        await scene.run(local);
      } catch (error) {
        reporter.check(
          scene.meta.name,
          'scene completed without throwing',
          false,
          error instanceof Error ? error.stack ?? error.message : String(error),
        );
      }
    }
    reporter.check('runner', 'no page errors', reporter.pageErrors.length === 0, reporter.pageErrors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
  console.log(reporter.failures.length ? `\n${reporter.failures.length} FAILURE(S)` : '\nALL CHECKS PASSED');
  const code = reporter.failures.length ? 1 : 0;
  await writeScenarioReport(selected, reporter, code);
  return code;
}

async function writeScenarioReport(selected, reporter, exitCode) {
  if (!process.env.SCENARIO_REPORT_JSON) return;
  const url = new URL(process.env.SCENARIO_REPORT_JSON, HERE);
  const report = {
    kind: 'scenario-run-report',
    generatedAt: process.env.SCENARIO_REPORT_GENERATED_AT ?? new Date().toISOString(),
    target: TARGET,
    webgpu: process.env.VERIFY_WEBGPU === '1',
    headful: process.env.VERIFY_HEADFUL === '1',
    browserChannel: process.env.VERIFY_BROWSER_CHANNEL ?? null,
    webgpuAdapter: process.env.VERIFY_WEBGPU_ADAPTER ?? (process.env.VERIFY_WEBGPU === '1' ? 'swiftshader' : null),
    exitCode,
    status: exitCode === 0 ? 'pass' : 'fail',
    scenarios: selected.map((scenario) => ({
      name: scenario.meta.name,
      file: scenario.file,
      kind: scenario.meta.kind ?? null,
      tier: scenario.meta.tier ?? null,
    })),
    checks: reporter.checks,
    failures: reporter.failures,
    pageErrors: reporter.pageErrors,
  };
  await mkdir(new URL('.', url), { recursive: true });
  await writeFile(url, JSON.stringify(report, null, 2));
  console.log(`scenarioReport=${relativePath(url)}`);
}

function relativePath(url) {
  return decodeURIComponent(url.pathname).replace(decodeURIComponent(ROOT.pathname), '');
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
