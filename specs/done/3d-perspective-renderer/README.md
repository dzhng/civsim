# 3D perspective renderer + photorealism (SHIPPED)

The engine's 2.5D "tilted-ortho" pseudo-perspective is gone. **Battle** renders
through a real 3D perspective camera (view + projection matrices, a real reverse-Z
depth buffer) on a **three.js WebGPU + TSL** substrate, lit physically in a
Bronze-Age Aegean / Total War Saga register: PBR materials, a physical sky, one
aerial-perspective haze owner, real cascaded sun shadows, a photoreal Gerstner sea,
30k-soldier LOD/impostors, and an AgX post chain. **Campaign** renders the same
real camera but deliberately stays on the **bespoke WGSL renderer** — its target is
an antique painted chart, not photorealism (see *The campaign split*).

This document is the record of *why* it took this shape and *what must stay true*.
The code is the source of truth for *how*; every claim below points at it.

## The motivating symptom (why this existed)

`/renderer/water-bakeoff` rendered a "dome + radial streaks" wedge: the old
`projectGround(world2, d)` faked depth from world-Y with a fixed pixels-per-world
`zoom`, so a finite water quad converged to a wedge instead of meeting a straight
horizon. A real camera fixes that for free — and unlocks the photoreal register the
`aesthetics` skill targets. The dome died on the water route in slice `02`; that
keystone (matrices + reverse-Z proven on one isolated surface) is what made the
engine-wide seam flip mechanical. The bakeoff route itself was retired in the `17`
sweep — its intent long since owned by the production sea.

## The architecture that shipped

- **One projection owner: `camera3d`** (`packages/renderer-core/src/camera3d.ts`).
  Pure view/projection matrices, a large finite far that converges on the
  infinite-limit matrix (three NaNs at `far=Infinity`), pinned by unit tests. The
  GPU seam is a single matmul, `projectWorld(world) = cam.viewProj * vec4(world,1)`
  in `packages/renderer-core/src/cameraWgsl.ts` — *the one projector*. The CPU trio
  (`worldToScreen`/`screenToWorld`/picking) delegates to `camera3d`. Picking is a
  ray→ground-plane intersection that kept its `screenToWorld(px,py)→(wx,wy)` /
  `pickUnit` signatures.
- **One depth convention: reverse-Z `depth32float`** (near→1, far→0), engine-wide,
  owned by `depthContract.ts` + `pipelineContracts.ts`. Compare direction, clear
  value, and format move together. Reverse-Z inverts three's opaque/transparent
  sort — the crowd/impostor sort comparators are owned deliberately, proven by
  hostile-order fixtures.
- **Battle world on three.js: `packages/photoreal-renderer`.** `PhotorealBattleWorld`
  (`battle/battleWorld.ts`) is the production battle world; `BattleRenderer`'s public
  API is unchanged (the `08b` flip was internal, no runtime flag). The single three
  camera is posed **only** through `cameraBridge.applyCamera3d` — no route or pass
  hand-rolls orbit math; `web/tests/photorealCamera.test.ts` pins the two matrix
  stacks equal.
- **Campaign world on the bespoke WGSL renderer** (`web/src/campaign/renderer.ts` +
  `packages/game-renderer/src/campaign/*` + `renderer-core`'s `frameShell`),
  permanently. The camera is `camera3d`; the *rendering* is the bespoke chart engine.

Battle and campaign share the CPU **geometry/data layer** — the sim's terrain,
scenery, grass-field, and horizon builders in `packages/game-renderer/src/battle/*`
(`buildBattleGroundMesh`, `buildBattleTerrainGrass`, `buildBattleHorizonLayout`,
`featuresToBattleScenery`) plus the ocean wave-baker `bakeGerstnerWaves` in
`packages/game-renderer/src/water/gerstnerField.ts`. The photoreal battle world
consumes those builders; it did not fork its own geometry. That reuse is why the battle bespoke modules survive the
sweep (see *The legacy sweep*).

## The reason — decisions that forced the shape

- **Zoom-coupled FOV, not ortho emulation.** Preserving the old ortho tactical
  legibility was explicitly *not* required — "playable" was the only bar. The rig
  (`03`) is a pure, tunable, testable curve from near-top-down (out) to cinematic
  vista (in); the feared "RTS-mode FOV clamp" was never needed.
- **Additive migration, not a body rewrite.** The camera uniform grew *additively*
  (legacy scalars kept byte-identical while un-migrated passes existed; `viewProj`/
  `invViewProj`/`eye`/`near`/`far` appended) and each pass took an opt-in `real`
  compile flag. Battle and campaign compile the same WGSL but had to flip at
  different times, so rewriting the projector *bodies* would have flipped campaign
  prematurely. Battle flipped in `04`, campaign in `05`; when nothing consumed the
  legacy path, the scalars, the flags, and `projectGround`/`projectWorld3d`/
  `worldDepth3d`/`civsim*WorldDepth3d` were **deleted** in `05b`. No dual projection
  path survives the spine (grep-proven: zero refs).
- **three.js WebGPU + TSL over bespoke (`06`).** An evidence-based bake-off decided
  it: the perf veto passed both prongs at 30k+ soldiers with foliage (~6× in
  budget), three won on look + velocity, and the verification harness survived the
  substrate change. Bespoke was *not* kept for sunk-cost reasons.
- **SIM is untouched — a hard firewall.** No edits under `crates/**`; no change to
  `terrainHeightAt`, `heightField`, pathing, ranges, or `pickUnit`. The
  `battle-terrain-elevation` seating gate (`match=true`) is the tripwire that proves
  the heightfield firewall every slice.

## The campaign split (the most consequential ruling)

Slice `16a` ran a GO/NO-GO spike — the campaign map on the photoreal substrate vs
the bespoke chart vs the antique-chart reference — and **ruled NO-GO**. The
photoreal register (physical sky, Gerstner sea + sun glint, cast CSM shadows, AgX
contrast) *destroys* the antique painted-chart identity the `aesthetics` skill
exists to preserve — the exact "satellite render" the slice warned against. Four
independent evidence lines agreed, including a neutral unprimed judge: the photoreal
render is "a fundamentally different register that grading cannot convert."

**Consequence:** campaign stays on the bespoke WGSL renderer as a **deliberate,
permanent two-renderer exception.** "One substrate engine-wide" is therefore *not*
an invariant. The two renderers share the camera (`camera3d`), the environment
preset owner, and the CPU data layer — they diverge only at the shading register,
which is the whole point.

## Invariants — what must stay true (grep-proven at close)

Each is a single owner; divergence from these is the bug class this feature existed
to kill. `__rendererLabStats` publishes the `{ substrate, projection, environment }`
identity so a test can prove every surface reports the same source of truth.

- **Projection = `camera3d`.** GPU seam `projectWorld` (the only projector,
  `cameraWgsl.ts`); three camera posed only via `cameraBridge.applyCamera3d`. No
  `projectGround`/`projectWorld3d`/`worldDepth3d`/`perspectiveDepth`/`cosP`/
  `zoom`-as-pixels remain (**zero refs**). Exception by design: `battle/minimapPass`
  and the DOM campaign minimap use a top-down 2D `project()` and stay 2D.
- **Depth = reverse-Z `depth32float`, one owner** (`depthContract.ts` +
  `pipelineContracts.ts`). One format, one Z direction, one clear value.
- **Environment/lighting = `CIVSIM_ENVIRONMENTS`/`BATTLE_ENVIRONMENTS`**
  (`packages/game-renderer/src/environment/environment.ts`) — the one preset owner.
  Physical fields are *added* there, never forked into a parallel table.
- **Sky = `SkyModel`** (`atmosphere/skyModel.ts`): a Hillaire sky-view LUT baked by a
  fragment pass, feeding both background and IBL. The procedural equirect stand-in
  is deleted.
- **Aerial/haze = `aerialPerspective`** (`atmosphere/aerialPerspective.ts`),
  assigned once as `scene.fogNode` in `environment.ts` — the ONE haze source for
  every world material. `THREE.Fog` and every inline per-material haze mix are
  deleted (they survive only as deletion comments).
- **Sea (battle) = `seaLayer.ts`**: one seam, `SeaDisplacementSource` (tier
  `gerstner-tsl`), swappable, never a parallel water path. Reflects the SkyModel LUT
  through standard PBR + GGX glint.
- **Post = `post/postChain.ts`** (`BattlePostChain`): one node-pipeline owner —
  restrained bloom (0.06 / 0.30 / linear-HDR threshold 1.0) + tone-map at the tail.
  Tonemap = **AgX** (`BATTLE_TONE_MAPPING` in `world.ts`; ACES deleted).
- **Shadows = `battle/shadowRig.ts`**: real CSM from the live `camera3d` projection
  (three `CSMShadowNode` addon), adapter-tiered (`csm`/`single`/`off`). Blob-shadow
  decals are deleted; the ground receives but does not cast (recorded).
- **Foliage = `battle/foliageLayer.ts`** (`PhotorealGrassField` + `PhotorealScenery`):
  one instanced owner (grass + trees/scenery), sharing the crowd LOD/culling
  infrastructure (`packages/crowd-runtime/src/lod.ts`) — not per-species passes.
- **Crowd LOD = `crowd-runtime/src/lod.ts`** semantics (L0/L1/L2 mesh + L3 octahedral
  impostor); per-instance CPU cull against view ∪ CSM-cascade frusta.
- **Determinism:** animation keys off `PhotorealWorld.setTime` + seeded RNG. The TSL
  `time` node is **banned** in package code (it breaks byte-stable snapshots).

## Performance floor (a first-class acceptance criterion)

Budget: **≤ ~33 ms/frame (30 fps) on the hardware adapter**, judged *with* 30k+
soldiers and dense tree/grass fill on screen, not a bare field. The standing gate is
`bun run --cwd web perf:30k` (`scene.mjs battle-perf-30k`, hardware only —
SwiftShader is the correctness proxy, never a perf oracle). Design consequences:
GPU-driven instancing, aggressive distance LOD + octahedral impostors for both
soldiers and foliage, and true-frustum culling a real perspective camera makes
cheaper. **Closing measurement (apple / metal-3, everything-on):** 30,560 soldiers +
dense foliage (vista 184.8k grass blades / 1.48M grass triangles) — GPU median
**6.45 ms mid / 5.04 ms vista** (~5× within budget).

## Verification environment

- **Headless WebGPU is not blank** — `web/scene.mjs` launches Chromium under
  **SwiftShader** when `VERIFY_GPU=1` (renders correctness fine, incl. reverse-Z +
  the sky LUT; a weak-GPU CI proxy that enforces capability fallbacks). Perf runs on
  hardware (`VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome`).
- Routes: `apps/renderer-lab/src/router.ts` + `photorealBattleRoute.ts`. Scenes:
  `web/scenes/**` (baselines `web/shots/**` via `snapCheck`, `web/snapshot.mjs`).
  Seam unit tests: `bun run --cwd web test:unit` (`web/tests/*.test.ts`, incl.
  `photoreal*.test.ts`). Rust: `cargo test --workspace`. Animated gates snap at a
  fixed `world.setTime(t)`.
- **House traps:** do not run `bunx oxfmt` (wrong formatter/quotes); match the
  single-quote 2-space sibling style by hand. `three` is pinned at `0.185.1` — an
  upgrade is its own reviewed change with the full suite + perf gate as harness.

## Standing gates (survive the close — run on any renderer-affecting change)

1. `cargo test --workspace` — sim firewall; zero diffs under `crates/**`.
2. `bun run --cwd web test:unit` (incl. `photoreal*.test.ts` seam pins).
3. Full battle scene suite under SwiftShader, incl. the `battle-terrain-elevation`
   seating tripwire `match=true`.
4. Campaign scene suites (bespoke renderer) green.
5. Hardware perf gate `perf:30k` — 30k+ soldiers + dense foliage, median ≤ ~33 ms,
   every photoreal pass enabled. Record the number (the frame-time ledger).
6. `screenshot-critique` as the last visual check; `compare-screenshots` vs a target
   when one exists (`assets/target-battle-map.png`, aesthetics references).
7. One visual variable per visual slice, named crop; re-blessed baselines diffed
   individually, never blanket-overwritten.
8. SwiftShader enforces capability fallbacks (sky LUT, CSM, IFFT) via a tier the
   stats identity names — never a perf oracle.

## Dead ends (do not re-walk)

- **IFFT/spectral ocean** — `12a` spiked a port of `Spiri0/Threejs-WebGPU-IFFT-Ocean`
  against Gerstner-TSL and the stock `webgpu_ocean` example; `12b` removed it.
  Gerstner-TSL wins at our framing and is the guaranteed SwiftShader fallback; the
  storage-buffer IFFT cascades were a SwiftShader compute risk that didn't earn its
  keep. (The old "dispersion invisible under the fake camera" rationale was void
  twice over — but porting still lost on evidence.)
- **Campaign photorealism** — ruled NO-GO at `16a` (see *The campaign split*).
  `16b`/`16c` were never built.
- **Ortho tactical-legibility emulation** — considered as an "RTS-mode FOV clamp"
  fallback for `03`; never needed, never built.
- **ACES tone-map** — replaced by AgX at `15` (blind A/B: ACES read as
  over-saturated "Instagram," AgX carries the reference's warm golden-hour cast).
  `toneMappingName` still names ACES only so the rejected alternative is greppable.
- **Rewriting the projector bodies** — abandoned during `04a` (would have flipped
  campaign prematurely); replaced by the additive per-pass `real` flag.
- **`04b` battle polish** — cancelled; every item was superseded (billboards→`08a`,
  LOD→`14b`, pick harness→`05b`).
- **Blob-shadow decal stand-ins** — parity scaffolding deleted at `11` (real CSM).
- **Procedural equirect environment stand-in** — deleted at `10a` (SkyModel LUT).

## The legacy sweep (`17`) — what was deleted, what was kept, and why

The `16a` NO-GO fundamentally shrank this sweep. Because campaign is permanently
bespoke, the bespoke `frameShell` / depth-contract / render-graph / picking machinery
and the campaign passes are a **living, permanent renderer**, and the renderer-lab
routes that exercise them are its regression harness. The rule applied: *delete what
nothing renders; keep what campaign or the lab still renders.*

- **Deleted:** the `/renderer/water-bakeoff` manual demo route (the original
  motivating symptom, no longer a gate since `12`, ungated → zero baseline
  movement) and its now-dead router imports. This is the one clean, zero-cascade
  deletion.
- **Kept — battle CPU data-builders** (`battle/{groundPass,grassPass,horizonPass,
  terrainScenery,terrainFeatures}.ts`, `water/gerstnerField.ts::bakeGerstnerWaves`):
  the photoreal battle world consumes their geometry/data functions. These modules
  are shared infrastructure, not legacy — only their dormant bespoke *GPU-render*
  halves are exercised solely by the lab.
- **Kept — the bespoke battle lab estate** (`battle/{crowd,effectLine,groundCue,
  particle,terrain}Pass.ts`, `grassField.ts`, `minimapPass.ts`, `pickingDebug.ts`,
  the water WGSL `waterPlanePass`/`waterField`/`fieldWaterWgsl`/`waterMaterialWgsl`):
  each is still rendered by a `renderer-lab-routes`-gated route and shares the
  bespoke `frameShell`/depth/render-graph contracts campaign ships on. Retiring them
  would delete contract coverage for the permanent bespoke renderer.
- **Kept — campaign bespoke passes + `frameShell` world machinery**: the campaign
  renderer's live owner (the permanent `16a` exception).
- **Grep-audit zero-proof (05b's collapse re-proven):** `projectGround`,
  `projectWorld3d`, `worldDepth3d`, `civsimBattleWorldDepth3d`, `three-probe`,
  `bakeoffProbes`, `reverseZ`-flag — all **zero** in `packages`/`web`/`apps`.

**Recorded post-spec polish (needs David's route-by-route sign-off):** a wholesale
retirement of the battle-*look* lab routes (`battle-terrain*`, `battle-grass*` and
their dead grass-primitive-family R&D) + splitting each battle module's dormant
GPU-render half from its kept data-builder is available but was *not* done by fiat —
slice `17` names this as a human-feedback gate ("decide from the route inventory,
not by fiat; record the call"), and it is a large, baseline-sensitive refactor whose
value is coverage-negative for the now-permanent bespoke renderer. Also deferred:
the campaign **road endpoint-trim** (terminate road polylines at the city footprint
so the model occludes them, per the `renderer` skill's "never cut endpoint gaps"
rule) — it moves campaign baselines and was explicitly deferred at `16d`; folding a
deliberate campaign visual change into the deletion-invisibility slice would muddy
its zero-pixel-movement proof.

## Slice 13 closure — CLOSED-as-seams

Slice `13` was re-scoped (David, 2026-07-02): the terrain/cliff/grass **LOOK** and
the composed master-shot gate belong to the parallel **`specs/battle-map-reference`**
spec (still active — its closure is a separate David sign-off). This ladder owed only
the *substrate seams*, and they are delivered:
- terrain/foliage TSL layers are relit under `09`–`11` — `terrainLayer.ts` /
  `foliageLayer.ts` take the `scene.fogNode` aerial hook and CSM (`receiveShadow` /
  `castShadow`; the `08a` blob-shadow decals are deleted);
- foliage is ONE instanced owner (`foliageLayer.ts`) sharing the LOD/culling infra;
- file reservation honored: `battle/{terrain,foliage}Layer*` LOOK edits are
  `battle-map-reference`'s; the ladder touches them only through the shared hooks.
The LOOK work continues in `battle-map-reference`.

## Visual provenance (the standard the work was held to)

Kept in `assets/` — these *are* the requirement; the result is meaningless without
the standard it matched:
- **`target-battle-map.png`** — the photoreal north star (Bronze-Age Aegean / Total
  War Saga), copied from `battle-map-reference`; the `compare-screenshots` target for
  every photoreal surface.
- **`battle-coastal-vista.jpg`**, **`battle-advance-coast.jpg`** — sea/coast master
  references for slice `12`.
- **`battle-overcast-highland.png`** — the overcast-preset litmus for `10c`.
- **`shadow-preset-montage.png`** — CSM preset review for `11`.
- **`bakeoff-gerstner-y0.png`**, **`bakeoff-ifft-y0.png`**,
  **`baseline-webgpu-ocean.png`** — the `12a` sea technique bake-off (why Gerstner
  won); notes in `assets/sea-spike-notes.md`.
- **`assets/impostor-spike-notes.md`** — the `14b` octahedral-impostor spike notes.
- Live review evidence: `web/shots/battle/photoreal-sea-rhythm/rhythm.gif` (the sea's
  travel-not-teleport swell rhythm — the retired `water-rhythm` gate's intent
  re-pointed at the production sea).

The retired `specs/battle-atmosphere` folded its presets/sky/aerial work into
`09`/`10`/`12`; its reference images live here in `assets/`.

## Evidence ledger (per slice — detail was in the slice files, now folded here)

| Slice | Verdict / key evidence | Commit |
|---|---|---|
| `01` camera3d math lib | pure matrices + probe route; 7 unit tests; `test:unit` gate wired into root `test:web` | `22890ee2` |
| `02` water keystone | dome/streak wedge GONE; reverse-Z `depth32float` non-blank on SwiftShader; legacy scalars byte-identical | `6a5b5c0d` |
| `03` zoom→camera rig | pure monotonic curve battle+campaign; RTS-mode FOV clamp not needed; 37 unit tests | `88d45d0f` |
| `04a` battle flip | per-pass `real` flag + reverse-Z shell; 3D ray-cast picking <0.3 px; 24 baselines re-blessed; campaign byte-identical | `785d2ee9` |
| `04f` 30k perf gate | standing hardware gate `perf:30k`; bespoke baseline GPU median 4.35/4.30 ms mid/vista | `55caaab2` |
| `04b` battle polish | **CANCELLED** — every item superseded | `b3aa3ef9` |
| `05a` campaign flip | scale-faithful rig (`distance` from `cam.scale`); picking <0.4 px; 23 baselines re-blessed; battle byte-identical | `a90177fd` |
| `05b` legacy collapse | SPINE COMPLETE: one projector/depth, uniform 48 floats, `PROJECTION_IDENTITY` published+asserted; zero legacy refs | `e86f68dd` |
| `06` substrate bake-off | **VERDICT: three.js WebGPU + TSL** — perf veto passed both prongs (~6×), three won look+velocity | `b0c75167` |
| `07` photoreal foundation | `packages/photoreal-renderer` (world/cameraBridge/environment/stats seams); spike deleted; crowd probe 5.29 ms | `34df87e0` |
| `08a` parity battle world | full production world on three.js at parity (parityDistance ≤0.0025); 30.5k GPU 3.3–3.9 ms; 3 TSL hazards recorded | `72a47b7c` |
| `08b` production flip | `BattleRenderer` internals → `PhotorealBattleWorld` (API unmoved, −371 lines); ZERO re-blesses; 3.31/3.59 ms; play-tested headful | `835bd4c3` |
| `09` lighting core | physical sun+IBL+ACES from the ONE env owner (+`physical` block, +noon preset); neutral albedos; 9 re-blesses; 3.27/2.75 ms | `93943c21` |
| `10a` physical sky | `SkyModel` sky-view LUT baked by FRAGMENT pass (tier `skyview-fragment-lut`); equirect stand-in DELETED; zero re-blesses | `ef2c491d` |
| `10b` aerial owner | `aerialPerspective` on `scene.fogNode` is THE one haze source; `THREE.Fog` + inline hazes DELETED; ground-focus depth | `027efabe` |
| `10c` preset moods | overcast litmus PASSES (lum 191/sat 6.2 vs ref 176/7.6); golden elev 0.35; ~70 re-blesses; 3.14/3.18 ms | `04c5dcb4` |
| `11` CSM sun shadows | `shadowRig` — three `CSMShadowNode` (3×2048 from live camera3d) + `'single'` SwiftShader tier; blob decals DELETED; ground receives-not-casts; 6 new baselines; 5.86/6.39 ms | `f469a697` |
| `12b` sea PBR | spectral/IFFT spike REMOVED; Gerstner TSL only tier; reflects SkyModel LUT via PBR + GGX glint; normal detail fades 720→2300 m | `d1531a82` |
| `12c` sea foam | whitecaps gated by crest height + slope agitation + speckle; `sea-mid` foamFraction 0.0838, not blanket | `b4ced5e3` |
| `12d` sea shore | terrain-height shore ramp tan sand → turquoise → deep blue; sea rim to 7200 m, left to aerial haze | `775e5419` |
| `12e` sea glint | roughness floor 0.105 + normal-detail ceiling 0.84; `sun-glint` hotFraction 0.0326; old water-* gates retired; 5.85/7.89 ms | (12 branch) |
| `14a` PBR soldier materials | per-class albedo/normal/orm/faction-mask on the VAT crowd; bronze/iron metal, linen/leather rough; legible at zoom | `codex-14a` |
| `14b` 30k LOD/impostors + culling | `lod.ts` reused (L0/L1/L2 mesh + L3 octahedral impostor); per-instance cull vs view ∪ CSM frusta; spike DELETED; 30k mid 3.63/vista 3.59 ms | (14 branch) |
| `14c` contact AO | analytic `aoNode` grounding (indirect-only, distinct from 11); band 0.42 / strength 0.55, corpse-gated; frame-time-neutral | (14 branch) |
| `15` post chain | `post/postChain.ts` ONE owner: bloom 0.06/0.30/threshold 1.0 + **AgX** (ACES deleted); 12e glint pairing proven; 15b refine = NO; 4.73/7.89 ms | (15 branch) |
| `16a` campaign GO/NO-GO | **NO-GO** — photoreal register destroys the antique chart; four evidence lines incl. neutral judge; campaign permanently bespoke; `16d` critique fixes (selection-ring contrast, beach-rim mute); campaign suite green | `bab91a46` |
| `17` legacy sweep + close | battle-side sweep = water-bakeoff route deleted (zero cascade); bespoke battle estate + campaign KEPT (permanent bespoke, `16a`); 05b zero-grep re-proven; `13` CLOSED-as-seams; sea-rhythm scene + GIF; invariants grep-proven; **closing perf 6.45 mid / 5.04 vista ms @ 30.5k (apple/metal-3)**; spec closed | (this commit) |
