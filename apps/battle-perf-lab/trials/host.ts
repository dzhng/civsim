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
 * so a reviewer can disagree with the threshold instead of guessing it.
 */
export const QUIET_HOST_POLICY = {
  otherProcessCpuPercent: 25,
  loadAverage1m: 4,
  retainedProcesses: 8,
  /**
   * Window-server work is driven by the trial's own presentation, so it is
   * recorded but never counted as a competing workload.
   */
  attributedSystemProcesses: ["WindowServer", "kernel_task"],
};

const PS_ARGS = ["-Ao", "pid=,ppid=,pcpu=,comm="];

function parseProcesses(stdout: string): HostProcess[] {
  const rows: HostProcess[] = [];
  for (const line of stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/.exec(line);
    if (!match) continue;
    rows.push({ pid: Number(match[1]), cpuPercent: Number(match[3]), command: match[4].trim() });
  }
  return rows;
}

function parentsByPid(stdout: string): Map<number, number> {
  const parents = new Map<number, number>();
  for (const line of stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+/.exec(line);
    if (match) parents.set(Number(match[1]), Number(match[2]));
  }
  return parents;
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

function attributedToTrial(command: string): boolean {
  const name = command.split("/").at(-1) ?? command;
  return QUIET_HOST_POLICY.attributedSystemProcesses.some((known) => name.startsWith(known));
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
    return {
      label,
      at,
      available: false,
      unavailable: listing.error ?? "process listing failed",
      loadAverage1m: null,
      busiestOtherPercent: null,
      otherProcesses: [],
      quiet: false,
    };
  const processes = parseProcesses(listing.stdout);
  // A real listing always contains this runner. Zero parsed rows means the
  // output was not understood, which must not read as an idle machine.
  if (processes.length === 0)
    return {
      label,
      at,
      available: false,
      unavailable: "no process rows were understood in the listing",
      loadAverage1m: null,
      busiestOtherPercent: null,
      otherProcesses: [],
      quiet: false,
    };
  const parents = parentsByPid(listing.stdout);
  const others = processes
    .filter(
      (process) =>
        !ownsProcess(process.pid, seams.ownPid, parents) && !attributedToTrial(process.command),
    )
    .sort((a, b) => b.cpuPercent - a.cpuPercent);
  const busiestOtherPercent = others.length ? others[0].cpuPercent : 0;
  const loadAverage1m = seams.loadAverage()[0] ?? null;
  return {
    label,
    at,
    available: true,
    unavailable: null,
    loadAverage1m,
    busiestOtherPercent,
    otherProcesses: others.slice(0, QUIET_HOST_POLICY.retainedProcesses),
    quiet:
      busiestOtherPercent <= QUIET_HOST_POLICY.otherProcessCpuPercent &&
      loadAverage1m !== null &&
      loadAverage1m <= QUIET_HOST_POLICY.loadAverage1m,
  };
}

/**
 * A quiet claim needs the whole series. A single snapshot can never establish
 * that nothing competed with the five-minute window.
 */
export function summarizeQuietHost(observations: HostObservation[]): QuietHostVerdict {
  const issues: string[] = [];
  for (const label of ["pre", "post"] as const)
    if (!observations.some((observation) => observation.label === label))
      issues.push(`no ${label}-run host observation`);
  const unavailable = observations.filter((observation) => !observation.available);
  if (unavailable.length)
    issues.push(`${unavailable.length} host observation(s) could not be collected`);
  const busy = observations.filter((observation) => observation.available && !observation.quiet);
  for (const observation of busy.slice(0, 3))
    issues.push(
      `${observation.label} observation at ${observation.at} was not quiet` +
        ` (busiest other process ${observation.busiestOtherPercent}%,` +
        ` load ${observation.loadAverage1m})`,
    );
  if (busy.length > 3) issues.push(`${busy.length - 3} further busy observation(s)`);
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
