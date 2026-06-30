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
- field/material stats prove the mass is not coming from extra tuft count.

Wrong blade silhouettes, color finality, cliff shape, water, sky, and fog are out
of scope unless they hide the crop.

## Verification

- `battle-map-reference` records lower-third meadow telemetry.
- Add or refresh an isolated meadow crop where foreground blade geometry is
  minimized.
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

After meadow mass is accepted, implement
`03b4-false-earth-blade-accents.md`.
