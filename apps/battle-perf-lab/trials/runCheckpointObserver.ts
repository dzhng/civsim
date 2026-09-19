/**
 * Runs one held fixed build under the checkpoint observer and archives what it
 * saw. This is a correctness control, not a trial: it starts no clock of its own,
 * collects no host evidence and produces no ranking, because wrapping the page's
 * frame scheduling already disqualifies the run as timing evidence.
 *
 * Everything else is the timing runner's: the same provenance sweep, the same
 * `battle-benchmark-complete` scene through the same shared browser seam.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CHECKPOINT_SECONDS,
  CHECKPOINT_TOLERANCE_MS,
  checkpointObserverConfig,
  installCheckpointObserver,
  type CheckpointObservation,
} from "./checkpointObserver.ts";
import type { CheckpointArchive, ReportFrame } from "./compareCheckpoints.ts";
import { archive, encode, inspectMenuReport } from "./trial.ts";
import { fetchResource, runBenchmark } from "./runTrial.ts";
import { TRIAL_BACKENDS, verifyProvenance, type TrialBackend } from "./provenance.ts";

const HELP = `Usage: node apps/battle-perf-lab/trials/runCheckpointObserver.ts \\
  --backend three|raw|typegpu|vgpu \\
  --url http://127.0.0.1:5261/ \\
  --build-manifest <fixed-menu-builds/manifest.json> \\
  --render-config <declaration>.json \\
  --out <empty directory> \\
  [--run-id <id>] [--checkpoint-seconds ${CHECKPOINT_SECONDS.join(",")}] \\
  [--tolerance-ms ${CHECKPOINT_TOLERANCE_MS}]`;

export function parseCheckpointArgs(argv: string[]) {
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
  const seconds = (values.get("checkpoint-seconds") ?? CHECKPOINT_SECONDS.join(","))
    .split(",")
    .map((part) => Number(part.trim()));
  if (!seconds.length || seconds.some((value) => !Number.isFinite(value) || value < 0))
    throw Error(`--checkpoint-seconds must be whole seconds\n${HELP}`);
  const toleranceMs = Number(values.get("tolerance-ms") ?? CHECKPOINT_TOLERANCE_MS);
  if (!Number.isFinite(toleranceMs) || toleranceMs <= 0)
    throw Error(`--tolerance-ms must be positive\n${HELP}`);
  return {
    backend,
    url: required("url"),
    manifestPath: required("build-manifest"),
    renderConfigPath: required("render-config"),
    outDir: required("out"),
    runId: values.get("run-id") ?? `${backend}-checkpoints`,
    config: checkpointObserverConfig(seconds, toleranceMs),
  };
}

/** Only the sampled frames' rows, so the archive stays a handful of kilobytes. */
export function reportFramesFor(
  menuExport: any,
  frameIds: number[],
): Record<string, ReportFrame> | null {
  if (!Array.isArray(menuExport?.frames)) return null;
  const wanted = new Set(frameIds);
  const rows: Record<string, ReportFrame> = {};
  for (const frame of menuExport.frames)
    if (wanted.has(frame.frameId))
      rows[String(frame.frameId)] = {
        elapsedMs: frame.elapsedMs,
        phase: frame.phase,
        camera: frame.camera,
        intendedCamera: frame.intendedCamera,
      };
  return rows;
}

/**
 * The held scope the export carries, from `createBenchmarkReport`. A live build
 * writes none, and comparing backends on a simulation that kept advancing would
 * compare different scenes, so its absence is a refusal rather than a default.
 */
export interface HeldScope {
  simulation?: string;
  tick?: number;
  initialStateHash?: string | null;
  finalStateHash?: string | null;
}

/** The page's own word for it. Anything else is the failure it is, never an observation. */
export function asObservation(collected: unknown): CheckpointObservation | null {
  return (collected as CheckpointObservation | null)?.kind ===
    "battle-benchmark-checkpoint-observation"
    ? (collected as CheckpointObservation)
    : null;
}

/** A missing sample or a coherence fault fails the run; an empty pass does not exist. */
export function judgeCheckpoints(
  observation: CheckpointObservation | null,
  context: {
    provenanceOk: boolean;
    exitCode: number | null;
    sceneError: string | null;
    heldScope: HeldScope | null;
    /** Whatever the page handed back, so a failed read says what it was. */
    collected?: unknown;
  },
): string[] {
  const issues: string[] = [];
  if (!context.provenanceOk) issues.push("the served build did not match its manifest");
  if (context.sceneError) issues.push(`the scene runner threw: ${context.sceneError}`);
  if (context.exitCode !== 0) issues.push(`the scene exited ${context.exitCode}`);
  const held = context.heldScope;
  if (!held || held.simulation !== "held" || typeof held.tick !== "number")
    issues.push("the export carries no held scope; only a held build may be observed");
  if (!observation)
    return [
      ...issues,
      context.collected == null
        ? "the observer left no state in the page"
        : `the observer state could not be read: ${JSON.stringify(context.collected)}`,
    ];
  for (const error of observation.errors) issues.push(error);
  if (!observation.boundaries) issues.push("no completed frame boundary was ever observed");
  observation.samples.forEach((sample, index) => {
    if (!sample) {
      const nearest = observation.nearestOffsetMs[index];
      issues.push(
        `no completed frame within ${observation.config.toleranceMs}ms of ` +
          `${observation.config.checkpointsMs[index]}ms` +
          (nearest === null ? " (no frame ever seen)" : ` (nearest was ${nearest}ms away)`),
      );
      return;
    }
    if (!held || held.simulation !== "held") return;
    // The authority never moves in a held run, so a sample that saw it move is
    // not a sample of the scene the other backends drew.
    const simTick = (sample.frame as { simTick?: number }).simTick;
    if (simTick !== held.tick)
      issues.push(`checkpoint ${sample.checkpointMs}ms sampled tick ${simTick}, not ${held.tick}`);
    if (held.initialStateHash && sample.stateHash !== held.initialStateHash)
      issues.push(
        `checkpoint ${sample.checkpointMs}ms sampled hash ${sample.stateHash}, not ${held.initialStateHash}`,
      );
  });
  return issues;
}

async function main(argv: string[]): Promise<number> {
  const options = parseCheckpointArgs(argv);
  await mkdir(dirname(options.outDir), { recursive: true });
  await mkdir(options.outDir);

  let provenanceOk = false;
  let provenanceIssues: string[] = [];
  let declaredGraphics: Record<string, unknown> | null = null;
  let build = {
    manifestPath: options.manifestPath,
    commit: null,
    buildSha256: null,
  } as CheckpointArchive["build"];
  try {
    const provenance = await verifyProvenance(
      {
        backend: options.backend,
        manifestPath: options.manifestPath,
        url: options.url,
        renderConfigPath: options.renderConfigPath,
      },
      fetchResource,
    );
    provenanceOk = provenance.ok;
    provenanceIssues = provenance.issues;
    declaredGraphics = provenance.renderConfig?.graphics ?? null;
    build = {
      manifestPath: options.manifestPath,
      commit: provenance.commit,
      buildSha256: provenance.buildSha256,
    };
  } catch (error) {
    provenanceIssues = [error instanceof Error ? error.message : String(error)];
  }

  const run = provenanceOk
    ? await runBenchmark(
        {
          url: options.url,
          scenarioReportPath: join(options.outDir, "scenario-report.json"),
          generatedAt: new Date().toISOString(),
        },
        {
          initScript: { fn: installCheckpointObserver as never, argument: options.config },
          collect: (page) =>
            page.evaluate(
              () => (window as unknown as { __checkpointObserver?: unknown }).__checkpointObserver,
            ),
        },
      )
    : null;

  const observation = asObservation(run?.collected);
  const menuExport =
    run?.exportBytes && !run.exportStale
      ? JSON.parse(new TextDecoder().decode(run.exportBytes))
      : null;
  const sampledFrameIds = (observation?.samples ?? [])
    .filter((sample): sample is NonNullable<typeof sample> => sample !== null)
    .map((sample) => sample.frameId);

  const heldScope: HeldScope | null = menuExport?.scope ?? null;
  // The declaration is a claim about how this build renders, and crowd counts move
  // with it, so the same check a timing trial makes applies here too.
  const inspection = menuExport
    ? inspectMenuReport(menuExport, options.backend, declaredGraphics)
    : { issues: provenanceOk ? ["this run wrote no Menu export"] : [] };
  const issues = [
    ...provenanceIssues,
    ...inspection.issues,
    ...(provenanceOk
      ? judgeCheckpoints(observation, {
          provenanceOk,
          exitCode: run?.exitCode ?? null,
          sceneError: run?.error ?? null,
          heldScope,
          collected: run?.collected ?? null,
        })
      : ["the benchmark was not started"]),
  ];
  const record: CheckpointArchive = {
    kind: "battle-benchmark-checkpoint-run",
    version: 1,
    runId: options.runId,
    backend: options.backend,
    url: options.url,
    heldTick: typeof heldScope?.tick === "number" ? heldScope.tick : null,
    build,
    provenanceOk,
    exitCode: run?.exitCode ?? null,
    observation,
    reportFrames: reportFramesFor(menuExport, sampledFrameIds),
    issues,
    ok: issues.length === 0,
  };
  if (run?.exportBytes && !run.exportStale)
    await archive(options.outDir, "menu-export.json", run.exportBytes);
  await archive(options.outDir, "checkpoints.json", encode(record));

  console.log(
    `${record.runId}: ${record.ok ? "coherent" : "failed"} — ` +
      `${record.observation?.boundaries ?? 0} frame boundaries, ` +
      `${record.observation?.samples.filter(Boolean).length ?? 0}/${options.config.checkpointsMs.length} checkpoints; ` +
      `correctness only, never timing evidence; archived in ${options.outDir}`,
  );
  for (const issue of record.issues) console.log(`  ${issue}`);
  return record.ok ? 0 : 1;
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
