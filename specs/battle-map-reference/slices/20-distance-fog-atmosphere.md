# Slice 20 - distance fog and environment

## Contract

Add the overall distance fog effect so foreground grass, midground meadow, and
background cliffs recede coherently with distance, reusing the same
environment/fog abstraction used by the water work.

## Slice Variable

Depth atmosphere only.

- **Judge:** distance fade, haze color, cliff/background softening, depth
  layering across bands, and continuity with the water environment presets.
- **Do not judge:** grass density, cliff height, terrain topology, camera
  framing, or final whole-frame style parity.

## Architecture

- Consume the shared `WATER_ENVIRONMENTS` family or its canonical successor for
  sun direction, key/fill colors, haze color, fog, and exposure.
- Battle-facing names such as `overcast-foggy` and `golden-hour` should be
  aliases/adapters over the shared environment family, not separate constants.
- Keep materials neutral. Do not tint grass/cliffs locally to fake haze.
- Apply fog consistently across terrain, grass, cliffs, water, soldiers, and
  sky where those systems are present.
- Fog comes after the geometry and band slices. If fog is needed to make cliffs
  or midground acceptable, reopen the owning slice instead.

## Review Surface

- Full perspective shot plus depth crops: foreground, midground, background
  cliffs.
- Fog-off/fog-on comparison from the same locked camera.

## Verification

- Publish environment preset id, fog color, fog near/far or density parameters,
  exposure, sun direction, and whether each major render layer consumed the
  shared environment.
- Run
  [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md)
  against the latest water fog shots and the perspective reference for distance
  haze only.
- Run
  [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md)
  scoped to depth atmosphere only.

## Accept / Reject

Accept if distant terrain/cliffs soften naturally while foreground grass remains
legible and materials still use neutral base albedos.

Reject if fog hides weak geometry, if battle forks separate environment
constants, or if layers disagree about haze/exposure.

## Next

Run `21-style-family-compose.md`.
