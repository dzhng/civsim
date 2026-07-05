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
- **Fog runway rule (research-backed):** fog must reach full opacity inside
  slice 14's far fog ring, always before its outer edge — geometry past
  saturated fog is waste, geometry ending before it silhouettes against sky.
  E/W the tall ridges *are* the horizon; N/S the haze closes it over the far
  ring's sinking plain. Blend fog to the sky at the horizon (fade-to-skybox
  band), never constant-color to a hard line.

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

## Landed (2026-07-05) — code landed, browser blessing owed

- Added the shared `overcast-highland` environment preset on
  `CIVSIM_ENVIRONMENTS`; the legacy battle URL alias `overcast-foggy` now
  resolves to that preset, while `golden-hour` remains the hand-map default.
  No material-local fog or albedo tint was added.
- The aerial owner still routes all haze through `scene.fogNode`, but the
  in-scatter sample now fades near-horizon terrain toward the sky LUT horizon
  colour instead of holding the below-horizon ground-bounce colour up to a
  crisp line.
- Generated maps get their default environment from the battle map catalog
  seam (`GENERATED_BATTLE_MAP_DEFAULT_ENVIRONMENT = overcast-highland`) and
  copy it onto the generated descriptor in web/lab launchers. `?env=` remains
  authoritative.
- Scene `battle-genmap-mood` boots `?map=gen&seed=7` with no `env` override,
  checks the generated default, asserts the far-fog-ring outer edge is sky-
  matched, asserts the playable mid field is not sky-matched, reports the
  far-ring horizon projection, and snapshots the full vista plus sky-haze and
  mid-field crops.

**ORCHESTRATOR-TODO:** run/bless `battle-genmap-mood`; re-run affected
overcast/golden battle baselines; run screenshot-critique unprimed and
compare-screenshots against the overcast-highland reference; verify
`battle-genmap-clay` fog-off and prior band verdicts; run `perf:30k` on
hardware.

## Landed (2026-07-05)

- `overcast-highland` preset on the one owner (turbidity 9.8 - no new
  fields needed); fade-to-skybox horizon blend in aerialPerspective (the
  slice-14 pale-strip debt closed); generated maps default to the preset
  via mapCatalog with ?env= override. Runway numbers honest: visibility
  3.46 km, units read at 2 km (T=0.122), 5% saturation at 2793 m (just
  inside the N/S ring at 2800 m), E/W outer edge T=0.010.
- Orchestrator fix: the far-ring fog check uses the MEDIAN sample delta -
  E/W corner samples compare ring pixels against ridge silhouettes above
  them (terrain-on-terrain), not sky. Median 3.7 vs threshold 12.
- **Two PRE-EXISTING main regressions surfaced by the re-bless sweep**
  (verified failing on main before this slice; not caused here):
  battle-photoreal-shadows "grove crop on-vs-off" delta is exactly 0
  (shadows not rendering on that toggle path) and battle-photoreal-sky's
  golden band reads neutral instead of warm. Both slipped through an
  earlier slice because those scenes were not in the per-slice suites.
  OWED: a maintenance pass on main before slice 17's compose verdict.

## Feedback that would change it

Mood taste (warmer/cooler, deeper/shallower haze) — preset fields on the one
owner.

## Precondition

Slices 11 and 13 accepted. If a fog knob seems needed to make grass or cliffs
acceptable, STOP and reopen the owning slice — recorded law from the
predecessor spec.
