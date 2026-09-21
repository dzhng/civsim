import type { Game } from "../wasm/game_wasm.js";
import { validateClassSpecCatalog, type ClassSpec } from "./classData";

/** Packed f64 record order owned by Game::motor_travel_ptr. */
export const MOTOR_TRAVEL = { x: 0, y: 1, path: 2, stride: 3 } as const;

/** Read-only by convention: each call reacquires the buffer, pointer and count.
 * Do not retain views across WASM mutations, which can relocate or detach them.
 * Health deltas aggregate injury between observations, not individual hit events;
 * reset/identity reuse requires a new baseline, and alive remains authoritative.
 */
export function createBattleViews(game: Game, memory: WebAssembly.Memory) {
  return {
    positions: () =>
      new Float32Array(memory.buffer, game.positions_ptr(), game.soldier_count() * 2),
    facings: () => new Float32Array(memory.buffer, game.facings_ptr(), game.soldier_count()),
    unitInfo: () =>
      new Float32Array(
        memory.buffer,
        game.unit_info_ptr(),
        game.unit_count() * game.unit_info_stride(),
      ),
    health: () => new Float32Array(memory.buffer, game.health_ptr(), game.soldier_count()),
    mountHealth: () =>
      new Float32Array(memory.buffer, game.mount_health_ptr(), game.soldier_count()),
    motorTravel: () =>
      new Float64Array(
        memory.buffer,
        game.motor_travel_ptr(),
        game.soldier_count() * MOTOR_TRAVEL.stride,
      ),
  };
}

/** What a battle's presentation needs once and never per tick. */
export interface BattleObservationMetadata {
  readonly classSpecs: ClassSpec[];
  readonly releaseDuration: number;
}

/** The raw soldier records of ONE completed tick, every array from that same tick and
 * sized by that tick's soldier count, which the source answers separately.
 * The views are borrowed for the read that returned them: whoever produced them may
 * rewrite, relocate or detach the storage afterwards, so copy anything you keep. */
export interface RawBattleObservation {
  readonly unitInfoStride: number;
  readonly facings: Float32Array;
  readonly motorTravel: Float64Array;
  readonly health: Float32Array;
  readonly mountHealth: Float32Array;
  readonly unitInfo: Float32Array;
  readonly alive: Uint8Array;
  /** Packed presentation-only branch outputs; bit order belongs to Game::posture_ptr. */
  readonly posture: Uint8Array;
  readonly fighting: Uint8Array;
  readonly releases: Float32Array;
  readonly weapons: Uint8Array;
  readonly units: Uint32Array;
}

/** Where completed-tick observations come from, so reading them is not the same
 * concern as owning the WASM they were computed in. `soldiers()` is the completed tick's
 * count read straight from the header its producer already owns, so a consumer can judge
 * what changed before paying to materialise records; `raw()` then answers that same
 * completed tick. A source that holds no completed tick throws from either rather than
 * answering with stale or detached records. */
export interface BattleObservationSource {
  readonly metadata: BattleObservationMetadata;
  soldiers(): number;
  raw(): RawBattleObservation;
}

/** Sole owner of metadata construction and validation, whether the class table and
 * loosing duration were read from a local `Game` or carried from its producer. */
export function battleObservationMetadata(
  classSpecs: string,
  releaseDuration: number,
): BattleObservationMetadata {
  const parsed: ClassSpec[] = JSON.parse(classSpecs);
  validateClassSpecCatalog(parsed);
  return { classSpecs: parsed, releaseDuration };
}

/** The synchronous producer: one authoritative `Game`, read in place after its tick. */
export function createLiveObservationSource(
  game: Game,
  memory: WebAssembly.Memory,
): BattleObservationSource {
  const views = createBattleViews(game, memory);
  const flags = (pointer: number, soldiers: number) =>
    new Uint8Array(memory.buffer, pointer, soldiers);
  return {
    metadata: battleObservationMetadata(game.class_specs(), game.loosing_duration()),
    soldiers: () => game.soldier_count(),
    raw() {
      const soldiers = game.soldier_count();
      return {
        unitInfoStride: game.unit_info_stride(),
        facings: views.facings(),
        motorTravel: views.motorTravel(),
        health: views.health(),
        mountHealth: views.mountHealth(),
        unitInfo: views.unitInfo(),
        alive: flags(game.alive_ptr(), soldiers),
        posture: flags(game.posture_ptr(), soldiers),
        fighting: flags(game.fighting_ptr(), soldiers),
        releases: new Float32Array(memory.buffer, game.loosing_ptr(), soldiers),
        weapons: flags(game.cur_weapon_ptr(), soldiers),
        units: new Uint32Array(memory.buffer, game.soldier_unit_ptr(), soldiers),
      };
    },
  };
}
