/** The main thread's half of the battle authority.
 *
 * It owns no `Game` and answers no query out of one. It holds the newest completed
 * tick, hands its raw records to the existing readers, sends ordered commands, and
 * says honestly how old the state it is showing actually is. Rendering never waits
 * on it: a frame draws whatever the last completed tick was, and a completed tick is
 * consumed the moment it arrives whether or not a frame is drawn. */
import type { BattleObservationSource } from "../battleViews";
import { battleObservationMetadata } from "../battleViews";
import type { BattleSimSetup } from "./battleSetup";
import {
  NO_OVERLAYS,
  type BattleCommand,
  type BattleSimIdentity,
  type BattleSimReply,
  type BattleSimRequest,
  type OverlayRequest,
  type PublicationHeader,
  type SequencedCommand,
} from "./protocol";
import { publicationBytes } from "./publicationLayout";
import { HeldPublication } from "./publicationReader";
import { PublishedBattleRecords, type PublishedProjectiles } from "./publishedRecords";
import { BATTLE_TICK_MS, PUBLICATION_POOL } from "./simTiming";

export type { PublishedProjectiles };

/** Honest numbers about the seam, separated by what measured them. Worker costs are
 * intervals inside the worker's own clock; ages are main-thread receipt times; the
 * transport age crosses clocks and therefore carries its estimate's uncertainty. */
export interface BattleSimTelemetry {
  tick: number;
  publishedTickHz: number;
  /** Main-clock age of the newest publication, from its receipt to now. */
  receiptAgeMs: number;
  /** Worker tick completion to main-thread receipt, through the estimated offset. */
  transportAgeMs: number | null;
  clockOffsetMs: number | null;
  clockOffsetUncertaintyMs: number | null;
  workerTickMs: number;
  workerCopyMs: number;
  workerCopyBytes: number;
  droppedCatchupTicks: number;
  starvedMs: number;
  /** How many publications the authority may have outstanding at once. */
  publicationPool: number;
  commandsInFlight: number;
  lastAckedSeq: number;
  lastSentSeq: number;
  preparing: boolean;
}

export interface BattleSimTransport {
  post(request: BattleSimRequest, transfer?: Transferable[]): void;
  listen(onReply: (reply: BattleSimReply) => void, onError: (error: unknown) => void): void;
  terminate(): void;
}

export function createWorkerTransport(): BattleSimTransport {
  const worker = new Worker(new URL("./battleSimWorker.ts", import.meta.url), {
    type: "module",
    name: "battle-sim",
  });
  return {
    post: (request, transfer) => worker.postMessage(request, transfer ?? []),
    listen(onReply, onError) {
      worker.addEventListener("message", (event) => onReply(event.data as BattleSimReply));
      worker.addEventListener("error", (event) =>
        onError(event.error ?? new Error(event.message || "battle authority worker failed")),
      );
      worker.addEventListener("messageerror", () =>
        onError(new Error("battle authority sent an uncloneable message")),
      );
    },
    terminate: () => worker.terminate(),
  };
}

const CLOCK_PROBES = 5;
const PICK_LIMIT = 64;
const DISPOSE_GRACE_MS = 2000;

export class BattleSimClient {
  readonly ready: Promise<BattleSimIdentity>;
  /** Resolves when the opening state has been published and ingested, which is
   * the first moment this thread has any battle records to build a scene from. */
  readonly firstPublication: Promise<number>;
  private resolveReady!: (identity: BattleSimIdentity) => void;
  private rejectReady!: (error: unknown) => void;
  private settledReady = false;
  private resolveFirst!: (tick: number) => void;
  private rejectFirst!: (error: unknown) => void;
  private settledFirst = false;

  private identityValue: BattleSimIdentity | null = null;
  private records: PublishedBattleRecords | null = null;
  private readonly held = new HeldPublication();

  private tickValue = -1;
  private victorValue = -1;
  private stateHashValue = "0";
  private preparingValue = false;
  private receivedAtMs = 0;
  private previousReceivedAtMs = 0;
  private publishedTickHz = 0;
  private lastHeader: PublicationHeader | null = null;

  private outbox: SequencedCommand[] = [];
  private nextSeq = 1;
  private lastSentSeq = 0;
  private lastAckedSeq = 0;
  private flushQueued = false;

  private overlays: OverlayRequest = NO_OVERLAYS;
  private pausedValue = false;
  private timeScaleValue = 1;
  // The authority does not run until the shell says the battle is ready to run:
  // nothing should tick behind a loading cover.
  private suspendedValue = true;

  private nextScriptId = 1;
  private script: { id: number; resolve(cancelled: boolean): void } | null = null;
  private nextPickId = 1;
  private readonly picks = new Map<number, (unit: number) => void>();
  private nextProbeId = 1;
  private readonly probes = new Map<number, (t1: number) => void>();
  private clockOffsetMs: number | null = null;
  private clockOffsetUncertaintyMs: number | null = null;

  private readonly observers = new Set<(tick: number) => void>();
  private readonly failureHandlers = new Set<(error: unknown) => void>();
  private failure: unknown = null;
  private disposing: Promise<void> | null = null;
  private closed = false;

  constructor(
    setup: BattleSimSetup,
    private readonly transport: BattleSimTransport = createWorkerTransport(),
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.firstPublication = new Promise((resolve, reject) => {
      this.resolveFirst = resolve;
      this.rejectFirst = reject;
    });
    // Disposal before readiness rejects; callers that never awaited readiness must
    // not turn an ordinary early exit into an unhandled rejection.
    void this.ready.catch(() => {});
    void this.firstPublication.catch(() => {});
    this.transport.listen(
      (reply) => this.receive(reply),
      (error) => this.reportFailure(error),
    );
    this.transport.post({
      type: "start",
      setup,
      capacityHintBytes: publicationBytes({
        soldiers: 12_000,
        units: 64,
        unitInfoStride: 40,
        projectiles: 2048,
        queuedUnits: 64,
        queuedWaypoints: 512,
        previewPlacements: 64,
      }),
    });
    void this.probeClocks();
  }

  // --- identity and published records -----------------------------------------

  get identity(): BattleSimIdentity {
    if (!this.identityValue) throw new Error("the battle authority is not ready yet");
    return this.identityValue;
  }

  /** The newest completed tick's raw records, readable whenever the client has
   * state — not only inside the message that delivered them. */
  get observations(): BattleObservationSource {
    if (!this.records) throw new Error("the battle authority is not ready yet");
    return this.records;
  }

  get stride(): number {
    return this.identity.unitInfoStride;
  }

  /** The newest completed tick, or -1 before the first publication. */
  tick(): number {
    return this.tickValue;
  }
  hasState(): boolean {
    return this.tickValue >= 0;
  }
  /** True while the authority is running a scripted advance, whose intermediate
   * publications are progress reports rather than ticks to animate through. */
  preparing(): boolean {
    return this.preparingValue;
  }
  victor(): number {
    return this.victorValue;
  }
  stateHash(): string {
    return this.stateHashValue;
  }
  soldierCount(): number {
    return this.records?.counts.soldiers ?? 0;
  }
  unitCount(): number {
    return this.records?.counts.units ?? 0;
  }
  projectileCount(): number {
    return this.observed.projectiles.count;
  }

  /** Records of the newest completed tick. Borrowed for the read that returned
   * them: the client rewrites them in place when the next tick lands, so a
   * consumer that keeps one past the frame it read it in must copy. */
  unitInfo(): Float32Array {
    return this.observed.unitInfo;
  }
  positions(): Float32Array {
    return this.observed.positions;
  }
  alive(): Uint8Array {
    return this.observed.alive;
  }
  soldierUnits(): Uint32Array {
    return this.observed.soldierUnit;
  }
  weapons(): Uint8Array {
    return this.observed.weapons;
  }
  projectiles(): PublishedProjectiles {
    return this.observed.projectiles;
  }
  /** Cumulative motor-capable path length, the gait diagnostic's reading. */
  motorPath(soldier: number): number {
    return this.observed.motorTravel[soldier * 3 + 2] ?? 0;
  }
  formationPreview(): Float32Array {
    return this.observed.formationPreview;
  }
  queuedOrders(unit: number): Float32Array {
    return this.observed.queuedOrdersFor(unit);
  }

  private get observed(): PublishedBattleRecords {
    if (!this.records) throw new Error("the battle authority is not ready yet");
    return this.records;
  }

  // --- frame scheduling ---------------------------------------------------------

  /** Where presentation should stand right now: one tick behind the newest
   * publication, advanced by the fraction of a tick period that has elapsed since
   * that publication arrived. It stops at the newest tick instead of extrapolating,
   * so a stalled authority freezes the pose rather than inventing motion. */
  presentationTick(nowMs: number): number {
    if (this.tickValue <= 0) return Math.max(0, this.tickValue);
    const period = BATTLE_TICK_MS / Math.max(this.timeScaleValue, 0.0001);
    const elapsed = (nowMs - this.receivedAtMs) / period;
    return this.tickValue - 1 + Math.min(1, Math.max(0, elapsed));
  }

  /** Called once per completed tick, as it arrives, before the publication is
   * returned. Consumers that must not miss a transition register here, not on the
   * frame loop, so a skipped draw never skips a death or a release. */
  observe(consumer: (tick: number) => void): () => void {
    this.observers.add(consumer);
    return () => this.observers.delete(consumer);
  }

  onFailure(handler: (error: unknown) => void): () => void {
    this.failureHandlers.add(handler);
    if (this.failure !== null) handler(this.failure);
    return () => this.failureHandlers.delete(handler);
  }

  telemetry(nowMs: number): BattleSimTelemetry {
    const header = this.lastHeader;
    const offset = this.clockOffsetMs;
    return {
      tick: this.tickValue,
      publishedTickHz: this.publishedTickHz,
      receiptAgeMs: this.tickValue < 0 ? 0 : nowMs - this.receivedAtMs,
      transportAgeMs:
        header && offset !== null ? this.receivedAtMs - (header.completedAtMs - offset) : null,
      clockOffsetMs: offset,
      clockOffsetUncertaintyMs: this.clockOffsetUncertaintyMs,
      workerTickMs: header?.tickMs ?? 0,
      workerCopyMs: header?.copyMs ?? 0,
      workerCopyBytes: header?.bytes ?? 0,
      droppedCatchupTicks: header?.droppedCatchupTicks ?? 0,
      starvedMs: header?.starvedMs ?? 0,
      publicationPool: PUBLICATION_POOL,
      commandsInFlight: this.lastSentSeq - this.lastAckedSeq + this.outbox.length,
      lastAckedSeq: this.lastAckedSeq,
      lastSentSeq: this.lastSentSeq,
      preparing: this.preparingValue,
    };
  }

  // --- commands and control -----------------------------------------------------

  /** Queue one intent. A burst issued inside one input handler leaves as one
   * ordered message, so the authority applies it in the order the player made it. */
  send(command: BattleCommand): number {
    if (this.closed) return this.lastSentSeq;
    const seq = this.nextSeq++;
    this.outbox.push({ seq, command });
    if (!this.flushQueued) {
      this.flushQueued = true;
      queueMicrotask(() => this.flushCommands());
    }
    return seq;
  }

  /** Commands must reach the authority before anything posted after them. Every
   * other request flushes first so a scripted advance can never overtake an order
   * issued in the same task. */
  private flushCommands(): void {
    this.flushQueued = false;
    if (this.closed || this.outbox.length === 0) return;
    const commands = this.outbox;
    this.outbox = [];
    this.lastSentSeq = commands[commands.length - 1].seq;
    this.transport.post({ type: "commands", commands });
  }

  private request(message: BattleSimRequest, transfer?: Transferable[]): void {
    if (this.closed) return;
    this.flushCommands();
    this.transport.post(message, transfer);
  }

  setOverlays(request: OverlayRequest): void {
    const same =
      this.overlays.queuedOrders === request.queuedOrders &&
      previewEqual(this.overlays.preview, request.preview);
    if (same) return;
    this.overlays = request;
    this.request({ type: "overlays", request });
  }

  get paused(): boolean {
    return this.pausedValue;
  }
  set paused(value: boolean) {
    if (this.pausedValue === value) return;
    this.pausedValue = value;
    this.request({ type: "control", paused: value });
  }

  get timeScale(): number {
    return this.timeScaleValue;
  }
  set timeScale(value: number) {
    if (this.timeScaleValue === value) return;
    this.timeScaleValue = value;
    this.request({ type: "control", timeScale: value });
  }

  /** A hidden tab stops the authority outright and it does not chase the hidden
   * interval on return: the battle holds where it was rather than fast-forwarding
   * through minutes of combat nobody watched. */
  get suspended(): boolean {
    return this.suspendedValue;
  }
  set suspended(value: boolean) {
    if (this.suspendedValue === value) return;
    this.suspendedValue = value;
    this.request({ type: "control", suspended: value });
  }

  /** Run ticks as fast as the kernel allows, in yielding batches, and resolve only
   * once the resulting tick has been ingested here. */
  advanceBy(ticks: number, yieldBatch = 30): Promise<boolean> {
    return this.runScript({ ticks, toTick: null, yieldBatch });
  }
  advanceTo(tick: number, yieldBatch = 30): Promise<boolean> {
    return this.runScript({ ticks: 0, toTick: tick, yieldBatch });
  }
  cancelScript(): void {
    if (this.script) this.request({ type: "cancelScript" });
  }

  private runScript(options: {
    ticks: number;
    toTick: number | null;
    yieldBatch: number;
  }): Promise<boolean> {
    if (this.script) return Promise.reject(new Error("a scripted advance is already running"));
    if (this.closed) return Promise.resolve(true);
    const id = this.nextScriptId++;
    const settled = new Promise<boolean>((resolve) => {
      this.script = { id, resolve };
    });
    this.request({ type: "script", id, ...options });
    return settled;
  }

  /** Ask the sim which unit is at a world point. The rule lives with the sim, so
   * this is a question across the transport rather than a copy of `pick_unit`
   * re-derived from published records. */
  pick(x: number, y: number, radius: number): Promise<number> {
    if (this.closed || this.picks.size >= PICK_LIMIT) return Promise.resolve(-1);
    const id = this.nextPickId++;
    return new Promise<number>((resolve) => {
      this.picks.set(id, resolve);
      this.request({ type: "pick", id, x, y, radius });
    });
  }

  // --- lifecycle ----------------------------------------------------------------

  dispose(): Promise<void> {
    if (this.disposing) return this.disposing;
    this.closed = true;
    this.outbox = [];
    for (const resolve of this.picks.values()) resolve(-1);
    this.picks.clear();
    for (const resolve of this.probes.values()) resolve(Number.NaN);
    this.probes.clear();
    this.script?.resolve(true);
    this.script = null;
    if (!this.settledReady) {
      this.settledReady = true;
      this.rejectReady(new Error("the battle authority was disposed before it was ready"));
    }
    if (!this.settledFirst) {
      this.settledFirst = true;
      this.rejectFirst(new Error("the battle authority was disposed before it published"));
    }
    this.disposing = new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.transport.terminate();
        resolve();
      };
      this.disposedHandler = done;
      const timer = setTimeout(done, DISPOSE_GRACE_MS);
      this.transport.post({ type: "dispose" });
    });
    return this.disposing;
  }

  private disposedHandler: (() => void) | null = null;

  private reportFailure(error: unknown): void {
    if (this.failure !== null) return;
    this.failure = error;
    if (!this.settledReady) {
      this.settledReady = true;
      this.rejectReady(error);
    }
    if (!this.settledFirst) {
      this.settledFirst = true;
      this.rejectFirst(error);
    }
    this.script?.resolve(true);
    this.script = null;
    for (const resolve of this.picks.values()) resolve(-1);
    this.picks.clear();
    for (const handler of this.failureHandlers) handler(error);
  }

  // --- reception ----------------------------------------------------------------

  private receive(reply: BattleSimReply): void {
    switch (reply.type) {
      case "ready": {
        this.identityValue = reply.identity;
        this.records = new PublishedBattleRecords(
          battleObservationMetadata(reply.identity.classSpecs, reply.identity.releaseDuration),
        );
        this.stateHashValue = reply.identity.initialStateHash;
        if (!this.settledReady) {
          this.settledReady = true;
          this.resolveReady(reply.identity);
        }
        return;
      }
      case "snapshot":
        this.ingest(reply.header, reply.buffer);
        return;
      case "pick": {
        const resolve = this.picks.get(reply.id);
        this.picks.delete(reply.id);
        resolve?.(reply.unit);
        return;
      }
      case "clockProbe": {
        const resolve = this.probes.get(reply.id);
        this.probes.delete(reply.id);
        resolve?.(reply.t1);
        return;
      }
      case "failure":
        this.reportFailure(decorate(reply.message, reply.stack, reply.tick));
        return;
      case "disposed":
        this.disposedHandler?.();
        this.disposedHandler = null;
        return;
    }
  }

  private ingest(header: PublicationHeader, buffer: ArrayBuffer): void {
    if (this.closed) return;
    let consumerError: unknown = null;
    try {
      this.held.adopt(header, buffer);
      this.observed.absorb(this.held, header);
      // A republication of a tick already shown carries accepted orders, not a new
      // tick: it must not restart the interpolation the camera is already part way
      // through, so only an advancing tick moves the presentation clock.
      const advanced = header.tick > this.tickValue;
      if (advanced) {
        this.previousReceivedAtMs = this.receivedAtMs;
        this.receivedAtMs = this.clock();
        if (this.tickValue >= 0) {
          const interval = this.receivedAtMs - this.previousReceivedAtMs;
          const rate = interval > 0 ? (header.tick - this.tickValue) / (interval / 1000) : 0;
          this.publishedTickHz = this.publishedTickHz
            ? this.publishedTickHz + (rate - this.publishedTickHz) * 0.1
            : rate;
        }
      }
      this.tickValue = header.tick;
      this.victorValue = header.victor;
      this.stateHashValue = header.stateHash;
      this.preparingValue = header.preparing;
      this.lastHeader = header;
      for (const ack of header.acks) this.lastAckedSeq = Math.max(this.lastAckedSeq, ack.seq);
      if (!this.settledFirst) {
        this.settledFirst = true;
        this.receivedAtMs = this.clock();
        this.resolveFirst(header.tick);
      }
      for (const consumer of this.observers) consumer(header.tick);
    } catch (error) {
      consumerError = error;
    } finally {
      // The producer gets its storage back whatever the consumers did with it.
      const returned = this.held.held ? this.held.release() : buffer;
      if (!this.closed) this.transport.post({ type: "credit", buffer: returned }, [returned]);
    }
    if (header.scriptId !== null && this.script?.id === header.scriptId) {
      const script = this.script;
      this.script = null;
      script.resolve(header.scriptCancelled);
    }
    if (consumerError !== null) this.reportFailure(consumerError);
  }

  /** Worker and window clocks do not share an origin, so the offset is measured
   * rather than assumed, and its uncertainty is reported with it. Nothing derived
   * from it is clamped: an age that comes out negative means the estimate is worse
   * than the age, and hiding that would manufacture a result. */
  private async probeClocks(): Promise<void> {
    let bestRoundTrip = Infinity;
    for (let probe = 0; probe < CLOCK_PROBES && !this.closed; probe++) {
      const id = this.nextProbeId++;
      const t0 = this.clock();
      const t1 = await new Promise<number>((resolve) => {
        this.probes.set(id, resolve);
        this.transport.post({ type: "clockProbe", id, t0 });
      });
      if (!Number.isFinite(t1)) return;
      const t2 = this.clock();
      const roundTrip = t2 - t0;
      if (roundTrip < bestRoundTrip) {
        bestRoundTrip = roundTrip;
        this.clockOffsetMs = t1 - (t0 + t2) / 2;
        this.clockOffsetUncertaintyMs = roundTrip / 2;
      }
    }
  }
}

const previewEqual = (a: OverlayRequest["preview"], b: OverlayRequest["preview"]): boolean => {
  if (a === null || b === null) return a === b;
  return (
    a.x0 === b.x0 &&
    a.y0 === b.y0 &&
    a.x1 === b.x1 &&
    a.y1 === b.y1 &&
    a.units.length === b.units.length &&
    a.units.every((unit, index) => unit === b.units[index])
  );
};

function decorate(message: string, stack: string | null, tick: number): Error {
  const error = new Error(`battle authority failed at tick ${tick}: ${message}`);
  if (stack) error.stack = `${error.stack}\nCaused by worker:\n${stack}`;
  return error;
}
