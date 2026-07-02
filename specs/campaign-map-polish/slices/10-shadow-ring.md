# 10 — Shrink the city shadow ring

> **RESLICE (2026-07-03, verified on rome-close):** feedback #9's "ugly shadow
> ring around Rome" is NOT the universal city model shadow — normal cities
> (Tibur, Narnia, …) render a fine subtle contact shadow. The visible ugly ring
> is the **light grey garrison-footprint disc** drawn only under occupied/
> garrisoned capitals (Rome has the 1st Legion). That element is owned by the
> occupied-city/garrison path — **fold this fix into slice 08** (capital labels +
> garrison anchor), where the garrison display is already being touched. The city
> **model** shadow (`campaignEntityModels.ts:11` `builder.shadow(3.65,1.95,…)`)
> reads fine at campaign zoom and needs no change; leave it. This slice is
> effectively subsumed by 08 unless the model shadow itself is later judged wrong.

**Original contract (superseded):** no ugly dark ground ellipse ("shadow ring")
around cities (feedback #9, the ring around Rome).

## API seam
- `packages/game-renderer/src/models/campaign/campaignEntityModels.ts:11`:
  `builder.shadow(3.65, 1.95, 0.11, [0.28,-0.54])` builds an oversized 18-segment
  filled ellipse; plus two `contactShadow` strips (12-13). Shrink radii / soften
  alpha / tighten the offset so it reads as a grounded contact shadow, not a ring.
  `shadow()` builder: `models/shared/meshBuilder.ts:43-61`.
- **Firewall:** model shadow only — not the selection ring (slice 12), not label
  anchoring (slice 08).

## What the human can see
- `campaign-lod` `rome-close`; the city model close-up.

## Verification
- **Slice variable / crop:** the ground shadow under the city model. Out of scope:
  selection ring, label position (08).
- **compare-screenshots** vs feedback #9 (ring gone).
- **screenshot-critique** last. Optionally the model-sheet gate for the city model.

## Stay green
- City model-sheet baseline (`shots:models:campaign` / `campaign-models`).

## Feedback that would change this slice
- "now the city looks like it's floating" → add back a tighter, softer contact
  shadow.
