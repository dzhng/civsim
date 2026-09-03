# 31 — campaign-literals

**Contract unlocked:** constructors, cost lookups, field dimensions, and test
helpers each have one owner in the campaign crates; dead knobs are gone.

## Items

- `Army::new(id, faction, roster, loc) -> Army` (+ `.garrisoned(node)`)
  replaces the nine-default-field literals at `economy.rs:355-374, 757-771,
  813-827`, `sim.rs:590-618`. `Encounter::new(st, attacker, defender, prep,
  ambush)` replaces `sim.rs:88-99, 482-493`.
- One `per_soldier_milligold(class, kind: Cost) -> u32` behind
  `cost_per_soldier_milligold`, `upkeep_…`, `value_…` (`economy.rs:91-131`);
  `resolve::estimate` (`resolve.rs:409-413`) calls it instead of re-deriving
  `(cost/50).max(1)`; `tunables::unit_establishment` (73-75) deleted in favour
  of `contract::unit_size`. The value/upkeep decoupling (economy.rs:115-120)
  is preserved — it is a documented decision.
- Field dims: `contract::FIELD_{HALF_W,HALF_H,CELL}` (`contract/lib.rs:331-341`
  already holds them as defaults) consumed by `battlegen.rs:10-12` and
  `sim/maps.rs:24-25`.
- Delete `REPLENISH_HOSTILE` (`tunables.rs:310`, 0 uses; fix the doc at
  306-307 that promises three tiers), `Campaign::order_sack_intent`
  (`lib.rs:175-178`) and its wasm export (`campaign_bind.rs:375-379`, 0
  callers).
- `tests/common`: `real_map()` (4 copies), `lopsided_map` (2), `run_month` (2),
  `garrison` (2).

## Decisions resolved here

`Army::new` takes the four fields every caller sets; everything else defaults.

## Delegated to the implementer

Whether `Cost` is an enum or three fns over one table.

## Verification

- Slice 28 golden **unchanged**; `cargo test -p campaign -p contract -p sim`;
  G-wasm + `campaign-production`.

## Must stay green

Campaign golden.

## Feedback that would change this slice

None.
