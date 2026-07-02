# 09 — Sea labels fit inside their sea

**Contract unlocked:** each curved italic sea label sits inside its body of water
with a comfortable land margin (feedback #6/#15/#16: labels spill onto land). The
curved-italic Georgia style David likes is preserved — only size/rotation/fit
change.

## API seam (single owner — label system, invariant 4)
- `packages/game-renderer/src/campaign/mapPass.ts`: `seaLabels()` constants
  (1330-1341: x/y/size/angle/curve), `measureSeaLabel` (1776-1804),
  `drawSeaLabelText` (1806-1837), zoom fade (1386-1388). No fitting logic exists
  today — labels are hand-tuned points that have drifted.
- **Approach (committed): a sea-mask fit check** — measure the label's bbox along
  its arc against `field.landAt`, shrink (and/or nudge/rotate) until the whole arc
  clears land by a margin. Per-label constant retune is the fallback for stubborn
  labels only. This is the durable fix vs re-drifting hand-tuned points.
- **Firewall:** sea labels only — no city-label changes; keep the curve/italic style.

## What the human can see
- New scene `campaign-sea-labels`: the offending seas (Mediterranean, Adriatic,
  Black Sea) at 2–3 zoom levels.

## Verification
- Assert sampled label glyph centers (and bbox extremes) all return `landAt ==
  sea` with margin.
- **Slice variable / crop:** sea-label *fit* (no glyph touches land, margin
  respected). Out of scope: label font/color/curve style.
- **compare-screenshots** vs feedback #6/#15/#16.
- **screenshot-critique** last (no spill; still reads as an elegant chart label).

## Stay green
- `water-sea` scene (`campaign-sea-near/-far`).

## Feedback that would change this slice
- David may want a larger/smaller default margin, or a specific label re-placed.
