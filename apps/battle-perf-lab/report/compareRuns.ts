import { ACTION_TICK_SECONDS } from "../../../packages/crowd-runtime/src/actionTimeline";
import { isDeepStrictEqual } from "node:util";
import {
  sampleBenchmarkCamera,
  BENCHMARK_CAMERA_PHASES,
  BENCHMARK_CAMERA_TOUR_VERSION,
} from "../../../web/src/battle/benchmark/benchmarkCamera";
import { summarizeFrameIntervals } from "../../../web/src/battle/benchmark/benchmarkMetrics";

/** Collected by the experiment runner; null means uncollected, never inferred. */
export interface RunManifest {
  runId: string;
  backend: "three" | "raw" | "typegpu" | "vgpu";
  commit: string;
  dirtyDiffSha256: string | null;
  buildSha256: string;
  /** Backend-independent render configuration, excluding the separately recorded shadows setting. */
  configSha256: string;
  dependenciesSha256: string;
  assetsSha256: string;
  wasmSha256: string;
  startedAt: string;
  order: number;
  hardware: {
    machine: string | null;
    os: string | null;
    browser: string | null;
    adapter: string | null;
    power: string | null;
    display: string | null;
  };
  quietHost: { verified: boolean; evidence: string | null };
  validation: { passed: boolean; evidence: string | null };
}
export interface RunInput {
  manifest: RunManifest;
  report: unknown;
}
type ObjectValue = Record<string, unknown>;
function object(value: unknown, name: string): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${name}: expected object`);
  return value as ObjectValue;
}
function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw Error(`${name}: expected finite number`);
  return value;
}
function list(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw Error(`${name}: expected array`);
  return value;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Duration distributions include zero work and never manufacture missing samples. */
function durations(values: unknown[]) {
  const sorted = values
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  const percentile = (p: number) =>
    sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null;
  return {
    count: sorted.length,
    missingOrInvalidCount: values.length - sorted.length,
    meanMs: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: sorted.at(-1) ?? null,
  };
}

const CPU_FIELDS = ["simCpuMs", "renderCpuMs", "renderAwaitMs", "renderWallMs", "loopCpuMs"];
const GPU_PASS_FIELDS = ["renderMs", "computeMs", "measuredPassGpuMs"];
const GPU_RANGE_FIELDS = ["observedGpuSpanMs", "observedGpuUnionMs"] as const;
type ObservedRange = Record<(typeof GPU_RANGE_FIELDS)[number], number>;

/** Whole-run and per-phase CPU distributions share one owner and one field set. */
function cpuDistributions(samples: readonly ObjectValue[]) {
  return Object.fromEntries(
    CPU_FIELDS.map((key) => [key, durations(samples.map((s) => s[key]))] as const),
  );
}

/** Observed ranges are only meaningful as a pair, so a partial, negative or
 * union-exceeds-span record stays missing instead of half-counted. Historic
 * recordings without ranges report null and remain unavailable, never zero. */
function observedRange(result: ObjectValue): ObservedRange | null {
  const { observedGpuSpanMs: span, observedGpuUnionMs: union } = result;
  const measured = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (!measured(span) || !measured(union) || union > span + 1e-6) return null;
  return { observedGpuSpanMs: span, observedGpuUnionMs: union };
}

/** Pass sums double-count overlapping intervals and stay diagnostic; span and
 * union come from the recorded whole-presentation ranges and are never rebuilt
 * from stage values. Only complete submission-matched results are included. */
function gpuDistributions(completeResults: readonly ObjectValue[]) {
  return Object.fromEntries([
    ...GPU_PASS_FIELDS.map((key) => [key, durations(completeResults.map((r) => r[key]))] as const),
    ...GPU_RANGE_FIELDS.map(
      (key) =>
        [key, durations(completeResults.map((r) => observedRange(r)?.[key] ?? null))] as const,
    ),
  ]);
}

function inspect(input: RunInput) {
  const issues: string[] = [];
  const m = object(input.manifest, "manifest");
  for (const key of [
    "runId",
    "commit",
    "buildSha256",
    "configSha256",
    "dependenciesSha256",
    "assetsSha256",
    "wasmSha256",
    "startedAt",
  ])
    if (!text(m[key])) issues.push(`manifest.${key} missing`);
  for (const key of [
    "buildSha256",
    "configSha256",
    "dependenciesSha256",
    "assetsSha256",
    "wasmSha256",
  ])
    if (typeof m[key] !== "string" || !/^[a-f0-9]{64}$/i.test(m[key]))
      issues.push(`manifest.${key} is not SHA-256`);
  if (typeof m.commit !== "string" || !/^[a-f0-9]{40}$/i.test(m.commit))
    issues.push("manifest.commit is not a full commit");
  if (
    m.dirtyDiffSha256 !== null &&
    (typeof m.dirtyDiffSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(m.dirtyDiffSha256))
  )
    issues.push("manifest.dirtyDiffSha256 missing or invalid");
  if (!Number.isInteger(m.order) || Number(m.order) < 0) issues.push("manifest.order invalid");
  if (!text(m.startedAt) || !Number.isFinite(Date.parse(m.startedAt)))
    issues.push("manifest.startedAt invalid");
  if (!["three", "raw", "typegpu", "vgpu"].includes(String(m.backend)))
    issues.push("manifest.backend invalid");
  const hardware = object(m.hardware, "manifest.hardware");
  for (const key of ["machine", "os", "browser", "adapter", "power", "display"])
    if (!text(hardware[key])) issues.push(`manifest.hardware.${key} uncollected`);
  for (const key of ["quietHost", "validation"]) {
    const value = object(m[key], `manifest.${key}`);
    if (value[key === "quietHost" ? "verified" : "passed"] !== true || !text(value.evidence))
      issues.push(`manifest.${key} not verified`);
  }
  const r = object(input.report, "report");
  const status = object(r.status, "status");
  const scenario = object(status.scenario, "scenario");
  const identity = object(r.identity, "identity");
  for (const key of ["userAgent", "adapter", "initialStateHash"])
    if (!text(identity[key])) issues.push(`identity.${key} missing`);
  for (const key of ["viewport", "framebuffer"]) {
    const size = identity[key];
    if (
      !Array.isArray(size) ||
      size.length !== 2 ||
      size.some((v) => !Number.isFinite(v) || v <= 0)
    )
      issues.push(`identity.${key} invalid`);
  }
  for (const key of ["dpr", "soldiers"])
    if (typeof identity[key] !== "number" || !Number.isFinite(identity[key]) || identity[key] <= 0)
      issues.push(`identity.${key} invalid`);
  const graphics = object(identity.graphics, "identity.graphics");
  if (!["off", "single", "csm"].includes(String(graphics.shadows)))
    issues.push("identity.graphics.shadows invalid");
  if (!["low", "standard", "fine"].includes(String(graphics.grassQuality)))
    issues.push("identity.graphics.grassQuality invalid");
  for (const key of ["grass", "farGrass", "bloom"])
    if (typeof graphics[key] !== "boolean") issues.push(`identity.graphics.${key} missing`);
  const audio = object(graphics.audio, "identity.graphics.audio");
  for (const key of ["muted", "birds", "water"])
    if (typeof audio[key] !== "boolean") issues.push(`identity.graphics.audio.${key} missing`);
  if (
    typeof audio.masterVolume !== "number" ||
    !Number.isFinite(audio.masterVolume) ||
    audio.masterVolume < 0 ||
    audio.masterVolume > 1
  )
    issues.push("identity.graphics.audio.masterVolume invalid");
  if (scenario.cameraScript !== BENCHMARK_CAMERA_TOUR_VERSION)
    issues.push("unsupported camera script");
  for (const key of ["id", "mapSeed", "armySource", "orders"])
    if (!text(scenario[key])) issues.push(`scenario.${key} missing`);
  for (const key of ["version", "simSeed", "startTick"])
    if (typeof scenario[key] !== "number" || !Number.isSafeInteger(scenario[key]))
      issues.push(`scenario.${key} invalid`);
  if (r.kind !== "battle-benchmark" || r.version !== 2)
    issues.push("unsupported report kind/version");
  const duration = number(status.elapsedMs, "elapsedMs");
  const requested = number(scenario.durationMs, "durationMs");
  if (
    r.completeWindow !== true ||
    status.phase !== "complete" ||
    requested !== 300000 ||
    duration < requested
  )
    issues.push("incomplete five-minute window");
  const frames = list(r.frames, "frames").map((value) => object(value, "frame"));
  const intervals = frames.map((f) => number(f.intervalMs, "intervalMs"));
  const summary = summarizeFrameIntervals(intervals);
  if (!isDeepStrictEqual(summary, r.summary))
    issues.push("exported summary disagrees with raw intervals");
  if (!summary.validCount || summary.invalidCount)
    issues.push("missing or invalid frame intervals");
  if (Math.abs(summary.durationMs - duration) > 0.01)
    issues.push("interval total disagrees with run clock");
  const firstFrame = object(r.firstFrame, "firstFrame");
  const firstRenderer = object(firstFrame.renderer, "firstFrame.renderer");
  let previousTime = 0,
    previousId = number(firstRenderer.renderedFrameId, "firstFrame.renderedFrameId");
  /** Recorded submissions and the phase that owns each of them; keying by id keeps
   * every submission counted once, whichever recording boundary produced it. */
  const submissions = new Map<number, { value: ObjectValue; phase: string }>();
  /** The camera script owns which phase a timestamp belongs to; an exported label
   * that disagrees is reported as an issue and never used for attribution. */
  const framePhases = frames.map(
    (f) => sampleBenchmarkCamera(number(f.elapsedMs, "frame.elapsedMs")).phase as string,
  );
  const retainSubmission = (renderer: ObjectValue, phase: string) => {
    if (!renderer.gpuSubmission) return;
    const value = object(renderer.gpuSubmission, "gpuSubmission");
    const id = number(value.submissionId, "submissionId");
    if (!Number.isSafeInteger(id) || id < 0 || submissions.has(id))
      issues.push("invalid or duplicate recorded submission");
    submissions.set(id, { value, phase });
  };
  /** The untimed boundary frame precedes the first interval at elapsed zero, so the
   * camera owner assigns it the opening phase rather than a phase of its own. */
  retainSubmission(firstRenderer, sampleBenchmarkCamera(0).phase);
  for (const [index, f] of frames.entries()) {
    const at = number(f.elapsedMs, "frame.elapsedMs");
    const renderer = object(f.renderer, "frame.renderer");
    const id = number(renderer.renderedFrameId, "renderedFrameId");
    if (previousTime >= requested) issues.push("samples retained after terminal window boundary");
    if (f.phase !== framePhases[index]) issues.push("phase label disagrees with frame timestamp");
    if (
      at <= previousTime ||
      Math.abs(at - previousTime - Number(f.intervalMs)) > 0.01 ||
      !Number.isSafeInteger(id) ||
      id !== previousId + 1
    )
      issues.push("nonmonotonic or inconsistent presentation history");
    retainSubmission(renderer, framePhases[index]);
    previousTime = at;
    previousId = id;
    if (renderer.gpuSubmission) {
      const submission = object(renderer.gpuSubmission, "gpuSubmission");
      if (
        m.backend === "three" ? submission.backend !== undefined : submission.backend !== m.backend
      )
        issues.push("submission backend disagrees with manifest");
    }
  }
  const phases = list(r.phases, "phases").map((value) => {
    const phase = object(value, "phase");
    const phaseSummary = summarizeFrameIntervals(
      frames.filter((f) => f.phase === phase.name).map((f) => Number(f.intervalMs)),
    );
    if (!isDeepStrictEqual(phase.summary, phaseSummary) || !phaseSummary.validCount)
      issues.push(`invalid or missing phase ${String(phase.name)}`);
    return { name: phase.name, startMs: phase.startMs, endMs: phase.endMs, summary: phaseSummary };
  });
  if (
    !isDeepStrictEqual(
      phases.map(({ summary, ...p }) => p),
      [...BENCHMARK_CAMERA_PHASES],
    )
  )
    issues.push("phase definitions disagree with camera script");
  if (
    !phases.length ||
    new Set(phases.map((p) => p.name)).size !== phases.length ||
    frames.some((f) => !phases.some((p) => p.name === f.phase))
  )
    issues.push("invalid phase coverage");
  const startTick = number(status.startTick, "startTick"),
    endTick = number(status.tick, "tick");
  const simulatedSeconds = number(r.simulatedSeconds, "simulatedSeconds");
  if (startTick !== scenario.startTick || endTick <= startTick || simulatedSeconds <= 0)
    issues.push("simulation did not advance from declared contact tick");
  if (Math.abs(simulatedSeconds - (endTick - startTick) * ACTION_TICK_SECONDS) > 1e-9)
    issues.push("simulated seconds disagree with tick progression");
  const cpu = cpuDistributions(frames);
  const gpu = r.gpu === null ? null : object(r.gpu, "gpu");
  const results = gpu ? list(gpu.results, "gpu.results").map((v) => object(v, "gpu result")) : [];
  if (gpu) {
    for (const key of [
      "trackedSubmissions",
      "pendingOrMissingCount",
      "cursorGapCount",
      "lostEventCount",
    ])
      if (!Number.isSafeInteger(gpu[key]) || Number(gpu[key]) < 0)
        issues.push(`invalid GPU counter ${key}`);
    const seen = new Set<number>();
    for (const result of results) {
      const id = number(result.submissionId, "GPU result submissionId");
      const recorded = submissions.get(id)?.value;
      if (
        !recorded ||
        seen.has(id) ||
        result.source !== recorded.source ||
        result.backend !== recorded.backend ||
        result.threeFrameId !== recorded.threeFrameId
      )
        issues.push("unmatched or duplicate GPU result identity");
      seen.add(id);
      if (!["complete", "incomplete"].includes(String(result.status)))
        issues.push("invalid GPU result status");
      const stages = list(result.stages, "GPU result stages").map((v) => object(v, "GPU stage"));
      if (result.status === "complete") {
        const span = result.observedGpuSpanMs,
          union = result.observedGpuUnionMs;
        if (span != null || union != null) {
          if (
            typeof span !== "number" ||
            typeof union !== "number" ||
            !Number.isFinite(span) ||
            !Number.isFinite(union) ||
            union < 0 ||
            span < 0 ||
            union > span + 1e-6 ||
            union > Number(result.measuredPassGpuMs) + 1e-6
          )
            issues.push("invalid observed GPU range metrics");
        }
        if (!stages.length || result.missingQueries !== 0)
          issues.push("invalid complete GPU result");
        for (const value of [
          result.renderMs,
          result.computeMs,
          result.measuredPassGpuMs,
          ...stages.map((v) => v.ms),
        ])
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
            issues.push("invalid complete GPU duration");
      }
    }
    const unresolved = list(gpu.unresolvedSubmissionIds, "unresolvedSubmissionIds");
    const expected = [...submissions.keys()].filter((id) => !seen.has(id)).sort((a, b) => a - b);
    if (
      gpu.trackedSubmissions !== submissions.size ||
      gpu.pendingOrMissingCount !== expected.length ||
      !isDeepStrictEqual(
        [...unresolved].sort((a, b) => Number(a) - Number(b)),
        expected,
      )
    )
      issues.push("GPU coverage counters disagree with recorded submissions");
  }
  const completeResults = results.filter((r) => r.status === "complete");
  const stageNames = [
    ...new Set(
      completeResults.flatMap((r) =>
        list(r.stages, "gpu stages").map((s) => String(object(s, "gpu stage").label)),
      ),
    ),
  ];
  const stages = Object.fromEntries(
    stageNames.map((name) => [
      name,
      durations(
        completeResults.map((r) => {
          const matching = list(r.stages, "gpu stages")
            .map((s) => object(s, "gpu stage"))
            .filter((s) => s.label === name);
          return matching.length === 1 ? matching[0].ms : null;
        }),
      ),
    ]),
  );
  const resultsById = new Map<number, ObjectValue>();
  for (const result of results) {
    const id = number(result.submissionId, "GPU result submissionId");
    // A duplicated identity is already an issue; the first record still counts once.
    if (!resultsById.has(id)) resultsById.set(id, result);
  }
  /** Per-phase GPU covers exactly the submissions recorded inside that phase.
   * Unresolved submissions stay counted rather than being read as zero work, and
   * a result whose identity matched no recorded submission belongs to no phase. */
  const phaseGpu = (name: string) => {
    const matched = [...submissions]
      .filter(([, recorded]) => recorded.phase === name)
      .map(([id]) => resultsById.get(id) ?? null);
    const complete = matched.filter((r): r is ObjectValue => r?.status === "complete");
    return {
      matchedSubmissions: matched.length,
      completeResults: complete.length,
      incompleteResults: matched.filter((r) => r !== null && r.status !== "complete").length,
      unresolvedSubmissions: matched.filter((r) => r === null).length,
      observedRangeResults: complete.filter((r) => observedRange(r) !== null).length,
      missingRangeResults: complete.filter((r) => observedRange(r) === null).length,
      durations: gpuDistributions(complete),
    };
  };
  const phaseReports = phases.map((phase) => {
    const name = String(phase.name);
    return {
      ...phase,
      cpu: cpuDistributions(frames.filter((f, index) => framePhases[index] === name)),
      gpu: phaseGpu(name),
    };
  });
  return {
    issues: [...new Set(issues)],
    manifest: input.manifest,
    identity,
    scenario,
    phases: phaseReports,
    summary,
    cpu,
    simulation: {
      startTick,
      endTick,
      simulatedSeconds,
      wallSeconds: duration / 1000,
      simulatedSecondsPerWallSecond: simulatedSeconds / (duration / 1000),
    },
    gpu: {
      snapshotPresent: gpu !== null,
      observedRangeResults: completeResults.filter((r) => observedRange(r) !== null).length,
      available: completeResults.some(
        (r) => typeof r.measuredPassGpuMs === "number" && Number.isFinite(r.measuredPassGpuMs),
      ),
      durations: gpuDistributions(completeResults),
      stages,
      trackedSubmissions: gpu?.trackedSubmissions ?? null,
      pendingOrMissingCount: gpu?.pendingOrMissingCount ?? null,
      cursorGapCount: gpu?.cursorGapCount ?? null,
      lostEventCount: gpu?.lostEventCount ?? null,
      completeResults: completeResults.length,
      incompleteResults: results.filter((r) => r.status !== "complete").length,
      coverage: gpu?.coverage ?? null,
      exclusions: gpu?.exclusions ?? null,
    },
  };
}

/** Eligibility is measurement validity, not visual acceptance or a backend winner. */
export function compareRuns(
  left: RunInput,
  right: RunInput,
  mode: "parity" | "shadow-cost" = "parity",
) {
  const a = inspect(left),
    b = inspect(right);
  const issues = [
    ...a.issues.map((s) => `${a.manifest.runId}: ${s}`),
    ...b.issues.map((s) => `${b.manifest.runId}: ${s}`),
  ];
  const match = (name: string, x: unknown, y: unknown) => {
    if (!isDeepStrictEqual(x, y)) issues.push(`pair mismatch: ${name}`);
  };
  if (a.manifest.runId === b.manifest.runId || a.manifest.order === b.manifest.order)
    issues.push("pair requires distinct run IDs and orders");
  match("scenario", a.scenario, b.scenario);
  const definitions = (run: typeof a) =>
    run.phases.map(({ name, startMs, endMs }) => ({ name, startMs, endMs }));
  match("camera phases", definitions(a), definitions(b));
  match("hardware", a.manifest.hardware, b.manifest.hardware);
  for (const key of ["assetsSha256", "wasmSha256", "configSha256"] as const)
    match(key, a.manifest[key], b.manifest[key]);
  const { graphics: ga, ...ia } = a.identity,
    { graphics: gb, ...ib } = b.identity;
  match("workload identity", ia, ib);
  if (mode === "shadow-cost") {
    match("backend", a.manifest.backend, b.manifest.backend);
    match("commit", a.manifest.commit, b.manifest.commit);
    match("dirty diff", a.manifest.dirtyDiffSha256, b.manifest.dirtyDiffSha256);
    match("build", a.manifest.buildSha256, b.manifest.buildSha256);
    match("dependencies", a.manifest.dependenciesSha256, b.manifest.dependenciesSha256);
    const { shadows: sa, ...restA } = object(ga, "graphics"),
      { shadows: sb, ...restB } = object(gb, "graphics");
    match("non-shadow graphics", restA, restB);
    if (sa === sb || (sa !== "off" && sb !== "off"))
      issues.push("shadow pair requires one off and one enabled setting");
  } else match("graphics", ga, gb);
  return {
    kind: "battle-benchmark-pair",
    version: 1,
    mode,
    eligible: issues.length === 0,
    issues,
    runs: [a, b],
    limitations: [
      "One pair is not a repeated-run performance conclusion or a backend selection.",
      "Live simulations may advance different numbers of ticks; this is end-to-end cadence, not identical per-frame work.",
      "GPU pass sums can double-count overlapping execution intervals and are diagnostic only, not elapsed GPU time or exclusive work.",
      "Observed GPU span includes gaps; interval union merges overlaps. Neither is physical GPU busy time or presentation latency. Missing ranges remain unavailable.",
      "Per-phase GPU covers only the submissions recorded during that phase; phase spans and unions describe those presentations and cannot be added into a run total.",
      "Manifest declarations require external evidence; this offline report cannot establish host isolation or visual parity.",
    ],
  };
}
