# Slice 02 — Strike-field weapon model

## Contract
Every weapon's reach is described by one data structure — a **strike field**: the
set of `(angle-lobe, min/max reach)` relative to the soldier's facing where it can
land. The `mounted_swing` flank-lobe branch, the `braced` pike branch, and the foot
front-cone all collapse into *data*, and target/face/seek/strike all read it.

## Seam
- New type (e.g. `class.rs` or a `strike.rs`):
  ```
  struct StrikeField { lobes: SmallVec<[Lobe; 2]> }   // 1 for sword/pike, 2 for sabre
  struct Lobe { c: f32, half: f32, min_r: f32, max_r: f32 }  // center angle, half-width
  ```
  Derive it from `Weapon` + `mounted` (a wide-arc mounted weapon → two flank lobes;
  a thin/braced weapon → one front lobe). One function: `fn strike_field(weapon,
  mounted) -> StrikeField`.
- `combat.rs` strike resolve (`in_field`, ~`664`): replace the
  `if mounted_swing { off>BLIND_FRONT && off<BLIND_REAR } else { off<=arc/2 }`
  branch with `field.contains(off, dist)`. The `MOUNTED_SWING_BLIND_*`,
  `MOUNTED_SWING_ARC_MIN`, `braced` pike-bearing constants become field data.
- Expose `field.nearest_edge_bearing(foe_bearing) -> f32` for slice 01's turn cost
  and slice 04's facing.

## What the human can run
A unit-test table: for each `(class, weapon-in-hand)` print its lobes; assert
sword=1 front lobe, sabre=2 flank lobes, pike=1 narrow long front lobe. A tiny
HTML/ASCII viz of the lobes per class would make this reviewable at a glance
(`specs/combat-arcs/visualizations/strike-fields.html`).

## Verify
- `mechanics_charge`, `combat_scenarios::pikes_bite_only_to_the_front`,
  `mechanics_trample` (sabre flank kills) must reproduce today's strike outcomes
  **before** any behavior change — this slice is a refactor of representation, not
  behavior. Same kills in / out.
- `golden_state_hash` should ideally NOT move (pure representation change). If it
  moves, the field derivation isn't bit-identical to the old branches — investigate.

## Must stay green
Everything — this is a behavior-preserving refactor. Land it green, *then* 01/03/04
change behavior on top of it.

## Feedback that changes this slice
If two lobes for the sabre is awkward, a single lobe with a *hole* (front blind
gap) is an alternative encoding — pick whichever makes `contains` and
`nearest_edge` cleanest.
