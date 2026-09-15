/** LAB-ONLY, DISPOSABLE, SCHEDULED FOR DELETION.
 *
 * `BattleActionAdapter` still constructs from a live `Game` plus its `WebAssembly.Memory`,
 * so a published snapshot cannot reach it without that pointer shape. This reader presents
 * exactly one held snapshot in that shape: every `*_ptr()` resolves against the published
 * layout, and `buffer` is the published buffer itself. It reads; it never ticks, owns or
 * frees a `Game`, and it is not a second observation seam.
 *
 * Delete this file with the rest of `apps/battle-perf-lab/simulation` once the real seam
 * separates raw observation reading from WASM pointer ownership in the adapter itself —
 * the integration/deletion graph in `specs/battle-performance/assets/03a-publication/README.md`.
 */
import type { Game } from "../../../web/src/wasm/game_wasm.js";
import type { presentationMetadata } from "./publication.mjs";

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

export interface SnapshotReader {
  game: Game;
  memory: WebAssembly.Memory;
  /** Take ownership of a published snapshot, replacing any previously held one. */
  adopt(published: PublishedSnapshot): void;
  /** Return the publication buffer to its producer and retain nothing. */
  release(): ArrayBuffer;
}

export function createSnapshotReader(
  metadata: ReturnType<typeof presentationMetadata>,
): SnapshotReader {
  let held: PublishedSnapshot | null = null;
  const current = () => {
    if (!held) throw new Error("publication buffer was returned; no snapshot is held");
    return held;
  };
  const base = {
    soldier_count: () => current().soldiers,
    projectile_count: () => current().projectiles,
    unit_count: () => current().units,
    unit_info_stride: () => current().stride,
    class_specs: () => metadata.classSpecs,
    loosing_duration: () => metadata.releaseDuration,
  };
  // The published layout is the only pointer authority, so every `*_ptr` resolves through
  // it rather than repeating the field list a second time.
  const game = new Proxy(base as Record<string, unknown>, {
    get(target, key) {
      if (key in target || typeof key !== "string") return target[key as string];
      if (!key.endsWith("_ptr")) return undefined;
      return () => {
        const name = key.slice(0, -"_ptr".length);
        const field = current().layout.find((entry) => entry.name === name);
        if (!field) throw new Error(`published snapshot has no ${name}`);
        return field.offset;
      };
    },
  });
  return {
    game: game as unknown as Game,
    memory: {
      get buffer() {
        return current().buffer;
      },
    } as unknown as WebAssembly.Memory,
    adopt(published) {
      held = published;
    },
    release() {
      const { buffer } = current();
      held = null;
      return buffer;
    },
  };
}
