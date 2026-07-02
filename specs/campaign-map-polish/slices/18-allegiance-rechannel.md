# 18 — Allegiance re-channel: enemy sword + icon→faction (atomic)

**Contract unlocked:** allegiance is conveyed by the label *treatment*, not the
icon color. Enemy cities get a red sword icon; neutral cities are the default
faction-icon + engraved label; and city/army icons switch to **always
faction-colored** (feedback: "drop the yellow icon; stick to faction colors").

**Ordering is deliberate:** the icon→faction flip (item G) lands **atomically**
with the sword/card replacement so allegiance is never unreadable mid-build. This
slice runs after 17 (own-city card already carries the own-allegiance signal).

## API seam (single owner — label/marker system, invariant 4)
- **Enemy red sword:** add a red sword glyph to the right of enemy city text in the
  canvas label draw (`mapPass.ts:1853-1860` icon draw; `ICON_PATHS`).
- **Icon → faction color (item G):** `renderer.ts:878`
  `iconColor: allegianceColor(allegiance)` → `factionColor(data, owner)`; army icon
  `:926` likewise; the 2D marker path `:786-828`. **Remove `allegianceColor` from
  the icon path** so there is one faction-color source (don't leave it dangling).
- **Firewall:** icon color + enemy sword + neutral default only — own-city card is
  slice 17; panels are slice 15.

## What the human can see
- `campaign-city-cards` (or a mixed regional shot) showing all three states: own
  (card), neutral (icon+name), enemy (icon+name+red sword) — all icons faction-
  colored.

## Verification
- Assert rendered icon colors == `data.map.factions[].color` (never green/red/amber).
- **compare-screenshots** vs feedback (yellow/green icons gone; enemy sword present).
- **screenshot-critique** last — the three states are distinguishable without icon
  color carrying allegiance.

## Stay green
- Faction-view scenes; label collision scenes.

## Feedback that would change this slice
- Sword placement/size; whether allies (vs neutral) need their own mark.
