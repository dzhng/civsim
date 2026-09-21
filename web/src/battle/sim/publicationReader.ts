/** Decoding the consumer's side of a publication.
 *
 * One publication is held at a time. While it is held, every record of that one
 * completed tick is readable in place; returning it to the producer ends that
 * ownership and any further read fails explicitly instead of reading storage the
 * producer has taken back. What the battle actually reads is the copy
 * `PublishedBattleRecords` takes from here, so the buffer's tenure is as short as
 * the copy — see `publishedRecords.ts`. */
import {
  PUBLICATION_FIELD_COUNT,
  layoutPublication,
  publicationFieldIndex,
  type PublicationCounts,
} from "./publicationLayout";
import type { PublicationHeader } from "./protocol";

const FIELD = {
  positions: publicationFieldIndex("positions"),
  facings: publicationFieldIndex("facings"),
  motorTravel: publicationFieldIndex("motorTravel"),
  health: publicationFieldIndex("health"),
  mountHealth: publicationFieldIndex("mountHealth"),
  alive: publicationFieldIndex("alive"),
  posture: publicationFieldIndex("posture"),
  fighting: publicationFieldIndex("fighting"),
  releases: publicationFieldIndex("releases"),
  weapons: publicationFieldIndex("weapons"),
  soldierUnit: publicationFieldIndex("soldierUnit"),
  unitInfo: publicationFieldIndex("unitInfo"),
  projectileX: publicationFieldIndex("projectileX"),
  projectileY: publicationFieldIndex("projectileY"),
  projectileZ: publicationFieldIndex("projectileZ"),
  projectileVx: publicationFieldIndex("projectileVx"),
  projectileVy: publicationFieldIndex("projectileVy"),
  projectileVz: publicationFieldIndex("projectileVz"),
  projectileKind: publicationFieldIndex("projectileKind"),
  queuedIndex: publicationFieldIndex("queuedIndex"),
  queuedOrders: publicationFieldIndex("queuedOrders"),
  formationPreview: publicationFieldIndex("formationPreview"),
} as const;

export { FIELD as PUBLISHED_FIELD };

/** One publication, owned by this consumer until it is returned. */
export class HeldPublication {
  private readonly offsets = new Int32Array(PUBLICATION_FIELD_COUNT);
  private readonly lengths = new Int32Array(PUBLICATION_FIELD_COUNT);
  private buffer: ArrayBuffer | null = null;
  private current: PublicationHeader | null = null;

  adopt(header: PublicationHeader, buffer: ArrayBuffer): void {
    layoutPublication(header.counts, this.offsets, this.lengths);
    this.current = header;
    this.buffer = buffer;
  }

  /** Hand the storage back. The consumer retains nothing that points into it. */
  release(): ArrayBuffer {
    const buffer = this.owned();
    this.buffer = null;
    this.current = null;
    return buffer;
  }

  get held(): boolean {
    return this.buffer !== null;
  }

  get header(): PublicationHeader {
    if (!this.current) throw new Error("no publication is held");
    return this.current;
  }

  get counts(): PublicationCounts {
    return this.header.counts;
  }

  private owned(): ArrayBuffer {
    if (!this.buffer) throw new Error("publication was returned; no snapshot is held");
    return this.buffer;
  }

  f32(field: number): Float32Array {
    return new Float32Array(this.owned(), this.offsets[field], this.lengths[field] / 4);
  }
  f64(field: number): Float64Array {
    return new Float64Array(this.owned(), this.offsets[field], this.lengths[field] / 8);
  }
  u8(field: number): Uint8Array {
    return new Uint8Array(this.owned(), this.offsets[field], this.lengths[field]);
  }
  u32(field: number): Uint32Array {
    return new Uint32Array(this.owned(), this.offsets[field], this.lengths[field] / 4);
  }
}
