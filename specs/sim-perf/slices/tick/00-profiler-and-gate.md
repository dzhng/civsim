# tick/00 — Stage profiler behind a feature, and the standing budget gate

## Contract unlocked

Every later tick slice can prove itself: a per-stage timer says where the
tick goes on the implementing machine, and one command fails when the 30k
fighting tick exceeds the budget. This replaces July's instrumentation patch,
which targeted `collision.rs` and the combat god function that the
debt-ledger split into `steer/`, `separation/` and `combat/`.

## What to do

1. **Stage profiler, feature-gated (`perf_timing`)**: wall time per pass in
   `Sim::tick` — the displacement prologue, `mark_at_ease`, orders and
   reflexes, `navigate_units`, unit motion, `slide_halted_frames`,
   `reform_slots`, `steer_soldiers` (with `precompute_unit` separated),
   `apply_separation` split into body pairs, weapon-repel, walls and the
   projection passes, `run_combat` split into targeting and resolution,
   missiles, `contact_facing`, `integrate_units`, morale. Zero cost without
   the feature; `cargo check -p sim` with default features stays clean.
2. **Fixtures in `profile_tick`** (the binary already boots the real seed-7
   generated battle and the class-pair duels): add a `fighting` mode that
   runs seed 7 with commanders on until the armies are in contact (the
   2026-09-08 run reached casualties between ticks 8,000 and 9,000) and
   then measures 300 ticks after 60 warm-up ticks, two repeats, at 15.5k
   and grown to 30k and 60k through the same spawn grid the perf gate
   uses. Print the per-stage table when the feature is on, the ms/tick and
   the state hash always.
3. **Standing budget gate**: `scripts/test-perf`, sibling of
   `scripts/test-mechanics`, runs the 30k fighting fixture in release and
   fails when median ms/tick > 25; prints the 60k number and the
   30k → 60k ratio as telemetry (no gate).

## Verification

- Gate runs on the clean machine and is honestly red or green — record
  which, with the number, in the README ledger; do not mark it expected.
- Profiler on vs off: the state hash is identical (timing must not touch
  the sim), and the off build's ms/tick is unchanged within noise.
- `cargo test --workspace` green; `cargo check -p sim` clean.

## Delegated to the implementer

Timer representation (a small stack of named accumulators is enough), the
table format, and whether 60k lives in the same binary or a flag.

## Must stay green

Everything; this slice measures and changes nothing.

## Feedback that would change this slice

If David re-opens the 25 ms budget (the July interview locked it), the
gate's threshold moves; nothing else here does.
