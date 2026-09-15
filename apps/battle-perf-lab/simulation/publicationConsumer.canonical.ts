/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
/** LAB-ONLY heavy verification, deliberately outside the fast lab suite.
 *
 * `publicationConsumer.test.ts` proves the existing `BattleActionAdapter` reads published
 * buffers over a short in-process window. This run carries the same consumer through the
 * ACTUAL worker transport (`worker.mjs`, unchanged single-credit protocol) across the
 * canonical contact window the probe already measures, ticks 9000-9308.
 *
 * Two arms, run serially, one authoritative `Game` each: the worker arm owns its `Game`
 * in the worker thread and this thread holds no `Game` at all, reading only published
 * snapshots through the disposable `snapshotReader`; the direct arm owns one `Game` here
 * and its adapter reads that live `Game` as the oracle. No second timeline, no second
 * publication protocol, and no timing or throughput claim — see the limitations recorded
 * in the report.
 *
 * Run it with the dedicated config; it prepares 9000 ticks twice and takes minutes:
 *
 *   PUBLICATION_CANONICAL_REPORT=/absolute/scratch/canonical-consumer.json \
 *     web/node_modules/.bin/vitest run --config apps/battle-perf-lab/vitest.canonical.config.mts
 */
import { writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import {
  CAPACITY,
  CommandGate,
  EXPECTED,
  createRun,
  digest,
  presentationMetadata,
  snapshot,
} from "./publication.mjs";
import { createSnapshotReader, type PublishedSnapshot } from "./snapshotReader.ts";
import {
  MARKS,
  field,
  liveProjectiles,
  observationRecord,
  publishedProjectiles,
  sha256,
} from "./publicationRecords.ts";
import { BattleActionAdapter } from "../../../web/src/battle/battleActionAdapter";
import { createBattleViews } from "../../../web/src/battle/battleViews";

const WASM_DIRECTORY = resolve("web/src/wasm");
const PREPARE_TICK = 9000;
const END_TICK = 9308;
/** The probe's canonical ordered command. Unit 0 already attacks unit 21, so this remains
 * an idempotent delivery/acknowledgement check, not a changed gameplay outcome. */
const COMMAND = { seq: 1, tick: 9301, unit: 0, target: 21 };
/** Endstate pinned by the committed canonical pair, assets/03a-publication/parity.json. */
const END_HASH = "13217042291758616190";
const STARVATION_HOLD_MS = 200;
const REPORT_CAP_BYTES = 2 * 1024 * 1024;
const MISMATCHES_RETAINED = 8;

type Row = ReturnType<typeof row>;
type Ack = { seq: number; tick: number } | null;

/** One completed tick as the consumer saw it. Correctness only: no timing field appears
 * here, and no field may differ between the arms. */
function row(
  state: PublishedSnapshot & { bytes: number; ack?: { seq: number; tick: number } | null },
  read: Parameters<typeof observationRecord>[0],
  digests: { rawSha256: string; unitInfoSha256: string; projectileSha256: string },
) {
  return {
    tick: state.tick,
    hash: state.hash,
    bytes: state.bytes,
    soldiers: state.soldiers,
    projectiles: state.projectiles,
    units: state.units,
    victor: state.victor,
    ack: (state.ack ? { seq: state.ack.seq, tick: state.ack.tick } : null) as Ack,
    ...digests,
    ...observationRecord(read),
  };
}

/** Pins every arm owes: the recorded contact-window hashes, the acknowledged command and
 * the endstate the committed canonical pair already established. */
function expectPins(rows: Row[]) {
  for (const [tick, hash] of Object.entries(EXPECTED))
    expect({ tick, hash: rows.find((entry) => entry.tick === Number(tick))?.hash }).toEqual({
      tick,
      hash,
    });
  const end = rows.at(-1)!;
  expect({ tick: end.tick, hash: end.hash }).toEqual({ tick: END_TICK, hash: END_HASH });
  expect(rows.filter((entry) => entry.ack).map((entry) => entry.ack)).toEqual([
    { seq: COMMAND.seq, tick: COMMAND.tick },
  ]);
}

/** Ticks on which each presentation branch count moved, so the window is readable as
 * something that actually changes rather than a frozen line. */
const transitions = (rows: Row[]) =>
  Object.fromEntries(
    MARKS.map((mark) => [
      mark,
      rows.filter((entry, index) => index > 0 && entry.marks[mark] !== rows[index - 1].marks[mark])
        .length,
    ]),
  );

/** One-at-a-time consumer mailbox over the existing worker messages. It queues nothing the
 * protocol does not already bound, exposes what is queued so starvation can be observed,
 * and surfaces worker failure or exit as a rejection. */
function mailbox(worker: Worker) {
  type Message = { type: string; error?: string } & Record<string, unknown>;
  type Item = { message?: Message; error?: unknown; exit?: number };
  const queue: Item[] = [];
  let waiting: ((item: Item) => void) | null = null;
  const deliver = (item: Item) => {
    if (!waiting) return void queue.push(item);
    const resolve = waiting;
    waiting = null;
    resolve(item);
  };
  worker.on("message", (message) => deliver({ message }));
  worker.on("error", (error) => deliver({ error }));
  worker.on("exit", (exit) => deliver({ exit }));
  const take = async () =>
    queue.shift() ?? (await new Promise<Item>((resolve) => (waiting = resolve)));
  return {
    get queued() {
      return queue.length;
    },
    async next(type: string) {
      const item = await take();
      if (item.error) throw item.error;
      if (item.message?.type === "failure") throw new Error(item.message.error);
      if (item.message?.type !== type)
        throw new Error(
          `expected ${type}, got ${item.exit === undefined ? item.message?.type : `exit ${item.exit}`}`,
        );
      return item.message as Message;
    },
    async exit() {
      const item = await take();
      if (item.error) throw item.error;
      if (item.exit === undefined) throw new Error(`expected exit, got ${item.message?.type}`);
      return item.exit;
    },
  };
}

let active: Worker | null = null;
afterAll(async () => {
  await active?.terminate();
});

/** The worker arm: this thread owns no `Game` and sees the battle only as published
 * snapshots, read by the existing adapter over the disposable reader. */
async function workerArm() {
  const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
    workerData: { wasmDirectory: WASM_DIRECTORY, prepareTick: PREPARE_TICK },
  });
  active = worker;
  const inbox = mailbox(worker);
  const rows: Row[] = [];
  let credits = 0;
  let maxOutstanding = 0;
  let queuedUnderStarvation = -1;
  let everyCreditDetached = true;
  try {
    const identity = await inbox.next("identity");
    // Construction metadata comes from the worker's own identity message, not from a local
    // Game: a consumer of the publication has nothing else to build the adapter from.
    const reader = createSnapshotReader({
      classSpecs: identity.classSpecs,
      releaseDuration: identity.releaseDuration,
    });
    const adapter = new BattleActionAdapter(reader.game, reader.memory);
    for (let tick = PREPARE_TICK; ; tick++) {
      const state = (await inbox.next("snapshot")) as unknown as PublishedSnapshot & {
        bytes: number;
        ack?: { seq: number; tick: number } | null;
      };
      expect(state.tick).toBe(tick);
      expect(state.bytes).toBeLessThanOrEqual(CAPACITY);
      // Everything the producer has handed over and this consumer has not yet credited.
      maxOutstanding = Math.max(maxOutstanding, 1 + inbox.queued);
      reader.adopt(state);
      const rawSha256 = digest(new Uint8Array(state.buffer, 0, state.bytes));
      if (tick === PREPARE_TICK + 1) {
        // A consumer that withholds its credit must be handed no queued snapshot, and the
        // producer must not rewrite the storage it transferred.
        await new Promise((done) => setTimeout(done, STARVATION_HOLD_MS));
        queuedUnderStarvation = inbox.queued;
        expect(digest(new Uint8Array(state.buffer, 0, state.bytes))).toBe(rawSha256);
      }
      rows.push(
        row(state, adapter.read(tick), {
          rawSha256,
          unitInfoSha256: sha256(field(state, "unit_info", Float32Array)),
          projectileSha256: sha256(...publishedProjectiles(state)),
        }),
      );
      if (tick === END_TICK) break;
      const buffer = reader.release();
      worker.postMessage(
        { type: "credit", buffer, command: tick === COMMAND.tick - 1 ? COMMAND : undefined },
        [buffer],
      );
      everyCreditDetached &&= buffer.byteLength === 0;
      credits++;
    }
    // Returning the last credit ends consumer ownership: ask the adapter for one more tick
    // and it must fail explicitly rather than read stale or detached storage.
    expect(reader.release().byteLength).toBe(CAPACITY);
    let readerHoldsNothing = false;
    try {
      adapter.read(END_TICK + 1);
    } catch (error) {
      readerHoldsNothing = /publication buffer was returned/.test(String(error));
    }
    expect(readerHoldsNothing).toBe(true);
    worker.postMessage({ type: "dispose" });
    const disposed = await inbox.next("disposed");
    const exitCode = await inbox.exit();
    return {
      identity: {
        wasmSha256: identity.wasmSha256 as string,
        orders: identity.orders as { unit: number; target: number }[],
        classSpecsSha256: digest(Buffer.from(identity.classSpecs as string)),
        releaseDuration: identity.releaseDuration as number,
      },
      classSpecs: identity.classSpecs as string,
      rows,
      resources: {
        maxOutstandingSnapshots: maxOutstanding,
        queuedUnderStarvation,
        starvationHoldMs: STARVATION_HOLD_MS,
        everyCreditDetached,
        creditsReturned: credits,
        bufferCapacityBytes: CAPACITY,
        maxSnapshotBytes: Math.max(...rows.map((entry) => entry.bytes)),
        maxLiveProjectiles: Math.max(...rows.map((entry) => entry.projectiles)),
        readerHoldsNothingAfterRelease: readerHoldsNothing,
        disposedLiveGames: disposed.liveGames as number,
        disposedRetainedBuffers: disposed.retainedBuffers as number,
        workerExitCode: exitCode,
      },
    };
  } finally {
    await worker.terminate();
    active = null;
  }
}

/** The direct arm: one authoritative `Game` in this thread, its adapter reading that live
 * `Game`. Raw unit and projectile digests come from the live records, so cross-arm equality
 * is a statement about the publication, not about a copy compared with itself. */
async function directArm(published: Row[]) {
  const run = await createRun(WASM_DIRECTORY);
  const gate = new CommandGate();
  const adapter = new BattleActionAdapter(run.game, run.memory);
  const views = createBattleViews(run.game, run.memory);
  const buffer = new ArrayBuffer(CAPACITY);
  const rows: Row[] = [];
  const mismatches: { tick: number; direct: Row; worker: Row | undefined }[] = [];
  let mismatchCount = 0;
  try {
    const identity = {
      wasmSha256: run.wasmSha256 as string,
      orders: run.orders as { unit: number; target: number }[],
      ...presentationMetadata(run.game),
    };
    for (let tick = 0; tick < PREPARE_TICK; ) {
      const count = Math.min(30, PREPARE_TICK - tick);
      run.game.advance_ticks(count);
      tick += count;
    }
    for (let tick = PREPARE_TICK; tick <= END_TICK; tick++) {
      let ack = null;
      if (tick > PREPARE_TICK) {
        // Same sequence, acceptance tick and application point as the worker arm.
        if (tick === COMMAND.tick) gate.accept(COMMAND, tick - 1);
        ack = gate.apply(run.game, tick);
        run.game.advance_ticks(1);
      }
      const state = snapshot(run, tick, buffer) as PublishedSnapshot & {
        bytes: number;
        ack?: Ack;
      };
      state.ack = ack;
      const entry = row(state, adapter.read(tick), {
        rawSha256: digest(new Uint8Array(state.buffer, 0, state.bytes)),
        unitInfoSha256: sha256(views.unitInfo()),
        projectileSha256: sha256(...liveProjectiles(run.game, run.memory)),
      });
      rows.push(entry);
      const counterpart = published[tick - PREPARE_TICK];
      if (JSON.stringify(entry) !== JSON.stringify(counterpart)) {
        mismatchCount++;
        if (mismatches.length < MISMATCHES_RETAINED)
          mismatches.push({ tick, direct: entry, worker: counterpart });
      }
    }
    return { identity, rows, mismatches, mismatchCount };
  } finally {
    run.game.free();
  }
}

test(
  "the canonical contact window reaches the existing adapter through the worker transport",
  { timeout: 90 * 60_000 },
  async () => {
    expect(
      Boolean(
        process.env.PUBLICATION_CANONICAL_REPORT &&
        isAbsolute(process.env.PUBLICATION_CANONICAL_REPORT),
      ),
      "set PUBLICATION_CANONICAL_REPORT to an absolute report path",
    ).toBe(true);
    const output = process.env.PUBLICATION_CANONICAL_REPORT!;
    const report: Record<string, unknown> = {
      kind: "cpu-publication-consumer-parity",
      complete: false,
      diagnosticOnly: true,
      node: process.version,
      wasmDirectory: WASM_DIRECTORY,
      prepareTick: PREPARE_TICK,
      endTick: END_TICK,
      command: COMMAND,
      endStateHash: END_HASH,
      consumer: "web/src/battle/battleActionAdapter.ts over the published snapshot layout",
      timings: "not measured; this run makes no timing, throughput or latency claim",
      limitations: [
        "Lab-only CPU run in Node: no browser, renderer, HUD widget, camera or input path is exercised.",
        "The ordered command repeats unit 0's existing attack order: an idempotent delivery and acknowledgement check, not a changed gameplay outcome.",
        "Presentation is not verified: BattleCrowd, interpolation endpoints, the HUD bridge and visible frames remain untested.",
        "ActionTimeline playback over this window is not exercised; the short lab checks cover one real transient on fixture battles.",
        "Bounds are on application-held buffers and messages, not WASM allocator reservation or process RSS.",
        "Single-credit backpressure deliberately stops the producer under a slow consumer; this is not a 30 Hz result.",
        "One run of one window on one host: no throughput, responsiveness or 60 fps conclusion follows.",
      ],
    };
    try {
      const worker = await workerArm();
      report.identity = { source: "worker identity message", ...worker.identity };
      report.resources = worker.resources;
      report.worker = { rows: worker.rows };
      expectPins(worker.rows);
      expect(worker.rows).toHaveLength(END_TICK - PREPARE_TICK + 1);
      expect(worker.resources.maxOutstandingSnapshots).toBe(1);
      expect(worker.resources.queuedUnderStarvation).toBe(0);
      expect(worker.resources.everyCreditDetached).toBe(true);
      expect(worker.resources.maxSnapshotBytes).toBeLessThanOrEqual(CAPACITY);
      expect(worker.resources.disposedLiveGames).toBe(0);
      expect(worker.resources.disposedRetainedBuffers).toBe(0);
      expect(worker.resources.workerExitCode).toBe(0);

      const direct = await directArm(worker.rows);
      const moved = transitions(worker.rows);
      report.direct = { rows: direct.rows };
      report.parity = {
        comparedTicks: direct.rows.length,
        mismatchedTicks: direct.mismatchCount,
        mismatches: direct.mismatches,
        identityMatches:
          direct.identity.wasmSha256 === worker.identity.wasmSha256 &&
          direct.identity.releaseDuration === worker.identity.releaseDuration &&
          direct.identity.classSpecs === worker.classSpecs &&
          JSON.stringify(direct.identity.orders) === JSON.stringify(worker.identity.orders),
        transitions: moved,
      };
      expectPins(direct.rows);
      // Actual worker identity metadata, not a locally recomputed equivalent.
      expect(direct.identity.wasmSha256).toBe(worker.identity.wasmSha256);
      expect(direct.identity.orders).toEqual(worker.identity.orders);
      expect(direct.identity.classSpecs).toBe(worker.classSpecs);
      expect(direct.identity.releaseDuration).toBe(worker.identity.releaseDuration);
      expect(direct.mismatches).toEqual([]);
      expect(direct.mismatchCount).toBe(0);
      // A window whose presentation branches never move would make parity meaningless.
      expect(Object.values(moved).reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0);
      report.complete = true;
    } finally {
      const serialized = JSON.stringify(report, null, 2);
      await writeFile(output, serialized);
      expect(serialized.length).toBeLessThan(REPORT_CAP_BYTES);
    }
  },
);
