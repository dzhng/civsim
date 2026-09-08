# Slice 04 — Worker host, snapshot transport, hard cutover (the verdict)

## Contract unlocked

The `Game` exists only inside `sim/simWorker.ts`; the render thread only
renders; the sim holds 30 Hz on its own core; `inProcessBattleSim.ts` is
deleted in this same commit. Zero re-blessed baselines.

## API seam

- `sim/simProtocol.ts` — the message union, pure and unit-tested as a
  reducer: host → worker `start(recipe, module?) | command(cmd) |
  advance(n, id) | setRun(state, id) | hash(id) | result(id) | recycle(buffer)
  | dispose`; worker → host `started(static) | snapshot(buffer) |
  ack(id, header) | error`.
- `sim/simSnapshot.ts` — the one buffer layout from `SIM_FRAME_LAYOUT`: an
  `Int32` header `[tick, soldierCount, unitCount, projectileCount, victor,
  tickMs×1000, publishMs×1000, backlog, appliedCommandSeq]` then the
  sections sized from the counts. `pack(game, memory, buffer)` is the only
  code that knows `*_ptr()` names; `read(buffer) → SimFrame`. Every snapshot
  is self-sized, so reinforcement growth needs no relayout protocol: the pool
  allocates a bigger buffer once. If 00 chose the SharedArrayBuffer
  transport, this file owns the two slots and the sequence counter instead,
  and the host copies an acquired slot into private buffers.
- `sim/simWorker.ts` — mirrors `campaign/ai-worker.ts`: `init()`, build the
  `Game` from the recipe, read `SimStatic` once and post it, own `SimClock`
  (moved unchanged from `web/src/shared`) on the wake strategy 00 chose,
  bounded catch-up of at most 4 overdue ticks per wake (sim-tick-30k 07's
  "no death spiral"), FIFO handling in arrival order, publish after every
  tick batch and after every count-changing command even while paused,
  `advance(n)` synchronous then publish then ack, pause on a host
  `visibilitychange` message.
- `sim/simHost.ts` — implements `BattleSim` over the worker: lazily creates
  one long-lived worker for the app, `start(recipe)` replaces the `Game`
  without re-instantiating wasm, `acquire()` reads the latest snapshot and
  derives the interpolation alpha from milliseconds since the tick changed,
  request ids for `advance`/`setRun`/`hash`/`result`, recycles the previous
  buffer on arrival, rejects pending requests on dispose or worker error.
- `main.ts` builds recipes only; `BattleScene.enter()` awaits
  `sim.start(recipe)`; `scene.ts` `exit()` disposes. `battleLoop.ts` calls
  `sim.acquire()` first thing each frame; alpha as above, 0 when paused or
  frozen. The debug API stays a thin adapter over `BattleSim`.

## What the human runs and sees

`?map=gen&seed=7&ai=on` at 60 fps with the fps readout no longer dipping
when 15k men engage; DevTools shows the tick on a worker thread;
`window.__game.stats()` reports `tickHz ≈ 30` and `tickMs`. Orders land on
click.

## Verification

- `verify`, `verify:full`, genmap, campaign suites: zero re-bless (diffed
  against a main-tree run).
- `battle-perf-30k` still passes; its `p` pause maps to
  `setRun({paused:true})` and its `tickCount()` stability check holds
  because the worker stops publishing.
- `simSnapshot.test.ts`: byte-exact round trip for random frames, growth.
- `simProtocol.test.ts`: message order → applied order; publish after a
  count-changing command while paused; `advance` exact count.
- Numbers, recorded in the README ledger: 15.5k live rAF p50/p95, 30k live
  rAF p50/p95, ticks/s at 30k over 20 s, worker ms/tick, click → applied
  latency (a `commandSeq` stamped on each command and echoed in the header),
  boot-to-`__ready` delta.

## Delegated to the implementer

Pool size cap (expect it to settle at 2–3 buffers); posted `Module` vs
worker-side fetch; alpha from arrival time vs a tiny host-side accumulator;
whether `MAX_TICKS_PER_FRAME`'s value 4 stays the catch-up cap.

## Must stay green

`cargo test --workspace`; the `web` vitest suite (`simClock.test.ts`
unchanged); every campaign scene (the campaign now hands off JSON, 03).

## KILL (any one → revert 04, keep 01–03, record NO-GO next to sim-tick-30k slice 07)

- a battle or campaign baseline needs re-blessing for a reason traceable to
  the worker (determinism not proven);
- 15.5k live rAF p50 > 14 ms (under a 25% gain) or 30k live rAF p50 > 25 ms;
- ticks/s at 30k live < 28;
- click → applied latency p95 > 70 ms (one extra tick is the accepted cost,
  two is not);
- net production delta over +900 lines, or a sixth new production file, or
  any production path that ticks a `Game` on the main thread.

## Feedback that would change this slice

If the numbers land between keep and drop, that is David's call at the 05
checkpoint with the vibe of order feel; the spec does not pre-decide it.
