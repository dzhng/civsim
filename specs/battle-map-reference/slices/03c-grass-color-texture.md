# Slice 03C — grass color, softness, and wind texture

## Contract

With foreground density frozen, tune the grass to read like the reference meadow:
cooler neutral-green under overcast light, less yellow, less sparkly, and softer as
a mass while still resolving as blade geometry up close.

## Fixed Inputs

- Freeze the accepted Slice 03B density/coverage curve.
- Keep cliff shape/texture, sky, fog, water, and final composition fixed.
- Do not hide a density problem by blurring, fogging, or dimming the crop.

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
