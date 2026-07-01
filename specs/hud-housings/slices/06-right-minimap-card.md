# 06 — Minimap → bottom-right corner housing

## Contract unlocked
The minimap moves into its **own bronze housing flush in the bottom-right
corner**, matching the left and center cards' material — completing the three
distinct housings.

## Slice variable & crop
**One visual variable: the minimap's frame + anchor** (`bottom:170/right:12`
floating → flush bottom-right, wrapped in `<Chassis>`).
- **Judge:** the bottom-right corner crop — minimap in a matching bronze frame,
  corner-anchored.
- **Out of scope:** final gap budget for the center (07), tooltips (08).

## API seam
- `<RightMinimapCard>` wraps the `<canvas>` in `<Chassis>`; drop the `#minimap`
  inline positioning CSS.
- **Firewall:** the canvas stays `240×160`; `worldToMini`, the `miniBack` tint
  cache, `drawMinimap`, and the click-to-recenter `mousedown` (reading the handle's
  canvas) are untouched. Frame it, do not resize it.

## What the human can run / see
`bun run --cwd web scene -- battle-selection` (+ `battle-minimap`) — three matching
bronze housings across the bottom; clicking the minimap still jumps the camera.

## Verification
- `battle-minimap.mjs` green (minimap rect + `darkHud` band) — re-bless the
  expected move (reviewed, headful).
- Re-bless `battle-selection-dpr2`.
- Confirm minimap click-to-recenter works via the new ref.
- **compare-screenshots** the right crop vs the reference's minimap frame;
  **screenshot-critique** as the last check.
- Human checkpoint (**non-blocking**) via `preview-shots`, ~5 min, decide-and-record.

## Stays green
`drawMinimap`, `worldToMini`, the `miniBack` cache, the minimap scene.

## Feedback that would change this slice
Round vs rectangular minimap frame (the reference is round) is a checkpoint /
slice-09 taste call; the corner-anchored housing stands regardless.
