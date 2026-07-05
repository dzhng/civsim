# 05 — Edge grammar + deployment guarantees

Status 2026-07-05: CODE-LANDED BMS05-SLICE-A9E1. The generator now chooses
per-edge `CliffRun` / `ForestBelt` / `WaterReach` from recipe weights
6/2/2, exports the composition in the generated-map descriptor, and certifies
the actual y=+/-600, x=+/-350 deployment bands as passable, blocker-free, and
slope-bounded. Seed 7 remains cliff/cliff and keeps the pre-slice terrain hash.
Browser execution and snapshot blessing remain ORCHESTRATOR-TODO.

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

## Landed (2026-07-05)

- edges.rs: seeded seal vocabulary (CliffRun default 6 / ForestBelt 2 /
  WaterReach 2 weights), composition exported via the descriptor with
  expected edge roles; deployment certificate reads the REAL battle.rs
  contract (y=+/-600, x=+/-350, >=95% passable, slope-bounded); 32-seed
  sweep green across all seal kinds; seed 7 unchanged (cliff/cliff) so no
  pin churn. Montage seeds: 1 (W cliff/E water), 3 (W water/E forest),
  7 (cliff/cliff), 8 (W forest/E cliff).
- Orchestrator review fixes: seals shaped organically - per-row jittered
  treelines and end-tapered water reaches via SealSegment::end_taper
  (stamped axis-aligned rectangles read as slabs; recorded); the elevation
  tripwire's steepest-slope stand caps at the climbable band (the raw
  steepest spot on generated maps is the impassible cliff wall - zero
  soldier pixels); generated-gate soldier-pixel floor re-anchored (rolling
  relief partially occludes the block).
- Known naming debt: ForestBelt edges derive as role "cliff" (the renderer
  role vocabulary has no forest edge role; adding one is a small follow-up
  wherever the catalog grows in slice 18).

## Feedback that would change it

Wanting a specific archetype mix (e.g. "coastal maps should be rarer") —
recipe weights. If forest belts don't *read* sealed at the vista camera with
current scenery props, that is slice 14's problem — record it there, don't
inflate this slice.
