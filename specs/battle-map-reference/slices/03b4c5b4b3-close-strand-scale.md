# Slice 03B4C5B4B3 - close strand scale

## Contract

Add the right close foreground strand size and directional read on top of the
accepted body coverage. This slice owns **strand scale and direction only**.

Out of scope: changing body coverage amount, clump envelope, colour, atlas tile
palette, terrain seating, procedural generation, LOD, fog, water, cliffs, sky,
and full-scene composition.

## Approach

- Freeze the B4B2 body coverage result and lab camera.
- Tune only local strand width/height ratio, yaw distribution, bend envelope,
  strand alpha softness, and directional breakup.
- Keep coverage and exposed-ground metrics from B4B2 from regressing.

## Accept / Reject

Accept if close crops show readable grass strand direction at the target scale
without turning into pixel grit, straw wires, scratches, stamped cards, or
high-contrast confetti.

Reject if fixing strand read requires changing density budget, meadow/root
material, atlas colour, fog, camera, or midground LOD.

## Verification

- Archive close-hero crop, 2x/4x tight crops, edge maps, and stats JSON.
- Use `compare-screenshots` on the close-hero and tight crops against the target
  and B4B2 regression crop.
- Run unprimed `screenshot-critique` scoped to strand size, strand direction,
  primitive legibility, and scratch/grit/card artifacts.

## Next Slice

Continue with `03b4c5b4b4-clump-softness-height-variation.md`.
