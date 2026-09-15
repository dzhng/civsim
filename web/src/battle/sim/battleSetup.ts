/** How a battle begins, as data rather than as an already-constructed `Game`.
 *
 * The authority now lives in a worker, so the shell can no longer hand it an
 * object: every battle entry describes its opening here and the authority builds
 * the one `Game` from that description. Seeds, map choice, armies, AI sides and
 * opening orders are exactly the calls the shell used to make itself, in the same
 * order, so a described battle and a directly constructed one are the same battle. */
import { Game } from "../../wasm/game_wasm.js";
import { benchmarkOpeningOrders } from "../benchmark/benchmarkScenario";

export type BattleMapChoice =
  | { kind: "authored"; id: number }
  /** Decimal digits of the u64 map seed: a bigint does not survive structured clone
   * as a number, and the seed is wider than Number can hold exactly. */
  | { kind: "generated"; seed: string };

export type BattleStart =
  | { kind: "duel"; a: number; b: number }
  | { kind: "sandbox"; variant: number }
  | { kind: "authored"; map: number }
  | { kind: "generated"; mapSeed: string }
  | { kind: "custom"; map: BattleMapChoice; teams: readonly (readonly number[])[] };

export interface BattleSimSetup {
  simSeed: number;
  start: BattleStart;
  /** Teams the sim commander drives. */
  aiTeams: readonly number[];
  openingOrders: "none" | "player-nearest-enemy";
}

export function isGeneratedBattle(setup: BattleSimSetup): boolean {
  const { start } = setup;
  if (start.kind === "generated") return true;
  return start.kind === "custom" && start.map.kind === "generated";
}

const seedOf = (digits: string): bigint => {
  const seed = BigInt(digits);
  return seed >= 0n ? BigInt.asUintN(64, seed) : 0n;
};

/** Build the battle this setup describes. Runs where the authority runs. */
export function createBattleGame(setup: BattleSimSetup, memory: WebAssembly.Memory): Game {
  const game = new Game(setup.simSeed);
  const { start } = setup;
  if (start.kind === "duel") game.start_duel(start.a, start.b);
  else if (start.kind === "sandbox") game.start_sandbox(start.variant);
  else if (start.kind === "authored") game.start_battle(start.map);
  else if (start.kind === "generated") game.start_battle_generated(seedOf(start.mapSeed));
  else {
    if (start.map.kind === "generated") game.load_generated_map(seedOf(start.map.seed));
    else game.load_map(start.map.id);
    start.teams.forEach((units, team) => game.deploy_custom_army(team, new Uint32Array(units)));
  }
  for (const team of setup.aiTeams) game.set_ai_team(team);
  if (setup.openingOrders === "player-nearest-enemy") {
    const stride = game.unit_info_stride();
    // Copy before issuing: every accepted order can relocate the exported view.
    const info = new Float32Array(
      memory.buffer,
      game.unit_info_ptr(),
      game.unit_count() * stride,
    ).slice();
    for (const order of benchmarkOpeningOrders(info, stride))
      game.set_attack_order(order.unit, order.target);
  }
  return game;
}
