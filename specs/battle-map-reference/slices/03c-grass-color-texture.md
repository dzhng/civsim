# Slice 03C — grass color, softness, and wind texture

## Contract

With the grass field architecture, meadow mass, foreground accent geometry, and
readability/perf gate frozen, tune the grass to read like the reference meadow:
cooler neutral-green under overcast light, less yellow, less sparkly, and softer
as a mass while still resolving as blade geometry up close.

## Approach

Treat this as a surface/tone pass on top of an accepted density architecture:

- tune palette chips, base/tip gradients, height AO, and distance desaturation
  against foreground and midground grass crops;
- soften sparkle by adjusting material contrast, mip/alpha treatment, and
  distance fade, not by hiding missing meadow mass with blur or fog;
- keep wind as low-frequency field texture plus small blade variation, avoiding
  synchronized card sway;
- preserve the 03B architecture switch and stats so color changes cannot mask
  a regression in density, geometry, or perf.

## Fixed Inputs

- Freeze the accepted Slice 03B1-03B5 grass architecture: field data, packed
  slope/normal behavior, field-driven meadow material, foreground accents, and
  readability/perf budgets.
- Keep cliff shape/texture, sky, fog, water, and final composition fixed.
- Do not hide a density problem by blurring, fogging, or dimming the crop.
- Do not switch to GPU compute in this slice; Slice 03B6 owns that optional
  implementation escalation.

## Accept / Reject

Use `compare-screenshots` on foreground and midground grass crops. Judge:

- average colour and saturation against the target crop;
- edge energy/noise ratio, especially the current stippled blade sparkle;
- wind phase variation as a field texture, not every tuft moving as one card.

Do **not** use the whole hero frame as acceptance. Wrong cliffs or water are
recorded as later-slice debt.

## Verification

- `battle-map-reference` grass crops updated.
- `battle-grass` fixed-phase wind still changes pixels deterministically.
- Run the neutral review/screenshot critique with a prompt scoped to grass colour,
  softness, and motion texture only.
- The terrain/gameplay shots still keep units and selection readable.
- `full-game-rendering-performance` stays inside budget.

## Next Slice

After grass density and texture are accepted, move to valley relief / hummock shape.
