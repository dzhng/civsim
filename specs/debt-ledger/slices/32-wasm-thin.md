# 32 — wasm-thin

**Contract unlocked:** `game-wasm` marshals; it does not compute. Game logic
that lived in the binding moves to the crate that owns the concept.

## Items

- `campaign_bind.rs:54-96 resolved_unit_stats` →
  `campaign::units::{UnitOption, resolved_stats(class, opt) -> UnitClass}`.
  Delete the unreachable `n if n > 2` arm (85-92; `units.rs:83` rejects ≥ 3,
  `lib.rs:363-371` normalizes) and the dead "Reform" arms at `units.rs:58, 64,
  137`.
- `class_specs` (`lib.rs:212-231`): the positional `weapon_names` /
  `missile_names` arrays become one `contract::CLASS_SPECS: [ClassSpec; N]`
  beside `ALL_CLASSES`, so a class and its names cannot drift.
- `generated_map_manifest`: one owner (the method at 385-402 delegates to the
  free fn at 54-61 with the default recipe; the hand-written fallback JSON at
  388-400 is deleted).
- `refresh()` stance→`pie_kind` state machine (`campaign_bind.rs:711-760`) →
  a `campaign` function the binding calls.
- `derived_site_seed` (209-219) calls `loc_decode` (43-52).
- The seven `generated_vista_band_*` scalar getters (404-437) **stay**: their
  reader (`web/src/battle/scene.ts:2353`) is the pointer-rule contract, and a
  packed header would be a new ABI for no consumer gain.

## Decisions resolved here

Binding = marshalling. Scalar getters stay.

## Delegated to the implementer

Where the pie-kind function lives (`campaign::sim` or `campaign::state`).

## Verification

- `cargo test -p campaign -p game-wasm -p contract`; slice 28 golden
  unchanged; G-wasm; `campaign-production` (`__campaign` stats),
  `campaign-handoff` (`renderStats.soldiers === stats.soldiers`).
- `wc -l crates/game-wasm/src/*.rs` drops by ≈ 120.

## Must stay green

Campaign golden; wasm exports used by `web/src` (grep before deleting any).

## Feedback that would change this slice

None.
