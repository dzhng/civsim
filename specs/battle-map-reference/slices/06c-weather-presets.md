# Slice 06C — swappable weather presets

## Contract

Prove the warm-vs-cold look is environment lighting, not repainted materials. The
same accepted map assets render under `overcast-foggy` for the reference and
`golden-hour` for the Aegean register.

Do not build a separate battle-only weather stack. Promote the water work's
environment shape into a shared renderer contract: sun azimuth/elevation, key color,
fill color, haze color, and exposure are one preset object consumed by water, sky,
terrain, ridges, grass, soldiers, and any later battle atmosphere pass. The clean
owner is `CIVSIM_ENVIRONMENTS`; `WATER_ENVIRONMENTS` and battle-facing names
(`overcast-foggy`, `golden-hour`) are aliases over that source, not separate constant
sets.

`dusk` can remain a water/lab preset until a battle slice explicitly needs it. The
important merge is architectural: every surface reads the same shared environment
fields and keeps material albedos neutral, so adding another weather state later
changes preset uniforms instead of repainting grass, cliffs, water, or soldiers.

## Fixed Inputs

- Sky plate and distance fog mechanics from 06A/06B are frozen.
- Material albedos stay byte-identical between presets.
- Do not change geometry, grass density, cliff texture, or water placement.

## Accept / Reject

Use paired captures of the same view under both presets. Judge:

- `overcast-foggy` matches the cool reference mood;
- `golden-hour` matches the warm Total War Saga/Aegean mood;
- the difference comes from preset uniforms/parameters, not material edits.

## Verification

- Route stats publish the active `EnvironmentPreset`.
- Route stats also publish the environment source/adaptation path, e.g.
  `CIVSIM_ENVIRONMENTS.overcast` feeding battle `overcast-foggy` and water alias
  `WATER_ENVIRONMENTS.overcast`, so reviewers can see neither side is a private fork.
- A test or probe records that base material colours are unchanged between preset
  captures.
- A same-albedo paired capture includes water and at least one non-water surface
  (grass/terrain/ridge) to prove the shared preset object drives both the water mood
  and the battle atmosphere.
- `compare-screenshots` uses the overcast crop set against the target and the
  golden-hour shot against the aesthetics references.
- Run the neutral review/screenshot critique with a prompt scoped to preset mood
  and same-albedo proof only.
- A `change-report` records intentionally moved battle baselines.

## Out Of Scope

This slice does not fix remaining geometry or composition errors. Those must loop
back to their owning slices.
