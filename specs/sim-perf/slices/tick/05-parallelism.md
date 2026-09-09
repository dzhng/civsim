# tick/05 — Deterministic in-tick parallelism (LAST perf lever)

## Contract unlocked

Multi-core tick: steering, body scans and combat target scans partitioned
across threads — natively with rayon first — WITHOUT breaking seed-stable
determinism.

## Why last (locked ordering)

Parallelizing duplicated work wastes the win (July recommendation 6): tick/01
and tick/02 first. Determinism is the hard part, not the threading:
ordering, floating-point accumulation order, RNG consumption, staged write
conflicts.

## Approach guardrails

- Fixed-chunk partitioning (stable chunk boundaries from unit or soldier
  index, never work-stealing order), thread-local accumulators, one stable
  merge order. No atomics feeding decisions.
- RNG: pre-split per-chunk deterministic streams, or keep all RNG
  consumption in the serial phase.
- Float accumulation: a fixed reduction tree, not first-come summation.
- Prove native first. Delivering threads to the browser means wasm shared
  memory (nightly `-Zbuild-std`, atomics, wasm-bindgen threads glue) inside
  the worker the worker track builds; that is its own later step with its
  own browser verification, and it is the only place the nightly toolchain
  question legitimately returns.

## Verification

This slice owns the final native build configuration and the standing
`scripts/test-perf` integration. The experimental `parallel` feature is
currently optional and native-only; the standing script still measures
serial code. A feature-enabled timing result alone cannot make that gate
green. Retain a parallel configuration only after measured gain, wire the
standing gate to the actual shipped configuration, and remove unused Rayon
configuration if neither trial is retained.

Weapon-repel search and whole-unit steering are the first independent
trials. Their identity checks may run concurrently, but performance
comparisons use an exclusive lane. Projection is a conditional follow-up,
not an implementation commitment before those measurements.

- **State hash bit-identical to the SERIAL build** across the three oracles
  AND across thread counts (1, 2, 8) — the strongest oracle in the spec.
- Full workspace suite; ledger rows at 1/2/8 threads; the budget gate.
- If hash identity to serial proves unreachable for a subsystem, that
  subsystem stays serial — record it; do not relax the oracle.

## Boundary for any follow-up

Prefer projection over a whole-pass targeting snapshot if the first trials
leave a deficit. Within each projection pass, body geometry is fixed until
all corrections apply. Compute individual pair corrections concurrently,
then replay the original `+=` and `-=` operations with their already-rounded
operands in the original body/bucket/body order. Per-thread soldier totals
would change floating-point addition order.
Bound temporary pair storage by batches; a full buffer must continue the
remaining work without dropping pairs. Measure pair volume before selecting
the storage limit, and keep the original pass/rebuild boundaries.

Targeting lacks that snapshot boundary. Earlier attackers update the
`fighting` flags later searches read, and an impale immediately moves its
victim before a later attacker obtains its query position. The target's
current soldier position also differs from the frozen body-grid position.
Freezing these values is a behavior change, not an exact parallel pass.
Keeping each attacker serial and parallelizing its inner scan would add
thousands of scheduling barriers per tick. Those dependencies make projection
the smaller candidate; no targeting snapshot or invalidation cache is planned.

## Must stay green

Everything, at every thread count.
