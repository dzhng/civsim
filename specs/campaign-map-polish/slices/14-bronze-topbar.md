# 14 — Top bar → bronze

**Contract unlocked:** the campaign top bar (feedback #1: gold, day, 1×/3×/10×,
Factions/Fog/Diplomacy/Classes/Save/Menu) reads as opaque bronze with inset wells,
matching the battle toolbar.

## API seam (reuses slice-13 tokens; battle Toolbar pattern)
- `web/src/ui/campaign/CampaignTopBar.tsx` → the battle `Toolbar.tsx` pattern:
  30×30 inset bronze wells, gold `.on` state for active toggles, Phosphor **filled**
  icons via the icon helper, **no emoji** (aesthetics campaign rule). Speed buttons
  and toggles become bronze wells.
- **Firewall:** presentation only — no change to what the buttons do.

## What the human can see
- New scene `campaign-ui-bronze-topbar`: the top bar with speed + toggle states.

## Verification
- **compare-screenshots** vs the battle toolbar and vs feedback #1 (before).
- **screenshot-critique** last — inset wells, no slate pills, no emoji.

## Stay green
- Top-bar interaction scenes; battle HUD (shared tokens).

## Feedback that would change this slice
- Icon choices / button grouping David wants changed.
