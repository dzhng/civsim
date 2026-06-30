# Slice 03 — grass over terrain

## Contract still open

Grass on the real maps — density-driven by ground cover/tint, seated on the height
field, and cheap enough to keep at gameplay zoom. This is the reference's dense,
waving foreground that dominates the lower third.

The first implementation landed the renderer infrastructure, but **did not satisfy
the reference visual target**. A later repair pass added Slice 00 neutral grass
albedos, a dense `zoomT=1` vista grass mode, and an explicit reference comparison
artifact. The target relationship is still not accepted: the candidate is denser,
but it is still the wrong terrain/composition and the grass reads as bright
stippled blades rather than a soft meadow mass.

Do not treat the current `terrain-3d/*` screenshots as proof of reference progress.
They prove masking/seating/depth/perf only. Use the `battle-map-reference` scene for
reference-facing judgment.

## API seam

Wire `BattleGrassPass` (Slice 02) into production:

- `web/src/battle/renderer.ts` `applyTerrain()` — set the field/cover on the grass
  pass alongside `ground?.setTerrain` / `scenery?.upload`.
- Insert into the ordered draw list **before** `battle-skinned-crowd`, role
  `world-opaque`.
- Density gated by `BattleGroundCover` and sim tint: **no grass on
  water/rock/wall/mud cells**; each tuft seated via `terrainHeightAt` (reuse the
  seating contract from `terrainScenery.ts`). Distance LOD; grass fades into the
  existing ground wash near the horizon so blades don't pop at distance.
- **Zoom-reactive density/height:** key grass amount and blade height to the
  `zoomT` exported by the Slice 01 camera rig — full and tall at zoom-in (the
  cinematic vista), thinned and short at zoom-out (top-down tactical) so units read.
  This is the same lever as the legibility tuning below, driven off one shared seam.

## Current shipped infrastructure

- Production grass is wired into the battle renderer as a `world-opaque` pass before
  the skinned crowd.
- Terrain scatter rejects water/rock/wall/mud tints, seats via `terrainHeightAt`,
  and reports mask/LOD stats.
- The grass path has a sparse, softened terrain-stubble shader style so current
  catalog-map play stays readable and avoids black speckle.
- Green grass now draws from the locked Slice 00 albedo chips, and the terrain path
  has a separate high-zoom vista density/height/width curve.
- The field-scale wind GIF now has a terrain-context output.

## Current blocker

The shipped visual layer now has enough raw instance budget for a denser foreground,
but it still fails the reference comparison. The neutral subagent review of
`target-battle-map.png` versus `web/shots/battle/map-reference/candidate-vista.png`
called out these blockers with high confidence: wrong camera/composition, flat
terrain and weak midground depth, bright yellow-green noisy grass, missing overcast
haze, flat/sharp water, and placeholder-like polygonal mountains.

The green grass path uses the locked Slice 00 chips:

- near grass albedo: `#c0c178`
- grass shadow / mid hummock: `#99a05c`

Next repair should start with camera/composition and midground terrain depth; grass
softness/color is hard to judge while the current candidate is still a different
scene. Preserve sparse top-down/gameplay readability while making the reference view
softer and less stippled.

## What the human can run / see

The existing `renderer/battle-terrain-3d?gate=<map>` route now shows grass on all
three catalog maps (`river-and-crags`, `walled-plain`, `coastal-scrub`).

`web/scenes/battle/battle-map-reference.mjs` captures the current comparison shot
and crops under `web/shots/battle/map-reference/`. It is diagnostic, not acceptance:
the shot still does not match the reference camera angle and terrain composition.

## Verification

- Extend `web/scenes/battle/battle-terrain-3d.mjs`: `bladeInstances > 0` only on
  grass cover, **zero over water/rock**; soldiers/props still seat (no floating
  blades — depth correct).
- Perf within the `full-game-rendering-performance` budget with the grass instance
  cap + LOD active.
- **Reference comparison (`compare-screenshots`):** compare the candidate battle
  shot against `assets/target-battle-map.png`, with crops for foreground grass
  density/color and midground recession. Use the skill's neutral subagent review
  on the reference/candidate pair before accepting. If the candidate is still a
  different map/camera, record the comparison as "both wrong / diagnostic" and do
  not close the slice.
- **Wind at field scale (`write-anim`):** loop the grass field swaying in context —
  the wind should read as a travelling breeze across the field, **not** every blade
  in the same phase, and sway must hold up under the zoom-coupled camera (no shimmer
  at the vista, settles toward top-down). Re-uses the motion gate from Slice 02 at map scale.
- Re-bless the `terrain-3d/*` snapshots.

## Screenshot-critique

**Required** on each re-blessed shot: does the field read as the reference's grass
volume (dense foreground, receding) *without burying units or the gold selection
glow* at the playable mid zoom (grilling Q5)?

The first implementation's critique only cleared the sparse gameplay-stubble
artifact after dark speckles were softened. That is not the same as passing this
reference-volume question.

## Must stay green

`battle-terrain-elevation`, `battle-terrain-features`, the crowd/LOD scenes,
`battle-renderer-visual` (gameplay-zoom unit readability), `full-game-rendering-performance`;
render-graph `ok`; `cargo`.

## Human feedback that would reshape this slice

Density curve; sway amplitude/speed; far-cutoff distance; how aggressively density
keys to `zoomT`; whether grass clears / shortens under unit footprints (ties to
gameplay legibility, Q5).
