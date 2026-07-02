# 05 — Roads: relax the renderer land-cull

**Contract unlocked:** graph-connected coastal roads that dip over a few water
raster cells stop being silently dropped (feedback #11/12/13: cut-off roads,
cities with no road). Runs against the *current* JSON on purpose — this isolates
how many "missing roads" are renderer-cull false-negatives vs genuine data holes,
sizing the mapgen work in 07.

## API seam (renderer only)
- `packages/game-renderer/src/campaign/mapPass.ts` `roadEdgeIsLandSafe`
  (1235-1253): drops an edge if `landSamples/samples < 0.68`. Coastal ORBIS roads
  hug the coastline and dip over the coarse land mask → dropped though the graph
  connects. Relax the threshold and/or the `renderer.ts:609` `landAt` slack.
- **Firewall:** renderer only — no JSON edit, no mapgen, no re-bake.

## What the human can see
- `campaign-polish-roads` (`polish-road-continuity`) + a coastal-road regional shot
  from the feedback #11–13 stretches.

## Verification
- Rendered-edge count before/after (log the edges the <68% test dropped).
- **Slice variable / crop:** road *presence/continuity* along the coast. Out of
  scope: cart size (11), road width/material.
- **compare-screenshots** vs feedback #11–13 (roads now connect).
- **screenshot-critique** last. **Known-unknown check:** does relaxing reintroduce
  roads drawn visibly over open water? If so, tune the threshold at this gate.

## Stay green
- `campaign-polish-roads`, `campaign-lod` road regions.

## Feedback that would change this slice
- "now roads run over the sea" → tighten; "still missing" → residual list feeds 07.
