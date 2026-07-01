# Slice 09 — Lighting core (physical sun + IBL + tonemap)

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
