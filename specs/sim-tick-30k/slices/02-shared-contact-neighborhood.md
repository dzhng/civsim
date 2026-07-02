# Slice 02 — Shared per-tick contact neighborhood (pure-perf, highest ordering risk)

## Contract unlocked

The big fighting win (investigation rec #2): `combat.attacker_grid_strikes`
(~23.5 ms at 30k fighting) and `collision.weapon_repel` (~14.8 ms) stop
re-scanning overlapping spatial neighborhoods — one per-tick contact
neighborhood structure feeds both.

## Approach guardrails (the investigation's warning, taken seriously)

Target choice, obstruction sampling, weapon repel, and strike resolution are
sensitive to **candidate ordering and dedup** — especially mounted two-body
soldiers. Build the shared structure to reproduce the EXACT candidate sequence
each consumer sees today (byte-order compatible), or don't share that consumer
yet. No hash-map iteration order may feed a decision. If reproducing a
consumer's order proves impossible without behavior change, SPLIT: share the
consumers that stay hash-identical, record the holdout + why, and leave it for
the behavior track.

## Verification

- **State-hash golden: bit-identical**, the full slice-00 seed set including
  the mounted fixture. This is the slice most likely to fail it — treat a hash
  mismatch as a wrong candidate order, not as noise.
- Bench ledger row; budget gate (this slice is where ≤25 ms at 30k fighting
  should land or come close).
- `cargo test --workspace` + the full balance/scenario suites + one vibe
  (memory: full suite after anything mechanics-adjacent).

## Must stay green

Everything. Re-pinning ANY test in a pure-perf slice is prohibited.
