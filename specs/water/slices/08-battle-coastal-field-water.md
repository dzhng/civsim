# Slice 8 — Battle coastal FIELD water → shared `waterShade` material

**The seam-foundation slice, and the richest/riskiest of the integration set.** The frozen
open-sea look (S2–S7) is brought onto civsim's **on-field** battle water (rivers, lakes,
shallows, shore) — the water soldiers fight beside. This slice is FIRST (ahead of the open-sea
horizon, S9) on purpose: the field↔sea shoreline seam is a *material mismatch*, so making the
field water the same material as the sea is what lets S9's seam not exist. Read
[`08-integration-notes.md`](08-integration-notes.md) first.

## Contract unlocked
On-field water renders through the shared `waterShade` (Aegean albedo × the battle `golden`
preset + whitecap foam + sun-glint + a **distance-from-shore** depth/haze ramp) instead of the
flat `groundPass` tint — and establishes the shared **`waterShoreRamp`** helper that S9's open sea
reuses so both sides of every shore are one material. Soldiers and props still stand on the ground.

## API seam (module / functions / data / ownership) — owner: game-renderer/battle
- **New shared helper `water/waterShoreRamp.ts`** (or a section of `waterPalette.ts`):
  `waterShoreRampWgsl(params)` emitting `depth01`/`haze01` keyed on **distance-from-shore** (not
  camera distance — the attempt-1 fix: an inland camera wrongly reads the near shore as "deep").
  Params: `shoreDist` source, `depthNear/depthFar`, `hazeNear/hazeFar`, `baseZ`. **Refactor
  `waterPlanePass.ts`'s inline ramps (`depth01 = smoothstep(20,420,dist)`, `haze01 =
  smoothstep(55,300,dist)`, ~lines 143–149) to call this helper with defaults = today's lab
  values**, so every frozen `water-*.mjs` lab scene stays byte-identical. This is where the
  reverted `baseZ`/`hazeNear/Far`/shore-keyed-depth generalizations are rebuilt — as a shared helper.
- **`battle/groundPass.ts` (the LIVE battle path):** add a per-vertex **water-weight** float
  (0..1), box-filtered exactly like `cellColor` (`groundPass.ts:150–161`), derived from
  `grid.tint == 1`; stride 36→40 (9→10 floats). No back-compat/migration shims (pre-release).
  In `fs`, where weight > 0, sample `waterField(world, cam.time)` (normal + foam) and blend
  `waterShade(golden, shoreRamp)` by the weight, **replacing `TINT_COLOR[1] = [0.26,0.40,0.52]`
  (`groundPass.ts:23`)**. Inject `WATER_PALETTE_WGSL` + `waterEnvironmentWgsl(golden)` +
  `WATER_SHADE_WGSL` + the shore-ramp into `GROUND_WGSL`; `cam.time`/`sunDirection()` already live
  in the group-0 camera uniform (no new bind group). Add `gpuMultisample(shell.sampleCount)` to the
  ground pipeline if it omits it (verify no snapshot move at sampleCount 1).
- **Do NOT displace the collision surface.** The mesh z stays the gameplay height field; soldiers/
  props ride it. Ripple is per-fragment (normal + foam) only. (An optional *tiny* visual-only
  vertical wiggle that never feeds `terrainHeightAt` is a slice-time call — default to none and let
  the seating gate decide.)
- **`battle/terrainPass.ts` (LAB fixtures only — the live battle does not use it):** fold the
  inline kind-0 (`:89–104`) and kind-10 (`:161–166`) water onto the same `waterShade` +
  `waterShoreRamp` so `/renderer/battle-terrain-*` lab fixtures match production. Same WGSL — do it
  in this slice.

## What the human can run / see
`/renderer/battle-terrain-3d?gate=river-and-crags&view=field&t=3.0` (3/4 gameplay camera) and a
live battle on a river/lake map. New scene `web/scenes/battle/water-coastal.mjs` (`VERIFY_GPU=1
VERIFY_GPU_ADAPTER=hardware VERIFY_HEADFUL=1`, snap at fixed `shell.setTime(t)`).

## Verification gates
- `snapCheck` re-bless of the coastal/river field shots at fixed `t`; **change-ledger** the re-bless.
- **Seating invariant (load-bearing):** soldiers/props do not float or sink — prove the collision
  height field is untouched with a **position-hash A/B**, not byte-identity (memory: "golden hash
  has no cavalry").
- No z-fight / hard shore edge against `terrain/heightField.ts`; MSAA-safe; determinism at fixed `t`.
- Perf with the **full crowd present** (`gpuTimeMs`; Gerstner is the floor).
- **`compare-screenshots`** vs a **shore-grade target** (shallow tan → turquoise → blue with swash
  foam) — **NOT** `assets/reference-ifft-ocean-dusk.png` (that is deep ocean; coastal is shallow/calm).
  Add the shore-grade target image to `assets/` if none exists.
- **Last check (required): run the [`screenshot-critique`](../../../.claude/skills/screenshot-critique)
  skill** on the `view=field` crop — an unprimed second opinion: "does the river/shore read as
  turquoise→blue shallow water with subtle foam, meeting land cleanly, soldiers still grounded?"

## Slice variable & crop
**Variable:** the field-water *material* (colour + foam + shore ramp), and the shared
`waterShoreRamp` seam. **Crop:** the shoreline / shallows band at the 3/4 gameplay camera. **Frozen
inputs:** `gerstnerField`, `WaterFieldSource` seam, `WATER_SHADE_WGSL`, `WATER_PALETTE_WGSL`,
`WATER_ENVIRONMENTS.golden`, `cam.time`/`sunDirection()`.

**Out of scope:** the open-sea horizon edge (S9 — keep the gate scene framed with **no ocean edge
in view** so the still-old sealed-edge gradQuad can't inject a temporary seam); campaign; wave
*look* re-tuning (frozen).

## What must stay green
`groundPass` relief/normal lighting, the mud/churn `earth` branch, prop/soldier seating; the
non-water tints `TINT_COLOR[2..6]`; `battle-terrain-features.mjs`, `battle-terrain-elevation.mjs`;
**all seven `web/scenes/system/water-*.mjs` lab scenes byte-identical** (the ramp helper defaults
to today's lab values).

## Human review checkpoint (NON-BLOCKING)
[`preview-shots`](../../../.claude/skills/preview-shots) the shoreline crop; give ~5 min; if the
user is silent, decide on the evidence, record the decision + rationale here, close the shots, and
proceed.

## Feedback that would change this slice
"Water floats the soldiers / breaks seating" → you displaced the collision surface; go per-fragment
only. "Shore stripe / two materials" → the ramp isn't shared or uses camera-distance not
shore-distance. "Too choppy for a calm river" → drop amplitude (coastal is calmer than the open sea).
"Dedicated pass instead of per-fragment?" → rejected here (would lift water off the mesh soldiers
ride); recorded as the genuine alternative.
