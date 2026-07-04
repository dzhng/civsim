# Slice 17 - foreground grass band integration

## Contract

Carry the already-built dense grass foundation into the locked battle camera's
foreground band. The lower frame should read as close, rooted green/olive grass,
using the field-owned grass stack from this goal rather than starting another
grass primitive.

This slice is a color/rooting/coverage integration pass on the existing
Slice 15/16 `field-fiber-shell` / `field-near` stack. Do not swap to
`field-fiber-body` + `field-subcell` to make the foreground crop busier:
Slice 14b2d and the failed Slice 17 diagnostic both showed that path overfills
the crop with isotropic raw-edge carpet while losing vertical blade structure.

## Slice Variable

Foreground grass density, color, and rootedness.

- **Judge:** lower-band coverage, close blade/fiber legibility, root darkness,
  green/olive palette, terrain/slope eligibility, and performance budget.
- **Do not judge:** midground LOD softness, cliff scale, distance fog, camera
  framing, or final whole-frame style.
- **Important distance limit:** the locked foreground crop is still a vista crop.
  It can judge grass mass, green/olive color, rooted darkness, terrain/slope
  ownership, and perf. It cannot accept individual blade anatomy by itself.
  Blade legibility stays on the close foreground camera gate from Slice 14b.

## Architecture

- Reuse `sampleGrassField`, the retained `field-fiber-*`/`field-strand-*`
  machinery, and the False Earth close-grass spike learnings.
- The active full-scene foundation is the `field-fiber-shell` / `field-near`
  route used by Slices 15 and 16. `field-strand-mat` remains useful diagnostic
  evidence for directional structure; `field-fiber-body` + `field-subcell` is a
  rejected lower-band carpet unless a future close-gate pass proves otherwise.
- Keep grass camera-aware for density/perf but terrain-owned for placement,
  slope filtering, normals, palette, and passability compatibility.
- Use real battle colors now: green/olive body, darker rooted base, restrained
  highlights. Do not use yellow diagnostic tint except in explicit diagnostics.
- Keep the midground and far grass behavior frozen from Slice 15 unless the
  minimum wiring is required to preserve continuity at the foreground boundary.

## Implementation Order

1. **Foreground occupancy first:** prove the accepted `field-fiber-shell` records
   actually land in the locked foreground crop. The gate must include a
   grass-off/current/candidate foreground crop and stats tying submitted shell
   records to the lower-band screen area. Do not tune material color until this
   is true.
2. **Shell visibility second:** tune shell record selection, depth window,
   camera-aware focus, blade height/width, and shell budget so the lower band
   shows visible close fibers without using `field-fiber-body`,
   `field-subcell`, or another carpet primitive.
3. **Palette/rooting third:** once shell occupancy is visible, apply the real
   battle palette: green/olive blades, darker rooted bases, restrained
   highlights, and no yellow diagnostic tint. A default-off meadow/grass
   material tone control is acceptable only as an adapter for the accepted shell
   route, not as the primary grass evidence.
4. **Continuity later:** after Slice 18 measures whole-terrain grass coverage
   and perf, blend foreground into mid/far LOD in Slice 18b. Do not solve
   foreground and LOD in one comparison.

## Current Learning

- The failed Slice 17 diagnostic showed that increasing meadow/root material
  tone can make the lower crop greener and darker, but it does not by itself
  make the foreground read as grass. Material tone is supporting evidence only.
- Increasing `field-fiber-shell` budget and ribbons still left most visible
  fibers reading as a thin distant band under the locked camera. The next pass
  must solve screen-space foreground occupancy: camera-depth selection is not
  yet equivalent to "inside the lower foreground crop."
- Keep the earlier close-camera grass work. The failure is integration into the
  battle vista camera, not a reason to replace the good grass foundation.

## Review Surface

- Foreground crop from the locked Slice 16 camera.
- Optional close crop proving the same machinery can still show individual
  strands when the camera is close enough.
- Grass-off comparison for coverage and rootedness only.
- Stipple/carpet negative anchor: the known failed `field-fiber-body` +
  `field-subcell` route may be kept as a reject/control, but not as the
  accepted candidate.

## Verification

- Publish grass record counts, draw calls, foreground crop coverage, projected
  blade/fiber height, tint invalid counts, and slope-rejected records.
- Do not use `foregroundBladeProjectionStats` as acceptance evidence until it is
  fixed. It currently derives the sample world point through the 2D z=0
  `screenToWorld` helper under the 3D camera, then reprojects a terrain-height
  blade from a different screen anchor. That can report a blade height for a
  point outside the judged crop.
- The vista crop gate must not reward raw one-pixel edge energy or contrast
  alone. Use downsample-retained structure, vertical anisotropy, green/olive
  palette, rooted darkness, and grass-off / stipple negative anchors. Individual
  vertical-run blade acceptance belongs to the close camera gate.
- Run
  [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md)
  against the perspective reference foreground and the Slice 16 current
  foreground crop for grass density/color only.
- Run
  [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md)
  scoped to foreground grass only.

## Accept / Reject

Accept if the lower band reads as dense close grass in the target green/olive
family without breaking terrain ownership or budget, while keeping the accepted
`field-fiber-shell` foundation.

Reject if it becomes speckled carpet, swaps in a new disconnected primitive,
turns yellow/diagnostic, or changes camera/fog/cliffs to make grass look better.

Also reject if the foreground only becomes darker/greener meadow while the
accepted shell fibers remain invisible in the lower crop.

Also reject any pass whose evidence says "more raw edge" while downsample
retention, vertical anisotropy, or close-gate blade evidence gets worse.

## Next

Run `18-full-terrain-false-earth-grass-perf.md`.
