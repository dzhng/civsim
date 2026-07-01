# Slice 03B4A — accent candidate workbench

## Contract

Expose named 03B4 accent primitive candidates through the existing packed grass
field path so future passes can compare primitive families without changing the
camera, meadow material, field records, fog, cliffs, water, or final composition.

This slice is an architecture/evidence slice, not visual acceptance for grass
volume.

## Approach

Stay in `BattleGrassPass` and the existing `world-opaque` depth-writing pass.
Add an `accentStyle` contract to the packed-field path:

- `tuft` keeps the rejected old blade mesh available for comparison only.
- `root-shadow` draws low-contrast terrain-seated marks from field records.
- `fiber-ribbon` draws tapered/fiber ribbon silhouettes.
- `hybrid-root-fiber` combines seated root marks and muted ribbons.

The focused proof route is `/renderer/battle-grass-field?mode=field-accent`.
The reference route accepts `grassAccentStyle=<style>` so each candidate can be
captured at the same highland-valley reference camera.

## Current Result

Landed as WIP evidence:

- `packages/game-renderer/src/models/shared/grassModels.ts` owns the named
  primitive builders.
- `packages/game-renderer/src/battle/grassPass.ts` carries `accentStyle` through
  stats.
- `apps/renderer-lab/src/router.ts` exposes the route query params and defaults
  the 03B4 WIP to `root-shadow`, not the old `tuft`.
- `web/scenes/battle/battle-grass-field.mjs`,
  `web/scenes/battle/battle-map-reference.mjs`, and
  `web/scenes/system/renderer-lab-routes.mjs` reject the old `tuft` style as the
  default field-accent proof.

Evidence:

- `assets/03b4-evidence/primitive-matrix.png` compares `tuft`, `root-shadow`,
  `fiber-ribbon`, and `hybrid-root-fiber` at the reference camera.
- `assets/03b4-evidence/foreground-target-vs-root-shadow.png` compares the
  current root-shadow WIP against the target foreground crop.
- `assets/03b4-evidence/wide-root-shadow-matrix.png` records the failed wider
  root-shadow parameter spike.

Visual decision:

- `root-shadow` is the least noisy candidate and is much cheaper than the old
  tuft path, but it is still not accepted.
- `fiber-ribbon` and `hybrid-root-fiber` reintroduce visible yellow/green speckle
  before they create useful fuzzy volume.
- Wider/lower-count root-shadow patches still read as a planted field of small
  strokes rather than continuous meadow volume.

Neutral review says the candidate remains far too smooth and sparse: it lacks
fuzzy/clumped volume, darker density pockets, and near-to-mid density falloff.

## Verification

- `node --experimental-strip-types --import ./web/tests/register-ts-extension-loader.mjs --test web/tests/grassModels.test.ts web/tests/grassField.test.ts`
- `./node_modules/.bin/tsc --noEmit`
- `UPDATE_SHOTS=1 VERIFY_URL=... VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-grass-field battle-map-reference`
- `VERIFY_URL=... VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs renderer-lab-routes`
- Use `compare-screenshots` on foreground/midground crops and record the verdict.
- Run unprimed `screenshot-critique` scoped to grass volume only.

## Next Slice

Continue with `03b4c5-texture-backed-grass-volume.md`. Do not tune
count/width on the old per-record root-shadow path, the clump root geometry path,
the soft-root material path, the rejected `soft-root-fiber` clump-ribbon path, or
the rejected `field-fiber-shell`/one-strip shell path as if any of them were
visually accepted. Use the 03B4B/03B4B2/03B4C/03B4C2/03B4C3/03B4C4 evidence as
the base: mesh-only alternate families have also been rejected, so the next pass
should try true texture-backed alpha/volume coverage before more density tuning.
