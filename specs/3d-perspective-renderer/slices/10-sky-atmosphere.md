# Slice 10 — Physical sky + atmosphere (ONE aerial owner)

## STATUS: IN PROGRESS — 10a DONE (2026-07-02). Evidence at the bottom of this file.

## Contract unlocked

The high-key Aegean light (aesthetics rules 1–2): a physical sky that the sun, the
IBL, and the haze all agree with — and the **single atmosphere owner** the README
invariants demand. Battle's four historical inline haze copies (frameShell terrain /
`groundPass` / `horizonPass` / water WGSL) are already orphaned for battle by `08b`;
this slice ensures their photoreal replacement is ONE source, not a fifth copy.

## API seam

**10a — physical sky.** `packages/photoreal-renderer/src/battle/skyLayer.ts` behind a
`SkyModel` seam: primary = **Hillaire-style sky** (transmittance + sky-view LUTs in
TSL compute); fallback = three's `SkyMesh` addon / analytic TSL dome (budget a
half-day replication spike — 06 flagged addon usability outside the examples repo as
poor). Sun disc; sun `DirectionalLight` direction/color derived from the same
parameters. The sky **feeds `scene.environment`** (small equirect RT → PMREM), which
**deletes the procedural equirect stand-in** from `07`/`09` — ambient always agrees
with the visible sky. Never two sky paths outside the `SkyModel` seam.

**10b — aerial perspective, the ONE owner.**
`packages/photoreal-renderer/src/atmosphere/aerialPerspective.ts` — one TSL
scatter/extinction function (aerial LUT or analytic Hillaire fit) applied through a
shared material hook to *every* world surface (terrain/sea/foliage/crowd/scenery).
**Deletes the parity `THREE.Fog` stand-in from `08a`.** No material adds its own haze,
ever — this is the register-maker (aesthetics rule 1) and the net-deletion invariant.

**10c — presets through the sky model.** `golden` / `dusk` / `overcast` mapped through
the physical parameterization (sun elevation + turbidity drive everything); fields
added to `CIVSIM_ENVIRONMENTS`, per the `09` rule.

**Locked preset moods (David's interview decisions, absorbed from the retired
`battle-atmosphere` spec — do not re-litigate):**
- **golden** — sun-drenched Aegean, subtle far haze; the default battle light.
- **overcast** — cool, flat, **high-key** (not dark), with **HEAVY fog swallowing
  layered mountain ranges**; reference `assets/battle-overcast-highland.png`. The
  aesthetics litmus stands: same materials, different environment — mood lives in
  the light, never baked into albedo.
Reference images live in this spec's `assets/` (`battle-coastal-vista.jpg` golden
sky/vista, `battle-advance-coast.jpg` the sea→sky seam, `battle-overcast-highland.png`
overcast).

## What the human can run / see

`/battle` under each preset; `/renderer/photoreal-battle?env=…`.

## Verification

- One visual variable per sub-slice: **10a crop `sky-band`** (top third of the vista
  framing, sky/sea meeting strip); **10b crop `far-terrain-band`** (distant ridge
  haze); **10c full-frame per preset**. Out of scope: sea material (`12`), terrain
  detail (`13`), shadows (`11`).
- NEW scene `web/scenes/battle/photoreal-sky.mjs`: 3 presets at fixed `setTime`,
  named crops.
- `compare-screenshots` vs `battle-coastal-vista.jpg` (golden sky band) and
  `battle-overcast-highland.png` (overcast — same materials, different environment:
  the aesthetics litmus). `screenshot-critique` last on every shot.
- **SwiftShader capability fallback proven by the scene:** sky-LUT compute is a
  flagged SwiftShader risk — the fallback is adapter-gated *inside* the `SkyModel`
  seam, the SwiftShader run must render non-blank, and the stats identity fields
  assert **which tier ran**. Hardware runs the full tier.
- Standing gates: perf gate + ledger entry, seating tripwire, campaign byte-identical,
  unit test for deterministic preset→sun/haze mapping.

## Must stay green

Standing gates 08b→17. Grep-proof after 10b: exactly one aerial/haze source in
`packages/photoreal-renderer` (the campaign/bespoke haze copies live until `16`/`17`
and are recorded in the README scaffolding ledger).

## Research

- Hillaire, *A Scalable and Production Ready Sky and Atmosphere Rendering Technique*
  (EGSR 2020) + <https://github.com/sebh/UnrealEngineSkyAtmosphere>.
- <https://github.com/JolifantoBambla/webgpu-sky-atmosphere> (raw-WebGPU LUT layout —
  replication reference).
- three `webgpu_sky` example (`SkyMesh`, Preetham — decide analytic-vs-LUT in the
  spike); `webgpu_custom_fog` / TSL fog nodes; `webgpu_tsl_compute_*` examples.

## Human feedback that would change this slice

Preset mood tuning is explicitly David's knob (how hazy is overcast, how warm is
dusk). If the analytic dome already nails the register, the Hillaire LUT path can be
recorded as not-needed — decide on shots, not ambition.

## 10a DONE — evidence (2026-07-02)

**THE SKY-MODEL DECISION (Hillaire-vs-analytic, recorded per the spike budget):
a Hillaire-style SKY-VIEW LUT baked by a FRAGMENT pass — not compute, not a
per-pixel raymarch dome, not the three `SkyMesh` addon.** The seam
(`packages/photoreal-renderer/src/atmosphere/skyModel.ts`, class `SkyModel`,
tier id `skyview-fragment-lut`) bakes single-scattering raymarch radiance
(32 view × 6 sun samples, Hillaire's Earth coefficients, z-up) into a 384×192
equirect RT once per preset, plus an analytic blue-tinted multiple-scattering
floor (ψms role) and a CIE-style overcast dome blend keyed on turbidity.
Grounds, on shots and risk:
- The fragment-pass LUT **dodges the flagged SwiftShader compute risk
  entirely** — SwiftShader runs the SAME tier (proven by the
  `battle-photoreal-sky` scene: tier identity asserted + non-blank sky band on
  the software adapter). No adapter gate needed; the seam keeps the tier
  identity field so a compute-LUT tier can slot in later if 15/16 want
  multiple-scattering LUTs.
- Per-frame sky cost is ONE texture sample (the bake runs once, no time
  input — byte-deterministic; the TSL `time` ban holds).
- It IS the Hillaire sky-view layout in spirit: the LUT caches exactly what
  his sky-view LUT caches; only the transmittance LUT is replaced by the
  inline mini-march (32×6 = fine at bake-time cost) and multiple scattering
  by the analytic floor. Quality judged on shots: gradients smooth, dusk
  sun-ward glow warm, overcast flat high-key.
- Sun disc drawn analytically in the dome material (EXCLUDED from the LUT so
  the IBL never double-counts the DirectionalLight); verified at dusk framing
  (clean disc at the correct 13.7° elevation).

**Structural deviations from the slice sketch (recorded):**
- `SkyModel` lives in `atmosphere/skyModel.ts` (not `battle/skyLayer.ts`):
  the sky serves every photoreal world through `applyCivsimEnvironment`
  (lab pbr/crowd routes included), and 10b's `aerialPerspective.ts` shares its
  parameterization + LUT — `atmosphere/` is the owner, `battle/` a consumer.
- The dome is our own camera-locked unit sphere (renderOrder −100,
  `photoreal-sky`, translation-killed vertexNode) instead of
  `scene.backgroundNode`: three's background mesh enters the render list at
  renderOrder 0, which the reversed-depth sort hazard would draw OVER the
  −10/−9 painter band. Owning the mesh keeps the painter contract explicit.
- The reversed-depth sort comparators moved from `PhotorealBattleWorld` to
  `PhotorealWorld.create` — the dome (and any future sky consumer) needs the
  classic painter contract on every photoreal world, not just battle.
- `CivsimEnvironment.skyZenithColor/skyHorizonColor/groundBounceColor` are
  DELETED from the ONE owner (they existed only to feed the dead stand-in;
  sun elevation + turbidity now drive the sky). `PhotorealEnvironmentSpec`
  dropped them plus `backgroundIntensity`; `sunColor` is now the sky model's
  transmittance-derived LINEAR light colour (never the authored `keyColor`,
  which stays a bespoke-WGSL knob until 16/17).
- Lab battle route gained `?pitch=`/`?yaw=` camera-override QA knobs (sun
  disc/sky verification framings the production rig can't reach).

**Register preserved by construction (the calibration contract):**
`SUN_RADIANCE = 25` was calibrated so the LUT lands on the radiance scale the
09 exposure/IBL balance was tuned against (JS mirror: golden zenith
[0.10, 0.21, 0.42] vs stand-in [0.16, 0.28, 0.52]; noon [0.19, 0.36, 0.72] vs
[0.19, 0.34, 0.62]) — result: the whole battle + campaign + system suite
passed with ZERO re-blessed baselines (613 checks; movers all in-budget:
battle-camera-zoom 0.25% — the vista sky band itself — and the pre-existing
menu 0.04%/0.02%), and the 09 `battle-photoreal-lighting` per-preset
crowd-mid baselines moved ≤ 0.33% (noon/overcast 0.0000%). The sun
DirectionalLight tint is now physics (transmittance): golden R/B 1.55, dusk
warmer, noon near-neutral, overcast desaturated to grey — pinned by 5 new
unit tests (53 total).

**Unprimed critique findings (recorded, each owned by name):** golden reads
barely golden at the default framing — the sun azimuth (`SUN_TOWARD_VIEW`,
authored for the 2.5D camera) is ~90° off the real camera's default view
azimuth, so the warm quadrant is off-frame (→ **10c**, the preset-mood
completion, David's knob); dusk sun disc ACES-blows to white (→ **10c** disc
radiance tune); hard terrain-plane edge against the below-horizon sky (→ 13
terrain/horizon composition); distant crowd smear + cyan far-LOD cluster
(→ 14b); no cast shadows (→ 11); faceted pyramid mountains (→ 13c).
