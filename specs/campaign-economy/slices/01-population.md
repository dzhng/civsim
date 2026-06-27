# Slice 01 — Population + the monthly tick

**Unlocks:** population as a first-class city resource that grows on a monthly
cadence. Nothing consumes it yet — this lands the spine and the clock.

## Seam
- `state.rs`: `CityState.population: u32`, plus a per-city growth-vs-cap state if
  needed. (Pre-release: no `#[serde(default)]` for migration — just add the field
  and seed it in `new_state`.)
- `tunables.rs`: `TICKS_PER_MONTH = 30 * TICKS_PER_DAY` (= 4,320); logistic
  growth params + per-tier population cap.
- `economy.rs` / `sim.rs`: a **monthly boundary** (`st.tick % TICKS_PER_MONTH ==
  0`) that advances population logistically. Decide here whether `day_tick`
  becomes `month_tick` or the monthly work is a new phase alongside it (see
  README known-unknowns).
- Seed initial population from city tier at `new_state` / map load.

## Human can run
- A mechanism test, and `city_json` / city-info floats now carry population so a
  probe (or the existing city panel) shows it climbing.

## Verifies
- `population_grows_toward_cap_monthly` — pop rises on month boundaries, fast
  when small, asymptotes to the tier cap; flat between boundaries.
- Determinism replay unchanged.

## Stays green
- Determinism (`external_ai_protocol`), save/load round-trips, the gate.

## Feedback that would change it
- Growth curve feel (too fast/slow), cap per tier, and whether population is
  per-city or pooled per region.
