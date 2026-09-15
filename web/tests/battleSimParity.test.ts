// @vitest-environment node
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { BattleActionAdapter } from "../src/battle/battleActionAdapter";
import { createLiveObservationSource } from "../src/battle/battleViews";
import { createBattleGame, type BattleSimSetup } from "../src/battle/sim/battleSetup";
import type { BattleCommand } from "../src/battle/sim/protocol";
import { BATTLE_TICK_MS } from "../src/battle/sim/simTiming";
import { LocalBattleSim, loadSimWasm } from "./support/localBattleSim";

const SETUP: BattleSimSetup = {
  simSeed: 0x5eedc0de,
  start: { kind: "sandbox", variant: 1 },
  aiTeams: [1],
  openingOrders: "none",
};

const WINDOW = 240;

/** Orders a player might actually give, at the moments they would give them. */
const SCRIPT: { atTick: number; command: BattleCommand }[] = [
  { atTick: 5, command: { kind: "pace", unit: 0, pace: 1 } },
  { atTick: 5, command: { kind: "attack", unit: 0, target: 1 } },
  { atTick: 40, command: { kind: "move", unit: 0, x: 30, y: 25, facing: 0.5 } },
  { atTick: 90, command: { kind: "pursue", unit: 0, on: true } },
  { atTick: 90, command: { kind: "reform", unit: 0 } },
  { atTick: 150, command: { kind: "disengage", unit: 0, x: -60, y: -40 } },
];

interface TickRecord {
  tick: number;
  stateHash: string;
  soldiers: number;
  victor: number;
  observations: string;
  facings: string;
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const digestFacings = (facings: Float32Array) =>
  createHash("sha256")
    .update(new Uint8Array(facings.buffer, facings.byteOffset, facings.byteLength))
    .digest("hex");

test("one battle, run directly and through the authority, agrees tick for tick", async () => {
  const memory = await loadSimWasm();
  const sim = new LocalBattleSim(SETUP, memory);

  // --- the scheduled arm -------------------------------------------------------
  // The consumer is attached before the opening publication, so it sees the same
  // first tick the direct arm starts from.
  const scheduled: TickRecord[] = [];
  const appliedAt = new Map<number, number>();
  const sent: { seq: number; command: BattleCommand }[] = [];
  let adapter: BattleActionAdapter | null = null;
  let pending = 0;
  sim.client.observe((tick) => {
    adapter ??= new BattleActionAdapter(sim.client.observations);
    const read = adapter.read(tick);
    scheduled.push({
      tick,
      stateHash: sim.client.stateHash(),
      soldiers: sim.client.soldierCount(),
      victor: sim.client.victor(),
      observations: digest(JSON.stringify(read.observations)),
      facings: digestFacings(read.facings),
    });
    while (pending < SCRIPT.length && SCRIPT[pending].atTick <= tick) {
      const entry = SCRIPT[pending++];
      sent.push({ seq: sim.client.send(entry.command), command: entry.command });
    }
  });
  await sim.settle();
  sim.client.suspended = false;
  await sim.settle();
  while (sim.client.tick() < WINDOW) await sim.advance(BATTLE_TICK_MS);
  // Let the last acknowledgements land before the log is treated as closed.
  await sim.advance(BATTLE_TICK_MS * 2);
  for (const reply of sim.replies)
    if (reply.type === "snapshot")
      for (const ack of reply.header.acks) appliedAt.set(ack.seq, ack.appliedTick);

  expect(sent.length).toBe(SCRIPT.length);
  expect(appliedAt.size, "every accepted command was acknowledged").toBe(SCRIPT.length);

  // --- the direct arm ----------------------------------------------------------
  // Replay the accepted log at the ticks the authority said it applied it, which
  // is the whole point of stamping an application tick on the acknowledgement.
  const game = createBattleGame(SETUP, memory);
  try {
    const direct: TickRecord[] = [];
    const directAdapter = new BattleActionAdapter(createLiveObservationSource(game, memory));
    const record = (tick: number) => {
      const read = directAdapter.read(tick);
      direct.push({
        tick,
        stateHash: game.state_hash().toString(),
        soldiers: game.soldier_count(),
        victor: game.victor(),
        observations: digest(JSON.stringify(read.observations)),
        facings: digestFacings(read.facings),
      });
    };
    // A tick is published once when it completes, and again if a command was
    // accepted into it before the next tick ran. The direct arm reproduces both:
    // the state the tick ended in, and the state after the same accepted orders.
    const afterCommands = new Map<number, TickRecord>();
    const applyAt = (tick: number) => {
      let applied = false;
      for (const entry of sent)
        if (appliedAt.get(entry.seq) === tick) {
          applyDirect(game, entry.command);
          applied = true;
        }
      if (applied) {
        record(tick);
        afterCommands.set(tick, direct.pop()!);
      }
    };
    record(0);
    applyAt(0);
    for (let tick = 1; tick <= scheduled.at(-1)!.tick; tick++) {
      game.advance_ticks(1);
      record(tick);
      applyAt(tick);
    }
    const completed = new Map(direct.map((entry) => [entry.tick, entry]));
    const seen = new Set<number>();
    for (const entry of scheduled) {
      if (!seen.has(entry.tick)) {
        seen.add(entry.tick);
        expect(completed.get(entry.tick)).toEqual(entry);
        continue;
      }
      // A republication of a tick already seen must be that tick plus exactly the
      // orders the authority acknowledged into it — never a different battle.
      expect(afterCommands.get(entry.tick)).toEqual(entry);
    }
    expect(afterCommands.size, "the script actually landed inside the window").toBeGreaterThan(0);
    // Every completed tick was seen, in order, with nothing missing in between.
    const ticks = [...new Set(scheduled.map((entry) => entry.tick))];
    expect(ticks).toEqual(ticks.map((_, index) => index));
    expect(ticks.length).toBeGreaterThan(WINDOW);
    // The window has to contain something worth comparing.
    expect(new Set(direct.map((entry) => entry.stateHash)).size).toBe(direct.length);
    expect(new Set(direct.map((entry) => entry.observations)).size).toBeGreaterThan(WINDOW / 2);
    expect(scheduled.at(-1)!.soldiers).toBeGreaterThan(0);
  } finally {
    game.free();
  }
  await sim.client.dispose();
  await sim.settle();
}, 30_000);

/** The same calls the authority makes, so the direct arm is the same battle and
 * not a second interpretation of the command vocabulary. */
function applyDirect(game: ReturnType<typeof createBattleGame>, command: BattleCommand): void {
  switch (command.kind) {
    case "pace":
      return game.set_pace(command.unit, command.pace);
    case "attack":
      return game.set_attack_order(command.unit, command.target);
    case "move":
      return command.facing === null
        ? game.set_move_order(command.unit, command.x, command.y)
        : game.set_move_order_facing(command.unit, command.x, command.y, command.facing);
    case "pursue":
      return game.set_pursue(command.unit, command.on ? 1 : 0);
    case "reform":
      return game.set_reform(command.unit);
    case "disengage":
      return game.set_disengage_order(command.unit, command.x, command.y);
    default:
      throw new Error(`the parity script does not use ${command.kind}`);
  }
}
