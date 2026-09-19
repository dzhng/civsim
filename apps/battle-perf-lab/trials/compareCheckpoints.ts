/**
 * Offline reading of checkpoint archives. It launches nothing, measures nothing
 * and ranks nothing: a checkpoint run is correctness evidence only.
 *
 * Every field below was traced through its delegates on 2026-09-20 and checked
 * against archived real trials, because the two stat shapes agree on meaning but
 * not on spelling or on where they hang.
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { CheckpointObservation, CheckpointSample } from "./checkpointObserver.ts";
import type { TrialBackend } from "./provenance.ts";

/** What `runCheckpointObserver.ts` writes. */
export interface CheckpointArchive {
  kind: "battle-benchmark-checkpoint-run";
  version: 1;
  runId: string;
  backend: TrialBackend;
  url: string;
  heldTick: number | null;
  build: { manifestPath: string; commit: string | null; buildSha256: string | null };
  provenanceOk: boolean;
  exitCode: number | null;
  observation: CheckpointObservation | null;
  /** Frame rows of the Menu export this run wrote, keyed by frame id. */
  reportFrames: Record<string, ReportFrame> | null;
  issues: string[];
  ok: boolean;
}

export interface ReportFrame {
  elapsedMs: number;
  phase: string;
  /** Camera the loop actually consumed for this frame. */
  camera: { center: [number, number]; distance: number; yaw: number; pitch: number };
  /** Same instant on the scripted tour every backend shares. */
  intendedCamera: { center: [number, number]; distance: number; yaw: number; pitch: number };
}

type Path = readonly string[];

/**
 * `three` is the source build: `web/src/battle/renderer.ts:352` spreads
 * `PhotorealBattleWorld.stats()` (`packages/photoreal-renderer/src/battle/battleWorld.ts:612`),
 * whose `crowd` is `PhotorealCrowd.stats()` (`…/battle/crowdLayer.ts:499`).
 *
 * `raw`/`typegpu`/`vgpu` are lab live builds: `NativeBattleRenderer.stats()`
 * (`apps/battle-perf-lab/src/live/NativeBattleRenderer.ts:693`) nests the lab scene
 * under `native`, and each backend's `crowdAudience.ts` spreads
 * `createCrowdAudienceHistory().stats()` (`apps/battle-perf-lab/src/crowdAudienceHistory.ts:137`).
 *
 * The two produce the same five numbers from the same planner
 * (`packages/crowd-runtime/src/visibility.ts`), under different names:
 * `culling.viewVisible` and `mainVisible` are both `plan.viewVisible`
 * (`crowdLayer.ts:374`, `crowdAudienceHistory.ts:110`); `shadowTierHistogram` is
 * `plan.shadowCounts` on both sides; `visibleTierHistogram` is, on both sides, the
 * per-tier tally of instances whose visibility has bit 1 set (`crowdLayer.ts:389-394`,
 * `crowdAudienceHistory.ts:112-115`).
 */
const COUNT_PATHS: Record<"three" | "lab", Record<string, Path>> = {
  three: {
    soldiers: ["soldiers"],
    instances: ["crowd", "instances"],
    mainVisible: ["crowd", "culling", "viewVisible"],
    shadowOnly: ["crowd", "culling", "shadowOnly"],
  },
  lab: {
    soldiers: ["soldiers"],
    instances: ["native", "crowd", "instances"],
    mainVisible: ["native", "crowd", "mainVisible"],
    shadowOnly: ["native", "crowd", "shadowOnly"],
  },
};
const HISTOGRAM_PATHS: Record<"three" | "lab", Record<string, Path>> = {
  three: {
    visibleTierHistogram: ["crowd", "visibleTierHistogram"],
    shadowTierHistogram: ["crowd", "shadowTierHistogram"],
  },
  lab: {
    visibleTierHistogram: ["native", "crowd", "visibleTierHistogram"],
    shadowTierHistogram: ["native", "crowd", "shadowTierHistogram"],
  },
};
/** `BattleCameraSnapshot`, assigned whole each preparation on both shapes. */
const CAMERA_PATH: Record<"three" | "lab", Path> = {
  three: ["camera"],
  lab: ["native", "camera"],
};
/**
 * Present on one shape only, so they are reported beside the comparison and never
 * folded into it. Listed by observation, not by hand: see `scopeDifferences`.
 */
export const shapeOf = (backend: TrialBackend): "three" | "lab" =>
  backend === "three" ? "three" : "lab";

const at = (root: unknown, path: Path): unknown =>
  path.reduce<unknown>(
    (value, key) => (value && typeof value === "object" ? (value as any)[key] : undefined),
    root,
  );

/** A field that is absent is an error, never a zero: absence must not demote evidence. */
function required(root: unknown, path: Path, label: string): unknown {
  const value = at(root, path);
  if (value === undefined || value === null)
    throw Error(`${label}: ${path.join(".")} is absent from these stats`);
  return value;
}

export interface CheckpointCounts {
  counts: Record<string, number>;
  histograms: Record<string, Record<string, number>>;
  camera: Record<string, unknown>;
}

/**
 * Reads the equivalent values out of one backend's raw stats. Throws rather than
 * substituting a default, and checks the invariant both implementations hold:
 * the visible tier histogram is a breakdown of `mainVisible`.
 */
export function readCheckpointCounts(backend: TrialBackend, stats: unknown): CheckpointCounts {
  const renderStats = required(stats, ["renderStats"], backend);
  const shape = shapeOf(backend);
  const counts: Record<string, number> = {};
  for (const [name, path] of Object.entries(COUNT_PATHS[shape])) {
    const value = required(renderStats, path, `${backend}.${name}`);
    if (typeof value !== "number") throw Error(`${backend}.${name} is not a number`);
    counts[name] = value;
  }
  const histograms: Record<string, Record<string, number>> = {};
  for (const [name, path] of Object.entries(HISTOGRAM_PATHS[shape])) {
    const value = required(renderStats, path, `${backend}.${name}`) as Record<string, number>;
    for (const [key, tally] of Object.entries(value))
      if (typeof tally !== "number") throw Error(`${backend}.${name}.${key} is not a number`);
    histograms[name] = value;
  }
  const visibleTotal = Object.values(histograms.visibleTierHistogram).reduce((a, b) => a + b, 0);
  if (visibleTotal !== counts.mainVisible)
    throw Error(
      `${backend}: visibleTierHistogram sums to ${visibleTotal}, mainVisible is ${counts.mainVisible}`,
    );
  return {
    counts,
    histograms,
    camera: required(renderStats, CAMERA_PATH[shape], `${backend}.camera`) as Record<
      string,
      unknown
    >,
  };
}

/** The quartet the benchmark report records, derived from a renderer camera snapshot. */
export function consumedCamera(camera: Record<string, any>) {
  const params = camera.camera3d;
  if (!params) throw Error("camera snapshot carries no camera3d");
  return {
    center: [params.target[0], params.target[1]] as [number, number],
    distance: params.distance,
    yaw: params.yaw,
    pitch: params.pitch,
  };
}

const cameraDelta = (
  a: ReturnType<typeof consumedCamera>,
  b: ReturnType<typeof consumedCamera>,
) => ({
  center: [a.center[0] - b.center[0], a.center[1] - b.center[1]] as [number, number],
  distance: a.distance - b.distance,
  yaw: a.yaw - b.yaw,
  pitch: a.pitch - b.pitch,
});

/** Top-level `renderStats` keys each shape has and the other does not. */
function scopeDifferences(entries: { backend: TrialBackend; stats: any }[]) {
  const byShape = new Map<string, Set<string>>();
  for (const entry of entries) {
    const keys = byShape.get(shapeOf(entry.backend)) ?? new Set<string>();
    for (const key of Object.keys(entry.stats?.renderStats ?? {})) keys.add(key);
    byShape.set(shapeOf(entry.backend), keys);
  }
  const shapes = [...byShape];
  if (shapes.length < 2) return {};
  return Object.fromEntries(
    shapes.map(([shape, keys]) => [
      shape,
      [...keys].filter((key) => shapes.some(([other, set]) => other !== shape && !set.has(key))),
    ]),
  );
}

const equalValues = (values: unknown[]) =>
  values.every((value) => JSON.stringify(value) === JSON.stringify(values[0]));

export interface CheckpointComparison {
  kind: "battle-benchmark-checkpoint-comparison";
  version: 1;
  /** Correctness evidence only; an observed run may never enter a timing comparison. */
  rankable: false;
  backends: TrialBackend[];
  heldTicks: (number | null)[];
  stateHashes: string[];
  checkpoints: unknown[];
  scopedOnly: Record<string, string[]>;
  issues: string[];
  ok: boolean;
}

export function compareCheckpointArchives(archives: CheckpointArchive[]): CheckpointComparison {
  const issues: string[] = [];
  const stateHashes = new Set<string>();
  for (const archive of archives) {
    if (!archive.ok) issues.push(`${archive.runId}: the run itself failed`);
    if (!archive.observation) issues.push(`${archive.runId}: no observation was archived`);
    for (const error of archive.observation?.errors ?? [])
      issues.push(`${archive.runId}: ${error}`);
  }
  const ticks = [...new Set(archives.map((archive) => archive.heldTick))];
  if (ticks.length > 1) issues.push(`archives span held ticks ${ticks.join(", ")}`);

  const checkpointsMs = archives[0]?.observation?.config.checkpointsMs ?? [];
  for (const archive of archives)
    if (
      JSON.stringify(archive.observation?.config.checkpointsMs ?? []) !==
      JSON.stringify(checkpointsMs)
    )
      issues.push(`${archive.runId}: different checkpoints from the first archive`);

  const checkpoints = checkpointsMs.map((checkpointMs, index) => {
    const rows: any[] = [];
    for (const archive of archives) {
      const sample: CheckpointSample | null = archive.observation?.samples[index] ?? null;
      if (!sample) {
        issues.push(
          `${archive.runId}: no completed frame within ${archive.observation?.config.toleranceMs ?? "?"}ms of ${checkpointMs}ms` +
            ` (nearest ${archive.observation?.nearestOffsetMs[index] ?? "none"}ms)`,
        );
        continue;
      }
      if (sample.stateHash) stateHashes.add(sample.stateHash);
      let read: CheckpointCounts | null = null;
      try {
        read = readCheckpointCounts(archive.backend, sample.stats);
      } catch (error) {
        issues.push(`${archive.runId} @${checkpointMs}ms: ${(error as Error).message}`);
      }
      const reported = archive.reportFrames?.[String(sample.frameId)] ?? null;
      let consumed: ReturnType<typeof consumedCamera> | null = null;
      try {
        consumed = read ? consumedCamera(read.camera) : null;
      } catch (error) {
        issues.push(`${archive.runId} @${checkpointMs}ms: ${(error as Error).message}`);
      }
      if (reported && consumed && !equalValues([reported.camera, consumed]))
        issues.push(
          `${archive.runId} @${checkpointMs}ms: frame ${sample.frameId} stats camera differs from the camera the report recorded it consuming`,
        );
      rows.push({
        runId: archive.runId,
        backend: archive.backend,
        frameId: sample.frameId,
        simTick: (sample.frame as any).simTick ?? null,
        stateHash: sample.stateHash,
        offsetMs: sample.offsetMs,
        elapsedMs: sample.elapsedMs,
        frameIdDelta: sample.frameIdDelta,
        counts: read?.counts ?? null,
        histograms: read?.histograms ?? null,
        camera: consumed,
        report: reported
          ? {
              elapsedMs: reported.elapsedMs,
              phase: reported.phase,
              intendedCamera: reported.intendedCamera,
              /** Approximate by construction: the tour is sampled per frame, never at the checkpoint. */
              tourDelta: cameraDelta(reported.camera, reported.intendedCamera),
            }
          : null,
      });
    }
    const fields = [...Object.keys(COUNT_PATHS.three), ...Object.keys(HISTOGRAM_PATHS.three)];
    const equivalent = Object.fromEntries(
      fields.map((field) => {
        const values = rows.map((row) => row.counts?.[field] ?? row.histograms?.[field] ?? null);
        return [field, { values, equal: values.length > 1 && equalValues(values) }];
      }),
    );
    return {
      checkpointMs,
      match: "approximate" as const,
      backends: rows,
      equivalent,
      cameraSpread:
        rows.length > 1 && rows.every((row) => row.camera)
          ? rows.slice(1).map((row) => cameraDelta(row.camera, rows[0].camera))
          : null,
    };
  });

  if (stateHashes.size > 1)
    issues.push(`samples span authority hashes ${[...stateHashes].join(", ")}`);
  if (!checkpointsMs.length) issues.push("no checkpoints were declared");

  return {
    kind: "battle-benchmark-checkpoint-comparison",
    version: 1,
    rankable: false,
    backends: archives.map((archive) => archive.backend),
    heldTicks: ticks,
    stateHashes: [...stateHashes],
    checkpoints,
    scopedOnly: scopeDifferences(
      archives.flatMap((archive) =>
        (archive.observation?.samples ?? [])
          .filter((sample): sample is CheckpointSample => sample !== null)
          .slice(0, 1)
          .map((sample) => ({ backend: archive.backend, stats: sample.stats })),
      ),
    ),
    issues,
    ok: issues.length === 0,
  };
}

const HELP = `Usage: node apps/battle-perf-lab/trials/compareCheckpoints.ts <checkpoints.json> ...

Offline only. Reads one held tick's archives and writes the comparison to stdout.`;

export async function compareArchiveFiles(
  paths: string[],
  read: (path: string) => Promise<string>,
): Promise<CheckpointComparison> {
  if (!paths.length) throw Error(HELP);
  const archives: CheckpointArchive[] = [];
  for (const path of paths) {
    const archive = JSON.parse(await read(path));
    if (archive?.kind !== "battle-benchmark-checkpoint-run")
      throw Error(`${path} is not a checkpoint observation archive`);
    archives.push(archive);
  }
  return compareCheckpointArchives(archives);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  compareArchiveFiles(process.argv.slice(2), (path) => readFile(path, "utf8")).then(
    (report) => {
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.ok ? 0 : 1);
    },
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
}
