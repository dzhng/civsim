---
name: balance-unit
description: Given a price and a plain-language unit description (melee/ranged, shields, light/heavy, mounted, pole-arm, etc.), fill in the full stat block to fit the game's balance and write the matchup tests that pin it. Use when adding or re-pricing a unit class, or when David hands you "a unit that costs X and is roughly Y".
---

# Balancing a new (or re-priced) unit

You are handed a **price** and a **sketch** ("a 600-gold shielded medium
spearman", "a cheap unarmored javelin skirmisher", "an elite 1600-gold
heavy lancer"). Turn that into a full `UnitClass` (and `MissileSpec` if
ranged) that sits correctly in the existing economy, then write the
balance tests that lock it there. Work physics-first: every stat is a
physical fact (armor, reach, mass, drill), never a free "power level".

## Step 1 — read the description onto the stat axes

Each `UnitClass` field is one physical axis. Map the words to numbers by
interpolating against the shipped classes (the anchors, `crates/sim/src/class.rs`):

| Axis | Field | What the word means | Anchors |
|---|---|---|---|
| Armor / body | `health` | "unarmored" → low, "heavy/armored" → high. This is THE armor axis. | peasant 1.0 · longsword 1.49 · light sword 1.5 · light spear 1.55 · pike 2.2 · heavy sword / heavy spear 2.4 · (horse body `mount_health` 6.5–8.45) |
| Shield | `block` | front-arc block vs melee AND arrows; "shieldless" 0.0, "light shield" 0.3–0.35, "big shield" 0.45–0.55 | shieldless (skirm/archer/peasant/HA) 0.0 · longsword 0.1 (blade parry, no shield) · light sword 0.3 · light spear 0.35 · cav 0.4 · heavy sword / heavy spear 0.45 · pike 0.55 |
| Agility | `evade` | parry/dodge, DIRECTIONAL (front full, 0.25× from behind); "nimble/loose" high, "armored/packed" low | heavy/pike 0.08 · light spear 0.15 · light sword 0.18 · archer 0.28 · longsword 0.35 · skirm 0.42 |
| Weight | `mass` | body + kit; drives push, charge resistance, who-shoves-whom | skirm 0.85 · light 0.95 · longsword 1.1 · pike 1.2 · heavy 1.3 · horse 3.8–4.5 |
| Discipline | `brace_mult` | planted-formation mass multiplier (halted); "drilled wall" high, "loose/missile/mounted" 1.0 | missile/mounted 1.0 · foot 1.3 · heavy 2.0 · pike 4.0 |
| Drill | `training` | morale endurance + cohesion recovery; "levy/rabble" low, "elite/professional" high | skirm 0.5 · light 0.55 · heavy/longsword/pike 0.75–0.8 |
| Endurance | `drain_mult` | stamina cost of the kit; "light/fast" cheap, "heavy armor" dear | skirm 0.65 · light/archer 0.85 · pike 1.3 · heavy 1.35 |
| Pace | `speed_mult` | foot 0.85 (pike) – 1.2 (skirm); horse 2.6–2.8 | pike 0.85 · heavy 0.9 · light 1.1 · skirm 1.2 · horse 2.6–2.8 |
| Footprint | `soldier_radius`, `spacing`, `default_depth` | looser order = bigger spacing/radius; deep formations (pike) 8+, loose 6 | start from the nearest archetype; rarely the balance lever |

Booleans/specials: `mounted` (two-circle body + rider pool — set
`mount_health`), `tramples` (rides through contact — mounted), `charge`
(bursts in the final approach), `knockback_mult` (felling damage its body
DEALS: foot 0.35 when charging, light horse 0.5, heavy horse 1.0; a pure
ram like a chariot would be high here with near-zero weapon dps).

## Step 2 — pick the weapon (a weapon is FIVE numbers, never six)

`reach, min_range, arc, attack_interval, damage`. Reuse a template if it
fits (`SWORD`, `SPEAR`, `LONG_SWORD`, `PIKE`, `LANCE`, …); only add a new
`const` for a genuinely new profile. The physics that matter:

- **reach is the anti-cavalry axis** — the impale term stops a charge at
  reach, scaling with `((reach − 1.0)/2.2)²`. Sword 1.1 ≈ no stop; spear
  1.6 ≈ a little; pike 3.2 ≈ a wall. A "spearman who can blunt horse"
  needs reach ≥ ~1.6; a "pikeman who stops it" needs ~3.0+.
- **arc** is the sweep: wide (1.4 sword, 2.4 long-sword) hits multiple
  loose foes and cleaves; narrow (0.08 pike, 0.22 lance) is a single
  point. Wide arcs reward fighting loose enemies, choke in a packed press.
- **damage / attack_interval = work rate.** This is the main melee
  balance dial. Gladius is 0.2/1.79; a slower heavier weapon trades rate
  for reach or a stop.
- **min_range** > 0 makes a weapon useless once a body is inside it (pike
  1.1) — the historical "get inside the sarissas" weakness.

Ranged: add a `MissileSpec` (`crates/sim/src/missiles.rs`) —
`range, launch_speed, interval, ammo, damage, scatter_at_max,
mobile_fire`. Ranged balance is governed by the ranged contracts (see
`ranged_scenarios.rs`): archery SOFTENS, never gates. A frontal advance
should pay a survivable toll (heavy 8–22%, light 2–11%, cav ≤8%), shields
are a front-arc fact (rear ≥2.5× front kills), and a unit that lets the
line reach it dies by the sword. Keep arrow `damage` in the ~0.5–0.9 band
and let ammo/interval set sustained output.

## Step 3 — set the price, or honor the given one

`crates/contract/src/lib.rs::unit_cost`. The anchors are David's: **light
spear 300, heavy sword 1000** (a heavy unit beats two lights head-on — the
premium prices concentration of force, not raw efficiency). Current board:
PEA 175 · SKR 250 · LSP (light spear) 300 · LSD (light sword) 400 · LSW
(long sword) 450 · ARC 500 · ART 700 · HSD (heavy sword) 1000 · HAR 1100 ·
HSP (heavy spear) 1100 · PIK 1300 · CAV 1400. (Infantry is a {light,heavy}×
{sword,spear} 2×2: sword = aggressive arc, spear = anti-charge brace.)

The pricing principle: **cost ≈ what the matrix says it beats.** A unit
that hard-counters expensive things (pike vs cav, cav vs foot) prices
high; a unit everything beats (artillery alone, skirmishers in melee)
prices low even if individually capable, because it needs escort. If
David gives the price, the price is fixed — tune the STATS so the unit's
matrix performance justifies that price (a 600-gold unit should roughly
trade evenly with other ~600-gold units and lose to ~1000-gold ones
head-on, winning only where its archetype counters theirs).

`unit_cost` is exported through `game-wasm::class_specs` and shown on the
stat card — no other wiring needed.

## Step 4 — measure, calibrate, pin (the actual loop)

1. **Measure the board.** The full board is `golden_balance_matrix` in
   `balance_matrix.rs` — generated from `ALL_CLASSES²` (12×12 = 144 cells
   today), seed-median over `SEEDS`, with the `unit_cost` gold lens per cell.
   It's `#[ignore]`d (runs ~minutes), so measure/re-bless on demand:
   `UPDATE_BALANCE=1 cargo test -p sim --test balance_matrix
   golden_balance_matrix -- --ignored --nocapture` writes
   `tests/golden/balance-matrix.txt` and prints it; read the diff AS the
   balance review. Add the new class to `ALL_CLASSES`/`short()` first (and bump
   the count assert in `duel_scenario_exists_for_every_class`). The fast
   always-on net is `the_counter_web_holds` (single-seed directional gate). For
   a *seed-robust* read of one matchup without the whole board, call the harness
   directly: `sim::balance::run_over_seeds(&Scenario::duel(a, b),
   &BalanceConfig::default(), &Tunables::default(), &SEEDS)` and read the
   `Aggregate` — win-rate and survivor **stdev** tell you edge vs coin-flip.
2. **Calibrate to the archetype's counters**, not to "wins more". Tune the
   handful of stats from Step 1 until the new unit beats what its sketch
   says it should and loses to what should beat it. Re-run the matrix.
   Expect knock-on: a damage/hp change ripples; re-judge the mirror pacing
   (`pacing_scenarios`) and the anchor (`one_heavy_solos_two_lights`).
   Stats are runtime-injectable now (`BalanceConfig` via `Sim::with_balance`):
   to trial a change without editing `class.rs`, build a candidate config and
   read `sim::balance::report(&candidate, &scenarios, &SEEDS)` — the
   baseline-vs-candidate deltas. Commit the winning numbers back into
   `class.rs` (the `Default` must always equal the tables).
3. **Pin contracts** in `balance_matrix.rs::the_counter_web_holds` — add
   the new unit's defining matchups (what it counters, what counters it)
   as `(attacker, defender, expected_winner)` rows with a one-line "why".
   These are the regression net.
4. **Write the archetype's signature test** if it has a mechanic-level
   claim (a spear that blunts a charge → a charge-break assert like
   `a_pike_hedge_breaks_the_charge`; a shield unit → an aspect test like
   `shields_are_a_front_arc_fact`). Anchor it to the design contract, not
   the current number.

## Reference: the matchup web these must respect

PIK > HSD (heavy sword) > LSP (light spear) (armor beats numbers, reach
beats armor). PIK breaks frontal CAV (points stop horse); CAV beats
everything else incl HAR; HAR kites foot but loses to pike patience (ammo
runs out); ART dies alone; SKR/ARC soften then lose the melee. A new unit
must slot into this without
inverting it — if your shielded spearman suddenly beats heavy infantry
AND pikes AND cavalry, the stats are too generous; find the one axis its
sketch doesn't justify and cut it.

## Process (inherited from write-tests, non-negotiable)

- Cargo first (`--no-fail-fast`, check `rc`, ~25s); browser verify last.
- The golden hash moves on any sim-value change — re-pin deliberately,
  once, in the same commit, from the printed actual.
- Expect 2–4 chaos-marginal tests to wobble on combat/class edits;
  re-judge on the final shape only, widen a margin only with a comment
  declaring it chaos-marginal. NEVER re-pin a contract to current
  behavior — that is how the suite once certified a 19× bug.
- Concurrent sessions are real (campaign work runs in parallel): scope
  commits to the sim files you touched; never `git checkout` over files
  that may hold someone else's work.
