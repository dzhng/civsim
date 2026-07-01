# Slice 03B4C5B4B1A1AB - field-owned foreground occlusion blade layer

## Contract

Test whether the fixed close lab can produce target-like close grass body only
when the field-owned domain adds a near-foreground vertical/occluding blade
layer, instead of relying on surface texture, per-cell micro geometry, or
source-attached mats.

This slice is deferred behind
`03b4c5b4b1a1aa-false-earth-close-material-replication.md`. Do not implement it
until the false-earth replication spike records what the source architecture
actually needs for dense close grass body. If the replication spike accepts, this
slice may be replaced by a porting slice instead of implemented as written.

B4B1A1Z proved that continuous field-owned strand/nap texture is not enough: it
spans across cells, but remains flat diagonal scratches on the ground. The next
active slice is now the false-earth exact-replication spike; this slice remains
the fallback hidden-variable test for **foreground occlusion and upright blade
body at the bottom of the close crop** if the source-architecture replication
does not supersede it.

## Approach

- Start from the fixed B4B1A0 lab and rejected B4B1A1W/X/Y/Z evidence.
- Keep ownership in the field/domain seam. The blade layer may use bounded
  near-foreground geometry or a terrain-attached occlusion/decal layer, but it
  must be generated from field-domain cells/rows, not source records,
  field-subcell emitters, or accepted grass records.
- Generate one or two deterministic candidates that concentrate only on the
  close foreground review window: interleaved upright blade silhouettes,
  occluding base/tip layers, and darker/lighter pocket structure at the lower
  crop edge.
- Telemetry must prove ownership and bounded cost: domain id, foreground row or
  band count, blade/occluder count, source attachment flag, submitted triangles,
  geometry/material bytes, domain coverage min/median/avg, exposed-ground
  estimate, and near-band world/pixel scale.
- If the candidate needs palette, fog, terrain, camera, atlas art, final
  density/coverage, LOD, or camera-relative generation to look plausible, stop
  and reslice again. This slice is about vertical foreground body/occlusion, not
  polish.

## Fixed Inputs

- Do not change camera, target images, crop windows, terrain, meadow/root
  material, lighting, palette, fog, water, cliffs, sky, atlas content, or final
  reference-route constants.
- Do not tune final coverage, palette, wind, LOD, camera-relative generation, or
  final compose.
- Do not accept flat texture nap, repeated wallpaper, marker posts, source-local
  fans, shell/card swipes, isolated yellow flecks, pure screen-door noise, or
  a few foreground strokes as a solution.

## Accept / Reject

Accept if the close crop gains continuous lower-foreground grass body with
visible upright/occluding blade layers at the target scale, while the center
field no longer reads as exposed flat paint and no source/cell clumps, cards, or
debug markers dominate.

Reject if the foreground layer becomes a curtain/card wall, sparse posts, hard
bands, repeated stamps, texture-only scratches, disconnected flecks, or an
unbounded triangle/material cost before the close grass body appears.

## Verification

- Archive full lab shots, target/rejected/candidate crop sheet, tight crops,
  stats JSON, foreground-occlusion telemetry, comparison reports, and decision
  note under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/field-owned-foreground-occlusion-blade-layer/`.
- Use `compare-screenshots` against the target close crop and rejected B4B1A1W,
  B4B1A1X, B4B1A1Y, and B4B1A1Z crops. Judge only lower-foreground vertical
  body, occluding blade mass, visible element scale, and absence of
  source/cell/card artifacts.
- Run unprimed `screenshot-critique` scoped to: "Does this field-owned
  foreground occlusion layer create close grass body with upright/overlapping
  blade mass, without flat paint, source-local marks, cell clumps, shell/card
  strokes, or pixel noise?"
- Open the variant sheet with `preview-shots` as a non-blocking checkpoint.
- Keep focused lab route checks and `bun run --cwd web typecheck` green.

## Next Slice

If accepted, continue to
`03b4c5b4b1a2-close-body-perf-envelope.md`. If rejected, reslice close-body
ownership/representation again before perf, coverage, palette, LOD,
camera-relative generation, or final compose.
