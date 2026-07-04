# Slice 19 - background cliff scale and bases

## Contract

Make the background cliffs and mountain shoulders read roughly 3x taller and
more imposing than the current screenshot, while keeping them part of the
terrain heightfield and slope/passability system.

Slice 13 proved the terrain-owned cliff path. This slice rechecks cliff scale in
the composed camera after foreground and midground work, and fixes the pasted
base/shelf problems called out by critique.

## Slice Variable

Background cliff scale, silhouette, bases, and impassible terrain ownership.

- **Judge:** projected height, skyline/ridge mass, cliff-base transition into
  midground terrain, slope-derived impassibility, and absence of detached
  backdrop geometry.
- **Do not judge:** grass density, fog, final cliff texture polish, water, or
  whole-frame style.

## Architecture

- Cliffs remain terrain features derived from the height source. No separate
  backdrop cards or decorative wall meshes.
- Slope/normal data owns rock eligibility and impassibility. Above the walkable
  slope threshold, terrain is rock and non-walkable; transition bands may become
  scree/slow ground.
- Use the top-down heightmap reference as a loose topology guide for valley
  containment and mountain shoulders, not as a pixel-perfect map.
- Preserve the centered-horizon camera from Slice 16.

## Review Surface

- Background cliff crop from the locked camera.
- Cliff-base crop where mountains meet the midground.
- Top-down cliff/passability mask.

## Verification

- Publish max height, p90/p98 background height, projected sky-block height
  ratio, cliff mask ratio, impassible ratio, valley passable ratio, and
  reachable corridor status.
- Compare against the current screenshot and the Slice 13 evidence for cliff
  presence only; target roughly 3x stronger projected background height than the
  low current shelf.
- Run
  [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md)
  for cliff silhouette/base placement only.
- Run
  [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md)
  scoped to terrain-owned cliff scale and bases only.

## Accept / Reject

Accept if cliffs read as tall impassible terrain that contains the valley and
connects visually to the midground without pasted slabs.

Reject if cliffs are decorative geometry, if the camera fakes height, if the
valley collapses, or if fog/material polish is used to hide bad silhouette.

## Next

Run `20-distance-fog-atmosphere.md`.
