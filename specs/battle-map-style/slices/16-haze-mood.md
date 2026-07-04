# 16 — Haze / mood preset

Aerial perspective finishes the composition — deliberately last, so fog can
never launder failed geometry or grass.

## Contract unlocked

The `battle-overcast-highland` register exists as an environment preset;
distance does the reference's depth work across grass, cliffs, and water.

## API seam

- Extend `CIVSIM_ENVIRONMENTS` (the one mood owner) — likely evolving the
  existing `overcast` preset or adding `overcast-highland`: high-key
  near-white sky, low-contrast sun, deep aerial haze, lifted far values. All
  haze through `scene.fogNode` (the one aerial owner). Zero new fog code, no
  material-local tinting.
- Per-map-family default: the descriptor/catalog selects the preset; generated
  highland maps default to it, hand maps keep their current defaults.
- **Fog runway rule (research-backed):** fog must reach full opacity at or
  before the vista's outer edge in each direction — geometry past saturated
  fog is waste, geometry ending before it silhouettes against sky. E/W the
  tall ridges *are* the horizon; N/S the haze closes it. Blend fog to the sky
  at the horizon (fade-to-skybox band), never constant-color to a hard line.
  If N/S needs implausibly heavy haze to close at the 2× vista edge, invoke
  slice 14's optional outer ring instead of thickening the mood.

## Human can run

The vista route toggling presets (`overcast-highland` ↔ `golden-hour`) on the
same seed.

## Verification

- Judged crop: the `sky-haze` band and the mid→far desaturation gradient
  only. compare-screenshots against the reference's haze; screenshot-critique
  last.
- The preset must not be doing geometry's job: a fog-off render of the same
  frame must still pass the slice-02/13/14 crops (regression check that the
  bands' verdicts don't depend on haze).
- Soldiers/units stay legible at gameplay zoom under the preset (aesthetics
  rule 2).
- **Out of scope wrongness:** everything near-field.

## Stays green

All prior band verdicts fog-off; snapshots re-blessed deliberately; perf.

## Feedback that would change it

Mood taste (warmer/cooler, deeper/shallower haze) — preset fields on the one
owner.

## Precondition

Slices 11 and 13 accepted. If a fog knob seems needed to make grass or cliffs
acceptable, STOP and reopen the owning slice — recorded law from the
predecessor spec.
