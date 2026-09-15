/** LAB-ONLY, DISPOSABLE, SCHEDULED FOR DELETION with the rest of
 * `apps/battle-perf-lab/simulation`.
 *
 * The publication side of the observation seam: one held snapshot answered as the
 * completed-tick records `BattleActionAdapter` reads, exactly as a live `Game` answers
 * them. It owns no `Game`, never ticks and derives nothing; the layout it resolves
 * through is the one the producer wrote.
 *
 * A consumer holds one publication buffer at a time. Returning the credit ends that
 * ownership, and any further read fails explicitly rather than reading detached storage.
 */
import type {
  BattleObservationMetadata,
  BattleObservationSource,
} from "../../../web/src/battle/battleViews";
import { field, type PublishedSnapshot } from "./publicationRecords.ts";

export interface PublicationConsumer extends BattleObservationSource {
  /** Take ownership of a published snapshot, replacing any previously held one. */
  adopt(published: PublishedSnapshot): void;
  /** Return the publication buffer to its producer and retain nothing. */
  release(): ArrayBuffer;
}

export function createPublishedObservationSource(
  metadata: BattleObservationMetadata,
): PublicationConsumer {
  let held: PublishedSnapshot | null = null;
  const current = () => {
    if (!held) throw new Error("publication buffer was returned; no snapshot is held");
    return held;
  };
  return {
    metadata,
    soldiers: () => current().soldiers,
    raw() {
      const published = current();
      return {
        unitInfoStride: published.stride,
        facings: field(published, "facings", Float32Array),
        motorTravel: field(published, "motor_travel", Float64Array),
        health: field(published, "health", Float32Array),
        mountHealth: field(published, "mount_health", Float32Array),
        unitInfo: field(published, "unit_info", Float32Array),
        alive: field(published, "alive", Uint8Array),
        posture: field(published, "posture", Uint8Array),
        fighting: field(published, "fighting", Uint8Array),
        releases: field(published, "loosing", Float32Array),
        weapons: field(published, "cur_weapon", Uint8Array),
        units: field(published, "soldier_unit", Uint32Array),
      };
    },
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
