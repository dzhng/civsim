# Slice 03B4C5B4B2 - close body coverage

## Contract

Make the close lab read as dense, soft foreground grass body with acceptable
ground exposure. This slice owns **coverage envelope only**.

Out of scope: strand direction, clump rhythm, atlas colour/content, terrain
seating changes, camera-relative generation, transition/midground LOD, fog,
water, cliffs, sky, and final reference compose.

## Approach

- Freeze the accepted B4B1A0 close test surface, B4B1A1S accepted body render model,
  B4B1A2 target perf budget, terrain patch, lighting, palette, meadow base, root
  base, and comparison crops.
- Tune only body height, body width, coverage scalar/alpha multiplier with the
  atlas texture frozen, root-to-tip coverage, seating offset, and tip bias for
  the selected body primitive.
- Compare against the target close-hero crop and the rejected `field-fiber-shell`,
  `texture-volume`, `texture-carrier`, and `texture-micro-carrier` baselines.
- Do not swap primitive families here. If the accepted B4B1A1S technique cannot
  plausibly cover the ground after shallow tuning, record the failure and reslice
  instead of turning B4B2 back into a broad technique search.

## Accept / Reject

Accept if the close crop reads as continuous soft grass body with much less
exposed flat meadow, while primitives do not read as sparse specks, stamps,
straw wires, card walls, curtains, or painted ground.

Reject if the gain comes from changing palette, fog, camera scale, terrain
material, meadow/root colour, atlas art, or full-frame composition.

## Verification

- Archive full lab shot, close-hero crop, tight crops, stats JSON, and
  baseline-vs-candidate crop sheet.
- Use `compare-screenshots` against the target close-hero crop and rejected
  baselines. Judge body coverage and exposed-ground ratio only.
- Run unprimed `screenshot-critique` scoped to body density, exposed ground,
  primitive legibility, and card/speckle/stamp artifacts.
- Keep B4B1's close-scale crop as a regression guard.

## Next Slice

Continue with `03b4c5b4b3-close-strand-scale.md`.
