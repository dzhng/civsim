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
  the city footprint.
- **The "ugly shadow ring" of feedback #9 also folds here (reslice from slice 10):**
  it is a LIGHT-grey oval ground decal drawn only under occupied/garrisoned
  capitals. Verified facts (narrow the search with these):
  - It is NOT the city model shadow (`campaignEntityModels.ts:11`) — that's on every
    city and reads fine; normal cities show no disc.
  - It is NOT the selection ring — `rome-close` deselects (`select(-1)`) yet the
    disc is present. The selection instance at `renderer.ts:825` is gated on
    `army.id === opts.selected`, so it isn't that.
  - It is LIGHT (grey/white with a faint dark rim), so it is not the soldier-crowd
    shadows (those are dark; `renderer.ts` `soldierShadows.upload`).
  - It appears exactly where the garrison army renders at `garrisonDisplayAnchor`
    (`renderer.ts:786-798`, the "army" entity at the anchor) with the crowd figures
    standing on it.
  - **Next step:** grep for a light ground platform/plaza/decal drawn for a
    garrisoned city or under the campaign crowd that is NOT gated on selection
    (candidates: a garrison "platform" mesh, a ground-plane decal in the entity/
    scenery pass, or a crowd ground disc). Make it subtle or remove it so a
    garrisoned capital doesn't wear a halo.
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
