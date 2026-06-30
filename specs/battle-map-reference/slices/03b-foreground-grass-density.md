# Slice 03B — foreground grass density

## Contract

Match the **amount and coverage** of the reference foreground meadow in the lower
third of the frame, while preserving the sparse gameplay/top-down density curve.
This slice answers one question: does the reference-view foreground contain roughly
as much grass mass as the target?

## Fixed Inputs

- Use the existing `battle-map-reference` reference-view capture.
- Keep camera, terrain relief, cliffs, water, sky, fog, and grass colour/texture
  fixed unless a capture bug prevents a fair density comparison.
- Keep the gameplay/mid-zoom density layer readable for units and selection glow.

## Accept / Reject

Use `compare-screenshots` on the lower-third grass crop only. Judge:

- grass coverage / filled meadow mass;
- apparent blade/tuft density at the foreground camera scale;
- density falloff from foreground into midground.

Do **not** judge cliff shape, cliff texture, water, fog, sky, colour cast, or final
composition in this slice. The neutral subagent prompt must explicitly say those
visible errors are out of scope unless they hide the grass crop.

## Verification

- `battle-map-reference` writes the candidate, comparison, and grass crop artifacts.
- The grass crop metric records coverage and edge energy versus the target crop.
- Run the neutral review/screenshot critique with a prompt scoped to grass density
  only; record out-of-scope complaints against their later slices.
- `battle-grass`, `battle-terrain-3d`, `battle-terrain-elevation`, and
  `full-game-rendering-performance` stay green.

## Next Slice

After density is accepted, freeze the density curve and move to
`03c-grass-color-texture.md`.
