# Slice 03B4C5B4B5 - close palette and atlas lock

## Contract

Lock the close-lab grass colour, atlas opacity, and near-body texture integration
after body coverage, strand scale, and clump rhythm are accepted. This slice owns
**close foreground palette and atlas integration only**.

Out of scope: body architecture, coverage amount, strand scale, clump envelope,
camera-relative generation, backend policy, LOD collapse, cliffs, water, sky,
fog, terrain silhouette, and full `battle-map-reference` compose.

## Approach

- Freeze the accepted B4B1A0 close test surface, B4B1A1S body render model, B4B1A2
  perf envelope, B4B2 body coverage, B4B3 strand scale, and B4B4 clump rhythm.
- Use the battle-map-reference/aesthetics grass palette and existing grass colour
  constants as the source of truth. Do not introduce generic saturated greens or
  yellow-brown rescue tints.
- Tune only atlas alpha response, base/tip colour relationship, local hue
  variation, mipped edge softness, and repeated tile silhouette visibility.
- Compare the close-hero and tight crops for hue/luminance/softness only. Do not
  keep tuning density to make the colour crop look fuller.
- Keep the transition and mid-mass crops as context, not acceptance gates; their
  strand collapse belongs to B4D.

## Accept / Reject

Accept if the accepted close grass body still reads as the same body/strand/clump
shape while its colour sits in the muted Aegean grass range, with darker seated
bases, softer tips, and no obvious repeated cutout motifs.

Reject if the improvement comes from changing density, primitive family, camera,
fog, terrain material, meadow/root coverage, or LOD bands, or if the result hides
weak body structure behind broad palette shifts.

## Verification

- Archive close-hero crop, 2x/4x tight crops, atlas swatch/preview if useful,
  stats JSON, and a palette decision note under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/palette-atlas-lock/`.
- Use `compare-screenshots` against the target close-hero crop and B4B4
  regression crop. Judge hue, luminance, opacity softness, and tile repetition
  only.
- Run unprimed `screenshot-critique` scoped to colour, atlas repetition, texture
  artifacts, and whether density/body accidentally changed.
- Open the close crop sheet with `preview-shots` as a non-blocking checkpoint.
- Keep focused lab route checks and `tsc --noEmit` green.

## Next Slice

Continue with `03b4c5b4c0-camera-relative-backend-spike.md`.
