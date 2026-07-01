# Slice 4 — Campaign crowd replacement (the committed change)

The money slice: a campaign army stack renders as a small animated crowd through the
**same** `SkinnedCrowdPipeline` + VATs + liveries + shared shadow as battle, driven by the
real roster. Depends on Slice 1 (depth param), Slice 2 (relocated shadow), Slice 3
(sampler).

## Contract this unlocks

Campaign armies are the same soldiers as battle — animated, roster-driven, grounded by the
shared shadow — with the faction banner and selection footprint retained.

## API seam

`web/src/campaign/renderer.ts`:
- In `init()` (already async), load the kit/VATs/meshes with the same loaders battle uses
  and construct a campaign `SkinnedCrowdPipeline(shell, meshes, vats, kit, { worldDepthFn:
  'campaign' })` + `SoldierShadowDecalPass(shell, { worldDepthFn: 'campaign' })`. Prefer the
  optional `createSoldierCrowdPipeline(shell, { worldDepthFn })` factory (in
  `soldier-assets/placeholders.ts`) so battle and campaign share the construction sequence.
- Thread `unitsByClass` / `roster` / `unitCount` / `stackUnitCap` / `marching` through
  `buildEntityFrame` (`renderer.ts:564-604`).
- In `draw`, for each visible (non-fogged) army call `buildStackCrowd(...)` seated via
  `field.heightAt`, animation phase from `fixedTime ?? performance.now()/1000`; concatenate
  and `upload` to the campaign crowd + shadow.
- Add passes `campaign-soldier-crowd` (role `world-opaque`, phase `world-depth`, depth
  `read-write`) after `campaign-entities-opaque`, and route the figure shadows through the
  existing `campaign-entity-shadows` decal slot (or an adjacent `campaign-soldier-shadows`).
- **Split the banner:** add `buildCampaignStandardMesh()` to `campaignEntityModels.ts`
  (banner/pole/base only, no figures, no baked contact shadow). `CampaignEntityPass` keeps
  drawing the standard + city, so `campaign-entities-opaque` and `campaign-entity-shadows`
  ids survive (contract stays green). The army figure meshes are no longer fed to it.
- **Selection footprint** (`CampaignSelectionPass`) untouched.

**Faction resolution (from Slice 0):** default to mapping `allegiance` → friend/foe/neutral
in the existing `CrowdInstance.faction` slot; the banner carries the true faction RGB. Only
if the spike showed two-tone reads wrong, add an optional per-instance `liveryRgb` +
shader branch (defaulting to current two-tone so battle stays byte-identical) — this
changes the instance stride and forces a `per-class-vat` re-bless.

**Contract:** add `campaign-soldier-crowd` to `hasCampaignWorldDepthContract` in
`web/scenes/_renderer-contract.mjs`; keep `campaign-entities-opaque` (now city+banner) and
`campaign-entity-shadows`.

## What the human can run / see

`/renderer/campaign-models?gate=army` — animated representative figures + banner + shadow +
occluded selection footprint. Live campaign: stacks animate and reflect composition
(spear-heavy vs archer-heavy read differently).

## Verification gate

- `web/scenes/models/campaign-models.mjs` `army` gate — its criteria ("representative
  figures, faction livery, label icon, shadow, ground selection footprint occluded by the
  formation") is literally this feature; must pass. Keep the city gates green (`city`,
  `garrison-*`, `hostile-depth-order`).
- `web/scenes/campaign/campaign-visual.mjs`, `campaign-polish-markers.mjs`.
- Determinism: run the frozen snapshot twice → identical (proves `fixedTime` phase).
- **Visual slice — required:**
  [screenshot-critique](../../../.claude/skills/screenshot-critique/SKILL.md) +
  [compare-screenshots](../../../.claude/skills/compare-screenshots/SKILL.md) old baked
  marker (archive the pre-change baseline into `assets/`) vs new crowd, judged against the
  [aesthetics](../../../.claude/skills/aesthetics/SKILL.md) north star.

## Review checkpoint (non-blocking)

Open old-vs-new army shots for David with
[preview-shots](../../../.claude/skills/preview-shots/SKILL.md); ~5 min. If silent, accept
on the compare-screenshots verdict, record rationale, close Preview, proceed.

## What must stay green

Battle (separate pipeline instance, `worldDepthFn:'battle'`); campaign contract with the
additive pass; city gates; `campaign-map-alignment`; save/load/sim (render-only reads of
existing `ArmyView` fields — no wasm-layout change).

## Feedback that would change this slice

Formation shape/spacing, whether cavalry figures should appear when the stack has mounted
units, banner placement amid figures, and the faction-color call (bucket vs true RGB) are
all live here.
