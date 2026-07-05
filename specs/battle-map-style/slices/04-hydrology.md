# 04 — Hydrology: lakes and drainage that obey gravity

Water sits only where the landform says it can — fixing the salvage ledger's
rivers-run-uphill flaw with flow-respecting derivation.

## Landed 2026-07-05 — BMS04-SLICE-B6D9; corrected by BMS04-FIX-D2C7

Code-landed in `crates/sim/src/genmap/hydrology.rs`. The generator now runs
priority-flood lake selection, D8 accumulation/stream tracing, shallow stream
carving, deterministic corridor fords, and final water/mud terrain painting.
The BMS04-FIX-D2C7 pass suppresses highland/cliff hollows, requires readable
playable-transition lake pockets, and keeps stream beds passable mud rather
than ford/rock cuts. Defaults: lake area budget `0.018`, stream count `3`,
accumulation threshold `850`, marsh width `4` cells, stream bed radius `2`
cells. Browser execution and snapshot blessing remain ORCHESTRATOR-TODO under
the task sandbox.

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

## Landed (2026-07-05)

- hydrology.rs: priority-flood (no-epsilon fill-diff = lake mask), D8
  accumulation, gentle passable stream carving (mud beds - fords simplified
  to zero because beds never block), marsh fringes, seeded corridor-zone
  basins in landform.rs (6.4-9.6 m). Mountain hollows suppressed.
- Three orchestrator review rounds recorded (each produced a straight-edge
  or splinter artifact): (1) never clip lake cells along the pre-lake
  corridor path - the certificate runs on the FINAL speed field and routes
  around water; (2) the playable-zone gate qualifies whole components by
  their DEEPEST core cell, never per-cell x-thresholds (ruler-straight
  shorelines) or centroids (spill drags them out of zone); (3) oversized
  components DRAIN by lowering the level to a height quantile and keeping
  the core-connected piece, raising the level until the readable-lake floor
  (1500 cells) holds - "lowest N cells" splinters multi-basin fills.
- Result: exactly one natural-contour lake pocket per seed in the playable
  transition zone with marsh rim and connected streams; 32-seed certificates
  green; goldens re-pinned (0xa83197564d957288 seed-7); mask scene windows
  re-anchored to measured truth. Lake size is deliberately modest under the
  0.018 area budget - a recipe knob for slice 06 variety / David's taste.

## Feedback that would change it

"More/fewer lakes", "streams too straight" — recipe parameters. A desire for
rivers as tactical obstacles (wide, bridged) is a **new slice**, not scope
creep here.
