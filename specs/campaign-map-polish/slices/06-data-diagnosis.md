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

## DIAGNOSIS RESULTS (2026-07-03, run against current campaign-map.json + terrainAt)

**Cities-in-sea (feedback #4/#5):** of 412 cities, 37 sit on a water raster cell.
**Every one is a `port`; ZERO non-port cities are misplaced.** By distance to
nearest land: **36 are ≤6km** (icon/marker sits right at the waterline — coastal
ports whose center is a hair offshore of the coarse coastline; this is what the
offshore square markers in #4/#5 are), and **exactly 1 is genuinely far out —
Cnidus (tier1, 14km, @ [834,-104])**. So this is NOT coordinate corruption; it is
coastal-port centers landing on the sea side of the coarse land raster.

**Road graph (feedback #11–13, data half):** 639 road edges. **17 degree-1 junction
stubs** (dead-end roads to a bare junction), **83 degree-0 junctions** (orphan
nodes), road components sized **473 / 25 / 5** + singletons (two isolated clusters).
All 59 road-less cities are legit ports — none stranded. Matches the prune-commit
(`a97db5f5`) hypothesis: cities pruned without cleaning incident junctions.

**Recommended fix-path (default, pending David):**
- Cities: in `crates/mapgen`, snap any city whose center is on water to the nearest
  land cell (small nudge fixes all 36 waterline ports). Cnidus (14km) is either a
  bad ORBIS coordinate → a manual `overrides.json` position, or a large snap; check
  it looks right after.
- Roads: drop degree-≤1 junction stubs + degree-0 junctions; drop or reconnect the
  25- and 5-node isolated components. Preserve the 59 sea-ports.

## What the human can see
- The diagnosis above (counts + the one real city bug, Cnidus). Scripts:
  `scratchpad/diag-cities.mjs` (terrainAt sweep) + the Python road audit.

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
