# Spec: Simulation matrix — every encounter golden-pinned, every tunable exercised

> Sibling spec: `specs/scenarios.md` applies the same principle to the web
> frontend — catalog-driven, gated 100% *visual* coverage. This file is the
> *behavioral* half (cargo/sim). Shared creed: **tests are a generated
> projection of the source-of-truth registries, not a hand-maintained list.**

## Goal, in one sentence

Turn the sim's behavioral test suite from 112 hand-written one-off scenarios
into a *generated projection of the tunable registries*: the full discrete
encounter matrix (every class pair × the discrete combat axes) simulated and
its outcome golden-pinned, and every continuous tunable guarded by at least one
test that provably moves when it changes — so adding a class or retuning a
number cannot leave an encounter unsimulated or a tunable unguarded.

This document marks **measured fact** (binding) vs **proposed design** (deviate
where the code disagrees). The binding core is the two coverage gates in
*Contracts*; the matrix shape and axis selection are proposed.

## The problem, with the evidence

*(measured fact)* The enumerable inputs already exist as clean registries:
- `crates/contract/src/lib.rs:12-54` — `enum UnitClassId` (9 variants) and
  `pub const ALL_CLASSES: [UnitClassId; 9]`. This is the spine.
- `crates/sim/src/class.rs:10-25` — `struct Weapon` (the five numbers: `reach,
  min_range, arc, attack_interval, damage`); `:85-150` the 8 weapon consts;
  `:151-324` `class_stats(id) -> UnitClass` (mass, brace_mult, health, block,
  evade, training, stance, charge, tramples, drain_mult, weapons…).
- `crates/sim/src/tunables.rs:10-197` — `struct Tunables`, ~55 fields, `Default`
  at `:145-197`. Plus `enum Pace` (Walk, Run) at `:10-14`.
- `crates/sim/src/unit.rs:11-33` — `enum Stance` (Othismos, Fence),
  `enum OrderMode` (Move, Attack(u32), Disengage).
- `crates/campaign/src/mapdata.rs:11-20` — `enum TileFeature` (Open, Forest,
  Hill, Pass, Bridge, Ford, Sea).
- `crates/sim/src/missiles.rs:17-22` — `enum MissileKind` (Arrow, Javelin,
  Stone); per-class specs at `:45-90`.

*(measured fact)* Determinism is already proven and is what makes pinning
possible: `crates/contract/src/rng.rs` `Pcg32::new(seed, stream)` gives a
bit-identical float sequence (self-test `:54-59`); `Sim::rng =
Pcg32::new(seed, 0xda3e)` (`crates/sim/src/sim.rs:171`); the golden-hash
regression `crates/sim/tests/golden.rs:40` pins a scripted scenario's hashed
end-state. The engine is deterministic; we are not adding determinism, we are
building a higher-level golden on top of it.

*(measured fact)* The encounter matrix is *half-built and unasserted*:
- `crates/sim/tests/balance_matrix.rs:39-62` — `fn duel(a, b, seed) ->
  (victor, surv_a%, surv_b%, duration)` over `setup_duel(a, b)`
  (`crates/sim/src/battle.rs:196-222`).
- `measure_the_matrix()` iterates all 9×9 = 81 pairs but only **prints** the
  board — no assertion. So 81 encounters run every test session and prove
  nothing.
- `the_counter_web_holds():120-147` hand-asserts **12** monotonic matchups
  (HeavyInfantry > LightInfantry, Phalanx > ShockCavalry, …). The other 69
  cells are uncharacterized.
- 112 `#[test]`s across 16 files (`grep -c '^#\[test\]'`), each a bespoke
  setup. No parametrization over `ALL_CLASSES`; adding a 10th class adds zero
  tests automatically and the 81-cell print silently becomes a 100-cell print
  that still asserts nothing.

The gap: the discrete encounter space is small and fully enumerable (81 pairs,
×2 stances ×2 paces = 324 — tractable), yet it is neither asserted nor
regenerated from the registry. And no structure connects a `Tunables` field to
a test that would catch a regression in it.

## Rejected approaches — do not retry naively

- **Blind full cross-product.** 9×9 classes × 2 stance(a) × 2 stance(b) × 2
  pace × 2 charge ≈ 648² ≈ 420k duels, times sweeping 55 continuous tunables →
  effectively infinite, dominated by redundant or nonsensical cells (a pike has
  no charge; artillery has no melee stance that matters). It would run for
  hours, and a 420k-row golden is unreviewable — a balance change would diff
  thousands of cells and teach you nothing. The simulation must be *exhaustive
  over the discrete, meaningful axes* and *sensitivity-tested over the
  continuous ones*, not blindly producted. This is the central design judgment.
- **Keep hand-asserting matchups** (`the_counter_web_holds` style). Does not
  scale: 12 of 81 today, and every new class needs N hand-written rows that
  someone will forget. The relationships should be *derived from the generated
  table*, not re-typed.
- **Assert absolute outcome numbers per cell** (`surv_a == 0.43`). Too brittle —
  every tuning churns every literal. Pin the *table as a golden artifact*
  (re-pinned deliberately, once, per intended change) and assert *monotonic
  relationships* (A beats B) derived from it; reserve exact numbers for the
  golden file the way `golden.rs` already does for state hashes.

## The design

### One: the encounter matrix is generated and golden-pinned

Replace `measure_the_matrix`'s print with an asserted golden table generated
from `ALL_CLASSES`:

```rust
// pseudo — crates/sim/tests/matrix.rs
let mut table = Vec::new();
for &a in &ALL_CLASSES {
    for &b in &ALL_CLASSES {
        // a small, justified axis fan-out per cell (see "axes" below)
        for axes in MATRIX_AXES {                 // e.g. [(Run, charge), (Walk, no-charge)]
            table.push(Cell { a, b, axes, ..duel_with(a, b, axes, SEED) });
        }
    }
}
assert_matrix_matches_golden(&table, "tests/golden/encounter-matrix.txt");
```

- The golden file is human-readable (one row per cell: classes, axes, victor,
  surv%, duration band). A balance change re-pins it in **one** commit, and the
  diff *is* the balance review — exactly the artifact `balance-unit` work wants.
- Bucket survivor% into bands (e.g. 0/≤25/≤50/≤75/100) before pinning so
  sub-percent RNG jitter doesn't churn the golden; the band width is the
  declared tolerance. *(proposed: tune the bands so a real balance shift crosses
  a band but seed noise doesn't.)*
- The 12 hand-asserted counters become a **derived** check over the generated
  table (`assert beats(Phalanx, ShockCavalry)`), not separate setups. Deleting
  `the_counter_web_holds`'s bespoke duels removes duplication.

### Two: the discrete axes, chosen not producted

`MATRIX_AXES` *(proposed)* is a curated handful where the axis is known to flip
outcomes, not the full product:
- pace/charge: `(Run + charge)` vs `(Walk + braced)` — the charge-vs-brace
  interaction is the single most outcome-defining axis (see the impale spec).
- stance: add a `Fence`-vs-`Othismos` slice for the infantry sub-matrix where
  `class_stats().stance` differs.
- terrain: a `TileFeature::Open` baseline plus one rough slice (Forest/Hill)
  for the classes whose `drain_mult`/speed make terrain decisive (cavalry,
  skirmishers). Not all 7 features × 81 pairs.
Each included axis carries a one-line comment for *why this axis flips this
sub-matrix*; an axis with no such reason does not belong in the product. State
the cell count in a `log`/test name so a reader sees the matrix size at a glance.

### Three: every continuous tunable has a sensitivity test

The tractable reading of "every permutation between the tunables is simulated":
each of the ~55 `Tunables` fields (and each `class_stats` field, and each of the
5×8 weapon numbers) must have **at least one test whose assertion changes if
that field changes**. Build a provenance table:

```
crates/sim/tests/tunable_provenance.rs
  TUNABLE_GUARDS: &[(&str /* field path */, &str /* test name that guards it */)]
```

A meta-test asserts every field of `Tunables` (enumerated via a derive or an
exhaustive match — see below) appears in `TUNABLE_GUARDS`. Optionally, a CI
mutation pass perturbs each field by ±10% and asserts its named guard test goes
red — proving the guard is real, not nominal. *(proposed; the binding part is
the completeness check that no field is unlisted.)*

### Four: the gates that make it future-proof

- **Class completeness** *(binding)*: a test asserts the generated matrix's
  dimension equals `ALL_CLASSES.len()` and that every variant appears as both
  attacker and defender. Adding a 10th class fails this until the golden is
  regenerated — i.e. until the new class's 19 new matchups are characterized.
- **Tunable completeness** *(binding)*: the provenance meta-test above fails if
  any `Tunables`/weapon/`class_stats` field lacks a named guard. Adding a
  tunable fails until it is guarded.
- Both gates fail *closed*: new surface area is unsimulated by default and the
  suite says so, rather than silently leaving it uncovered.

### Enumerating struct fields exhaustively

`Tunables` has no enum; to make "every field is guarded" enforceable, either
(a) add a `#[derive]`/macro that emits the field-name list, or (b) write one
exhaustive destructuring `let Tunables { base_speed, run_speed, .. } = t;`
*without* `..` so the compiler errors when a field is added until it is handled
in the provenance list. Option (b) needs no macro and gives a compile-time gate
— prefer it. *(proposed.)*

## What must NOT change

1. **The five weapon numbers stay five** *(locked philosophy)*. The matrix
   reads `reach/min_range/arc/attack_interval/damage`; it must not motivate a
   sixth. Formulas read men, mass, measured motion — the matrix characterizes
   that physics, it does not add knobs to pass itself.
2. **`golden.rs`'s state-hash regression** *(locked)*. The new encounter-matrix
   golden is additive; the bit-identical hash test stays as the determinism
   floor. If the matrix golden moves but the hash golden does not, the change
   is in setup/axes, not the engine — and vice versa.
3. **`Pcg32` seeding and BTree ordering** *(locked)*. The matrix is only
   pinnable because replay is deterministic; do not introduce `HashMap`
   iteration or unseeded RNG into any path the duel touches.
4. **The existing emergent scenarios stay.** The generated matrix covers
   *pairwise duels*; the hand-written multi-unit tests (cavalry plowing a line,
   morale rout geometry, missile scatter) cover *emergent* behavior the matrix
   cannot. Keep them; the matrix replaces only `measure_the_matrix` and the
   bespoke duels inside `the_counter_web_holds`.

## Contracts — the tests are the spec

Must BECOME true (acceptance):
- `crates/sim/tests/matrix.rs` generates the full `ALL_CLASSES × ALL_CLASSES ×
  MATRIX_AXES` table from the registry and asserts it against
  `tests/golden/encounter-matrix.txt`. The print-only `measure_the_matrix` is
  gone.
- Class-completeness gate green and *load-bearing*: temporarily appending a
  variant to `ALL_CLASSES` makes it fail (verify once, then revert).
- Tunable-provenance gate green: every `Tunables`/weapon/`class_stats` field is
  named in `TUNABLE_GUARDS` (or guarded by the no-`..` destructure); adding a
  dummy field fails compilation/test until guarded.
- The 12 counter-web relationships now assert against the generated table, with
  no bespoke duel setups left in `balance_matrix.rs`.

Must STAY green:
- `golden.rs` state hash; all emergent scenario tests in
  `combat_scenarios.rs`, `morale_scenarios.rs`, `class_scenarios.rs`, etc.
- `cargo test --workspace` wall-time stays sane: the matrix is 81×|MATRIX_AXES|
  duels (target |MATRIX_AXES| ≤ 6, so ≤ ~500 duels), each a short headless run.
  If it dominates runtime, gate the heavy axes behind a `--ignored`/feature
  flag the way the web harness gates `--full`. State the measured matrix
  runtime in the postmortem.

## Process requirements

- `cargo test` before anything; probes/float codegen can shift results — pin
  the golden from a clean build, never from a build with debug probes compiled
  in (a known float-codegen hazard in this repo).
- Re-pinning the matrix golden is a deliberate, reviewed act, like re-blessing a
  screenshot baseline: regenerate, read the diff as a balance review, commit the
  golden in the same change that caused it. Never auto-bless in CI.
- See the `balance-unit` skill for how a single class is tuned; this matrix is
  the safety net that catches what a tuning pass moved elsewhere.

## Acceptance

- [ ] Generated, golden-pinned encounter matrix from `ALL_CLASSES`; print-only
      version deleted; counter-web derived from the table.
- [ ] Curated `MATRIX_AXES`, each with a why-this-axis comment; cell count
      logged; runtime measured and acceptable (or heavy axes feature-gated).
- [ ] Class-completeness and tunable-completeness gates, both verified to fail
      closed when surface area is added.
- [ ] `golden.rs`, determinism seams, emergent scenarios untouched and green.
- [ ] Postmortem note here (matrix size, runtime, how many cells the first
      golden characterized vs the old 12), then delete this file.
