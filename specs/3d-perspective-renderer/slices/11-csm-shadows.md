# Slice 11 — Cascaded sun shadows (CSM)

## STATUS: DONE (2026-07-02). Evidence + recorded decisions below.

**The seam:** `packages/photoreal-renderer/src/battle/shadowRig.ts` —
`configureSunShadows(renderer, sun, env, mode)`, `mode ∈ 'csm' | 'single' | 'off'`
resolved by `resolveSunShadowMode(adapterLabel, override)` (software rasterizers
→ `'single'` BY NAME; lab `?shadows=` override wins). The tier is published in
the stats identity (`renderStats.shadows`) and asserted per adapter by the NEW
gate scene `web/scenes/battle/photoreal-shadows.mjs`. Both 08a blob-shadow
stand-ins are DELETED (`PhotorealSoldierShadows` in crowdLayer + the scenery
shadow-decal bucket/material in foliageLayer; ledger row closed — grep-clean).

### Recorded decision: three's CSMShadowNode addon, not hand-rolled

`three/examples/jsm/csm/CSMShadowNode.js` @0.185 works on `WebGPURenderer` +
node materials + z-up + our world scale, verified on hardware shots. Evidence
for the call: it consumes `renderer.reversedDepthBuffer` correctly
(`CSMFrustum` zNear/zFar 1/0), splits cascades from the LIVE
`camera.projectionMatrix` (we own that via `applyCamera3d`, so
`rig.update()` → `csm.updateFrustums()` per frame tracks the zoom rig
exactly), and the shadow depth pass inherits each material's custom
`positionNode` (VAT crowd casts correctly — verified per-soldier streaks).
Its `_up=(0,1,0)` only rolls the light-space basis (bbox fit stays correct in
z-up). Interop wiring: one vite alias (`three/examples/jsm/` →
`web/node_modules/three/examples/jsm/`) + one tsconfig path to
`@types/three/examples/jsm/*` — the 06 "addon usability" concern reduced to
those two lines. Hand-rolling was kept as the recorded fallback, not needed.

### Addon pitfalls found (the hazards for future shadow work)

1. **Cloned shadow camera near/far.** `CSMShadowNode` sets each cascade's XY
   extents but the cloned `DirectionalLightShadow` camera keeps three's
   defaults (near 0.5 / far 500) — receivers past 500 light-units compare
   against cleared depth and the whole field blacks out smoothly. Fix:
   `SHADOW_CAM_NEAR/FAR` (1/2500) set on the source shadow BEFORE constructing
   the node (clones inherit).
2. **`shadow.normalBias` reads the STANDARD `normal` attribute** (TSL
   `normalWorld`), not the material's `normalNode` — with only custom-named
   attributes (`gNormal`/`cNormal`/`sNormal`/`hNormal`) the receiver offset is
   silently zero. Every receiver geometry now aliases its normal buffer as
   `'normal'` (zero-copy, same buffer/interleave).
3. **Over-biasing deletes small casters.** Bias units are fractions of the
   ortho depth range: -0.0005 × 2500 ≈ 1.3 world units — that "fixed" acne by
   erasing every soldier-sized shadow. The knob set that landed:
   `SHADOW_BIAS -0.00003` (≈0.075 world, ×(cascade+1) per cascade),
   `SHADOW_NORMAL_BIAS 0.3`, 3 cascades × 2048, `SHADOW_MAX_FAR 2600`
   (raised from 1600 so the headland crags cast onto the plain at vista
   framings — the neutral judge's flag), `CSM_LIGHT_MARGIN 300`, PCF radius
   from turbidity.

### Recorded decision: the GROUND does not cast (receives only)

A gently undulating heightfield at the grazing golden-hour sun needs
`cot(elevation)·texel ≈ 2–3 world units` of far-cascade bias to suppress
self-shadow ripple (concentric acne rings on hardware shots) — a bias that
erases soldier shadows. So: ground `receiveShadow` only; casters are the crowd
(VAT positionNode re-skinned per cascade), scenery props, and horizon
blockers (crag facets self-shade + throw the long toward-camera wedges).
Terrain self-occlusion is owned by `13` (relief look) / `14c` (contact AO).
Grass receives but does not cast (per-blade casting = re-rendering every
instanced blade per cascade for sub-pixel shadows). Background quads and the
sea receive nothing (quads are depthTest-off underlays the haze owns; sea
receiving is `12`'s call). Far-LOD markers never cast (parity with the old
blob behavior: wide zoom had no soldier decals either).

### Preset coupling (no new field on the ONE owner)

Overcast shadow REDUCTION is pure physics — the preset's
`physical.sunIntensity` (0.4 overcast vs 3.4 golden) scales the sun's (and so
its shadow term's) contribution. SOFTNESS maps from `physical.turbidity`
(`shadowRadiusForTurbidity`: noon 1.0 → overcast ~3.0 PCF radius; aerosols
blur the solar disc). `CIVSIM_ENVIRONMENTS` gained NOTHING.

### Evidence

- **Per-preset montage** (`web/shots-slice11/preset-montage.png`, hardware,
  fixed t=0, same grove): golden = long warm toward-camera shadows; noon =
  short compact; dusk = longest + dim; overcast = shadows melt into the haze.
  Shadows track each preset's sun elevation.
- **Before/after** (`golden-trees3-off-grove.png` vs `golden-trees3-grove.png`):
  neutral judge — "Image 2 [shadows] is clearly the more physically believable
  golden-hour scene… trees sit ON the ground… no acne, no moire, no rings, no
  double shadows, no peter-panning." Judge's two flags (soldier shadows too
  short, crags casting nothing) were fixed by the normal-bias/maxFar re-tune
  and re-verified (per-soldier streaks legible; crag wedges land on the plain).
- **Perf (the headline gate,** hardware apple/metal-3, `perf:30k`, 30,560
  soldiers + 548 scenery + vista 184.8k grass blades, CSM 3×2048 ON): GPU
  median **5.86 ms mid / 6.39 ms vista** (p95 6.91/7.21), rAF 8.3 vsync-pinned
  — vs 3.14/3.18 pre-shadow: **crowd+world shadow-casting costs ≈ +2.7/+3.2 ms**,
  ~5× inside the 33 ms budget. Caster-LOD/cascade-count knobs stay untouched
  in reserve (14b owns crowd LOD).
- **SwiftShader:** runs `mode:'single'` (1×1024 ortho fit to the terrain rect,
  re-anchored on the map centre) — renders green and non-blank, scene asserts
  the tier by name; on/off presence check moves the grove crop (Δ 2.17).
  Six new SwiftShader baselines under `web/shots/battle/photoreal-shadows/`.
- **Unprimed critique triage (recorded, run twice — a neutral judge and an
  unprimed critic):** the "shadow direction contradicts the sun glow" flag was
  REFUTED numerically (principal shadow axis +10° screen-right = world +X =
  exactly anti-solar; a yaw=π/2 side-lit control shot shows horizontal
  east-pointing shadows; both reviewers mis-assigned overlapping grove shadows
  to neighbor trees — worth remembering when reading dense-caster shots).
  Items confirmed PRE-EXISTING (identical in ?shadows=off): the map-edge
  seam/backdrop planes, the dark field tint patch ("giant static blob" — it is
  albedo, darkest-reading at noon), the grass focus-radius ring, and the
  noon-vs-golden ground exposure — all owned by name at `13` (tan field
  albedo, map-edge seams, mountain shelf). REAL shadow notes accepted as
  trades and re-homed: pale gap at the crag base (blocker apron geometry —
  `13c`), no trunk-base contact darkening under PCF blur + normalBias
  (`14c` contact AO), uniform penumbra (no contact hardening — PCSS is a
  `15`-era refinement if ever). Dusk sharing golden's azimuth is the locked
  preset design (`10c` SUN_TOWARD_VIEW), not a shadow defect.
- **Standing gates:** seating tripwire `match=true` (3 fixtures); full
  `scene:renderer` suite green (battle snapshot movement stayed inside
  existing budgets — e.g. terrain-elevation 0.43–0.46%; single-tier SwiftShader
  shadows are subtle); campaign byte-identical (zero campaign files touched;
  suites green); `test:unit` 61/61 (55 + 6 shadow pins in
  `web/tests/photorealShadows.test.ts`); typecheck green; cargo workspace
  green; zero `crates/**` diffs.

## Contract unlocked

Real cast sun shadows ground the world — the spike's biggest flagged gap ("no
shadows/contact occlusion" on both prongs). Soldiers, trees, scenery, and terrain
cast/receive; the **`08a` blob-shadow parity stand-in is deleted** (a net deletion —
battle's `SoldierShadowDecalPass` usage died at `08b`; the class survives for
campaign until `16`/`17`).

## API seam

`packages/photoreal-renderer/src/battle/shadowRig.ts` —
`configureSunShadows(sun, mode)`, `mode ∈ 'csm' | 'single' | 'off'`, chosen by an
adapter capability probe and **published in the stats identity fields**.

- **Replication spike required first:** three's `CSMShadowNode` addon
  (`three/examples/jsm/csm/CSMShadowNode.js`) — verify it works on `WebGPURenderer`
  @0.185 with node materials, z-up, and our world scale. Record the verdict in this
  file.
- **Fallback plan:** a hand-rolled 2–3 cascade orthographic rig **fit to the
  `camera3d` frustum** — we own the camera math, so split computation is easy and the
  cascades track the rig's zoom curve exactly.
- Overcast preset softens/reduces sun shadows via `environment.ts` (lighting is an
  environment, not a material). Bias/peter-panning/acne tuning; shadow distance fades
  into the `10b` aerial haze; grass may receive nearest-cascade only.

## What the human can run / see

`/battle` — soldiers/trees cast real contact shadows at every zoom;
`/renderer/photoreal-battle?shadows=off` debug param on the lab route only.

## Verification

- **Visual variable: cast/received sun shadows.** Crop **`shadow-contact`** (soldier
  feet + tree line at mid zoom) in NEW scene `web/scenes/battle/photoreal-shadows.mjs`.
  Critique must confirm contact grounding without acne/peter-panning. Out of scope:
  soldier materials (`14`), contact AO (`14c`).
- `compare-screenshots` vs `battle-formations-melee.jpg` and `battle-coastal-vista.jpg`
  (long warm shadows). `screenshot-critique` last.
- **Perf gate re-run is the HEADLINE here** — shadow passes at 30k + foliage are the
  expected biggest frame-time jump of the ladder. Record the shadow-pass ms split in
  the ledger; cascade count/resolution and caster LOD (exclude far tiers beyond
  cascade 1) are the tuning knobs; total stays ≤ 33 ms.
- **SwiftShader fallback proven by scene:** depth-array + per-cascade compare is the
  named CI risk — the SwiftShader run uses `mode:'single'` (1 cascade, low res),
  renders green, and the scene asserts which tier ran. Hardware asserts `'csm'`.
- Standing gates: seating tripwire, campaign byte-identical, battle suite, deliberate
  re-bless (shadows shift most battle baselines — expected, diffed individually).

## Must stay green

Standing gates 08b→17. The blob-shadow stand-in must be **gone** at the end of this
slice — grep `packages/photoreal-renderer` for it (scaffolding ledger row closed).

## Research

- NVIDIA Cascaded Shadow Maps paper (README source list).
- three `webgl_shadowmap_csm` example + `CSMShadowNode` source; `webgpu_shadowmap_*`
  examples.
- MJP shadow-sample notes (bias/filtering).

## Human feedback that would change this slice

Cascade count/resolution vs perf trade; PCF softness at gameplay zoom (too-crisp
shadows read miniature, too-soft read overcast). Open a before/after with
`preview-shots` (~5 min, non-blocking), decide on evidence, record, proceed.
