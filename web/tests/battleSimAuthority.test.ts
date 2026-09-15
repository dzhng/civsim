// @vitest-environment node
import { expect, test } from "vitest";
import { Game } from "../src/wasm/game_wasm.js";
import { localBattleSim, loadSimWasm } from "./support/localBattleSim";
import { createBattleAuthority } from "../src/battle/sim/battleAuthority";
import { createBattleGame, type BattleSimSetup } from "../src/battle/sim/battleSetup";
import type { BattleSimReply } from "../src/battle/sim/protocol";
import { BATTLE_TICK_MS, PUBLICATION_POOL } from "../src/battle/sim/simTiming";
import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import { BattleActionAdapter } from "../src/battle/battleActionAdapter";

const SANDBOX: BattleSimSetup = {
  simSeed: 0x5eedc0de,
  start: { kind: "sandbox", variant: 1 },
  aiTeams: [],
  openingOrders: "none",
};

/** Drives the authority with no consumer at all, so credit accounting is the
 * test's to withhold. */
async function manualAuthority(setup: BattleSimSetup = SANDBOX) {
  const memory = await loadSimWasm();
  const replies: BattleSimReply[] = [];
  let now = 0;
  let dueAt: number | null = null;
  const authority = createBattleAuthority({
    post: (reply) => replies.push(reply),
    now: () => now,
    schedule: (delayMs) => {
      const at = now + Math.max(0, delayMs);
      if (dueAt === null || at < dueAt) dueAt = at;
    },
    close: () => {
      dueAt = null;
    },
    load: async () => ({ game: createBattleGame(setup, memory), memory }),
  });
  const run = async () => {
    for (let round = 0; round < 200; round++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (dueAt === null || now < dueAt) return;
      dueAt = null;
      authority.pump();
    }
    throw new Error("authority did not settle");
  };
  authority.handle({ type: "start", setup, capacityHintBytes: 0 });
  await run();
  return {
    authority,
    replies,
    snapshots: () => replies.filter((reply) => reply.type === "snapshot"),
    at: (ms: number) => {
      now = ms;
    },
    run,
  };
}

test("the opening state is published before anything ticks, and nothing ticks until the shell resumes", async () => {
  const sim = await localBattleSim(SANDBOX);
  expect(sim.client.tick()).toBe(0);
  expect(sim.client.identity.units).toBeGreaterThan(0);
  expect(sim.client.unitInfo().length).toBe(sim.client.unitCount() * sim.client.stride);
  expect(sim.client.identity.terrain.tint.length).toBeGreaterThan(0);

  await sim.advance(500);
  expect(sim.client.tick(), "a held battle does not run behind the loading cover").toBe(0);

  sim.client.suspended = false;
  await sim.settle();
  const resumedAt = sim.client.tick();
  // One second of wall clock, stepped at a frame cadence that is deliberately not
  // the tick cadence: the authority still runs the unchanged 30 Hz timestep.
  for (let frame = 0; frame < 60; frame++) await sim.advance(1000 / 60);
  expect(sim.client.tick() - resumedAt).toBeGreaterThanOrEqual(29);
  expect(sim.client.tick() - resumedAt).toBeLessThanOrEqual(30);
});

test("a consumer that withholds credit stops the authority instead of queueing or dropping ticks", async () => {
  const sim = await manualAuthority();
  sim.authority.handle({ type: "control", suspended: false });
  sim.at(1000);
  await sim.run();
  const published = sim.snapshots();
  // The authority runs exactly as far ahead as it owns storage for — the opening
  // state and the pool — and then waits instead of queueing or skipping.
  expect(published.length).toBe(PUBLICATION_POOL);
  const ticks = published.map((reply) => (reply.type === "snapshot" ? reply.header.tick : -1));
  expect(ticks).toEqual([0, 1]);

  // Returning one buffer buys exactly one more tick; nothing was skipped.
  const returned = published[0];
  if (returned.type !== "snapshot") throw new Error("expected a snapshot");
  sim.authority.handle({ type: "credit", buffer: returned.buffer });
  await sim.run();
  const after = sim.snapshots();
  expect(after.length).toBe(PUBLICATION_POOL + 1);
  expect(after.at(-1)!.type === "snapshot" && after.at(-1)!.header.tick).toBe(2);
  sim.authority.handle({ type: "dispose" });
});

test("a burst of orders leaves as one ordered message and is applied before the next tick", async () => {
  const sim = await localBattleSim(SANDBOX);
  sim.client.suspended = false;
  await sim.settle();
  const tickAtSend = sim.client.tick();
  const first = sim.client.send({ kind: "pace", unit: 0, pace: 1 });
  const second = sim.client.send({ kind: "move", unit: 0, x: 10, y: 20, facing: null });
  expect(second).toBe(first + 1);
  await sim.advance(BATTLE_TICK_MS * 2);

  const commandMessages = sim.requests.filter((request) => request.type === "commands");
  expect(commandMessages.length, "one input burst is one ordered message").toBe(1);
  expect(
    commandMessages[0].type === "commands" && commandMessages[0].commands.map((c) => c.seq),
  ).toEqual([first, second]);
  const telemetry = sim.client.telemetry(sim.now);
  expect(telemetry.lastAckedSeq).toBe(second);
  expect(telemetry.commandsInFlight).toBe(0);
  // The acknowledgement names a tick the authority had already completed: the
  // order first influences the tick after it, and that tick's records show it.
  await sim.advance(BATTLE_TICK_MS);
  const info = sim.client.unitInfo();
  expect(info[UNIT_INFO.running]).toBeGreaterThan(0.5);
  expect(info[UNIT_INFO.hasTarget]).toBeGreaterThan(0.5);
  expect(sim.client.tick()).toBeGreaterThan(tickAtSend);
});

test("a scripted advance cannot overtake orders issued in the same task", async () => {
  const sim = await localBattleSim(SANDBOX);
  sim.client.suspended = false;
  await sim.settle();
  sim.client.send({ kind: "move", unit: 0, x: 120, y: 60, facing: null });
  const advanced = sim.client.advanceBy(30);
  const order = sim.requests.findIndex((request) => request.type === "commands");
  const script = sim.requests.findIndex((request) => request.type === "script");
  expect(order).toBeGreaterThanOrEqual(0);
  expect(script).toBeGreaterThan(order);
  await sim.settle();
  expect(await advanced).toBe(false);
  expect(sim.client.unitInfo()[UNIT_INFO.hasTarget]).toBeGreaterThan(0.5);
});

test("a scripted advance resolves only once its own tick has been consumed here", async () => {
  const sim = await localBattleSim(SANDBOX);
  let resolvedAtTick = -1;
  const advanced = sim.client.advanceBy(120, 30).then((cancelled) => {
    resolvedAtTick = sim.client.tick();
    return cancelled;
  });
  await sim.settle();
  expect(await advanced).toBe(false);
  expect(resolvedAtTick).toBe(120);
  expect(sim.client.tick()).toBe(120);
  const direct = new Game(SANDBOX.simSeed);
  try {
    direct.start_sandbox(1);
    direct.advance_ticks(120);
    expect(sim.client.stateHash()).toBe(direct.state_hash().toString());
  } finally {
    direct.free();
  }
});

test("cancelling a scripted advance stops it and says so", async () => {
  const sim = await localBattleSim(SANDBOX);
  let cancelled: boolean | null = null;
  const advanced = sim.client.advanceBy(6000, 30).then((result) => (cancelled = result));
  // Let the scripted run get under way, then cancel it mid-flight.
  sim.client.observe((tick) => {
    if (tick >= 120 && cancelled === null) sim.client.cancelScript();
  });
  await sim.settle();
  await advanced;
  expect(cancelled).toBe(true);
  expect(sim.client.tick()).toBeGreaterThanOrEqual(120);
  expect(sim.client.tick()).toBeLessThan(6000);
});

test("overlays are published only while a consumer is drawing them", async () => {
  const sim = await localBattleSim(SANDBOX);
  sim.client.suspended = false;
  await sim.advance(BATTLE_TICK_MS);
  expect(Array.from(sim.client.queuedOrders(0))).toEqual([]);
  // The overlay is the chain BEHIND the active order, so the unit needs one.
  sim.client.send({ kind: "move", unit: 0, x: 20, y: 5, facing: null });
  sim.client.send({ kind: "enqueue", unit: 0, mode: 0, x: 40, y: 15, facing: 0, hasFacing: 0 });
  sim.client.setOverlays({ queuedOrders: true, preview: null });
  await sim.advance(BATTLE_TICK_MS);
  expect(Array.from(sim.client.queuedOrders(0)).slice(0, 2)).toEqual([40, 15]);

  sim.client.setOverlays({
    queuedOrders: false,
    preview: { units: [0], x0: -20, y0: -20, x1: 20, y1: -20 },
  });
  await sim.advance(BATTLE_TICK_MS);
  expect(Array.from(sim.client.queuedOrders(0))).toEqual([]);
  expect(sim.client.formationPreview().length).toBeGreaterThan(0);

  sim.client.setOverlays({ queuedOrders: false, preview: null });
  await sim.advance(BATTLE_TICK_MS);
  expect(sim.client.formationPreview().length).toBe(0);
});

test("a paused battle still answers the overlay a dragging player is looking at", async () => {
  const sim = await localBattleSim(SANDBOX);
  sim.client.suspended = false;
  await sim.advance(BATTLE_TICK_MS * 3);
  sim.client.paused = true;
  await sim.advance(BATTLE_TICK_MS * 3);
  const held = sim.client.tick();
  sim.client.setOverlays({
    queuedOrders: false,
    preview: { units: [0], x0: -30, y0: 0, x1: 30, y1: 0 },
  });
  await sim.settle();
  expect(sim.client.tick(), "a paused battle does not tick to answer a preview").toBe(held);
  expect(sim.client.formationPreview().length).toBeGreaterThan(0);
});

test("the pick question is answered by the sim's own rule", async () => {
  const sim = await localBattleSim(SANDBOX);
  const info = sim.client.unitInfo();
  const stride = sim.client.stride;
  const direct = new Game(SANDBOX.simSeed);
  try {
    direct.start_sandbox(1);
    for (let unit = 0; unit < sim.client.unitCount(); unit++) {
      const x = info[unit * stride + UNIT_INFO.centerX];
      const y = info[unit * stride + UNIT_INFO.centerY];
      const answer = sim.client.pick(x, y, 30);
      await sim.settle();
      expect(await answer).toBe(direct.pick_unit(x, y, 30));
    }
    const miss = sim.client.pick(100_000, 100_000, 30);
    await sim.settle();
    expect(await miss).toBe(-1);
  } finally {
    direct.free();
  }
});

test("an out-of-sequence command fails the authority explicitly rather than applying it", async () => {
  const sim = await manualAuthority();
  sim.authority.handle({
    type: "commands",
    commands: [{ seq: 7, command: { kind: "reform", unit: 0 } }],
  });
  await sim.run();
  const failure = sim.replies.find((reply) => reply.type === "failure");
  expect(failure?.type === "failure" && failure.message).toMatch(/out of sequence/);
  expect(sim.authority.disposed).toBe(true);
});

test("a command naming a unit the battle does not have fails instead of reaching the sim", async () => {
  const sim = await manualAuthority();
  sim.authority.handle({
    type: "commands",
    commands: [{ seq: 1, command: { kind: "attack", unit: 0, target: 9999 } }],
  });
  sim.authority.handle({ type: "control", suspended: false });
  await sim.run();
  const failure = sim.replies.find((reply) => reply.type === "failure");
  expect(failure?.type === "failure" && failure.message).toMatch(/attack command names unit/);
});

test("disposal frees the one Game, keeps no publication, and ends the transport", async () => {
  const sim = await localBattleSim(SANDBOX);
  sim.client.suspended = false;
  await sim.advance(BATTLE_TICK_MS * 4);
  const pending = sim.client.pick(0, 0, 30);
  const disposed = sim.client.dispose();
  await sim.settle();
  await disposed;
  expect(await pending).toBe(-1);
  const reply = sim.replies.find((entry) => entry.type === "disposed");
  expect(reply?.type === "disposed" && reply.liveGames).toBe(0);
  expect(reply?.type === "disposed" && reply.retainedBuffers).toBe(0);
  expect(sim.workerTerminated).toBe(true);
  expect(sim.authority.disposed).toBe(true);
});

test("an authority failure reaches the scene instead of leaving it waiting", async () => {
  const sim = await localBattleSim(SANDBOX);
  const seen: unknown[] = [];
  sim.client.onFailure((error) => seen.push(error));
  sim.client.suspended = false;
  // A command the sim cannot honour is the authority's failure, not the scene's.
  sim.client.send({ kind: "files", unit: 4242, files: 3 });
  await sim.advance(BATTLE_TICK_MS);
  expect(seen.length).toBe(1);
  expect(String(seen[0])).toMatch(/battle authority failed at tick/);
});

test("publication age is measured across a real clock offset and is never clamped", async () => {
  const skewMs = 12_345;
  const sim = await localBattleSim(SANDBOX, skewMs);
  sim.client.suspended = false;
  await sim.advance(BATTLE_TICK_MS * 2);
  const telemetry = sim.client.telemetry(sim.now);
  expect(telemetry.clockOffsetMs).toBeCloseTo(skewMs, 6);
  expect(telemetry.clockOffsetUncertaintyMs).toBeGreaterThanOrEqual(0);
  // The reported age is exactly receipt minus the tick's completion translated
  // through the estimate, sign and all. Nothing is floored to a flattering number.
  const newest = sim.replies.filter((reply) => reply.type === "snapshot").at(-1)!;
  if (newest.type !== "snapshot") throw new Error("expected a snapshot");
  expect(telemetry.transportAgeMs).toBeCloseTo(
    sim.now - (newest.header.completedAtMs - telemetry.clockOffsetMs!),
    9,
  );
  expect(telemetry.publicationPool).toBe(PUBLICATION_POOL);
  expect(telemetry.workerCopyBytes).toBeGreaterThan(0);
});

test("every completed tick is consumed exactly once, in order, whatever the frame rate", async () => {
  const sim = await localBattleSim(SANDBOX);
  const seen: number[] = [];
  sim.client.observe((tick) => seen.push(tick));
  sim.client.suspended = false;
  await sim.settle();
  // One long gap with no frames at all: the consumer still sees every tick.
  await sim.advance(BATTLE_TICK_MS * 4);
  await sim.advance(BATTLE_TICK_MS * 4);
  expect(seen.length).toBeGreaterThan(0);
  expect(seen).toEqual(seen.map((_, index) => seen[0] + index));
  expect(seen.at(-1)).toBe(sim.client.tick());
});

test("a republished tick carries the accepted order without rewinding presentation", async () => {
  const sim = await localBattleSim(SANDBOX);
  sim.client.suspended = false;
  await sim.advance(BATTLE_TICK_MS * 2);
  const tick = sim.client.tick();
  // Part way into the interval the camera is interpolating through.
  sim.now += 10;
  const before = sim.client.presentationTick(sim.now);
  expect(before).toBeGreaterThan(tick - 1);
  expect(before).toBeLessThan(tick);

  const seq = sim.client.send({ kind: "pace", unit: 0, pace: 1 });
  await sim.settle();
  expect(sim.client.tick(), "an accepted order does not advance the simulation").toBe(tick);
  expect(sim.client.telemetry(sim.now).lastAckedSeq).toBe(seq);
  expect(
    sim.client.presentationTick(sim.now),
    "the camera keeps its place in the interval it was already in",
  ).toBe(before);
});

test("the newest completed tick stays derivable after its buffer has gone back", async () => {
  const sim = await localBattleSim(SANDBOX);
  sim.client.suspended = false;
  await sim.advance(BATTLE_TICK_MS * 3);
  // Nothing is held here — the producer already has its storage back — and the
  // soldier catalog can finish loading at any moment between ticks, so the
  // presentation owners must still be able to derive from the completed tick.
  const adapter = new BattleActionAdapter(sim.client.observations);
  const read = adapter.read(sim.client.tick());
  expect(read.observations.length).toBe(sim.client.soldierCount());
  expect(read.facings.length).toBe(sim.client.soldierCount());
  expect(read.observations.some((observation) => observation.alive)).toBe(true);
});
