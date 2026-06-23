# Spec: WebGPU skinned-crowd battle — AAA soldiers at army scale

## Goal, in one sentence

Replace the procedural box soldiers with **rigged, PBR-textured, skeletally
animated** characters rendered as a GPU crowd on a **WebGPU-only** engine —
a few thousand hero/mid skinned soldiers near the camera, impostors and the
existing 2D sprite atlas beyond — so a battle looks like the reference Total War
shots instead of stylised blocks.

> **Authority of this document.** This is an *architecture* spec, not a
> calibration. The **constraints** (§"What must NOT change"), the **asset
> contract** (§"The asset contract"), and the **verification milestones** are
> binding. The **design** (the crowd-skinning technique, LOD chain, shader
> plan) is the recommended path — deviate where measurement or WebGPU/Babylon
> reality disagrees, but keep the constraints. Almost nothing here is a measured
> operating point yet, because the system does not exist; the binding facts are
> about the *current* renderer, which you must not break.

## The contracts this must establish / must not break

There is no green test that *defines* "AAA" — the ground truth is the
screenshot/turntable harness plus the perf gate. The work is gated by:

- **Stays green (re-blessed once each, on WebGPU):** `web/verify-battle.mjs`
  (boot, LOD reads team colour far / faction accent near, dpr selection,
  perf), `web/verify-campaign-visual.mjs`, every `web/vibe/*.mjs` timeline,
  the `vibe/turntable.mjs` model review, `web/shots/baseline/**`. These run
  through `web/snapshot.mjs::snapCheck`. They must all run **headless on
  WebGPU** (Milestone 0) and be re-blessed deliberately, once, per visual
  milestone.
- **Becomes green (new, written as part of this work):**
  - `verify-battle`: *a skinned soldier is animating* — at a FROZEN sim tick,
    two renders one anim-clock step apart differ inside a unit's AABB (the clip
    is playing, not a static pose).
  - `verify-battle`: *perf gate* — N skinned characters in view hold the frame
    budget (see §perf). Replaces/augments the existing `frame rate alive` check.
  - `verify-battle`: *picking is exact under WebGPU* — the existing dpr
    click/drag-box selection asserts, unchanged in intent, pass on the WebGPU
    engine (camera math is engine-agnostic; this guards the port).
  - `verify-battle`: *faction reads near* — at a model-visible zoom a unit's
    pixels carry a clear share of its faction colour via the texture mask
    (the near-zoom analogue of the current `LOD` check).
  - A *deterministic-bake* check: the animation-texture bake is reproducible
    (same bytes) so snapshots are stable.

The **sim golden hash does not move** — this is a renderer/campaign-renderer
change only (see firewall).

## Context you don't have (read this; it is the whole reason)

### How the battle renders today (the thing being replaced)

`web/src/battle/renderer3d.ts` — class `BattleRenderer3D`, a **WebGL2** Babylon
renderer (`new Engine(canvas, true, …)`). Per frame the battle scene calls
`renderer.draw(positions, facings, frames, alive, count, camera, …)` with
**zero-copy `Float32Array` views into wasm memory** (up to ~30k soldiers). It has
two paths chosen by zoom (constants `ZOOM_FLAT=2`, `ZOOM_SWAP=2.4`, `ZOOM_3D=7`):

- **3D path** `drawMeshes()` — thin-instanced box meshes. There is **one mesh per
  (pose, class, team)**: `POSES[]` (idle, a rest ladder, 2 march beats, 2 run
  beats, attack, hit, crumple) × `CLASS_LOOK.length`=12 classes × 2 factions.
  Geometry comes from `web/src/shared/soldierModel.ts::classGeometryDetailed(cls,
  pose, faction, {livery})` (articulated *boxes*, vertex colours for materials +
  a faction accent, planar-UV grain texture). Each soldier is routed to a bucket
  by `poseOf(i, frame)` and gets **one 4×4 instance matrix** (facing rotate +
  scale + ground lift `gz()+tintHeight()`).
- **2D path** `drawSprites()` — the strategic far view: one thin-instanced quad,
  textured from the procedural atlas `web/src/battle/atlas.ts::buildAtlas()`
  (top-down sprites per class/team/frame). **Keep this** — it is the L3 far-LOD
  the perf target depends on.

The **`frames` protocol** (derived per-soldier in `web/src/battle/scene.ts`, a
`Float32Array`) is the animation state the renderer reads. Values:
`0` alert/guard, `1`/`2` march beats, `3` attack strike, `4` fallen,
`5` weapon fumble, `6` at-ease, `7` stowed pike, `8`/`9` run beats, `10` hit
flinch. scene.ts also keeps `renderPos` (a render-only smoothing of the sim
position; **snapped to the true sim position when `frozen`** so snapshots are
deterministic) and the per-soldier `deathFrac` ease in the renderer.

**The box model's ceiling — why this whole spec exists.** A thin-instance gets
*one matrix*. Real limb motion (a leg swinging, a sword arm tracking) is
impossible per-instance, so today it is faked by **building a separate mesh per
pose and swapping which mesh an instance lands in** (`POSES`). That does not
scale to real skeletal motion (you cannot bake a continuous walk cycle, blends,
or 30 death variations as discrete swapped meshes), and the boxes will never
read as AAA. The fix is GPU skeletal skinning, which forces the asset + bake +
shader pipeline below.

### Debug/vibe split (preserve it)

`?debug=blocks` (`blockMode`) renders the flat team-coloured **block** model
(`classGeometry`), and `enableScatter`/`elevation` are off in that mode. The
vibe timelines force `?debug=blocks` (in `web/vibe/_lib.mjs`) so the **behaviour
baselines pin the sim, not the art**. This split must survive: the new skinned
path is the default; `?debug=blocks` stays the cheap, deterministic vibe/CI path.
`web/src/battle/turntable.ts` (`?test=models`, `window.__tt`) is the model-review
harness — extend it to review skinned clips, don't replace it.

### Camera / picking (load-bearing, engine-agnostic)

`web/src/shared/camera.ts` is an **orthographic** camera with yaw + user pitch
whose `worldToScreen`/`screenToWorld` are an **invertible affine** (rotate ground
by −yaw, foreshorten by cos pitch). Picking (`game.pick_unit`), the DOM unit
cards (`web/src/battle/unitCard.ts`), banners, and overlays all depend on it.
**It is pure math, independent of the GL/WebGPU engine** — the WebGPU port must
keep using it unchanged; `syncCamera()` in renderer3d just mirrors it onto the
Babylon camera.

### Campaign (also ports — §scope answer "include campaign")

`web/src/campaign/terrain3d.ts` is a **separate WebGL2** Babylon scene with four
custom **GLSL** ShaderMaterials registered in `ShaderStore`: `campTerrain`
(biome-graded terrain + water), `campModel` (the army/city models — reads vertex
`color.a` as a **livery flag** × per-instance `iColor` faction tint), `campTree`,
`campShadow`. Army markers already use `classGeometryDetailed(c, {rest:1},
[1,1,1], {livery:true})` with a march bob and a green selection ring. Dropping
WebGL2 means this scene must move to the same WebGPU engine and these four
shaders must port to WGSL; the army figures should reuse the new skinned-crowd
meshes at a low LOD.

### The sim has no per-soldier hit/death signal

The current flinch (`frames==10`) is a renderer *approximation* (≈⅓ of engaged
men on the off-beat) and death is detected from `alive` flipping. The sim exposes
no "was struck this tick" or "killed by X" buffer. A richer anim system *may*
want one. The sim is a firewall (below); if a read-only per-soldier `flinch`/
`hit_dir` buffer is judged worth it, it is a **separate, additive** sim change
(a new `*_ptr` export that records existing combat events; must not move the
golden hash) — not part of this spec's critical path. Default: keep deriving
animation state from the existing `frames`.

### Verification runs headless on software WebGL2 (the #1 risk)

Every gate (`verify-battle.mjs`, `verify-campaign-visual.mjs`, `vibe/*.mjs`,
`vibe/turntable.mjs`) drives **headless Chromium via Playwright on SwiftShader
(software WebGL2)** and pixel-compares against committed baselines. **WebGPU in
headless Chromium is not reliably available** the way software WebGL2 is — it
needs Dawn's software backend (SwiftShader/Vulkan-swiftshader) or a real-GPU CI
runner. If this is not solved, *the entire test harness goes dark the moment
WebGL2 is dropped.* This is **Milestone 0** and the top de-risking item.

## Approaches that will NOT work — do not retry naively

1. **Babylon CPU skeletal animation** (`Skeleton` + `AnimationGroup` per
   character, the default glTF path). It is O(characters × bones) on the CPU and
   issues a draw per character; it dies in the low hundreds, never mind ~30k. The
   whole point is to move skinning to the GPU and keep one draw per (LOD,
   material).
2. **Per-instance bone matrices as instance attributes/uniforms.** ~40 bones ×
   a mat4 per instance is far too much per-instance bandwidth. Bones must live in
   a **texture/storage buffer** sampled in the vertex shader (VAT), with the
   instance carrying only `(clipId, time, …)`.
3. **Extending the `POSES` mesh-swap trick to "more poses."** It is the dead end
   we are leaving: discrete swapped meshes cannot express a continuous cycle,
   cross-fades, or many death variants, and the box silhouette caps quality.
4. **Ragdoll for every corpse.** The physics budget explodes at army scale. Use
   **baked death clips** (a few variants, chosen by a per-instance seed) for the
   bulk; reserve true ragdoll, if any, for a tiny near-camera budget.
5. **Assuming headless WebGPU "just works" in Playwright.** It does not today;
   treat it as unsolved until Milestone 0 proves a reproducible headless WebGPU
   render. (Falling back to a GPU CI runner, or a software-Dawn build, are the
   known options.)
6. **Letting animation phase read wall-clock time.** Snapshots freeze the sim;
   the anim clock must be a function of sim state/tick so a frozen frame is
   byte-deterministic — the same rule the renderer already follows for
   `renderPos`/`deathFrac` (`fixedTime`, `frozen`).

## The design (recommended path)

### Engine

Swap `new Engine(...)` → `WebGPUEngine` (Babylon `@babylonjs/core` ^9.12, has
`WebGPUEngine` + `engine.initAsync()`). One engine for both scenes. Show a clear
"WebGPU required" message if `navigator.gpu` is absent (no WebGL2 fallback, per
the all-in decision). Custom shaders move to **WGSL** (Babylon `ShaderMaterial`
takes `shaderLanguage: ShaderLanguage.WGSL`; some GLSL can be auto-processed but
the custom `battleGround/Sprite/Overlay/Grade` and `campTerrain/Model/Tree/
Shadow` shaders should be ported deliberately and snapshot-checked).

### The asset contract (the "modular kit" — pin this; art + code agree on it)

A committed contract under `web/assets/soldiers/` (paths illustrative). This IS
the interface between the commissioned art and the runtime; stand-ins satisfy it
until real art arrives.

- **One shared humanoid skeleton** (`skeleton_human`), fixed bone **count, order,
  and names** (~30–40 bones). Every human clip and every human equipment piece is
  authored against it. A second skeleton `skeleton_horse` for the two mounted
  classes (6 shock cav, 7 horse archers); the rider reuses `skeleton_human`.
- **Modular equipment pieces**, each a skinned glTF bound to the shared skeleton:
  `body` (torso+legs+arms), `head` (incl. helmet variants), `shield`, `weapon`.
  An archetype = a choice of pieces. This is how the **12 `CLASS_LOOK` classes**
  (0 heavy-sword … 11 heavy-spear) are built without 12 unique meshes; per-class
  weapon/shield/helmet wiring mirrors today's `CLASS_LOOK`.
- **PBR texture sets** per material: `albedo`, `normal`, `orm`
  (occlusion/rough/metal), at a sane resolution (≤1–2k, atlased), authored for
  KTX2/Basis compression.
- **A faction mask** (one channel) marking texels that take the **faction
  accent** colour (crest/plume, shield blazon, sash) — the texture analogue of
  today's livery alpha flag. Tinting is `mix(albedo, factionColor, mask)`. Keep
  the "accent, not whole-body" design and the existing per-faction palette.
- **Animation clip set** (authored against `skeleton_human`; names are the
  contract the state machine binds to). Minimum, mapping the existing `frames`:
  `idle` (0), `march_a`/`march_b` or one looping `march` (1/2), `run` (8/9),
  `attack` ×2–3 variants (3), `hit` ×2 (10), `death` ×3–4 (4), `brace`,
  `at_ease` (6/7), plus `rout`/`cheer` for flavour. Mounted variants on
  `skeleton_horse` (`horse_idle/walk/canter/gallop`) + rider clips.
- A `kit.json` manifest: archetype→pieces, class→clip-set, clip→`(start, frames,
  fps, loop)`, texture/mask channels, bone order. **The runtime reads only this
  manifest** so art can iterate without code changes.

### Offline bake → animation texture (VAT)

A deterministic **build step** (`npm run bake:anim`, Node + a glTF reader, or a
headless Babylon bake) produces, per skeleton:

- an **animation texture**: bone matrices packed as texels (e.g. 4 RGBA32F texels
  = one mat4, or 3 for a mat3×4), laid out `[bone][frame]` across all clips
  concatenated, with `kit.json` giving each clip's frame offset/length/fps;
- the skinned mesh buffers (positions, normals, tangents, uv, **bone indices +
  weights**) per LOD.

Output is **committed or build-reproducible and byte-stable** (snapshot
determinism depends on it). This is the make-or-break technique: with it, an
animated soldier costs *one matrix-texture fetch per bone in the vertex shader*
and **zero per-character CPU work**.

### Runtime: one instanced skinned draw per (LOD, archetype-material)

Per-instance data (storage buffer, the WebGPU win over today's thin-instance
attribute soup): `world transform` (or position+facing+scale, ground-lifted via
`gz()+tintHeight()` exactly as now), `clipId`, `clipTime` (phase), `factionIndex`,
`variationSeed` (equipment/texture/death-variant selection), `lod`.

Vertex shader: read the instance, for each of the vertex's ≤4 bone
indices/weights sample the bone matrix from the animation texture at
`(clip, time, bone)`, blend, skin, transform by the instance world + camera
`viewProjection`. Fragment: PBR using albedo/normal/orm + the faction mask.

**State machine** (`web/src/battle/crowdAnim.ts`, new): map the existing
per-soldier `frames` value → `(clipId, phase)`, reusing scene.ts's derivation
unchanged. Cross-fade (sample two clips and lerp) only for the **near** LOD;
hard-switch at distance. Death: when `alive` flips, pick a `death_*` clip by
`variationSeed`, advance once, hold the last frame as the corpse (replacing
today's matrix topple + `deathFrac`).

### LOD chain (perf target: ~2–5k skinned near, sprites far)

| LOD | What | When |
| --- | --- | --- |
| L0 | hero skinned, full PBR + near shadow | nearest band, ≤ a few thousand |
| L1 | decimated skinned, simpler material, no per-frame shadow | mid band |
| L2 | **impostor** (octahedral/billboard atlas baked from the hero, a few anim phases) | far band |
| L3 | **existing 2D sprite atlas** (`drawSprites`, ported to WGSL) | strategic view |

LOD + frustum cull assignment and per-LOD instance compaction run in a **WebGPU
compute pass** (the headline reason to go WebGPU) — the GPU builds each LOD's
instance list each frame. The L2/L3 transition reuses today's `ZOOM_SWAP` idea.

### Lighting / shadows / grade

Directional **sun PBR**; a **cascaded shadow map covering only the near band**
(L0), cheap contact/AO for the bulk (the campaign already fakes contact shadows —
mirror that). Keep the warm colour grade so battle and campaign read as one game
(today's `battleGrade`/`GRADE`).

### Campaign

Move `terrain3d.ts` to the WebGPU engine; port `campTerrain/Model/Tree/Shadow`
GLSL→WGSL (snapshot-checked via `verify-campaign-visual`). Army figures reuse the
**skinned-crowd meshes at L1/L2** so the campaign march is a real walk cycle, not
the bob; keep the **faction mask**, the **neutral standard + flag**, and the
**green selection ring** exactly as they are now.

## What must NOT change (scope firewalls)

- **The sim.** `crates/sim`, `crates/campaign`, `crates/contract`,
  `crates/game-wasm` — untouched. The renderer reads the same zero-copy buffers
  and the same `frames` protocol. The **golden hash stays pinned.** (Any optional
  read-only flinch/death buffer is a separate spec.)
- **`web/src/shared/camera.ts`** affine picking + `worldToScreen`/`screenToWorld`,
  and the input model (`web/src/battle/input.ts` Total War controls). Engine swap
  must not touch the camera math; the picking contract stays exact.
- **The UI**: bottom unit-card strip (`unitCard.ts`), banners (`unitBanner.ts` /
  the billboard layer), the faction-accent design (accent, not whole-body), the
  HUD/toolbar/minimap. These are DOM/2D and engine-independent.
- **The far-LOD 2D sprite atlas and `?debug=blocks` block path** — both stay (the
  perf target and the vibe behaviour baselines depend on them). Vibe timelines
  keep forcing `?debug=blocks`.
- **Terrain elevation, scatter, organic features** (`terrainHeightJS`,
  `tintHeight`, `paint_blob`) — keep; soldiers still ground-lift onto the
  heightfield.
- **Determinism rule**: anim phase is a function of sim state, frozen-stable.

## Contracts table

**Must STAY green (re-blessed once on WebGPU, per milestone):**
`web/verify-battle.mjs` · `web/verify-campaign-visual.mjs` ·
`web/vibe/*.mjs` (all 17 scenarios, on `?debug=blocks`) ·
`web/vibe/turntable.mjs` · `web/shots/baseline/**` · `cargo test -p sim` and
`-p campaign` (untouched, must be unaffected).

**Must BECOME green (write these):**
`skinned soldier animates` (frozen, two anim-steps differ) ·
`perf gate` (N skinned near hold budget) ·
`picking exact under WebGPU` (dpr click/drag select, ported) ·
`faction reads near` (mask tint share) ·
`anim bake is byte-reproducible`.

**Golden hash:** does **not** move. If it does, something touched the sim — stop.

## Process requirements / gotchas (this repo's, plus this work's)

- **Milestone 0 first, or nothing is verifiable.** Prove a reproducible
  **headless WebGPU** render that `snapCheck` can pixel-compare (Dawn software
  backend, a flag, or a GPU CI runner). Until then you are flying blind.
- **Rebuild wasm before trusting any screenshot** (`npm run build:wasm` from
  `web/`) — the browser loads the prebuilt `web/src/wasm`, never live Rust.
  (Unchanged here, but still true.) Note `wasm-opt` may fail to download in this
  sandbox; the unoptimised binary is fine for dev.
- **Re-bless deliberately, once per visual milestone**, with `UPDATE_SHOTS=1`,
  and **look at every baseline** before committing (the screenshot-regression
  skill is law: a green harness only proves *no change*, not *correct*).
- **Babylon WebGPU shader port**: custom GLSL ShaderMaterials need WGSL; verify
  each ported shader against its baseline in isolation.
- **The bake must be deterministic** or snapshots churn run-to-run.
- **Keep `?debug=blocks` cheap and engine-light** so vibe/CI stay fast and
  stable; do not route the block path through the skinned pipeline.
- **Concurrent sessions edit the same tree**; commit in focused milestones.
- **Asset licensing**: the modular kit / clips must be licensed for a shipped
  game (mocap libraries and marketplace packs often are not) — pin this in
  `kit.json` provenance before committing any asset.

## Acceptance (milestones — each is shippable/reviewable)

- [ ] **M0 — engine + CI.** App runs on `WebGPUEngine` (battle + campaign) with
  the *existing* content (block models, ground, sprites, campaign shaders ported
  to WGSL). Headless WebGPU render works; the whole harness runs and is
  re-blessed once. No new look yet. *This proves the floor.*
- [ ] **M1 — skinned crowd runtime** on a placeholder rigged glTF + free clips:
  VAT bake, instanced GPU skinning, `frames`→clip state machine, the four-tier
  LOD, GPU cull/LOD compute pass. **Perf gate green at ~2–5k skinned near.**
  Behind a flag; `skinned soldier animates` + `picking exact` green.
- [ ] **M2 — the roster.** The modular kit contract + the 12 archetypes via the
  kit, faction mask tinting, cavalry (horse rig). `faction reads near` green.
- [ ] **M3 — fidelity.** PBR sun + near shadows + impostor L2; colour grade
  matched to the reference shots; turntable extended to review skinned clips.
- [ ] **M4 — campaign.** Army figures on the skinned system (real march), the
  four campaign shaders on WGSL, re-blessed.
- [ ] **Postmortem note** (for the next person): record the perf operating point
  reached (skinned-count × fps × GPU), the final LOD bands, the bake layout, and
  any headless-WebGPU CI workaround. **Then delete this file.**
