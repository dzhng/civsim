export interface CommandResult {
  ok: boolean;
  stdout: string;
  error: string | null;
}
export type RunCommand = (file: string, args: string[]) => Promise<CommandResult>;

export type ObservationLabel = "pre" | "periodic" | "post";

export interface HostProcess {
  pid: number;
  cpuPercent: number;
  command: string;
}

export interface HostObservation {
  label: ObservationLabel;
  at: string;
  available: boolean;
  unavailable: string | null;
  loadAverage1m: number | null;
  busiestOtherPercent: number | null;
  otherProcesses: HostProcess[];
  /**
   * Shared system processes, recorded rather than excluded: their work belongs
   * to every client of the machine at once, this trial included.
   */
  sharedProcesses: HostProcess[];
  /** A non-shared process or the load average was outside the declared policy. */
  competing: boolean;
  /** Why this sample cannot say who the load belonged to; null when it can. */
  attribution: string | null;
  quiet: boolean;
}

export interface QuietHostVerdict {
  verified: boolean;
  issues: string[];
}

export interface HardwareEvidence {
  machine: string | null;
  os: string | null;
  power: string | null;
  display: string | null;
  unavailable: string[];
}

/**
 * A declared ranking policy, not a physical guarantee. Recorded with every run
 * so a reviewer can disagree with the thresholds instead of guessing them.
 *
 * `ps` reports platform-averaged `pcpu`; on macOS it is a decaying average
 * over up to a minute. The series cannot prove instantaneous exclusivity. That is why a quiet verdict is only ever admissibility to a
 * comparison, never evidence that nothing competed.
 */
export const QUIET_HOST_POLICY = {
  otherProcessCpuPercent: 25,
  loadAverage1m: 4,
  retainedProcesses: 8,
  /**
   * No stretch of the measured window may go this long unobserved. It exceeds
   * the runner's default 60 s cadence, so a normal series covers the run and a
   * cadence too slow to cover it cannot pass by having only two endpoints.
   */
  maxObservationGapMs: 90_000,
  /**
   * Shared by every client of the window server and the kernel at once. Their
   * CPU can be neither charged to a competitor nor credited to this trial, so
   * a busy one leaves the trial's isolation unknown rather than disproved.
   */
  sharedSystemProcesses: ["WindowServer", "kernel_task"],
};

const PS_ARGS = ["-Ao", "pid=,ppid=,pcpu=,comm="];

interface ListingRow extends HostProcess {
  parentPid: number;
}

/** One pass over one listing: pid, parent, CPU and command all come from it. */
function parseListing(stdout: string): ListingRow[] {
  const rows: ListingRow[] = [];
  for (const line of stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/.exec(line);
    if (!match) continue;
    rows.push({
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      cpuPercent: Number(match[3]),
      command: match[4].trim(),
    });
  }
  return rows;
}

function ownsProcess(pid: number, ownPid: number, parents: Map<number, number>): boolean {
  let current = pid;
  for (let depth = 0; depth < 64 && current > 1; depth += 1) {
    if (current === ownPid) return true;
    const parent = parents.get(current);
    if (parent === undefined || parent === current) return false;
    current = parent;
  }
  return false;
}

function isSharedSystemProcess(command: string): boolean {
  const name = command.split("/").at(-1) ?? command;
  return QUIET_HOST_POLICY.sharedSystemProcesses.some((known) => name.startsWith(known));
}

const busiestFirst = (a: HostProcess, b: HostProcess) => b.cpuPercent - a.cpuPercent;

function unavailableObservation(
  label: ObservationLabel,
  at: string,
  reason: string,
): HostObservation {
  return {
    label,
    at,
    available: false,
    unavailable: reason,
    loadAverage1m: null,
    busiestOtherPercent: null,
    otherProcesses: [],
    sharedProcesses: [],
    competing: false,
    attribution: null,
    quiet: false,
  };
}

/**
 * One bounded process listing. The runner's own subtree (browser included) is
 * excluded by pid, so a competing `node`, `vite` or `cargo` still counts.
 */
export async function observeHost(
  label: ObservationLabel,
  seams: { runCommand: RunCommand; now: () => Date; ownPid: number; loadAverage: () => number[] },
): Promise<HostObservation> {
  const at = seams.now().toISOString();
  // A trial must survive its own instrumentation: an observation that cannot be
  // taken is recorded as unavailable, which blocks ranking without losing the run.
  const listing = await seams
    .runCommand("ps", PS_ARGS)
    .catch((error: unknown) => ({ ok: false, stdout: "", error: String(error) }));
  if (!listing.ok)
    return unavailableObservation(label, at, listing.error ?? "process listing failed");
  const rows = parseListing(listing.stdout);
  // A real listing always contains this runner. Zero parsed rows means the
  // output was not understood, which must not read as an idle machine.
  if (rows.length === 0)
    return unavailableObservation(label, at, "no process rows were understood in the listing");
  const parents = new Map(rows.map((row) => [row.pid, row.parentPid]));
  const foreign = rows.filter(({ pid }) => !ownsProcess(pid, seams.ownPid, parents));
  const shared = foreign.filter((row) => isSharedSystemProcess(row.command)).sort(busiestFirst);
  const others = foreign.filter((row) => !isSharedSystemProcess(row.command)).sort(busiestFirst);
  const busiestOtherPercent = others.length ? others[0].cpuPercent : 0;
  const loadAverage1m = seams.loadAverage()[0] ?? null;
  const unattributable = shared.filter(
    (row) => row.cpuPercent > QUIET_HOST_POLICY.otherProcessCpuPercent,
  );
  const attribution = unattributable.length
    ? `shared system process(es) ${unattributable
        .map((row) => `${row.command} ${row.cpuPercent}%`)
        .join(", ")} cannot be split between this trial and anything else`
    : null;
  const competing =
    busiestOtherPercent > QUIET_HOST_POLICY.otherProcessCpuPercent ||
    loadAverage1m === null ||
    loadAverage1m > QUIET_HOST_POLICY.loadAverage1m;
  return {
    label,
    at,
    available: true,
    unavailable: null,
    loadAverage1m,
    busiestOtherPercent,
    otherProcesses: others.slice(0, QUIET_HOST_POLICY.retainedProcesses),
    sharedProcesses: shared.slice(0, QUIET_HOST_POLICY.retainedProcesses),
    competing,
    attribution,
    quiet: !competing && attribution === null,
  };
}

const firstFew = (issues: string[], found: string[], noun: string) => {
  issues.push(...found.slice(0, 3));
  if (found.length > 3) issues.push(`${found.length - 3} further ${noun}`);
};

/**
 * A quiet claim needs the whole series, covering the whole measured window. A
 * pair of endpoints far enough apart to hide a competing build between them is
 * not evidence of anything, so an uncovered stretch blocks ranking exactly as a
 * busy sample does.
 */
export function summarizeQuietHost(observations: HostObservation[]): QuietHostVerdict {
  const issues: string[] = [];
  if (observations[0]?.label !== "pre")
    issues.push("the series does not open with a pre-run host observation");
  if (observations.length < 2 || observations.at(-1)?.label !== "post")
    issues.push("the series does not close with a post-run host observation");
  const unavailable = observations.filter((observation) => !observation.available);
  if (unavailable.length)
    issues.push(`${unavailable.length} host observation(s) could not be collected`);

  const times = observations.map((observation) => Date.parse(observation.at));
  if (times.some((time) => !Number.isFinite(time)))
    issues.push("host observation timestamps are not readable");
  else {
    const gaps: string[] = [];
    let outOfOrder = false;
    for (let index = 1; index < times.length; index += 1) {
      const gap = times[index] - times[index - 1];
      if (gap < 0) outOfOrder = true;
      else if (gap > QUIET_HOST_POLICY.maxObservationGapMs)
        gaps.push(
          `${Math.round(gap / 1000)}s between ${observations[index - 1].at} and` +
            ` ${observations[index].at} went unobserved`,
        );
    }
    if (outOfOrder) issues.push("host observations are not in time order");
    firstFew(issues, gaps, "unobserved stretch(es)");
  }

  const unattributed = observations.filter(
    (observation) => observation.available && observation.attribution,
  );
  firstFew(
    issues,
    unattributed.map(
      (observation) =>
        `${observation.label} observation at ${observation.at}: ${observation.attribution}`,
    ),
    "unattributable observation(s)",
  );
  const busy = observations.filter((observation) => observation.available && observation.competing);
  firstFew(
    issues,
    busy.map(
      (observation) =>
        `${observation.label} observation at ${observation.at} was not quiet` +
        ` (busiest other process ${observation.busiestOtherPercent}%,` +
        ` load ${observation.loadAverage1m})`,
    ),
    "busy observation(s)",
  );
  return { verified: issues.length === 0, issues };
}

async function firstLine(
  runCommand: RunCommand,
  file: string,
  args: string[],
): Promise<string | null> {
  const result = await runCommand(file, args);
  if (!result.ok) return null;
  const line = result.stdout.trim().split("\n")[0]?.trim();
  return line ? line : null;
}

const DISPLAY_FIELDS = /^\s*(Resolution|UI Looks like|Refresh Rate|Main Display|Display Type):/;

/**
 * Collected once before the browser launches so the probes cannot contaminate
 * the timed window. macOS tools; anywhere else the fields stay unavailable.
 */
export async function collectHardware(runCommand: RunCommand): Promise<HardwareEvidence> {
  const unavailable: string[] = [];
  const model = await firstLine(runCommand, "sysctl", ["-n", "hw.model"]);
  const cpu = await firstLine(runCommand, "sysctl", ["-n", "machdep.cpu.brand_string"]);
  const machine = [model, cpu].filter(Boolean).join(" / ") || null;
  const osResult = await runCommand("sw_vers", []);
  const os = osResult.ok
    ? osResult.stdout
        .trim()
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .join("; ") || null
    : null;
  const power = await firstLine(runCommand, "pmset", ["-g", "ps"]);
  const displayResult = await runCommand("system_profiler", ["SPDisplaysDataType"]);
  const display = displayResult.ok
    ? displayResult.stdout
        .split("\n")
        .filter((line) => DISPLAY_FIELDS.test(line))
        .map((line) => line.trim())
        .join("; ") || null
    : null;
  for (const [name, value] of [
    ["machine", machine],
    ["os", os],
    ["power", power],
    ["display", display],
  ] as const)
    if (value === null) unavailable.push(name);
  return { machine, os, power, display, unavailable };
}
