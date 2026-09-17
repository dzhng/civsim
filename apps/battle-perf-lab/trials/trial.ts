import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { RunManifest } from "../report/compareRuns.ts";
import {
  collectHardware,
  observeHost,
  summarizeQuietHost,
  QUIET_HOST_POLICY,
  type HostObservation,
  type QuietHostVerdict,
  type RunCommand,
} from "./host.ts";
import { sha256Bytes } from "./digest.ts";
import {
  verifyProvenance,
  type FetchResource,
  type ProvenanceReport,
  type TrialBackend,
} from "./provenance.ts";

export interface TrialOptions {
  runId: string;
  backend: TrialBackend;
  url: string;
  manifestPath: string;
  renderConfigPath: string;
  outDir: string;
  order: number;
  /** Recorded alongside the runner's own series; it never flips `verified`. */
  externalHostEvidence: string | null;
  observationIntervalMs: number;
}

export interface BenchmarkRequest {
  url: string;
  scenarioReportPath: string;
  generatedAt: string;
}

/**
 * What the browser seam returns. It reports observations only; whether the
 * trial is eligible is decided here, so there is one verdict owner.
 */
export interface BenchmarkOutcome {
  /** Null when the scene runner never returned one. */
  exitCode: number | null;
  /** `kind` of the report the scene runner wrote; null when it wrote none. */
  reportKind: string | null;
  failures: string[];
  pageErrors: string[];
  checkCount: number;
  /** Verbatim bytes of the Menu export the unchanged scene wrote for this run. */
  exportBytes: Uint8Array | null;
  /** True when the export at the scene's path was not written by this trial. */
  exportStale: boolean;
  startupStats: unknown;
  terminalStats: unknown;
  browserVersion: string | null;
  error: string | null;
}

export interface TrialSeams {
  fetchResource: FetchResource;
  runCommand: RunCommand;
  runBenchmark: (request: BenchmarkRequest) => Promise<BenchmarkOutcome>;
  now: () => Date;
  ownPid: number;
  loadAverage: () => number[];
}

export interface TrialRecord {
  kind: "battle-benchmark-trial";
  version: 1;
  runId: string;
  backend: TrialBackend;
  order: number;
  startedAt: string;
  completedAt: string;
  status: "complete" | "rejected" | "failed";
  /** What the Menu recording measured; null when there is no readable export. */
  measurement: TrialMeasurement | null;
  /** Did this trial actually produce a valid Menu recording of the fixed build? */
  functional: { eligible: boolean; issues: string[] };
  /** Is it additionally admissible to a quiet comparison? Never the same question. */
  ranking: { eligible: boolean; issues: string[] };
  provenance: ProvenanceReport | { issues: string[] };
  scenario: {
    exitCode: number | null;
    failures: string[];
    pageErrors: string[];
    checkCount: number;
    /** Null when no benchmark ran, so this never points at an absent file. */
    reportPath: string | null;
  };
  stats: { startup: unknown; terminal: unknown };
  /** The observation series itself lives in the evidence file, not here. */
  host: { evidencePath: string; observationCount: number; quiet: QuietHostVerdict };
  artifacts: { name: string; bytes: number; sha256: string }[];
  limitations: string[];
}

const TRIAL_LIMITATIONS = [
  "Provenance and cadence validity only: this runner makes no performance, visual or backend-selection claim.",
  "Quiet ranking is a declared host policy over a sampled process listing, not proof that nothing competed: `ps` reports platform-averaged CPU (a decaying average over up to a minute on macOS), not instantaneous contention.",
  "Window-server and kernel CPU is shared by every client of the machine; it is recorded, never charged to a competitor and never credited to this trial, and a busy one leaves isolation unknown.",
  "Shared asset trees are hashed on disk, not over HTTP; the served prefixes are only evidenced by resolving the build's own links to those trees.",
  "The render configuration is an operator declaration compared against the recording's identity; it does not read the build's compiled settings.",
  "Hardware, power and display fields are host tool output; absent fields stay null and block ranking.",
  "The browser was driven through the unchanged benchmark scene; no extra per-frame scan or screenshot was taken.",
];

const SCENARIO_REPORT_KIND = "scenario-run-report";
const EXPORT_FILE = "menu-export.json";
const RUN_FILE = "run.json";
const HOST_FILE = "host-observations.json";
const SCENARIO_FILE = "scenario-report.json";
const TRIAL_FILE = "trial.json";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export interface MenuReportInspection {
  adapter: string | null;
  measurement: TrialMeasurement;
  issues: string[];
}
/** A renderer-only recording held its simulation; it is never live evidence. */
export type TrialMeasurement = "live" | "renderer-only";

/**
 * Every declared leaf must be the value the recording observed. The declaration
 * is a claim about the build, so a mismatch is the claim being wrong, not a
 * detail to record.
 */
function compareDeclared(
  declared: unknown,
  observed: unknown,
  path: string,
  issues: string[],
): void {
  const fields = asObject(declared);
  if (!fields) {
    if (!isDeepStrictEqual(declared, observed))
      issues.push(
        `declared ${path} ${JSON.stringify(declared)} but the recording observed` +
          ` ${JSON.stringify(observed) ?? "nothing"}`,
      );
    return;
  }
  const seen = asObject(observed);
  if (!seen) {
    issues.push(`declared ${path} but the recording has no such settings`);
    return;
  }
  for (const key of Object.keys(fields))
    compareDeclared(fields[key], seen[key], `${path}.${key}`, issues);
}

/**
 * Reads back what the runner itself is responsible for: that the declared
 * backend really presented, that the one graphics field it set reached the real
 * settings owner, and that the operator's render-configuration declaration
 * describes the settings the recording actually observed. Everything else about
 * the recording is judged by the unchanged scene and the offline scorecard.
 */
export function inspectMenuReport(
  report: unknown,
  backend: TrialBackend,
  declaredGraphics: Record<string, unknown> | null = null,
): MenuReportInspection {
  const issues: string[] = [];
  const root = asObject(report);
  const measurement = root?.scope === undefined ? "live" : "renderer-only";
  const identity = asObject(root?.identity);
  if (!identity) return { adapter: null, measurement, issues: ["report has no identity"] };
  const adapter =
    typeof identity.adapter === "string" && identity.adapter.trim() ? identity.adapter : null;
  if (!adapter) issues.push("report identity has no GPU adapter");
  if (typeof identity.initialStateHash !== "string" || !identity.initialStateHash.trim())
    issues.push("report identity has no initial state hash");
  const audio = asObject(asObject(identity.graphics)?.audio);
  if (!audio) issues.push("report identity has no audio settings");
  else if (audio.muted !== false) issues.push("Menu audio stayed muted for the timed window");
  if (declaredGraphics) compareDeclared(declaredGraphics, identity.graphics, "graphics", issues);

  const frames = Array.isArray(root?.frames) ? root.frames : [];
  let submissions = 0;
  let mismatched = 0;
  for (const frame of frames) {
    const submission = asObject(asObject(asObject(frame)?.renderer)?.gpuSubmission);
    if (!submission) continue;
    submissions += 1;
    // The source build presents without a backend label at all. The paired
    // scorecard applies the same rule to its own submissions and the two must
    // agree, so change them together.
    const observed = submission.backend;
    if (backend === "three" ? observed !== undefined : observed !== backend) mismatched += 1;
  }
  if (submissions === 0) issues.push("report recorded no GPU submission identity");
  else if (mismatched)
    issues.push(`${mismatched} of ${submissions} submissions did not present as ${backend}`);
  return { adapter, measurement, issues };
}

/**
 * The evidence a run must actually produce before it counts, whatever it wrote:
 * the scene's own successful exit, its report, and checks inside it. An empty
 * failure list is not a pass — it is equally what an unwritten or foreign report
 * looks like once it has been read back.
 */
function evidenceIssues(run: BenchmarkOutcome): string[] {
  const issues: string[] = [];
  if (run.exitCode === null) issues.push("the scene runner never reported an exit code");
  else if (run.exitCode !== 0) issues.push(`the scene runner exited ${run.exitCode}`);
  if (run.reportKind === null) issues.push("the scene runner wrote no readable scenario report");
  else if (run.reportKind !== SCENARIO_REPORT_KIND)
    issues.push(`the scene runner wrote a ${run.reportKind}, not a ${SCENARIO_REPORT_KIND}`);
  else if (run.checkCount === 0) issues.push("the scenario report recorded no checks");
  return issues;
}

/** Periodic observations while the benchmark runs; stops as soon as it settles. */
async function withPeriodicObservations<T>(
  seams: TrialSeams,
  intervalMs: number,
  observations: HostObservation[],
  work: () => Promise<T>,
): Promise<T> {
  let running = true;
  let wake = () => {};
  const sleep = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, intervalMs);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  const loop = (async () => {
    while (running) {
      await sleep();
      if (!running) return;
      observations.push(await observeHost("periodic", seams));
    }
  })();
  try {
    return await work();
  } finally {
    running = false;
    wake();
    await loop;
  }
}

async function archive(
  outDir: string,
  name: string,
  bytes: Uint8Array,
): Promise<{ name: string; bytes: number; sha256: string }> {
  await writeFile(join(outDir, name), bytes, { flag: "wx" });
  return { name, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
}

const encode = (value: unknown): Uint8Array =>
  new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

/**
 * Runs one fixed-production-build Menu trial into its own directory. Rejected
 * and failed trials keep every artifact they collected; an existing directory
 * is never reused, so a prior trial cannot be overwritten.
 */
export async function runTrial(options: TrialOptions, seams: TrialSeams): Promise<TrialRecord> {
  const startedAt = seams.now().toISOString();
  await mkdir(dirname(options.outDir), { recursive: true });
  await mkdir(options.outDir);

  const observations: HostObservation[] = [];
  const hardware = await collectHardware(seams.runCommand);

  let provenance: ProvenanceReport | { issues: string[] };
  try {
    provenance = await verifyProvenance(
      {
        backend: options.backend,
        manifestPath: options.manifestPath,
        url: options.url,
        renderConfigPath: options.renderConfigPath,
      },
      seams.fetchResource,
    );
  } catch (error) {
    provenance = { issues: [error instanceof Error ? error.message : String(error)] };
  }
  const verified = "ok" in provenance ? provenance : null;
  const provenanceOk = verified?.ok === true;

  const request = {
    url: options.url,
    scenarioReportPath: join(options.outDir, SCENARIO_FILE),
    generatedAt: startedAt,
  };
  // The series covers the measured window, so it opens here rather than before
  // provenance: hashing gigabytes of assets is setup, and a slow disk must not
  // read as a stretch of the run that nobody watched.
  observations.push(await observeHost("pre", seams));
  const attempt = provenanceOk
    ? await withPeriodicObservations(seams, options.observationIntervalMs, observations, () =>
        seams.runBenchmark(request).then(
          (outcome) => ({ run: outcome as BenchmarkOutcome | null, error: null as string | null }),
          (error: unknown) => ({
            run: null,
            error: error instanceof Error ? (error.stack ?? error.message) : String(error),
          }),
        ),
      )
    : { run: null, error: "the benchmark was not started" };
  const { run, error: benchmarkError } = attempt;
  observations.push(await observeHost("post", seams));

  const artifacts: { name: string; bytes: number; sha256: string }[] = [];
  artifacts.push(
    await archive(
      options.outDir,
      HOST_FILE,
      encode({
        kind: "battle-benchmark-trial-host-observations",
        runId: options.runId,
        policy: QUIET_HOST_POLICY,
        externalEvidence: options.externalHostEvidence,
        hardware,
        observations,
      }),
    ),
  );

  let report: unknown = null;
  let exportIssue: string | null = null;
  if (run?.exportBytes) {
    artifacts.push(await archive(options.outDir, EXPORT_FILE, run.exportBytes));
    try {
      report = JSON.parse(new TextDecoder().decode(run.exportBytes));
    } catch (error) {
      exportIssue = `Menu export is not JSON: ${error instanceof Error ? error.message : error}`;
    }
  } else if (run)
    exportIssue = run.exportStale
      ? "the Menu export at the scene's path predates this trial"
      : "no Menu export was produced";
  const inspection = report
    ? inspectMenuReport(report, options.backend, verified?.renderConfig.graphics ?? null)
    : null;

  const functionalIssues = [
    ...provenance.issues,
    ...(benchmarkError ? [benchmarkError] : []),
    // A scene that did not exit clean is never accepted, however good the
    // evidence it left behind looks: the exit code is the scene's own verdict.
    ...(run ? evidenceIssues(run) : []),
    ...(run?.failures ?? []).map((failure) => `scenario check failed: ${failure}`),
    ...(run?.pageErrors ?? []).slice(0, 3).map((error) => `page error: ${error}`),
    ...(run?.error ? [run.error] : []),
    ...(exportIssue ? [exportIssue] : []),
    ...(inspection?.issues ?? []),
  ];
  const quiet = summarizeQuietHost(observations);
  const rankingIssues = [
    ...(functionalIssues.length ? ["the run is not functionally eligible"] : []),
    ...quiet.issues,
    ...hardware.unavailable.map((field) => `hardware.${field} uncollected`),
    ...(run?.browserVersion ? [] : ["hardware.browser uncollected"]),
  ];

  const manifest: RunManifest = {
    runId: options.runId,
    backend: options.backend,
    commit: verified?.commit ?? "",
    dirtyDiffSha256: verified?.dirtyDiffSha256 ?? null,
    buildSha256: verified?.buildSha256 ?? "",
    configSha256: verified?.configSha256 ?? "",
    dependenciesSha256: verified?.dependenciesSha256 ?? "",
    assetsSha256: verified?.assetsSha256 ?? "",
    wasmSha256: verified?.wasmSha256 ?? "",
    startedAt,
    order: options.order,
    hardware: {
      machine: hardware.machine,
      os: hardware.os,
      browser: run?.browserVersion ?? null,
      adapter: inspection?.adapter ?? null,
      power: hardware.power,
      display: hardware.display,
    },
    quietHost: {
      verified: quiet.verified,
      evidence: quiet.verified ? `./${HOST_FILE}` : null,
    },
    validation: {
      passed: functionalIssues.length === 0,
      evidence: functionalIssues.length === 0 ? `./${SCENARIO_FILE}` : null,
    },
  };
  if (report) artifacts.push(await archive(options.outDir, RUN_FILE, encode({ manifest, report })));

  const completedAt = seams.now().toISOString();
  const trial: TrialRecord = {
    kind: "battle-benchmark-trial",
    version: 1,
    runId: options.runId,
    backend: options.backend,
    order: options.order,
    startedAt,
    completedAt,
    status: !provenanceOk ? "rejected" : functionalIssues.length ? "failed" : "complete",
    measurement: inspection?.measurement ?? null,
    functional: { eligible: functionalIssues.length === 0, issues: functionalIssues },
    ranking: { eligible: rankingIssues.length === 0, issues: rankingIssues },
    provenance,
    scenario: {
      exitCode: run?.exitCode ?? null,
      failures: run?.failures ?? [],
      pageErrors: run?.pageErrors ?? [],
      checkCount: run?.checkCount ?? 0,
      reportPath: run ? `./${SCENARIO_FILE}` : null,
    },
    stats: { startup: run?.startupStats ?? null, terminal: run?.terminalStats ?? null },
    host: {
      evidencePath: `./${HOST_FILE}`,
      observationCount: observations.length,
      quiet,
    },
    artifacts,
    limitations: TRIAL_LIMITATIONS,
  };
  await writeFile(join(options.outDir, TRIAL_FILE), encode(trial), { flag: "wx" });
  return trial;
}
