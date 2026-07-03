# 17 — Own-city + own-army bronze cards (DOM overlay)

**Contract unlocked:** own cities AND own field armies render the chosen
**variation-C faction-banner card** as a DOM overlay anchored via
`renderer.toScreen` (David's pick + extension):
- **Own city:** faction-color band on top, name row, income row; if garrisoned,
  the army line rides an attached darker footer row (one silhouette).
- **Own field army:** same C card — faction band, army name ("1ST LEGION"),
  strength line ("2.6K"). Same material, smaller content.
Neutral/enemy stay canvas labels (slice 18). Depends on slice 13 (bronze tokens,
single-root HUD) and slice 16 (C chosen).

## API seam (invariants 4, 5)
- New anchored DOM overlay in the campaign React layer (mounts into the slice-13
  single-root shell), positioned with the existing `renderer.toScreen(wx,wy)`
  (renderer.ts:174) — **not** a parallel anchor computation. Reuse `HudPanel` /
  `.hud-chassis` for the card and `.ucard` for the garrison strip.
- **Label ownership (invariant 4):** own-city entries are **removed from the
  canvas `CampaignLabel` pass and promoted to the DOM overlay** — never drawn by
  both, never a parallel React city loop. The canvas emitter stays the owner of
  the many cheap neutral/enemy labels; the overlay owns the few rich own-city cards.
- Income from the same source `CityPanel.tsx` reads.
- **Firewall:** own-city cards only — neutral/enemy stay canvas (slice 18). The
  overlay must be `pointer-events` correct so it does not eat map clicks / city
  selection hit-testing.

## What the human can see
- New scene `campaign-city-cards`: an own city, and an own city with a garrison.

## Verification
- Snapshot at 2 zooms; overlay tracks the city under pan/zoom.
- **compare-screenshots** vs the chosen slice-16 variation.
- **screenshot-critique** last — reads as bronze, income legible, garrison strip
  below.

## Stay green
- Label collision scenes; **city click/selection hit-testing** (the overlay must
  not swallow map clicks).

## Feedback that would change this slice
- Card content/layout tweaks; whether the card shows always or only above a zoom.
