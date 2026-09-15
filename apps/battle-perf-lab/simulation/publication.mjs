import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { UNIT_INFO } from "../../../packages/game-renderer/src/battle/unitInfoLayout.ts";

export const CAPACITY = 4 * 1024 * 1024;
export const EXPECTED = { 9000: "9928381812590497427", 9300: "6696754498600804919" };
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
// Cross-thread age uses one process-wide monotonic clock, not performance.timeOrigin.
export const clock = () => process.hrtime.bigint();
export async function createRun(wasmDirectory) {
  const bytes = await readFile(`${wasmDirectory}/game_wasm_bg.wasm`);
  const { default: init, Game } = await import(pathToFileURL(`${wasmDirectory}/game_wasm.js`));
  const { memory } = await init({ module_or_path: bytes });
  const game = new Game(0x5eedc0de);
  game.start_battle_generated(7n);
  game.set_ai_team(1);
  const stride = game.unit_info_stride();
  const info = new Float32Array(
    memory.buffer,
    game.unit_info_ptr(),
    game.unit_count() * stride,
  ).slice();
  const orders = [];
  for (let unit = 0; unit < game.unit_count(); unit++) {
    if (info[unit * stride + UNIT_INFO.team] !== 0) continue;
    let target = -1,
      nearest = Infinity;
    for (let enemy = 0; enemy < game.unit_count(); enemy++) {
      if (info[enemy * stride + UNIT_INFO.team] !== 1) continue;
      const distance =
        (info[unit * stride + UNIT_INFO.centerX] - info[enemy * stride + UNIT_INFO.centerX]) ** 2 +
        (info[unit * stride + UNIT_INFO.centerY] - info[enemy * stride + UNIT_INFO.centerY]) ** 2;
      if (distance < nearest) {
        nearest = distance;
        target = enemy;
      }
    }
    orders.push({ unit, target });
  }
  for (const order of orders) game.set_attack_order(order.unit, order.target);
  return { game, memory, orders, wasmSha256: digest(bytes) };
}

// Every raw input of BattleActionAdapter is retained, once per completed tick.
// ActionTimeline remains the semantic owner; this probe does not derive actions.
export function snapshot(run, tick, buffer) {
  const completedNs = clock();
  const { game: g, memory } = run,
    n = g.soldier_count(),
    p = g.projectile_count();
  const fields = [
    ["positions", Float32Array, n * 2],
    ["facings", Float32Array, n],
    ["motor_travel", Float64Array, n * 3],
    ["health", Float32Array, n],
    ["mount_health", Float32Array, n],
    ["alive", Uint8Array, n],
    ["posture", Uint8Array, n],
    ["fighting", Uint8Array, n],
    ["loosing", Float32Array, n],
    ["cur_weapon", Uint8Array, n],
    ["soldier_unit", Uint32Array, n],
    ["unit_info", Float32Array, g.unit_count() * g.unit_info_stride()],
    ...["x", "y", "z", "vx", "vy", "vz"].map((axis) => [`projectile_${axis}`, Float32Array, p]),
    ["projectile_kind", Uint8Array, p],
  ];
  let offset = 0;
  const layout = [];
  for (const [name, Type, count] of fields) {
    offset = Math.ceil(offset / Type.BYTES_PER_ELEMENT) * Type.BYTES_PER_ELEMENT;
    const length = count * Type.BYTES_PER_ELEMENT;
    if (offset + length > buffer.byteLength) throw new Error("snapshot capacity exceeded");
    new Uint8Array(buffer, offset, length).set(
      new Uint8Array(memory.buffer, g[`${name}_ptr`](), length),
    );
    layout.push({ name, offset, length });
    offset += length;
  }
  return {
    tick,
    buffer,
    layout,
    bytes: offset,
    soldiers: n,
    projectiles: p,
    units: g.unit_count(),
    stride: g.unit_info_stride(),
    victor: g.victor(),
    hash: g.state_hash().toString(),
    completedNs,
  };
}

export class CommandGate {
  next = 1;
  pending = null;
  accept(command, tick) {
    if (this.pending) throw new Error("command capacity exceeded");
    if (
      command.seq !== this.next ||
      !Number.isSafeInteger(command.tick) ||
      command.tick <= tick ||
      command.tick > tick + 32 ||
      !Number.isInteger(command.unit) ||
      !Number.isInteger(command.target)
    )
      throw new Error("invalid ordered command");
    this.pending = {
      seq: command.seq,
      tick: command.tick,
      unit: command.unit,
      target: command.target,
    };
    this.next++;
  }
  apply(game, tick) {
    if (!this.pending || this.pending.tick !== tick) return null;
    const command = this.pending;
    this.pending = null;
    if (
      command.unit < 0 ||
      command.unit >= game.unit_count() ||
      command.target < 0 ||
      command.target >= game.unit_count()
    )
      throw new Error("invalid command unit");
    game.set_attack_order(command.unit, command.target);
    return { seq: command.seq, tick, appliedNs: clock() };
  }
}
