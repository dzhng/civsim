import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { once } from "node:events";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CommandGate, CAPACITY } from "./publication.mjs";

const wasmDirectory = resolve("web/src/wasm");
test("ordered commands reject overflow, stale ticks and duplicate sequence", () => {
  const gate = new CommandGate();
  assert.throws(() => gate.accept({ seq: 1, tick: 4, unit: 0, target: 1 }, 4));
  const submitted = { seq: 1, tick: 5, unit: 0, target: 1 };
  gate.accept(submitted, 4);
  submitted.tick = 100;
  submitted.target = 0;
  assert.throws(() => gate.accept({ seq: 2, tick: 6, unit: 0, target: 1 }, 4));
  const applied = [];
  const game = {
    unit_count: () => 2,
    set_attack_order: (unit, target) => applied.push({ unit, target }),
  };
  assert.equal(gate.apply(game, 4), null);
  const ack = gate.apply(game, 5);
  assert.deepEqual({ seq: ack.seq, tick: ack.tick }, { seq: 1, tick: 5 });
  assert.deepEqual(applied, [{ unit: 0, target: 1 }]);
  assert.equal(gate.apply(game, 5), null);
  assert.throws(() => gate.accept({ seq: 1, tick: 6, unit: 0, target: 1 }, 5));
  gate.accept({ seq: 2, tick: 6, unit: 1, target: 0 }, 5);
  const second = gate.apply(game, 6);
  assert.deepEqual({ seq: second.seq, tick: second.tick }, { seq: 2, tick: 6 });
  assert.deepEqual(applied, [
    { unit: 0, target: 1 },
    { unit: 1, target: 0 },
  ]);
});

async function nextOf(worker, type) {
  for (;;) {
    const [message] = await once(worker, "message");
    if (message.type === "failure") throw new Error(message.error);
    if (message.type === type) return message;
  }
}
test(
  "worker starvation, preparation cancellation, restart and failed credits free ownership",
  { timeout: 60_000 },
  async () => {
    // Cancel before readiness. Worker can finish synchronous initialization, then frees it.
    let worker = new Worker(new URL("./worker.mjs", import.meta.url), {
      workerData: { wasmDirectory, prepareTick: 9000 },
    });
    const disposed = nextOf(worker, "disposed");
    worker.postMessage({ type: "dispose" });
    assert.equal((await disposed).liveGames, 0);
    await once(worker, "exit");
    worker = new Worker(new URL("./worker.mjs", import.meta.url), {
      workerData: { wasmDirectory, prepareTick: 9000 },
    });
    await nextOf(worker, "identity");
    const cancelledPreparation = nextOf(worker, "disposed");
    worker.postMessage({ type: "dispose" });
    const cancelled = await cancelledPreparation;
    assert(cancelled.tick >= 30 && cancelled.tick < 9000);
    assert.equal(cancelled.liveGames, 0);
    await once(worker, "exit");
    worker = new Worker(new URL("./worker.mjs", import.meta.url), {
      workerData: { wasmDirectory, prepareTick: 0 },
    });
    try {
      const state = await nextOf(worker, "snapshot");
      assert.equal(state.tick, 0);
      assert.equal(state.buffer.byteLength, CAPACITY);
      let extra = 0;
      const count = () => extra++;
      worker.on("message", count);
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(extra, 0, "starved consumer must receive no queued snapshots");
      worker.off("message", count);
      const next = nextOf(worker, "snapshot");
      worker.postMessage({ type: "credit", buffer: state.buffer }, [state.buffer]);
      assert.equal(state.buffer.byteLength, 0);
      assert.equal((await next).tick, 1);
      const failure = once(worker, "message");
      worker.postMessage({ type: "credit", buffer: new ArrayBuffer(1) }, []);
      const [message] = await failure;
      assert.equal(message.type, "failure");
      assert.match(message.error, /credit/);
      assert.equal(message.liveGames, 0);
      assert.equal(message.retainedBuffers, 0);
      await once(worker, "exit");
    } finally {
      await worker.terminate();
    }
  },
);

test(
  "CLI fails promptly when worker preparation cannot load WASM",
  { timeout: 10_000 },
  async () => {
    await assert.rejects(
      promisify(execFile)(
        process.execPath,
        [
          "apps/battle-perf-lab/simulation/probe.mjs",
          "worker",
          "throwaway/publication/no-such-wasm",
          "throwaway/publication/should-not-exist.json",
          "0",
          "8",
        ],
        { timeout: 5000 },
      ),
      (error) => {
        assert.equal(error.killed, false);
        assert.match(error.stderr, /ENOENT/);
        return true;
      },
    );
  },
);
