/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_GRAPHICS_SETTINGS,
  GRAPHICS_SETTINGS_STORAGE_KEY,
} from "../../../web/src/shared/graphicsSettings.ts";
import { writeFixedBuildFixture } from "./fixedBuildFixture.ts";
import { emptyBody } from "./provenance.ts";
import {
  QUIET_HOST_POLICY,
  summarizeQuietHost,
  type CommandResult,
  type HostObservation,
} from "./host.ts";
import {
  parseTrialArgs,
  GRAPHICS_SETTINGS_STORAGE_KEY as RUNNER_STORAGE_KEY,
  TRIAL_GRAPHICS_OVERRIDE,
} from "./runTrial.ts";
import { inspectMenuReport, runTrial, type BenchmarkOutcome, type TrialSeams } from "./trial.ts";

const QUIET_PS = [
  "  1     0  0.1 /sbin/launchd",
  " 42     1  0.2 /usr/libexec/quiet",
  " 55     1  3.4 /System/Library/PrivateFrameworks/SkyLight.framework/Resources/WindowServer",
].join("\n");
const BUSY_PS = [
  "  1     0  0.1 /sbin/launchd",
  " 77     1 340.0 /Users/other/worktree/node",
  " 99     1  0.2 /usr/libexec/quiet",
].join("\n");
/** Nothing competing, but the shared window server is carrying sustained load. */
const SHARED_BUSY_PS = [
  "  1     0  0.1 /sbin/launchd",
  " 55     1 88.0 /System/Library/PrivateFrameworks/SkyLight.framework/Resources/WindowServer",
  " 99     1  0.2 /usr/libexec/quiet",
].join("\n");

const observation = (label: HostObservation["label"], atMs: number): HostObservation => ({
  label,
  at: new Date(Date.UTC(2026, 8, 15, 10, 0, 0) + atMs).toISOString(),
  available: true,
  unavailable: null,
  loadAverage1m: 1,
  busiestOtherPercent: 0,
  otherProcesses: [],
  sharedProcesses: [],
  competing: false,
  attribution: null,
  quiet: true,
});

function menuReport(overrides: Record<string, unknown> = {}) {
  return {
    kind: "battle-benchmark",
    version: 2,
    completeWindow: true,
    identity: {
      userAgent: "test-agent",
      adapter: "apple / metal-3",
      initialStateHash: "9928381812590497427",
      graphics: {
        ...DEFAULT_GRAPHICS_SETTINGS,
        audio: { ...DEFAULT_GRAPHICS_SETTINGS.audio, muted: false },
      },
    },
    frames: [{ renderer: { gpuSubmission: { submissionId: 1, backend: "raw" } } }],
    ...overrides,
  };
}

function outcome(overrides: Partial<BenchmarkOutcome> = {}): BenchmarkOutcome {
  return {
    exitCode: 0,
    reportKind: "scenario-run-report",
    failures: [],
    pageErrors: [],
    checkCount: 9,
    exportBytes: new TextEncoder().encode(JSON.stringify(menuReport())),
    exportStale: false,
    startupStats: { benchmark: { phase: "preparing" } },
    terminalStats: { benchmark: { phase: "complete" } },
    browserVersion: "Chrome/153.0.8010.36",
    error: null,
    ...overrides,
  };
}

const HOST_TOOLS: Record<string, string> = {
  "sysctl -n hw.model": "Mac17,9",
  "sysctl -n machdep.cpu.brand_string": "Apple M5 Pro",
  sw_vers: "ProductName:\tmacOS\nProductVersion:\t26.6.2",
  "pmset -g ps": "Now drawing from 'AC Power'",
  "system_profiler SPDisplaysDataType":
    "        Resolution: 2880 x 1800\n        Refresh Rate: 60 Hz",
};

function seams(ps: string, runBenchmark: TrialSeams["runBenchmark"]): TrialSeams {
  let tick = 0;
  return {
    fetchResource: async () => ({ status: 404, headers: {}, body: emptyBody() }),
    runCommand: async (file, args): Promise<CommandResult> => {
      if (file === "ps") return { ok: true, stdout: ps, error: null };
      const stdout = HOST_TOOLS[[file, ...args].join(" ")];
      return stdout === undefined
        ? { ok: false, stdout: "", error: `${file}: not collected` }
        : { ok: true, stdout, error: null };
    },
    runBenchmark,
    now: () => new Date(Date.UTC(2026, 8, 15, 10, 0, (tick += 1))),
    ownPid: 1234,
    loadAverage: () => [1, 1, 1],
  };
}

describe("fixed-production-build Menu trial", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "trial-runner-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function options(
    fixture: Awaited<ReturnType<typeof writeFixedBuildFixture>>,
    name: string,
  ) {
    return {
      runId: name,
      backend: "raw" as const,
      url: fixture.options.url,
      manifestPath: fixture.manifestPath,
      renderConfigPath: fixture.renderConfigPath,
      outDir: join(root, "trials", name),
      order: 0,
      externalHostEvidence: null,
      observationIntervalMs: 60000,
    };
  }

  it("unmutes audio through the real graphics-settings storage key and changes nothing else", () => {
    expect(RUNNER_STORAGE_KEY).toBe(GRAPHICS_SETTINGS_STORAGE_KEY);
    // Only `audio.muted` is declared, so the owner's sanitizer keeps every other
    // default quality setting; the seeded value must still round-trip unmuted.
    expect(TRIAL_GRAPHICS_OVERRIDE).toEqual({ audio: { muted: false } });
    expect(DEFAULT_GRAPHICS_SETTINGS.audio.muted).toBe(true);
  });

  it("archives a complete trial with matched provenance and a quiet host", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const trial = await runTrial(await options(fixture, "complete"), {
      ...seams(QUIET_PS, async () => outcome()),
      fetchResource: fixture.fetchResource,
    });
    expect(trial.functional).toEqual({ eligible: true, issues: [] });
    expect(trial.ranking.eligible).toBe(true);
    expect(trial.status).toBe("complete");
    expect(trial.measurement).toBe("live");
    const run = JSON.parse(await readFile(join(root, "trials/complete/run.json"), "utf8"));
    expect(run.manifest.backend).toBe("raw");
    expect(run.manifest.commit).toBe("a".repeat(40));
    expect(run.manifest.dependenciesSha256).toBe("d".repeat(64));
    expect(run.manifest.wasmSha256).toBe("f".repeat(64));
    expect(run.manifest.hardware).toEqual({
      machine: "Mac17,9 / Apple M5 Pro",
      os: "ProductName: macOS; ProductVersion: 26.6.2",
      browser: "Chrome/153.0.8010.36",
      adapter: "apple / metal-3",
      power: "Now drawing from 'AC Power'",
      display: "Resolution: 2880 x 1800; Refresh Rate: 60 Hz",
    });
    expect(run.manifest.quietHost).toEqual({
      verified: true,
      evidence: "./host-observations.json",
    });
    expect(run.manifest.validation).toEqual({ passed: true, evidence: "./scenario-report.json" });
    expect(run.report.identity.graphics.audio.muted).toBe(false);
    expect(trial.artifacts.map((artifact) => artifact.name)).toEqual([
      "host-observations.json",
      "menu-export.json",
      "run.json",
    ]);
  });

  it("rejects a provenance mismatch before any browser work and keeps the evidence", async () => {
    const fixture = await writeFixedBuildFixture(root);
    await writeFile(join(fixture.atlasDir, "catalog.json"), "tampered");
    const runBenchmark = vi.fn(async () => outcome());
    const trial = await runTrial(await options(fixture, "mismatch"), {
      ...seams(QUIET_PS, runBenchmark),
      fetchResource: fixture.fetchResource,
    });
    expect(runBenchmark).not.toHaveBeenCalled();
    expect(trial.status).toBe("rejected");
    expect(trial.functional.eligible).toBe(false);
    expect(trial.functional.issues.join(" ")).toContain("atlas/catalog.json");
    const record = JSON.parse(await readFile(join(root, "trials/mismatch/trial.json"), "utf8"));
    expect(record.status).toBe("rejected");
    expect(record.functional.issues).toContain("the benchmark was not started");
    const evidence = JSON.parse(
      await readFile(join(root, "trials/mismatch/host-observations.json"), "utf8"),
    );
    expect(evidence.observations.map((o: HostObservation) => o.label)).toEqual(["pre", "post"]);
    expect(evidence.hardware.machine).toBe("Mac17,9 / Apple M5 Pro");
    await expect(readFile(join(root, "trials/mismatch/run.json"))).rejects.toThrow();
  });

  it("preserves the export and scenario failures of a failed run", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const trial = await runTrial(await options(fixture, "failed"), {
      ...seams(QUIET_PS, async () =>
        outcome({
          exitCode: 1,
          failures: ["battle-benchmark-complete: camera reached near wide and horizon views"],
          pageErrors: ["WebGPU device lost"],
        }),
      ),
      fetchResource: fixture.fetchResource,
    });
    expect(trial.status).toBe("failed");
    expect(trial.functional.eligible).toBe(false);
    expect(trial.functional.issues).toEqual([
      "the scene runner exited 1",
      "scenario check failed: battle-benchmark-complete: camera reached near wide and horizon views",
      "page error: WebGPU device lost",
    ]);
    expect(trial.ranking.eligible).toBe(false);
    const run = JSON.parse(await readFile(join(root, "trials/failed/run.json"), "utf8"));
    expect(run.manifest.validation).toEqual({ passed: false, evidence: null });
    expect(run.report.identity.adapter).toBe("apple / metal-3");
    const archived = await readFile(join(root, "trials/failed/menu-export.json"), "utf8");
    expect(JSON.parse(archived).kind).toBe("battle-benchmark");
  });

  it("never accepts a scene that exited nonzero, however good its evidence looks", async () => {
    const fixture = await writeFixedBuildFixture(root);
    // Everything a passing run leaves behind: a fresh, valid, unmuted export,
    // no failures, no page errors. Only the scene's own verdict says otherwise.
    const trial = await runTrial(await options(fixture, "silent-failure"), {
      ...seams(QUIET_PS, async () => outcome({ exitCode: 3 })),
      fetchResource: fixture.fetchResource,
    });
    expect(trial.functional.issues).toEqual(["the scene runner exited 3"]);
    expect(trial.functional.eligible).toBe(false);
    expect(trial.status).toBe("failed");
    expect(trial.ranking.eligible).toBe(false);
    const run = JSON.parse(await readFile(join(root, "trials/silent-failure/run.json"), "utf8"));
    expect(run.manifest.validation).toEqual({ passed: false, evidence: null });
  });

  it("requires the scene's own report and its checks, not just an empty failure list", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const cases = [
      [{ exitCode: null }, "the scene runner never reported an exit code"],
      [{ reportKind: null }, "the scene runner wrote no readable scenario report"],
      [
        { reportKind: "battle-benchmark" },
        "the scene runner wrote a battle-benchmark, not a scenario-run-report",
      ],
      [{ checkCount: 0 }, "the scenario report recorded no checks"],
    ] as const;
    for (const [index, [override, expected]] of cases.entries()) {
      const trial = await runTrial(await options(fixture, `evidence-${index}`), {
        ...seams(QUIET_PS, async () => outcome(override)),
        fetchResource: fixture.fetchResource,
      });
      expect(trial.functional.issues).toContain(expected);
      expect(trial.functional.eligible).toBe(false);
    }
  });

  it("rejects a recording whose settings are not the declared render configuration", async () => {
    const fixture = await writeFixedBuildFixture(root);
    // The declaration is the operator's claim about the compiled build; it can
    // only be evidence if a recording that disagrees with it is refused.
    await writeFile(
      fixture.renderConfigPath,
      JSON.stringify({ graphics: { shadows: "csm", grass: true } }),
    );
    const trial = await runTrial(await options(fixture, "declared"), {
      ...seams(QUIET_PS, async () => outcome()),
      fetchResource: fixture.fetchResource,
    });
    expect(trial.functional.issues).toEqual([
      'declared graphics.shadows "csm" but the recording observed "single"',
    ]);
    expect(trial.functional.eligible).toBe(false);
  });

  it("records a thrown browser seam instead of losing the trial", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const trial = await runTrial(await options(fixture, "threw"), {
      ...seams(QUIET_PS, async () => {
        throw Error("chrome channel is not installed");
      }),
      fetchResource: fixture.fetchResource,
    });
    expect(trial.status).toBe("failed");
    expect(trial.functional.issues.join(" ")).toContain("chrome channel is not installed");
    expect(trial.scenario.exitCode).toBeNull();
    await expect(readFile(join(root, "trials/threw/trial.json"))).resolves.toBeTruthy();
  });

  it("never reuses a directory that already holds a trial", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const first = await options(fixture, "once");
    await runTrial(first, {
      ...seams(QUIET_PS, async () => outcome()),
      fetchResource: fixture.fetchResource,
    });
    const before = await readFile(join(first.outDir, "trial.json"), "utf8");
    await expect(
      runTrial(first, {
        ...seams(QUIET_PS, async () => outcome()),
        fetchResource: fixture.fetchResource,
      }),
    ).rejects.toThrow(/EEXIST/);
    expect(await readFile(join(first.outDir, "trial.json"), "utf8")).toBe(before);
  });

  it("separates a functional run from a quiet-rankable one", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const trial = await runTrial(await options(fixture, "noisy"), {
      ...seams(BUSY_PS, async () => outcome()),
      fetchResource: fixture.fetchResource,
    });
    expect(trial.functional.eligible).toBe(true);
    expect(trial.status).toBe("complete");
    expect(trial.ranking.eligible).toBe(false);
    expect(trial.ranking.issues.join(" ")).toContain("was not quiet");
    const run = JSON.parse(await readFile(join(root, "trials/noisy/run.json"), "utf8"));
    expect(run.manifest.quietHost).toEqual({ verified: false, evidence: null });
    expect(run.manifest.validation.passed).toBe(true);
  });

  it("opens the measured window at the benchmark, not before the provenance sweep", async () => {
    const fixture = await writeFixedBuildFixture(root);
    // Hashing gigabytes of shared assets is setup, not measured time. If the
    // series opened before it, a slow disk would read as an unwatched stretch
    // of the run and cost an otherwise quiet trial its ranking.
    const order: string[] = [];
    const base = seams(QUIET_PS, async () => {
      order.push("benchmark");
      return outcome();
    });
    const trial = await runTrial(await options(fixture, "window"), {
      ...base,
      runCommand: (file, args) => {
        if (file === "ps") order.push("observe");
        return base.runCommand(file, args);
      },
      fetchResource: async (url, limits) => {
        order.push("provenance");
        return fixture.fetchResource(url, limits);
      },
    });
    expect(trial.ranking.eligible).toBe(true);
    expect(order.indexOf("observe")).toBeGreaterThan(order.lastIndexOf("provenance"));
    expect(order.indexOf("observe")).toBeLessThan(order.indexOf("benchmark"));
  });

  it("records shared system load without charging or crediting it to the trial", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const trial = await runTrial(await options(fixture, "shared"), {
      ...seams(SHARED_BUSY_PS, async () => outcome()),
      fetchResource: fixture.fetchResource,
    });
    // Nothing competing was found, so the run is valid; but the window server's
    // work belongs to every client at once, so isolation is unknown, not proved.
    expect(trial.functional.eligible).toBe(true);
    expect(trial.host.quiet.verified).toBe(false);
    expect(trial.ranking.issues.join(" ")).toContain("cannot be split between this trial");
    const evidence = JSON.parse(
      await readFile(join(root, "trials/shared/host-observations.json"), "utf8"),
    );
    const [pre] = evidence.observations as HostObservation[];
    expect(pre.busiestOtherPercent).toBe(0.2);
    expect(pre.sharedProcesses.map((process) => process.cpuPercent)).toEqual([88]);
    expect(pre.competing).toBe(false);
    expect(evidence.policy.sharedSystemProcesses).toEqual(["WindowServer", "kernel_task"]);
  });

  it("keeps a quiet shared process in the record without blocking the ranking", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const trial = await runTrial(await options(fixture, "shared-idle"), {
      ...seams(QUIET_PS, async () => outcome()),
      fetchResource: fixture.fetchResource,
    });
    expect(trial.ranking.eligible).toBe(true);
    const evidence = JSON.parse(
      await readFile(join(root, "trials/shared-idle/host-observations.json"), "utf8"),
    );
    const [pre] = evidence.observations as HostObservation[];
    expect(pre.sharedProcesses.map((process) => process.command)).toEqual([
      "/System/Library/PrivateFrameworks/SkyLight.framework/Resources/WindowServer",
    ]);
    expect(pre.attribution).toBeNull();
  });

  it("stops sampling as soon as the run settles instead of waiting out the interval", async () => {
    const fixture = await writeFixedBuildFixture(root);
    // A cadence far longer than the run: the pending timer must be cleared, not
    // awaited, and the post observation must close the series immediately.
    const started = Date.now();
    const trial = await runTrial(
      { ...(await options(fixture, "bounded")), observationIntervalMs: 90000 },
      {
        ...seams(QUIET_PS, async () => outcome()),
        fetchResource: fixture.fetchResource,
      },
    );
    expect(Date.now() - started).toBeLessThan(2000);
    const evidence = JSON.parse(
      await readFile(join(root, "trials/bounded/host-observations.json"), "utf8"),
    );
    expect(evidence.observations.map((o: HostObservation) => o.label)).toEqual(["pre", "post"]);
    expect(trial.ranking.eligible).toBe(true);
  });

  it("samples the host while the benchmark is running, not only at its ends", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const trial = await runTrial(
      { ...(await options(fixture, "periodic")), observationIntervalMs: 5 },
      {
        ...seams(QUIET_PS, async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
          return outcome();
        }),
        fetchResource: fixture.fetchResource,
      },
    );
    const evidence = JSON.parse(
      await readFile(join(root, "trials/periodic/host-observations.json"), "utf8"),
    );
    const labels = evidence.observations.map((o: HostObservation) => o.label);
    expect(labels[0]).toBe("pre");
    expect(labels.at(-1)).toBe("post");
    expect(labels).toContain("periodic");
    expect(trial.host.observationCount).toBe(labels.length);
  });

  it("records an unusable Menu export instead of archiving a previous trial's bytes", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const trial = await runTrial(await options(fixture, "stale"), {
      ...seams(QUIET_PS, async () => outcome({ exportBytes: null, exportStale: true })),
      fetchResource: fixture.fetchResource,
    });
    expect(trial.functional.issues).toEqual([
      "the Menu export at the scene's path predates this trial",
    ]);
    expect(trial.artifacts.map((artifact) => artifact.name)).toEqual(["host-observations.json"]);
  });

  it("treats an unreadable process listing as unavailable, not as an idle machine", async () => {
    const fixture = await writeFixedBuildFixture(root);
    const trial = await runTrial(await options(fixture, "unreadable"), {
      ...seams("ps: illegal option -- o", async () => outcome()),
      fetchResource: fixture.fetchResource,
    });
    expect(trial.functional.eligible).toBe(true);
    expect(trial.host.quiet.verified).toBe(false);
    expect(trial.ranking.issues).toContain("2 host observation(s) could not be collected");
  });

  it("will not call a host quiet from a single snapshot", () => {
    expect(summarizeQuietHost([observation("pre", 0)])).toEqual({
      verified: false,
      issues: ["the series does not close with a post-run host observation"],
    });
    expect(summarizeQuietHost([observation("pre", 0), observation("post", 1)]).verified).toBe(true);
  });

  it("will not call a window it never watched quiet", () => {
    const gapMs = QUIET_HOST_POLICY.maxObservationGapMs + 1;
    // Two quiet endpoints with the whole timed run between them say nothing
    // about the run: a cadence slower than the window is not coverage.
    const uncovered = summarizeQuietHost([observation("pre", 0), observation("post", gapMs)]);
    expect(uncovered.verified).toBe(false);
    expect(uncovered.issues.join(" ")).toContain("went unobserved");
    const covered = summarizeQuietHost([
      observation("pre", 0),
      observation("periodic", gapMs / 2),
      observation("post", gapMs),
    ]);
    expect(covered).toEqual({ verified: true, issues: [] });
  });

  it("requires the series to open and close around the run, in order", () => {
    expect(
      summarizeQuietHost([observation("periodic", 0), observation("post", 1)]).issues,
    ).toContain("the series does not open with a pre-run host observation");
    expect(
      summarizeQuietHost([observation("pre", 0), observation("periodic", 1)]).issues,
    ).toContain("the series does not close with a post-run host observation");
    expect(summarizeQuietHost([observation("pre", 5), observation("post", 1)]).issues).toContain(
      "host observations are not in time order",
    );
  });

  it("does not credit a sampled interval that never carried a timestamp", () => {
    const verdict = summarizeQuietHost([
      { ...observation("pre", 0), at: "not a time" },
      observation("post", 1),
    ]);
    expect(verdict.verified).toBe(false);
    expect(verdict.issues).toContain("host observation timestamps are not readable");
  });
});

describe("trial arguments", () => {
  it("requires every input a comparable trial needs", () => {
    const argv = [
      "--backend",
      "raw",
      "--url",
      "http://127.0.0.1:5261/",
      "--build-manifest",
      "/builds/manifest.json",
      "--render-config",
      "/builds/render-config.json",
      "--out",
      "/trials/raw-0",
      "--order",
      "0",
    ];
    expect(parseTrialArgs(argv)).toEqual({
      backend: "raw",
      url: "http://127.0.0.1:5261/",
      manifestPath: "/builds/manifest.json",
      renderConfigPath: "/builds/render-config.json",
      outDir: "/trials/raw-0",
      order: 0,
      runId: "raw-0",
      externalHostEvidence: null,
      observationIntervalMs: 60000,
    });
    expect(() => parseTrialArgs(argv.slice(2))).toThrow(/--backend is required/);
    expect(() => parseTrialArgs([...argv.slice(0, 10), "--order", "last"])).toThrow(/whole number/);
    expect(() => parseTrialArgs([...argv, "--observation-interval-ms", "10"])).toThrow(/at least/);
    // A cadence that could never cover the window is refused before the GPU is
    // held for five minutes, rather than producing an unrankable trial.
    expect(() =>
      parseTrialArgs([
        ...argv,
        "--observation-interval-ms",
        String(QUIET_HOST_POLICY.maxObservationGapMs + 1),
      ]),
    ).toThrow(/coverage policy/);
  });
});

describe("report identity", () => {
  it("rejects a recording that stayed muted or presented another backend", () => {
    const muted = menuReport();
    muted.identity.graphics.audio.muted = true;
    expect(inspectMenuReport(muted, "raw").issues).toEqual([
      "Menu audio stayed muted for the timed window",
    ]);
    expect(inspectMenuReport(menuReport(), "typegpu").issues).toEqual([
      "1 of 1 submissions did not present as typegpu",
    ]);
    expect(inspectMenuReport(menuReport(), "raw")).toEqual({
      adapter: "apple / metal-3",
      measurement: "live",
      issues: [],
    });
  });

  it("labels a held recording renderer-only whatever kind it claims", () => {
    const scope = { measurement: "renderer-only", simulation: "held", tick: 9000 };
    expect(inspectMenuReport(menuReport({ scope }), "raw").measurement).toBe("renderer-only");
  });

  it("requires the source build to present without a native backend label", () => {
    const source = menuReport({
      frames: [{ renderer: { gpuSubmission: { submissionId: 1 } } }],
    });
    expect(inspectMenuReport(source, "three").issues).toEqual([]);
    expect(inspectMenuReport(menuReport(), "three").issues).toEqual([
      "1 of 1 submissions did not present as three",
    ]);
  });
});
