# Slice 01 — One faction table, seven color sites collapse

**Contract:** `BattleFaction { id, name, primary: [r,g,b], banner?: [r,g,b] }`
+ `BATTLE_FACTIONS` registry (azure, crimson, neutral) in a shared module
(`packages/game-renderer/src/battle/factionColors.ts` — both renderer
packages and web/src already import game-renderer). Index-by-team defaults
reproduce today's EXACT values per site so all baselines stay byte-stable —
note the sites currently disagree (crowd blue 0.06,0.32,1.0 vs impostor blue
0.20,0.42,0.88 etc.); preserve each site's current constant as the table's
per-surface variants OR unify to one blue/red pair and accept a one-time
re-bless (decide by diffing shots after unification — prefer UNIFY, it is the
point of the slice; re-bless the few moved surfaces).

Consumers to convert: crowdLayer.ts:327-331 (TSL uniforms), impostorLayer.ts:38-39,
overlayLayer.ts:183-186, minimapPass.ts:193-197 (uniform or per-dot color),
unitBanner.ts:22, unitCard.ts:14.

**Verify:** typecheck + web tests; run battle-renderer scenes + one vibe frame
compare — report exactly which shots moved (unification deltas) and re-bless
them deliberately. Golden untouched (no sim change).
