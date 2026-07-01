# Slice 05A — cliff/ridge silhouette and depth rows

## Contract

Match the reference's **general cliff and ridge shape**: a continuous left ridge
wall, receding depth rows, and non-pyramidal skyline. This slice is silhouette and
layout only.

## Fixed Inputs

- Grass and terrain slices are frozen.
- Do not tune cliff face texture, pale streaks, sky, distance fog, water, or final
  whole-frame colour in this slice.
- The backdrop remains presentation only; edge roles and passability semantics stay
  unchanged.

## Accept / Reject

Use `compare-screenshots` on a cliff/ridge mask crop. Judge:

- left cliff mass position and height relationship;
- continuous wall vs. isolated pyramids;
- number and placement of receding ridge rows;
- skyline shape and screen occupancy.

Do **not** reject this slice for missing rock streaks, wrong haze strength, grass
colour, or water material. Those are later slices.

## Verification

- A route publishes backdrop stats separately from sealed edge stats.
- `battle-terrain-blockers` still proves sealed edges and `edgeSealMismatches`.
- The cliff/ridge crop and mask artifacts are committed for review.
- Run the neutral review/screenshot critique with a prompt scoped to cliff/ridge
  silhouette and depth rows only.

## Next Slice

After the cliff/ridge silhouette is accepted, freeze the geometry and tune face
texture in `05b-cliff-texture.md`.
