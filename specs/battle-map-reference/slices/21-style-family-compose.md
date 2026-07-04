# Slice 21 - style-family compose

## Contract

Compose the accepted camera, foreground grass, midground LOD meadow, background
cliffs, and distance fog into one review shot that captures the reference vibe.

## Slice Variable

Whole-frame style family.

This is the first slice that judges the entire image. Earlier slice variables
must already be accepted.

## Scope

- Capture the master shot and key crops: foreground grass, midground meadow,
  background cliffs, fog/depth, and full frame.
- Use the perspective reference for vibe and the top-down reference for loose
  topology only.
- Optional water may appear only if it derives from the same heightmap and uses
  the shared water material/environment.
- Do not reopen exact image replication. The goal is the same style language:
  centered horizon, dense foreground, soft middle distance, tall terrain-owned
  cliffs, and coherent haze.

## Verification

- Run
  [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md)
  against the perspective reference and current band-composition screenshot for
  less-wrong full-frame style.
- Run
  [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md) as
  the final unprimed verdict.
- Keep terrain/passability, grass perf, camera, and environment gates green.

## Accept / Reject

Accept if the shot clearly reads as the target style family: horizon at the
middle, dense foreground grass, soft midground meadow, tall terrain-owned
cliffs, and coherent distance fog.

Reject if it only works from one crop, if fog hides bad terrain, if grass hides
bad LOD, if cliffs are decorative, or if the process drifts back into
whole-frame exact-match tuning.
