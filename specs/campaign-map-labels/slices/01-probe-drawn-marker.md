# Slice 01 — The probe verifies the DRAWN marker, not the anchor

**Contract:** `render-probe.mjs` classifies land at the city marker's *drawn*
icon rect (post-layout, post-edge-offset, post-collision), not at
`project(anchor)`. Written test-first: reverting Slice 00 turns this RED on
Ierusalem; with Slice 00 in, every visible city's drawn icon is on land.

**Why:** `measureCities` samples a disc at `api.project(city.pos)` classified by
`api.renderLandAt` — the *anchor*, not the drawn glyph. A marker shoved onto
water over a land anchor is invisible to it (the exact false negative behind
the Ierusalem bug). The verifier must read what the renderer drew.

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

**Deliverable:** probe JSON with per-city `drawnIconLandFraction`; on HEAD (Slice
00 in) all ≈ 1; on HEAD without Slice 00, Ierusalem ≈ 0.

**Gates:** probe green with Slice 00; the RED-without-Slice-00 demonstration
recorded once in the slice notes; `campaignRenderMask.test.ts` untouched (this
slice adds telemetry + a probe sampler, not a classifier change).

**Human checkpoint (non-blocking):** confirm the drawn-rect definition (icon
band vs full label ink) before later slices lean on it. Open the probe JSON +
the Ierusalem crop with preview-shots; proceed on the evidence after ~5 min.

**Stays green:** all existing probe measurements (sea labels, cards, scenery)
unchanged.

**Feedback that would change this:** if the icon sub-band can't be separated
cleanly from the text band in the atlas layout, sample the whole label ink rect
instead and document that the marker check is label-granular.
