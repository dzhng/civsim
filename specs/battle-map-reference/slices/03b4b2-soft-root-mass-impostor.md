# Slice 03B4B2 — soft root-mass impostor

## Contract

Keep 03B4B's clump aggregation and stats, but replace the visible root-shadow
primitive/material so clumps read as **soft matted root grass volume** instead of
decals, dots, stars, or glyph strokes.

The variable under review is still dark clump/root mass and density falloff. Do
not add near blade silhouettes yet; that remains 03B4C.

## Starting Point

Keep from 03B4B:

- `accentAggregation: 'clump'` in `BattleGrassPass.setGrassFieldSnapshot(...)`;
- clump scoring/capping after source-record aggregation;
- `accentSourceRecords`, `accentClumps`, `accentTufts`, and submitted triangle
  stats;
- reference defaults that preserve `ground.stats().meadow.source === 'field'`;
- the 03B3A softened field meadow as the base mass owner.

Do not tune these as the first move:

- clump count;
- clump footprint;
- surface blend;
- root color/darkness;
- meadow/fog/camera/terrain/crop.

Those knobs already proved the failure mode: when the marks become visible, they
read as flat stains or glyphs on a smooth plane.

## Approach

Try a softer clump primitive/material family while keeping the same clump emitters.
Useful candidates:

1. **Soft impostor patch:** one low clump quad or small fan with alpha-like
   dither/cutout or vertex-colour falloff baked into opaque geometry. It should
   have an irregular soft edge and no star/diamond silhouette.
2. **Matted root-fiber patch:** many very short, very low, dark olive fibers
   inside each clump footprint, with no bright tips and no midground extension.
   This must read as fuzz/mass at crop scale, not as individual strokes.
3. **Texture-driven clump pocket:** push a clump-local root/mat channel through
   the existing meadow texture or a small companion texture, so the dark mass
   integrates into the ground material instead of sitting as separate geometry.
   Keep geometry stats explicit if this reduces or replaces root-shadow instances.

Implementation seams:

- `packages/game-renderer/src/models/shared/grassModels.ts` owns named primitive
  builders; add a new named style only if it needs to be compared beside the
  current `root-shadow`.
- `packages/game-renderer/src/battle/grassPass.ts` owns clump aggregation and
  stats; preserve the source-record vs submitted-instance distinction.
- `apps/renderer-lab/src/router.ts` and
  `/renderer/battle-grass-field?mode=field-accent` remain the workbench.

If the new approach needs a separate material/texture owner, name it in stats and
keep the old root-only debug mode available until acceptance.

## Current Result

This pass landed a useful architecture change, but **did not visually accept**
the root/grass density target.

Landed architecture:

- `GrassAccentStyle` now includes `soft-root-mass`;
- `BattleGrassPass.setGrassFieldSnapshot(...)` keeps 03B4B's clump aggregation
  for both `root-shadow` and `soft-root-mass`;
- `BattleGroundPass.setMeadowFromGrassField(...)` now exposes an explicit soft
  root-mass material layer through `rootMassStrength`, `rootMassContrast`, and
  `rootMassSpread`;
- `ground.stats().meadow` reports `rootMassEnabled`, `rootMassStrength`,
  `rootMassCoverage`, `rootMassAvg`, and `rootMassSpread`;
- `/renderer/battle-grass-field?mode=field-accent` and the reference route now
  default to `accentStyle=soft-root-mass`;
- the zero-blade `field-meadow` route asserts `rootMassEnabled === false`, while
  `field-accent` asserts root-mass telemetry is enabled.

Final current reference stats:

- `fieldRecords: 7000`
- `accentStyle: "soft-root-mass"`
- `accentAggregation: "clump"`
- `accentSourceRecords: 7000`
- `accentClumps: 157`
- `accentTufts: 452`
- `meshTriangles: 40`
- `submittedTriangles: 18080`
- `rootMassEnabled: true`
- `rootMassStrength: 1.24`
- `rootMassCoverage: 0.061`
- `rootMassAvg: 0.055`
- `rootMassSpread: 32`

Useful learning:

- Integrating the dark clump/root mass into the field meadow material removes
  the obvious hard oval/diamond/glyph decal failure from 03B4B.
- It is materially cheaper than the rejected all-card route and cheaper than
  the 03B4B root-fiber mat (`18080` reference triangles vs. `25312`).
- It still does **not** create the reference's dense grass volume. The target
  foreground reads as matted fuzzy grass with many small vertical/tangled edges;
  the current candidate reads as a smoothed, combed green carpet with stretched
  material streaks.

Rejected visual evidence:

- `compare-screenshots` artifacts are under
  `assets/03b4-evidence/03b4b2-soft-root-mass/`.
- Against the fixed foreground/midground crops, the current candidate has
  foreground `edgeEnergyRatio=0.433` and midground `edgeEnergyRatio=0.760`.
  The foreground is still missing more than half the target's crop-scale edge
  structure.
- Neutral critique says Image B still reads as a smooth painted carpet with no
  blade silhouettes, clumps, or height variation; the texture streaks make the
  ground plane feel stretched/warped; lighting and terrain readability remain
  too even in the full image.

Do not continue by raising `rootMassStrength`, darkening the root colour, or
adding more screen/material streak noise. This pass proves material-owned soft
root mass can remove decal artifacts, but material-only root mass cannot carry
the density target by itself. Keep the stats-visible root-mass layer as the base
and move the missing visual variable to near-field silhouette geometry.

## Fixed Inputs

- Keep the 03B3A softened coverage meadow frozen.
- Keep 03B4B clump aggregation/stats frozen unless a bug is found in them.
- Keep the `highland-valley` reference camera, terrain, cliffs, water, sky, fog,
  and final composition fixed.
- Keep 03B4C ribbons disabled.

## Accept / Reject

Use the same foreground and midground crops as 03B4B. Accept if:

- foreground gains continuous matted/root grass volume, not separated marks;
- darker root pockets are integrated into the meadow tone;
- midground dissolves into soft grass mass without black/yellow stipple;
- neutral critique no longer calls the candidate a smooth painted plane or flat
  decal/glyph marks;
- stats still prove clump-bounded ownership and a cheaper path than the rejected
  all-card route.

Reject if:

- the clumps read as stains, symbols, dots, starbursts, or isolated strokes;
- the crop only improves after changing meadow colour, fog, camera, terrain, or
  target crop;
- the pass hides the failure by spreading high blade/ribbon counts across the
  whole lower third.

## Verification

- `battle-grass-field?mode=field-accent&accentStyle=root-shadow` or a newly named
  soft-root style is the isolated workbench.
- `battle-map-reference` captures the foreground/midground crop.
- Use `compare-screenshots` against the target foreground and midground grass
  crops for root mass only; record edge metrics and artifacts under
  `assets/03b4-evidence/`.
- Run unprimed `screenshot-critique` scoped to soft root mass and density falloff
  only.
- `battle-grass-field`, `battle-map-reference`, and `renderer-lab-routes` stay
  green.

## Next Slice

Continue with `03b4c5-texture-backed-grass-volume.md`, but treat 03B4B2 as a
diagnostic/rejected visual pass rather than accepted art. 03B4C kept this soft
root-mass material layer fixed and added `soft-root-fiber` clump ribbons, but the
visual still failed as sparse flecks over smooth carpet. 03B4C2 added
field-record shell ownership telemetry, but the shell remained visually too
faint. 03B4C3 proved the one-strip shell primitive remains invisible or
scratch-like. 03B4C4 compared mesh-only alternate primitive families and rejected
them as sparse marks/stamps. 03B4C5 should try true texture-backed alpha/volume
coverage before more density tuning. If 03B4C5 turns into broad meadow colour,
camera, fog, or cliff tuning, stop and reslice with `feature-slicing` before
editing more renderer code.
