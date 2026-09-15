import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { loadavg } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runTrial, type BenchmarkOutcome, type BenchmarkRequest } from "./trial.ts";
import { TRIAL_BACKENDS, type TrialBackend } from "./provenance.ts";
import type { CommandResult } from "./host.ts";

const ROOT = new URL("../../../", import.meta.url);
const SCENE_RUNNER = new URL("web/scene.mjs", ROOT);
const BENCHMARK_SCENE = new URL("web/scenes/battle/battle-benchmark-complete.mjs", ROOT);
/** The unchanged scene owns this path; the trial archives whatever it wrote. */
const MENU_EXPORT = new URL(
  "web/reports/rendering/scenario-runs/battle-benchmark/complete.json",
  ROOT,
);

/**
 * Duplicated from `web/src/shared/graphicsSettings` because that owner pulls in
 * React and cannot be imported by this Node entry; `trial.test.ts` pins it
 * against the real constant. Only `audio.muted` is declared: every absent field
 * falls back to the owner's own defaults, so no other quality setting moves.
 */
export const GRAPHICS_SETTINGS_STORAGE_KEY = "civsim.graphicsSettings";
export const TRIAL_GRAPHICS_OVERRIDE = { audio: { muted: false } };

const HELP = `Usage: node apps/battle-perf-lab/trials/runTrial.ts \\
  --backend three|raw|typegpu|vgpu \\
  --url http://127.0.0.1:5260/ \\
  --build-manifest <fixed-menu-builds/manifest.json> \\
  --render-config <canonical render configuration declaration> \\
  --out <empty trial directory> \\
  --order <integer position in the run sequence> \\
  [--run-id <id>] [--host-evidence <uri>] [--observation-interval-ms 60000]`;

export function parseTrialArgs(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!flag.startsWith("--")) throw Error(`unexpected argument ${flag}\n${HELP}`);
    const value = argv[index + 1];
    if (value === undefined) throw Error(`${flag} needs a value\n${HELP}`);
    values.set(flag.slice(2), value);
  }
  const required = (name: string) => {
    const value = values.get(name);
    if (!value) throw Error(`--${name} is required\n${HELP}`);
    return value;
  };
  const backend = required("backend") as TrialBackend;
  if (!TRIAL_BACKENDS.includes(backend)) throw Error(`unknown backend ${backend}\n${HELP}`);
  const order = Number(required("order"));
  if (!Number.isInteger(order) || order < 0) throw Error(`--order must be a whole number\n${HELP}`);
  const intervalMs = Number(values.get("observation-interval-ms") ?? 60000);
  if (!Number.isFinite(intervalMs) || intervalMs < 1000)
    throw Error(`--observation-interval-ms must be at least 1000\n${HELP}`);
  return {
    backend,
    url: required("url"),
    manifestPath: required("build-manifest"),
    renderConfigPath: required("render-config"),
    outDir: required("out"),
    order,
    runId: values.get("run-id") ?? `${backend}-${order}`,
    externalHostEvidence: values.get("host-evidence") ?? null,
    observationIntervalMs: intervalMs,
  };
}

const runCommand = (file: string, args: string[]): Promise<CommandResult> =>
  new Promise((resolve) =>
    execFile(file, args, { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) =>
      resolve({ ok: !error, stdout: stdout ?? "", error: error ? error.message : null }),
    ),
  );

const fetchResource = async (url: string) => {
  const response = await fetch(url);
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
};

/**
 * Drives the unchanged `battle-benchmark-complete` scene through the shared
 * `runSelected` runner. The wrapper adds only an isolated-context init script,
 * one startup observation and one terminal observation: no extra per-frame
 * scan, no screenshot, no second recording of the Menu's own measurements.
 */
async function runBenchmark(request: BenchmarkRequest): Promise<BenchmarkOutcome> {
  // The scene runner reads its target and report path when its module first
  // loads, so the environment must be complete before the import below. One
  // trial per process follows from that.
  process.env.VERIFY_URL = request.url;
  process.env.SCENARIO_REPORT_JSON = request.scenarioReportPath;
  process.env.SCENARIO_REPORT_GENERATED_AT = request.generatedAt;
  process.env.VERIFY_GPU ??= "1";
  process.env.VERIFY_GPU_ADAPTER ??= "hardware";
  process.env.VERIFY_BROWSER_CHANNEL ??= "chrome";

  const exportPath = fileURLToPath(MENU_EXPORT);
  const previousExport = await stat(exportPath).then(
    (info) => info.mtimeMs,
    () => 0,
  );
  const { runSelected } = await import(SCENE_RUNNER.href);
  const scene = await import(BENCHMARK_SCENE.href);

  let startupStats: unknown = null;
  let terminalStats: unknown = null;
  let browserVersion: string | null = null;
  let sceneError: string | null = null;
  const observe = () => {
    const game = (window as unknown as { __game: any }).__game;
    return {
      benchmark: game.benchmark.status(),
      renderStats: game.stats().renderStats,
      audio: game.audio(),
    };
  };

  const wrapped = {
    ...scene,
    file: "battle/battle-benchmark-complete.mjs",
    async run(ctx: any) {
      let page: any = null;
      let startup: Promise<unknown> = Promise.resolve({ error: "the scene never opened a page" });
      browserVersion = typeof ctx.browser?.version === "function" ? ctx.browser.version() : null;
      await scene.run({
        ...ctx,
        newPage: async (options: unknown) => {
          page = await ctx.newPage(options);
          // Evaluated in the fresh context before any app module runs, so the
          // real settings owner reads an unmuted value at first construction.
          await page.addInitScript(
            ([key, value]: [string, string]) => {
              try {
                window.localStorage.setItem(key, value);
              } catch {}
            },
            [GRAPHICS_SETTINGS_STORAGE_KEY, JSON.stringify(TRIAL_GRAPHICS_OVERRIDE)],
          );
          startup = (async () => {
            await page.waitForURL("**/benchmark", { timeout: 120000 });
            await page.waitForFunction(
              () => (window as unknown as { __ready: boolean }).__ready === true,
              undefined,
              { timeout: 120000 },
            );
            return page.evaluate(observe);
          })();
          void startup.catch(() => {});
          return page;
        },
      });
      startupStats = await startup.catch((error: unknown) => ({ error: String(error) }));
      terminalStats = page
        ? await page.evaluate(observe).catch((error: unknown) => ({ error: String(error) }))
        : null;
    },
  };

  let exitCode: number | null = null;
  try {
    exitCode = await runSelected([wrapped]);
  } catch (error) {
    sceneError = error instanceof Error ? (error.stack ?? error.message) : String(error);
  }

  const scenarioReport = await readFile(request.scenarioReportPath, "utf8").then(
    (text) => JSON.parse(text),
    () => null,
  );
  const exportInfo = await stat(exportPath).then(
    (info) => info,
    () => null,
  );
  const exportStale = !exportInfo || exportInfo.mtimeMs <= previousExport;
  const exportBytes = exportInfo && !exportStale ? await readFile(exportPath) : null;

  return {
    exitCode,
    failures: scenarioReport?.failures ?? [],
    pageErrors: scenarioReport?.pageErrors ?? [],
    checkCount: scenarioReport?.checks?.length ?? 0,
    exportBytes,
    exportStale,
    startupStats,
    terminalStats,
    browserVersion,
    error: sceneError ?? (scenarioReport ? null : "the scene runner wrote no scenario report"),
  };
}

async function main(argv: string[]): Promise<number> {
  const options = parseTrialArgs(argv);
  const trial = await runTrial(options, {
    fetchResource,
    runCommand,
    runBenchmark,
    now: () => new Date(),
    ownPid: process.pid,
    loadAverage: loadavg,
  });
  console.log(
    `${trial.runId}: ${trial.status}; functional=${trial.functional.eligible} ` +
      `quiet-rankable=${trial.ranking.eligible}; archived in ${options.outDir}`,
  );
  for (const issue of [...trial.functional.issues, ...trial.ranking.issues])
    console.log(`  ${issue}`);
  return trial.functional.eligible ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
}
