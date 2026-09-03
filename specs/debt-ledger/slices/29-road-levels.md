# 29 — road-levels

**Contract unlocked:** the campaign model holds only what production writes.
`road_levels` is always `vec![1; edges.len()]` and `road_mult(1) == 1.0`, so
this is a pure delete.

## Seam

Delete: `state.rs:313 road_levels`; the load fix-up in `Campaign::load`
(`lib.rs:342-345`); `sim.rs:640` init and every read (`:163, 322, 356-374,
698, 741, 778`); `ai/plan.rs:105, 178`; the `roads: &[u8]` parameter on all
seven `pathfind.rs` functions (88-102, 129, 168, 202, 218, 265) and the
`road_mult` divisions inside them; `army_base_speed` (`sim.rs:113-131`)
parameter; `tunables.rs:131-136` (`ROAD_SPEED_MULT`, `ROAD_MAX_LEVEL`,
`road_mult`); wasm `road_levels_ptr` (`campaign_bind.rs:360-363`);
`web/src/campaign/views.ts:33, 71, 83`; `campaign/scene.ts:134, 430`
(assigned, never read). Tests: `orders.rs:67 higher_level_road_marches_faster`
dies; `orders.rs:90 routing_prefers_the_faster_parallel_route` is re-based on
a tile-feature cost difference or dies.

No save migration: `save_load.rs` is A==B and no pinned save JSON exists.

Lands after slice 18 or coordinated with it (`views.ts`, `scene.ts`).

## Decisions resolved here

Hard delete; no compat (David).

## Delegated to the implementer

None.

## Verification

- `cargo test -p campaign` incl. slice 28's golden **unchanged**
  (`road_mult(1) == 1.0` — if the hash moves, something else changed).
- G-wasm, `campaign-save-load`, `campaign-conquest`, G-camp at **0 px**.

## Must stay green

Campaign golden; all campaign scenes.

## Feedback that would change this slice

None.
