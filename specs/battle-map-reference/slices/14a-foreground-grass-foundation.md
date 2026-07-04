# Slice 14a - foreground grass foundation

## Contract

Allow the accepted `heightmap-vista` review route to render the existing
field-owned grass stack over the Slice 10/11/12/13 heightmap terrain. This is a
foundation checkpoint, not final blade art.

## Scope

- Split layout-review behavior from "force grass off": `heightmap-vista` may
  request `grassTechnique=field-accent` while still suppressing scenery/horizon
  clutter for variable-scoped review.
- Reuse `sampleGrassField`, `BattleGroundPass.setMeadowFromGrassField`, and
  `BattleGrassPass.setGrassFieldSnapshot`.
- Keep cliff exclusion tied to the terrain source. For this heightmap, cliff
  cells are blocked by the slope/passability-derived tint before the secondary
  normal threshold can reject them; this slice proves the tint/blocked-cell
  path, not standalone normal-slope rejection.
- Publish grass field records, accent records, blocked tint cells,
  `fieldRejectedSlopeCells`, submitted triangles, draw calls, meadow coverage,
  root mass, and foreground body void/color metrics in the slice artifacts.

## Verification

- Route:
  `gate=highland-valley&terrainSource=heightmap-layout&view=heightmap-vista&environment=overcast-foggy&grassTechnique=field-accent`.
- Scene:
  `battle-map-reference-foreground-grass-foundation`.
- Evidence lives in
  `assets/slice-14a-foreground-grass-foundation/`.

## Accept / Reject

Accept if the route proves the grass stack can sit on the accepted heightmap
vista with a visible nonvoid foreground body, one draw call, field-owned meadow
and root mass, and cliff cells excluded by the terrain mask.

Reject if grass requires a second terrain owner, shows black-floor voids, renders
on blocked cliff/rock/water cells, or bypasses the shared environment.

## Residual Risk

The accepted foundation can still read as a stippled/noisy carpet. That is not
accepted here; Slice 14 owns the live foreground dense-grass pass and must reuse
the better False Earth close-grass foundation before inventing new primitives.
