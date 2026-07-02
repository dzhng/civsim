# 11 — Cart size ≈ road width

**Contract unlocked:** trade carts read as small road decorations, ~the width of
the road, not 5× oversized (feedback #10, #8).

## API seam (one-liner)
- `web/src/campaign/renderer.ts:1186`: carts emit at `size: 6.0, height: 4.0`.
  Road full width ≈ 1.1 km (`halfWidth 0.55`, `mapPass.ts:1193`), so the cart is
  ~5× the road. Set `size ≈ 1.2–1.5` (mesh authored in unit space, so `size` ≈
  world-km); scale height to match. Mesh: `models/shared/sceneryPropModels.ts:41-66`.
- **Firewall:** production cart emit only — leave the registry `defaultScale` /
  renderer-lab review sizes alone (they only affect the lab sheet).

## What the human can see
- A road-with-carts regional shot at cart zoom (`cam.scale >= 3.2`).

## Verification
- **Slice variable / crop:** cart width relative to road width. Out of scope: cart
  model/material, road rendering.
- **compare-screenshots** vs feedback #10 (cart now road-width).
- **screenshot-critique** last.

## Stay green
- Any scenery scene that includes carts.

## Feedback that would change this slice
- "a touch bigger/smaller" → nudge the single `size`.
