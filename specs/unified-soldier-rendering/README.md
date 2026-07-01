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

**Status:** Slices 0–4 landed (spike, depth param, shared shadow → battle, figure sampler,
campaign crowd). Next: Slice 5 (zoom LOD). Last updated 2026-07-01.

**Rebase: DONE.** This branch is rebased onto the latest `main` (`37854aa3`, the water +
headless merge). The only source conflict was `web/src/campaign/renderer.ts` `sceneryTime`
(water's `this.shell.setTime(sceneryTime)` for sea shimmer vs this branch's `animTime` — kept
both; they're the same clock). Binary-baseline conflicts (battle PNGs) took this branch's
soldier-shadow versions. Post-rebase verification headless: campaign-models army/garrison/labels
all 0px; campaign-visual contract green (`campaign-soldier-crowd` + `campaign-soldier-shadows`
coexist with the water passes); battle-banner + terrain-elevation 0px; battle-manual re-blessed
for upstream field-manual text. Rebasing onto main's headless baselines also resolved the earlier
UI/text mode-drift (now 0px).

*(Sandbox git note: the pull was hard to land — the repo had degraded to a partial clone from
earlier `blob:none` workarounds; the fix was `rm .git/objects/pack/*.promisor` + clear the
partial-clone config + `git gc` + `git clean -fd` the failed-pull leftovers + let the pull run
to completion. Keep the object store healthy.)*

**Capture mode is now HEADLESS** (blessed local mode, matches origin/main): run from `web/`
with the dev server up —
`VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs <scene>`
(NO `VERIFY_HEADFUL`). Bundled Chromium's SwiftShader can't get a WebGPU adapter here; real
installed Chrome headless + Metal works and is deterministic. Only feature-affected shots were
re-blessed on this branch; the repo-wide headful→headless migration of UI/text baselines lives
on origin/main (do not re-bless those here — they resolve at rebase).

**Test-infra note:** vitest / tsx / esbuild-CLI are NOT installed in this sandbox and can't
be installed (network-blocked); node type-stripping can't resolve the repo's extensionless
imports. So pure-TS logic is verified by (a) an inlined standalone node algorithm check and
(b) `tsc --strict` on the file, with full behavioral proof deferred to the Slice 4 visual.
When vitest is available, promote the sampler check to a real test.

**Environment notes (important):**
- Build on `feat/unified-soldier-rendering`, cut from `208fdbe7`. Pulling latest
  `main` (5 orthogonal tooling/baseline commits) is blocked in this sandbox: batched
  pack transfer works but the working-tree checkout lazy-fetches ~40 blobs one-at-a-time
  and stalls. Rebase onto `origin/main` (`d45b6ca0`) when the network cooperates — it is
  a trivial ff, zero feature-file overlap.
- **GPU verification loop:** headless SwiftShader WebGPU does NOT work here
  (`requestAdapter` returns null). Use real Metal via headful Chrome:
  `VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_HEADFUL=1 VERIFY_BROWSER_CHANNEL=chrome node scene.mjs <scene>`
  (run from `web/`, with `npm run dev` up on :5173). Snapshots are byte-stable this way.

**Reordering decision:** Slice 1 (depth param) landed before the Slice 0 spike, because
the spike needs the depth param to be meaningful (otherwise it is a throwaway WGSL hack).
The spike's remaining value is the campaign-crowd eyeball + perf number; it will be built
as a renderer-lab route on top of the real depth param next, doubling as the Slice 4
de-risk. Read the four Key Seams above before continuing.

**Start here:** Slice 5 — [zoom LOD](slices/05-zoom-lod.md). Gate `buildStackCrowd` emission on `cam.scale` in
`web/src/campaign/renderer.ts` (mirror battle's `zoom < 1.2` impostor switch): near zoom draws
the crowd; far zoom draws zero figures and falls back to the banner/`campaignMapMarkers`. Add a
smoothstep fade so figures don't pop. Perf-bound via `full-game-rendering-performance`; verify
`campaign-lod` at its three cameras. Also raise the standard banner a touch so it clears the
figures at close zoom (minor polish deferred from Slice 4).

**Superseded Slice 4 start (done):** Slice 4 — [campaign crowd replacement](slices/04-campaign-crowd.md). In
`web/src/campaign/renderer.ts`: in `init()` load kit/vat/meshes (same loaders as battle)
and build `SkinnedCrowdPipeline(shell, meshes, vat, kit, { worldDepth: 'campaign' })` +
`SoldierShadowDecalPass(shell, { worldDepth: 'campaign' })`. Thread `unitsByClass` /
`unitCount` / `stackUnitCap` / `marching` from `ArmyView` through `buildEntityFrame`; per
army call `buildStackCrowd(...)` (from `crowd-runtime/src/stackCrowd.ts`) seated via
`field.heightAt`, phase from `fixedTime ?? performance.now()/1000`; concat + upload. Add
pass `campaign-soldier-crowd` (world-opaque, read-write) after `campaign-entities-opaque`,
and draw figure shadows in/next to `campaign-entity-shadows`. Split the banner into
`buildCampaignStandardMesh()` and stop feeding army figures to `CampaignEntityPass` (city
stays; keeps `campaign-entities-opaque`/`campaign-entity-shadows` alive → contract green).
Faction = allegiance bucket (friend/foe/neutral) → `CrowdInstance.faction` 0/1/2; banner
carries true color. Figure `size ≈ 2.4` at zoom 28 (spike). Gate on
`web/scenes/models/campaign-models.mjs` `army` + `campaign-visual`; screenshot-critique +
compare vs the old marker; re-bless. GPU loop:
`VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_HEADFUL=1 VERIFY_BROWSER_CHANNEL=chrome node scene.mjs <scene>`
(and `web/_spike-capture.mjs <url> <out.png>` for a quick eyeball).

**Figure sampler (Slice 3, done):** `packages/crowd-runtime/src/stackCrowd.ts` —
`buildStackCrowd(unitsByClass, opts) -> CrowdInstance[]`, plus `stackFigureCount` and
`sampleFigureClasses`. Count `clamp(round(6*unitCount/cap),1,6)`; class mix largest-remainder;
deterministic by seed; elevation via sampler; mounted via `mountedClasses`; faction/clip/phase
passthrough. Class ids pass straight through (no `modelLookForClass` — avoids a
crowd-runtime→game-renderer cycle; the pipeline's resourceLookup handles them like battle).

**Shared shadow module (Slice 2, done):** `packages/renderer-core/src/soldierShadowPass.ts`
(`SoldierShadowDecalPass`, `{ worldDepth }` opt). Wired into battle as `battle-soldier-shadows`;
battle now casts grounding shadows at skinned zoom (re-blessed battle-banner + battle-manual;
battle-initial is impostor-only, unchanged). Old `game-renderer/.../battle/soldierShadowPass.ts`
deleted; router.ts repointed. Reuse this exact pass in campaign in Slice 4.

**Spike outcome (Slice 0, done):** GO. Shared crowd renders on campaign depth, seats on
relief, sorts against campaign geometry, 0.85ms/6 figures. Scale decision: campaign figure
`size ≈ 2.4` at zoom 28. Faction: friend/foe/neutral bucket + banner color confirmed. See
[slice 00 findings](slices/00-spike-campaign-crowd.md).

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
- [x] Slice 0 — spike campaign mini-crowd (throwaway, `routeCampaignCrowdSpike`) → GO;
      findings recorded in slice 00. Route deleted in Slice 6.
- [x] Slice 1 — parameterize scene depth in pipeline (`SoldierCrowdDepthScene`,
      `SkinnedCrowdPipeline` `{ worldDepth }` opt; battle byte-identical, verified via
      per-class-vat + battle-terrain-elevation 0px). Shadow-pass half moves to Slice 2.
- [x] Slice 2 — relocate shared shadow → `renderer-core/soldierShadowPass.ts`
      (`SoldierShadowDecalPass`); wired into battle (`battle-soldier-shadows`), contract
      updated, baselines re-blessed, lab routes 0px. Battle now casts soldier shadows.
- [x] Slice 3 — pure sampler `crowd-runtime/src/stackCrowd.ts` (`buildStackCrowd`,
      `stackFigureCount`, `sampleFigureClasses`); arithmetic verified, tsc strict clean.
- [x] Slice 4 — campaign crowd replacement: army stacks draw the shared skinned crowd
      (`buildStackCrowd` → `SkinnedCrowdPipeline{worldDepth:'campaign'}` + `SoldierShadowDecalPass`),
      baked marker → `buildCampaignStandardMesh` (banner only), passes `campaign-soldier-crowd`
      + `campaign-soldier-shadows`, contract updated, `scene.ts` passes `stackUnitCap`, faction
      = allegiance bucket, figure size 2.4 with shadow-radius + spacing scaled to size. Lab
      `campaign-models` army/garrison gate renders the crowd too. Verified headless; army gate
      + campaign-visual contract green. Screenshot-critique caught (and fixed) invisible-shadow
      (radius) + merged-blob (spacing) bugs; banner sits a touch low behind figures (minor,
      matters less once Slice 5 collapses figures to the banner far out).
- [ ] Slice 5 — zoom LOD collapse
- [ ] Slice 6 — cleanup / delete dead code

**Before you end your pass:** update this section — move the checklist forward, record
what the spike decided, and rewrite "Start here" to the next pickup point.
