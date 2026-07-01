# Slice 03B4C3 - fiber visibility and shading

## Contract

Prove a near-field grass fiber primitive can be visibly read at the reference
camera before changing emitter counts again.

03B4C2 proved the field-record ownership path and telemetry, but visually failed:
even `5200` one-strip field-shell records (`41600` submitted triangles) still read
as a smooth green sheet with faint streaks. This slice therefore owns primitive
visibility and local shading only, not broader field coverage or final depth LOD.

Freeze these inputs:

- 03B3A field meadow coverage and 03B3B handoff;
- 03B4B/03B4B2 root material and root telemetry;
- 03B4C2 field-shell source/selected/ribbon telemetry shape;
- camera, terrain, cliffs, water, sky, fog, meadow colour, and crop.

## Approach

Keep `field-fiber-shell` as the data owner, but stop raising the shell count as
the primary move. The next hypothesis is that the current primitive/material is
too low-contrast and too coplanar with the meadow to survive the reference camera.

Implement a debug-visible variant first:

- add a named style/route option such as `field-fiber-shell-visibility` or a
  `fiberShellDebug=1` route flag;
- hold selected shell records to a small, inspectable near band, then render the
  primitive with intentionally visible dark bases and vertical height;
- compare shell-off, normal shell, and visibility shell from the same camera;
- once the primitive can be seen, dial contrast/width/height back toward the
  Aegean/overcast palette without losing silhouette.

Candidate primitive changes to test independently:

1. **Material contrast:** darken lower half and add height-based AO before
   increasing geometry.
2. **Screen-facing width:** make a bounded view-thickness term so fibers do not
   vanish edge-on, but reject broad yellow/brown dash marks.
3. **Vertical lift:** increase height/growth more than footprint so fibers read
   as layered vegetation instead of ground scratches.
4. **Local clump shadow coupling:** borrow the root-mass channel to darken bases
   of shell fibers without adding new meadow colour.

Do not change emitter count, depth band, meadow streaks, root material strength,
terrain, fog, or camera until this slice proves whether the primitive itself is
visible.

## Approach Ladder

Work through these approaches in order, recording each result before moving on:

1. **Visibility harness:** add one explicit route/style switch that can capture
   shell-off, normal `field-fiber-shell`, and debug-visible shell from the same
   camera. This is a harness step, not a beauty pass. Route stats must say which
   variant is active. **Done and accepted as infrastructure.**
2. **Shader/material visibility:** keep the 03B4C2 geometry and selected field
   records fixed. Only change height-based shading, dark bases, local AO, and
   tip/base contrast. Accept this approach only if the shell becomes readable
   without broad dash marks or black hatching. **Rejected:** the visible shell
   reads as stipple/scratches, not grass.
3. **Bounded primitive visibility:** if material changes cannot expose the shell,
   keep the same records and test bounded width/height/view-thickness changes.
   Change one variable per capture: width, then vertical lift, then screen-facing
   thickness. Reject any variant that reads as rows, scratches, or flower specks.
   **Rejected:** the bounded variants are effectively indistinguishable from the
   normal shell.
4. **Root-coupled shell:** if the primitive becomes visible but floats or reads as
   detached marks, borrow the 03B4B2 root-mass field only as a local base-shading
   term. Do not retune root-mass strength globally. **Skipped for this primitive:
   no bounded strip variant becomes visibly grass-like enough to justify seating
   work.**
5. **Primitive-family reslice:** if a deliberately visible shell is still
   unreadable, stop this slice and update the spec before more renderer work.
   The next primitive family should be an alpha/texture impostor, shell billboard
   cluster, or near-field grass volume card, with its own slice and telemetry.
   **Superseded:** 03B4C4 ran this workbench and rejected the mesh-only families;
   the current pickup is 03B4C5 texture-backed alpha/volume coverage.

Decision rule: do not accept a later approach because the whole reference frame
looks less wrong. Accept or reject by the foreground/midground grass crop only:
is the shell now visibly adding local vertical/tangled structure, and is that
structure grass-like rather than marks on the ground?

## Required Telemetry

Carry forward 03B4C2 stats:

- `fiberShellSourceRecords`;
- `fiberShellRecords`;
- `fiberShellRibbons`;
- `fiberShellDepthNear/Far`;
- `fiberShellSelectedRatio`;
- `fiberShellSubmittedTriangles`;
- active style/visibility variant.

Add a route/status flag that makes the visibility variant explicit. A future pass
must be able to compare normal shell vs visibility shell without reading code.

## Accept / Reject

Accept if:

- the foreground crop visibly gains small vertical/tangled fiber structure
  relative to shell-off and normal shell;
- neutral critique no longer says the primary issue is missing near-field grass
  silhouette or invisible shell geometry;
- the visible primitive does not read as isolated yellow/brown scratches, rows,
  or flower speckles;
- the pass stays under the rejected old all-card tuft cost for the same camera.

Reject if:

- a deliberately visible primitive is still unreadable at the reference camera;
- visibility only appears as broad dash marks, black hatching, or rowed crops;
- the apparent improvement comes from changing meadow colour, terrain, fog,
  camera, cliffs, water, sky, or target crop.

## Verification

- Capture shell-off, normal shell, bounded width, bounded lift, bounded
  view-thickness, and visibility shell from the same `battle-map-reference`
  camera.
- Archive those shots and crops under
  `assets/03b4-evidence/03b4c3-fiber-visibility-and-shading/`, including any
  rejected variant that drives the next decision.
- Use `compare-screenshots` on foreground and midground crops. Judge movement
  against shell-off/normal-shell first, then target; do not score whole frame.
- Run unprimed `screenshot-critique` scoped to fiber visibility, local shading,
  scratch/stipple artifacts, and density falloff only.
- `battle-grass-field`, `battle-map-reference`, and `renderer-lab-routes` stay
  green. The default route may remain the best current WIP even if the visibility
  variant is rejected.

## Approach Ledger

2026-07-01 pass:

- **Harness landed:** `BattleGrassPass` now publishes
  `fiberShellVariant = off | normal | width | lift | view-thickness | visibility`.
  The render-lab routes accept
  `fiberShellVariant=off|normal|width|lift|view-thickness|visibility`;
  `visibility` uses the explicit `field-fiber-shell-visibility` style. The
  focused scene
  `battle-map-reference-fiber-shell` captures the same reference camera as
  shell-off, normal shell, bounded primitive variants, and debug-visible shell,
  then writes
  `web/shots/battle/map-reference/fiber-shell-*.png`,
  `fiber-shell-variants.png`, and `fiber-shell-crops.png`.
- **Evidence path:** archived under
  `assets/03b4-evidence/03b4c3-fiber-visibility-and-shading/`.
- **Shell-off:** keeps the 03B3A meadow and 03B4B2 root material fixed, reports
  `fiberShellSourceRecords=7000`, `fiberShellRecords=0`, `accentTufts=0`,
  `drawCalls=0`, and the same depth band (`35..360`) as normal shell.
- **Normal shell:** reports the same 03B4C2 budget
  (`5200` shell records/ribbons, `41600` submitted triangles,
  `fiberShellSelectedRatio=0.743`) and is visually almost identical to shell-off.
  Off-vs-normal crop comparison moved foreground edge energy only from `0.02138`
  to `0.02146` (`edgeEnergyRatio=1.00371`) and midground from `0.02821` to
  `0.02821` (`edgeEnergyRatio=1.00027`).
- **Debug-visible shell:** keeps the same selected-record/depth/triangle budget
  but increases material contrast, lift, width, and lowers surface blend. It is
  more visible, but rejected as grass. Normal-vs-visibility foreground edge
  energy rises to `edgeEnergyRatio=1.08327`; midground rises only to `1.00836`.
  Against target crops the visible variant is still far short: foreground
  `edgeEnergyRatio=0.32422`, midground `0.47778`, foreground average luminance is
  `21.61` lower than target, and midground is `45.78` lower.
- **Neutral critique:** the right/debug-visible column has the most visible fine
  structure, but it reads as isolated dark/yellow scratches, pinholes, or stipple
  noise rather than grass. Left/middle columns still lose grass silhouette; all
  columns read as flat painted ground lacking upright occlusion, clump shadowing,
  blade silhouettes, convincing density falloff, and scale.
- **Decision:** visibility harness accepted as infrastructure; first
  shader/material visibility attempt rejected visually. Do not accept
  `field-fiber-shell-visibility` as the default look.
- **Bounded primitive harness:** route stats and the scene now cover
  `fiberShellVariant = off | normal | width | lift | view-thickness | visibility`.
  `battle-map-reference-fiber-shell` asserts each bounded URL reports its own
  variant so a silent fallback to `normal` cannot pass again.
- **Bounded primitive results:** width, vertical lift, and view-facing thickness
  keep the same selected-record/depth/triangle budget as normal shell (`5200`
  shell records, `41600` submitted triangles) but do not visibly solve the grass
  silhouette. Compared to normal shell, foreground edge-energy ratios are only
  `1.00335` for width, `1.00184` for lift, and `1.00198` for view-thickness;
  midground ratios stay around `1.00018..1.00031`. Pixelmatch stays at `0` for
  the bounded comparisons, which matches the visual read: the variants remain a
  smooth painted/combed surface with faint streaks, not dense grass.
- **Decision update:** bounded primitive visibility is rejected. Do not spend the
  next pass widening, lifting, or view-facing this one-strip per-record shell.
  The strip primitive branch has proven useful as telemetry/harness plumbing but
  not as the visual solution.
- **Neutral review update:** an unprimed grass-only review of the target crops,
  variant crop sheet, and target-vs-visible side-by-sides agreed with the metrics:
  no candidate reaches the target's dense grass read. The target has visible
  vertical tuft structure, soft blade silhouettes, clumped dark masses, and
  layered occlusion; the candidates read as flat terrain with sparse dark
  speckles, faint radial scratch lines, low-contrast streaks, and almost no blade
  height or volumetric shadowing.
- **Next approach update:** 03B4C4's primitive-family workbench landed and
  rejected the mesh-only alpha/billboard/volume stand-ins. Keep the field-owned
  records, crop windows, reference target, and compare/critique gates, but move
  on to 03B4C5's true texture-backed alpha/volume primitive.

## Next Slice

This slice is infrastructure-complete but visually rejected. Continue with
`03b4c5-texture-backed-grass-volume.md`; do not continue tuning the one-strip
field-shell primitive or the 03B4C4 mesh-only stand-ins before trying true
texture-backed alpha/volume coverage.
