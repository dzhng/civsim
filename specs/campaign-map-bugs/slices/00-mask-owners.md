# 00 — Land-truth owners + the probe (foundation, no visual change)

**Contract unlocked:** every subsystem can ask "is this world point land *as the
player sees it*" through exactly one owner per side of the bake boundary, and a
committed probe tool reproduces the current violations as a red baseline.

## The schism (measured, drives this slice)
Three masks disagree today: (a) mapgen's painted raster at 2 km/px — the
campaign-bg.png source (`crates/mapgen/src/raster.rs`, painted in main.rs); (b)
the frontend `TerrainField` (`web/src/campaign/terrain.ts`), which downsamples
the bg to **8 km cells** and is the current sole frontend land query
(`landAt(wx, wy, radiusKm)`); (c) the full-res bg pixels the shader classifies
via `seaAmount` (mapPass WGSL). The slice-07 city snap used (a); players see
(c); the sea-label fitter and road cull consume (b) at coarse radii. Hence B1/B9
and parts of B3/B7b.

## API seam
- **Frontend:** `TerrainField` grows a full-resolution query (e.g.
  `renderLandAt(wx, wy, marginKm)`) classifying the native bg raster with the
  PALETTE table it already owns. The 8 km grid **stays** (it owns height/biome/
  territory claims — retiring it would move territory; division of labor:
  point-truth → full-res, area statistics → 8 km). Zero callers switch in this
  slice.
- **Bake side:** mapgen gains a `RenderMask` self-check — classify its own
  painted raster with the same rules the bg painter used (close the loop:
  the code that paints the pixels classifies them).
- **The bridge:** a cargo test asserting bake-mask vs frontend-classification
  agreement on a probe grid (export a small probe JSON at bake; assert in a
  frontend unit test or compare in cargo against the same classification).
- **Probe tool (committed, not scratch):** `specs/campaign-map-bugs/tools/` —
  a scene-harness script that boots the campaign, projects every city via
  `toScreen`, samples rendered pixels, classifies land/water at marker
  footprint radius, and emits JSON; likewise sea-label sample boxes and card
  rects. This is the cheap per-slice gate for the whole spec (the expensive
  find-map-bugs oracle runs only at lane close-outs).

## What the human can see
- The probe's red baseline JSON: the 12 offshore cities (Cnidus, Sinope,
  Corycus, Ebusus, Rhodos, Tainaron Pr., Myriandros, Meninge, Dianium,
  Pantikapaion, Samos, Leucas), the 4 sea-label land hits, the card overhangs.
  Matching the known-bad list proves the probe measures the right mask.

## Verification
- Cargo + web tests green; **all campaign scene snaps byte-identical** (no
  caller switched — zero pixel movement is the gate); battle scenes green.
- Probe baseline committed under the spec's assets.

## Resolves known-unknowns
- U1: which mask disagrees per offshore city, and the marker footprint in km at
  overview zoom → the margin constant slice 01 needs.

## Feedback that would change this slice
- None expected — foundation only. If the probe's classification disagrees with
  the evidence crops, stop and reconcile before building anything on it.
