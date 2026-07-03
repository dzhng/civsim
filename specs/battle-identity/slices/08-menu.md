# Slice 08 — One door into battle + faction picker

**Contract:** menu shows ONE battle entry: Custom Battle (remove #menu-1v1 +
duel modal + data-battle="5v5" from Menu.tsx:105-188; drop onDuel/
onQuickBattle wiring in menu/scene.ts + main.ts:441-449). URL deep links stay
(harnesses). ArmyBuilder gains a faction picker per team (ArmyPanel header,
ArmyBuilder.tsx:116): choices from BATTLE_FACTIONS (azure/crimson to start),
threaded as factions?: [id,id] through QuickBattleConfig ->
createQuickBattleGame -> battle scene -> the slice-01 table lookup (colors
only for now). Defaults when absent: azure vs crimson = today's look.

**Verify:** menu scene shot (one battle button); ArmyBuilder shot with the
picker; boot a custom battle with swapped factions and screenshot (colors
follow the picker); all harness scenes unchanged (no faction param -> same
pixels); web tests + typecheck.
