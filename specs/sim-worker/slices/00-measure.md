# Slice 00 — Measure before building (throwaway, ≤ half a day)

## Contract unlocked

The numbers that decide whether any of this is worth building: can a worker
tick the real 30k battle at 30 Hz while the main thread does the renderer's
paused-sim work, what does one full snapshot cost to pack and deliver, and
does the same wasm in a worker compute the same ticks.

## API seam (temporary)

- `web/src/battle/sim/spikeWorker.ts` (~80 lines, deleted at the end of this
  slice): `init()` the wasm exactly as `web/src/campaign/ai-worker.ts` does,
  `new Game(seed)`, `start_battle_generated(7)`, then the perf gate's
  `spawn_class` grid to ≥ 30,000 (copy the loop from
  `web/scenes/battle/battle-perf-30k.mjs`), then a wake loop calling
  `advance_ticks(1)` at 30 Hz. After every tick pack the frame's arrays
  (positions, facings, alive, fighting, loosing, switch_cd, soldier_unit,
  cur_weapon, unit_info, projectiles) with typed-array `.set` into one
  buffer and publish it. Publish BOTH ways, switchable by a message, so the
  transport decision is measured: (a) transfer the buffer and recycle the
  one the main thread sends back; (b) write into one half of a
  double-buffered SharedArrayBuffer behind a sequence counter.
- `Game::state_hash()` wasm export in `crates/game-wasm/src/lib.rs`
  forwarding `Sim::state_hash` (permanent; the only production change).
- A temporary `window.__game.spike(mode)` in `battleDebugApi.ts` that starts
  the worker from the live 30k battle with the main sim paused (`p`), so the
  main thread is doing exactly the gate's paused-sim render work.

## What the human runs and sees

`node web/scene.mjs battle-sim-spike` (new, tier full, hardware adapter
only): grows to 30k like the gate, pauses, starts the worker in each mode
for 20 s, and prints one table:

| mode | worker ms/tick p50 | ticks/s | pack ms p50 | delivery age p95 | main rAF p50/p95 (worker on) | main rAF p50/p95 (worker off) | boot ms | hash@600 worker | hash@600 main |

The last two columns come from `advance_ticks(600)` on a fresh `Game` in
each thread with the same spawn script.

## Verification

Hardware Chrome, quiet machine (load average under 4). Three 20 s runs per
mode; report medians of the medians. Record every number in the README
ledger even on a kill.

## Delegated to the implementer

Wake strategy in the worker (`setTimeout` to the next due tick vs a
`MessageChannel` self-post) — pick whichever holds 30 ± 0.5 ticks/s; buffer
alignment; whether the worker fetches the wasm or receives a posted
`WebAssembly.Module`.

## Must stay green

Everything: no production code changes beyond the `state_hash` export.

## KILL (any one → drop the spike, delete the branch, record the numbers next to `specs/sim-tick-30k` slice 07)

- worker ms/tick at 30k > 30 ms (cannot hold 30 Hz on its own core);
- main rAF p50 with the worker running > 21 ms against the paused-sim 17 ms
  (memory-bandwidth contention eats the gain);
- ticks/s at 30k < 28 over 20 s;
- pack + delivery > 2 ms per tick, or delivery age p95 > 66 ms, in BOTH
  transports;
- the 600-tick hash differs between worker and main (same binary, same
  seed: non-determinism we do not understand).

If exactly one transport passes, it is the one 04 builds. If both pass,
transfer wins (fewer moving parts) unless its delivery age is worse by more
than 10 ms.

## Feedback that would change this slice

If David decides a lower sim rate at 30k is acceptable product behaviour,
the ticks/s threshold drops to that rate and this rung becomes far easier to
pass; that is sim-tick-30k 07's product decision, not this spike's.
