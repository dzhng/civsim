# Campaign economy: population, policy, and overextension

Replace city micro-management (build queues, market/barracks levels) with a
**population-driven, policy-steered, auto-developing** economy on a **monthly
cadence** — and use it to fix the runaway-leader problem at the root.

## North star

The player runs a **portfolio**, not a build list. You set a few policies per
city and per faction; cities develop on their own. The whole realm settles its
books once a game-month in one legible pulse. No faction snowballs out of reach,
no free doomstacks, wars keep resolving.

## The model

**Population is the spine.** Each city has a population that grows logistically
(fast when small, slows toward a cap). Population is the source of *both*
economic output and the military recruitment pool. Policy decides how it's
converted.

**Two dials per city** (no build menu):
- **Focus**: Economy ↔ Military — what the city develops toward.
- **Throttle**: Grow ↔ Exploit — invest in more population, or extract more from
  what you have now.

**Development is momentum, not construction.** A city accumulates *development*
in whatever you've pointed it at; it ramps slowly toward a cap and decays slowly
when you stop. "Set a direction and walk away" literally works — a city left on
Military becomes a fortress-town (deep garrison, elite unlocks); switch it and it
re-tools over months. The cost of indecision is ramp time, not a menu.

**Overextension is emergent, via a loyalty gradient** — not a flat admin tax and
no capital. Each month a city's loyalty **drifts by the balance of friendly vs
enemy connected territory** (neighbouring cities, weighted by *their* loyalty so
it propagates — plus **armies**, which act like a city when they hold **≥10 units**
and scale down below). More enemy-connected than own → loyalty **falls**; net
friendly → it climbs. So the **frontier is disloyal by default**, the interior
fills in as the core stabilises, and a fresh conquest (which starts with only a
little loyalty) survives only while a **stationed army anchors it** — march the
army off a surrounded city and it **revolts in ~a month**. Low loyalty drags
output *and* growth, so the rim stays small and poor; a sprawling empire is a
restive frontier the leader must garrison or lose, and rebellions are the trailing
power's comeback.

**The monthly pulse.** `game-month = 30 game-days = 4,320 ticks ≈ 72 s real at
1×`. Once a month: income in, upkeep out, net to treasury, pop/development/loyalty
advance. All economic rates are expressed **per month**. Army upkeep is heavy:
**monthly upkeep = 50% of recruitment cost**.

**Conquest is a choice.** Taking a city: **sack** (instant gold, population
destroyed — deny the enemy) or **hold** (keep population, slow to pacify, a real
asset). Ties straight into the existing siege/occupation path.

## Slice graph

Built measure-first; each slice is independently verifiable and leaves a runnable
artifact. Later slices depend on earlier ones left-to-right.

```
00 baseline-harness ── the yardstick (runaway gap, economy/army curves)
        │
01 population ──────── pop + TICKS_PER_MONTH + monthly tick (resource only)
        │
02 monthly-economy ── income & heavy upkeep settle monthly, derived from pop
        │
03 city-policy ─────── Focus + Throttle dials, auto-development (retire buildings)
        │
        ├── 04 recruit-from-pool ── pool draw + city-gated class unlocks
        │
05 loyalty-overextension ── unrest, revolts, conquest yields little until pacified  [runaway fix]
        │
06 sack-vs-hold ───── conquest choice on capture (hooks the siege path)
        │
07 economics-panel ── monthly income/upkeep/net breakdown (legibility)
        │
08 ai-policy ──────── commander sets policies, respects overextension, lives in budget
```

**Deferred / spicy add-ons** (separate slices once the core lands): faction
**war-economy** stance (realm-wide exploit/military burst), population
**migration** (pop flows toward safety/prosperity).

**How to read these slices.** This plan is built to run in a goal loop that
explores approaches. Each slice fixes the **contracts** — the invariants that
must stay green and the verification that judges success — and deliberately
leaves the **how** open. Numbers (growth curves, weights, rates, thresholds) and
implementation strategy are discovered against the harness, not pre-committed
here; treat the formulas as starting shapes, not specifications.

## Scope decisions (recommended — edit if wrong)

- **v1 = slices 00–08.** War-economy and migration deferred.
- **Keep the doctrine / class-builder**; graft the per-city unlock ladder onto
  it (military development gates which class options a city can recruit).
- **Retire** `market_lvl`, `barracks_lvl`, `build_job`, `BuildKind`, the
  construction tick, and `order_build` outright — delete them, no shims. The game
  is pre-release, so there is **no save back-compat to preserve**: change structs
  freely, initialize new fields in `new_state`, no `#[serde(default)]`-for-migration.
- **No capital.** Loyalty needs no central reference — it diffuses over city
  adjacency (road graph), so the frontier caps low and the interior fills in. A
  city's ceiling comes from its neighbours' ownership + loyalty (slice 05).

## Sacred contracts (must stay green)

- **Determinism.** BTree collections, armies in id order, all randomness from
  `st.rng`; fixed seed replays byte-identical (`external_ai_protocol.rs`).
- **The gate** `full_game::lopsided_war_concludes` always concludes.
- **Save/load round-trips** within the current version (the off-thread worker
  snapshots via `save`, so it must serialize correctly) — tuple-keyed maps still
  use `pair_key_map`. But **no backward compatibility**: loading a pre-change save
  is a non-goal; don't carry migration shims.
- **The wasm boundary stays thin** (`campaign_bind.rs`); rebuild
  (`npm run build:wasm`) before the TS sees new methods.
- Ticks are game-minutes; node ids are 0-based in state.

## Review map

- **Sim correctness** (cargo, fast): 01, 02, 04, 05, 06 — mechanism tests on
  inline-JSON fixtures, AI off where the outcome must be owned by the mechanic.
- **Macro health** (harness numbers): 00 sets the baseline; 05 and 08 are judged
  against it (runaway gap shrinks, army size tracks territory, gate concludes).
- **Browser / screenshot**: 03 (policy sliders replace the building menu), 07
  (economics panel), 06 (capture choice UI).
- **Behaviour** (seed-set, distribution): 08 — warmonger vs turtle still diverge.

## Known unknowns (calibrate against the harness, don't guess)

- Logistic growth params and the population cap per tier.
- Monthly income = f(pop, econ-development) and the income↔upkeep ratio that
  makes armies bite without freezing recruitment.
- Loyalty diffusion: neighbour-support weights, enemy-neighbour penalty, the
  monthly relaxation rate (how many months to pacify), and the revolt threshold —
  how hard the gradient caps a leader.
- Development ramp/decay rates; the military-unlock thresholds.
- Exactly what still ticks sub-monthly (recruit/build progress, garrison regen)
  vs settles on the monthly pulse.
