import { BattleGrassResidency as ProductionResidency } from "../../../packages/game-renderer/src/battle/battleGrassResidency";
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
export function queueGrassPublications(publications: GrassPublication[]) {
  if (replayPending.length) throw Error("Previous grass publication batch was not consumed");
  replayPending = publications;
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
        base: { ...publication.state.base, records: this.records.base },
        ring: { ...publication.state.ring, records: this.records.ring },
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
        records[layer] = state[layer].records;
        this.revisions[layer] = state[layer].revision;
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
