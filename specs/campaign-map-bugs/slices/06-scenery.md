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

## Ledger (shipped 2026-07-03, branch lane-scenery)
- **What B9 actually was:** the "pill beach decal" is a REAL island in the
  bake raster (near Populonium; render mask confirms land there) — the audit
  read it as a decal. The defect was the trees: candidates are generated on
  the 8 km `field.land` grid with up to ±5.6 km jitter, so near small islands
  and coasts they landed on open water.
- **Fix:** `buildCampaignSceneryCandidates` (web/src/campaign/renderer.ts)
  gates every mountain/rock/tree candidate through
  `sceneryFootprintOnLand(field, x, y, size)` =
  `field.renderLandAt(x, y, size * 0.5)` — the instance's own footprint
  radius as the margin (`size` ≈ footprint diameter in km), per codex-review
  finding that fixed per-kind constants under-covered large props. Carts
  (road-spline riders) and `testStageScenery` untouched; no other placement
  logic changed; renderLandAt is the only classifier.
- **Scenery counts (full candidate set):** before 10,791 (406 on open water:
  224 broadleaf, 181 conifer, 1 mountain); after 10,761 (-0.28%, guard ≤10%)
  with onWater 0 and footprintOverWater 0. Per kind after: mountain 2,983,
  conifer 4,417, broadleaf 2,387, rock 974 (selection quotas backfill from
  the raw pool, so per-kind totals barely move).
- **Probe:** render-probe.mjs gained a top-level `scenery` section (center +
  footprint classification per instance, per-kind counts, violations with
  whole-map screen coords) via the new `window.__campaign.sceneryCandidates()`
  debug hook; green meaning recorded in tools/README.md.
- **Evidence:** assets/evidence/b9-after-island-scenery.png (fresh capture,
  same regional framing) — island intact, zero floating scenery. A frame-wide
  pixel scan (tree-green adjacent to sea-blue) finds 0 clusters.
- **Baselines re-blessed (all scenery-explained, verified against a stashed
  clean run):** campaign-lod (all 9), campaign-map-alignment (3),
  campaign-frame-zoomout-wide, polish-road-continuity. Everything else
  byte-identical (campaign-visual, polish-markers, water-sea,
  campaign-models, campaign-frame-zoomout-tall).
- **Out-of-scope observations for the 05/07 lane close-out:** the island
  itself still reads as a flat sand pill (8 km biome resolution) with the
  territory-wash rim tracing its dilated 8 km outline — that rim conformance
  is slice 05's variable, not scenery.
