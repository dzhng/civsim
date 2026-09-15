/** The real authority and the real client wired to each other in one process.
 *
 * Messages are structured-cloned with the same transfer list a worker would use,
 * so publication buffers genuinely detach and ownership bugs surface here rather
 * than only in a browser. The clock and the timer belong to the test: nothing
 * advances until it says so, which is what makes tick and credit accounting
 * checkable at all. */
import { readFile } from "node:fs/promises";
import initWasm from "../../src/wasm/game_wasm.js";
import { createBattleAuthority, type BattleAuthority } from "../../src/battle/sim/battleAuthority";
import { createBattleGame, type BattleSimSetup } from "../../src/battle/sim/battleSetup";
import { BattleSimClient } from "../../src/battle/sim/battleSimClient";
import type { BattleSimReply, BattleSimRequest } from "../../src/battle/sim/protocol";

let memory: WebAssembly.Memory | null = null;

export async function loadSimWasm(): Promise<WebAssembly.Memory> {
  if (!memory) {
    const wasm = await initWasm({
      module_or_path: await readFile(new URL("../../src/wasm/game_wasm_bg.wasm", import.meta.url)),
    });
    memory = wasm.memory;
  }
  return memory;
}

interface Envelope<T> {
  message: T;
  transfer: Transferable[];
}

export class LocalBattleSim {
  now = 0;
  readonly authority: BattleAuthority;
  readonly client: BattleSimClient;
  /** Every reply the client received, in order, for accounting assertions. */
  readonly replies: BattleSimReply[] = [];
  readonly requests: BattleSimRequest[] = [];
  private dueAtMs: number | null = null;
  private toClient: Envelope<BattleSimReply>[] = [];
  private toAuthority: Envelope<BattleSimRequest>[] = [];
  private onReply: (reply: BattleSimReply) => void = () => {};
  private terminated = false;

  constructor(
    setup: BattleSimSetup,
    wasmMemory: WebAssembly.Memory,
    private readonly skewMs = 0,
  ) {
    // A worker's clock has its own origin. The skew is real here so the client's
    // offset estimate has something to find instead of agreeing by construction.
    this.authority = createBattleAuthority({
      post: (message, transfer = []) => this.toClient.push({ message, transfer }),
      now: () => this.now + this.skewMs,
      schedule: (delayMs) => {
        const at = this.now + this.skewMs + Math.max(0, delayMs);
        if (this.dueAtMs === null || at < this.dueAtMs) this.dueAtMs = at;
      },
      close: () => {
        this.dueAtMs = null;
      },
      load: async () => ({ game: createBattleGame(setup, wasmMemory), memory: wasmMemory }),
    });
    this.client = new BattleSimClient(
      setup,
      {
        post: (message, transfer = []) => {
          this.requests.push(message);
          this.toAuthority.push({ message, transfer });
        },
        listen: (onReply) => {
          this.onReply = onReply;
        },
        terminate: () => {
          this.terminated = true;
        },
      },
      () => this.now,
    );
  }

  get workerTerminated(): boolean {
    return this.terminated;
  }

  /** Publications the authority has handed out and not had returned. */
  private deliver<T>(queue: Envelope<T>[], sink: (message: T) => void): boolean {
    if (queue.length === 0) return false;
    const batch = queue.splice(0);
    for (const { message, transfer } of batch) sink(structuredClone(message, { transfer }) as T);
    return true;
  }

  /** Run everything that is due at the current clock reading, to quiescence. */
  async settle(rounds = 500): Promise<void> {
    for (let round = 0; round < rounds; round++) {
      // Drain the microtasks the client schedules (command flush, pick and script
      // continuations) before deciding whether anything is still due.
      await Promise.resolve();
      await Promise.resolve();
      let progressed = false;
      if (this.dueAtMs !== null && this.now + this.skewMs >= this.dueAtMs) {
        this.dueAtMs = null;
        this.authority.pump();
        progressed = true;
      }
      if (this.deliver(this.toAuthority, (request) => this.authority.handle(request)))
        progressed = true;
      if (
        this.deliver(this.toClient, (reply) => {
          this.replies.push(reply);
          this.onReply(reply);
        })
      )
        progressed = true;
      if (!progressed) return;
    }
    throw new Error("the battle sim did not settle");
  }

  /** Move the clock forward and let everything that became due happen. */
  async advance(ms: number): Promise<void> {
    this.now += ms;
    await this.settle();
  }
}

export async function localBattleSim(setup: BattleSimSetup, skewMs = 0): Promise<LocalBattleSim> {
  const wasmMemory = await loadSimWasm();
  const sim = new LocalBattleSim(setup, wasmMemory, skewMs);
  await sim.settle();
  return sim;
}
