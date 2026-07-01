# Slice 03B4B — clump root-shadow volume

## Contract

Make the foreground grass read as clumped meadow volume before adding blade
silhouettes. The variable under review is **dark clump/root mass and density
falloff**, not individual blade tips and not final grass colour.

## Approach

The current `root-shadow` path is per-record. That is the wrong scale: it makes
many tiny marks. This slice should move root-shadow ownership up to clumps:

- aggregate selected 03B1 field records by stable clump identity or clump cell;
- draw fewer clump-scale root/crown anchors rather than one mark per field record;
- let each clump emit one to three larger low-contrast terrain-seated shapes with
  deterministic yaw/seed variation;
- keep the shape in the existing `world-opaque` pass unless a separate pass is
  proven necessary;
- preserve `ground.stats().meadow.source === 'field'` and publish accent stats
  that distinguish field records from clump accent instances.

Useful candidate knobs, in order:

1. clump aggregation radius / max clumps;
2. root pocket footprint in world meters, not blade width;
3. depth fade so near clumps are visible and mid/far clumps dissolve into the
   03B3 meadow material;
4. low-contrast dark/olive palette that forms pockets without black stipple.

Do not start by raising `grassAccentTufts`, `grassBlades`, or `grassBladeWidth`.
The wide-root-shadow spike already showed that per-record marks become a field of
small strokes.

Implementation seam:

- keep using `GrassFieldRecord` from `packages/game-renderer/src/battle/grassField.ts`;
  the useful fields are `x/y/z`, `normalX/Y/Z`, `yaw`, `clumpSeed`,
  `clumpWeight`, `lodTier`, and the existing width/height/bend seeds;
- add a small clump aggregation helper near the current accent record selector in
  `packages/game-renderer/src/battle/grassPass.ts`, rather than adding another
  independent scatter path;
- introduce an explicit stats distinction, for example `accentAggregation:
  'record' | 'clump'`, `accentSourceRecords`, and `accentClumps`; keep
  `accentTufts` or its successor equal to the number of submitted accent
  instances, not the number of source field records;
- expose only the minimum route controls needed to tune this slice, such as max
  clumps, clump footprint scale, and near/far fade. The reference route default
  should use clump aggregation only for `grassTechnique=field-accent` with
  `accentStyle=root-shadow`.

Candidate algorithm:

1. Build the candidate source set from records inside the accent depth band. Do
   not cap this list at the old per-record accent budget before grouping.
2. Group by stable clump identity. Start with `clumpSeed`; if one seed spans too
   much screen depth, split by a coarse focus-depth bin while keeping the split
   deterministic.
3. Accumulate a weighted clump center and normal using `clumpWeight` and
   near-depth fade. Average yaw through sin/cos so the submitted patch does not
   snap as seeds reorder.
4. Score clumps by source count, clump weight, and near-depth relevance. Cap the
   final clump list after scoring, then submit one synthetic accent record per
   clump.
5. Scale the synthetic record by footprint in world meters. The current mesh
   derives patch size from blade width, so the clump record may need a width
   multiplier several times larger than a blade record while keeping height and
   bend subdued.
6. Keep the root-shadow mesh seated and broad. If a lifted crown is reintroduced,
   it must be a named candidate and compared separately because the first crown
   attempt read as glyphs/noise.

Route defaults worth trying first:

- workbench: `mode=field-accent`, `accentStyle=root-shadow`,
  `accentAggregation=clump`, moderate max clumps, and a visible but low-contrast
  surface blend;
- reference: the same style with a higher max-clump budget, still below the
  rejected all-card path. Preserve `ground.stats().meadow.source === 'field'`.

Record every rejected parameter family here before moving on. Useful failures to
name are: too few clumps leaving the smooth green plane unchanged, too many clumps
collapsing back to stipple, footprint too small reading as dots, footprint too
large reading as glyph strokes, and root color too dark reading as black speckle.

## Current Result

The clump aggregation contract landed, but the visual target is still rejected.

Landed architecture:

- `BattleGrassPass.setGrassFieldSnapshot(...)` supports `accentAggregation:
  'record' | 'clump'`, `accentMaxClumps`, and `accentClumpFootprint`;
- stats now distinguish source field records from submitted clump accents:
  `accentSourceRecords`, `accentClumps`, `accentTufts`, and
  `accentAggregation`;
- the reference route defaults `grassTechnique=field-accent` +
  `grassAccentStyle=root-shadow` to clump aggregation;
- `battle-grass-field`, `battle-map-reference`, and `renderer-lab-routes` assert
  clump-bounded ownership instead of accepting the old per-record selector.

Final current reference stats:

- `fieldRecords: 7000`
- `accentAggregation: "clump"`
- `accentSourceRecords: 7000`
- `accentClumps: 157`
- `accentTufts: 452`
- `meshTriangles: 56`
- `submittedTriangles: 25312`
- `accentSurfaceBlend: 0.56`
- `accentClumpFootprint: 6.8`

Rejected visual evidence:

- per-record root-shadow: too faint/smooth; lowering blend revealed dot/stipple;
- wide diamond root-shadow: visible star/glyph strokes;
- broad oval root-shadow: less spiky but still separated olive decal blobs;
- short root-fiber mat: bounded and cheap, but does not change the crop enough;
  still reads as scattered stains on a smooth plane.

`compare-screenshots` artifacts are under
`assets/03b4-evidence/03b4b-root-fiber-mat/`. Against the target crops, the final
current candidate has foreground `edgeEnergyRatio=0.287` and midground
`edgeEnergyRatio=0.448`, which means it still lacks most of the target's matted
grass/root structure. Neutral crop review says Image B has flat decal blobs,
sparse/uniform density, broad smooth painted-plane areas, and glyph/stipple
artifacts. Image A remains much closer by a wide margin.

Do not continue by tuning `grassAccentClumps`, `grassAccentFootprint`,
`grassAccentSurface`, or root color alone. The clump reducer is the thing to keep;
the primitive/material needs a new slice.

## Fixed Inputs

- Keep the 03B3A softened coverage meadow frozen.
- Keep the `highland-valley` reference camera, terrain, cliffs, water, sky, fog,
  and final composition fixed.
- Keep `fiber-ribbon` and `hybrid-root-fiber` disabled while judging this slice.

## Accept / Reject

Use foreground and midground crops only. Accept if:

- foreground has visible darker clump pockets and fuzzy matted grass mass;
- the clumps merge into terrain-following meadow texture rather than isolated
  dots/strokes;
- midground fades into tone without black/yellow stipple;
- route stats prove the accent is clump-bounded and cheaper than the rejected
  all-card path;
- neutral critique no longer says the main blocker is smooth green ground plane.

Reject if the image still reads as a smooth painted plane, a field of dots, or a
field of separated glyph-like strokes.

## Verification

- `battle-grass-field?mode=field-accent&accentStyle=root-shadow` is the isolated
  workbench.
- `battle-map-reference` captures the foreground/midground crop.
- Use `compare-screenshots` against the target foreground and midground grass
  crops for clump/root volume only.
- Run unprimed `screenshot-critique` scoped to dark clump mass and density
  falloff only.
- `battle-grass-field`, `battle-map-reference`, and `renderer-lab-routes` stay
  green.

## Next Slice

The follow-up `03b4b2-soft-root-mass-impostor.md` landed a softer material-owned
root layer and removed the worst hard decal/glyph marks, but it is still visually
rejected as a smooth painted/combed carpet. `03b4c-near-fiber-ribbon-silhouette.md`
then landed `soft-root-fiber` clump-ribbon telemetry but rejected the visual as
sparse flecks over the same smooth carpet. 03B4C2 and 03B4C3 then proved
field-owned one-strip shells are measurable but visually rejected. 03B4C4 then
proved mesh-only alternate families are cheaper but still read as sparse
marks/stamps. Continue with `03b4c5-texture-backed-grass-volume.md`: keep the
03B4B clump reducer, 03B4B2 root material, and 03B4C2/03B4C3/03B4C4 telemetry
fixed, then try true texture-backed alpha/volume coverage before more density
tuning.
