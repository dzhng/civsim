# Slice 02 — Monthly economy: income & heavy upkeep

**Unlocks:** the books settle once a month, income derives from population, and
upkeep is heavy. The economic restructure from daily trickle to monthly pulse.

## Seam
- `economy.rs`: move income + upkeep settlement to the monthly boundary. Income =
  f(population) (focus multiplier arrives in slice 03; here use a flat
  population→gold rate). Net hits `Faction.treasury` in one step.
- `tunables.rs`: **monthly upkeep = 50% of recruitment cost** — restructure
  `recruit_cost_milligold` / `upkeep_per_soldier_milligold` so `recruit = 2 ×
  monthly_upkeep`; express upkeep per month. Retire the daily upkeep trickle.
- Keep desertion-on-bankruptcy, but on the monthly cadence.

## Human can run
- Economy tests + the harness (00): treasury now moves in monthly steps; compare
  army-affordability vs baseline.

## Verifies
- `monthly_books_settle` — on a month boundary treasury changes by exactly
  (income − upkeep); unchanged between boundaries.
- `upkeep_is_half_recruitment_monthly` — assert the ratio holds per class.
- `broke_faction_bleeds_soldiers` still holds (monthly).
- The gate concludes; harness shows armies are now a real fraction of income.

## Stays green
- Determinism, save/load, the gate. Recruitment cost paid up-front unchanged in
  shape (only the number moves).

## Feedback that would change it
- The income↔upkeep ratio (how many units a city of population P can sustain),
  and whether bankruptcy desertion is too punishing on a monthly lump.
