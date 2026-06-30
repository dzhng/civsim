# glTF Importer And Bake Toolchain

## Contract

A rigged `.glb`/`.gltf` artist asset can be turned into a `VatBake` that the
existing skinned pipeline renders, through a deterministic CLI bake plus a live
asset workbench. Placeholders remain the shipping default; real art is a
drop-in replacement, never a precondition.

## Why

The whole path to import real art is absent. `bake/vat.mjs:10` explicitly defers
the glTF reader ("a thin adapter… added once a rigged asset exists"), and
`bakeRig()` (`vat.mjs:118`) is only ever fed the hand-built `placeholderRig()`
(`soldier-placeholders.mjs:27`). No glTF parser exists; no babylon/three in
`web/package.json`. This slice is the front door everything else in Group B is
blocked on — but it must not block *this* spec, so placeholders stay default.

## API Seam

- `packages/soldier-assets/bake/gltf.mjs` (new) — parse `.glb`/`.gltf` into the
  intermediate rig shape `bakeRig()` already consumes (skeleton, bind pose,
  skinned mesh, animation clips). A focused parser or a vetted dependency; decode
  only what the rig needs.
- `packages/soldier-assets/bake/vat.mjs` — accept a glTF-sourced rig as well as
  `placeholderRig()`; unchanged VAT output format (`schema.ts`, `vatLayout.ts`).
- `packages/soldier-assets/src/validate.ts` — extend validation to real rigs
  (bone count vs layout, clip coverage, channel presence).
- **Replacement contract**: `assets/ART_INPUT_CONTRACT.md` (new) — exactly what a
  `.glb` must contain (skeleton naming, required clips walk/run/attack/hit/die,
  mounted variants, texture channels albedo/normal/orm/factionMask) to bake
  cleanly. Mirrors `../done/renderer-skinned-crowd-foundation/assets/ART_CONTRACT.md`
  targets.
- **Asset workbench** under `apps/renderer-lab` (or a dedicated tiny app): drop a
  `.glb`, bake live, render the result beside the placeholder, and show
  validation failures inline. This is the artist/human feedback surface.

## Human Review

In the workbench, drop a sample `.glb` (a free CC0 rigged human is fine as a test
fixture) and watch it bake and render next to the placeholder soldier. A
malformed asset shows a precise validation error (missing clip, wrong bone
count, missing channel), not a crash. With no asset dropped, the workbench shows
the placeholder — proving the default path is intact.

## Verification

- `vat.test.mjs`-style test: a checked-in tiny test `.glb` bakes to a `VatBake`
  that passes `validate.ts` and matches a golden VAT (deterministic).
- Round-trip test: glTF-sourced VAT renders in the soldier gate harness without
  changing the placeholder default render.
- Validation tests: each malformed-input case produces its specific error.

## What Must Stay Green

- Placeholder bake (`soldier-placeholders.mjs`) and all existing soldier gates —
  the default render is byte-stable until a real asset is deliberately blessed.
- `VatBake` schema and `vatLayout` consumers (slice does not change the format).

## Feedback That Would Change This Slice

- Whether to hand-roll the glTF parser or take a dependency (scope vs. footprint).
- Which real asset is the first import target (and its license).
- Whether the workbench is a route in `renderer-lab` or its own app (skill prefers a
  first-class asset app for asset-heavy work).
