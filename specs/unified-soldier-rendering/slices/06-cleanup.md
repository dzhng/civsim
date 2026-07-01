# Slice 6 — Cleanup / delete dead code

The north-star payoff: the tree ends with **less** soldier-rendering code than it started
with. Only runs after Slices 2–5 have moved every live consumer off the old paths.

## Contract this unlocks

Simplicity — one soldier renderer, one shadow module, no orphaned second representation.

## Exact deletion list

- **`web/src/battle/atlas.ts`** — orphaned 2D sprite path, grep-confirmed zero importers.
  Also scrub the stale "atlas" mention in `web/src/battle/scene.ts` (comment ~line 109).
- **`buildCampaignArmyMarkerMesh` + the `soldier(...)` helper** in
  `packages/game-renderer/src/models/campaign/campaignEntityModels.ts`, plus the army-figure
  `contactShadow` / `shadow` calls. Keep `buildCityMesh` and the new
  `buildCampaignStandardMesh` (banner). Remove the now-dead army mesh fields/buffers from
  `CampaignEntityPass` (`entityPass.ts` army branches) — city keeps all of its.
- **Original `packages/game-renderer/src/battle/soldierShadowPass.ts`** location (moved to
  `renderer-core` in Slice 2).
- **The Slice 0 spike route/flag** in `apps/renderer-lab/src/router.ts` and any scratch
  code.

**Ordering guard:** removing `buildCampaignArmyMarkerMesh` before Slice 4 split the banner
out would break the `CampaignEntityPass` constructor and fail the `campaign-models` `army`
gate (no banner, no footprint). This slice runs last for that reason.

## Verification gate

- Full typecheck + full scene suite (battle + campaign + system) green.
- `web/scenes/_renderer-contract.mjs` both contracts green.
- Grep clean for `buildCampaignArmyMarkerMesh`, `BattleSoldierShadowPass`, `battle/atlas`.
- Run the [review](../../../.claude/skills/review/SKILL.md) and
  [simplify](../../../.claude/skills/simplify/SKILL.md) skills over the diff.

## What must stay green

Everything. This slice removes only code with no remaining live consumers.

## Feedback that would change this slice

If any deletion turns out to still have a consumer (e.g. a lab route quietly used the baked
marker), stop and re-slice — move that consumer onto the shared path first.

---

## After this slice

The feature is shipped. Run [close-spec](../../../.claude/skills/close-spec/SKILL.md) to
archive this plan to `specs/done/` and rewrite it from a build ladder into a durable
rationale record (the why + invariants, pointing back at the real code).
