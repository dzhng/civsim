# 15 — Campaign panels → bronze (sub-sliced per panel)

**Contract unlocked:** every campaign panel wears a bronze housing with inset
wells; all "webapp tells" (semi-transparent slate, floating rounded panels, slate
pill buttons, checkbox accents, emoji) are gone.

## API seam (reuses slice-13 tokens + `HudPanel`/`Toolbar`/`Tooltip`)
Sub-slices, each its own shot + critique:
- **15a** `CityPanel.tsx` — the selected-city side panel (name/tier/faction,
  garrison, pop, loyalty, income/mo, policy sliders, recruit buttons) → `HudPanel`
  rows + `.hud-chassis`. (Distinct from the on-map city *card* in slice 17.)
- **15b** `ArmyPanel.tsx` — roster + Halt/Fortify/Ambush/Split/Merge → bronze
  wells + `.ucard` roster strip.
- **15c** `DiplomacyPanel.tsx` — relationship pills (war/peace/alliance) → bronze
  insets.
- **15d** `ClassBuilder.tsx`.
- **15e** `Sieges.tsx` + `CampaignBattleModal` (fight / auto-resolve).
- **Firewall:** presentation only — no campaign logic/data flow changes; no brass
  variant.

## What the human can see
- New scene `campaign-ui-bronze-panels`: a contact sheet of all five panels open.

## Verification
- Per-panel DOM snapshot.
- **compare-screenshots** each vs the battle housings (material identity).
- **screenshot-critique** last on the contact sheet.
- `web-design-guidelines` review.

## Stay green
- All campaign panel interaction scenes; battle HUD.

## Feedback that would change this slice
- Any panel David wants restructured beyond a reskin (defer to a follow-up).
