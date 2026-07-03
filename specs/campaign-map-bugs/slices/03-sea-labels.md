# 03 — B3: sea names inside their water, legible (diagnose → fix) ★human

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
