# 05 — Placeholder VAT Bake

## Contract

The repo can generate deterministic placeholder skeletal assets and bake them
into GPU-readable animation data.

## API Seam

- `packages/soldier-assets/assets/kit.json`
- `packages/soldier-assets/src/schema.ts`
- `packages/soldier-assets/bake/soldier-placeholders.mjs`
- `packages/soldier-assets/bake/vat.mjs`
- `npm run bake:anim`
- `npm run bake:test`

## Playable Deliverable

- Workbench previews the baked placeholder kit.
- Bake report shows skeleton, bones, clips, frames, meshes, LODs, and texture
  dimensions.

## Verification

- Byte-stable bake check.
- Manifest schema validation.
- Bone order and clip ranges are asserted.
- Generated placeholder assets include human, horse, rider, faction mask,
  simple PBR-ish textures, and at least L0/L1 mesh variants.

## Must Stay Green

- No real art required.
- Generated outputs are either committed or reproducible exactly.

## Human Feedback

The placeholders do not need to be pretty. They need to expose every runtime
contract real art must later satisfy.
