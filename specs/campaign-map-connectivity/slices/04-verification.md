# S4 — Verification: lane scenes + screenshot-critique + map sweep

**Contract:** the whole model is proven on the final re-baked map — the 3 lanes
cross water, are solid and on top, both endpoints are cities; the map has no
islands, Britain is gone, Sicily present.

**API seam / owner:** new `web/scenes/campaign/sea-lanes.mjs` (pattern from
`water-sea.mjs`), `VERIFY_GPU=1`, `meta.snapshots`:
- Per-lane camera; `project` both endpoint cities; march the projected lane and
  sample pixels — assert (a) bright lane pixels CONTINUOUS (solid), (b) where the
  lane passes over `renderLandAt==water` the pixel is lane color, not sea color
  (on-top). Snap `sea-lane-gibraltar` / `-bosphorus` / `-sicily`.
- One overview shot.

**Verification gates:**
- `cargo test -p mapgen` green (S0–S2 invariants).
- The lane scene stats/pixel checks green.
- **screenshot-critique** (unprimed sub-agent) on the 3 lane crops + overview.
- **compare-screenshots** vs David's before shots.
- **find-map-bugs** sweep on the overview — catches floating cities from
  deletions, dead-end reconnect roads, coastline artifacts from the carve.

**Stays green:** all existing campaign scenes (re-blessed for the new city set /
carved coast); battle scenes untouched.

**Human checkpoint (non-blocking):** David signs off the 3 lane shots + the
whole-map sweep.
