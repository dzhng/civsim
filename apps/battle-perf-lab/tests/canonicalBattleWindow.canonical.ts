/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
/** The heavy canonical identity gate, deliberately outside the fast lab suite.
 *
 * `web/tests/battleSimParity.test.ts` proves the mechanism over a short sandbox: a
 * battle run directly and through the authority agrees tick for tick, including the
 * commands it acknowledged. This run proves the same identity at canonical scale, on
 * the canonical battle the benchmark scenario names, across the contact window the
 * committed evidence already pins: ticks 9000 through 9308 of generated map seed 7.
 *
 * Two arms, one authoritative `Game` each. The published arm owns its `Game` behind
 * the real authority and reads only completed-tick publications; the direct arm owns
 * one `Game` here and its adapter reads it live as the oracle. No second timeline, no
 * second publication protocol, and no timing or throughput claim: every field
 * compared here is state, not cost.
 *
 * It prepares 9000 ticks twice and takes minutes. Run it with the dedicated config:
 *
 *   web/node_modules/.bin/vitest run --config apps/battle-perf-lab/vitest.canonical.config.mts
 */
import { createHash } from "node:crypto";
import { BattleActionAdapter } from "../../../web/src/battle/battleActionAdapter";
import { createLiveObservationSource } from "../../../web/src/battle/battleViews";
import { BATTLE_BENCHMARK_SCENARIO } from "../../../web/src/battle/benchmark/benchmarkScenario";
import {
  createBattleGame,
  type BattleSimSetup,
} from "../../../web/src/battle/sim/battleSetup";
import { LocalBattleSim, loadSimWasm } from "../../../web/tests/support/localBattleSim";

/** The canonical battle: the same opening the benchmark scenario names. */
const SETUP: BattleSimSetup = {
  source: "shell",
  simSeed: BATTLE_BENCHMARK_SCENARIO.simSeed,
  start: { kind: "generated", mapSeed: BATTLE_BENCHMARK_SCENARIO.mapSeed },
  aiTeams: [1],
  openingOrders: "player-nearest-enemy",
};

const PREPARE_TICK = BATTLE_BENCHMARK_SCENARIO.startTick;
const END_TICK = 9308;
const PREPARE_BATCH = 30;

/** State hashes the committed canonical evidence pins for this battle. */
const CHECKPOINTS: Record<number, string> = {
  9000: "9928381812590497427",
  9300: "6696754498600804919",
  9308: "13217042291758616190",
};

interface Row {
  tick: number;
  stateHash: string;
  soldiers: number;
  units: number;
  projectiles: number;
  victor: number;
  observations: string;
  facings: string;
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const digestBytes = (values: Float32Array) =>
  createHash("sha256")
    .update(new Uint8Array(values.buffer, values.byteOffset, values.byteLength))
    .digest("hex");

/** The test owns the clock and the timer, so a scripted advance only runs while this
 * drives it. One millisecond a round is enough to clear the authority's own retry
 * delay when it is waiting on a publication credit. */
async function drive(sim: LocalBattleSim, work: Promise<unknown>): Promise<void> {
  let finished = false;
  const settled = () => {
    finished = true;
  };
  void work.then(settled, settled);
  for (let guard = 0; !finished; guard++) {
    if (guard > 100_000) throw new Error("the canonical run stopped making progress");
    sim.now += 1;
    await sim.settle(50_000);
  }
  await work;
}

/** Branches the window has to actually move through, or agreement proves nothing. */
function marksOf(rows: Row[], moved: { fighting: number; releasing: number; dead: number }) {
  expect(new Set(rows.map((row) => row.stateHash)).size).toBe(rows.length);
  expect(new Set(rows.map((row) => row.observations)).size).toBe(rows.length);
  expect(moved.fighting, "men traded blows inside the window").toBeGreaterThan(0);
  expect(moved.releasing, "men loosed inside the window").toBeGreaterThan(0);
  expect(moved.dead, "men died inside the window").toBeGreaterThan(0);
}

test("the canonical contact window is the same battle published as run directly", async () => {
  const memory = await loadSimWasm();

  // --- the published arm: this thread owns no `Game` --------------------------
  const sim = new LocalBattleSim(SETUP, memory);
  const published = new Map<number, Row>();
  const publishedMoved = { fighting: 0, releasing: 0, dead: 0 };
  let adapter: BattleActionAdapter | null = null;
  sim.client.observe((tick) => {
    if (tick < PREPARE_TICK || published.has(tick)) return;
    adapter ??= new BattleActionAdapter(sim.client.observations);
    const read = adapter.read(tick);
    for (const observation of read.observations) {
      if (observation.fighting) publishedMoved.fighting++;
      if (observation.releaseTtl > 0) publishedMoved.releasing++;
      if (!observation.alive) publishedMoved.dead++;
    }
    published.set(tick, {
      tick,
      stateHash: sim.client.stateHash(),
      soldiers: sim.client.soldierCount(),
      units: sim.client.unitCount(),
      projectiles: sim.client.projectileCount(),
      victor: sim.client.victor(),
      observations: digest(JSON.stringify(read.observations)),
      facings: digestBytes(read.facings),
    });
  });
  await sim.settle();
  // Preparation runs in the authority's own unchanged batches and is not observed.
  await drive(sim, sim.client.advanceTo(PREPARE_TICK, PREPARE_BATCH));
  for (let tick = PREPARE_TICK + 1; tick <= END_TICK; tick++)
    await drive(sim, sim.client.advanceTo(tick, 1));
  await sim.client.dispose();
  await sim.settle();

  // --- the direct arm: one live `Game` as the oracle ---------------------------
  const game = createBattleGame(SETUP, memory);
  const direct: Row[] = [];
  const directMoved = { fighting: 0, releasing: 0, dead: 0 };
  try {
    const oracle = new BattleActionAdapter(createLiveObservationSource(game, memory));
    for (let tick = 0; tick < PREPARE_TICK; tick += PREPARE_BATCH)
      game.advance_ticks(Math.min(PREPARE_BATCH, PREPARE_TICK - tick));
    for (let tick = PREPARE_TICK; tick <= END_TICK; tick++) {
      if (tick > PREPARE_TICK) game.advance_ticks(1);
      const read = oracle.read(tick);
      for (const observation of read.observations) {
        if (observation.fighting) directMoved.fighting++;
        if (observation.releaseTtl > 0) directMoved.releasing++;
        if (!observation.alive) directMoved.dead++;
      }
      direct.push({
        tick,
        stateHash: game.state_hash().toString(),
        soldiers: game.soldier_count(),
        units: game.unit_count(),
        projectiles: game.projectile_count(),
        victor: game.victor(),
        observations: digest(JSON.stringify(read.observations)),
        facings: digestBytes(read.facings),
      });
    }
  } finally {
    game.free();
  }

  // --- identity ---------------------------------------------------------------
  expect(direct.map((row) => row.tick)).toEqual([...published.keys()].sort((a, b) => a - b));
  for (const row of direct) expect(published.get(row.tick)).toEqual(row);
  for (const [tick, hash] of Object.entries(CHECKPOINTS))
    expect(published.get(Number(tick))?.stateHash, `canonical checkpoint ${tick}`).toBe(hash);
  expect(publishedMoved).toEqual(directMoved);
  marksOf(direct, directMoved);
});
