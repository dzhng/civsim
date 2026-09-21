/** A `BattleSimClient`-shaped reader backed by a live `Game`, for CPU tests that
 * exercise the presentation owners (adapter, timeline, crowd, orders) without
 * standing up a worker. Production reads the same records out of a publication;
 * these tests care about what the owners do with them, not how they arrived. */
import { createBattleViews, createLiveObservationSource } from "../../src/battle/battleViews";
import type { BattleSimClient } from "../../src/battle/sim/battleSimClient";
import type { BattleCommand } from "../../src/battle/sim/protocol";
import type { Game } from "../../src/wasm/game_wasm.js";

export interface LiveBattleSim {
  setTick(tick: number): void;
  /** Commands the owners issued, in order, instead of a transport. */
  readonly sent: BattleCommand[];
}

export function liveBattleSim(
  game: Game,
  memory: WebAssembly.Memory,
): BattleSimClient & LiveBattleSim {
  const views = createBattleViews(game, memory);
  const sent: BattleCommand[] = [];
  let tick = 0;
  const flags = (pointer: number) => new Uint8Array(memory.buffer, pointer, game.soldier_count());
  const sim = {
    sent,
    setTick: (value: number) => {
      tick = value;
    },
    observations: createLiveObservationSource(game, memory),
    stride: game.unit_info_stride(),
    tick: () => tick,
    hasState: () => true,
    preparing: () => false,
    unitCount: () => game.unit_count(),
    soldierCount: () => game.soldier_count(),
    projectileCount: () => game.projectile_count(),
    victor: () => game.victor(),
    stateHash: () => game.state_hash().toString(),
    unitInfo: () => views.unitInfo(),
    positions: () => views.positions(),
    alive: () => flags(game.alive_ptr()),
    soldierUnits: () =>
      new Uint32Array(memory.buffer, game.soldier_unit_ptr(), game.soldier_count()),
    weapons: () => flags(game.cur_weapon_ptr()),
    queuedOrders: (unit: number) => game.queued_orders(unit),
    formationPreview: () => new Float32Array(0),
    projectiles: () => ({
      count: 0,
      x: new Float32Array(0),
      y: new Float32Array(0),
      z: new Float32Array(0),
      vx: new Float32Array(0),
      vy: new Float32Array(0),
      vz: new Float32Array(0),
      kind: new Uint8Array(0),
    }),
    motorPath: (soldier: number) => views.motorTravel()[soldier * 3 + 2],
    setOverlays: () => {},
    send: (command: BattleCommand) => sent.push(command),
    pick: (x: number, y: number, radius: number) => Promise.resolve(game.pick_unit(x, y, radius)),
    presentationTick: () => tick,
    observe: () => () => {},
    onFailure: () => () => {},
  };
  return sim as unknown as BattleSimClient & LiveBattleSim;
}
