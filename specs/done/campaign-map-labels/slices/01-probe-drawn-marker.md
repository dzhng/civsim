# Slice 01 — The probe verifies the DRAWN marker, not the anchor

**Contract:** `render-probe.mjs` reads the city marker's *drawn* icon rect
(post-layout, post-edge-offset, post-collision), not just `project(anchor)`, and
reports two things per city with a drawn marker: `drawnIconLandFraction`
(informational — how much of the icon footprint is over water) and
`drawnIconOffsetPx` (the **gate** — how far the drawn icon sits from its
projected anchor). Reverting Slice 00 makes Ierusalem's `drawnIconOffsetPx`
spike (~52px) and it gets reported; with Slice 00 in, every city's marker sits
at the uniform structural lift (~4px) and Ierusalem's drawn icon is on land.

**Why:** `measureCities` sampled a disc at `api.project(city.pos)` classified by
`api.renderLandAt` — the *anchor*, not the drawn glyph — so a marker shoved onto
water over a land anchor was invisible to it (the exact false negative behind
the Ierusalem bug). The verifier must read what the renderer drew.

**Why offset, not land fraction, is the gate (measured):** `drawnIconLandFraction`
alone can't separate a marker detached into open sea (bug) from a **coastal
port** whose marker correctly overhangs the waterline. Tarraco (0.275) and
Constantinopolis (0.341) are real ports sitting on their coast — the same
"informational, not a gate" case the shipped campaign-map-bugs README ruled for
city `landFraction`. So land fraction is reported for the eye/oracle, and the
hard detached-marker gate is `drawnIconOffsetPx`: correctly-placed cities
(inland or coastal) all sit at the ~4px structural icon-lift; a displaced marker
(Ierusalem pre-fix, ~52px) spikes far above it. Gate: `drawnIconOffsetPx` beyond
a small threshold (~16px) = the marker has detached from its city.

**API seam / owner:**
- `packages/game-renderer/src/campaign/mapPass.ts` — add `iconRect?: {x,y,w,h}`
  (+ `corners`) to `CampaignLabelDebugRect`, populated by `labelDebugRects` for
  `kind === 'city'` labels that carry an `icon`, computed from the same
  icon-above layout math that draws the glyph (the layout already knows the
  icon box). **This grows the existing debug-rect contract — no parallel
  telemetry.**
- `specs/done/campaign-map-bugs/tools/render-probe.mjs` — `measureCities`
  matches each city to its drawn rect from `stats.visibleCityLabelRects` by
  nearest projected anchor, samples `iconRect` through `renderLandAt` (reuse
  `measureLabelRects`' quad sampler), reports `drawnIconLandFraction`. Keep the
  anchor field for continuity; the **gate** moves to the drawn rect.

**Deliverable:** probe JSON with per-city `drawnIconLandFraction` +
`drawnIconOffsetPx` and a per-framing `maxDrawnIconOffsetPx`. On HEAD (Slice 00
in) every `drawnIconOffsetPx ≈ 4` (structural lift) and Ierusalem's
`drawnIconLandFraction = 1`; without Slice 00, Ierusalem's `drawnIconOffsetPx`
jumps to ~52 and it is reported. Coastal ports (Tarraco ≈ 0.28,
Constantinopolis ≈ 0.34 land fraction; ~4px offset) are the informational
baseline — flagged by land fraction, cleared by offset.

**Gates:** probe green with Slice 00 (`maxDrawnIconOffsetPx` below the ~16px
detach threshold); the RED-without-Slice-00 demonstration recorded once in the
slice notes; `campaignRenderMask.test.ts` untouched (this slice adds telemetry +
a probe sampler, not a classifier change).

**Verified (SHIPPED):** GREEN with slice 00 — whole-map `maxDrawnIconOffsetPx =
4.27` (the uniform structural lift), Ierusalem `drawnIconOffsetPx 4.2 /
drawnIconLandFraction 1`, no marker detached. RED without slice 00 (reverting
`renderer.ts` to the edge-shove) — `maxDrawnIconOffsetPx = 72`, catching **three**
detached markers the old anchor probe missed: Corduba 72, Ierusalem 52 (land
fraction 0, in open sea), Londinium 50. So slice 00 fixed Corduba and Londinium
too, and the probe is a real regression lock. `npm run test:unit` 83/83
(campaignRenderMask green); `tsc` clean.

**Human checkpoint (non-blocking):** confirm the drawn-rect definition (icon
band vs full label ink) before later slices lean on it. Open the probe JSON +
the Ierusalem crop with preview-shots; proceed on the evidence after ~5 min.

**Stays green:** all existing probe measurements (sea labels, cards, scenery)
unchanged.

**Feedback that would change this:** if the icon sub-band can't be separated
cleanly from the text band in the atlas layout, sample the whole label ink rect
instead and document that the marker check is label-granular.
