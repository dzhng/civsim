# Campaign economy: population, policy, monthly books, loyalty

The campaign no longer micro-manages cities through build queues. A city is a
**population** steered by two **policy dials**; the realm settles its whole book
once a game-month; and a **loyalty gradient** is the overextension brake that
keeps a leader from snowballing uncatchably. Shipped in `crates/campaign`
(the change retired `market_lvl`/`barracks_lvl`/`build_job`/`BuildKind`/
`order_build` outright — no migration shims, pre-release).

## What it is

- **Population is the spine.** Each `CityState.population` grows logistically to
  a tier cap and is the source of *both* gold and the recruitment pool —
  recruiting spends people, so an army lost is population lost.
- **Two dials replace the build menu.** `CityState.focus` (Economy↔Military) and
  `CityState.throttle` (Grow↔Exploit). A city accumulates `econ_dev`/`mil_dev`
  momentum toward its focus and decays off-axis; "set a direction and walk away"
  literally works, the cost of indecision being ramp time.
- **The books settle monthly.** `economy::month_tick` runs on the
  `TICKS_PER_MONTH` boundary: gross income in, heavy army upkeep out, population
  + development + loyalty advance — one legible pulse. `economy::day_tick` keeps
  only the daily operational trickle (desertion, replenishment, garrison regen,
  recruit-queue progress).
- **Upkeep is heavy and load-bearing:** monthly upkeep is *exactly half* a
  unit's raise cost (`upkeep_per_soldier_milligold == recruit_cost_milligold / 2`,
  enforced for every unit-type option in `units::unit_type`). A standing army is
  a recurring bill, not a one-off buy — this is what caps a doomstack.
- **Loyalty is the overextension brake.** `economy::loyalty_month` drifts each
  city by the signed balance of friendly vs enemy *connected territory* (the road
  graph collapsed onto cities via `WorldMap::city_neighbors`), with armies acting
  as anchors at ≥`ANCHOR_MIN_UNITS`. A surrounded, abandoned conquest revolts to
  independents in ~a month; a stationed army holds it.
- **Conquest is a choice.** `economy::resolve_capture` resolves a captured city
  as **sack** (plunder + raze the populace) or **hold** (keep population, low
  starting loyalty), driven by the capturing army's `Army.sack_intent`.

## Why it works this way

- **A loyalty gradient, not a flat admin tax.** Three goals drove this work —
  fix the runaway leader, make army upkeep bite, move to a monthly cadence. We
  chose an *emergent* brake (loyalty diffusing over city adjacency) over a flat
  per-city admin cost because it produces a frontier/interior gradient for free:
  the core stabilizes and the rim stays restive, and a fresh conquest survives
  only while an army anchors it. Reckless expansion self-corrects; careful,
  contiguous expansion is allowed to hold.
- **The AI's value yardstick is deliberately decoupled from upkeep.** This is the
  load-bearing discovery of the build. Making upkeep monthly made it ~25× larger
  than the old daily rate — and `ai::strength` and `resolve::estimate` had reused
  `upkeep_per_soldier_milligold` as the unit-value yardstick. Left alone, that
  silently rescaled the army term in `eval::score` so a few casualties outweighed
  a whole city, and the AI stopped attacking (the gate stalled at zero battles).
  The fix is `economy::value_per_soldier_milligold` (≈ raise-cost / 50, the old
  scale), used by `ai::strength` and `estimate`, kept separate from the economic
  upkeep so the cadence can never rescale how the AI weighs armies vs. territory.
  All AI weights (`eval::Weights`, persona presets, `DIPLO_CITY_WEIGHT`,
  `AI_SELECT_SCALE`, `AI_BRAVADO_AGGRO`) remain calibrated against that stable
  scale.
- **Eval scores a city as flat territory + a loyalty *bonus*, not territory ×
  loyalty.** Territory must dominate so a fresh conquest (loyalty `CONQUEST_LOYALTY`)
  is still clearly worth taking; the loyalty term only nudges the commander toward
  ground it can hold. The hard brake is the revolt mechanic, not the score.
- **Eval income is gross, not net.** Folding upkeep into the income term
  perversely rewards *losing* an army (less to pay). The army's cost is already
  captured by the army term and by `think`'s upkeep-aware reserve, so
  `eval::score` reads gross monthly income.
- **The military-development unlock is a per-city recruit gate, not a doctrine
  lock.** `units::option_mil_dev_req` gates which class options a *city* can field
  in `economy::recruit`. The faction-wide class builder keeps every option
  selectable (`UnitUnlock::Default`) — a city's development can't lock a
  faction's doctrine choice.
- **Capture is owned by the resolution, not emergent AI timing.** `resolve_capture`
  flips ownership and applies sack/hold at the moment of capture (echoing the
  earlier siege-work lesson that an outcome which is the point of an action must
  be guaranteed at that action). The won-assault path in
  `resolve::apply_battle_outcome` pins the victor to `Stance::Occupying`, which
  flips through `economy::occupations` → `resolve_capture`.

## Invariants (must stay true)

- **Determinism.** BTree collections, armies in id order, all randomness from
  `st.rng`; `loyalty_month` is snapshot-then-apply. Fixed-seed replay is
  byte-identical (`tests/external_ai_protocol.rs`).
- **The gate** `full_game::lopsided_war_concludes` always concludes.
- **Upkeep == 50% of raise cost**, per option
  (`tests/economy.rs::upkeep_is_half_recruitment_monthly`).
- **The AI value yardstick is decoupled from the economic upkeep cadence** — if
  `ai::strength`/`estimate` ever read `upkeep_per_soldier_milligold` again, the
  army-vs-territory balance silently breaks. Use `value_per_soldier_milligold`.
- **Recruiting spends population and can't exceed the pool** (`economy::recruit`).
- **Save/load round-trips within the current version**; no backward compatibility.
- **The wasm boundary stays thin** (`campaign_bind.rs`); rebuild
  (`bun run build:wasm`) before the TS sees new methods.

## Pointers into the code

- **The economy:** `economy::month_tick`, `day_tick`, `loyalty_month`,
  `resolve_capture`, `set_city_policy`, `recruit`, `city_monthly_income`,
  `faction_monthly_income` / `faction_monthly_upkeep`,
  `value_per_soldier_milligold`, `garrison_establishment`.
- **Tunables:** `tunables::TICKS_PER_MONTH`, `CITY_POP_CAP`, `POP_GROWTH`,
  `city_monthly_income`, `DEV_RAMP`, `CONQUEST_LOYALTY`, `LOYALTY_DRIFT`,
  `LOYALTY_ENEMY_CITY`, `LOYALTY_ARMY_WEIGHT`, `ANCHOR_MIN_UNITS`, `SACK_*`,
  `recruit_cost_milligold` / `upkeep_per_soldier_milligold`.
- **State:** `state::CityState` (population/focus/throttle/econ_dev/mil_dev/
  loyalty), `Army::sack_intent`.
- **Topology:** `mapdata::WorldMap::city_neighbors`, `independents`.
- **Units:** `units::option_mil_dev_req`, `UnitUnlock`.
- **AI:** `ai::think` (defend / spend / set-policy / offensive / consolidate),
  `ai::strength`; `ai/eval.rs` (`Weights`, `score`); `ai/orders.rs`
  (`Order::SetPolicy`, `Order::Sack`); `ai/persona.rs`.
- **Battle handoff:** `resolve::estimate`, `apply_battle_outcome`.
- **Player/host surface:** `Campaign::order_set_city_policy`,
  `order_sack_intent`; `campaign_bind.rs` `city_json` / `economy_json`.
- **Tests that pin it:** `tests/economy.rs` (population, monthly books, policy/
  development, recruit-from-pool), `tests/loyalty.rs` (drain / anchor / revolt /
  sack-vs-hold), `tests/full_game.rs` (`lopsided_war_concludes`, and
  `grand_map_report` which reports runaway gap + population + mean loyalty).

## Dead ends and open calibration

- **Weighting a city by its instantaneous loyalty (territory × loyalty) — tried,
  reverted.** It shrank the conquest margin enough that the softmax in `ai::think`
  stopped reliably picking the attack, stalling the gate. Replaced with flat
  territory + a separate loyalty bonus term.
- **Net income in eval — tried, reverted.** It rewards army loss (less upkeep to
  pay); eval reads gross income.
- **`UnitUnlock::MilitaryDevelopment` doctrine lock — tried, reverted.** It
  disabled the auxiliary/elite options in the *faction* class-builder UI, but the
  requirement is per-city at recruit time. The gate lives in `recruit` only.
- **The runaway is not yet fully checked, by design of these numbers.** The
  harness shows a leader that expands as a contiguous blob stays loyal (~98%) and
  calcifies undefeated — the loyalty brake bites overextension (salients,
  abandoned conquests), not careful expansion. There is a real tension: an army
  anchor (`LOYALTY_ARMY_WEIGHT = 3`) must hold a two-enemy-surrounded conquest,
  which forces the enemy-border weight low enough that a well-backed frontier
  still climbs to full loyalty. The two can't both be satisfied by these weights
  alone — pushing the brake harder likely needs an empire-size admin component
  the loyalty gradient was chosen to avoid. The numbers (`LOYALTY_*`, `POP_*`,
  `INCOME_PER_POP_MILLIGOLD`, `DEV_RAMP`) are starting shapes to calibrate against
  `grand_map_report`, not settled values.
- **Sub-monthly vs monthly split (a resolved known-unknown):** income, upkeep,
  population, development, and loyalty settle monthly; desertion, replenishment,
  garrison regen, and recruit-queue progress stay daily.
- **The AI holds rather than sacks or explicitly anchors.** `Army.sack_intent`
  defaults off and the commander doesn't set it or plan garrison anchors;
  overextension self-corrects *reactively* via revolts rather than by foresight.
  Both are player-legal orders (`Order::Sack`, ordinary moves) left for the AI to
  learn to use.
