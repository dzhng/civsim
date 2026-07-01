# Slice 03B4C5A - density and soft coverage record

## Contract

Record the 03B4C5 density/coverage pass as evidence, not acceptance. This slice
answers whether simply increasing texture-volume field-cell coverage and making
low-alpha pixels softer can create the reference foreground's continuous fuzzy
grass body while keeping meadow colour, root material, camera, terrain, fog, and
atlas content fixed.

## Current Result

Landed as WIP evidence and **visually rejected**.

- Texture-volume now uses `field-cell` aggregation with `1900` reference-camera
  cells and `2064` submitted texture records.
- The texture mesh was reduced to `20` triangles per record so coverage can
  increase while staying below the old rejected all-card budget:
  `41280` submitted triangles.
- The texture shader now turns low-alpha atlas pixels into soft meadow-coloured
  card coverage instead of only hard cutouts.
- The focused workbench route remains valid: generated atlas telemetry is
  `256x64`, `4` tiles, `65536` bytes.

## Visual Learning

The pass improved the foreground metric but did not solve the visual target.

- Against target crops, foreground `edgeEnergyRatio` moved to `0.73170`, but
  midground is still only `0.48966`.
- Against the field-fiber-shell baseline, texture-volume foreground edge energy
  is `2.42334x`, while midground barely changes at `1.02795x`.
- Neutral screenshot critique rejects the shot: the candidate is too sparse,
  reads as repeated stamps/cards/flecks, lacks fuzzy continuous volume, has wrong
  scale, weak midground falloff, a flat exposed ground plane, smeared base
  streaks, and poor yellow-olive primitive integration.

## Evidence

Use the archived evidence under
`assets/03b4-evidence/03b4c5-texture-backed-grass-volume/`:

- `texture-volume-full.png`
- `primitive-family-crops.png`
- `diff/visual-parity-diff.json`
- `diff-vs-field-shell/visual-parity-diff.json`

## Verification Run

- `UPDATE_SHOTS=1 VERIFY_URL=http://127.0.0.1:5177 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-map-reference-primitive-family`
- `VERIFY_URL=http://127.0.0.1:5177 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs renderer-lab-routes`
- `VERIFY_URL=http://127.0.0.1:5177 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-map-reference`
- `node --experimental-strip-types --import ./web/tests/register-ts-extension-loader.mjs --test web/tests/grassModels.test.ts web/tests/grassField.test.ts`
- `./node_modules/.bin/tsc --noEmit`
- `git diff --check`

## Next Slice

03B4C5B has since verified/rejected the placement/scale-only follow-up. Continue
with `03b4c5b2-continuous-coverage-carrier-spike.md`. Do not keep tuning count,
low-alpha shader coverage, mesh budget, and carrier architecture together.
