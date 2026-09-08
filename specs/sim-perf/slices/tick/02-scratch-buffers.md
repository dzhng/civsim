# tick/02 — Scratch-buffer reuse (pure-perf, low risk)

## Contract unlocked

Hot passes stop allocating and cloning large per-tick vectors. Seen on
2026-09-08 in `apply_separation`: `mom0_x/y` clones, `bleed_*`, `set_*`,
`wall_*`, `repel`, `brace`, `unit_near_enemy`, the per-unit extent vectors
the weapon-repel cull added; in `run_combat`: `gang_rank`, `near_enemy`;
in `steer_soldiers`: the per-unit `UnitPre` vectors and their nested
allocations. Combat damage and push accumulators already reuse storage on
`Sim`; preserve that owner instead of duplicating it. Reusable scratch
storage cuts allocator pressure and memory-bandwidth variance.

Reuse must preserve each buffer's reset value, including nonzero sentinels
such as negative wall depth and infinite empty bounds. Steering must fill
all unit precomputations before moving any soldier; retaining only the outer
`UnitPre` vector while dropping its nested vectors does not reuse those
allocations. Similar near-enemy arrays have different trampler exclusions,
so their computed values cannot be shared merely because their types match.

## Verification

- **State hash bit-identical** on all three oracles (buffer reuse must
  include correct clearing — a stale value that changes a decision shows
  up here).
- Ledger row; record variance before and after, not only the median — the
  expected win is low single-digit milliseconds and a tighter spread.
- `cargo test --workspace`.

## Delegated to the implementer

Where the scratch lives (fields on `Sim` alongside the existing `scratch`
vector, or one struct of them) and the clearing discipline.

## Must stay green

Everything.


## Storage contract

Each hot pass owns reusable capacity on `Sim`; buffers retain their peak
capacity between ticks, but scratch values themselves are never carried
forward as simulation state. Full resets happen at the same
phase boundaries and with the same sentinels as the former fresh allocations.
The momentum snapshot still copies the incoming values: reuse removes its
allocation, not the snapshot or its Jacobi semantics.

Steering retains each unit's precomputation object and its nested vectors.
Changing the unit count resizes those objects, and every slot and pivot entry
is reset before reuse, including dead slots. Every unit finishes precomputation
before any soldier moves. Measurement storage returns to its owner only after
all tick consumers finish. Buffers that must coexist with a whole-`Sim` mutable
borrow temporarily move out of their owner and return on the normal path;
empty-sim returns happen before that move.

The small formation-file bitmap helper and feature-only force-trace record
allocations remain outside this pass. Their interfaces and lifetimes are not
changed merely to remove every allocation. The contact algorithm and its
phase-specific grid snapshots are unchanged.


## Pass handoff

Scratch-only implementation and focused identity checks are complete; see
[verification evidence](../../assets/tick02-verification.md). Integrate it
with the contact pass, then run the combined workspace and browser identity
gates and a coordinated timing/variance comparison. No timing improvement
is claimed from the concurrent correctness runs.
