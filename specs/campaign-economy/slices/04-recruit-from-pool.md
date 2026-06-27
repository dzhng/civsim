# Slice 04 — Recruit from the population pool + city-gated unlocks

**Unlocks:** recruiting draws from population, and military development unlocks
deeper class options per city. Cities gain identity.

## Seam
- `economy.rs` recruit path: a muster draws from `CityState.population` (the
  pool); can't exceed available pop; population is spent (ties army loss to lost
  population — recruiting is investing the city's people).
- `units.rs` / doctrine: the per-city **unlock ladder** keyed to military
  development — a city must reach development N to offer a class's deeper options
  (graft onto the existing class-builder, do not replace it).
- Wasm: recruit options reported per-city reflect unlocks + available pool.

## Human can run
- Browser: a city's recruit menu shows what *that* city can field and how much
  pool remains; a long-military city unlocks elites the heartland can't.

## Verifies
- `recruit_capped_by_population`; `recruiting_spends_population`;
  `military_city_unlocks_elite_class`; determinism.

## Stays green
- Gate, determinism, save/load. `recruiting_delivers_a_new_army` adapts to the
  pool draw. Besieged city still can't complete a muster (existing rule).
- **AI touchpoint:** the commander's recruit calls must respect the pool cap so
  the gate stays green; smart pool/unlock use is tuned in slice 08.

## Feedback that would change it
- Whether pop spent on recruits returns on disband, the unlock thresholds, and
  how visibly the pool constrains early-game army size.
