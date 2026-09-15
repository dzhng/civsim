import { BattleGrassResidency as ProductionResidency } from "../../../packages/game-renderer/src/battle/battleGrassResidency";
import { GRASS_FIELD_PACKED_STRIDE_FLOATS } from "../../../packages/game-renderer/src/battle/grassField";
export * from "../../../packages/game-renderer/src/battle/battleGrassResidency";

type State = ReturnType<ProductionResidency["snapshot"]>;
type Stats = ReturnType<ProductionResidency["stats"]>;
type Layer = "base" | "ring";
export interface GrassPublication {
  state: Omit<State, Layer> & {
    base: Omit<State["base"], "records">;
    ring: Omit<State["ring"], "records">;
  };
  records: Partial<Record<Layer, Float32Array | null>>;
  stats: Stats;
}
let replay = false;
let recording = false;
let pending: GrassPublication[] = [];
let replayPending: GrassPublication[] = [];
let active = false;
export function beginGrassPublicationCapture() {
  recording = true;
  pending = [];
}
export function takeGrassPublications() {
  const result = pending;
  pending = [];
  return result;
}
export function beginGrassPublicationReplay() {
  if (active) throw Error("Dispose the source residency before replay");
  replay = true;
  replayPending = [];
}
export function queueGrassPublications(publications: readonly GrassPublication[]) {
  if (replayPending.length) throw Error("Previous grass publication batch was not consumed");
  replayPending = [...publications];
}
export function assertGrassPublicationsConsumed() {
  if (replayPending.length) throw Error("Replay omitted a source grass prepareRender boundary");
}

/** Importer-scoped lab provider. Live mode delegates unchanged; replay consumes resolved publications. */
export class BattleGrassResidency extends ProductionResidency {
  private readonly replayMode = replay;
  private readonly notify: () => void;
  private resolved: State | null = null;
  private resolvedStats: Stats | null = null;
  private revisions = { base: -1, ring: -1 };
  private records: Record<Layer, Float32Array | null> = { base: null, ring: null };
  constructor(...args: ConstructorParameters<typeof ProductionResidency>) {
    super(...args);
    if (active) throw Error("The lab publication provider owns one residency at a time");
    active = true;
    this.notify = args[2] ?? (() => {});
  }
  override setTerrain(...args: Parameters<ProductionResidency["setTerrain"]>) {
    if (!this.replayMode) super.setTerrain(...args);
  }
  override update(...args: Parameters<ProductionResidency["update"]>) {
    if (!this.replayMode) super.update(...args);
  }
  override setVisible(...args: Parameters<ProductionResidency["setVisible"]>) {
    if (!this.replayMode) super.setVisible(...args);
  }
  override setFarVisible(...args: Parameters<ProductionResidency["setFarVisible"]>) {
    if (!this.replayMode) super.setFarVisible(...args);
  }
  override settle() {
    if (!this.replayMode) super.settle();
  }
  override prepareRender(...args: Parameters<ProductionResidency["prepareRender"]>) {
    if (this.replayMode) {
      const publication = replayPending.shift();
      if (!publication) throw Error("Replay requested an uncaptured grass prepareRender boundary");
      for (const layer of ["base", "ring"] as const) {
        if (Object.hasOwn(publication.records, layer))
          this.records[layer] = publication.records[layer]!;
        else if (publication.state[layer].revision !== this.revisions[layer])
          throw Error("Missing grass record revision");
        this.revisions[layer] = publication.state[layer].revision;
      }
      this.resolved = {
        ...publication.state,
        base: {
          ...publication.state.base,
          records: this.records.base,
          recordCount: (this.records.base?.length ?? 0) / GRASS_FIELD_PACKED_STRIDE_FLOATS,
        },
        ring: {
          ...publication.state.ring,
          records: this.records.ring,
          recordCount: (this.records.ring?.length ?? 0) / GRASS_FIELD_PACKED_STRIDE_FLOATS,
        },
      };
      this.resolvedStats = publication.stats;
      this.notify();
      return;
    }
    super.prepareRender(...args);
    if (!recording) return;
    const state = super.snapshot();
    const records: GrassPublication["records"] = {};
    for (const layer of ["base", "ring"] as const) {
      if (this.revisions[layer] !== state[layer].revision) {
        // The focus buffer is owner-mutated in place, so a publication has to
        // carry a copy of its live range, not a view of the live buffer.
        const part = state[layer];
        records[layer] = part.records
          ? part.records.slice(0, part.recordCount * GRASS_FIELD_PACKED_STRIDE_FLOATS)
          : null;
        this.revisions[layer] = part.revision;
      }
    }
    const { records: _base, ...base } = state.base;
    const { records: _ring, ...ring } = state.ring;
    pending.push({
      state: structuredClone({ ...state, base, ring }),
      records,
      stats: structuredClone(super.stats()),
    });
  }
  override snapshot() {
    return this.resolved ?? super.snapshot();
  }
  override stats() {
    return this.resolvedStats ?? super.stats();
  }
  override dispose() {
    super.dispose();
    active = false;
    pending = [];
    replayPending = [];
    replay = false;
    recording = false;
  }
}
