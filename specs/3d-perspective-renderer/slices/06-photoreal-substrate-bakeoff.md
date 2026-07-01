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

## Must stay green

- Spike only — **do not** merge either prong into the production renderer. `01`–`05`
  and the sim firewall are unaffected until `07`+ is authored and built.

## Human feedback that would change this slice

The criteria above are the human's locked decision inputs (perf floor, harness
weighting, tie-break direction), so no sign-off is needed to proceed. Feedback that
would change it: a revised frame budget, promoting harness-survival to a hard veto, or
flipping the tie-break — update the decision procedure here if the human changes any.
