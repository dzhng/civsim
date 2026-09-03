# 26 — steer-split

**Contract unlocked:** the three god functions and the tick's inlined slot
policy are split along their existing banner comments into owners a reader
can name. Every sub-slice is a pure move proven by golden-hash identity.

## Seam

```rust
// crates/sim/src/steer/mod.rs
pub(crate) struct UnitPre { pub sprint_sp: f32, pub surge_sp: f32, pub keep_up_sp: f32, pub reach: f32,
    pub advancing: bool, pub strict_formation: bool, pub slot_pull: f32, pub broad_press: f32,
    pub soldier_at_slot: Vec<usize>, pub projected_pivot: Vec<Vec2>, pub mounted_threat_near: bool }
pub(crate) struct SoldierCtx<'a> { pub i: usize, pub u: &'a Unit, pub p: Vec2, pub f: Vec2, pub r: Vec2,
    pub pre: &'a UnitPre, pub aware: bool, pub engaged: bool, pub order_advancing: bool, pub trampling: bool }
pub(crate) fn precompute_unit(sim: &Sim, ui: usize, snap: &[Threat]) -> UnitPre;           // sim.rs:1890-2110
pub(crate) fn slot_neighbours(u: &Unit, pre: &UnitPre, si: usize, skip: usize, alive: &[u8], trampled: &[u8]) -> impl Iterator<Item = (usize, Vec2)>; // one walk for pivot_bond (2018) and weave_bond (2376)
pub(crate) fn weave_forces(ctx: &SoldierCtx, …) -> WeaveAccum;                              // 2376-2500
pub(crate) fn speed_caps(ctx: &SoldierCtx, …) -> f32;                                       // 2508-2590, 3037-3130
pub(crate) fn soldier_facing(ctx: &SoldierCtx, …) -> f32;                                   // 3267-3380
// crates/sim/src/unit.rs
pub(crate) fn slide_halted_frames(…);  // sim.rs:1004-1100
pub(crate) fn reform_slots(…);         // sim.rs:1102-1230
// crates/sim/src/separation/{bodies,weapon_repel,walls}.rs  // collision.rs:48, 616, 815 sections
// combat.rs: run_combat (162-877) split at its banners; strike stays its own fn
```

## Sub-slices, one extraction each, golden-identical after every one

26a `slide_halted_frames` + `reform_slots` · 26b `precompute_unit` · 26c
`slot_neighbours` + `weave_forces` (the two closures walk the same four
directions — one iterator, same per-neighbour operation order, same
accumulation order) · 26d `speed_caps` + `soldier_facing` · 26e collision
`separation/` · 26f combat sections.

Operational definition of "pure move": the golden hash (positions, facings,
cohesion, stamina, `loosing_ttl` at 45 s, `golden.rs:31`) is unchanged and the
force-trace residual holds. Moving code between functions is invisible;
changing the association of any `+`/`*` chain or hoisting a term across an
`f32` accumulation is not. Borrow-driven evaluation-order changes are the
killer: extract one section at a time and run G-infra after each.

## Decisions resolved here

Split along the banners that already exist; `SoldierCtx` carries what the
section reads (the recon table of reads/writes per section is the guide).

## Delegated to the implementer

Field set of `SoldierCtx`/`UnitPre` beyond the listed ones; file names under
`steer/` and `separation/`.

## Verification

Per sub-slice: G-infra identical, G-ft, G-mech (`mechanics_weave`,
`mechanics_melee`, `mechanics_settle`, `mechanics_formation`), G-scn. At the
end: `sim.rs` ≤ 1,800 lines, no function over 400 lines; `codex review` on
the whole series.

## Must stay green

Golden hash after every sub-slice. A moved hash aborts the sub-slice; find the
reorder, do not re-pin.

## Feedback that would change this slice

None.
