# WebGPU Conversion Completion

## Goal

Take the WebGPU renderer from "architecture shipped" to "release-cutover ready"
for the non-campaign surface. The
[foundation](../done/webgpu-skinned-crowd-foundation/README.md) closed the
architecture: frame graph, depth contract, GPU vertex skinning, instancing, and
both battle and campaign renderers run on WebGPU end to end. What remains is the
work that turns a sound skeleton into a shippable renderer:

1. **Core robustness** — the device/error layer is happy-path only. A single GPU
   reset or shader error silently kills the game.
2. **Soldier art pipeline** — every soldier is a procedural box placeholder
   driven by one global placeholder VAT. The path to import real rigged art does
   not exist yet.
3. **Battle fidelity** — soldiers cast no shadow and ignore terrain elevation;
   effects are flat line projectiles.
4. **Release gates** — the cutover/release audit harness is built and correct,
   but every gate is blocked because its input report has never been generated.

This spec was scoped from a multi-agent gap review of the closed foundation
(2026-06-29): 46 verified gaps. Campaign gaps were routed to
[campaign-polish](../campaign-polish/README.md), not here.

## Non-Goals

- **Minimap stays 2D.** The WebGPU `BattleMinimapPass` is intentionally left
  unwired. We keep the 2D canvas renderer up to date as the debug + minimap
  surface. Do not wire `minimapPass.ts` into production.
- **No WebGL fallback renderer.** WebGPU-only is a deliberate choice.
  Unsupported browsers keep the existing clear menu error
  (`web/src/main.ts`, `web/src/menu/scene.ts`), not a fallback renderer.
- **Campaign visuals live in [campaign-polish](../campaign-polish/README.md).**
  Brown terrain, mountain clearance, trees, road-life carts, label/road
  readability are owned by that spec's slices 02–05. This spec does not touch
  the campaign renderer.
- **Real artist assets are not a precondition.** We build the importer + bake
  toolchain and a replacement contract; procedural placeholders remain the
  shipping default until real `.glb` art is dropped in.

## Sacred Contracts (do not break)

- **One world/camera/depth contract** shared by battle and campaign
  (`packages/webgpu-core/src/depthContract.ts`, `cameraUniform.ts`,
  `cameraWgsl.ts`). New passes declare semantic roles; they do not hand-sort
  type buckets.
- **VAT layout** (`packages/webgpu-core/src/vatLayout.ts`,
  `packages/soldier-assets/src/schema.ts`) is the skinning interchange format.
  Real assets must bake *into* this format, not replace it.
- **Frame graph / pipeline contracts** (`frameGraphContract.ts`,
  `pipelineContracts.ts`, `renderGraph.ts`) own pass ordering and role
  declarations.
- **The sim is untouched.** This is renderer-only work. `crates/**` and battle
  balance stay green; no soldier-look change may alter `pick_unit` hit testing
  or sim-driven positions.

## Slice Graph

Three groups, built roughly in order. Group A is small, high-value, and
protects every route, so it lands first. Group B is the headline fidelity work
and the largest. Group C is battle polish. Group D closes the cutover.

```
A. Core robustness        01 ─ device & error resilience
                          02 ─ capabilities & render quality
                               │
B. Soldier art pipeline   03 ─ glTF importer & bake toolchain
                          04 ─ per-class VATs & clip tables      (needs 03)
                          05 ─ materials, textures & faction mask (needs 04)
                          06 ─ mounted units & equipment          (needs 04)
                          07 ─ LOD mesh tiers                     (needs 04)
                               │
C. Battle fidelity        08 ─ shadows & terrain elevation
                          09 ─ effects & corpses                  (polish)
                               │
D. Release gates          10 ─ scenario & visual acceptance reports
                          11 ─ hardware perf & cutover audit      (needs 10, A, B, C)
```

Groups A, B, C are independent of each other and can interleave. Group D's
final cutover (slice 11) is the integration point that depends on the rest.

## Review Map

| Slice | What a human runs / sees |
| --- | --- |
| 01 | Fault-injection lab route: force device loss / bad shader, see recovery or a clear error, not a blank canvas. |
| 02 | Capability probe page: limits/features report, MSAA on/off compare, GPU timestamp readout. |
| 03 | Asset workbench app: drop a `.glb`, see it bake to VAT and render beside the placeholder; validation failures shown inline. |
| 04 | Soldier gates per class driven by per-class VATs instead of one global VAT. |
| 05 | Model-sheet crops showing real materials + faction accents (crest/shield/sash masks). |
| 06 | Mounted-unit gate: horse + rider as composed skeletons; cavalry no longer fused boxes. |
| 07 | Zoom sweep showing L0/L1/L2 mesh swaps; perf probe at crowd scale. |
| 08 | Battle scene with grounded shadows and soldiers climbing terrain relief. |
| 09 | Battle vibe with dust/impact, 3D projectiles, distinct corpses. |
| 10 | Generated `scenario-runs` + blessed `visual-report` manifest; cutover scoreboard goes from PENDING to scored. |
| 11 | Named-hardware perf report + green `cutover:webgpu` / `release:webgpu` audit. |

## Firewalls

- Do not touch `crates/**` (sim) or campaign renderer code.
- Do not wire the WebGPU minimap pass.
- Real art is optional input — slices must pass with placeholders so the build
  never blocks on an artist.
- Screenshot scores are diagnostic only; acceptance is scene evidence + crops +
  unbiased `screenshot-critique` + human review (foundation invariant).

## Known Unknowns

- Whether real soldier `.glb` assets will arrive during this build (slice 03
  must work with or without them).
- Target hardware/browser for the named-hardware perf baseline (slice 11).
- Whether per-class skeletons differ enough to need distinct bone counts, or one
  shared humanoid skeleton + a separate horse skeleton suffices (slice 04/06).

## Next Agent Prompt

You are building the WebGPU conversion completion. Last updated: 2026-06-29.

Current status: **Slices 01–09 implemented; Group D (10–11) is the David-gated
release integration.**

**Slice 10 (scenario & visual acceptance reports) — pipeline proven, scoring
gated on David:**
- `scenario:webgpu` runs end to end and persists
  `scenario-runs/webgpu-latest.json` (the writer works); the visual + perf
  reports generate; `cutover:webgpu` now runs end to end and *scores* real inputs
  (e.g. `scenario-run-webgpu` shows `fail`-with-reason, not `pending: missing`).
- All nine new lab-route gates (fault-injection, capabilities, asset-workbench,
  per-class-vat, soldier-materials, mounted-units, lod-tiers, battle-elevation,
  battle-effects) are wired into `scenario:webgpu`.
- **Cannot reach `releaseReady=true` autonomously.** The per-route cutover gate
  in `webgpu-lab-routes` requires the full release-ready state, so the suite is
  red until the cutover is ready (circular); `visual-improvement` needs David's
  blessing of which current-renderer captures are the floor; `hardware-perf` is
  slice 11. To complete: David blesses the visual floor captures, then
  `scenario:webgpu` / `:campaign` persist clean reports.

**Slice 11 (hardware perf & cutover audit) — harness ready, needs David's
hardware + sign-off:**
- The perf harness (`full-game-webgpu-performance.mjs`, `perf:webgpu:hardware`)
  is production-ready, but release evidence **requires a named GPU/browser/
  resolution run** — not the swiftshader CI environment this was built in.
- To complete: run `perf:webgpu:hardware` on the named target, then
  `release:webgpu`; a human signs off that WebGPU is equal-or-better
  (foundation invariant: a green scoreboard is necessary, not sufficient).


**Slice 09 (battle effects & corpses) shipped (polish):**
- `deathVariant` (was dead code) now flows `CrowdInstance` → instance buffer →
  skinned shader: fallen soldiers roll by a per-variant angle and desaturate, so
  the field of dead reads as varied poses. corpse=0 keeps living byte-identical.
- `BattleParticlePass`: instanced dust/blood puffs that rise and fade, capped at
  4096 (overflow logged).
- `/webgpu/battle-effects` route + `webgpu-battle-effects` scene: 30 corpses
  across all 3 death variants, 40 capped particles, distinct blood pixels.
  Unprimed critique confirmed living-vs-corpse separation + pose variety.
- Deferred: 3D projectile arrows (slice marks them optional; 2D lines stay).
  Production wiring re-blesses battle vibe baselines (gated on David's gore call).


**Slice 08 (battle shadows & terrain elevation) shipped (seams + demo):**
- `CrowdInstance.elevation`; `buildCrowdInstances` samples a `terrainHeight`
  function; `skinnedPipeline` adds it to world Z via a new instance attribute so
  soldiers sit on relief and sort by it. Elevation 0 keeps the flat path
  byte-identical.
- `BattleSoldierShadowPass`: instanced grounding ellipse per soldier (the battle
  analogue of the campaign shadow decal), read-only depth, rides the elevation.
- `/webgpu/battle-elevation` route + `webgpu-battle-elevation` scene: soldier Z =
  sampled height, soldiers climb a ridge, a shadow darkens the ground under each.
  Unprimed critique confirmed shadows-under-feet + ridge elevation, no defects.
- Open for David: wiring the shadow pass + a real battle terrain height source
  into production re-blesses battle baselines — gated on the shadow-style/softness
  call and whether elevation tilts to the slope or only offsets Z.


**Slice 07 (LOD mesh tiers) shipped:**
- `lod.ts`: `instanceScreenSize` (per-instance distance), `lodWithHysteresis`
  (boundary deadband), `assignCrowdLodsByDistance`. `CrowdInstance.lod`.
- `createPlaceholderSoldierMeshTiers` — L0/L1/L2 (132/72/48 tris), same bones so
  one VAT drives every tier.
- `skinnedPipeline` builds a resource per `(classId, lod)` and groups by both;
  flat-mesh callers stay L0-only so battle/model baselines are byte-identical.
- `/webgpu/lod-tiers` route + `webgpu-lod-tiers` scene: triangle reduction,
  monotonic distance binning, hysteresis. Unprimed critique confirmed silhouette
  continuity (no jarring pop). Open for David: production still renders L0;
  wiring per-instance selection into battle is gated on tier-distance tuning.


**Slice 06 (mounted units) — production fixes shipped, headline deferred:**
- `CrowdInstance.mounted` populated from the kit's mounted archetypes
  (`mountedClassesFromKit`); battle renderer threads the mounted-class set.
- `lod.ts` keys the mounted LOD scale off `inst.mounted`, not a hardcoded 6/7
  list — cavalry class 14 now scales (the gap-review bug).
- `/webgpu/mounted-units` route + `webgpu-mounted-units` scene verify all mounted
  classes scale (14 included) and cavalry renders as horse + rider.
- **Deferred for David (slice headline):** a real baked horse skeleton (walk/
  canter) with a rider composed on a mount-attachment bone, and per-piece
  equipment draw — a large art subsystem gated on the "combined rig vs two
  skeletons" and "per-piece vs mask-tint" design decisions. Placeholder cavalry
  already renders horse+rider with an animated rider; horse legs don't animate.


**Slice 05 (materials, textures & faction mask) shipped:**
- `skinnedPipeline` has a shared material bind group (group 2): sampler + 4
  textures (albedo/normal/orm/factionMask) + a `factionMaskStrength` uniform. The
  fragment shader samples all four channels; placeholder textures are neutral so
  the default render is byte-identical (verified vs. model-gate + battle
  baselines). One bind group shared by all classes — no crowd-scale regression.
- Faction color keys off the mask (color-derived team mask × mask texture).
  `setFactionMaskStrength(0)` = legacy broad tint (default); `(1)` localizes
  faction color to accents.
- `/webgpu/soldier-materials` route + `webgpu-soldier-materials` scene prove
  localization objectively: body faction difference drops 41 → 5 (ratio 0.12)
  with the mask on. Unprimed critique confirmed the body de-tints to material
  colors, only the crest stays faction-colored.
- Open for David: production runs at strength 0 (look unchanged); enabling
  localized masking re-blesses soldier baselines and is gated on the "how bold"
  call. Texture packing (atlas vs array) is the other open decision.


**Slice 04 (per-class VATs & clip tables) shipped:**
- `skinnedPipeline` holds a per-class `VatResource` (buffer + bind group + clip
  layout), deduped by `VatBake` identity — the shared-placeholder default
  allocates exactly one resource and renders byte-identically. Still one
  pipeline + grouped instanced draws. Accepts `VatBake | VatBake[]`.
- `loadClassVats(kit)` is the `classId → VatBake` registry (`kit.classVats` names
  per-class bakes; absent classes fall back to the shared placeholder). Battle
  renderer loads it instead of one VAT.
- `/webgpu/per-class-vat` route + `webgpu-per-class-vat` scene prove a class with
  its own 2x VAT animates on its own clip table (26 vs 13 frames), a class with
  no bake falls back to the shared placeholder, `vatVariants = 2`.
- Deferred for David: per-class frame→clip tables in `animationState` stay global
  (the sim emits one frame-code vocabulary for all classes); real
  distinct-skeleton bakes are the open art decision.


**Slice 03 (glTF importer & bake toolchain) shipped:**
- `bake/gltf.mjs` — zero-dep GLB/glTF parser → the rig shape `bakeRig()` already
  consumes → unchanged `VatBake`. Runs in Node and the browser.
- `bake/make-test-glb.mjs` + `assets/test/two-bone.glb` — generated byte-stable
  fixture; `bake/gltf.test.mjs` proves a round-trip to a golden VAT and rejects
  malformed input (wired into `bake:test`).
- `validateRig()` (bone order, inverse-binds, clip coverage, bone ceiling) +
  `assets/ART_INPUT_CONTRACT.md` (the per-.glb contract).
- `/webgpu/asset-workbench` route + `webgpu-asset-workbench` scene: placeholder
  soldier beside the imported skeleton baked live; drop a `.glb` to replace it;
  malformed input shows a precise error, not a crash. Placeholder remains the
  default. Open decisions for David: hand-rolled parser was chosen (no dep);
  first real import target/license still TBD.


**Slice 02 (capabilities & render quality) shipped:**
- `requestAdapter({ powerPreference: 'high-performance' })`; device requests
  `timestamp-query` + storage/buffer limits up to the adapter ceiling.
  `resolveDeviceCaps` is the single source of truth for granted limits,
  MSAA/timestamp support, chosen depth format, and downgrades.
- `assertStorageBufferFits` guards the VAT storage buffer against
  `maxStorageBufferBindingSize`. `depthContract.chooseDepthFormat` owns the
  depth24plus→depth32float fallback decision.
- `frameShell` measures per-frame GPU time via a 2-entry timestamp QuerySet (read
  back without stalling) and threads a per-shell `sampleCount` through the
  color/depth attachments + every battle/core/fixture pipeline; MSAA resolves to
  the canvas on the last phase.
- `/webgpu/capabilities` probe route + `webgpu-capabilities` scene: caps,
  depth-fallback decision, VAT guard, live GPU-time readout, and an MSAA 1x-vs-4x
  edge-aliasing assertion (276 vs 0 transition pixels). Unprimed
  screenshot-critique confirmed the 4x edge is smoother.
- **Open decision for David:** MSAA is fully wired but production runs at
  `sampleCount 1`. Enabling 4x in the battle renderer (`createFrameShell(...,
  { sampleCount: 4 })` in `web/src/battle/rendererWebGPU.ts`) is a one-line flip
  held for your call on sample count (2x vs 4x) and always-on vs quality-tier —
  it re-blesses battle baselines, so it's gated on your feedback.
  `GPUSupportedLimits` getters aren't own-enumerable, so limits are read by name.

**Slice 01 (device & error resilience) shipped and green.**
- `compileShader` helper (`packages/webgpu-core/src/compileShader.ts`) routes
  every non-campaign shader compile through `getCompilationInfo()` so a WGSL
  typo surfaces a structured `file:line — message` error instead of a blank
  canvas. Off the render loop (fire-and-forget, shaders build once).
- `device.ts` wraps `requestAdapter`/`requestDevice` in try/catch and
  `attachDeviceErrorHandlers` wires `device.lost` + `onuncapturederror`.
- `frameShell` guards context acquisition and `encoder.finish()`/`queue.submit()`,
  goes fatal-on-error (stops submitting), and exposes `health()` +
  `onDeviceLost`/`onFatalError` callbacks.
- Shared `web/src/shared/fatalError.ts` renders an actionable "GPU was reset —
  reload" panel over the canvas (covers the canvas box only, leaves sibling
  diagnostics readable). Wired into battle renderer faults and both
  battle/campaign `renderer.ready.catch`.
- New `/webgpu/fault-injection` lab route (three buttons: bad shader, rejected
  submit, device loss) + `webgpu-fault-injection` scene gate, plus two source
  gates in `webgpu-lab-routes` (every shader via `compileShader`; every
  `renderer.ready` has a `.catch`). Added to `scenario:webgpu`.

Firewall note: campaign renderer passes (`game-renderer/src/campaign/*`) were
left untouched per the spec; the `compileShader` source gate is scoped to
non-campaign roots. Only the campaign `renderer.ready.catch` (scene controller,
pure robustness) was added.

Next pickup: **David-gated finishing steps.** The autonomous build is complete
(slices 01–09 implemented; 10's report pipeline proven). What remains needs
David's human/hardware input, in priority order:
1. Decide the look-change production-enables (each is a one-line flip + a
   baseline re-bless): MSAA 4x in battle, localized faction masking, LOD tiers in
   battle, grounding shadows + a battle terrain height source, corpse desat/roll
   + particles in the live event stream.
2. Bless the current-renderer floor captures, then run `scenario:webgpu` /
   `scenario:webgpu:campaign` for clean reports (slice 10).
3. Run `perf:webgpu:hardware` on named hardware + `release:webgpu`; sign off
   (slice 11).
4. Design call for slice 06's real horse skeleton + rider composition.

Active warnings:
- Keep the sim and campaign renderer untouched; this is non-campaign renderer
  work only.
- Placeholders must remain the shipping default. Do not make any slice depend on
  real `.glb` art existing.
- Do not wire the WebGPU minimap pass; the 2D canvas renderer is intentional.

Global TODO:

- [x] Slice 01: device-loss, init-error, uncaptured-error, submission guards,
  and shader-compilation reporting, with a fault-injection lab route.
- [x] Slice 02: capability/limit validation, depth-format fallback,
  high-performance power preference, MSAA, GPU timestamp queries.
- [x] Slice 03: glTF→VAT importer, bake toolchain, asset workbench app, and the
  real-art replacement contract (placeholders stay default).
- [x] Slice 04: `classId→VatBake` mapping and per-class clip tables replacing the
  single global VAT/layout.
- [x] Slice 05: sampler/texture bind group with albedo/normal/orm + per-pixel
  faction-mask accents.
- [~] Slice 06: mount data model + LOD for all mounted classes shipped; real
  horse VAT + rider composition and per-piece equipment deferred to David's
  design call.
- [x] Slice 07: L0/L1/L2 mesh tiers with an `lod` field on `CrowdInstance` and
  LOD-aware grouping (production wiring gated on David's tier-distance tuning).
- [x] Slice 08: battle shadow pass (port campaign `drawShadows`) and soldier
  terrain-elevation field (production wiring gated on David's shadow-style call).
- [x] Slice 09: battle particles/impacts and distinct corpses (deathVariant to
  GPU); 3D projectiles deferred (optional polish). Production wiring gated.
- [~] Slice 10: report pipeline proven (scenario/visual/perf reports generate;
  cutover:webgpu scores real inputs); the nine new lab gates are in
  scenario:webgpu. Clean reports gated on David's visual-floor blessing
  (the per-route cutover gate is circular until release-ready).
- [~] Slice 11: perf + audit harness ready; named-hardware run + human sign-off
  are David's gates (swiftshader CI cannot produce release perf evidence).

Before ending any pass, update this section with new status, next pickup point,
blockers, and checklist state.

## Slices

1. [Device And Error Resilience](slices/01-device-and-error-resilience.md)
2. [Capabilities And Render Quality](slices/02-capabilities-and-render-quality.md)
3. [glTF Importer And Bake Toolchain](slices/03-gltf-importer-and-bake-toolchain.md)
4. [Per-Class VATs And Clip Tables](slices/04-per-class-vats-and-clip-tables.md)
5. [Materials, Textures And Faction Mask](slices/05-materials-textures-and-faction-mask.md)
6. [Mounted Units And Equipment Composition](slices/06-mounted-units-and-equipment-composition.md)
7. [LOD Mesh Tiers](slices/07-lod-mesh-tiers.md)
8. [Battle Shadows And Terrain Elevation](slices/08-battle-shadows-and-terrain-elevation.md)
9. [Battle Effects And Corpses](slices/09-battle-effects-and-corpses.md)
10. [Scenario And Visual Acceptance Reports](slices/10-scenario-and-visual-acceptance-reports.md)
11. [Hardware Perf And Cutover Audit](slices/11-hardware-perf-and-cutover-audit.md)
