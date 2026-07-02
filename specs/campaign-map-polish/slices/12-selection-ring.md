# 12 — Selection ring: visible + drape over terrain

**Contract unlocked:** the selection ring under a selected city/army is clearly
visible and not half-clipped by raised terrain (feedback #14: "barely visible,
half the ring cut off"). Depends on foundation (02–04) — the bright terrain that
washed it out is already fixed, so this slice is mostly the depth/height clip plus
a thickness/brightness bump.

## API seam
- `packages/game-renderer/src/campaign/selectionPass.ts:38-60`: ring geometry,
  per-kind inner-cut/alpha (city=0, army=1, garrisoned-army=2). Brighten/thicken.
- Instances: `renderer.ts:697-706` (city), `763-778` (army).
- **Half-cut cause:** the ring is drawn flat and clipped by raised terrain height
  via depth. Either drape the ring on the terrain height field or draw it over
  depth so it isn't occluded.
- **Firewall:** selection ring only — do NOT re-tune the palette to "fix" contrast
  (that is 02's job) and do not touch the model shadow (10).

## What the human can see
- `campaign-lod` `selected-city` + a selected army over raised/hilly terrain.

## Verification
- **Slice variable / crop:** ring visibility + completeness on raised terrain. Out
  of scope: terrain palette (frozen), model shadow (10).
- **compare-screenshots** vs feedback #14 (ring fully visible, uncut).
- **screenshot-critique** last.

## Stay green
- `campaign-lod` `selected-city`, `selected-army-city`.

## Feedback that would change this slice
- Aesthetics note: campaign selection is a **status-color** ring (not the battle
  gold glow) — keep it a ring, just legible. If David wants the battle-style glow
  instead, that's a different treatment — ask.
