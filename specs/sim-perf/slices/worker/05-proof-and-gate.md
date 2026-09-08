# Slice 05 — Determinism and stall proof, standing gate, keep/drop, close

## Contract unlocked

"The worker does not change what a tick computes" is a test, not a belief;
a slow tick cannot cascade into frame time; the gain is pinned by a gate the
way `battle-perf-30k` pins the renderer; the keep/drop decision is recorded
where the next reader will look.

## API seam

- `advance(n, {hash: true})` returns `stateHash` in the ack header;
  `SimCommand {kind: "debugStall", ms}` makes the worker busy-wait inside
  one tick (debug only, stripped from the union's production emitters).
- `web/scenes/battle/battle-sim-thread.mjs` (tier full, hardware only;
  SwiftShader runs it as a smoke) — the standing gate, publishing its
  numbers to `web/reports/rendering/scenario-runs/` like the 30k gate.

## Verification

- `simHost.determinism.test.ts` (node environment, instantiating the wasm
  bytes directly through the glue's `__wbg_init(module)`): for recipes
  `duel`, `sandbox 1`, `generated seed 7`, and the campaign handoff fixture,
  run the protocol reducer with a real `Game` for 600 ticks with an
  interleaved command script at two batch granularities and assert the
  `state_hash` AND the snapshot bytes equal a direct `Game` run with the
  same script applied at the same tick indices.
- Browser: `freezeAtTick(480)` twice from fresh loads gives identical
  `stateHash` and identical pixels; stall injection of 150 ms into one tick
  at 15.5k keeps main rAF p95 over the next 60 frames within +2 ms of
  baseline, worker backlog ≤ 4, tick count monotonic.
- Live gate at seed 7: 15.5k rAF p50 ≤ 12 ms, p95 ≤ 20 ms, ticks/s ≥ 29.5;
  at 30.5k live: ticks/s ≥ 29, rAF p95 ≤ 33 ms; command latency p95 ≤ 50 ms
  (one tick plus one frame).
- `cargo run --release -p sim --bin profile_tick -- duels` unchanged.

## Human review checkpoint (non-blocking)

Order feel and crowd smoothing at a true 30 Hz publish: the smoothing
constants in `battleCrowd.ts` were tuned for rAF-batched ticks. Open the
live battle and a vibe flip-book for David with preview-shots, wait about
five minutes, then decide on the evidence, record the decision in
`choices.md`, close the shots and proceed. If it reads differently, the fix
is a presentation tune in `battleCrowd`, never a sim change.

## Close

Fill the README ledger with the verdict (keep, or the NO-GO numbers);
delete the spike-only code (`debugStall` emitter, the 00 scene); run the
review skill. The worker track closes with the tick track: one close-spec
into `specs/done/sim-perf` when both have a verdict.

## KILL

Any hash mismatch between the worker path and the direct path for any
fixture, or stall injection raising main rAF p95 by more than 5 ms, or the
live gate unmet on two consecutive quiet-machine hardware runs → revert 04
and 05, keep 01–03, record NO-GO.
