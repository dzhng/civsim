// The campaign AI worker. It holds its own wasm instance and the (static) map;
// on each posted state snapshot it loads a throwaway Campaign, computes every
// campaigning faction's decision, and posts the result back. Running here keeps
// the rollouts off the render thread. Determinism is the host's job: it applies
// these decisions on a fixed tick (apply_at), so however long this takes only
// ever makes the host wait, never changes the game.
import init, { Campaign } from "../wasm/game_wasm.js";

type InitMsg = { type: "init"; mapJson: string };
type SnapshotMsg = { type: "snapshot"; applyAt: number; snap: string };
type InMsg = InitMsg | SnapshotMsg;

let mapJson: string | null = null;
let ready = false;
const backlog: SnapshotMsg[] = [];

function handle(msg: SnapshotMsg) {
  if (!ready || mapJson === null) {
    backlog.push(msg);
    return;
  }
  const c = Campaign.load(mapJson, msg.snap);
  if (!c) return; // a malformed snapshot just produces no orders
  const json = c.commander_decisions_json();
  c.free();
  postMessage({ applyAt: msg.applyAt, json });
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === "init") {
    await init();
    mapJson = msg.mapJson;
    ready = true;
    for (const m of backlog.splice(0)) handle(m);
    return;
  }
  handle(msg);
};
