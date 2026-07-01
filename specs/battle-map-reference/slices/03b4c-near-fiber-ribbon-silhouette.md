# Slice 03B4C — near fiber ribbon silhouette

## Contract

Add only the near-field blade/fiber silhouettes that remain missing after
03B4B2's soft clump root-mass material pass.

03B4B2 is **not visually accepted**: it removed hard decal/glyph artifacts but
still reads as a smooth painted/combed carpet. This slice is therefore a
diagnostic geometry pass over the fixed 03B4B2 base, not a declaration that root
mass alone is good enough.

## Approach

Keep the stats-visible 03B4B2 soft clump root-mass layer fixed. Then reintroduce
a muted ribbon/silhouette family only in the near depth band:

- use the 03B4B/03B4B2 clump emitters, not the uncapped field-record scatter;
- draw sparse tapered ribbons with terrain-normal bases and upward-biased tips;
- fade ribbons out before midground so they do not become yellow/green speckles;
- keep ribbon colour in the olive shadow/mid range, not dry straw tips.

The current first-pass `fiber-ribbon` and `hybrid-root-fiber` attempts are
rejected evidence, not a starting default: both produced speckle before useful
volume. Reuse only the route/style plumbing unless the primitive is reshaped.

Implementation seam:

- consume the 03B4B2 clump accents as emitters; do not go back to an uncapped
  per-record ribbon scatter;
- add ribbon stats separately from root stats, for example `accentRibbons`,
  `accentRibbonDepthNear/Far`, and submitted ribbon triangles;
- keep the ribbon primitive named independently from `root-shadow` and
  `soft-root-mass` so the workbench can capture root-only, ribbon-only, and
  composed variants without changing meadow material or camera;
- build a route knob for the near depth cutoff before adding more ribbons. This
  slice should fail closed by fading ribbons out early, not by letting them turn
  into midground stipple.

Candidate primitive approach:

1. Start with one to three tapered strips per clump accent, not per field record.
2. Seat each base on the clump root plane and blend growth from terrain normal to
   world-up by height, mirroring the 03B2 packed-field tilt behavior.
3. Give each clump a small fan/cross arrangement with shared base darkness so the
   result reads as tangled vertical mass, not isolated blades.
4. Keep base color close to the 03B4B2 root pocket and tip color in olive/mid
   tones. Bright straw/yellow tips already failed because they read as speckles.
5. Make strip width view-tolerant enough to show in the lower foreground crop,
   but fade width and colour contrast before the midground crop.
6. Compare against the 03B4B2 root-only shot first. Accept only the silhouette
   contribution the ribbon adds; if the result mainly changes tone or coverage,
   that is 03B3/03C work, not this slice.

Recommended first spike:

- add a new `accentStyle` such as `soft-root-fiber` instead of reusing the old
  first-pass `fiber-ribbon` directly;
- start at the current `soft-root-mass` mesh cost plus about 2-3 low strips per
  submitted clump accent;
- keep `rootMassStrength`, meadow colours, camera, fog, terrain, and crop fixed;
- capture both `accentStyle=soft-root-mass` and the new ribbon style from the
  same camera, then compare only the foreground silhouette/edge delta.

Rejected paths to avoid unless a new reason is recorded:

- enabling `fiber-ribbon` or `hybrid-root-fiber` globally with the old per-record
  selector;
- raising `grassBlades` across the lower third;
- using bright tips to chase edge metrics;
- changing meadow color, fog, camera, terrain, or crop to hide stipple.

Do not try to make this pass succeed by changing the material root layer first.
If the new geometry still reads as stipple/rows while the root material remains
smooth, record that failure and reslice the grass accent architecture instead of
turning meadow, fog, camera, or terrain knobs.

## Current Result

This pass landed useful plumbing, but the clump-emitted ribbon approach is
**visually rejected**.

Landed architecture:

- `GrassAccentStyle` now includes `soft-root-fiber`;
- `BattleGrassPass.setGrassFieldSnapshot(...)` allows clump aggregation for
  `soft-root-fiber`;
- clump records use a taller vertical scale only for `soft-root-fiber`, leaving
  `root-shadow` and `soft-root-mass` root behavior unchanged;
- `BattleGrassStats` now reports `accentRibbons`,
  `accentRibbonDepthNear`, and `accentRibbonDepthFar`;
- the field-accent workbench and reference route default to
  `accentStyle=soft-root-fiber`;
- route/scenario gates assert the ribbon count is present when that style is
  active.

Final current reference stats:

- `fieldRecords: 7000`
- `accentStyle: "soft-root-fiber"`
- `accentAggregation: "clump"`
- `accentSourceRecords: 7000`
- `accentClumps: 157`
- `accentTufts: 452`
- `accentRibbons: 2260`
- `meshTriangles: 64`
- `submittedTriangles: 28928`
- `rootMassEnabled: true`
- `rootMassStrength: 1.24`

Rejected visual evidence:

- Compare artifacts are under
  `assets/03b4-evidence/03b4c-soft-root-fiber/`.
- Foreground `edgeEnergyRatio=0.435`; midground `edgeEnergyRatio=0.761`.
  This is essentially unchanged from 03B4B2 (`0.433` / `0.760`).
- Direct inspection: the foreground still reads as a smooth green carpet with a
  few sparse brown/yellow flecks. The added geometry is too sparse/subpixel to
  create crop-scale grass silhouette or tangled vertical volume.
- Neutral screenshot review agrees: the candidate's near field reads as a flat
  green surface with occasional yellow/brown scratches/speckles, inconsistent
  fiber scale, radial/streaming ground streaks, and a large smooth ground plane
  whose scan readability collapses into one sheet. The target has the stronger
  grassy density/silhouette read, even though its foreground grass is itself too
  blurred and soft to copy literally.

Learning:

- The missing variable is not simply "taller clump ribbons." A clump-emitted
  ribbon mesh remains too sparse at the reference camera.
- Raising the clump ribbon count inside this contract moves toward stipple before
  it moves toward dense grass. Do not keep tuning `soft-root-fiber` width, count,
  colour, or height as the main solution.
- The next pass should test a separate, budgeted near-field fiber **ownership
  layer**: more emitters from the existing field records, but with a much cheaper
  one-/two-strip primitive and strict near-depth/fade stats, rather than more
  geometry per clump accent.
- Do not "fix" 03B4C by blurring the output or increasing smooth ground streaks.
  The target lesson is dense, soft, continuous grass silhouette, not smear.

## Accept / Reject

Accept if the lower foreground gains readable blade/fiber silhouettes while the
midground remains mostly clump/root mass and meadow tone.

Reject if:

- the accent layer reads as dots, bright tips, or rows;
- the slice only works by changing meadow colour, camera, fog, or terrain;
- it requires spreading high blade counts across the whole lower third.

## Verification

- Compare near-foreground crop against the target for blade/fiber silhouette only.
- Run unprimed `screenshot-critique` scoped to near foreground silhouette.
- `battle-grass-field`, `battle-map-reference`, and `renderer-lab-routes` stay
  green.

## Next Slice

Continue with `03b4c5-texture-backed-grass-volume.md`. Keep the 03B3A
meadow and 03B4B2 soft-root material fixed, keep `soft-root-fiber`,
`field-fiber-shell`, and 03B4C3's one-strip shell variants as rejected evidence,
and keep 03B4C4's mesh-only primitive families as rejected evidence too. Try true
texture-backed alpha/volume coverage before more density or depth tuning.
