import type { Game } from "../wasm/game_wasm.js";

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
  };
}
