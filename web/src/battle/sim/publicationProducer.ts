/** The producing half of the publication seam: one completed tick of a live `Game`
 * copied into one buffer the producer no longer owns.
 *
 * Nothing here derives presentation. It copies the raw records `BattleActionAdapter`,
 * the crowd, the HUD and the overlays already read, so the semantic owners on the
 * consuming side are unchanged. Kept out of the worker entry so a CPU test can
 * publish from a real `Game` without a browser worker. */
import type { Game } from "../../wasm/game_wasm.js";
import { PUBLICATION_FIELDS, layoutPublication, type PublicationCounts } from "./publicationLayout";

/** Overlay records the sim exports as owned Vecs rather than pointers. */
export interface PublicationOverlays {
  /** Waypoint start index per unit, length units + 1, or null when unrequested. */
  queuedIndex: Uint32Array | null;
  queuedOrders: Float32Array | null;
  formationPreview: Float32Array | null;
}

export const NO_PUBLICATION_OVERLAYS: PublicationOverlays = {
  queuedIndex: null,
  queuedOrders: null,
  formationPreview: null,
};

export interface LayoutScratch {
  offsets: Int32Array;
  lengths: Int32Array;
}

export function publicationCounts(
  game: Game,
  overlays: PublicationOverlays = NO_PUBLICATION_OVERLAYS,
): PublicationCounts {
  return {
    soldiers: game.soldier_count(),
    units: game.unit_count(),
    unitInfoStride: game.unit_info_stride(),
    projectiles: game.projectile_count(),
    queuedUnits: overlays.queuedIndex ? overlays.queuedIndex.length - 1 : 0,
    queuedWaypoints: overlays.queuedOrders ? overlays.queuedOrders.length / 3 : 0,
    previewPlacements: overlays.formationPreview ? overlays.formationPreview.length / 7 : 0,
  };
}

type PointerExports = Record<string, () => number>;

/** Copy one completed tick into `buffer`. Throws rather than truncating if the
 * caller supplied a buffer the tick does not fit in. */
export function writePublication(
  game: Game,
  memory: WebAssembly.Memory,
  buffer: ArrayBuffer,
  counts: PublicationCounts,
  scratch: LayoutScratch,
  overlays: PublicationOverlays = NO_PUBLICATION_OVERLAYS,
): number {
  const bytes = layoutPublication(counts, scratch.offsets, scratch.lengths);
  if (bytes > buffer.byteLength)
    throw new Error(`publication needs ${bytes} bytes, buffer holds ${buffer.byteLength}`);
  const pointers = game as unknown as PointerExports;
  const packed: Record<string, ArrayBufferView | null> = {
    queuedIndex: overlays.queuedIndex,
    queuedOrders: overlays.queuedOrders,
    formationPreview: overlays.formationPreview,
  };
  for (let index = 0; index < PUBLICATION_FIELDS.length; index++) {
    const length = scratch.lengths[index];
    if (length === 0) continue;
    const field = PUBLICATION_FIELDS[index];
    const target = new Uint8Array(buffer, scratch.offsets[index], length);
    if (field.pointer) {
      target.set(new Uint8Array(memory.buffer, pointers[field.pointer](), length));
      continue;
    }
    const source = packed[field.name];
    if (!source) throw new Error(`published field ${field.name} has no packed record`);
    target.set(new Uint8Array(source.buffer, source.byteOffset, length));
  }
  return bytes;
}

/** Read the sim's queued-order overlay for every unit into one packed pair. */
export function readQueuedOrders(game: Game): { index: Uint32Array; orders: Float32Array } {
  const units = game.unit_count();
  const index = new Uint32Array(units + 1);
  const perUnit: Float32Array[] = [];
  let waypoints = 0;
  for (let unit = 0; unit < units; unit++) {
    const queued = game.queued_orders(unit);
    perUnit.push(queued);
    waypoints += queued.length / 3;
    index[unit + 1] = waypoints;
  }
  const orders = new Float32Array(waypoints * 3);
  let offset = 0;
  for (const queued of perUnit) {
    orders.set(queued, offset);
    offset += queued.length;
  }
  return { index, orders };
}
