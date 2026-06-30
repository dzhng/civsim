# Slice 03 — grass over terrain

## Contract unlocked

Grass on the real maps — density-driven by ground cover/tint, seated on the height
field, and cheap enough to keep at gameplay zoom. This is the reference's dense,
waving foreground that dominates the lower third.

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

## What the human can run / see

The existing `renderer/battle-terrain-3d?gate=<map>` route now shows grass on all
three catalog maps (`river-and-crags`, `walled-plain`, `coastal-scrub`).

## Verification

- Extend `web/scenes/battle/battle-terrain-3d.mjs`: `bladeInstances > 0` only on
  grass cover, **zero over water/rock**; soldiers/props still seat (no floating
  blades — depth correct).
- Perf within the `full-game-rendering-performance` budget with the grass instance
  cap + LOD active.
- **Wind at field scale (`write-anim`):** loop the grass field swaying in context —
  the wind should read as a travelling breeze across the field, **not** every blade
  in the same phase, and sway must hold up under the zoom-coupled camera (no shimmer
  at the vista, settles toward top-down). Re-uses the motion gate from Slice 02 at map scale.
- Re-bless the `terrain-3d/*` snapshots.

## Screenshot-critique

**Required** on each re-blessed shot: does the field read as the reference's grass
volume (dense foreground, receding) *without burying units or the gold selection
glow* at the playable mid zoom (grilling Q5)?

## Must stay green

`battle-terrain-elevation`, `battle-terrain-features`, the crowd/LOD scenes,
`battle-renderer-visual` (gameplay-zoom unit readability), `full-game-rendering-performance`;
render-graph `ok`; `cargo`.

## Human feedback that would reshape this slice

Density curve; sway amplitude/speed; far-cutoff distance; how aggressively density
keys to `zoomT`; whether grass clears / shortens under unit footprints (ties to
gameplay legibility, Q5).
