# Slice 03B3 — field-driven meadow material

## Contract

Make the lower third read as continuous meadow mass using the grass field
contract, not ad hoc ground noise and not foreground card count.

## Approach

The earlier meadow shader proved that terrain colour alone can fill the crop but
still reads like tinted terrain. This slice should let the field's clump data
drive the material layer:

- use clump id/center/weight and terrain normal summaries from `grassField.ts`;
- shade broad matted volume, directional streaks, and density falloff;
- keep foreground blade accents minimized while judging meadow mass;
- keep the material cheap enough for the reference fixture and optionally for
  production when zoomed in.

Start from the 03B2 packed-field route, not from the old card-density spike. The
first useful proof is an isolated lower-third meadow crop where visible blade
geometry is reduced enough that broad coverage, clump direction, and falloff can
be judged without foreground-card noise. Use the field records as the source of
clump identity even if the material lives in `BattleGroundPass`: the material must
not become another private procedural noise owner.

The 03B2 hostile ramp critique is useful here because it exposes what this slice
must avoid: row-like vertical streaks that read as grass geometry, hard straight
density seams, and ground texture that feels like a flat painted curtain. Meadow
streaks should follow terrain/field direction and fade into tone; they should not
look like combed parallel rows or a visible mask boundary.

This can live in `BattleGroundPass` only if the data contract stays explicit. If
the material becomes its own pass, it must still render as a world-depth surface
without breaking the frame graph.

## Current Implementation State

This umbrella slice is not visually accepted as final grass, but it now has an
evidence-backed handoff as of 2026-07-01. It was resliced into:

- `03b3a-field-meadow-coverage-floor.md` — field texture coverage, transition
  floor, and no hard material band;
- `03b3b-material-volume-proxy.md` — material-only meadow volume/edge structure,
  or an explicit handoff decision that true volume requires 03B4 geometry.

The recorded implementation approach is:

- `packages/game-renderer/src/battle/groundPass.ts` owns
  `BattleGroundPass.setMeadowFromGrassField(snapshot, bounds, params)`.
- The method builds a padded `rgba8unorm` meadow texture from the 03B1
  `GrassFieldSnapshot`:
  - R = raw field density / meadow mass;
  - G = softened coverage/falloff;
  - B = clump/material weight mixed with mass;
  - A = clump phase.
- Ground meadow uniforms expanded to four `vec4`s plus sampler/texture bindings.
  `ground.stats().meadow` must publish `source: 'field'`, texture dimensions,
  cell size, field record count, raw and soft coverage, average density/coverage,
  directional coverage, and texture bytes.
- `/renderer/battle-grass-field?mode=field-meadow` is the focused workbench. It
  should publish packed-field grass stats, a field-owned meadow, and zero blade
  geometry.
- `web/scenes/battle/battle-grass-field.mjs` owns
  `web/shots/battle/grass/field-meadow-material.png`.
- The `highland-valley` reference route now defaults to
  `grassTechnique=field-accent`; use `grassTechnique=field-meadow` when the
  zero-blade material proof is the variable under review.
- The recorded path also exposes `ground.stats().meadow.fieldFloor`. The isolated
  workbench keeps `fieldFloor: 0`; the reference fixture uses a small floor to
  soften field/no-field transitions without drawing blade geometry.

Important implementation boundary: `BattleGrassPass.setGrassFieldSnapshot(...)`
now allows `bladesPerTuft=0` only for the packed-field snapshot path. That is
intentional. During 03B3, the packed records may still exist for telemetry and
meadow ownership, but `bladeInstances` and `drawCalls` should stay zero so the
lower-third crop judges material mass instead of card silhouettes.

## Current Visual Learning

The first field-meadow pass is closer architecturally than the rejected card-only
and terrain-only attempts, but the shot is still wrong:

- the meadow reads as a smooth painted green ground surface, not continuous grass
  volume;
- the field direction can produce combed vertical/diagonal lanes;
- isolated workbench crops showed row/stripe artifacts and sparse tick-like marks;
- removing blade geometry made the meadow's flatness clearer, which is useful
  evidence for 03B3 rather than a reason to jump to 03B4.

Latest 2026-07-01 pass:

- Added field-mass gating so no-field areas do not get the full meadow carpet by
  default.
- Added `fieldFloor` as an explicit transition control, zero in the focused
  workbench and small in the reference fixture.
- Added a separate field-space softened coverage channel so coverage/falloff is
  not driven directly by the raw field mass threshold.
- Reduced field-enabled directional `brushed`/`felt` ridges and added
  non-directional mottle/thatch terms, including a low-strength screen-scale
  thatch.
- Tried parameter spikes for wider field focus, farther depth falloff, higher
  meadow floor, denser field records, smaller/larger meadow spread, and lower
  streak strength. Wider fields improved telemetry coverage, but did not remove
  the painted surface or hard horizontal band. High floors washed the surface
  rather than producing volume.
- Focused browser gates pass, but visual acceptance does **not**: fresh
  `compare-screenshots` artifacts in `/private/tmp/civsim-03b3-compare/out/`
  report foreground `edgeEnergyRatio ~= 0.208` and midground
  `edgeEnergyRatio ~= 0.490` against the target crop. Faraday's neutral critique
  blocks the slice: flat painted wash, directional rows/combing, hard
  material/density boundary, weak density falloff, and missing material volume.

Latest handoff result:

- 03B3A coverage/falloff improved after adding the softened coverage channel.
  Reference telemetry now reports raw `fieldCoverage ~= 0.076`,
  `softCoverage ~= 0.170`, `avgCoverage ~= 0.152`, and `fieldFloor ~= 0.07`.
  The bright horizontal band is reduced enough to move on.
- 03B3B material-only volume is rejected. The latest neutral critique says the
  zero-blade crop has continuous coverage but still reads as a flat painted/combed
  plane, not meadow volume.
- 03B4 now owns the remaining volume through geometry. Keep the zero-blade
  `field-meadow` route as a regression proof for field-owned base coverage.

Final 03B3 handoff:

- keep `grassBlades=0` in the `field-meadow` material route;
- keep the softened coverage channel from 03B3A;
- treat 03B3B material-only volume as rejected;
- avoid accepting green route metrics as visual acceptance;
- update the relevant slice with each tried data/falloff/material approach and
  whether it was accepted or rejected.

Approach ledger for future passes:

- **Preserve:** field records remain the source of meadow ownership; the material
  may be in `BattleGroundPass`, but it must keep consuming `GrassFieldSnapshot`
  data and publishing `ground.stats().meadow`.
- **Preserve:** the 03B3 proof route keeps `bladeInstances === 0` and
  `drawCalls === 0`; foreground geometry is not allowed to mask a failed material.
- **Already falsified:** raising card count, terrain-only grass tint, high
  `fieldFloor` alone, wider field focus/record count alone, long directional
  ridges, screen-space speckle, and a localized foreground density oval.
- **Accepted in 03B3A:** split the field texture into a raw density/mass channel
  and a softened coverage/falloff channel, then use the softened channel to reduce
  the band without judging volume.
- **Rejected in 03B3B:** tonal volume from clump-weight pockets, low-frequency
  mottle, restrained short thatch, and screen-space fiber terms still reads as a
  painted/combed plane.
- **Stop condition met:** 03B4 geometry must supply the remaining foreground
  volume.

## Fixed Inputs

- Freeze Slice 03B1 field records and Slice 03B2 packed slope behavior.
- Keep camera, terrain relief, cliffs, water, sky, fog, final composition, and
  foreground blade accents fixed.

## Accept / Reject

Use the lower-third grass crop and judge only meadow mass:

- broad green coverage replaces bare procedural ground;
- clumps/streaks follow field data and feel directional, not circular masks or
  road-like stripes;
- foreground-to-midground falloff becomes smoother and less stippled;
- field/material stats prove the mass is not coming from extra tuft count;
- `bladeInstances === 0` and `drawCalls === 0` in the 03B3 material-only proof.

Wrong blade silhouettes, color finality, cliff shape, water, sky, and fog are out
of scope unless they hide the crop.

## Verification

- `battle-map-reference` records lower-third meadow telemetry.
- Add or refresh an isolated meadow crop where foreground blade geometry is
  minimized.
- `battle-grass-field` must include both `mode=packed-tilt` and
  `mode=field-meadow`; the field-meadow branch must assert field meadow telemetry
  and zero blade geometry.
- `renderer-lab-routes` must include `/renderer/battle-grass-field?mode=field-meadow`
  so route telemetry fails loudly if the material becomes private procedural noise.
- Use `compare-screenshots` against the target lower-third crop for meadow mass
  only.
- Run unprimed `screenshot-critique` scoped to continuous meadow mass and density
  falloff.
- The critique prompt must mark blade silhouettes, final grass color, cliff
  shape/texture, fog, water, sky, and final composition as later-slice debt unless
  they hide the meadow crop.
- `battle-terrain-3d`, `battle-terrain-elevation`, and
  `full-game-rendering-performance` stay green.

## Next Slice

Continue with `03b4c5-texture-backed-grass-volume.md`. 03B3 is not visually
accepted as final grass, but it has recorded the evidence-backed handoff:
field-owned base coverage stays here, apparent foreground volume moves to 03B4
geometry. 03B4B and 03B4B2 have since proven clump ownership/root material is
useful but still visually flat. 03B4C proved clump-emitted `soft-root-fiber`
ribbons are too sparse at the reference camera. 03B4C2 proved field-owned shell
counts are measurable but still too visually faint. 03B4C3 proved the one-strip
fiber primitive remains invisible or scratch-like. 03B4C4 proved mesh-only
alternate primitive families remain sparse marks/stamps. The next missing
variable is true texture-backed alpha/volume coverage.
