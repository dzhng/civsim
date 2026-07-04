# 04 — Hydrology: lakes and drainage that obey gravity

Water sits only where the landform says it can — fixing the salvage ledger's
rivers-run-uphill flaw with flow-respecting derivation.

## Contract unlocked

`genmap/hydrology.rs`: lake pockets, streams, marsh fringes as recipe-budgeted
features derived from the heightfield.

## API seam

- **Priority-flood depression filling** (Barnes et al. 2014): fill without
  epsilon, diff against the original — the diff *is* the lake mask, the fill
  level *is* the water level. Lakes get water tint + speed 0; a marsh/mud
  fringe gets slow speed + mud tint.
- **D8 flow accumulation** on the epsilon-filled surface, processed in
  descending height order (one sort, no recursion) → threshold → trace
  descending polylines → carve stream beds with a smoothed cross-section.
- **Fords:** where the slice-03 corridor certificate's path crosses a stream,
  re-raise the bed to passable — guaranteed crossings are a generator
  post-condition, not luck.
- Lake budget, stream density, and marsh width are recipe parameters. A lake
  that would break the corridor certificate triggers a deterministic re-carve
  (never a random re-roll — determinism contract).

## Human can run

`battle-genmap-passability.mjs` extended: water/marsh classes visible in the
mask; plus a drainage overlay mode tracing the carved polylines.

## Verification

- Cargo: every water cell belongs to a level-set at its basin's fill level;
  every stream polyline is monotonically descending; corridor + flank
  certificates stay green with water present; ford count ≥ 1 per stream that
  crosses the corridor.
- Determinism goldens re-pinned.
- Judged surface: the mask scene (does water sit in visually plausible
  hollows?). Out of scope: how water *looks* (slice 15), shoreline material,
  reflections.

## Stays green

Slices 02–03 verdicts and certificates, hand maps, tripwires.

## Feedback that would change it

"More/fewer lakes", "streams too straight" — recipe parameters. A desire for
rivers as tactical obstacles (wide, bridged) is a **new slice**, not scope
creep here.
