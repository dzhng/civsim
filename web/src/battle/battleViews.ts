import type { Game } from "../wasm/game_wasm.js";

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
