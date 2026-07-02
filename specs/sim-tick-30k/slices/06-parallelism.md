# Slice 06 — Deterministic parallelism (LAST perf lever)

## Contract unlocked

Multi-core tick: steering, body scans, and combat target scans partitioned
across threads (native rayon; the wasm SharedArrayBuffer path is already
enabled by the web config) — WITHOUT breaking seed-stable determinism.

## Why last (locked ordering)

Parallelizing duplicated work wastes the win (investigation rec #6) — `01`–`03`
first. And determinism is the hard part, not the threading: ordering,
floating-point accumulation order, RNG consumption, staged write conflicts.

## Approach guardrails

- Fixed-chunk partitioning (stable chunk boundaries from unit/soldier index,
  never work-stealing order), thread-local accumulators, one stable merge
  order. No atomics feeding decisions.
- RNG: pre-split per-chunk deterministic streams, or keep all RNG consumption
  in the serial phase.
- Float accumulation: fixed reduction tree, not first-come summation.
- Prove native first; the wasm-threads delivery is a separate step with its
  own browser verification (crossOriginIsolated already true).

## Verification

- **State-hash golden: bit-identical to the SERIAL build** across the seed
  set AND across thread counts (1, 2, 8) — the strongest oracle in the spec.
- Full workspace suite; bench ledger at 1/2/8 threads; budget gate.
- If hash-identity to serial proves unreachable for a subsystem, that
  subsystem stays serial — record it; do not relax the oracle.

## Must stay green

Everything, at every thread count.
