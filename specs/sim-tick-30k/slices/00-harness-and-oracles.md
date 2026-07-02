# Slice 00 — Land the harness + the two oracles

## Contract unlocked

Every later slice can prove itself: the bench harness measures the budget, the
state-hash golden proves pure-perf purity, and the standing gate makes the
25 ms target executable instead of aspirational.

## What to do

1. **Apply [`assets/perf-instrumentation.patch`](../assets/perf-instrumentation.patch)**
   (verified: applies clean to main, full workspace suite green). It adds the
   feature-gated `perf_timing` stage profiler, the `sim_tick_30k` bench binary
   (boots the real quick-battle spawn shapes, idle + fighting fixtures), and
   stage instrumentation in collision/combat/tick. Repro commands are in
   [investigation.md](../investigation.md). Review the patch as if you wrote
   it — you own it once applied.
2. **State-hash golden harness:** a deterministic digest of full sim state
   (positions, velocities, hp/stamina/morale, RNG cursor — everything that
   feeds decisions) checkable at tick N. CLI shape:
   `sim_tick_30k --hash --seeds a,b,c --ticks 600 --scenario both` printing one
   hash per (seed, scenario). Pure-perf slices diff these before/after.
   Include a mounted/two-body unit in a hash fixture (the investigation flags
   mounted dedup as an ordering trap).
3. **Standing budget gate:** one command (script or cargo alias, e.g.
   `scripts/test-perf` sibling) that runs the fighting bench at 30k and FAILS
   if median ms/tick > 25; prints the 60k number + trend as telemetry (no
   gate). Wire it so a sim-touching pass can run it as easily as
   `scripts/test-mechanics`.

## Verification

- Patch applied; `cargo test --workspace` green; `cargo check -p sim` (default
  features) clean — zero default-build cost.
- Hash harness: same seed → same hash across two runs AND across a
  release/debug pair if feasible (catches accidental fast-math); different
  seeds → different hashes.
- Gate runs red today at 30k fighting (~50 ms > 25) — the gate being HONESTLY
  RED is this slice's proof; do not mark it expected-pass.
- Record the baseline ledger row in the README.

## Must stay green

Everything that is green today. This slice changes no behavior.
