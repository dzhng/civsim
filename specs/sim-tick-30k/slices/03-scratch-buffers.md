# Slice 03 — Scratch-buffer reuse (pure-perf, low risk)

## Contract unlocked

Hot passes stop allocating/cloning large per-tick vectors (investigation
rec #5: `mom0_x/y`, wall/repel arrays, combat accumulators, `gang_rank`,
`near_enemy`, …) — reusable scratch storage cuts allocator pressure and memory
bandwidth variance.

## Verification

- **State-hash golden: bit-identical** (buffer reuse must include correct
  clearing — a stale value that changes a decision shows up here).
- Bench ledger row (expect low-medium single-digit ms + reduced variance —
  record variance before/after, not just the median).
- `cargo test --workspace`.

## Must stay green

Everything.
