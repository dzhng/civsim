# Slice 04 — terrain relief + ground grade

## Contract unlocked

The reference's deep rolling valley and smooth green hummocks under the grass,
instead of near-flat ground — plus a warm ground grade so the lush reference read
sits in the Aegean register.

## Current state

The latest pass added a deterministic render-lab
`renderer/battle-terrain-3d?gate=highland-valley&view=reference` fixture so relief
can be judged against `assets/target-battle-map.png` without pretending the old
catalog plateau is the reference map. That fixture is diagnostic only. It still
fails the target relationship: the valley recession is too weak, the left ridge
wall is placeholder-like, the right water sits as a flat strip, and the foreground
grass/ground texture is noisier than the reference meadow.

Do not close this slice on `battle-terrain-elevation` or `terrain-3d/*` snapshots
alone. Those prove seating and stability. Acceptance requires a
`compare-screenshots` pass against the reference image plus the skill's neutral
subagent review of the reference/candidate pair.

## API seam

Raise relief through the **existing** height path — never a second source:

- Tune `verticalScale` / add a render-side mesoscale displacement layer feeding the
  `TerrainHeightField` before upload in `web/src/battle/renderer.ts` (render-only,
  grilling Q4), **or** author the height into the map catalog for `highland-valley`.
- Keep `terrainHeightAt` the single source so crowd, shadows, scenery, and grass all
  ride the same surface. If shaping is render-only, document that soldiers follow it
  because they read the same field.
- Tune `BattleGroundPass`'s **neutral** ground albedo / churn for the smoother
  hummocky read — the warm/cool grade is the Slice 06 lighting preset, not baked here.

`TerrainHeightField`'s typed shape is unchanged; only its contents get more relief.

## What the human can run / see

`renderer/battle-terrain-3d?gate=<map>` and `renderer/battle-terrain-elevation`
show deeper relief; gameplay battles on this map roll.

## Verification

- `heightSpan` stays in the readable band (existing assert: `> 5 && < 40`); widen
  only with written justification and re-pin the test if the vista genuinely needs
  more.
- **Seating regression is the hard gate:** `battle-terrain-elevation` proves
  soldiers/shadows/props seat on the new surface (no floaters, no clipping).
- **Reference comparison (`compare-screenshots`):** compare
  `web/shots/battle/map-reference/candidate-vista.png` against
  `assets/target-battle-map.png`, with crops/metrics focused on valley recession,
  foreground hummock shape, left ridge wall, and right-side water. Use the skill's
  neutral subagent reviewer before accepting; if it calls out wrong camera/content,
  missing depth, bad color, weak density, or placeholder geometry, record the pass
  as "another pass needed" and keep the slice open.
- Snapshot the elevation/terrain-3d shots.

## Screenshot-critique

**Required:** do the hills read as natural relief — like the reference's hummocks —
rather than lumpy noise, and does unit movement still read?

## Must stay green

`battle-terrain-elevation`, `battle-terrain-3d` seating checks; `edgeSealMismatches`
empty; `cargo` (sim height untouched if render-only). Relief must not create
impassable steps the sim disagrees with.

## Human feedback that would reshape this slice

Hill placement / amplitude / wavelength; whether relief is render-only or
sim-backed.
