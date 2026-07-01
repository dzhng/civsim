# Unified soldier rendering (battle + campaign) with shadows everywhere

*Shipped. This record is the why and the invariants; the code is the how.*

## What shipped

Battle and campaign draw soldiers through **one** renderer. A campaign army stack
is a small **animated skinned crowd** — the same meshes, VAT animation clips, class
liveries, and grounding-shadow decal the battle uses — sampled from the stack's real
roster, seated on the terrain, and collapsed to its standard banner when the camera
pulls back. Every soldier, battle and campaign, casts a grounding shadow. The change
removed more soldier-rendering code than it added (net −157 source lines): the baked
box-figure army marker and the dead 2D sprite atlas are gone.

Before, the two scenes rendered "soldiers" with unrelated tech: battle used the live
VAT-skinned `SkinnedCrowdPipeline`; campaign used a single static baked mesh of 11
fixed box-figures that ignored the roster, and battle had **no** soldier shadow at all
(the shadow pass existed but was dead/unwired — which is why only a renderer-lab route
ever showed shadowed soldiers).

## Why it works this way

- **Share the class and assets, not the GPU object.** Battle and campaign each build
  their own `SkinnedCrowdPipeline` + `SoldierShadowDecalPass` instance against their own
  frame shell (different MSAA sample counts, different depth model). "One renderer" means
  one class, one WGSL, one mesh/VAT/livery set — not a shared pipeline object, which the
  two shells can't share.

- **Depth is the only per-scene difference in the crowd shader.** Campaign geometry sorts
  with `civsimCampaignWorldDepth3d`, battle with `civsimBattleWorldDepth3d` (they weight
  ground vs height differently). The pipeline takes a `worldDepth: 'battle' | 'campaign'`
  option and swaps *only* the depth function in the shader by string replacement, so
  battle's shader text — and therefore its pixels — stay byte-identical. Projection,
  lighting, and material are already shared and unchanged.

- **The campaign figure is a representation, not the army.** A stack holds up to
  `ARMY_STACK_UNIT_CAP` (20) units of hundreds of soldiers; we draw at most **6** figures.
  The count scales to the cap (`clamp(round(6·unitCount/cap), 1, 6)`) and *which* classes
  appear is a largest-remainder sample of the roster, so a spear-heavy army reads as
  spears. This keeps the strategic view readable and the draw cost bounded, and it is why
  the figures are a pure, deterministic function of the stack — not the sim's soldier array.

- **Figures are tinted by allegiance; the banner carries faction identity.** The crowd
  shader accent is friend=blue / foe=red / **neutral=amber** (faction slot 0/1/2). Battle
  only ever sends 0/1, so adding the neutral branch left battle byte-identical. The true
  faction livery lives on the standard banner's flag, so two enemies of different realms
  are told apart by their banners, not their figure tint.

- **Zoom LOD keeps the map readable.** Figures fade in by camera zoom and drop to zero —
  the banner alone — when zoomed out over the whole map. Without this, dozens of stacks ×
  6 animated figures would clutter the strategic view and cost draw calls for sub-pixel men.

## Invariants (what must stay true)

- **Battle output is byte-identical to before this feature.** Any change to the shared
  `SkinnedCrowdPipeline` / `SoldierShadowDecalPass` shaders must default to the battle
  path and must not perturb battle pixels. Pinned by `per-class-vat`, `battle-terrain-elevation`,
  and `battle-smoke` (battle-banner) rendering 0px. The neutral accent and the depth swap
  both hold this line only because battle never sends faction 2 or the campaign depth fn.

- **Frozen snapshots are deterministic.** Campaign VAT phase derives from
  `fixedTime ?? performance.now()/1000` and per-figure offsets are seeded by army id; a
  frozen frame (fixedTime pinned) must render identically twice. The same clock drives the
  water sea shimmer — don't split them.

- **The campaign pass-graph contract holds.** `campaign-soldier-crowd` (world-opaque,
  read-write) and `campaign-soldier-shadows` (world-decal, read) sit in the world-depth
  phase; `campaign-entities-opaque` / `campaign-entity-shadows` remain (city + banner keep
  them). Decals stay depth-read after the opaque crowd — no later world pass writes depth.
  Enforced by `web/scenes/_renderer-contract.mjs`.

- **The renderer-lab 'army' review surface matches production by construction.** It imports
  `CAMPAIGN_FIGURE_SIZE` rather than re-hardcoding size/spacing/shadow-radius, so the review
  can't silently drift from what ships.

- **The city is not a soldier.** `buildCityMesh` and the campaign scenery passes are
  untouched by this feature.

## Where it lives

- Shared renderer: `packages/renderer-core/src/skinnedPipeline.ts` (`SkinnedCrowdPipeline`,
  `SoldierCrowdDepthScene`) and `packages/renderer-core/src/soldierShadowPass.ts`
  (`SoldierShadowDecalPass`) — the shadow pass was relocated here from `game-renderer/battle`.
- Figure sampler (pure, deterministic): `packages/crowd-runtime/src/stackCrowd.ts`
  (`buildStackCrowd`, `stackFigureCount`, `sampleFigureClasses`).
- Campaign wiring + zoom LOD + `allegianceCrowdFaction` + `CAMPAIGN_FIGURE_SIZE`:
  `web/src/campaign/renderer.ts` (`buildEntityFrame`). `stackUnitCap` is threaded from
  `web/src/campaign/scene.ts`.
- The banner-only army mesh: `buildCampaignStandardMesh` in
  `packages/game-renderer/src/models/campaign/campaignEntityModels.ts` (replaced
  `buildCampaignArmyMarkerMesh` + its baked figures).
- Battle wiring: `web/src/battle/renderer.ts` (pass `battle-soldier-shadows`).
- Gates: `web/scenes/models/campaign-models.mjs` (`army`/`garrison-*` — the acceptance
  target; the lab route renders the real crowd), `web/scenes/campaign/campaign-lod.mjs`
  (zoom bands), `web/scenes/campaign/campaign-visual.mjs` (contract), and the battle scenes
  above. Verification is **headless installed-Chrome + hardware Metal** (`VERIFY_GPU=1
  VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome`); bundled-Chromium SwiftShader
  cannot get a WebGPU adapter.

## Dead ends / decisions that diverged

- **Full battle-scale crowd in campaign** — rejected: unbounded draw cost, unreadable
  strategic map. The ≤6 representative figures are the design.
- **Per-soldier RGB faction livery** (widening the instance stride) — deferred: the banner
  already carries faction colour; the friend/foe/neutral bucket in the existing slot is
  enough, and a neutral accent was a one-line shader add.
- **Depth as a camera uniform** (one source of truth across all passes) instead of a
  compile-time WGSL swap — considered and recorded as the genuine alternative; the swap was
  chosen for surgical, battle-preserving scope (matches the existing
  `CampaignSceneryPass('battle')` per-scene specialization). Revisit if a third scene needs
  per-scene depth.
- **Throwaway spike** (`routeCampaignCrowdSpike`) proved the shared crowd seats +
  depth-sorts on the real campaign map at ~0.85 ms / 6 figures before the committed build;
  deleted in cleanup.
- **Known limitation:** in a *dense* battle block only the front rank's contact shadow is
  visible — interior figures occlude their own small decals. Inherent to the per-soldier
  decal (and pre-existing in the lab block); campaign's loose ≤6 figures don't hit it.
  Revisit only if dense battle blocks need fully-grounded interiors (a per-unit merged blob).

## Note on the build

Built on a base predating the large **water + headless-baseline** merge, then rebased onto
it. The only source conflict was the `sceneryTime` clock in `web/src/campaign/renderer.ts`
(kept both the water `setTime` and the crowd's animation clock — they're the same value).
The campaign crowd and the water strategic sea compose cleanly in the same frame.
