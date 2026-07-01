# Slice 06 — Photoreal substrate bake-off (bespoke WGSL vs three.js/TSL)

## Contract unlocked

An **evidence-based verdict** on which substrate the photoreal layer (`07`+) is
built on: keep the bespoke WGSL renderer, or adopt **three.js WebGPU + TSL** for
materials/lighting/sky/ocean/post. This retires the biggest strategic unknown before
any photoreal surface is committed. It does **not** touch the camera spine — that is
already settled as bespoke (`01`–`05`), because the conversion is a small centralized
seam change and the whole verification harness depends on the bespoke renderer. The
three.js question is *only* about the photoreal layer.

**Gates on `04a`** (done): the bespoke prong's 30k crowd probe must run on the REAL
camera, or the comparison is 2.5D-bespoke vs 3D-three.js apples-to-oranges. It can
run in parallel with `05` and the `04b`/`04f` follow-ups (own worktree — it adds
three.js deps and throwaway prototypes).

## Why this is a real question (not a foregone conclusion)

Both arguments are about **end states**, per the anti-incumbency rule below — not
about what exists today:

- **For three.js/TSL:** the photoreal track is the genuinely large part — PBR
  BRDF+IBL, cascaded shadow maps, Hillaire sky/aerial LUTs, FFT ocean, post
  (bloom/DOF/TAA). three.js ships most of it; TSL gives node materials + compute +
  a large maintained example ecosystem (the `Spiri0` ocean is three.js/TSL).
- **For bespoke:** living inside three's abstractions has a steady-state cost —
  "raw WebGPU inside three.js" works (`renderer.backend.device`) but fights three's
  resource management and its WebGPU internals churn between versions; behavioral
  introspection (`__rendererLabStats`-style seam publishing) is harder against a
  more opaque renderer; and a bespoke photoreal layer has clean seams to build on
  (material bind groups already carry albedo/normal/orm/mask; the water field is
  isolated behind `WaterFieldSource`; the sun is in the camera uniform).

## API seam / what to build (three parallel probes, throwaway)

Build each in an **isolated worktree/branch** — this is a spike, not production.
Same target for both substrates so the comparison is apples-to-apples.

1. **Water vista** — the `02` open-sea plane with a real horizon, shaded PBR:
   Fresnel sky reflection + sun specular + depth turbidity. Bespoke prong = extend
   `waterMaterialWgsl`; three.js prong = a TSL water material sampling a TSL sky.
2. **PBR sphere grid** — the canonical metal×roughness validation under a moving
   sun. Bespoke = a new `pbrWgsl.ts`; three.js = `MeshStandardNodeMaterial` / TSL.
3. **Crowd-perf probe at the real floor — 30k+ soldiers + dense foliage** (reuse
   `crowd-runtime` instance data; add instanced trees/grass fill), rendered each way,
   measuring frame time on **hardware**. The requirement is **30,000 soldiers plus
   countless trees/grasses with healthy margin above 30k** — size the probe there,
   not at a token few thousand. **This is the probe most likely to veto a substrate**
   — the bespoke crowd pipeline is finely tuned (LOD tiers, hysteresis, per-class VAT,
   faction masks); three.js `BatchedMesh`/instanced-skinning or VAT-in-TSL, plus its
   foliage instancing, must hold the budget at 30k+. A substrate that misses budget
   at this scale is **rejected outright**, regardless of look. Exercise GPU-driven
   instancing/indirect + distance LOD/impostors + real-frustum culling on both prongs
   (a true perspective frustum culls off-screen world the fake ortho could not).

## What the human can run / see

Two `/renderer/*` routes (or a side-by-side HTML viz in `visualizations/`): the same
water vista + sphere grid rendered bespoke vs three.js/TSL, plus a printed
frame-time table for the crowd probe at matched N.

## The decision is the deliverable — make it yourself, then re-invoke `/feature-slicing`

This slice's output is **a substrate verdict, not a green test**. The human has
delegated the call: **you (the implementing agent) run the three probes, apply the
decision procedure below, record the verdict + evidence in this file and the README's
Next Agent Prompt, and then re-invoke `/feature-slicing`** with the bake-off results
so slices `07`+ are authored against the chosen substrate. You have every tool you
need (Bash, worktrees, the scene harness, `compare-screenshots`, `screenshot-critique`,
hardware perf via `VERIFY_GPU_ADAPTER=hardware`). Do **not** block on human sign-off;
this is an autonomous decision. (You may open the side-by-side with `preview-shots`
for a ~5-min courtesy window, but decide on the evidence regardless.)

### Decision procedure (apply in order)

The **camera spine is bespoke regardless** — this decision is only the *photoreal
layer's* substrate.

1. **Hard perf gate (veto).** At **30,000 soldiers + dense trees/grass, on the
   hardware adapter (this Mac's GPU)**, the substrate must render within **~33 ms/frame
   (30 fps)** with headroom above 30k. A substrate that misses this at the real floor
   is **rejected outright**, whatever its look. If *both* pass, continue; if only one
   passes, it wins by veto (record the other's frame time). Record the frame-time
   table + soldier/foliage counts.
2. **Look-parity gate.** Each surviving substrate's water vista + PBR spheres must be
   judged *acceptable* against `target-battle-map.png` (Bronze-Age Aegean register)
   via `compare-screenshots` (candidate-vs-target, "less wrong") + `screenshot-critique`
   (unprimed). A substrate that can't reach an acceptable look is rejected. If both are
   acceptable, continue.
3. **Weighted score on the remainder** (only when both survive 1 & 2):
   - **Harness survival — heavily weighted, but tradeable (NOT a veto).** Does the
     verification style (seam unit tests, `__rendererLabStats` behavioral
     publishing, screenshot routes) survive on this substrate, or go opaque? Judge
     it **forward-looking** — "can we verify photoreal work this way from here on?"
     — never as sunk cost in the existing harness. A big loss is a large demerit,
     but a decisive look/perf/velocity win can outweigh it, and re-tooling the test
     approach is on the table.
   - **Interop cost** — for three.js, how painful is keeping the
     marker/minimap/cue/effect/picking passes alongside three's renderer. Score the
     *steady state* (what living with the composition is like), not the one-time
     migration.
   - **Complexity/LOC & velocity** — rough size of each prong and expected speed of
     authoring `07`+ on it (three.js's ecosystem + TSL examples count here).
   - **ANTI-INCUMBENCY RULE (human ruling, 2026-07-02): assign ZERO weight to the
     bespoke renderer being the incumbent.** That it already exists, already works,
     or already proved the real camera in `01`–`05` is NOT an argument for keeping
     it; migration effort is NOT a scoring axis — coding-agent budget makes tech
     swaps cheap and the project is young. "We'd have to rewrite X" never scores a
     point for bespoke. Score only the END STATES — what each substrate is like to
     build photoreal on, verify, and run at 30k — objectively.
4. **Tie-break (explicit human preference): on a near-tie, choose three.js/TSL.**
   The deciding rationale is **community support**: the ecosystem of maintained
   examples and implementations (ocean, sky, PBR, post) that three.js brings to
   every future photoreal problem. Bespoke wins a near-tie only if it is *clearly*
   ahead on the weighted axes.

Write the verdict as: chosen substrate · the perf numbers · the parity verdict · the
weighted-axis reasoning · and (if three.js) the harness re-tooling plan. Then call
`/feature-slicing` with this file's results to author `07`+.

## VERDICT (decided 2026-07-02, autonomous per the procedure above)

**Chosen substrate for the photoreal layer (`07`+): three.js WebGPU + TSL.**
The camera spine (`01`–`05`) stays bespoke, as locked above: three.js is fed the
same `camera3d` orbit params (z-up, `camera.up=(0,0,1)`) and the spike proved the
framing matches exactly.

### Evidence — what was built (all spike, this branch)

- **Bespoke prong** (`apps/renderer-lab/src/bakeoffProbes.ts`, routes registered
  in the lab router): `/renderer/pbr-probe` (49-sphere metal×roughness grid, new
  minimal PBR WGSL + procedural sky env), `/renderer/water-pbr` (production
  Gerstner field re-shaded PBR: Schlick Fresnel sky reflection, GGX sun specular,
  depth turbidity, `?agitation=` production dial), `/renderer/crowd-perf`
  (30,400 VAT-skinned soldiers via the production `SkinnedCrowdPipeline`
  `real: true`, per-instance projected-size LOD through the production tiers,
  CPU frustum cull, + `BattleGrassPass` 20k tufts / 200k blades +
  `CampaignSceneryPass` 3k trees + `BattleGroundPass`, `?cam=mid|vista`).
- **three.js prong** (`web/three-{water,pbr,crowd}.html` +
  `web/src/three-probe/*`, three@0.185.1): custom TSL water (4-wave displaced
  plane, analytic per-fragment normals, Fresnel sky reflection, sun streak,
  turbidity; addons `WaterMesh`/`SkyMesh` rejected — WaterMesh needs an example
  texture asset npm doesn't ship); `MeshStandardNodeMaterial` sphere grid with a
  procedural equirect float `DataTexture` as `scene.environment` (WebGPURenderer
  PMREMs it internally — real IBL for free); crowd = **honest VAT skinning in
  TSL** (`textureLoad` of the same placeholder VAT bake, same class-0 mesh, same
  30,400-soldier formation) + 200k instanced grass blades + 3k instanced trees,
  **no LOD, no culling — brute-force full meshes (~13M tris), 6 draw calls**.
- **Measurement harness:** `web/bakeoff-shot.mjs` (playwright; SwiftShader or
  hardware channel-chrome headful; `UNCAP=1` adds `--disable-frame-rate-limit`
  since a 120 Hz display pins every sub-8.3 ms renderer to identical rAF
  medians). Both prongs publish the same `window.__probeStats` seam
  (median/p95 rAF, GPU timestamp ms, draw calls, entity counts). Evidence shots
  in `web/shots-bakeoff/`.

### 1. Hard perf gate — BOTH PASS, ~6× inside budget (no veto)

Hardware adapter (this Mac, `apple / metal-3`), 1280×800, 30,400 soldiers +
200,000 grass blades + 3,000 trees, animated crowd re-uploaded per frame:

| probe · camera | GPU ms (vsync) | GPU ms (uncapped) | rAF median uncapped | drawn |
|---|---|---|---|---|
| bespoke · mid | 3.3–4.1 | 2.66 | 1.20 ms | 30,210 (190 culled), LOD L2 |
| bespoke · vista | 4.6 | 2.25 | 0.85 ms | 16,992 (13,408 frustum-culled), L1+L2 |
| three.js · mid | 5.82 | 2.98 | 2.17 ms | all 30,400 full-mesh, no LOD/cull |
| three.js · vista | 5.60 | — | — | all 30,400 |
| bespoke · mid · **60k** | 4.04 | — | 8.31 ms (vsync) | 52,400 drawn |
| three.js · mid · **60k** | — | 4.87 | 3.64 ms | all 60,000 |

Budget is ~33 ms; the worst number anywhere is 5.8 ms. Both prongs also hold
60k soldiers. Bespoke is ~1.5–2× cheaper GPU-side at matched scenes, but the
three.js number is brute force — with the LOD/impostor work `07`+ would add
anyway, its headroom is larger than measured. **Perf does not discriminate; no
veto either way.**

### 2. Look-parity gate — both acceptable spike-grade; three.js less wrong on both scenes

Judged via unprimed `screenshot-critique` + neutral two-image comparisons
(`compare-screenshots` subagent protocol) against the Aegean register
(`battle-coastal-vista.jpg` sea, `target-battle-map.png` haze register):

- **Water vista:** three.js judged "clearly less wrong … calm state, hazy
  dissolved horizon, real specular sun track; acceptable, needs a warm-up
  regrade". Bespoke rough-sea default judged wrong-register (cold, blanket
  foam, sparkle noise; the foam blockiness is a production Gerstner field
  trait). A fair-state re-shoot with the production `agitation` dial
  (`?agitation=0.15`, seam-free after hazing to the sky along the view ray)
  closes most of the state gap but still reads cooler/rougher than the
  reference; the neutral judge still preferred three.js. Critique scores:
  three 6/10 (blobby glint track, sunless sky, horizon moiré, no foam) vs
  bespoke 5/10 (blocky foam, star-field sparkle).
- **PBR sphere grid:** three.js judged the correct validation render —
  metalness axis reads as true dielectric→conductor (real IBL reflections),
  roughness axis clean; "acceptable foundation". Bespoke's procedural-gradient
  env stand-in left the metal axis reading as "darker, not metallic" —
  "needs another pass". Building the real prefiltered-env path is exactly the
  infrastructure three.js ships for free.
- Both prongs share flagged spike gaps (no shadows/contact occlusion — CSM is
  `07`+ work on either substrate). Neither is look-vetoed; three.js is ahead.

### 3. Weighted axes

- **Harness survival (heavily weighted): SURVIVES on three.js — proven, not
  assumed.** The spike publishes the identical `__probeStats`/`__rendererLabReady`
  seam from three.js pages; GPU timestamps work (`trackTimestamp: true` +
  `renderer.info.render.timestamp`, **even under SwiftShader**); draw calls
  readable (`renderer.info`); SwiftShader renders TSL/WebGPU correctly (CI proxy
  intact); the playwright scene harness needed zero changes. Demerits: TSL's
  node internals needed source reading three times (see pain points) and
  three@0.185 ships no TS types (`@types/three` or shims needed) — a real but
  bounded introspection cost, far from "opaque".
- **Interop cost (steady state):** `renderer.backend.device` exposes the raw
  `GPUDevice`; `resolveTimestampsAsync` is public. The realistic steady state is
  NOT raw passes threaded through three's encoder — it is porting the small 2D
  passes (markers/minimap/cues/effect lines/picking debug) onto TSL node
  materials, which the crowd spike shows is mechanical (the hardest pass —
  VAT-skinned instanced crowd — ported in one session, ~330 lines). Picking
  stays CPU-side on `camera3d` (untouched).
- **Complexity/LOC & velocity:** three prong = 738 lines total for all three
  probes, leaning on shipped PMREM/IBL, tone mapping, fog, `mergeGeometries`,
  instancing. Bespoke prong = ~700 new lines leaning on ~10k lines of existing
  bespoke pass code — and its sphere probe still lacks a real IBL. For `07`+
  (CSM, Hillaire sky, ocean, bloom/DOF/TAA) bespoke builds *everything* from
  scratch; three.js ships shadow maps, PMREM, a node-based post pipeline, and a
  maintained example ecosystem (incl. the Spiri0 TSL ocean). Velocity strongly
  favors three.js.
- **Anti-incumbency rule applied:** nothing above scores bespoke for already
  existing, and no migration effort was charged against three.js.
- **three.js/TSL pain points recorded** (honest, from the build): (1)
  `positionNode` ordering vs `instanceMatrix` is undocumented — a custom
  positionNode silently discards InstancedMesh transforms (and `instanceMatrix`
  is zero-initialized, so naive code renders *nothing*); workaround: plain
  `Mesh` + `InstancedBufferGeometry` + own instanced attributes. (2)
  `material.normalNode` expects a VIEW-space normal, documented nowhere
  (`transformNormalToView` + `varying()` required). (3) TSL `Fn` can't return
  an object of nodes. (4) No shipped TS types for `three/webgpu` / `three/tsl`.
  (5) Addon usability outside the examples repo is poor (WaterMesh asset
  dependency). Expect this class of friction throughout `07`+; it is priced in.

### 4. Tie-break

Not needed — three.js/TSL is ahead on look, velocity, and proved harness
survival while passing perf with headroom. The human tie-break (community
support → three.js) points the same direction.

### Harness re-tooling plan for `07`+ (the promised plan)

1. **Keep the whole verification stack:** playwright + `web/scene.mjs` scenes,
   `snapCheck` baselines, SwiftShader CI proxy, hardware perf gates — all proven
   working against three.js pages unchanged.
2. **Stats seam:** photoreal routes publish the same `__rendererLabStats` shape;
   back it with `renderer.info` (draw calls, triangles), `trackTimestamp`
   GPU ms, and scene-specific counters (the spike's `__probeStats` is the
   template). Seam unit tests keep running in node against pure TS (camera3d,
   instance/LOD/formation builders — none of that moves into three).
3. **Types:** add `@types/three` (dev-only) and delete the spike's shims.
4. **Composition seam:** one battle "photoreal world renderer" owns a three.js
   `Scene` + `WebGPURenderer`, fed per-frame by `camera3d` params and sim
   snapshots; the 2D overlay passes port to TSL node materials incrementally
   (marker/cue/minimap first); picking and the sim firewall are untouched.
5. **Perf gate:** the 30k+foliage scene becomes a standing hardware gate on the
   three.js renderer (`web/bakeoff-shot.mjs` pattern → a proper scene), budget
   ≤ ~33 ms with the shadow/sky/ocean/post passes enabled as they land.

## Must stay green

- Spike only — **do not** merge either prong into the production renderer. `01`–`05`
  and the sim firewall are unaffected until `07`+ is authored and built.

## Human feedback that would change this slice

The criteria above are the human's locked decision inputs (perf floor, harness
weighting, tie-break direction), so no sign-off is needed to proceed. Feedback that
would change it: a revised frame budget, promoting harness-survival to a hard veto, or
flipping the tie-break — update the decision procedure here if the human changes any.
