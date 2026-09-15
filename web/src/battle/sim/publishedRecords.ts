/** The newest completed tick, copied out of its publication.
 *
 * The publication buffer goes straight back to its producer, so what the battle
 * reads is this: one coherent set of records, every array from the same tick and
 * sized by that tick's counts. Deriving presentation is therefore not tied to
 * being inside the message callback — the adapter, the crowd, the HUD and the
 * overlays all read the same completed tick whenever they ask.
 *
 * The arrays are rewritten in place when the next tick lands, so a consumer that
 * keeps one past the frame it read it in must copy, exactly as it had to when
 * these records were views into WASM memory. */
import type {
  BattleObservationMetadata,
  BattleObservationSource,
  RawBattleObservation,
} from "../battleViews";
import type { PublicationHeader } from "./protocol";
import type { PublicationCounts } from "./publicationLayout";
import { HeldPublication, PUBLISHED_FIELD } from "./publicationReader";

export interface PublishedProjectiles {
  count: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  kind: Uint8Array;
}

const EMPTY_INDEX = new Uint32Array(0);
const EMPTY_VALUES = new Float32Array(0);

export class PublishedBattleRecords implements BattleObservationSource {
  private countsValue: PublicationCounts = {
    soldiers: 0,
    units: 0,
    unitInfoStride: 0,
    projectiles: 0,
    queuedUnits: 0,
    queuedWaypoints: 0,
    previewPlacements: 0,
  };

  positions: Float32Array = EMPTY_VALUES;
  facings: Float32Array = EMPTY_VALUES;
  motorTravel: Float64Array = new Float64Array(0);
  health: Float32Array = EMPTY_VALUES;
  mountHealth: Float32Array = EMPTY_VALUES;
  alive: Uint8Array = new Uint8Array(0);
  posture: Uint8Array = new Uint8Array(0);
  fighting: Uint8Array = new Uint8Array(0);
  releases: Float32Array = EMPTY_VALUES;
  weapons: Uint8Array = new Uint8Array(0);
  soldierUnit: Uint32Array = new Uint32Array(0);
  unitInfo: Float32Array = EMPTY_VALUES;
  projectiles: PublishedProjectiles = {
    count: 0,
    x: EMPTY_VALUES,
    y: EMPTY_VALUES,
    z: EMPTY_VALUES,
    vx: EMPTY_VALUES,
    vy: EMPTY_VALUES,
    vz: EMPTY_VALUES,
    kind: new Uint8Array(0),
  };
  queuedIndex: Uint32Array = EMPTY_INDEX;
  queuedOrders: Float32Array = EMPTY_VALUES;
  formationPreview: Float32Array = EMPTY_VALUES;

  constructor(readonly metadata: BattleObservationMetadata) {}

  get counts(): PublicationCounts {
    return this.countsValue;
  }

  soldiers(): number {
    return this.countsValue.soldiers;
  }

  raw(): RawBattleObservation {
    return {
      unitInfoStride: this.countsValue.unitInfoStride,
      facings: this.facings,
      motorTravel: this.motorTravel,
      health: this.health,
      mountHealth: this.mountHealth,
      unitInfo: this.unitInfo,
      alive: this.alive,
      posture: this.posture,
      fighting: this.fighting,
      releases: this.releases,
      weapons: this.weapons,
      units: this.soldierUnit,
    };
  }

  /** The unit's queued waypoints from the newest publication that carried them;
   * empty unless the path overlay is currently requested. */
  queuedOrdersFor(unit: number): Float32Array {
    const index = this.queuedIndex;
    if (unit < 0 || unit + 1 >= index.length) return EMPTY_VALUES;
    return this.queuedOrders.subarray(index[unit] * 3, index[unit + 1] * 3);
  }

  /** Copy one held publication in. Sized arrays are reused, so a steady battle
   * allocates nothing per tick. */
  absorb(held: HeldPublication, header: PublicationHeader): void {
    const counts = header.counts;
    this.countsValue = counts;
    const soldiers = counts.soldiers;
    this.positions = sizedF32(this.positions, soldiers * 2, held, PUBLISHED_FIELD.positions);
    this.facings = sizedF32(this.facings, soldiers, held, PUBLISHED_FIELD.facings);
    this.motorTravel = sizedF64(this.motorTravel, soldiers * 3, held, PUBLISHED_FIELD.motorTravel);
    this.health = sizedF32(this.health, soldiers, held, PUBLISHED_FIELD.health);
    this.mountHealth = sizedF32(this.mountHealth, soldiers, held, PUBLISHED_FIELD.mountHealth);
    this.alive = sizedU8(this.alive, soldiers, held, PUBLISHED_FIELD.alive);
    this.posture = sizedU8(this.posture, soldiers, held, PUBLISHED_FIELD.posture);
    this.fighting = sizedU8(this.fighting, soldiers, held, PUBLISHED_FIELD.fighting);
    this.releases = sizedF32(this.releases, soldiers, held, PUBLISHED_FIELD.releases);
    this.weapons = sizedU8(this.weapons, soldiers, held, PUBLISHED_FIELD.weapons);
    this.soldierUnit = sizedU32(this.soldierUnit, soldiers, held, PUBLISHED_FIELD.soldierUnit);
    this.unitInfo = sizedF32(
      this.unitInfo,
      counts.units * counts.unitInfoStride,
      held,
      PUBLISHED_FIELD.unitInfo,
    );
    this.absorbProjectiles(held, counts.projectiles);
    // Overlays are absent on most ticks, so they are read as fresh records rather
    // than kept as capacity nothing is using.
    this.queuedIndex =
      counts.queuedUnits > 0 ? new Uint32Array(held.u32(PUBLISHED_FIELD.queuedIndex)) : EMPTY_INDEX;
    this.queuedOrders =
      counts.queuedWaypoints > 0
        ? new Float32Array(held.f32(PUBLISHED_FIELD.queuedOrders))
        : EMPTY_VALUES;
    this.formationPreview =
      counts.previewPlacements > 0
        ? new Float32Array(held.f32(PUBLISHED_FIELD.formationPreview))
        : EMPTY_VALUES;
  }

  private absorbProjectiles(held: HeldPublication, count: number): void {
    const flying = this.projectiles;
    if (flying.x.length < count) {
      const size = Math.max(count, 64);
      this.projectiles = {
        count,
        x: new Float32Array(size),
        y: new Float32Array(size),
        z: new Float32Array(size),
        vx: new Float32Array(size),
        vy: new Float32Array(size),
        vz: new Float32Array(size),
        kind: new Uint8Array(size),
      };
    }
    const target = this.projectiles;
    target.count = count;
    if (count === 0) return;
    target.x.set(held.f32(PUBLISHED_FIELD.projectileX));
    target.y.set(held.f32(PUBLISHED_FIELD.projectileY));
    target.z.set(held.f32(PUBLISHED_FIELD.projectileZ));
    target.vx.set(held.f32(PUBLISHED_FIELD.projectileVx));
    target.vy.set(held.f32(PUBLISHED_FIELD.projectileVy));
    target.vz.set(held.f32(PUBLISHED_FIELD.projectileVz));
    target.kind.set(held.u8(PUBLISHED_FIELD.projectileKind));
  }
}

// Soldier and unit counts only grow (deaths keep their slot), so an exact-size
// array is reallocated on the rare occasions a battle actually gains men.
const sizedF32 = (current: Float32Array, length: number, held: HeldPublication, field: number) => {
  const target = current.length === length ? current : new Float32Array(length);
  target.set(held.f32(field));
  return target;
};
const sizedF64 = (current: Float64Array, length: number, held: HeldPublication, field: number) => {
  const target = current.length === length ? current : new Float64Array(length);
  target.set(held.f64(field));
  return target;
};
const sizedU8 = (current: Uint8Array, length: number, held: HeldPublication, field: number) => {
  const target = current.length === length ? current : new Uint8Array(length);
  target.set(held.u8(field));
  return target;
};
const sizedU32 = (current: Uint32Array, length: number, held: HeldPublication, field: number) => {
  const target = current.length === length ? current : new Uint32Array(length);
  target.set(held.u32(field));
  return target;
};
