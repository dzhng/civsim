# Spec: Sim tests — balance matrix (generated) vs behavior suite (authored)

> Sibling spec: `specs/scenarios.md` applies the same creed to the web frontend
> — catalog-driven, gated 100% *visual* coverage. Shared creed: **the
> exhaustive part of a test suite is a generated projection of the
> source-of-truth registries, not a hand-maintained list.**

## Goal, in one sentence

Split the sim's tests into two families that are confused today — **balance**
tests (does each class's combat performance match its price?) and
**behavior/physics** tests (does a mechanism work — distance lowers morale, a
cavalry charge breaks a thin line?) — and make the balance family an
exhaustive, cost-aware, golden-pinned matrix generated from `ALL_CLASSES`,
while the behavior family stays the authored emergent suite it already is.

This document marks **measured fact** (binding) vs **proposed design** (deviate
where the code disagrees). The binding core: the balance matrix is generated &
complete, the two families are separated, and the completeness gates fail
closed. Cost-normalisation and axis choices are proposed.

## The two families — why the split is the whole point

*(the distinction, in the owner's words:)* A **balance test** checks that
*performance (stats) matches the price* — the 9×9 duel board is the canonical
one. A **behavior test** checks a physics/mechanism claim — "distance affects
morale," "a cavalry charge breaks a line," "a braced pike hedge stops a horse."
They want opposite things from their test infrastructure:

| | Balance | Behavior / physics |
|---|---|---|
| Question | do stats match price? | does the mechanism work? |
| Shape | **exhaustive matrix**, every class pair | **specific** crafted encounters |
| Source | generated from `ALL_CLASSES` | hand-authored, one per claim |
| Assertion | matches golden table; cost-fair within bands | a measured outcome crosses a threshold |
| On new class | matrix grows automatically; gate demands it | nothing — unless the class adds a mechanism |
| Map | tiny, 2 units, flat | whatever the mechanism needs |
| Future | **emits a replay per cell → dashboard** | stays assert-only |

The split is load-bearing because the *failure modes differ*. A balance
regression is "class X now wins matchups its price doesn't justify" — caught by
diffing a complete table. A behavior regression is "morale stopped responding
to distance" — caught by one targeted assertion. Generating the behavior suite
would be nonsense (there is no enumerable list of mechanisms); hand-listing the
balance suite is what left 69 of 81 cells uncharacterised today.

## The evidence (measured fact)

- Registry spine: `crates/contract/src/lib.rs:12-54` — `enum UnitClassId` (9),
  `pub const ALL_CLASSES: [UnitClassId; 9]`.
- Stats: `crates/sim/src/class.rs:151-324` `class_stats(id)`; the five weapon
  numbers `struct Weapon` at `:10-25`; 8 weapon consts `:85-150`.
- **Price** lives in campaign tunables, already keyed by class:
  `crates/campaign/src/tunables.rs` — `recruit_cost_milligold(class)`,
  `upkeep_per_soldier_milligold(class)`, `unit_size(class)`,
  `recruit_ticks_per_soldier(class)`. Balance is the relation between
  `class_stats` (what you get) and these (what you pay).
- Determinism (why pinning works): `Pcg32::new(seed, stream)`
  (`crates/contract/src/rng.rs`), `Sim::rng = Pcg32::new(seed, 0xda3e)`
  (`crates/sim/src/sim.rs:171`), state-hash golden `crates/sim/tests/golden.rs:40`.
- The balance matrix is half-built: `crates/sim/tests/balance_matrix.rs:39-62`
  `fn duel(a, b, seed)`, over `setup_duel(a, b)` (`crates/sim/src/battle.rs:196-222`,
  class-specific headcounts 240/220/120). `measure_the_matrix()` runs all 81
  pairs but only **prints** — proving runtime is cheap (81 tiny 2-unit headless
  duels already run every session) and proving the assertion is missing.
  `the_counter_web_holds():120-147` asserts **12** matchups by hand.
- Behavior suite: ~112 `#[test]`s across 16 files; the emergent ones live in
  `combat_scenarios.rs`, `morale_scenarios.rs`, `class_scenarios.rs`,
  `missile_scenarios.rs`, `terrain_scenarios.rs`, etc.

## Rejected approaches — do not retry naively

- **Blind full cross-product of every tunable.** 81 pairs × stance² × pace ×
  charge × 7 terrain × sweeping 55 continuous tunables → effectively infinite
  and mostly redundant (a pike has no charge; artillery has no melee stance).
  The balance matrix is exhaustive over **classes** (the dimension you balance)
  and over a small set of axes that demonstrably flip outcomes — not blindly
  producted. The class×class 81 is mandatory and cheap; axis variants are added
  with a stated reason each.
- **Generating the behavior suite.** Mechanisms are not enumerable; a generator
  would produce noise. Behavior tests stay authored.
- **Asserting absolute per-cell numbers** (`surv_a == 0.43`). Brittle — every
  tune churns every literal. Pin the *table as a golden artifact* (re-pinned
  deliberately, once per intended change; the diff is the balance review) and
  bucket survivor% into bands so seed jitter doesn't churn it.
- **Equal-headcount as the balance signal.** 240-vs-220 men tells you who wins,
  not whether the price is fair. The balance question is **equal cost** (below).

## The design

### Balance matrix: complete, cost-aware, golden-pinned

Live in a dedicated home (`crates/sim/tests/balance/`, or `balance_matrix.rs`
rewritten) and generate from the registry:

```rust
for &a in &ALL_CLASSES {
    for &b in &ALL_CLASSES {                  // full 81 — the dimension you balance
        for axes in BALANCE_AXES {            // a few, each justified (see below)
            let cell = duel_equal_cost(a, b, axes, SEED);  // headcounts normalised by gold
            table.push(cell);                 // { a, b, axes, victor, surv_a%, surv_b%, secs, cost_a, cost_b }
        }
    }
}
assert_matches_golden(&table, "tests/golden/balance-matrix.txt");
```

- **Cost-normalised duels** *(proposed, the key balance idea)*: instead of fixed
  240/220, spend ~equal gold per side — derive headcounts from
  `recruit_cost_milligold` (+ an upkeep horizon if you want the campaign-true
  cost). Then a balanced roster yields outcomes clustered near 50/50 across the
  board; a class that wins its equal-cost matchups decisively is *underpriced*,
  one that loses them is *overpriced*. The matrix becomes the instrument you
  literally balance the game with, not just a regression pin. Keep an
  equal-headcount variant too if it aids reading raw combat power vs price.
- **Golden table** is human-readable, one row per cell, survivor% in bands
  (0/≤25/≤50/≤75/100) so sub-percent RNG jitter doesn't churn it. A balance
  change re-pins it in one reviewed commit.
- The 12 counter-web relationships become a **derived** check over the table
  (`assert beats(Phalanx, ShockCavalry)`), deleting the bespoke duels.
- Runtime: 81 × |BALANCE_AXES| tiny 2-unit headless duels. `measure_the_matrix`
  already runs the 81 cheaply; target |BALANCE_AXES| ≤ 6 (≤ ~500 duels). Log the
  measured wall-time; if it dominates, feature-gate the heavy axes like the web
  harness gates `--full`.

### BALANCE_AXES — chosen, not producted

A curated handful, each with a one-line "why this flips the board": the
charge-vs-brace axis `(Run+charge)` vs `(Walk+braced)` (the single most
outcome-defining interaction — see the impale spec), a `Fence`-vs-`Othismos`
slice for the infantry sub-matrix where `class_stats().stance` differs, and an
`Open` vs one rough terrain (Forest/Hill) slice for the classes terrain
decides (cavalry, skirmishers). An axis with no stated reason does not belong.

### Behavior suite: keep it, just name it

The emergent tests stay authored and stay where they are; the only change is
*labelling* the families clearly (a module doc-comment, or grouping the
emergent files under a `behavior/` umbrella) so a reader knows "balance =
generated matrix, behavior = these crafted scenarios." Do not generate them, do
not fold them into the matrix.

### Tunable provenance (spans both families)

Each continuous tunable (~55 `Tunables` fields, the 5×8 weapon numbers, the
`class_stats` fields) must have **at least one test that changes if it
changes** — usually a behavior test, sometimes a matrix cell. A meta-test
asserts every field is named in a `TUNABLE_GUARDS` table; enforce field
completeness with an exhaustive `let Tunables { a, b, c } = t;` destructure
*without* `..`, so adding a field fails compilation until it is guarded.
*(proposed; the binding part is that no tunable is unguarded.)*

### Future: replays and the balance dashboard

Replays do not exist yet, but the balance matrix is designed to feed them. Each
cell is fully reproducible from its descriptor `{ a, b, axes, headcounts, seed }`
— that is already what regenerates the golden. When replay serialization lands,
the balance runner emits **one replay artifact per cell**, and a dashboard loads
them into the existing battle renderer so a human can *watch* any matchup that
looks mispriced, not just read a number. Design constraints to honor now so this
is nearly free later:
- keep each cell's descriptor serializable and self-contained (no reliance on
  ambient global state to reconstruct the duel);
- keep the duel reproducible purely from `(descriptor, seed)` — no wall-clock,
  no `HashMap` iteration order, nothing the replay can't capture;
- name cells deterministically (`<a>_vs_<b>__<axes>`) so a replay file maps 1:1
  to a matrix row and the dashboard can index by matchup.
This is forward-looking direction, not in this spec's acceptance — but a balance
matrix that violates the three constraints above would have to be reworked to
support replays, so honor them.

## What must NOT change

1. **The five weapon numbers stay five** *(locked philosophy)*. The matrix
   characterises the physics; it must not motivate a sixth knob. Formulas read
   men, mass, measured motion.
2. **`golden.rs`'s state-hash regression** *(locked)*. The balance-matrix golden
   is additive; the bit-identical hash test stays as the determinism floor.
3. **`Pcg32` seeding and BTree ordering** *(locked)* — the matrix and any future
   replay are only reproducible because replay is deterministic.
4. **The behavior suite's coverage** *(locked)*. Generating the matrix must not
   delete a single emergent mechanism test; it replaces only `measure_the_matrix`
   and the bespoke duels inside `the_counter_web_holds`.

## Contracts — the tests are the spec

Must BECOME true (acceptance):
- A generated, cost-aware, golden-pinned balance matrix over the full
  `ALL_CLASSES × ALL_CLASSES × BALANCE_AXES`; print-only `measure_the_matrix`
  gone; counter-web derived from the table; no bespoke duels left.
- **Class-completeness gate** *(binding)*: the matrix dimension equals
  `ALL_CLASSES.len()` and every variant appears as attacker and defender;
  appending a variant fails the gate until the golden is regenerated (verify
  once, revert).
- **Tunable-completeness gate** *(binding)*: every `Tunables`/weapon/`class_stats`
  field is guarded (the no-`..` destructure makes a new field a compile error
  until handled).
- The two families are clearly separated and labelled in the tree.

Must STAY green:
- `golden.rs`; every emergent behavior test in `combat_scenarios.rs`,
  `morale_scenarios.rs`, `class_scenarios.rs`, `missile_scenarios.rs`,
  `terrain_scenarios.rs`, … .
- `cargo test --workspace` wall-time stays sane (matrix runtime logged; heavy
  axes feature-gated if needed).

## Process requirements

- `cargo test` before anything; debug probes shift float codegen — pin the
  golden from a clean build, never one with probes compiled in (known hazard).
- Re-pinning the balance golden is deliberate and reviewed, like re-blessing a
  screenshot baseline: regenerate, read the diff *as a balance review*, commit
  the golden in the same change that moved it. Never auto-bless in CI.
- See the `balance-unit` skill for tuning a single class; this matrix is the net
  that catches what a tuning pass moved elsewhere.

## Acceptance

- [ ] Balance and behavior families separated and labelled in the test tree.
- [ ] Full `ALL_CLASSES²` balance matrix generated, cost-normalised, golden-
      pinned; counter-web derived; print-only version deleted.
- [ ] `BALANCE_AXES` curated with a why-each comment; cell count + wall-time
      logged and acceptable (or heavy axes feature-gated).
- [ ] Class- and tunable-completeness gates verified to fail closed.
- [ ] Behavior suite intact and green; `golden.rs` + determinism seams untouched.
- [ ] Cell descriptors are serializable and reproducible from `(descriptor,
      seed)` alone — replay-ready, per the future section's three constraints.
- [ ] Postmortem here (matrix size, wall-time, how many cells the first golden
      characterised vs the old 12, and whether cost-normalisation surfaced any
      mispriced class), then delete this file.
