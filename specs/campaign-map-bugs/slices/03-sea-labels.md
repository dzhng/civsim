# 03 — B3: sea names inside their water, legible (diagnose → fix) ★human

## LEDGER (shipped 2026-07-03, lane-sea-labels)

**U2 verdict — which measure lied.** Instrumented overlay
(`visualizations/03-sea-labels-overlay.mjs`) replicated the shipped fitter
in-page against the render mask:
1. **Fit zoom vs rendered zoom: real, universal.** Every drawn box was ×1.625
   the fitted world footprint (fit constant 0.26 vs the 0.16 canonical
   framing). Note the camera *clamps* posed scales — the 0.16 framing renders
   at the clamp floor (effective 0.35 px/km at 1600×1000, 0.28 at 1280×800) —
   so 0.26 as a fit-zoom *cap* is conservative for both canonical viewports.
2. **Glyph metrics: NOT the lie.** Estimate within 4–9 % of the true atlas
   measure, erring conservative. Unified anyway (one owner).
3. **Coarse 8 km mask callback: real but minor** (≤ 13 % false-water; let
   AEGEAN "clear" while 14 % of its drawn box was land).
4. **Unnamed fourth lie (the big one): mirrored geometry + silent fallback.**
   The fit cloud rotated `label.angle` in world space while the quad rotates
   in screen space (y down) — the fitted box was the drawn box mirrored about
   the anchor's horizontal, so steep-angle labels (Adriatic −0.65 … Atlantic
   −1.1) validated the wrong footprint. And on fit failure the old fitter
   silently returned min-scale at the original anchor: 5/8 labels (BLACK SEA,
   ADRIATIC, MEDITERRANEAN, TYRRHENIAN, ATLANTIC) drew a placement the fitter
   itself had rejected. Also: ADRIATIC/BLACK SEA/AEGEAN authored anchors sat
   350–700 km inland/off-basin — no honest 60 km budget could reach water.

**Fix (one visual variable: sea-label placement).**
- Fitter samples the label's full drawn rect (true atlas measure via
  `measureSeaLabelGlyphs`, padding + curve depth, 15 km island-scale grid,
  12 km coast margin) in correct screen→world orientation, at
  `min(style.seaLabelFitZoom from the renderer's clampCam floor, 0.26)`,
  against `style.renderSurfaceAt` (slice 00's `TerrainField.renderLandAt`).
- Move-before-shrink: full nudge sweep (along ±240 km / across ±150 km along
  `label.angle`, 20 km steps, distance-ordered) at each scale before the next
  shrink step; `SEA_LABEL_MIN_SCALE = 0.55` is the legibility floor; fallback
  is the least-land candidate, never the rejected anchor. Budget is
  deliberately basin-scale: at ±420 km Adriatic and Aegean defected into the
  roomier Ionian.
- Authored anchors moved to open-water basin centers (Adriatic −15,335 angle
  +0.9; Aegean 460,−60; Black Sea 1480,550; Iberian −1250,90), measured
  against the render mask.
- Telemetry: renderer stats export `seaLabelFits` ({text, scale, nudgeKm,
  landFraction}) and `seaLabelFitZoom`.

**Scorer seam for slice 04** (mapPass, the one placement owner):
`bestPlacement<C>(candidates: Iterable<C>, worldSamplesOf: (c) => [x,y][],
isBadAt: (x,y) => boolean): PlacementVerdict<C> | null` with
`PlacementVerdict = { candidate, badFraction }`. Preference lives in candidate
order; first fully-clean candidate wins, else least-bad earliest; polarity is
the caller's (`isBadAt` = land for sea labels, water for city labels). True
metrics live in the caller's sampler.

**Probe numbers** (tools/render-probe.mjs, whole-map political, landFraction):
ADRIATIC 1.00 → 0, BLACK SEA 0.96 → 0, AEGEAN 0.22 → 0.027, MEDITERRANEAN
0.27 → 0, ATLANTIC 0.16 → 0, TYRRHENIAN 0.09 → 0, IONIAN 0 → 0, IBERIAN 0 → 0.
Gate ≤ 0.05: green. Adriatic draws at the 0.55 scale floor (10 px clamp),
inside its basin.

**Evidence:** `assets/evidence/b3-after-{overview,blacksea,adriatic,atlantic}.png`
vs the `b3-*` defect crops; committed instrument
`visualizations/03-sea-labels-overlay.{mjs,html}` (drawn boxes + render-mask
grid + fit table; regenerate against a dev server).

**Baselines re-blessed (sea-label placement moved them; all other snaps
byte-identical):** campaign-lod-whole-political, campaign-lod-whole-natural,
campaign-frame-zoomout-tall, water/campaign-sea-far.

**★Human checkpoint (non-blocking) — proceeded on critique evidence.**
Unprimed critique verdict: all eight names on water; six clean. Residuals
noted for taste review: (a) AEGEAN sits at the basin's south gate (Cyclades
leave no clean full-rect placement further north — best there ≈ 0.18 land)
and its tail grazes an islet (0.027 box land; tried size 15 → drifted further,
reverted); (b) ATLANTIC hugs the map's left edge under the atmosphere haze —
on water, but low-contrast (the haze is the vignette, not placement; anchor
pulls inward made it shrink+flee, reverted). Sea-label opacity at the clamped
whole-map zoom is the pre-existing fade band, untouched.

---

**Contract unlocked:** every sea/ocean name sits fully on water at the zooms
players see, at a legible size — the fitter's verdict matches the drawn result.
Evidence: `assets/evidence/b3-blacksea.png`, `b3-adriatic.png`, `b3-atlantic.png`,
`david-blacksea-label.png`. Parallel-safe: may start after 00 (does not need 01).

## Diagnose first (instrumented overlay, cheap)
The slice-09 fitter (`fitSeaLabels` in mapPass) shrinks+nudges against
`surfaceAt` — but the confirmed hits (BLACK SEA, ADRIATIC, ATLANTIC tail,
AEGEAN 'A') prove its accepted box ≠ the drawn box. Three candidate lies,
measure before fixing:
1. **Fit zoom vs rendered zoom** (the fitter evaluates at its own zoom constant;
   players see another band);
2. **Estimated glyph metrics vs the actual atlas draw**;
3. **The coarse mask callback** (`field.landAt(x, y, 16)` at 8 km cells).
Artifact: an HTML overlay in `visualizations/` drawing {fitted box, actual
drawn box, mask samples} over the overview capture, per label.

## Fix (one visual variable: sea-label placement)
- Fit with the TRUE atlas measure at the rendered zoom band; callback switches
  to the full-res render mask (slice 00).
- **Move before shrink:** search along the sea's long axis at full size (raise
  the nudge budget), score water-coverage-first; shrink only as last resort
  with a pinned legibility floor (`SEA_LABEL_MIN_*`) — the Adriatic label must
  come back legible, not vanish.
- This slice **creates the shared placement scorer** (candidates ×
  land-fraction with true metrics) that slice 04 reuses. It lives beside the
  fitter in mapPass — the one placement owner.

## What the human can see
- Overview capture with all sea names on water; the overlay re-run showing
  fitted == drawn.

## ★ Human checkpoint (non-blocking)
Sea-label typography is taste — open the overview; ~5 min; else proceed on
critique evidence (ask it explicitly: "are all sea names legible and on water?").

## Verification
- Probe (slice 00) asserts every sea-label bbox mostly-water at render zoom +
  Adriatic ≥ the size floor; campaign-lod label stats; compare-screenshots vs
  the three evidence crops. Oracle: covered by the labels-lane close-out (04).

## Firewalls
- Sea labels only — city/army/faction labels untouched; fitter stays in mapPass.

## Resolves
- U2: which measure lied (zoom gate / glyph metrics / coarse mask).
