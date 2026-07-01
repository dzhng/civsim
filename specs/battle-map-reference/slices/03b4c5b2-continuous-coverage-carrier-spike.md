# Slice 03B4C5B2 - continuous coverage carrier spike

## Contract

Test whether the texture-volume route needs a continuous field-owned coverage
carrier before individual atlas cards can read as grass. 03B4C5B proved that
redistributing and rescaling isolated field-cell cards still leaves exposed
painted ground with scattered flecks. This slice owns only the **ownership shape
that carries lower-third coverage**: how field records/cells become continuous
near-field opacity or shallow volume before atlas colour/content is judged.

Freeze:

- 03B3A softened meadow coverage and 03B4B2 root material;
- generated atlas palette/content from the current texture-volume route;
- shader-coverage principles from 03B4C5A, unless a carrier needs a simpler
  coverage mask to prove occupancy;
- selected field records, slope/terrain normal seating, camera, terrain, fog,
  water, sky, crop windows, and reference target;
- the old rejected all-card budget as the perf warning line unless the slice
  explicitly records a perf/LOD tradeoff.

Do not tune meadow colour, root strength, fog, camera, terrain, cliff shape,
water, sky, atlas stroke colour, or broad palette in this slice.

## Approach

Build one focused primitive-family/workbench variant that answers the carrier
question without polishing atlas art:

1. Start from the same `battle-map-reference-primitive-family` route and field
   records used by `texture-volume`.
2. Add a carrier mode that fills the lower-third grass body from field-owned
   coverage instead of relying on separated per-cell cards. Valid first spikes:
   a terrain-following near-field coverage shell, a shallow stack of low-alpha
   field-cell sheets, or a batched micro-card carrier whose cells overlap enough
   to hide individual origins.
3. Keep bases seated to terrain normals and tips biased upward. Slope filtering
   must remain visible in stats; no grass on cliffs.
4. Keep card/atlas colour secondary. The carrier should be judged first in
   grayscale/edge/crop terms: does the ground plane stop reading exposed and do
   primitives stop reading as isolated objects?
5. Publish explicit telemetry: carrier family, source records, carrier cells or
   sheets, texture records, submitted triangles, texture bytes, depth band, and
   active baseline.

Do not accept a result that merely smears the old flecks or paints the meadow
darker. The target relationship is a soft dense field body with small-scale
vertical/fuzzy structure, not a flat colour wash.

## Accept / Reject

Accept only if the foreground crop reads as continuous grass body at full-image
scale and in crops, with individual carrier primitives no longer legible as
stamps, rows, cards, flecks, or debris. The midground should move measurably away
from the field-shell baseline instead of remaining a smooth green plane.

Reject or reslice if:

- exposed ground plane still dominates the lower third;
- the carrier reads as a translucent curtain, billboard wall, grid, comb rows, or
  broad painted patch;
- visual density comes from changing meadow/root/fog/colour/camera/terrain;
- atlas colour or stroke content becomes the main variable before coverage
  continuity is proven;
- submitted triangles exceed the old rejected tuft-card budget without an
  explicit readability/perf handoff.

## Verification

- Capture `battle-map-reference-primitive-family` with the carrier variant beside
  `field-fiber-shell` and current `texture-volume`.
- Archive full shots, crop sheets, target/candidate crops, and
  `compare-screenshots` artifacts under
  `assets/03b4-evidence/03b4c5-texture-backed-grass-volume/`.
- Use `compare-screenshots` against target foreground/midground crops and against
  the field-shell baseline. Judge coverage continuity, primitive legibility,
  scale, ground-plane exposure, and depth falloff only.
- Run an unprimed `screenshot-critique` scoped to coverage continuity, primitive
  legibility, scale, ground-plane exposure, integration, and midground vegetation
  read before accepting.
- Keep `battle-map-reference-primitive-family`, `battle-map-reference`,
  `renderer-lab-routes`, `tsc --noEmit`, and the focused grass tests green.

## Verified Result - 2026-07-01

This slice is browser-verified and **visually rejected**. It is useful
architecture evidence, not an accepted grass result.

Implemented approach:

- Added `texture-carrier` as a separate `GrassPrimitiveFamily` using the same
  generated atlas and textured WebGPU pipeline as `texture-volume`.
- Kept meadow/root material, atlas palette/content, camera, terrain, fog, water,
  sky, and crop windows fixed.
- Changed only the carrier ownership shape: larger field-cell carrier footprints,
  one record per selected cell, lower/wider same-atlas cards, softer carrier
  alpha thresholds, and a farther reference depth band.
- Extended `battle-map-reference-primitive-family` to capture
  `primitive-family-texture-carrier.png`.
- Added a focused
  `battle-grass-field?mode=field-accent&grassPrimitiveFamily=texture-carrier`
  route contract.

Reference route stats:

- `grassPrimitiveFamily='texture-carrier'`
- `accentAggregation='field-cell'`
- `accentClumps=2400`
- `accentTufts=2400`
- `bladeInstances=9600`
- `meshTriangles=16`
- `submittedTriangles=38400`
- `textureBytes=65536`
- `grassPrimitiveDepthNear=35`
- `grassPrimitiveDepthFar=460`

Visual evidence:

- Target comparison artifacts:
  `assets/03b4-evidence/03b4c5-texture-backed-grass-volume/diff-carrier/`
- Field-shell comparison artifacts:
  `assets/03b4-evidence/03b4c5-texture-backed-grass-volume/diff-carrier-vs-field-shell/`
- Full carrier shot:
  `assets/03b4-evidence/03b4c5-texture-backed-grass-volume/texture-carrier-full.png`
- Carrier crops:
  `assets/03b4-evidence/03b4c5-texture-backed-grass-volume/texture-carrier-current/`
  and target-sized crops under `texture-carrier-target-crop/`

Metrics:

- Against target foreground: `edgeEnergyRatio=2.80502`,
  `parityDistance=0.61239`, `avgLuminanceDelta=-27.67254`.
- Against target midground: `edgeEnergyRatio=0.71075`,
  `parityDistance=0.57717`, `avgLuminanceDelta=-46.24101`.
- Against field-shell foreground: `edgeEnergyRatio=9.22257`,
  `parityDistance=0.36189`.
- Against field-shell midground: `edgeEnergyRatio=1.47418`,
  `parityDistance=0.09972`.

Verdict:

- Direct inspection rejects the shot: the carrier creates long angular straw/card
  marks and patch islands, not soft continuous grass body.
- The foreground is different from field-shell, but the difference is hard
  primitive edge energy, not the target's fuzzy vegetation density.
- The midground remains mostly smooth exposed terrain and barely gains a
  vegetation read.
- The unprimed visual critique rejected it with high confidence: patchy coverage
  discontinuity, exposed ground plane, stick/wire primitives, too-large scale,
  poor terrain integration, collapsed midground vegetation, and abrupt depth
  transition.

Keep:

- The `texture-carrier` family and telemetry are useful as a negative comparison
  route.
- Same-atlas field-owned carrier plumbing belongs in the primitive-family
  harness.
- `renderer-lab-routes` should continue proving the carrier publishes field-cell
  telemetry and stays under budget in the workbench fixture.

Reject:

- Do not keep enlarging or overlapping field-cell sheets as the coverage carrier.
- Do not move to atlas colour/content (`03B4C5C`) from this result.
- Do not hide the failure by changing meadow/root material, fog, camera, terrain,
  water, sky, or palette.

## Next Slice

Continue with `03b4c5b3-micro-blade-density-carrier-spike.md`. The next question
is whether dense coverage must come from many much smaller field-owned
micro-primitives with explicit perf telemetry, rather than fewer large carrier
sheets. Only move to `03b4c5c-atlas-tile-content-and-color-integration.md` after
the carrier no longer reads as exposed ground plus isolated primitive marks.
