# 05 — Edge grammar + deployment guarantees

The E/W seals become a composable vocabulary (cliff run, forest belt,
lake/ocean bay — with gaps), and the armies' ground becomes guaranteed.

## Contract unlocked

`genmap/edges.rs`: per-edge seal composition, so seeds vary in *kind* of
flank, not just in noise; deployment bands certified for real battles.

## API seam

- Seal segments per E/W edge, chosen and placed by seed within recipe
  weights: `CliffRun` (the slice-02 walls), `ForestBelt` (speed-0 dense-forest
  tint, distinct from any passable mid-field forest), `WaterReach` (ocean bay
  or edge lake via the hydrology machinery). Gaps between segments are allowed
  — the sim closes the boundary — but a blocked cell must always carry a
  visually motivating tint (no invisible walls).
- N/S guarantee: deployment bands (as defined by `battle.rs` deployment code —
  read the constants, don't re-invent them) must be ≥95% passable,
  slope-bounded, and blocker-free.
- `deriveBattleEdgeRoles` on generated grids must yield sensible roles; the
  descriptor's `groundCover` and edges stay consistent with the grid
  (`edgeSealMismatches` clean).

## Human can run

`battle-genmap-seeds.mjs`: a 4-seed montage of passability masks + clay
thumbnails — one shot showing flank variety. Fight a battle on a
forest-sealed and a water-sealed seed.

## Verification

- Cargo over the seed sweep: deployment guarantees; every seal segment's
  blocked cells tinted appropriately; corridor/flank certificates green across
  all seal kinds.
- **Extend `battle-terrain-elevation.mjs` with one fixed generated seed** so
  the seating tripwire covers the generator forever.
- A frontend check (vitest or scene stat) pinning `deriveBattleEdgeRoles`
  output for a fixed-seed grid.
- Judged surface: the montage (screenshot-critique: do flanks read as
  *different places*?). Out of scope: material beauty, scenery density (slice
  13/14 own how seals *look* at the vista).

## Stays green

All prior certificates and verdicts; hand maps; tripwires.

## Feedback that would change it

Wanting a specific archetype mix (e.g. "coastal maps should be rarer") —
recipe weights. If forest belts don't *read* sealed at the vista camera with
current scenery props, that is slice 14's problem — record it there, don't
inflate this slice.
