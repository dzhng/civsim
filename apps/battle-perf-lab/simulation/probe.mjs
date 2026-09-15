import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import {
  CAPACITY,
  EXPECTED,
  CommandGate,
  clock,
  createRun,
  presentationMetadata,
  snapshot,
  digest,
} from "./publication.mjs";

const [mode, wasmArg, output, prepareArg = "9000", endArg = "9308"] = process.argv.slice(2);
const wasmDirectory = resolve(wasmArg),
  prepareTick = Number(prepareArg),
  endTick = Number(endArg);
assert(["direct", "worker"].includes(mode));
assert(Number.isInteger(prepareTick) && prepareTick >= 0 && prepareTick <= 9000);
assert(Number.isInteger(endTick) && endTick > prepareTick && endTick <= 9332);
const rows = [],
  gate = new CommandGate();
let identity,
  lastBuffer,
  started,
  sentAt = null,
  maxOutstanding = 0;
let gapTimer,
  lastDispatch,
  maxDispatchGapMs = 0;
function sampleGap() {
  const now = clock();
  maxDispatchGapMs = Math.max(maxDispatchGapMs, Number(now - lastDispatch) / 1e6);
  lastDispatch = now;
}
function startMeasurement() {
  started = clock();
  lastDispatch = started;
  gapTimer = setInterval(sampleGap, 8);
}
const commandAt = prepareTick === 9000 ? 9301 : prepareTick + 2;
const command = { seq: 1, tick: commandAt, unit: 0, target: 21 };
function record(state) {
  const received = clock();
  if (EXPECTED[state.tick]) assert.equal(state.hash, EXPECTED[state.tick]);
  const bytes = new Uint8Array(state.buffer, 0, state.bytes);
  assert(state.bytes <= CAPACITY);
  const ageMs = Number(received - state.completedNs) / 1e6;
  assert(ageMs >= 0, "monotonic clock moved backward");
  rows.push({
    tick: state.tick,
    hash: state.hash,
    observationSha256: digest(bytes),
    bytes: state.bytes,
    soldiers: state.soldiers,
    projectiles: state.projectiles,
    units: state.units,
    victor: state.victor,
    ack: state.ack ? { seq: state.ack.seq, tick: state.ack.tick } : null,
    tickMs: state.tickMs ?? 0,
    copyMs: state.copyMs ?? 0,
    ageMs,
    commandApplicationMs: state.ack ? Number(state.ack.appliedNs - sentAt) / 1e6 : null,
    commandObservationMs: state.ack ? Number(received - sentAt) / 1e6 : null,
  });
  lastBuffer = state.buffer;
}
async function ready() {
  console.error(JSON.stringify({ ready: mode, tick: prepareTick, pid: process.pid }));
  // File gate is deliberate: prepare outside the quiet measurement interval.
  if (process.env.PUBLICATION_GATE) {
    for (let tries = 0; tries < 2400; tries++) {
      try {
        await readFile(process.env.PUBLICATION_GATE);
        return;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("quiet slot gate timeout");
  }
}
if (mode === "worker") {
  const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
    workerData: { wasmDirectory, prepareTick },
  });
  await new Promise((resolveRun, reject) => {
    let handling = false;
    const watchdog = setTimeout(() => {
      worker.terminate();
      reject(new Error("probe timeout"));
    }, 20 * 60_000);
    async function fail(error) {
      clearTimeout(watchdog);
      clearInterval(gapTimer);
      reject(error);
      await worker.terminate();
    }
    worker.on("error", fail);
    worker.on("message", async (message) => {
      try {
        if (message.type === "identity") {
          identity = message;
          return;
        }
        if (message.type === "failure") throw new Error(message.error);
        if (message.type === "disposed") {
          assert.equal(message.liveGames, 0);
          assert.equal(message.retainedBuffers, 0);
          clearTimeout(watchdog);
          resolveRun();
          return;
        }
        assert.equal(message.type, "snapshot");
        assert(!handling);
        handling = true;
        maxOutstanding = Math.max(maxOutstanding, 1);
        record(message);
        if (message.tick === prepareTick) {
          await ready();
          startMeasurement();
        }
        if (message.tick === endTick) {
          lastBuffer = null;
          worker.postMessage({ type: "dispose" });
          handling = false;
          return;
        }
        // Slow consumer at one tick: one immutable retained buffer, no queued snapshots.
        if (message.tick === prepareTick + 1) {
          const before = digest(new Uint8Array(lastBuffer, 0, message.bytes));
          await new Promise((resolve) => setTimeout(resolve, 200));
          assert.equal(digest(new Uint8Array(lastBuffer, 0, message.bytes)), before);
        }
        const sendCommand = message.tick === commandAt - 1 ? command : undefined;
        if (sendCommand) sentAt = clock();
        worker.postMessage({ type: "credit", buffer: lastBuffer, command: sendCommand }, [
          lastBuffer,
        ]);
        assert.equal(lastBuffer.byteLength, 0);
        lastBuffer = null;
        handling = false;
      } catch (error) {
        await fail(error);
      }
    });
    worker.on("exit", (code) => {
      if (code !== 0) {
        clearTimeout(watchdog);
        clearInterval(gapTimer);
        reject(new Error(`worker exit ${code}`));
      }
    });
  });
} else {
  const run = await createRun(wasmDirectory);
  identity = {
    wasmSha256: run.wasmSha256,
    orders: run.orders,
    ...presentationMetadata(run.game),
  };
  try {
    for (let tick = 0; tick < prepareTick; ) {
      const count = Math.min(30, prepareTick - tick);
      run.game.advance_ticks(count);
      tick += count;
    }
    lastBuffer = new ArrayBuffer(CAPACITY);
    record(snapshot(run, prepareTick, lastBuffer));
    await ready();
    startMeasurement();
    for (let tick = prepareTick + 1; tick <= endTick; tick++) {
      if (tick === commandAt) {
        sentAt = clock();
        gate.accept(command, tick - 1);
      }
      const ack = gate.apply(run.game, tick),
        began = clock();
      run.game.advance_ticks(1);
      const tickMs = Number(clock() - began) / 1e6;
      const copyStart = clock(),
        state = snapshot(run, tick, lastBuffer);
      state.copyMs = Number(clock() - copyStart) / 1e6;
      state.tickMs = tickMs;
      state.ack = ack;
      record(state);
    }
  } finally {
    run.game.free();
    lastBuffer = null;
  }
}
sampleGap();
clearInterval(gapTimer);
const elapsedMs = Number(clock() - started) / 1e6;
const contact = rows.filter((row) => row.tick > prepareTick && row.tick <= Math.min(endTick, 9300));
const tickMs = contact.reduce((sum, row) => sum + row.tickMs, 0);
const result = {
  kind: "cpu-publication-feasibility",
  mode,
  diagnosticOnly: true,
  node: process.version,
  wasmDirectory,
  identity,
  prepareTick,
  endTick,
  command,
  elapsedMs,
  summary: {
    maxNodeDispatchGapMs: maxDispatchGapMs,
    contactTicks: contact.length,
    tickMs,
    ticksPerCpuSecond: (contact.length * 1000) / tickMs,
    copyMs: contact.reduce((sum, row) => sum + row.copyMs, 0),
    maxAgeMs: Math.max(...rows.map((row) => row.ageMs)),
    maxOutstanding,
    bufferCapacity: CAPACITY,
    slowConsumerHoldMs: mode === "worker" ? 200 : 0,
  },
  rows,
};
assert(JSON.stringify(result).length < 2 * 1024 * 1024, "report capacity exceeded");
await writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output, summary: result.summary }));
