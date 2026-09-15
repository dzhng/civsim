import { parentPort, workerData } from "node:worker_threads";
import {
  CAPACITY,
  CommandGate,
  clock,
  createRun,
  presentationMetadata,
  snapshot,
} from "./publication.mjs";
let run,
  tick = 0,
  disposed = false,
  held = null,
  awaiting = false;
const commands = new CommandGate();
function dispose(error) {
  if (disposed) return;
  disposed = true;
  held = null;
  commands.pending = null;
  run?.game.free();
  run = null;
  parentPort.postMessage({
    type: error ? "failure" : "disposed",
    error: error?.message,
    tick,
    liveGames: 0,
    retainedBuffers: 0,
  });
  parentPort.close();
}
function publish(ack = null, tickMs = 0) {
  const began = clock();
  const state = snapshot(run, tick, held);
  state.ack = ack;
  state.tickMs = tickMs;
  state.copyMs = Number(clock() - began) / 1e6;
  held = null;
  awaiting = true;
  parentPort.postMessage({ type: "snapshot", ...state }, [state.buffer]);
}
parentPort.on("message", (message) => {
  if (disposed) return;
  try {
    if (message.type === "dispose") return dispose();
    if (
      message.type !== "credit" ||
      !awaiting ||
      !(message.buffer instanceof ArrayBuffer) ||
      message.buffer.byteLength !== CAPACITY
    )
      throw new Error("invalid or duplicate credit");
    awaiting = false;
    held = message.buffer;
    if (message.command) commands.accept(message.command, tick);
    const ack = commands.apply(run.game, tick + 1);
    const began = clock();
    run.game.advance_ticks(1);
    const tickMs = Number(clock() - began) / 1e6;
    tick++;
    publish(ack, tickMs);
  } catch (error) {
    dispose(error);
  }
});
try {
  run = await createRun(workerData.wasmDirectory);
  if (disposed) {
    run.game.free();
    run = null;
  } else {
    parentPort.postMessage({
      type: "identity",
      wasmSha256: run.wasmSha256,
      orders: run.orders,
      ...presentationMetadata(run.game),
    });
    // Yield every unchanged 30-tick preparation batch so cancellation is serviced.
    while (tick < workerData.prepareTick && !disposed) {
      const ticks = Math.min(30, workerData.prepareTick - tick);
      run.game.advance_ticks(ticks);
      tick += ticks;
      await new Promise((resolve) => setImmediate(resolve));
    }
    if (!disposed) {
      held = new ArrayBuffer(CAPACITY);
      publish();
    }
  }
} catch (error) {
  dispose(error);
}
