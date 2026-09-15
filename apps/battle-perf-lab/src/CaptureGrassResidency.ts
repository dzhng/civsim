import { BattleGrassResidency as ProductionResidency } from "../../../packages/game-renderer/src/battle/battleGrassResidency";
import { GRASS_FIELD_PACKED_STRIDE_FLOATS } from "../../../packages/game-renderer/src/battle/grassField";
import type { GrassRecordEdit } from "../../../packages/game-renderer/src/battle/grassFocusTiles";
export * from "../../../packages/game-renderer/src/battle/battleGrassResidency";

type State = ReturnType<ProductionResidency["snapshot"]>;
type Stats = ReturnType<ProductionResidency["stats"]>;
type Layer = "base" | "ring";
/** The bounded ranges one publication step wrote, and their record bytes. */
export interface GrassPublicationEdits {
  editSerial: number;
  ranges: readonly GrassRecordEdit[];
  data: Float32Array;
}
export interface GrassPublication {
  state: Omit<State, Layer> & {
    base: Omit<State["base"], "records">;
    ring: Omit<State["ring"], "records">;
  };
  /** The live range, carried only when the owner says to re-read it whole. */
  records: Partial<Record<Layer, Float32Array | null>>;
  /** Every other boundary: the ranges the owner actually wrote. Recording the
   *  whole live range per boundary would put the same 62 MB copy the renderer
   *  no longer makes back into the capture adapter. */
  edits: Partial<Record<Layer, GrassPublicationEdits>>;
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
  private serials = { base: -1, ring: -1 };
  private records: Record<Layer, Float32Array | null> = { base: null, ring: null };
  private replayEdits: readonly GrassRecordEdit[] = [];
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
      this.replayEdits = publication.edits.ring?.ranges ?? [];
      for (const layer of ["base", "ring"] as const) {
        const part = publication.state[layer];
        if (Object.hasOwn(publication.records, layer)) {
          const live = publication.records[layer];
          this.records[layer] = live ? resolveWholeRecords(live, part) : null;
        } else if (part.revision !== this.revisions[layer]) {
          throw Error("Missing grass record revision");
        } else {
          applyPublicationEdits(this.records[layer], publication.edits[layer]);
        }
        this.revisions[layer] = part.revision;
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
    const edits: GrassPublication["edits"] = {};
    for (const layer of ["base", "ring"] as const) {
      const part = state[layer];
      if (this.revisions[layer] !== part.revision) {
        // The focus buffer is owner-mutated in place, so a publication has to
        // carry a copy of its live range, not a view of the live buffer.
        records[layer] = part.records
          ? part.records.slice(0, part.recordCount * GRASS_FIELD_PACKED_STRIDE_FLOATS)
          : null;
        this.revisions[layer] = part.revision;
        this.serials[layer] = part.editSerial;
      } else if (part.records && part.edits.length > 0 && part.editSerial !== this.serials[layer]) {
        // Recorded before the real consumer takes them, on the same boundary.
        edits[layer] = {
          editSerial: part.editSerial,
          ranges: part.edits.map((edit) => ({ ...edit })),
          data: copyRecordRanges(part.records, part.edits),
        };
        this.serials[layer] = part.editSerial;
      }
    }
    const { records: _base, ...base } = state.base;
    const { records: _ring, ...ring } = state.ring;
    pending.push({
      state: structuredClone({ ...state, base, ring }),
      records,
      edits,
      stats: structuredClone(super.stats()),
    });
  }
  override takeRingEdits() {
    if (!this.replayMode) return super.takeRingEdits();
    const edits = this.replayEdits;
    this.replayEdits = [];
    return edits;
  }
  override snapshot() {
    return this.resolved ?? super.snapshot();
  }
  override stats() {
    return this.resolvedStats ?? super.stats();
  }
  override dispose() {
    super.dispose();
    this.records = { base: null, ring: null };
    active = false;
    pending = [];
    replayPending = [];
    replay = false;
    recording = false;
  }
}

/** Pack the named ranges of a capacity buffer into one contiguous payload. */
function copyRecordRanges(source: Float32Array, ranges: readonly GrassRecordEdit[]): Float32Array {
  const total = ranges.reduce((sum, range) => sum + range.count, 0);
  const data = new Float32Array(total * GRASS_FIELD_PACKED_STRIDE_FLOATS);
  let offset = 0;
  for (const range of ranges) {
    const start = range.start * GRASS_FIELD_PACKED_STRIDE_FLOATS;
    const length = range.count * GRASS_FIELD_PACKED_STRIDE_FLOATS;
    data.set(source.subarray(start, start + length), offset);
    offset += length;
  }
  return data;
}

/** Replay owns a capacity buffer of its own, so recorded ranges land where the
 *  source wrote them even though only the live prefix was recorded. */
function resolveWholeRecords(live: Float32Array, part: { recordCapacity: number }): Float32Array {
  const capacity = part.recordCapacity * GRASS_FIELD_PACKED_STRIDE_FLOATS;
  if (capacity <= live.length) return live;
  const buffer = new Float32Array(capacity);
  buffer.set(live);
  return buffer;
}

function applyPublicationEdits(
  target: Float32Array | null,
  edits: GrassPublicationEdits | undefined,
): void {
  if (!target || !edits) return;
  let offset = 0;
  for (const range of edits.ranges) {
    const length = range.count * GRASS_FIELD_PACKED_STRIDE_FLOATS;
    target.set(
      edits.data.subarray(offset, offset + length),
      range.start * GRASS_FIELD_PACKED_STRIDE_FLOATS,
    );
    offset += length;
  }
}
