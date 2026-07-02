# Slice 10 — Physical sky + atmosphere (ONE aerial owner)

## STATUS: DONE (2026-07-02) — 10a + 10b + 10c. Evidence at the bottom of this file.

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

## 10b DONE — evidence (2026-07-02)

**THE ONE AERIAL OWNER SHIPPED:**
`packages/photoreal-renderer/src/atmosphere/aerialPerspective.ts` — one TSL
scatter/extinction Fn assigned to `scene.fogNode` (three's shared material
hook: `NodeMaterial.setupFog` applies it to every fog-enabled material), so
terrain quads/backdrop, the heightfield ground (incl. field water), horizon
blockers, ocean planes, grass, scenery, and the crowd all haze through ONE
source. Per-channel Beer–Lambert extinction from the SAME Rayleigh/Mie
coefficients as the sky (turbidity-driven) plus a neutral ground-fog term
above turbidity 4; the in-scatter colour is **the sky-view LUT sampled at the
horizon along the fragment's view azimuth** — far surfaces dissolve into
exactly the sky behind them (warm toward the sun, flat white under overcast:
the sea→sky and ranges→sky dissolves are free, by construction).

**Stand-ins DELETED (ledger rows closed):** the `THREE.Fog` parity haze
(environment.ts fog option + battleWorld's 3400/8200 ramp + the crowd lab
route's 700/3600 ramp) and every per-material `Aerial stand-in` albedo mix
(terrain quads' `aerialStrength` style field + haze mix, ground `chartDepth`
fog varying, horizon blockers' 0.10 haze push, grass `vFog` mix, sea
`haze01`/`WATER_HAZE_ROUGHNESS` shore-keyed fade). Grep-proof: zero
functional haze sources in `packages/photoreal-renderer` outside
`atmosphere/`; the orphaned `chartDepthDistNode` + `eyeXY` uniform are
deleted from battleTsl (the 05b value-identical port existed only to feed
those mixes). Overlays (gold cues, effect lines, far-LOD markers, blob/prop
shadow decals) stay `fog: false` by design — gameplay legibility (rule 6)
and 11-bound decals, recorded here.

**THE OBSERVER DECISION (the slice's hard call, recorded):** aerial optical
depth is measured from the camera's GROUND FOCUS (the player's stand-in,
`frame.focus`), not the rig eye — the tactical camera parks 1–3 km out at
gameplay zooms (probed: eye 1974 m at the crowd-mid framing, 960 m at
vista), and eye-keyed depth double-counts the miniature-world amplification:
overcast whited out ENTIRE gameplay framings and golden blue-tinted the
whole field (shots in the session record). Focus-keying is what the bespoke
haze did (`chartDepthDist`) and keeps every zoom readable; worlds without a
focus (lab routes) default to the eye. Plus a 140 m clear radius (aesthetics
rule 2 — the commanded fight never washes out). Constants:
`AERIAL_DISTANCE_SCALE = 4.5` (raised from 3 after an unprimed critique
called the clear presets' ranges "cardboard" — at 4.5 the ranges recede
visibly while the near field stays warm), `FOG_COEFF_KM = 0.026`/(T−4)²
(overcast σ ≈ 0.85/km, V ≈ 4.4 km: ranges 1.1–1.5 km from focus at T ≈
0.25–0.35 — "HEAVY fog swallowing layered ranges"). Sky-model follow-up: the
LUT's below-horizon ground bounce blends to fog-grey under overcast (the tan
bounce clashed against white fog at the map edge).

**Verification:** unit — 2 new aerial pins (55 total: visibility monotone
noon > golden > dusk > overcast, golden V > 20 km subtle vs overcast V < 5 km
heavy, clear presets rayleigh-blue B/R > 1.5 vs overcast near-neutral < 1.3,
determinism). Scene — `battle-photoreal-sky` gained the aerial identity
assert; far-terrain-band + full baselines re-blessed per preset (the 10b
variable), lighting crowd-mid re-blessed (dusk 37%, overcast 79% — the
gameplay-framing haze, eyeballed). Full suite 613 checks 0 fails; production
battle movers: battle-camera-zoom only (vista stop, eyeballed + re-blessed);
campaign byte-identical; seating tripwire `match=true`. **Perf ledger row
(hardware apple/metal-3, 30,560 soldiers + 548 scenery + vista 184.8k grass
blades, sky + aerial on; FINAL row re-measured at 10c constants after the
view-direction in-scatter fix): GPU median 3.14 ms mid / 3.18 ms vista
(p95 6.14/5.41), rAF 8.3 ms vsync-pinned — vs 3.27/2.75 at 09, essentially
frame-time-free, ~10× inside the 33 ms budget. (Interim 10b measurements
with the horizon-clamped in-scatter: 4.27–4.36/4.82–5.27.)** SwiftShader renders the
aerial fine (no compute — same tier).

**Second unprimed critique (post-10b, recorded):** graded aerial between
clear presets confirmed missing at scale 3 → fixed at 4.5 (above); the
"saturated grass patch punches through fog" finding is the grass-tuft focus
radius (the tuft field only spawns near the camera focus — a pre-existing
composition fact, 13b's foliage look); map-edge wedge/tan void → 13/13d
(already recorded); overcast tactical framing is deliberately the heavy
preset — David's knob if too heavy.

## 10c DONE — evidence (2026-07-02): presets through the sky model

**No new preset fields were needed** — the 09 physical block (sun
elevation/azimuth + turbidity) plus the shared angles already drive the
whole sky + aerial parameterization; that was the point of the seam. The
locked moods complete through VALUES on the ONE owner:

- **Sun re-aimed toward the default view (`SUN_TOWARD_VIEW` π/2 → π).** The
  constant was authored for the 2.5D camera and went stale at the 04a flip
  (camera3d yaw 0 looks along −X = azimuth π; verified empirically with the
  lab `?yaw=` knob — the disc centres at view azimuth yaw+π). Every
  reference composes with the sun IN view; two unprimed critiques
  independently flagged "golden-hour shows no golden light" at the default
  framing. Coordination: sanctioned — battle-map-reference's README defers
  look-judgment until 10/11 land and records that this ladder re-blesses
  battle baselines as lighting/sky change; environment files are this
  ladder's reserve.
- **Golden sunElevation 0.5 → 0.35 rad (20°).** A true golden-hour sun: the
  physical transmittance now delivers R/B ≈ 2.0 warm key (vs noon 1.28) and
  a warm sun-ward sky — "golden's warm sky" from physics, not paint.
  Irradiance ordering (noon > golden > dusk > overcast) still pinned green.
- **Dusk disc radiance 60 → 2.5** (below the ACES saturation knee so the
  transmittance tint survives — the white-blob critique finding; the halo
  glow still blows out near the core exactly like the reference sun).
- **Overcast completes as locked:** cool flat HIGH-KEY sky (LUT band
  telemetry sat 2.5, lum 222) + HEAVY fog swallowing the layered ranges
  (10b). Full-frame register vs `battle-overcast-highland.png`: candidate
  mean (186,192,188) lum 191 sat 6.2 vs reference (171,178,172) lum 176 sat
  7.6 — the same-materials-different-environment litmus PASSES (same world,
  cool flat high-key, ranges dissolving).
- **Golden full-frame vs `battle-coastal-vista.jpg`:** sky band and light
  register land (warm quadrant, warm key, subtle far haze, blue-receding
  ranges); the remaining gap is the FIELD ALBEDO — reference tan/dry
  (mean R>G: 148/131) vs our green-grass map (145/169) — which is 13's
  terrain work by name (recorded since 09).

**Third unprimed critique (4 preset fulls, pre-re-aim):** mood separation —
overcast distinct (HIGH pass), dusk reads evening, golden↔noon was the
collision pair → resolved by the re-aim + elevation (golden now carries the
warm quadrant + warm key; dusk is warmest, which is physically right — the
lower sun). Same-world/same-materials: explicit PASS ("only light/atmosphere
change — no different-art problem"). Recorded leftovers: no cast shadows
(11), map-edge seams + mountain-base shelf (13/13d), tan albedo (13a).

**In-scatter correction found by the 10c full-suite sweep (recorded):** the
`battle-smoke` scenes (not in the curated 613-check list) exposed that
sampling the in-scatter at the HORIZON washed steep top-down overviews out —
the horizon sky is 3–8× brighter than the ground, so even 15% haze bloomed
the whole map. Fix: the aerial hook samples the sky-view LUT along the TRUE
view direction — downward rays land in the LUT's dim below-horizon
ground-bounce region (matching the ground), horizontal rays keep the
horizon-sky dissolve. Lesson recorded: the curated suite list missed the
top-down production framing; the full `node scene.mjs` sweep is part of this
slice's gate from now on.

**Final unprimed critique (post-everything, the last visual check):**
same-world/same-materials PASS ("holds up well"); noon + overcast distinct
and correct; top-down gameplay view "clean and legible — no washed-out
veil, HUD readable" (the in-scatter fix verified); golden-vs-dusk warmth
ordering flagged again — dusk reads warmer than golden, which is the
physical truth of the lower sun; whether golden should out-warm dusk
anyway is David's mood knob (one constant each: `sunElevation`,
`physical.turbidity`). Remaining named items unchanged: map-edge slab +
mountain-base seam (13/13d), cone mountains (13c), far-soldier smear
(14b), glowing grass-tuft patch under fog (13b — the tufts are unlit
geometry pockets, a foliage-look matter).

**Gate re-derivation (05b precedent, recorded):** the
`battle-terrain-blockers` grey-stone colour bin widened from r∈(110,215) to
r∈(95,242) — the re-aimed sun backlights the west crags (lit faces ~235,
shade ~95); the bin still describes grey-neutral stone, the floor 0.04 is
untouched.

**Re-bless (10c, each eyeballed):** battle-camera-zoom, 17 battle-map-
reference grass-lab evidence baselines (lighting-direction only — fixtures
intact; sanctioned by that spec's rebase contract), 5 terrain-blockers, 1
shared-grass-models sheet, 12 photoreal-sky + 4 photoreal-lighting + parity/
pbr/crowd-mid (21 photoreal-scene baselines). Campaign byte-identical
throughout.

**Human checkpoint (non-blocking, preview-shots, ~10 min window, no
response — decided on the evidence and recorded):** opened the four final
preset fulls + both tactical framings + the golden pre-re-aim A/B + both
references in one Preview window; closed on proceed. **Call: ACCEPT all four
preset moods as the 10c completion.** Grounds: (1) the overcast litmus
passes on register telemetry AND unprimed critique ("clearly distinct and
successful… excellent recession — best of the four"); (2) golden's locked
"warm sky" is delivered by physics (sun-in-view warm quadrant, R/B 2.0 key,
subtle far haze) and the pre-re-aim A/B shows the re-aim is what separates
golden from noon; (3) dusk-warmest ordering is physically correct (the
lower sun) and reads as evening; (4) noon is the neutral reference by
design; (5) the remaining register gaps are owned by name — cast shadows
(11), tan field albedo/map-edge/mountain shelf (13), far-crowd smear (14b).
**Mood fine-tuning stays David's knob**: how heavy overcast's fog is
(`FOG_COEFF_KM`), how warm golden is (`sunElevation`), the sun azimuth
composition (`SUN_TOWARD_VIEW`), the disc size/brightness
(`SUN_DISC_*`) — all single constants on the two atmosphere files/the ONE
preset owner, each documented at its definition.
