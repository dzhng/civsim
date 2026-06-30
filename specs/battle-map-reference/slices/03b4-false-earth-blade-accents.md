# Slice 03B4 — false-earth blade accents

## Contract

With meadow mass carrying the field, add only the foreground blade geometry needed
for near-field depth and silhouette. The accent layer may borrow false-earth's
Bezier blade shaping, clump yaw, height AO, view thickness, and distance fade, but
it must keep civsim's palette and battle readability.

## Approach

Stay on the CPU field path for this slice. Either evolve `BattleGrassPass` or add
a sibling `BattleGrassBladePass` that consumes `grassField.ts` records. Do not
switch to compute yet.

Useful false-earth ideas to copy:

- Bezier/tapered blade strips with near/mid/far segment budgets;
- clump-center yaw plus per-blade yaw jitter;
- terrain-normal base alignment with tips biased toward sky;
- height-based AO/dark bases and distance desaturation;
- view-dependent thickness for side-on readability.

Carry forward the 03B2 critique as geometry guidance. Some packed-field clumps
look weakly seated because dark base marks and bright blades do not always share
a convincing root; some blades lean far enough to read as flattened against the
ground. This slice owns that visual fix. Prefer better base anchoring,
height-based darkening, tapered silhouettes, and distance fade over simply adding
more cards.

Things not to copy:

- Three.js/TSL, Leva controls, character push/waves, emissive/neon/metallic
  material settings, and false-earth's exact cool color palette.

## Fixed Inputs

- Freeze the accepted Slice 03B3 meadow layer.
- Keep cliff shape/texture, sky, fog, water, and final composition fixed.
- Keep broad color/softness tuning minimal; Slice 03C owns final grass color and
  sparkle.

## Accept / Reject

Use foreground and midground grass crops. Judge:

- near foreground has blade silhouettes and clumped vertical depth;
- midground does not dissolve into bright stippled dots;
- no circular focus mask or hard density boundary is visible;
- route stats show materially less geometry than the rejected card-only spike for
  the same apparent density.

Reject if the current opaque tuft mesh remains visibly sharp/spiky and no
alternative strip/material path is tried.

## Verification

- `battle-map-reference` writes updated candidate and grass crop artifacts.
- Use `compare-screenshots` on foreground and midground grass crops to compare
  accent coverage, stipple/noise, and density falloff.
- Run unprimed `screenshot-critique` scoped to foreground grass accent geometry
  only.
- `battle-grass`, `battle-terrain-3d`, `battle-terrain-elevation`, and
  `full-game-rendering-performance` stay green.

## Next Slice

After foreground accents are accepted, implement
`03b5-readability-and-perf-gate.md`.
