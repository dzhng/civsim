# 3D perspective renderer + photorealism

Replace the engine's 2.5D "tilted-ortho" pseudo-perspective projection with a
**real 3D perspective camera** (view + projection matrices, real depth buffer),
engine-wide across **battle and campaign**, and build a **photoreal** look on top
of it (PBR materials, real sun shadows, physical sky/atmosphere, photoreal
sea/terrain/soldiers). The motivating symptom: `/renderer/water-bakeoff` renders
a "dome + radial streaks" because the finite water quad converges to a wedge under
the fake perspective (`projectGround` fakes depth from world-Y with a fixed
pixels-per-world-unit `zoom`). A real camera fixes that for free — and unlocks the
photoreal register the `aesthetics` skill targets.

## Next Agent Prompt

**Status (updated 2026-07-02): ON MAIN through slice `11`; worktree `codex-12bcde`
has `12b` + `12c` complete.** The camera spine
`01`–`05b` is COMPLETE (one projector `projectWorld`, one reverse-Z
`depth32float` convention, legacy 2.5D deleted and grep-proofed). The `06`
substrate verdict is **three.js WebGPU + TSL** for the photoreal layer (camera
spine stays bespoke `camera3d`, fed through `cameraBridge.applyCamera3d`).
`07`–`11` landed: `packages/photoreal-renderer` owns battle production rendering
(`08b` atomic flip, no runtime flag), lit physically from the ONE environment
owner (`09`), under a Hillaire-style sky-view LUT + THE one aerial-perspective
owner + four preset moods (`10`), with REAL cascaded sun shadows from that same
sun (`11` — `battle/shadowRig.ts`, adapter-tiered csm/single/off; the 08a
blob-shadow decals are deleted). Every later look slice lands in the real game,
on `main`, as an individually gated increment — not on a long-lived branch. The
standing gates ("Photoreal ladder invariants" below) apply on every slice.

**Exact next pickup point: `12d` — photoreal sea shore blending**
(`slices/12-photoreal-sea.md`): `12a` picked Gerstner TSL and rejected the
spectral/IFFT spike; `12b` removed that implementation, kept the one
`SeaDisplacementSource` socket, and put the surface on SkyModel-LUT PBR with
distance-faded normal detail; `12c` made whitecaps crest/slope/agitation driven
and added the `sea-mid` crop. Continue with shore blending and glint discipline.
`12`/`13`/`14` are parallelizable in
worktrees from here — coordinate with David's battle-map-reference session
(file reservations below). Critique items owned by name: tan field albedo +
map-edge seams + mountain shelf + crag-base shadow gap (`13`), far-crowd smear
(`14b`), trunk-contact AO (`14c`).

### Evidence ledger (done slices — one line each; detail lives in the slice file)

| Slice | Verdict / key evidence | Commit |
|---|---|---|
| `01` camera3d math lib | pure matrices + probe route; 7 unit tests; `test:unit` gate wired into root `test:web` | `22890ee2` |
| `02` water keystone | dome/streak wedge GONE; reverse-Z `depth32float` non-blank on SwiftShader; legacy scalars byte-identical | `6a5b5c0d` |
| `03` zoom→camera rig | pure monotonic curve battle+campaign; RTS-mode FOV clamp not needed; 37 unit tests | `88d45d0f` |
| `04a` battle flip | per-pass `real` flag + reverse-Z shell; 3D ray-cast picking <0.3 px; 24 baselines re-blessed; campaign byte-identical | `785d2ee9` |
| `04f` 30k perf gate | standing hardware gate `perf:30k`; bespoke baseline GPU median 4.35/4.30 ms mid/vista (~7.5× in budget) | `55caaab2` |
| `04b` battle polish | **CANCELLED** — every item superseded (billboards→`08a`, LOD→`14b`, pick harness→`05b`) | `b3aa3ef9` |
| `05a` campaign flip | scale-faithful rig (`distance` from `cam.scale`); picking <0.4 px; 23 baselines re-blessed; battle byte-identical | `a90177fd` |
| `05b` legacy collapse | SPINE COMPLETE: one projector/depth, uniform 48 floats, `PROJECTION_IDENTITY` published+asserted; zero legacy refs | `e86f68dd` |
| `06` substrate bake-off | **VERDICT: three.js WebGPU + TSL** — perf veto passed both prongs (~6× in budget), three won look+velocity; harness survival proven | `b0c75167` |
| `07` photoreal foundation | `packages/photoreal-renderer` (world/cameraBridge/environment/stats seams); spike deleted; crowd probe GPU 5.29 ms | `34df87e0` |
| `08a` parity battle world | full production world on three.js at parity (parityDistance ≤0.0025); 30.5k soldiers GPU 3.3–3.9 ms; 3 TSL hazards recorded | `72a47b7c` |
| `08b` production flip | `BattleRenderer` internals → `PhotorealBattleWorld` (API unmoved, −371 lines); ZERO re-blesses; 3.31/3.59 ms (~25% faster than bespoke); play-tested headful | `835bd4c3` |
| `09` lighting core | physical sun+IBL+ACES from the ONE env owner (+`physical` block, +noon preset); neutral albedos engine-wide; 9 re-blesses; 3.27/2.75 ms (frame-time-free) | `93943c21` |
| `10a` physical sky | `SkyModel` sky-view LUT baked by FRAGMENT pass (tier `skyview-fragment-lut`, same tier on SwiftShader); equirect stand-in DELETED; zero re-blesses | `ef2c491d` |
| `10b` aerial owner | `aerialPerspective.ts` on `scene.fogNode` is THE one haze source; `THREE.Fog` + inline hazes DELETED; ground-focus depth + true view-direction in-scatter | `027efabe` |
| `10c` preset moods | overcast litmus PASSES (lum 191/sat 6.2 vs ref 176/7.6); `SUN_TOWARD_VIEW` π/2→π + golden elev 0.35; ~70 re-blesses across 10b+c; 3.14/3.18 ms | `04c5dcb4` |
| `11` CSM sun shadows | `shadowRig` seam — **three CSMShadowNode addon** (3×2048 from the live camera3d projection) + `'single'` SwiftShader tier asserted by name; blob-shadow decals DELETED; ground receives-not-casts (recorded); ZERO existing re-blesses + 6 new baselines; **5.86/6.39 ms (crowd shadow cost +2.7/+3.2)** | `f469a697` |
| `12b` photoreal sea PBR | spectral/IFFT spike REMOVED; Gerstner TSL is the only tier; sea reflects the SkyModel LUT via standard PBR + GGX sun glint; normal detail fades 720→2300 m (0.92→0.18); SwiftShader `photoreal-sea/sea-horizon` green | `d1531a82` |
| `12c` photoreal sea foam | whitecaps gated by Gerstner crest height + slope agitation + speckle; `sea-mid` crop foamFraction 0.0838, not blanket; hardware baseline + SwiftShader green | pending |

### Active blockers / coordination warnings

- **`specs/battle-map-reference` runs in a PARALLEL session (David).** Division
  of labor: that spec OWNS terrain relief/cliffs/grass-foliage LOOK + scenery
  composition + the composed master-shot gate (slice `13` here is RE-SCOPED to
  substrate seams only); THIS ladder owns lighting (`09`), sky/aerial (`10`),
  CSM (`11`), sea (`12`), soldiers/LOD/culling (`14`), post (`15`). File
  reservations: `battle/{terrain,foliage}Layer*` are theirs;
  environment/sky/shadow/sea/crowd files are this ladder's. Rebase frequently;
  if origin/main moved, merge + re-gate before pushing — never force-push.
- **`specs/battle-atmosphere` is RETIRED** (absorbed: presets/sky/aerial →
  `09`/`10`/`12`; its reference images live in this spec's `assets/`).
- **`three` is PINNED at `0.185.1`** until the ladder closes (`17`). An upgrade
  is its own reviewed change with the full suite + perf gate as harness.
- Env/weather presets live in `packages/game-renderer/src/environment/environment.ts`
  (`CIVSIM_ENVIRONMENTS`/`BATTLE_ENVIRONMENTS`) — the ONE preset owner every
  ladder slice extends, never forks.
- The photoreal north star is **`assets/target-battle-map.png`** + the
  `aesthetics` skill (Bronze-Age Aegean / Total War Saga), NOT generic PBR —
  the `compare-screenshots` target for every photoreal surface.

### Global TODO checklist

- [x] `01`–`05b` — camera spine (see ledger) **SPINE COMPLETE**
- [x] `04f` — standing 30k perf gate (`bun run --cwd web perf:30k`, hardware-only)
- [x] `04b` — **cancelled** (superseded; see ledger)
- [x] `06` — substrate bake-off → **three.js WebGPU + TSL**
- [x] `07` — photoreal foundation (`packages/photoreal-renderer` + harness re-tooling)
- [x] `08` — battle world adoption (`08a` parity world + `08b` atomic production flip)
- [x] `09` — lighting core (physical sun + IBL + ACES; noon preset; neutral albedos)
- [x] `10` — physical sky + aerial ONE owner + preset moods (four presets)
- [x] `11` — CSM sun shadows via `shadowRig` (addon verdict); blob-shadow
      stand-ins deleted (`slices/11-csm-shadows.md`)
- [ ] `12` — photoreal sea: Gerstner-vs-IFFT spike → surface/foam/shore/glint;
      `seaLayer` owner (`slices/12-photoreal-sea.md`) **← 12b+c done; NEXT 12d**
- [ ] `13` — photoreal terrain + foliage, RE-SCOPED to substrate seams
      (`slices/13-photoreal-terrain-foliage.md`; the LOOK is battle-map-reference's)
- [ ] `14` — photoreal soldiers: materials, 30k LOD/impostors + union-frustum
      culling, contact AO (`slices/14-photoreal-soldiers.md`)
- [ ] `15` — post chain: bloom + refine; ACES-vs-AgX decided here
      (`slices/15-post-chain.md`)
- [ ] `16` — campaign photoreal: `16a` register GO/NO-GO + flip, chart grade,
      entities, territory/labels (`slices/16-campaign-photoreal.md`)
- [ ] `17` — legacy deletion sweep + close-spec (`slices/17-legacy-sweep-close.md`)

(`12`/`13`/`14` are parallelizable in worktrees after `11`; `12d` continues in `seaLayer`.)

**Instruction to the next agent:** keep this section COMPACT — update the status
paragraph, pickup point, ledger (one line per newly-done slice), and checklist;
per-slice evidence/decisions go in the slice file, never accreted here.

## Human decisions already locked (do not re-litigate)

From the interview:
- **One real 3D perspective camera engine-wide**, battle AND campaign.
- **Zoom-coupled FOV** (near-top-down out → cinematic vista in). Preserving today's
  ortho tactical legibility is **not** required — "playable" is the only bar. If
  faithfully emulating ortho over-complicates the rig, go full perspective.
- **Photorealism is in scope in this feature** (not a follow-on): PBR, real
  lighting/shadows, photoreal water/terrain/soldiers/campaign — in the Bronze-Age
  Aegean register, matched to `target-battle-map.png`.
- **All visual baselines re-bless deliberately.** Accepted.
- **SIM IS UNTOUCHED.** Presentation + input only. No changes to `crates/**`,
  pathing, ranges, or `terrainHeightAt`. Hard firewall.

## The master architectural finding (why this is sliceable)

100% of GPU projection funnels through **two WGSL functions** in
`packages/renderer-core/src/cameraWgsl.ts` — `projectGround(world2, d)` and
`projectWorld3d(world3, d)` (plus `cameraSpace`, `perspectiveDepth`, and the
`worldDepth3d` / `civsim*WorldDepth3d` painter-depth helpers). Every one of ~20
passes (`battle/*`, `campaign/*`, `water/*`, `skinnedPipeline`, `soldierShadowPass`,
`frameShell` builtin terrain/marker shaders, `fixtures/nested3d`) calls exactly
those. No pass builds its own projection. The CPU mirrors it in three places:
`cameraUniform.ts` (`worldToScreen` / `world3dToScreen` / `screenToWorld`),
`web/src/shared/camera.ts` (the `Camera` class), and `battle/pickingDebug.ts`.

**The conversion as SHIPPED (corrected 2026-07-02 — supersedes the original
body-rewrite plan):** grow the camera uniform *additively* (keep the 12 legacy
scalars so un-migrated passes stay byte-identical; append `viewProj`, `invViewProj`,
`eye`, `near/far`) and add ONE new WGSL projector, `projectReal(world)`. The
original plan — rewrite the *bodies* of `projectGround`/`projectWorld3d` — was
**abandoned during `04a`**: battle and campaign compile the same WGSL source but
must flip at different times, so a body rewrite would have flipped campaign
prematurely. What shipped instead: **each pass takes an opt-in `real` compile flag**
(switches its WGSL to `projectReal` + its depthStencil to
`gpuReverseZDepthStencil`), and **each shell takes an opt-in `reverseZ` flag**
(`depth32float`, clear 0). Battle set them in `04a`; campaign sets them in `05`; a
renderer's world-depth passes flip together (atomic shared depth buffer). The
per-pass flag is deliberate, *temporary* migration scaffolding — when `05` lands and
nothing consumes the legacy path, the flags and the legacy fns
(`projectGround`/`projectWorld3d`/`worldDepth3d`/`civsim*WorldDepth3d`) are deleted
and `projectReal` becomes the one canonical projector. The CPU trio delegates to
`camera3d` (done for battle in `04a`). The ladder proved matrices + reverse-Z on
**one isolated surface (the water route)** before any fan-out — that keystone is
what made `04a` mechanical.

Verified current facts: `struct Camera` is 12 floats; `zoom` = pixels/world-unit;
`perspectiveDepth(ry)=max(0.32,1+ry*perspective)`; depth written is a painter value
keyed to world-Y (`civsimBattleWorldDepth3d = 0.50 + y*0.0012 − z*0.0030`), format
`depth24plus`, clear `1`, compare `less`/`less-equal` (`pipelineContracts.ts
::gpuWorldDepthStencil`). Soldiers are real 3D VAT-skinned meshes standing in
world-Z. Depth/overlay ordering is centralized in `depthContract.ts`,
`pipelineContracts.ts`, `renderGraph.ts`/`frameGraphContract.ts`.

## Verification environment (plan around these)

- **Headless WebGPU is NOT blank** — `web/scene.mjs` launches Chromium under
  **SwiftShader** (`--use-vulkan=swiftshader --use-angle=swiftshader
  --enable-unsafe-swiftshader`) when `VERIFY_GPU=1`. Treat SwiftShader as the
  **weak-GPU CI proxy**: it renders correctness fine (incl. `depth32float` +
  reverse-Z), but CSM arrays, sky-LUT compute, and any IFFT compute are a
  SwiftShader risk → use it to *enforce* capability fallbacks; run **perf gates on
  hardware only** (`VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome`).
- Routes: `apps/renderer-lab/src/router.ts`. Scenes: `web/scenes/**`. Baselines:
  `web/shots/**` via `snapCheck`. **Seam unit tests: `bun run --cwd web test:unit`**
  (node:test over `web/tests/*.test.ts` — the runner this spec's gates live in;
  wired into root `test:web` in slice `01`). Vitest (`bun run --cwd web test`) owns
  the React component tests only. Rust: `cargo test --workspace`. Animated gates
  snap at a fixed `shell.setTime(t)`.
- **House style trap:** do NOT run `bunx oxfmt` — it fetches the wrong formatter
  version (double-quote defaults) and cannot reach `packages/`/`apps/`. Match the
  single-quote 2-space style of sibling files by hand. The repo format gate is red
  on committed HEAD (pre-existing); don't chase it.

## Performance floor (hard requirement)

The battle renderer must sustainably render **30,000 soldiers** plus **countless
trees and grasses**, with **healthy margin above 30k** — the frame budget is judged
*with* the full crowd and dense foliage on screen, not a bare field. The locked
budget is **~33 ms/frame (30 fps) on the hardware adapter (this Mac's GPU)**. This is
a first-class acceptance criterion, not a "later optimization":

- **Standing perf gate (hardware only):** a battle scene at **30k+ soldiers + dense
  tree/grass fill** must hold **≤ ~33 ms/frame** (`shell.stats().gpuTimeMs`,
  `VERIFY_GPU_ADAPTER=hardware`). Author it as a scene the moment the battle seam
  flips (`04`) and keep it green through every photoreal slice — each new
  material/shadow/foliage pass re-runs it. SwiftShader is not a perf oracle.
- **Substrate veto (`06`):** the crowd-perf probe is sized at **30k+ soldiers with
  foliage**, not a token few thousand. A substrate (bespoke or three.js/TSL) that
  cannot hold **~33 ms** at that scale on hardware is **rejected** regardless of how
  good it looks. This is the axis most likely to decide `06`.
- **Design consequence:** favors GPU-driven instancing/indirect draw, aggressive
  distance LOD + impostors for both soldiers and foliage, and frustum/So culling that
  a real perspective camera makes *cheaper* (a true frustum culls the off-screen
  world the fake ortho could not). Foliage is instanced/indirect from the start, not
  retrofitted.

## Slice graph

```
01 camera3d math lib (pure, no GPU)                          ✅ done
      │
02 real depth + real projection proven on WATER route        ✅ done (keystone; dome gone)
      │
03 zoom→camera rig (pure curve, battle + campaign)           ✅ done
      │
      ├── 04a FLIP battle + 3D ray-cast picking               ✅ done (per-pass `real` flag)
      │        │
      │        ├── 05 FLIP campaign + collapse legacy projector   ✅ done (05a + 05b; SPINE COMPLETE)
      │        ├── 04f 30k-soldier + foliage perf gate            ✅ done (standing; GREEN ~7.5× in budget)
      │        └── 04b battle polish                              ❌ cancelled (superseded)
      │
06 PHOTOREAL SUBSTRATE BAKE-OFF                               ✅ done — VERDICT:
      │                                                        three.js WebGPU + TSL
   ===== PHOTOREAL LADDER (authored 2026-07-02 against the 06 verdict) =====
      │
07 substrate foundation + harness re-tooling                  ✅ done
      │  packages/photoreal-renderer · spike promoted/deleted
      │
08 BATTLE WORLD ADOPTION (the seam flip)                      ✅ done (a + b)
      │  a: parity battle world in the lab (/renderer/photoreal-battle, overlay ports)
      │  b: ATOMIC production flip (BattleRenderer internals; no runtime flag)
      │
09 lighting core (physical sun + IBL + ACES from CIVSIM_ENVIRONMENTS;   ✅ done
      │            neutral albedos; noon preset added — roster of 4)
      │
10 physical sky + atmosphere (a: Hillaire sky · b: aerial-perspective ONE owner ·   ✅ done
      │                        c: presets through the sky model)
11 CSM sun shadows (blob-shadow stand-ins deleted; shadow cost +2.7/+3.2 ms)   ✅ done
      │
      ├── 12 photoreal sea      a: Gerstner-vs-IFFT spike · b: PBR surface · c: foam ·
      │                         d: shore blending · e: glint (pairs with 15a)
      ├── 13 terrain + foliage  a: ground PBR splat · b: grass at density (03b1
      │                         contract) · c: scenery/cliffs · d: compose vs target
      ├── 14 photoreal soldiers a: PBR materials · b: 30k LOD/impostors (absorbs 04e) ·
      │                         c: grounding AO
      │     (12/13/14 parallelizable in worktrees NOW; 12b needs 10's sky)      ← NEXT: 12
      │
15 post chain (a: bloom · b: refine; ACES-vs-AgX identity decided here)
      │
16 campaign photoreal (a: register GO/NO-GO spike + parity flip — campaign byte-
      │                identity deliberately ends here IF go · b: chart terrain/sea +
      │                painted grade · c: entities/scenery · d: territory/labels)
      │
17 legacy deletion sweep + close-spec (bespoke world passes, gerstnerField/
        WaterPlanePass WGSL, frameShell scope-down, grep-audit; refactor-clean +
        review + close-spec)
```

**Milestone after `05`:** entire engine on a real perspective camera, sim
untouched, playable. **Milestone after `08b`:** three.js owns battle world rendering
in production at parity — every later look slice lands in the real game. Everything
from `09` is photorealism, one visual variable per sub-slice with a named crop.

## Firewalls & "must stay green" (every slice)

- **SIM untouched.** No edits under `crates/**`; `cargo test --workspace` green at
  every slice. No change to `terrainHeightAt`, `heightField`, pathing, ranges,
  `pickUnit`. The `battle-terrain-elevation` seating gate (soldiers seat
  byte-identical, `match=true`) is the tripwire that proves the heightfield firewall.
- **Picking moves to a 3D ray-cast but keeps its signature** — `screenToWorld(px,py)
  → (wx,wy)` becomes a ray→ground-plane intersection; `pickUnit(wx,wy)` unchanged.
- **Depth-convention change is the deepest risk.** Every consumer of the shared
  projection/depth is in the blast radius (enumerated in `04`). The flip is
  centralized, so passes move together; per-pass verification is the fan-out. `02`
  isolates the reverse-Z proof to the water route first.
- **All baselines re-blessed deliberately**, never blanket-overwritten. Diff each.
- **MSAA-safe:** every new/flipped bespoke pipeline keeps
  `gpuMultisample(shell.sampleCount)`; from `08b` the photoreal battle world's AA is
  owned by three (`antialias`) and the bespoke invariant retires surface-by-surface.

## Clean architecture — end-state invariants (non-negotiable)

The finished renderer must read as if it were **designed for a real 3D perspective
camera from scratch** — not the 2.5D engine with a perspective adapter bolted on. The
additive-uniform / legacy-signature scaffolding in `02`–`04` is an explicit
**short-lived migration seam**, and it has a removal condition: the instant both
battle (`04`) and campaign (`05`) flip, *nothing* consumes the legacy path, so the
vestiges are deleted **at the end of `05`** — not carried to a distant cleanup slice.
No dual projection path survives the spine. Enforced invariants (each is a single
owner; divergence from these is the bug class this whole feature exists to kill):

- **Projection/camera has ONE owner: `camera3d`.** The GPU seam is a thin
  `viewProj * world` matmul; the CPU side delegates to `camera3d`. No pass builds its
  own projection; no `cosP`/`perspective`/`zoom`-as-pixels/`perspectiveDepth` fake
  fields remain; the real projector takes the canonical name (`projectGround`/
  `projectWorld3d` become the real ones, or are renamed — but there is exactly one).
  The `normalizedDepth` argument and `worldDepth3d`/`civsim*WorldDepth3d` painter
  helpers are **deleted**, not left returning 0.
- **Legacy-collapse inventory (check BEFORE deleting the legacy projector).** Known
  consumers still on the legacy path after `04a` — each must be flipped/migrated (or
  named an exception) before `projectGround`/`projectWorld3d` can be deleted, else
  those routes break silently: the lab **`routeBattleLive` + `pickingDebug.ts`**
  (`cssToBattleWorld`/`RendererBattlePickCamera` — the lab pick harness, deliberately
  left legacy in `04a`), **`fixtures/nested3d.ts`**, and any renderer-lab route whose
  shell never opts into `reverseZ`. Grep for every `projectGround`/`projectWorld3d`/
  `worldDepth3d`/`civsim*WorldDepth3d`/`gpuWorldDepthStencil` call site and account
  for each. **Intentional exception: `minimapPass`** — it uses its own top-down 2D
  `project()`, not the world camera, and stays 2D by design (record it, don't flip it).
- **Depth convention has ONE owner: the depth contract** (`depthContract.ts` +
  `pipelineContracts.ts`). One format, one Z direction, one clear value across the
  engine.
- **Environment/lighting has ONE owner: `CIVSIM_ENVIRONMENTS`**
  (`packages/game-renderer/src/environment/environment.ts`). Photoreal lighting
  *extends* that owner; it must NOT introduce a parallel lighting-preset system.
- **Distance haze/atmosphere collapses to ONE owner.** Today `haze`/`aerial`/`dust`
  is duplicated inline across `frameShell` terrain, `groundPass`, `horizonPass`, and
  water. The aerial-perspective slice (`10b`) **replaces all of them** with a
  single aerial-perspective source — a net deletion, not a fifth copy.
- **Water stays behind ONE seam.** Bespoke: `WaterFieldSource`. Photoreal battle
  (post-`12`): `seaLayer`'s displacement seam. Gerstner and any revived IFFT are
  swappable implementations of that seam, never parallel code paths.
- **Foliage (trees + grass) has ONE instanced/indirect owner**, shared with the LOD
  system — not per-species bespoke passes accreted over time.

Make ownership visible: publish the active projection/depth/environment identity in
`__rendererLabStats` so a test can prove every surface reports the *same* source of
truth (divergence was the original bug). If any slice starts widening into unrelated
behavior, slice it (`refactor-clean`): land the shared contract first, port consumers
in reviewable passes, then delete the stale path in the same milestone.

## Photoreal ladder invariants (07–17)

**Single owners** — every ladder slice must leave exactly one owner per concept;
`__rendererLabStats` identity fields make the ownership assertable:

- **Projection:** `camera3d`. `cameraBridge.applyCamera3d` is the ONLY way a three
  camera gets posed; `web/tests/photorealCamera.test.ts` pins the two matrix stacks
  equal.
- **Environment presets:** `CIVSIM_ENVIRONMENTS`/`BATTLE_ENVIRONMENTS` in
  `packages/game-renderer/src/environment/environment.ts`. New physical fields are
  ADDED there, never forked into a parallel table.
- **Water (battle, post-`12`):** `seaLayer.ts` — one seam, swappable displacement
  source (Gerstner / IFFT), never parallel water paths.
- **Atmosphere/aerial:** `10b`'s `aerialPerspective.ts` — one scatter/extinction
  source applied to every world surface; no material adds its own haze.
- **Crowd LOD policy:** `packages/crowd-runtime/src/lod.ts` semantics — `14b`
  consumes them; the three crowd never grows a second policy.
- **Stats seam:** the `__rendererLabStats` shape, backed by `renderer.info` +
  `trackTimestamp`, publishing `{ substrate, projection, environment }` identity.
- **Determinism:** animation keys off `PhotorealWorld.setTime` + seeded RNG; the TSL
  `time` node is banned in package code.
- **Version pin:** `three@0.185.1` until `17` closes the ladder.

**Scaffolding ledger** — everything that exists only to die, each with its named
deleter (a ladder slice is not done while its ledger row is still alive):

| Scaffold | Born | Deleted by |
|---|---|---|
| Spike: `web/three-{water,pbr,crowd}.html`, `web/src/three-probe/*`, `apps/renderer-lab/src/bakeoffProbes.ts` + `/renderer/{pbr-probe,water-pbr,crowd-perf}`, `web/bakeoff-shot.mjs`, `web/shots-bakeoff/` | 06 | **07** (promoted or deleted; nothing spike-shaped survives) |
| `web/src/three-probe/three-shims.d.ts` | 06 | **07** (`@types/three` dev-only) |
| ~~Procedural equirect `scene.environment` stand-in~~ | 07/09 | **DELETED at 10a** (SkyModel's sky-view LUT feeds background + IBL) |
| ~~Parity `THREE.Fog` haze stand-in + per-material `Aerial stand-in` albedo mixes~~ | 08a/09 | **DELETED at 10b** (`atmosphere/aerialPerspective.ts` on `scene.fogNode` is the ONE owner) |
| ~~Blob-shadow parity stand-in (decal replicas: soldier + scenery)~~ | 08a | **DELETED at 11** (real CSM via `battle/shadowRig.ts`) |
| Parity Gerstner-family sea shading in `seaLayer` | 08a | **12b–d** (photoreal surface; the seam survives) |
| Battle instances of bespoke world passes orphaned at the flip (`BattleGroundPass`, `BattleGrassPass`, `BattleHorizonPass`, `BattleGroundCuePass`, `BattleEffectLinePass`, inline `BattleTrianglePass`, battle `SkinnedCrowdPipeline`/`SoldierShadowDecalPass`) — classes live on for campaign/lab | pre-existing | **08b** orphans; **17** deletes (per `16a`'s campaign ruling) |
| Bespoke campaign world passes + `frameShell` world machinery + `WaterPlanePass`/`gerstnerField.ts` WGSL | pre-existing | **16a** orphans (if GO) → **17** sweeps; if NO-GO, recorded exception |

**Standing gates on EVERY slice `08b`→`17`** (each slice file references this list;
don't restate it, run it):

1. `cargo test --workspace` — sim firewall; zero diffs under `crates/**`.
2. `bun run --cwd web test:unit` (incl. the `photoreal*.test.ts` seam pins).
3. Full battle scene suite under SwiftShader, incl. the `battle-terrain-elevation`
   seating tripwire `match=true`.
4. Campaign scene suites **byte-identical until `16a`** (then deliberately
   re-blessed).
5. **Hardware perf gate:** `VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware
   VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-perf-30k` — 30k+ soldiers +
   dense foliage, median ≤ ~33 ms **with every photoreal pass landed so far
   enabled**. Record the numbers in the slice file each run — this is the ladder's
   frame-time ledger (06 baseline ≈ 6 ms; `11` and `13b`/`14b` are the expected
   pressure points).
6. `screenshot-critique` as the required LAST visual check on every shot;
   `compare-screenshots` whenever a target exists (`assets/target-battle-map.png`,
   the aesthetics references, or the pre-slice look).
7. One visual variable per visual slice, with its named crop; all re-blessed
   baselines diffed individually, never blanket-overwritten.
8. SwiftShader is the capability-fallback enforcer, never a perf oracle — every
   adapter-gated feature (sky LUT `10`, CSM `11`, IFFT `12`) ships a fallback tier
   inside its seam, and the SwiftShader scene asserts *which tier ran* via the stats
   identity.

## Standing verification gates (every visual slice)

- **Unit at the seam** (cheap, no GPU): `camera3d` round-trips; `cameraUniformData`
  legacy-byte identity; picking round-trip; LOD monotonicity.
- **Scene/screenshot** under SwiftShader, ONE named visual variable + crop/mask per
  slice. `screenshot-critique` (unprimed second-eyes) is a **required last check**
  on any shot. When a slice has a target to compare against (a prior look it
  changes, or `target-battle-map.png`), `compare-screenshots` judges
  candidate-vs-target ("less wrong", not pixel-match).
- **Perf** (hardware adapter only): `shell.stats().gpuTimeMs` budget per route.
- **Human eyeball** at each checkpoint — **non-blocking** (open with
  `preview-shots`, ~5 min window, then decide on the evidence, record the call,
  close the shots, proceed).

## Biggest risks → how the ladder retires them early

1. **Matrix pipeline + real depth correctness** (could sink everything) → retired in
   `02` on the isolated water route, zero gameplay-legibility risk, and it kills the
   exact motivating symptom (dome→flat).
2. **Engine-wide seam flip breaking 20 passes at once** → mechanical *because* the
   seam is centralized; happens in `04` only after `01`/`02`/`03` are green; battle
   (`04`) and campaign (`05`) flip separately.
3. **Losing tactical legibility under perspective** → `03` makes the rig a pure,
   tunable, testable curve with a genuine near-top-down end; `04` gates it with a
   human play-test; "playable" is the explicit bar.
4. **"Make it photoreal" fog** → never one slice; `07`–`11` are shared foundations,
   every surface (`12`–`16`) is one visual variable per sub-slice with its own crop
   and critique/compare gate, against `target-battle-map.png`.
5. **Software-rasterizer CI hiding GPU-only failures** → SwiftShader is the
   weak-GPU proxy that enforces fallbacks (CSM/sky/IFFT); look + perf validate on
   hardware.
6. **Substrate misjudgment (bespoke vs three.js)** → retired in `06` by an
   evidence-based bake-off before any photoreal surface is committed. **Resolved:
   three.js WebGPU + TSL.**

## Known unknowns → where each resolves

- Reverse-Z + `depth32float` under SwiftShader → `02` (before any fan-out).
- One FOV/pitch curve keeps formations legible? → `03` curve + `04` play-test;
  fallback is a TW-style "RTS mode" FOV clamp at mid-zoom.
- Do soldier meshes/decals break under perspective? → `04` (upright/sort) + `11`
  (decal-shadow retirement) + `14b` (LOD).
- Photoreal substrate (bespoke vs three.js/TSL) → `06`. **Resolved: three.js.**
- Gerstner vs IFFT at a true horizon → `12a` technique spike; Gerstner is the
  guaranteed fallback. The current production water is a bespoke analytic Gerstner
  field (`packages/game-renderer/src/water/gerstnerField.ts`). The IFFT candidate is
  the upstream repo
  **[`Spiri0/Threejs-WebGPU-IFFT-Ocean`](https://github.com/Spiri0/Threejs-WebGPU-IFFT-Ocean)**
  (WebGPU compute, JONSWAP→IFFT, storage-buffer cascades). The water spec killed IFFT
  under the *fake* 2.5D camera because dispersion was invisible — that rationale is
  **void twice over**: the real horizon exists since `02`, and `06` picked three.js,
  so the old "replicate, don't port" caveat is dissolved — **porting is on the
  table** at `12a`.
- CSM / sky-LUT feasibility on SwiftShader → `10`/`11` verify; adapter-scaled
  fallback tiers inside their seams.
- Camera uniform buffer growth/alignment (12 → ~48+ floats, mat4 16-byte align) →
  `02` layout assertion test.

## Source material

Draft research (all three drafts): [WebGPU reversed-Z sample](https://webgpu.github.io/webgpu-samples/samples/reversedZ/),
[Reed — Depth Precision Visualized](https://www.reedbeta.com/blog/depth-precision-visualized/),
[NVIDIA depth precision](https://developer.nvidia.com/blog/visualizing-depth-precision/),
[Cascaded Shadow Maps (NVIDIA)](https://developer.download.nvidia.com/SDK/10.5/opengl/src/cascaded_shadow_maps/doc/cascaded_shadow_maps.pdf),
[JolifantoBambla/webgpu-sky-atmosphere (Hillaire LUTs, raw WebGPU)](https://github.com/JolifantoBambla/webgpu-sky-atmosphere),
[Spiri0/Threejs-WebGPU-IFFT-Ocean (three.js/TSL — portable since the `06` verdict; judged at `12a`)](https://github.com/Spiri0/Threejs-WebGPU-IFFT-Ocean),
[Total War tactical camera](https://lensviewing.com/total-war-camera-angles-up-on-zoom/).

Photoreal ladder research (union of the `07`+ drafts; per-slice pointers live in the
slice files): [Hillaire, *A Scalable and Production Ready Sky and Atmosphere
Rendering Technique*, EGSR 2020](https://sebh.github.io/publications/egsr2020.pdf) +
[sebh/UnrealEngineSkyAtmosphere](https://github.com/sebh/UnrealEngineSkyAtmosphere),
[TSL wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language),
three.js `webgpu_*` examples (sky, custom fog, shadowmap CSM, ocean, postprocessing
bloom/TRAA, instancing), `CSMShadowNode` addon source, Tessendorf *Simulating Ocean
Water*, Ghost of Tsushima grass (GDC 2021), octahedral impostor notes.
