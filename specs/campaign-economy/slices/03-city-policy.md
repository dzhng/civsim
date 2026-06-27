# Slice 03 — City policy dials + auto-development (retire buildings)

**Unlocks:** the player's only city interaction — two dials — and the
development-as-momentum engine. Construction is gone.

## Seam
- `state.rs`: `CityState.focus` (Economy↔Military, e.g. f32 −1..1 or enum+slider),
  `CityState.throttle` (Grow↔Exploit), `CityState.development` (ramps toward
  focus, decays). Remove `market_lvl`, `barracks_lvl`, `build_job`, `BuildKind`.
- `economy.rs`: monthly — development ramps toward the focus target and decays
  off-axis; **economic output = f(population, econ-development, throttle)**;
  **garrison cap / military output = f(population, mil-development)**; throttle
  trades pop growth for immediate yield (Exploit can shrink population).
- New order `order_set_city_policy(node, focus, throttle)`; remove `order_build`.
  Garrison establishment (slice from `economy::garrison_establishment`) now keys
  off military development, not `barracks_lvl`/tier alone.

## Human can run
- Browser: the city panel shows **two sliders** instead of the build menu; drag
  them and watch development/output/garrison shift month to month.

## Verifies
- `military_focus_deepens_garrison_over_months`; `economy_focus_raises_output`;
  `exploit_trades_growth_for_yield`; `development_decays_when_focus_switches`.
- Determinism, save/load round-trips, the gate. Delete the building fields
  outright (no migration); new cities default to Balanced focus / Grow throttle.
- **AI touchpoint:** the commander still issues Build orders today — retiring them
  here breaks `think()`. Keep it emitting valid orders (a stub that sets a default
  policy is enough) so the gate stays green; *smart* policy play is slice 08.

## Stays green
- Gate, determinism, save/load. The wasm city-info / `city_json` updates +
  `npm run build:wasm`.

## Feedback that would change it
- One 2-axis control vs two sliders; ramp/decay speed; whether Exploit should be
  able to *destroy* population or only stall growth.
