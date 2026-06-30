# Slice 06C — swappable weather presets

## Contract

Prove the warm-vs-cold look is environment lighting, not repainted materials. The
same accepted map assets render under `overcast-foggy` for the reference and
`golden-hour` for the Aegean register.

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
- A test or probe records that base material colours are unchanged between preset
  captures.
- `compare-screenshots` uses the overcast crop set against the target and the
  golden-hour shot against the aesthetics references.
- Run the neutral review/screenshot critique with a prompt scoped to preset mood
  and same-albedo proof only.
- A `change-report` records intentionally moved battle baselines.

## Out Of Scope

This slice does not fix remaining geometry or composition errors. Those must loop
back to their owning slices.
