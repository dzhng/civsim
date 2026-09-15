/** LAB-ONLY, DISPOSABLE, SCHEDULED FOR DELETION with the rest of
 * `apps/battle-perf-lab/simulation`.
 *
 * One place that reads the published layout and digests what a presentation consumer
 * actually saw on a completed tick, so the short checks and the canonical run state
 * parity in the same terms. It derives nothing: `BattleActionAdapter` and
 * `ActionTimeline` remain the semantic owners.
 */
import { createHash } from "node:crypto";
import type { ActionObservation } from "@packages/crowd-runtime/src/actionTimeline";
import type { Game } from "../../../web/src/wasm/game_wasm.js";

/** One completed-tick publication, as produced by the snapshot layout owner. */
export interface PublishedSnapshot {
  tick: number;
  buffer: ArrayBuffer;
  layout: { name: string; offset: number; length: number }[];
  soldiers: number;
  projectiles: number;
  units: number;
  stride: number;
  victor: number;
  hash: string;
}

/** Raw projectile records, in the order the snapshot layout publishes them. */
const PROJECTILE_FIELDS = [
  "projectile_x",
  "projectile_y",
  "projectile_z",
  "projectile_vx",
  "projectile_vy",
  "projectile_vz",
  "projectile_kind",
] as const;

/** Presentation branches a window must actually move through for parity to mean anything. */
export const MARKS = [
  "alive",
  "fighting",
  "guardedFacing",
  "pikeReady",
  "incapacitated",
  "routing",
  "atEase",
  "releasing",
  "moving",
] as const;

type Typed = Float32Array | Float64Array | Uint8Array | Uint32Array;

export function sha256(...parts: Typed[]): string {
  const hash = createHash("sha256");
  for (const part of parts)
    hash.update(new Uint8Array(part.buffer, part.byteOffset, part.byteLength));
  return hash.digest("hex");
}

export function field<T extends Typed>(
  published: PublishedSnapshot,
  name: string,
  Type: new (buffer: ArrayBuffer, offset: number, length: number) => T,
): T {
  const entry = published.layout.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`published snapshot has no ${name}`);
  return new Type(published.buffer, entry.offset, entry.length / Type.prototype.BYTES_PER_ELEMENT);
}

export const publishedProjectiles = (published: PublishedSnapshot): Typed[] =>
  PROJECTILE_FIELDS.map((name) =>
    name === "projectile_kind"
      ? field(published, name, Uint8Array)
      : field(published, name, Float32Array),
  );

/** The same records read straight from a live `Game`, for oracle comparison. */
export function liveProjectiles(game: Game, memory: WebAssembly.Memory): Typed[] {
  const count = game.projectile_count();
  const pointer = game as unknown as Record<string, () => number>;
  return PROJECTILE_FIELDS.map((name) =>
    name === "projectile_kind"
      ? new Uint8Array(memory.buffer, pointer[`${name}_ptr`](), count)
      : new Float32Array(memory.buffer, pointer[`${name}_ptr`](), count),
  );
}

/** What one completed tick looked like to the consumer: an exact digest of the derived
 * observations and render facings, plus the branch counts that make a window readable. */
export function observationRecord(read: {
  observations: ActionObservation[];
  facings: Float32Array;
}) {
  const marks: Record<(typeof MARKS)[number], number> = {
    alive: 0,
    fighting: 0,
    guardedFacing: 0,
    pikeReady: 0,
    incapacitated: 0,
    routing: 0,
    atEase: 0,
    releasing: 0,
    moving: 0,
  };
  for (const observation of read.observations) {
    if (observation.alive) marks.alive++;
    if (observation.fighting) marks.fighting++;
    if (observation.guardedFacing) marks.guardedFacing++;
    if (observation.pikeReady) marks.pikeReady++;
    if (observation.incapacitated) marks.incapacitated++;
    if (observation.routing) marks.routing++;
    if (observation.atEase) marks.atEase++;
    if (observation.releaseTtl > 0) marks.releasing++;
    if (observation.speedMps > 0) marks.moving++;
  }
  return {
    // Observation fields are numbers and booleans in one construction order, so JSON is
    // an exact, order-stable encoding of what the consumer received.
    observationsSha256: createHash("sha256")
      .update(JSON.stringify(read.observations))
      .digest("hex"),
    facingsSha256: sha256(read.facings),
    marks,
  };
}
