/** The completed-tick publication layout, owned in one place so the producer that
 * writes the bytes and the consumer that reads them never describe them separately.
 *
 * A publication is ONE `ArrayBuffer` holding every raw record of ONE completed tick.
 * Offsets are derived from the counts carried in the snapshot header, so no layout
 * table is cloned per message. Ownership is exclusive: the buffer is transferred to
 * the consumer and transferred back, and neither side may read it while the other
 * holds it.
 */

export type PublicationFieldKind = "u8" | "u32" | "f32" | "f64";

const BYTES: Record<PublicationFieldKind, number> = { u8: 1, u32: 4, f32: 4, f64: 8 };

/** How many records of each kind one completed tick published. */
export interface PublicationCounts {
  soldiers: number;
  units: number;
  unitInfoStride: number;
  projectiles: number;
  /** Units covered by the queued-order index; 0 when the consumer did not ask. */
  queuedUnits: number;
  /** Queued waypoints across all units (x, y, mode each). */
  queuedWaypoints: number;
  /** Formation placements in the requested drag preview (7 floats each). */
  previewPlacements: number;
}

export interface PublicationField {
  name: string;
  kind: PublicationFieldKind;
  /** The `Game` pointer export this field is copied from, or null when the
   * producer packs the record itself from a WASM call that returns a Vec. */
  pointer: string | null;
  elements(counts: PublicationCounts): number;
}

export const PUBLICATION_FIELDS: readonly PublicationField[] = [
  { name: "positions", kind: "f32", pointer: "positions_ptr", elements: (c) => c.soldiers * 2 },
  { name: "facings", kind: "f32", pointer: "facings_ptr", elements: (c) => c.soldiers },
  {
    name: "motorTravel",
    kind: "f64",
    pointer: "motor_travel_ptr",
    elements: (c) => c.soldiers * 3,
  },
  { name: "health", kind: "f32", pointer: "health_ptr", elements: (c) => c.soldiers },
  { name: "mountHealth", kind: "f32", pointer: "mount_health_ptr", elements: (c) => c.soldiers },
  { name: "alive", kind: "u8", pointer: "alive_ptr", elements: (c) => c.soldiers },
  { name: "posture", kind: "u8", pointer: "posture_ptr", elements: (c) => c.soldiers },
  { name: "fighting", kind: "u8", pointer: "fighting_ptr", elements: (c) => c.soldiers },
  { name: "releases", kind: "f32", pointer: "loosing_ptr", elements: (c) => c.soldiers },
  { name: "weapons", kind: "u8", pointer: "cur_weapon_ptr", elements: (c) => c.soldiers },
  { name: "soldierUnit", kind: "u32", pointer: "soldier_unit_ptr", elements: (c) => c.soldiers },
  {
    name: "unitInfo",
    kind: "f32",
    pointer: "unit_info_ptr",
    elements: (c) => c.units * c.unitInfoStride,
  },
  { name: "projectileX", kind: "f32", pointer: "projectile_x_ptr", elements: (c) => c.projectiles },
  { name: "projectileY", kind: "f32", pointer: "projectile_y_ptr", elements: (c) => c.projectiles },
  { name: "projectileZ", kind: "f32", pointer: "projectile_z_ptr", elements: (c) => c.projectiles },
  {
    name: "projectileVx",
    kind: "f32",
    pointer: "projectile_vx_ptr",
    elements: (c) => c.projectiles,
  },
  {
    name: "projectileVy",
    kind: "f32",
    pointer: "projectile_vy_ptr",
    elements: (c) => c.projectiles,
  },
  {
    name: "projectileVz",
    kind: "f32",
    pointer: "projectile_vz_ptr",
    elements: (c) => c.projectiles,
  },
  {
    name: "projectileKind",
    kind: "u8",
    pointer: "projectile_kind_ptr",
    elements: (c) => c.projectiles,
  },
  // Overlay records the sim owns but exports as copies, published only for the
  // tick a consumer asked for them, so an unasked overlay costs no bytes.
  {
    name: "queuedIndex",
    kind: "u32",
    pointer: null,
    elements: (c) => (c.queuedUnits > 0 ? c.queuedUnits + 1 : 0),
  },
  { name: "queuedOrders", kind: "f32", pointer: null, elements: (c) => c.queuedWaypoints * 3 },
  {
    name: "formationPreview",
    kind: "f32",
    pointer: null,
    elements: (c) => c.previewPlacements * 7,
  },
];

export const PUBLICATION_FIELD_COUNT = PUBLICATION_FIELDS.length;

export const publicationFieldIndex = (name: string): number => {
  const index = PUBLICATION_FIELDS.findIndex((field) => field.name === name);
  if (index < 0) throw new Error(`no published field named ${name}`);
  return index;
};

/** Resolve every field's byte offset and length for these counts, writing into
 * caller-owned scratch so a steady tick rate allocates nothing. Returns the
 * total bytes the publication occupies. */
export function layoutPublication(
  counts: PublicationCounts,
  offsets: Int32Array,
  lengths: Int32Array,
): number {
  let offset = 0;
  for (let index = 0; index < PUBLICATION_FIELDS.length; index++) {
    const field = PUBLICATION_FIELDS[index];
    const size = BYTES[field.kind];
    offset = Math.ceil(offset / size) * size;
    const length = field.elements(counts) * size;
    offsets[index] = offset;
    lengths[index] = length;
    offset += length;
  }
  return offset;
}

export const newLayoutScratch = () => ({
  offsets: new Int32Array(PUBLICATION_FIELD_COUNT),
  lengths: new Int32Array(PUBLICATION_FIELD_COUNT),
});

export const publicationBytes = (counts: PublicationCounts): number =>
  layoutPublication(
    counts,
    new Int32Array(PUBLICATION_FIELD_COUNT),
    new Int32Array(PUBLICATION_FIELD_COUNT),
  );
