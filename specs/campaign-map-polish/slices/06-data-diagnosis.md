# 06 — Cities-in-sea + road-graph diagnosis (read-only)

**Contract unlocked:** a decided fix-path for the city-placement bug (feedback
#4/#5) and the remaining road-data holes, **before** any Rust edit. Read-only.

## API seam (read-only investigation)
- **6a — cities in sea (item D):** a diagnosis script over
  `web/public/data/campaign-map.json` + the coastline raster
  (`web/src/campaign/terrain.ts` `landAt`). List every city node whose projected
  `node.pos` lands on water. Classify each: bad ORBIS lon/lat, wrong site-snap, or
  projection-vs-raster-coastline disagreement. Source of coords:
  `crates/mapgen/src/sources.rs:43` `project`, `geo.rs:10-19` Lambert azimuthal,
  `build.rs:472-480`.
- **6b — road holes (item L-data):** with slice 05's relaxed cull live, enumerate
  the remaining degree-1 stubs (~17), degree-0 junctions (~83), and disconnected
  components (25 & 5 nodes). Confirm which are *real* holes vs the 59 legitimate
  sea-only ports (which must NOT be "fixed"). Prune commit `a97db5f5` is the
  suspected origin.

## What the human can see
- A diagnosis report (markdown/HTML) + an annotated overview screenshot with each
  offending city circled and each real road hole marked.

## ★ Human checkpoint (non-blocking)
Open the report + annotated shot with **preview-shots**. David picks: the D
fix-path (override table vs projection fix vs coastline nudge) and confirms the
road reconnect strategy. If silent ~5 min, default to `overrides.json` position
overrides for cities (lowest pipeline risk) + drop degree≤1 junction stubs +
reconnect the two components; record the decision in the README and proceed.

## Verification
- No product code → whole suite green. The artifact IS the deliverable.

## Feedback that would change this slice
- David may want some "in-sea" cities left (islands/ports) — the classification
  must separate genuine errors from intended coastal/island placement.
