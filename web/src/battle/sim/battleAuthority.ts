/** The battle authority: one `Game`, one tick owner, one command authority.
 *
 * It advances the unchanged kernel on the unchanged fixed timestep, applies ordered
 * commands at tick boundaries, and publishes every completed tick as one buffer it
 * hands away. It never renders, never derives presentation, and never runs a second
 * simulation. When it has no free buffer it stops ticking rather than dropping a
 * tick's observations: a consumer that cannot keep up makes the battle run slow,
 * visibly, instead of losing a death or a release nobody ever saw.
 *
 * The host supplies the clock, the timer and the channel, so this whole state
 * machine runs the same in a browser worker and in a CPU test. */
import init, { type Game } from "../../wasm/game_wasm.js";
import { createBattleGame, isGeneratedBattle, type BattleSimSetup } from "./battleSetup";
import { readStaticWorld } from "./staticWorld";
import {
  NO_OVERLAYS,
  type BattleCommand,
  type BattleSimReply,
  type BattleSimRequest,
  type CommandAck,
  type OverlayRequest,
  type PublicationHeader,
  type SequencedCommand,
} from "./protocol";
import { layoutPublication, newLayoutScratch, type PublicationCounts } from "./publicationLayout";
import {
  NO_PUBLICATION_OVERLAYS,
  publicationCounts,
  readQueuedOrders,
  writePublication,
  type PublicationOverlays,
} from "./publicationProducer";
import { BATTLE_MAX_CATCHUP_TICKS, BATTLE_TICK_MS, PUBLICATION_POOL } from "./simTiming";

export interface AuthorityHost {
  post(reply: BattleSimReply, transfer?: Transferable[]): void;
  /** Monotonic milliseconds in the authority's own clock. */
  now(): number;
  /** Ask to be pumped after at most this delay; the earliest ask wins. */
  schedule(delayMs: number): void;
  /** Called once the authority has said its last word. */
  close(): void;
  /** Loading the simulation module. Overridable so a test can hand in a Game. */
  load?(setup: BattleSimSetup): Promise<{ game: Game; memory: WebAssembly.Memory }>;
}

export interface BattleAuthority {
  handle(request: BattleSimRequest): void;
  /** Run whatever is due now. The host calls this from its timer. */
  pump(): void;
  readonly tick: number;
  readonly disposed: boolean;
}

/** A player cannot out-type this; a backlog this deep is a broken client, and
 * growing the queue instead of saying so is how a transport hides a bug. */
const COMMAND_QUEUE_LIMIT = 4096;

interface ScriptedAdvance {
  id: number;
  target: number;
  yieldBatch: number;
  cancelled: boolean;
}

export function createBattleAuthority(host: AuthorityHost): BattleAuthority {
  let memory: WebAssembly.Memory | null = null;
  let game: Game | null = null;
  let disposed = false;
  let started = false;

  let tick = 0;
  let paused = false;
  // The shell resumes the authority once the battle is actually on screen; nothing
  // ticks behind a loading cover.
  let suspended = true;
  let timeScale = 1;
  let script: ScriptedAdvance | null = null;

  const scratch = newLayoutScratch();
  let capacity = 0;
  const free: ArrayBuffer[] = [];
  let outstanding = 0;

  const commands: SequencedCommand[] = [];
  let expectedSeq = 1;
  let pendingAcks: CommandAck[] = [];

  let overlays: OverlayRequest = NO_OVERLAYS;
  let republishRequested = false;

  let nextTickAt = 0;
  let lastTickMs = 0;
  let droppedCatchupTicks = 0;
  let starvedSinceMs: number | null = null;
  let starvedMs = 0;

  const now = () => host.now();

  function teardown(): void {
    if (disposed) return;
    disposed = true;
    free.length = 0;
    commands.length = 0;
    pendingAcks = [];
    script = null;
    game?.free();
    game = null;
  }

  function fail(error: unknown): void {
    if (disposed) return;
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? (error.stack ?? null) : null;
    teardown();
    host.post({ type: "failure", message, stack, tick });
    host.close();
  }

  function dispose(): void {
    if (disposed) return;
    teardown();
    host.post({ type: "disposed", liveGames: 0, retainedBuffers: 0, tick });
    host.close();
  }

  /** Enlarge the publication capacity in place. Reinforcements and dev spawns can
   * grow a battle mid-fight; the pool stays at its fixed depth either way. */
  function ensureCapacity(bytes: number): void {
    if (bytes <= capacity) return;
    capacity = Math.ceil((bytes * 5) / 4);
    free.length = 0;
    // Outstanding buffers come back undersized and are replaced on return; the pool
    // depth, not the number of live allocations, is what bounds this.
    for (let index = 0; index < PUBLICATION_POOL - outstanding; index++)
      free.push(new ArrayBuffer(capacity));
  }

  function overlayRecords(current: Game): PublicationOverlays {
    if (!overlays.queuedOrders && !overlays.preview) return NO_PUBLICATION_OVERLAYS;
    const queued = overlays.queuedOrders ? readQueuedOrders(current) : null;
    const preview = overlays.preview;
    return {
      queuedIndex: queued?.index ?? null,
      queuedOrders: queued?.orders ?? null,
      formationPreview: preview
        ? current.formation_preview(
            new Uint32Array(preview.units),
            preview.x0,
            preview.y0,
            preview.x1,
            preview.y1,
          )
        : null,
    };
  }

  function publish(meta: {
    scriptId: number | null;
    scriptCancelled: boolean;
    preparing: boolean;
  }): void {
    const current = game;
    if (!current || !memory) return;
    const completedAtMs = now();
    const records = overlayRecords(current);
    const counts: PublicationCounts = publicationCounts(current, records);
    ensureCapacity(layoutPublication(counts, scratch.offsets, scratch.lengths));
    const buffer = free.pop();
    if (!buffer) throw new Error("publish without a free buffer");
    const copyBegan = now();
    const bytes = writePublication(current, memory, buffer, counts, scratch, records);
    const header: PublicationHeader = {
      tick,
      counts,
      bytes,
      victor: current.victor(),
      stateHash: current.state_hash().toString(),
      completedAtMs,
      postedAtMs: 0,
      tickMs: lastTickMs,
      copyMs: now() - copyBegan,
      acks: pendingAcks,
      droppedCatchupTicks,
      starvedMs,
      scriptId: meta.scriptId,
      scriptCancelled: meta.scriptCancelled,
      preparing: meta.preparing,
    };
    pendingAcks = [];
    droppedCatchupTicks = 0;
    starvedMs = 0;
    republishRequested = false;
    outstanding++;
    header.postedAtMs = now();
    host.post({ type: "snapshot", header, buffer }, [buffer]);
  }

  function applyCommand(current: Game, command: BattleCommand): void {
    const units = current.unit_count();
    const inRange = (unit: number) => Number.isInteger(unit) && unit >= 0 && unit < units;
    switch (command.kind) {
      case "attack":
        if (!inRange(command.unit) || !inRange(command.target))
          throw new Error(`attack command names unit ${command.unit} -> ${command.target}`);
        current.set_attack_order(command.unit, command.target);
        return;
      case "move":
        if (!inRange(command.unit)) throw new Error(`move command names unit ${command.unit}`);
        if (command.facing === null) current.set_move_order(command.unit, command.x, command.y);
        else current.set_move_order_facing(command.unit, command.x, command.y, command.facing);
        return;
      case "disengage":
        if (!inRange(command.unit)) throw new Error(`disengage command names unit ${command.unit}`);
        current.set_disengage_order(command.unit, command.x, command.y);
        return;
      case "attackMove":
        if (!inRange(command.unit))
          throw new Error(`attack-move command names unit ${command.unit}`);
        current.set_attack_move_order(command.unit, command.x, command.y);
        return;
      case "pace":
        if (!inRange(command.unit)) throw new Error(`pace command names unit ${command.unit}`);
        current.set_pace(command.unit, command.pace);
        return;
      case "reform":
        if (!inRange(command.unit)) throw new Error(`reform command names unit ${command.unit}`);
        current.set_reform(command.unit);
        return;
      case "pursue":
        if (!inRange(command.unit)) throw new Error(`pursue command names unit ${command.unit}`);
        current.set_pursue(command.unit, command.on ? 1 : 0);
        return;
      case "fireAtWill":
        if (!inRange(command.unit)) throw new Error(`fire command names unit ${command.unit}`);
        current.set_fire_at_will(command.unit, command.on ? 1 : 0);
        return;
      case "evadeAuto":
        if (!inRange(command.unit)) throw new Error(`kite command names unit ${command.unit}`);
        current.set_evade_auto(command.unit, command.on ? 1 : 0);
        return;
      case "files":
        if (!inRange(command.unit)) throw new Error(`files command names unit ${command.unit}`);
        current.set_files(command.unit, command.files);
        return;
      case "enqueue":
        if (!inRange(command.unit)) throw new Error(`queued command names unit ${command.unit}`);
        current.enqueue(
          command.unit,
          command.mode,
          command.x,
          command.y,
          command.facing,
          command.hasFacing,
        );
        return;
      case "formationLine":
        for (const unit of command.units)
          if (!inRange(unit)) throw new Error(`formation line names unit ${unit}`);
        current.order_formation_line(
          new Uint32Array(command.units),
          command.x0,
          command.y0,
          command.x1,
          command.y1,
          command.queued,
        );
        return;
      case "spawnUnit":
        current.spawn_unit(
          command.x,
          command.y,
          command.facing,
          command.count,
          command.files,
          1.0,
          1.2,
          command.team,
          0.7,
        );
        return;
      case "spawnClass":
        current.spawn_class(
          command.x,
          command.y,
          command.facing,
          command.count,
          command.files,
          command.classId,
          command.team,
        );
        return;
    }
  }

  /** Drain the ordered queue into the sim. Commands land between completed ticks,
   * exactly where the shell used to apply them, and acknowledge the completed tick
   * they were applied after — they first influence the tick that follows. */
  function applyCommands(): boolean {
    const current = game;
    if (!current || commands.length === 0) return false;
    for (const entry of commands) {
      applyCommand(current, entry.command);
      pendingAcks.push({ seq: entry.seq, appliedTick: tick });
    }
    commands.length = 0;
    return true;
  }

  const live = () => !paused && !suspended && script === null;

  function stepScript(): void {
    const current = game;
    const running = script;
    if (!current || !running) return;
    if (free.length === 0) {
      starvedSinceMs ??= now();
      return host.schedule(1);
    }
    if (running.cancelled || tick >= running.target) {
      script = null;
      publish({ scriptId: running.id, scriptCancelled: running.cancelled, preparing: false });
      nextTickAt = now();
      return host.schedule(0);
    }
    applyCommands();
    const batch = Math.min(running.yieldBatch, running.target - tick);
    const began = now();
    current.advance_ticks(batch);
    lastTickMs = (now() - began) / batch;
    tick += batch;
    publish({ scriptId: null, scriptCancelled: false, preparing: true });
    host.schedule(0);
  }

  /** Something a consumer is waiting on that no tick has carried yet. */
  const owes = () => republishRequested || pendingAcks.length > 0;

  function stepLive(): void {
    const current = game;
    if (!current) return;
    applyCommands();
    if (!live()) {
      nextTickAt = now();
      // A paused battle still answers the overlays a dragging player asks for, and
      // an order accepted while paused is visible before the next tick runs.
      if (owes() && free.length > 0)
        publish({ scriptId: null, scriptCancelled: false, preparing: false });
      return host.schedule(BATTLE_TICK_MS);
    }
    const period = BATTLE_TICK_MS / timeScale;
    const cap = Math.max(1, Math.floor(BATTLE_MAX_CATCHUP_TICKS * timeScale));
    let advanced = 0;
    while (now() >= nextTickAt && advanced < cap) {
      if (free.length === 0) {
        starvedSinceMs ??= now();
        break;
      }
      if (advanced > 0) applyCommands();
      const began = now();
      current.advance_ticks(1);
      lastTickMs = now() - began;
      tick++;
      nextTickAt += period;
      advanced++;
      publish({ scriptId: null, scriptCancelled: false, preparing: false });
    }
    // An accepted order that did not land on a tick this pump is still accepted:
    // republish so its acknowledgement and its effect on the unit records reach
    // the consumer now rather than whenever the next tick happens to fall.
    if (advanced === 0 && owes() && free.length > 0)
      publish({ scriptId: null, scriptCancelled: false, preparing: false });
    const lag = now() - nextTickAt;
    if (lag > period * cap) {
      // The kernel is slower than the timestep. Report the debt as abandoned rather
      // than queueing ticks the authority can never work off.
      droppedCatchupTicks += Math.floor(lag / period);
      nextTickAt = now();
    }
    host.schedule(free.length === 0 || owes() ? 1 : Math.max(0, nextTickAt - now()));
  }

  function pump(): void {
    if (disposed || !game) return;
    try {
      if (script) stepScript();
      else stepLive();
    } catch (error) {
      fail(error);
    }
  }

  function creditReturned(buffer: ArrayBuffer): void {
    if (outstanding === 0) throw new Error("credit returned with nothing outstanding");
    outstanding--;
    if (starvedSinceMs !== null) {
      starvedMs += now() - starvedSinceMs;
      starvedSinceMs = null;
    }
    if (free.length + outstanding < PUBLICATION_POOL)
      free.push(buffer.byteLength >= capacity ? buffer : new ArrayBuffer(capacity));
    host.schedule(0);
  }

  async function start(setup: BattleSimSetup, capacityHintBytes: number): Promise<void> {
    if (started) throw new Error("the authority is already started");
    started = true;
    const loaded = host.load
      ? await host.load(setup)
      : await (async () => {
          const wasm = await init();
          return { game: createBattleGame(setup, wasm.memory), memory: wasm.memory };
        })();
    if (disposed) {
      loaded.game.free();
      return;
    }
    memory = loaded.memory;
    game = loaded.game;
    capacity = 0;
    ensureCapacity(
      Math.max(
        capacityHintBytes,
        layoutPublication(publicationCounts(game), scratch.offsets, scratch.lengths),
      ),
    );
    const { identity, transfers } = readStaticWorld(
      game,
      memory,
      isGeneratedBattle(setup),
      capacity,
    );
    host.post({ type: "ready", identity }, transfers);
    // The opening deployment is a completed state the scene frames its camera and
    // static crowd from, so it is published before any tick runs.
    publish({ scriptId: null, scriptCancelled: false, preparing: false });
    nextTickAt = now() + BATTLE_TICK_MS;
    host.schedule(BATTLE_TICK_MS);
  }

  return {
    pump,
    get tick() {
      return tick;
    },
    get disposed() {
      return disposed;
    },
    handle(request: BattleSimRequest): void {
      if (disposed) return;
      try {
        switch (request.type) {
          case "start":
            void start(request.setup, request.capacityHintBytes).catch(fail);
            return;
          case "credit":
            creditReturned(request.buffer);
            return;
          case "commands": {
            if (commands.length + request.commands.length > COMMAND_QUEUE_LIMIT)
              throw new Error("command backlog exceeded");
            for (const entry of request.commands) {
              if (entry.seq !== expectedSeq)
                throw new Error(
                  `command out of sequence: expected ${expectedSeq}, got ${entry.seq}`,
                );
              expectedSeq++;
              commands.push(entry);
            }
            host.schedule(0);
            return;
          }
          case "overlays":
            overlays = request.request;
            republishRequested = true;
            host.schedule(0);
            return;
          case "control":
            if (request.paused !== undefined) paused = request.paused;
            if (request.suspended !== undefined) suspended = request.suspended;
            if (request.timeScale !== undefined) timeScale = request.timeScale;
            nextTickAt = now();
            host.schedule(0);
            return;
          case "script":
            script = {
              id: request.id,
              target: request.toTick ?? tick + request.ticks,
              yieldBatch: Math.max(1, request.yieldBatch),
              cancelled: false,
            };
            host.schedule(0);
            return;
          case "cancelScript":
            if (script) script.cancelled = true;
            host.schedule(0);
            return;
          case "pick":
            host.post({
              type: "pick",
              id: request.id,
              unit: game ? game.pick_unit(request.x, request.y, request.radius) : -1,
            });
            return;
          case "clockProbe":
            host.post({ type: "clockProbe", id: request.id, t0: request.t0, t1: now() });
            return;
          case "dispose":
            dispose();
            return;
        }
      } catch (error) {
        fail(error);
      }
    },
  };
}
