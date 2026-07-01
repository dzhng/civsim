# Unified soldier rendering (battle + campaign) with shadows everywhere

## Goal

One shared skinned-soldier renderer used by **both** battle and campaign. Campaign
armies stop being a static baked box-figure marker and become a small **animated
crowd** drawn through the exact same `SkinnedCrowdPipeline`, VAT animations, class
liveries, and ground shadow the battle uses. Every soldier — battle and campaign —
casts a grounding shadow. The end state has **less** soldier-rendering code than
today, not more: we delete the divergent campaign box-figure path and the dead 2D
sprite atlas instead of maintaining a second soldier representation.

North star: maximize shared logic, minimize total code. Visual target is the
[aesthetics](../../.claude/skills/aesthetics/SKILL.md) skill (Bronze-Age Aegean /
Total War Saga).

## Why this exists

Today the two scenes render "soldiers" with entirely different tech:

- **Battle** — live VAT-skinned, per-class animated 3D crowd via
  `SkinnedCrowdPipeline` (`packages/renderer-core/src/skinnedPipeline.ts`), pass
  `battle-skinned-crowd`. **No soldier shadow** in production (the
  `BattleSoldierShadowPass` is written but dead/unwired).
- **Campaign** — a single static baked mesh `buildCampaignArmyMarkerMesh()`
  (`packages/game-renderer/src/models/campaign/campaignEntityModels.ts`): a banner
  plus **11 fixed box-figures that ignore the real roster**, with baked contact
  shadows. Drawn by `CampaignEntityPass`.

The `terrain-elevation` shots looked shadowed only because they route through a
renderer-lab path that wires the dead `BattleSoldierShadowPass`; production never
does. That inconsistency is the seed of this feature.

## Locked decisions (from the interview)

- Campaign army stack → a small **animated** crowd of representative figures through
  the **same** shared skinned renderer as battle.
- **Figure count: ≤6 per stack, scaled to the 20-unit stack cap.**
  `figures = clamp(round(6 × unitCount / ARMY_STACK_UNIT_CAP), 1, 6)`
  (`ARMY_STACK_UNIT_CAP = 20`, `crates/campaign/src/tunables.rs:33`, surfaced as
  `stackUnitCap`). **Which** figures = sampled from the roster's class proportions
  (`ArmyView.unitsByClass`, fallback `roster` — both exist today and are unused).
- **LOD by zoom:** near shows the animated figures; zoomed out collapses to a simple
  banner/base marker (figures fade/collapse). Strategic map stays readable, draw cost
  bounded.
- **Shadows unified:** one shared soldier-shadow decal module used by both scenes.
  Battle gains soldier shadows; campaign drops baked contact-shadow geometry.
- Keep the campaign faction **banner/standard** (split into its own mesh — it is the
  LOD-far marker and carries the true faction color) and the ground **selection
  footprint**.
- Delete dead code: `web/src/battle/atlas.ts` (orphaned 2D sprite path).

## Key seams (measured, load-bearing)

1. **Depth function is hardcoded to battle in the shared WGSL.**
   `skinnedPipeline.ts:118` and the dead `soldierShadowPass.ts:26` both call
   `civsimBattleWorldDepth3d`. Campaign geometry sorts with `civsimCampaignWorldDepth3d`
   (`cameraWgsl.ts`), which weights ground/height differently (campaign
   `0.0060/0.0012` vs battle `0.0012/0.0030`). Reusing the pipeline in campaign
   unchanged mis-sorts figures against city/scenery/relief. **Parameterizing this is
   the enabling refactor (Slice 1).** *Projection* is already shared and correct — only
   the **depth channel** is scene-specific.
2. **The skinned shader is two-tone (blue vs red).** `skinnedPipeline.ts:131-133`
   picks accent from `faction > 0.5`; campaign has N factions with arbitrary RGB.
   Resolution: map **allegiance → friend/foe/neutral** in the existing `faction` slot
   and let the **banner carry true faction color**. Only widen the 12-float instance
   stride if the spike proves two-tone reads wrong on a multi-faction map.
3. **Deterministic animation clock.** Campaign has a per-frame clock
   (`fixedTime ?? performance.now()/1000`). VAT phase for stacks must derive from
   `fixedTime` or the `campaign-models` / `campaign-visual` frozen snapshots flap.
4. **Two pipeline objects, not one.** "Shared" = shared class + WGSL + meshes + VATs +
   liveries; each scene constructs its own instance against its own `RawFrameShell`
   (different `sampleCount`). You cannot share the GPU pipeline object across shells.

## Slice graph

| # | Slice | Changes one variable | Kind |
|---|-------|----------------------|------|
| 0 | [Spike: campaign mini-crowd](slices/00-spike-campaign-crowd.md) | proves the shared crowd on the real map; resolves depth/faction/perf/seating/zoom unknowns | throwaway |
| 1 | [Parameterize scene depth](slices/01-parameterize-depth.md) | `SkinnedCrowdPipeline` + shadow pass accept a `worldDepthFn`; battle byte-identical | enabling refactor |
| 2 | [Shared shadow → wire into battle](slices/02-shared-shadow-battle.md) | relocate/rename the dead shadow pass; battle gains soldier shadows | visual |
| 3 | [Representative-figure sampler](slices/03-figure-sampler.md) | pure `stackCrowd.ts`: roster → `CrowdInstance[]`, ≤6 scaled to cap | logic |
| 4 | [Campaign crowd replacement](slices/04-campaign-crowd.md) | campaign army = shared animated crowd + shared shadow + split banner | visual |
| 5 | [Zoom LOD collapse](slices/05-zoom-lod.md) | near figures ↔ far banner; bounded draw cost | visual + perf |
| 6 | [Cleanup / delete dead code](slices/06-cleanup.md) | delete atlas.ts, baked marker figures, old shadow location, spike route | cleanup |

Dependency: 0 informs 1. 1 unblocks 2 and 4. 2 (shadow relocated) is a dependency of
4's campaign shadow. 3 is independent (pure) and merges into 4. 5 depends on 4. 6 last.

## Module boundaries (where shared code lives, what moves)

- **Shared soldier renderer:** stays `packages/renderer-core/src/skinnedPipeline.ts`;
  gains a `worldDepthFn` option. Both scenes instantiate one each.
- **Shared shadow decal:** move `packages/game-renderer/src/battle/soldierShadowPass.ts`
  → `packages/renderer-core/src/soldierShadowPass.ts`, rename `BattleSoldierShadowPass`
  → `SoldierShadowDecalPass`, add `worldDepthFn`. *(Alt considered: `models/shared`.)*
- **Figure sampler:** new pure `packages/crowd-runtime/src/stackCrowd.ts`
  (`unitsByClass:number[] → CrowdInstance[]`), beside `instanceData.ts`/`lod.ts`.
  *(Alt considered: `game-renderer/src/campaign/armyCrowd.ts`.)*
- **Optional factory** (simplification): `createSoldierCrowdPipeline(shell, {worldDepthFn})`
  in `packages/soldier-assets/src/placeholders.ts`, wrapping the
  `loadPlaceholderKit`/`loadClassVats`/`createPlaceholderSoldierMeshes` + `new
  SkinnedCrowdPipeline` sequence both scenes would otherwise duplicate.
- **Banner:** split `buildCampaignArmyMarkerMesh` → `buildCampaignStandardMesh()` in
  `campaignEntityModels.ts` (banner/pole/base only). City mesh untouched.
- **Delete:** `web/src/battle/atlas.ts`.

## Firewalls / non-goals

- Rendering only. **Do not** touch sim/battle physics, campaign strategic logic
  (`crates/campaign`, the wasm worker), save/load, or the `ArmyView` wasm layout —
  `unitsByClass`/`roster` already flow through `web/src/campaign/views.ts`.
- The **city** is not a soldier: its mesh stays; only its shadow *may* migrate to the
  shared decal, and only if trivial.
- Scenery rendering untouched beyond splitting the army mesh.

## Verification surface

- No cargo/vitest for rendering. Gates are browser scenes under `web/scenes/**` plus
  the pass-graph contract `web/scenes/_renderer-contract.mjs` (subset checks on pass
  id/role/phase/depth). Adding passes is allowed; existing asserted ids must persist.
- Acceptance target for the campaign crowd is the existing `army` gate in
  `web/scenes/models/campaign-models.mjs` — it already demands "representative figures,
  faction livery, label icon, shadow, and a ground selection footprint occluded by the
  formation". Lab route: `/renderer/campaign-models?gate=army`.
- **Standing visual gate:** every slice that produces a shot must run
  [screenshot-critique](../../.claude/skills/screenshot-critique/SKILL.md) (unprimed
  second opinion) as the last check before acceptance. Any slice with a before/after or
  a reference must also run
  [compare-screenshots](../../.claude/skills/compare-screenshots/SKILL.md) for the
  candidate-vs-target telemetry and less-wrong verdict.

---

## Next Agent Prompt

**Status:** Plan complete, not yet implemented. Last updated 2026-07-01.

**Start here:** Slice 0 — [the spike](slices/00-spike-campaign-crowd.md). It is a
throwaway that de-risks the whole feature: prove a `SkinnedCrowdPipeline` mini-crowd
renders on the *real* campaign map (correct seating on `field.heightAt`, correct depth
sort against city/scenery, acceptable perf across all visible armies) and answer the
open unknowns below. Read the four Key Seams above before you touch anything.

**Open unknowns the spike must resolve (they set Slice 1 & 4 decisions):**
- Does battle depth visibly mis-sort campaign soldiers vs mountains/city? (expected yes
  → confirms Slice 1 is needed, and which design.)
- Is friend/foe/neutral two-tone acceptable, or is per-instance faction RGB required
  (instance-stride change + `per-class-vat` re-bless)?
- Figure count vs draw cost across a full fogged map; where to cache per-stack layout.
- The `cam.scale` band where figures should collapse to the banner (campaign zoom units
  differ wildly from battle's `zoom < 1.2` — measure, don't copy).
- Do `unitsByClass` class indices map 1:1 to placeholder-mesh looks, or must the sampler
  clamp via `modelLookForClass` like battle's `buildCrowdInstances` does?

**Global TODO**
- [ ] Slice 0 — spike campaign mini-crowd (throwaway) → resolves unknowns above
- [ ] Slice 1 — parameterize scene depth in pipeline + shadow pass
- [ ] Slice 2 — relocate shared shadow, wire into battle
- [ ] Slice 3 — pure representative-figure sampler
- [ ] Slice 4 — campaign crowd replacement (+ split banner, + faction bucket)
- [ ] Slice 5 — zoom LOD collapse
- [ ] Slice 6 — cleanup / delete dead code

**Before you end your pass:** update this section — move the checklist forward, record
what the spike decided, and rewrite "Start here" to the next pickup point.
