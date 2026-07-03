# 06 — B9: scenery gated by the render mask

**Contract unlocked:** no scenery instance (tree, rock, beach decal) renders
over water as the player sees it; beach decals sit on the land side of a real
coast. Evidence: `assets/evidence/b9-island-scenery.png` (pill-shaped beach
decal + two trees on open water, top-left island of the regional shot).
Needs only slice 00.

## API seam (consume the owner, don't fork one)
- The campaign scenery candidate builder (in the campaign renderer glue) gates
  final candidates through `TerrainField`'s full-res query with a per-prop
  footprint margin; beach decals additionally require coast adjacency (land
  cell with a water neighbor). No other placement logic changes; no private
  pixel classification.

## What the human can see
- Regional capture; before/after crop of the island.

## Verification
- Probe extension: project every scenery/decal instance, classify, assert 0 on
  water; scenery count stats sane (no mass extinction — if counts drop >10%,
  the margin is too aggressive, stop and tune).
- campaign-visual/campaign-polish scenes re-blessed; critique on the island
  crop; compare vs the evidence crop.
- Oracle: covered by the lane close-out with 05/07.

## Firewalls
- No new prop types, no density retuning, battle scenery untouched.
