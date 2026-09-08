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

## Measurement contract

The profiler reports exclusive time: a nested targeting or projection scope
is subtracted from its enclosing pass, so stage rows can be compared without
double-counting. Scopes are diagnostics only; the default build expands their
macros to nothing and `scripts/test-perf` runs that uninstrumented build.
Per-target clock/accounting overhead means the instrumented result is not the
budget measurement. Stage rows cover `Sim::tick`; the outer benchmark also
includes the commanders in `Battle::tick`.

The fighting fixture retains the native oracle's seed-7 initialization and
grows it through the renderer gate's fixed spawn grid. It waits for observed
melee, then requires melee throughout the measured window. Preparation is
bounded so failure to make contact fails instead of timing an idle approach.
The output includes contact tick, living population, minimum fighting men and
final hashes: army size alone must never be mistaken for combat participation.
Repeated runs start fresh and must end at the same hash. The budget compares
the median of the two repeat means and reports each window’s tick-cost
standard deviation; preparation, validation scans and output are outside those
tick timers. The generated-only and expanded battles can
reach contact at different times, which is why window provenance is printed.

## Verification status

Profiler, fixture and standing gate are implemented. [Native evidence](../../assets/tick00-native-2026-09-09.md)
records exact off/on/original hashes, a clean default check, both unchanged
golden-test passes, stage tables and the **red** 36.294 ms budget run. The
late interleaved idle control found no measurable disabled-profiler overhead.
The integrated profiler-only workspace suite passed; later native changes
have their own combined verification. This result does not establish that
the performance goal is met.
