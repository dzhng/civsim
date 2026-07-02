# 08 — Occupied-capital names at low zoom + garrison label-far fix

**Contract unlocked:** Roma/Carthago (and any garrisoned capital) show their NAME
when zoomed out (feedback #7), and occupied-city labels sit at the city rather
than adrift on the garrison marker (feedback #9: "1st legion text so much farther
from the city").

## API seam (single owner — label/marker system, invariant 4)
Root cause: an occupied city's label is suppressed and its name moved onto the
garrison army label, which is itself culled at low zoom.
- `web/src/campaign/renderer.ts:854-858` (occupiedCities skip), `:919` (name as
  army `subText`), `:933-940` (`occupiedCityLabels`). Army-label cull
  `mapPass.ts:1382-1385` (`zoom <= 0.35`); tier gate 1377-1381. Roma/Carthago are
  tier-3 via `crates/mapgen/overrides.json`.
- Fix: keep a city label for occupied tier-3 cities (decouple the name from the
  cullable army label) so the name survives low zoom.
- **Garrison label-far half of feedback #9** folds here (same garrison-anchor
  owner): `renderer.ts:909-915, 928, 950-957` (`garrisonDisplayAnchor`,
  `screenOffsetY`, `overlapClearance`, `selectedOffset`) — pull the label back to
  the city footprint. (The shadow-ring half of #9 is slice 10.)
- **Firewall:** don't add a second cull path in `renderer.ts`; the tier/cull
  policy stays in the `mapPass` label gates.

## What the human can see
- New scene `campaign-lowzoom-capitals`: zoomed-out overview with Roma + Carthago
  labelled; an occupied city close-up with the label at the city.

## Verification
- Assert both capital names present at `zoom <= 0.35`.
- **compare-screenshots** vs feedback #7 (names now shown) and #9 (label proximity).
- **screenshot-critique** last.

## Stay green
- Label collision/culling scenes (`campaign-polish-markers`).

## Feedback that would change this slice
- David may want ALL tier-3 names at max zoom-out, or a different occupied-city
  treatment — adjust the tier gate vs the occupied-label decouple accordingly.
