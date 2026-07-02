# Slice 09 — Lighting core (physical sun + IBL + tonemap)

## STATUS: DONE (2026-07-02). Evidence at the bottom of this file.

## Contract unlocked

The first look-changing slice: battle surfaces respond to **physically grounded
lighting** — sun `DirectionalLight` + real IBL ambient + ACES tonemap — all mapped from
`CivsimEnvironment`. This is the foundation every later surface slice (`10`–`15`)
relights under; it lands *in production* because `08b` already flipped the world.

## API seam

- `packages/photoreal-renderer/src/environment.ts` grows up from parity mapping to the
  physical parameterization: sun direction/intensity/color, `scene.environment` PMREM
  (from the procedural equirect — still a stand-in until `10a` replaces it with the
  real sky), `ACESFilmicToneMapping` + exposure owned by the preset. **New physical
  fields (sun intensity, exposure, turbidity) are ADDED to `CIVSIM_ENVIRONMENTS` in
  `packages/game-renderer/src/environment/environment.ts`** — extend the one owner,
  never fork a parallel preset table.
- World materials move from parity-tint hacks to `MeshStandardNodeMaterial`-style
  responses with **neutral albedos** — light lives in the environment, never baked
  into albedo (aesthetics rule: same materials must read golden at golden hour and
  grey under overcast).
- Presets `golden` / `dusk` / `overcast` (`CivsimEnvironmentId`, battle aliases
  `golden-hour` / `dusk` / `overcast-foggy`) all map through the one parameterization.

## What the human can run / see

`/battle` (production, default preset) and
`/renderer/photoreal-battle?env=golden-hour|dusk|overcast-foggy`.

## Verification

- Unit: `photorealEnvironment.test.ts` extended — exposure monotonicity, sun direction
  round-trip, environment swap changes sun/fog/exposure deterministically.
- NEW scene `web/scenes/battle/photoreal-lighting.mjs`: per-preset snapshots at fixed
  `setTime`.
- **Visual variable (exactly one): how surfaces respond to sun + ambient.** Crop
  **`crowd-mid`** (center formation at mid zoom). Out of scope here: sky appearance
  (`10`), shadows (`11`), sea/terrain/soldier material detail (`12`–`14`).
- `compare-screenshots` vs `.claude/skills/aesthetics/references/battle-coastal-vista.jpg`
  (golden register: warm key, lifted shadows) and `battle-overcast-highland.png`
  (overcast preset). `screenshot-critique` as the last check on every shot.
- Standing gates (README list): perf gate re-run + ledger entry, seating tripwire,
  campaign byte-identical, deliberate re-bless of moved battle baselines.

## Must stay green

Standing gates 08b→17. No parallel lighting constants anywhere — if a material needs
a preset-dependent knob, the knob lives in `CIVSIM_ENVIRONMENTS` and flows through
`environment.ts`.

## Research

three `webgpu_materials*` examples; `PMREMGenerator` docs (the spike proved raw
equirect `DataTexture` → internal PMREM works); three tone-mapping notes (ACES now;
the ACES-vs-AgX identity decision is deliberately deferred to `15` with shots).

## Human feedback that would change this slice

Register calls — how golden is golden-hour, how flat is overcast. Preset roster
changes (new `CivsimEnvironmentId`s) are cheap here and expensive later; ask if the
three presets are the final set.

## PRESET ROSTER — DAVID'S CALL (2026-07-02, mid-slice)

David answered the roster question during implementation: **ADD a fourth preset —
`noon`** — final-for-now roster **golden-hour / dusk / overcast-foggy / noon**.
Noon's locked register: **neutral midday clear** — high sun (elevation 1.22 rad),
white/neutral sun colour (no golden warmth), normal exposure, minimal
haze/turbidity, shortest shadows. It is the "true colour" reference preset:
albedos read as-authored, no mood grade — but still a clear Aegean midday inside
the Bronze-Age register, not a sterile studio white. It has no dedicated
reference image; judge it by unprimed critique + the same-materials litmus vs
golden/overcast (noon must read neutral where golden reads warm).

## DONE — evidence (2026-07-02)

**What shipped (files):**
- `packages/game-renderer/src/environment/environment.ts` — the ONE owner grew
  `CivsimPhysicalLight` (`physical: { sunIntensity, exposure, turbidity }` per
  preset — the photoreal exposure is deliberately a NEW field; the flat
  `exposure` stays the bespoke WGSL display knob so campaign/water stay
  byte-identical) + the `noon` preset (id, battle alias, resolve case). Overcast
  sky radiance raised to the flat HIGH-KEY register (the bright grey sky IS the
  light; sun 0.4).
- `packages/photoreal-renderer/src/environment.ts` — spec maps
  `sunIntensity`/`exposure`/`turbidity` from the physical block (constant
  SUN_INTENSITY deleted); `applyCivsimEnvironment` converts the display-referred
  preset colours (sun key, haze background/fog) to linear at the three seam
  (`Color.setRGB(..., SRGBColorSpace)`).
- `packages/photoreal-renderer/src/battle/battleWorld.ts` — the parity output
  overrides (NoToneMapping + LinearSRGBColorSpace) are GONE; the battle world is
  dressed by `applyCivsimEnvironment` (sun DirectionalLight + PMREM'd procedural
  equirect IBL [10a stand-in] + ACES + per-preset exposure + 'haze' background +
  the 3400/8200 fog stand-in). `create(canvas, { environment })` resolves any
  battle alias; `/renderer/photoreal-battle?env=…` wires it.
- `battleTsl.ts` — the two slice-09 seams: `linearAlbedo` (the ONE
  display→linear sRGB EOTF conversion — the battle palette was authored for the
  bespoke non-sRGB swapchain) and `viewNormalNode` (the ONE `normalNode` hook;
  normalNode expects VIEW-space normals). `sunDirectionNode` deleted.
- `terrainLayer.ts` / `foliageLayer.ts` / `crowdLayer.ts` / `seaLayer.ts` — every
  world material is now a `MeshStandardNodeMaterial` response with NEUTRAL
  albedo: baked lambert/key-fill grades and `exposure` multipliers extracted;
  scenery's pass-private sun deleted; the crowd lights its fully posed normal
  (skinned + corpse-rolled + yaw-rotated — the parity port lit the raw skinned
  normal); the sea keeps the Gerstner seam but shades as albedo + roughness
  (foam matte, calm water glossy — the glint is real GGX specular now); field
  water blends albedo + roughness into the ground (wet ground gets real sheen).
  Grass tuft palette carries a 0.84 baked-light extraction (it was authored as
  lit display colours and popped white as raw albedo).
- `overlayLayer.ts` — the Float32Array overlay contracts carry display-referred
  colours; each overlay linearizes through `linearAlbedo` so the gold glow
  (rule 6) and faction accents keep their authored hue under ACES (caught by
  the parity gate's gold-pixel check: unconverted gold washed to pale cream
  228/219/165; converted it reads ~242/195/63).
- NEW scene `web/scenes/battle/photoreal-lighting.mjs` — per-preset `crowd-mid`
  snapshots at fixed setTime, identity → `CIVSIM_ENVIRONMENTS.<preset>`,
  byte-determinism, and preset-swap movement floors (golden↔overcast/noon/dusk).
- `web/tests/photorealEnvironment.test.ts` — physical-block pins: sun round-trip
  both ways, exposure monotonicity (dusk dimmest), DELIVERED ground irradiance
  (intensity × sun height) monotone noon > golden > dusk > overcast, turbidity
  monotone noon < golden < dusk < overcast, deterministic preset swaps.

**Register telemetry (ground band, hardware shots):** golden warmth (R/B) 1.83
vs noon 1.34 / overcast 1.36 / dusk 2.48 — and the new golden default lands on
the old production register (old baked 1.86 @ lum 98 → new physical 1.84 @ lum
100): the default look is preserved in register while the mood became a real
environment. References: golden ref ground 2.62 (its tan albedo is `13`'s work),
overcast ref 1.19 high-key (its pale desaturation needs `10b` fog + `13` albedo).

**Neutral second opinion (unprimed, 4 presets):** same place/geometry/materials,
"differences are palette/lighting only" — the same-materials litmus PASSES; dusk
strongest register, overcast good, golden/noon undermined mainly by missing
shadows (`11`), flat sky card (`10a`), fog only on far peaks (`10b`) — every
finding maps to a named later slice. Unprimed critique findings likewise:
terrain seam/edge (`13a/13d`), placeholder cone peaks (`13c`), soldier
readability at scale (`14`), water glint/shore (`12b–e`), flat sky (`10`).

**TSL/three@0.185 hazards recorded this slice (add to the 06/07/08 list):**
5. `@types/three` drops the node type of TSL `Fn` returns (`sRGBTransferEOTF`
   returns plain `Node`) — re-type at the seam.
6. Four-vertex quads must compute procedural normals PER-FRAGMENT — a
   `varying`-wrapped normal interpolates flat across the quad
   (`terrainQuadMaterial` calls `transformNormalToView` in fragment stage).

**Scaffolding ledger:** the procedural-equirect IBL stand-in now feeds the
production battle world (still dies at `10a`); THREE.Fog stand-in unchanged
(dies at `10b`); the inline per-material haze mixes are re-recorded as part of
the same 10b row (albedo-level stand-ins, one grep: `Aerial stand-in`).

**Standing gates (all green, 2026-07-02):** `cargo test --workspace` (zero
`crates/**` diffs); `test:unit` 48/48 (was 45 — the three new environment
pins); vitest 3/3; full battle + campaign + system scene suites under
SwiftShader post-re-bless ALL CHECKS PASSED (incl. `battle-renderer-default`,
`battle-input`, `battle-terrain-elevation` seating tripwire `match=true`,
`battle-photoreal-parity` incl. its gold-glow and 30.5k hardware legs,
`photoreal-substrate` byte-tolerant, `battle-photoreal-lighting` byte-stable
across runs); **perf ledger row: hardware apple/metal-3, 30,560 soldiers +
548 scenery + vista 184.8k grass blades, GPU median 3.27 ms mid / 2.75 ms
vista (p95 7.74/6.28, 150 samples each), rAF 8.3 ms vsync-pinned — vs
3.31/3.59 at 08b, i.e. the relight costs nothing.** SwiftShader remained the
correctness proxy throughout (ACES + PMREM IBL render fine there — no new
adapter-gated tier needed this slice).

**Human checkpoint (non-blocking, preview-shots, ~10 min window, no response —
decided on the evidence and recorded):** opened the four per-preset close shots
+ the golden sea + the crowd-mid strip + both references in one Preview window.
Call: ACCEPT all four registers for 09. Grounds: (1) the golden default lands
on the old production ground register (warmth 1.84 vs baked 1.86 — the default
look survives the physical rewrite); (2) preset separation is real and
deterministic (dusk warm/dim, overcast flat cool high-key, noon bright neutral;
swap telemetry 8–50 meanAbsDiff on the crowd-mid crop); (3) the same-materials
litmus passes per the unprimed neutral review ("differences are
palette/lighting only"); (4) every register shortfall named by review/critique
(no cast shadows, flat sky card, fog only at far range, tan-vs-green field
albedo) is owned by name by `10a`/`10b`/`11`/`13`. Final mood tuning remains
David's knob at `10c`, where sky + aerial complete the moods.

**Re-bless count: 9 battle baselines** (battle-initial, battle-banner,
battle-manual, battle-ai, battle-camera-zoom, battle-minimap-world-dpr2,
battle-projectiles-dpr2, battle-selection-dpr2, photoreal-parity) — each diff
eyeballed individually before blessing; **+4 new** photoreal-lighting crowd-mid
baselines (golden-hour/noon/dusk/overcast-foggy), byte-stable across runs.
In-budget movers left un-blessed per the 08b precedent: battle-cavalry-plow
0.78%, menu-renderer 0.04%/0.02%, photoreal-pbr/crowd-mid sub-threshold
(max channel Δ12 — the sun boost offset by the lower golden exposure under
ACES). Campaign suites byte-identical (0.0000%); water/terrain lab scenes
byte-identical (bespoke substrate untouched); seating tripwire `match=true`
on all fixtures.
