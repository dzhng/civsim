# Spec: Balance harness — runtime-configurable sim, N-seed, generated matrix, agent-tunable

> Sibling spec: `specs/scenarios.md` is the *visual* half (web/pixels). This is
> the *sim* half. Shared creed for the exhaustive parts: **the exhaustive part
> of a test suite is a generated projection of the source-of-truth registries,
> not a hand-maintained list.**

## Implementation status (2026-06-14) — partially landed; keep this spec

**Done and green** (golden hash byte-identical throughout):
- `WeaponSet`: `UnitClass.weapons` owns its weapons inline so a class can be
  built at runtime (`class.rs`).
- Runtime `BalanceConfig` (`class.rs`): per-class stats lifted out of the
  `class_stats` consts, `Default` byte-identical, injected via
  `Sim::with_balance`; units capture `stats` at spawn and all hot-path reads go
  through `unit.stats`.
- N-seed harness (`crates/sim/src/balance.rs`): `Scenario` (1v1 and N-v-M),
  `run_over_seeds` → `Aggregate` (win-rate + survivor mean/median/stdev),
  `report(candidate, scenarios, seeds)` for tuning, `SEEDS`. Tests in
  `crates/sim/tests/balance_harness.rs` (incl. the slot-efficiency anchor and
  an end-to-end tuning check).

- Generated golden matrix (`balance_matrix.rs::golden_balance_matrix`): the
  full `ALL_CLASSES²` board run through the harness, pinned to
  `tests/golden/balance-matrix.txt`, annotated with the **gold lens**
  (`contract::unit_cost` — no crate move needed, the price anchor was already
  in `contract`). `#[ignore]`d (~minutes); bless with `UPDATE_BALANCE=1`.
  Print-only `measure_the_matrix` and the bespoke `duel()` deleted;
  `the_counter_web_holds` derives from the same runner.

**Remaining** (the design below still applies):
- The **headcount/slot lenses** as distinct *measurements* (the matrix is 1v1,
  so slots are 1/1 and headcount is duel-strength — annotated, not run as
  separate equal-slot/equal-gold battles). Equal-cost army-scale scenarios
  (§3) are where these lenses do real work; only the gold *annotation* landed.
- §6 **tunable-provenance gate**: the exhaustive no-`..` destructure of
  `Tunables` (48 fields) so a new field is a compile error until acknowledged.
  Deferred as a low-value speed-bump unless paired with real per-field guards;
  class-completeness IS covered by
  `balance_harness::duel_scenario_exists_for_every_class`.
- §7 replay emission — still design-for-later.

## Goal, in one sentence

Give the sim a **runtime-configurable balance surface** (per-class stats,
weapons, prices — injected, not compiled-in) and an **N-seed scenario harness**
that both test families run on, so that (a) balance tests become an exhaustive,
multi-lens, golden-pinned matrix plus authored multi-unit scenarios, (b)
behavior/physics tests stop being single-seed flaky, and (c) an AI agent can
sweep balance configs in-process — edit a config, run the scenarios over N
seeds, read the metrics, vibe-check, iterate — without recompiling.

Authority: **measured fact** (binding) and **proposed design** (deviate where
the code disagrees) are marked. Binding core: the balance surface is runtime-
injected, every scenario runs over N seeds, the families are separated, and the
completeness gates fail closed. The metric lenses and scenario set are proposed.
**No objective/fitness function yet** — the agent judges results by eye (see
*Deferred*); do not build an optimizer.

## The two families — and why this is one harness

A **balance** test asks *does combat performance match price?* A **behavior**
test asks *does a mechanism work?* (distance lowers morale; a charge breaks a
line; a braced pike stops a horse). They differ in shape — balance is an
exhaustive matrix generated from `ALL_CLASSES`; behavior is specific crafted
encounters, hand-authored, never generated — but they **share one runner**: the
same spawn-and-step sim, the same N-seed aggregation, the same scenario
descriptor. The harness is the common substrate; the families differ only in
what they assert.

| | Balance | Behavior / physics |
|---|---|---|
| Asks | performance vs price | does the mechanism work |
| Shape | exhaustive matrix + authored multi-unit | specific crafted encounters |
| Source | generated from `ALL_CLASSES` | hand-authored per claim |
| Assertion | matches golden table; agent vibe-checks fairness | a measured aggregate crosses a threshold |
| On new class | matrix grows; gate demands it | nothing |
| Shared | **N-seed runner, scenario descriptor, runtime config, replay-ready** | same |

*(measured fact)* Some tests filed as "scenarios" today are really balance
tests and should be reclassified into the balance family — e.g.
`crates/sim/tests/balance_matrix.rs:89 one_heavy_solos_two_lights_head_on`
(240 heavy beats 220+220 light): that is a *slot-efficiency* balance claim (see
below), not a physics mechanism.

## The evidence (measured fact)

- Registry spine: `crates/contract/src/lib.rs:12-54` — `enum UnitClassId` (9),
  `pub const ALL_CLASSES: [UnitClassId; 9]`.
- The balance surface is split across compile-time consts today:
  - `crates/sim/src/class.rs:151-324` `class_stats(id) -> UnitClass` — **hardcoded
    `const`-style match** (mass, brace_mult, health, block, evade, training,
    charge, tramples, drain_mult, `weapons`). This is the main thing you
    tune, and it is not injectable.
  - `crates/sim/src/class.rs:10-25,85-150` — `struct Weapon` (the five numbers)
    + 8 weapon consts. Also compile-time.
  - `crates/campaign/src/tunables.rs` — price, keyed by class:
    `recruit_cost_milligold`, `upkeep_per_soldier_milligold`, `unit_size`,
    `recruit_ticks_per_soldier`; plus `UPKEEP_UNIT_BASE = 4` gold/day **per
    roster entry** (`:130`). Compile-time functions.
- *What IS already runtime*: `Sim::new(tun: Tunables, seed: u64)`
  (`crates/sim/src/sim.rs:123`) — the 55 global physics params are injected.
  The pattern exists; the balance surface just hasn't joined it.
- Spawn API the harness builds on: `sim.spawn_class(pos, facing, count, class,
  team)`, `set_attack_order(a, b)`, `sim.tick()`, `sim.victor()` (see the
  one-heavy test body). `setup_duel(a, b)` (`crates/sim/src/battle.rs:196-222`)
  wraps it for pairs.
- Determinism (why N-seed and replay work): `Pcg32::new(seed, stream)`
  (`crates/contract/src/rng.rs`), `Sim::rng = Pcg32::new(seed, 0xda3e)`
  (`sim.rs:171`), state-hash golden `crates/sim/tests/golden.rs:40`.
- Matrix half-built: `balance_matrix.rs:39-62 duel()`; `measure_the_matrix()`
  runs all 81 pairs but only **prints** (proves runtime is cheap — 81 tiny
  2-unit headless duels run every session — and proves the assertion is
  missing); `the_counter_web_holds():120-147` asserts **12** matchups by hand.
- Suite size: ~112 `#[test]`s over 16 files.

## Rejected approaches — do not retry naively

- **Tuning by editing Rust consts + recompiling.** With `class_stats`/prices
  compiled in, every tuning iteration is a crate rebuild — fatal to an agent
  loop. The balance surface MUST be runtime-injected (the central change).
- **Blind full tunable cross-product.** 81 pairs × stance² × pace × charge × 7
  terrain × sweeping continuous tunables → effectively infinite, mostly
  redundant. Exhaustive over **classes** and a few justified axes; not blindly
  producted.
- **Generating the behavior suite.** Mechanisms aren't enumerable. Behavior
  stays authored.
- **"Equal gold ⇒ equal outcome" as an assertion.** *Wrong because of slot
  efficiency* (see below). A unit that wins above its gold cost but consumes
  fewer army slots can be correctly priced. The matrix REPORTS cost; it does not
  assert gold-fairness. Fairness is the agent's judgment for now.
- **Single-seed assertions.** One duel's outcome is RNG-dependent; both families
  chase noise on one seed. Every scenario runs over N seeds (below).
- **An objective/fitness function now.** Premature — the agent vibe-checks.
  Deferred, not designed.

## The design

### 1. Runtime balance surface — `BalanceConfig` (the unlock)

Lift the compile-time balance surface into an injected struct, mirroring how
`Tunables` is already injected:

```rust
pub struct BalanceConfig {
    pub stats:   [UnitClass; 9],   // was class_stats(id); indexed by UnitClassId
    pub weapons: WeaponTable,      // the 8 weapons / five-numbers each
    pub price:   [ClassPrice; 9],  // recruit_cost, upkeep, unit_size, slot_cost
}
impl Default for BalanceConfig { /* exactly today's hardcoded values */ }
```

- `class_stats(id)` becomes `config.stats[id]`; the weapon consts become entries
  in `config.weapons`; the campaign price functions read `config.price`.
- `Default::default()` reproduces today's numbers **byte for byte** — so with the
  default config, `golden.rs` and every existing test are unchanged. This is the
  proof the lift is behaviour-neutral.
- Construction: `Sim::new(tun, seed)` gains a config (or a `SimConfig { tun,
  balance }`). The agent sweeps configs against one compiled binary. *(proposed:
  load a `BalanceConfig` from a JSON/RON file so the agent edits data, not Rust;
  `serde` is already in the tree.)*

### 2. N-seed runner — shared by BOTH families *(binding: applies to all sim tests)*

A single primitive every scenario runs through:

```rust
fn run_over_seeds(scn: &Scenario, cfg: &SimConfig, seeds: &[u64]) -> Aggregate
// Aggregate: per-side survivor% (mean, median, min, max, stdev), win-rate over
// the seed set, median duration. SEEDS is a fixed committed set (e.g. 16).
```

- **Balance** cells report the aggregate across SEEDS; the golden pins
  medians/bands so seed jitter doesn't churn it.
- **Behavior** tests assert on the aggregate, not one seed: "heavy wins in ≥
  15/16 seeds", "median morale-break distance < X". This *removes the single-seed
  flakiness* that makes chaos-marginal tests wobble on recompile. The user's
  point: N-seed is a harness property, not a balance-only one.
- Variance is a first-class output: a matchup with high stdev across seeds is
  *itself* a finding (a coin-flip matchup), surfaced to the agent.

### 3. Scenario descriptor — beyond 1v1

Generalize `setup_duel` into a data descriptor any consumer builds:

```rust
pub struct Scenario {
    pub name: String,                       // deterministic: "<a>_vs_<b>__<axes>"
    pub sides: [Vec<(UnitClassId, u32)>; 2],// arbitrary force lists per side
    pub terrain: TerrainSpec,               // Open default; rough/hill/forest variants
    pub axes: Axes,                         // pace, charge, stance overrides
    pub dur_secs: f32,
}
```

- The **9×9 matrix** is generated `Scenario`s (each `sides = [[(a,n)],[(b,m)]]`).
- **Beyond 1v1** (authored balance scenarios): `1×Heavy vs 2×Light`,
  combined-arms blocks, and **price-matched armies of differing composition** —
  build both sides to ~equal gold (or equal slots) from free composition and
  expect rough parity *at army scale*. Composition-dependent, so the agent
  judges; not a single assertion.
- One runner consumes any `Scenario`; the matrix is just its generated input.

### 4. Three cost lenses + slot efficiency (the balance reading)

Each outcome is reported under three normalisations, because "fair" depends on
which budget is scarce:

- **Headcount lens** — equal men: raw combat power.
- **Gold lens** — equal `recruit_cost` (+ optional upkeep horizon): power per gold.
- **Slot lens** — equal roster entries (`UPKEEP_UNIT_BASE` is *per entry*; a
  stack has limited slots): power per army slot.

**Slot efficiency is why gold-fairness is not the target at small scale.** One
Heavy beating two Lights at ~3× the gold is *correct* if the Heavy takes one
slot to the Lights' two — you pay a premium for slot-efficient power because
slots are the scarce resource in a stack. So: equal-gold parity is the right
expectation only for **army-scale, free-composition** scenarios; fixed small-N
matchups (1v1, 2v1) are *characterisations* across the three lenses that the
agent reads, never an equal-gold assertion. The golden pins the numbers; the
only derived assertions are the directional **counter-web** relationships
(`beats(Phalanx, ShockCavalry)`), which hold regardless of lens.

### 5. The agent-facing harness (this is for the AI tuner)

One fast **native** (cargo, not wasm) entry:

```
balance::report(cfg: &SimConfig, scenarios: &[Scenario], seeds) -> Report
// Report: per-scenario Aggregate under all three lenses + diff vs a baseline cfg.
```

The loop the agent runs: read `Report` → notice a mispriced/dominant matchup →
edit `BalanceConfig` → `report()` again → compare. The **behavior suite is the
hard constraint**: any config the tuner proposes must keep every behavior test
green (physics must not be "balanced" away). Wire it so the agent can run the
behavior suite under a candidate config in one command. No objective function —
the agent decides "better" by eye and by the counter-web staying intact.

### 6. Gates that keep it honest

- **Class-completeness** *(binding)*: matrix dimension `== ALL_CLASSES.len()`,
  every variant present as attacker and defender; appending a variant fails
  until the golden is regenerated.
- **Tunable provenance** *(binding)*: every field of `BalanceConfig` AND
  `Tunables` is named in a `TUNABLE_GUARDS` table — i.e. has at least one test
  whose aggregate changes if it changes. Enforce field-completeness with an
  exhaustive `let BalanceConfig { stats, weapons, price } = cfg;` /
  `let Tunables { .. all fields .. } = t;` destructure **without `..`**, so a new
  field is a compile error until guarded.

### 7. Replay-ready (forward-looking, honor now)

Replays/dashboard don't exist yet, but every scenario is reproducible from
`(Scenario, BalanceConfig, seed)` — already what regenerates the golden. When
replay serialization lands, the harness emits one replay per (scenario, seed)
and a dashboard plays them in the battle renderer so a human watches what the
agent flagged. Honor now: serializable self-contained descriptors; reproducible
from `(descriptor, seed)` alone (no wall-clock, no `HashMap` order); 1:1
deterministic names. **Not in this spec's acceptance**, but a harness that
violates these would need rework to support replays.

## What must NOT change

1. **The five weapon numbers stay five** *(locked philosophy)*. `BalanceConfig`
   makes them editable, not more numerous. Formulas read men, mass, measured
   motion.
2. **Default config == today's numbers, byte-for-byte** *(binding)*. The lift to
   runtime is behaviour-neutral; `golden.rs` and every existing test pass
   unchanged under `BalanceConfig::default()`. If the default config moves any
   number, the lift is wrong.
3. **`golden.rs` state-hash + `Pcg32`/BTree determinism** *(locked)*. N-seed and
   replay depend on it; do not introduce `HashMap` iteration or unseeded RNG.
4. **The behavior suite's coverage** *(locked)*. Reclassifying a few tests into
   the balance family does not delete any mechanism test; generating the matrix
   replaces only `measure_the_matrix` and the bespoke duels in
   `the_counter_web_holds`.

## Contracts — the tests are the spec

Must BECOME true (acceptance):
- `BalanceConfig` injected through `Sim`; `class_stats`/weapon consts/price
  functions read it; `Default` reproduces today's numbers and the whole existing
  suite + `golden.rs` pass unchanged under it.
- `run_over_seeds` exists; the balance matrix and at least the behavior tests
  most prone to seed-wobble assert on N-seed aggregates.
- Generated, golden-pinned `ALL_CLASSES²` matrix across the three lenses;
  print-only `measure_the_matrix` gone; counter-web derived from the table; no
  bespoke duels left.
- ≥1 authored beyond-1v1 balance scenario per shape (NvM, price-matched army),
  using the shared `Scenario` runner.
- `balance::report(cfg, scenarios, seeds)` callable natively, returning per-lens
  aggregates + diff vs baseline — the agent harness.
- Class- and tunable-completeness gates verified to fail closed.
- Families separated/labelled; `one_heavy_solos_two_lights` filed under balance.

Must STAY green:
- `golden.rs`; every emergent behavior test (`combat_scenarios.rs`,
  `morale_scenarios.rs`, `class_scenarios.rs`, `missile_scenarios.rs`,
  `terrain_scenarios.rs`, …) — now over N seeds where they wobbled.
- `cargo test --workspace` wall-time sane: matrix is 81 × |axes| × |SEEDS| tiny
  duels; log the measured time; feature-gate heavy axes/seed-counts if needed.

## Process requirements

- `cargo test` before anything; debug probes shift float codegen — pin goldens
  from a clean build, never one with probes compiled in (known hazard). N-seed
  averaging also dampens this, but the rule stands.
- Re-pinning the balance golden is deliberate and reviewed, like re-blessing a
  screenshot baseline: regenerate, read the diff *as a balance review*, commit
  the golden in the change that moved it. Never auto-bless in CI.
- See the `balance-unit` skill for tuning one class by hand; this harness is the
  net + the loop that makes tuning systematic and, later, autonomous.

## Deferred (explicitly out of scope, by owner's call)

- **Objective/fitness function.** The agent vibe-checks for now; "price-matched
  armies should be about equal" is the eventual north star but is
  composition-dependent and confounded by slot efficiency, so it is not yet a
  computable target. Do not build an optimizer or a scalar fitness.
- **Replay emission + dashboard** — design-for (above), build later.

## Acceptance

- [ ] `BalanceConfig` lifted to runtime, injected via `Sim`; default byte-equal
      to today; full suite + `golden.rs` green under it.
- [ ] `run_over_seeds` shared primitive; balance cells and wobble-prone behavior
      tests assert on N-seed aggregates; variance reported.
- [ ] `Scenario` descriptor + one runner; 9×9 matrix generated through it;
      ≥1 authored beyond-1v1 balance scenario.
- [ ] Three cost lenses reported; golden-pinned; counter-web derived; print-only
      matrix deleted; slot-efficiency documented in the test, not asserted as
      gold-fairness.
- [ ] `balance::report(...)` native agent harness; behavior suite runnable under
      a candidate config as the hard constraint.
- [ ] Class- and tunable-completeness gates fail closed (verified once).
- [ ] Families separated/labelled; reclassified tests moved.
- [ ] Postmortem here (matrix size, wall-time, seeds chosen, what the first
      golden + lenses revealed about pricing), then delete this file.
