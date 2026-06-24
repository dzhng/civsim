import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { snapCheck } from './snapshot.mjs';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';
const HERE = new URL('.', import.meta.url);
const SCENARIOS_DIR = new URL('./scenarios/', import.meta.url);

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

async function loadScenarios() {
  const files = (await readdir(SCENARIOS_DIR))
    .filter((file) => file.endsWith('.mjs') && !file.startsWith('_') && file !== 'worlds.mjs')
    .sort();
  const scenarios = [];
  for (const file of files) {
    const mod = await import(new URL(file, SCENARIOS_DIR));
    if (!mod.meta || typeof mod.run !== 'function') {
      throw new Error(`scenario ${file} must export meta and run()`);
    }
    scenarios.push({ ...mod, file });
  }
  return scenarios;
}

function matchesName(scenario, names) {
  if (names.length === 0) return true;
  return names.some((name) => scenario.meta.name === name || scenario.meta.name.includes(name));
}

function matchesSnap(scenario, filters) {
  if (filters.length === 0) return true;
  return (scenario.meta.snapshots ?? []).some((snap) => filters.some((filter) => snap.includes(filter)));
}

function selectScenarios(all, { full, names, includeNames }) {
  const snapFilters = (process.env.SNAP ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  let selected = all;

  if (includeNames) {
    const include = new Set(includeNames);
    selected = selected.filter((scenario) => include.has(scenario.meta.name));
  } else {
    selected = selected.filter((scenario) => full || scenario.meta.tier !== 'full' || names.length > 0);
  }

  selected = selected.filter((scenario) => matchesName(scenario, names));

  if (snapFilters.length > 0) {
    const anyMatch = all.filter((scenario) => matchesSnap(scenario, snapFilters));
    selected = selected.filter((scenario) => matchesSnap(scenario, snapFilters));
    if (selected.length === 0) {
      const matchedFull = anyMatch.filter((scenario) => scenario.meta.tier === 'full').map((s) => s.meta.name);
      if (!full && names.length === 0 && matchedFull.length > 0) {
        throw new Error(`SNAP matched only --full scenarios: ${matchedFull.join(', ')}`);
      }
      const known = all.flatMap((scenario) => scenario.meta.snapshots ?? []).sort();
      throw new Error(`SNAP did not match any selected scenario snapshot: ${snapFilters.join(', ')}\nKnown snapshots: ${known.join(', ')}`);
    }
  }

  if (selected.length === 0) {
    const known = all.map((scenario) => scenario.meta.name).sort();
    throw new Error(`No scenarios matched. Known scenarios: ${known.join(', ')}`);
  }

  return selected;
}

function createReporter() {
  const failures = [];
  const pageErrors = [];
  return {
    failures,
    pageErrors,
    check(scenario, name, ok, detail) {
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${scenario}: ${name}${detail ? `  (${detail})` : ''}`);
      if (!ok) failures.push(`${scenario}: ${name}`);
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
    for (const scenario of selected) {
      const local = {
        browser,
        target: TARGET,
        check: (name, ok, detail) => reporter.check(scenario.meta.name, name, ok, detail),
        newPage: async (opts = {}) => {
          const page = await browser.newPage({
            viewport: opts.viewport ?? { width: 1280, height: 800 },
            deviceScaleFactor: opts.deviceScaleFactor,
          });
          reporter.wirePage(page, opts.errorPrefix ? `${scenario.meta.name}/${opts.errorPrefix}: ` : `${scenario.meta.name}: `);
          return page;
        },
        snap: async (page, name, opts = {}) => {
          await snapCheck(page, opts.baseline ?? name, local.check, opts);
        },
      };
      await scenario.run(local);
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
  const all = await loadScenarios();
  if (args.list) {
    for (const scenario of all) {
      console.log(`${scenario.meta.name}\t${scenario.meta.tier ?? 'quick'}\t${scenario.meta.kind ?? 'flow'}\t${scenario.meta.describe ?? ''}`);
    }
    return 0;
  }
  const selected = selectScenarios(all, { ...args, includeNames: options.includeNames });
  return runSelected(selected);
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invoked) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error.message);
    process.exit(2);
  });
}
