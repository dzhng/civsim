# Slice 1 — The environment seam (invisible, byte-identical)

The foundation, and the one slice whose success is measured by **nothing changing**. It
introduces `BattleEnvironment` and threads it — golden = today's exact values — through the
ground, the blockers, and the battle water, so every later slice has one object to read.

## Contract unlocked
A single `BattleEnvironment` flows from the battle route/renderer into every battle surface
and into the battle water pipelines (via an adapter), and reproducing today's `golden`
numbers moves **no pixel anywhere**. Every later slice's "read the env" API exists.

## API seam (module / functions / data / ownership) — owner: game-renderer/environment
- **Shared `environment/environment.ts`:** the `CIVSIM_ENVIRONMENTS` preset family owns
  sun, key/fill, haze, and exposure. `BATTLE_ENVIRONMENTS.golden-hour` and
  `WATER_ENVIRONMENTS.golden` are aliases over the same source; `battleEnvironmentWgsl(env)`
  and `waterEnvironmentWgsl(env)` emit pass-facing constants from that owner.
- **`battle/groundPass.ts`, `battle/horizonPass.ts`, `water/fieldWaterWgsl.ts`:** replace the
  hardcoded `WATER_ENVIRONMENTS.golden` imports with the env threaded in from the caller
  (constructor/param). `fieldWaterWgsl.ts`'s `FIELD_WATER_WGSL` const becomes
  `fieldWaterWgsl(env)`; `BattleGroundPass`/`BattleHorizonPass` take a `BattleEnvironment`.
  The blocker greys and the two hardcoded suns are **kept as-is** (their unification is
  S5/S6) — this slice only re-routes the water env and establishes the object.
- **`apps/renderer-lab/src/router.ts` (`routeBattleTerrain3d`):** construct
  `env = BATTLE_ENVIRONMENTS.golden`, add a `?env=` param (only `golden` valid yet), pass it
  to the ground/horizon passes and `battleWaterEnvironment(env)` to the ocean `WaterPlanePass`.
  The `clear` and (absence of) `setSun` stay exactly as today.
- **Do NOT fork** `CIVSIM_ENVIRONMENTS`, `WATER_ENVIRONMENTS`, `water/waterMaterialWgsl.ts`,
  the `WaterPlanePass` lab path, or `web/src/battle/renderer.ts` (live wiring is S7).

## What the human can run / see
`/renderer/battle-terrain-3d?gate=coastal-scrub&view=field&env=golden` — visually identical
to today.

## Verification gates (the gate IS byte-identity)
- `battle-terrain-3d`, `battle-terrain-features`, `battle-terrain-elevation` (incl. the
  seating `match=true` behavioral check), `battle-terrain-blockers`, `water-coastal`,
  `water-open-sea` all stay **byte-identical (0 px, no re-bless)**.
- The **six `web/scenes/system/water-*.mjs`** stay byte-identical (they never see the env).
- No `screenshot-critique` (nothing visual changed) — but if any snapshot moves, the golden
  numbers are wrong: fix them until zero, or the seam is not established.

## Slice variable & crop
**Variable:** none (pure seam). **Crop:** n/a. **Frozen inputs:** every current pixel.

**Out of scope:** the sky (S2), any haze/sun unification (S3–S6), live wiring (S7).

## What must stay green
Everything. This slice's definition of done is that the whole battle + water suite is
byte-identical with the env threaded through.

## Known unknowns to resolve here
1. Confirm golden's `BattleEnvironment` reproduces the inline consts exactly (land has no
   haze → trivial; the water golden preset via the adapter; blockers unchanged).
2. Produce the **snapshot census**: which battle shots are behavioral (byte-identical
   forever) vs look (re-bless when their variable lands). Record it in the README handoff.

## Feedback that would change this slice
"A snapshot moved" → the golden env numbers don't match a current inline constant; find
which surface and match it. "Too much env surface at once" → thread only ground+water+
blockers; do not pull sky/sun/fog knobs in until their slices.
