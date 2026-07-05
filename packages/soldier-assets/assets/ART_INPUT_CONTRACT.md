# glTF Import Contract

What a rigged `.glb`/`.gltf` must contain to bake cleanly into a `VatBake`
through `packages/soldier-assets/bake/gltf.mjs`. This is the per-file front door;
the full pack shape and acceptance bar live in
[ART_CONTRACT.md](../../../specs/done/renderer-skinned-crowd-foundation/assets/ART_CONTRACT.md).

**Placeholders remain the shipping default.** A real `.glb` is a drop-in
replacement, never a precondition: nothing in the build depends on one existing.

## Container

- `.glb` (binary, self-contained) is preferred. `.gltf` is accepted only with
  **embedded** buffers (`data:` URIs); external `.bin` references are rejected.
- glTF **2.0** only.

## Skeleton

- Exactly one `skin`. Its `joints` are the bones, in any order — the importer
  topologically re-orders to parent-before-child and remaps animation tracks.
- Each joint node carries its rest-pose transform as **TRS** (`translation`,
  `rotation`, `scale`) or a `matrix` (decomposed back to TRS).
- `skin.inverseBindMatrices` is required: one MAT4 per joint. A missing
  inverse-bind fails validation (`rig.inverseBind`).
- Bone count must not exceed the skinning-layout ceiling (default 256).
  Bone-count/order changes are breaking and must be re-blessed deliberately.

## Clips

- One glTF `animation` per clip. The animation `name` is the clip id.
- Required human clip names: `idle`, `march`, `run`, `attack_a`, `hit_a`,
  `death_a`, `at_ease`. Required horse clips: `idle`, `walk`, `canter`.
- A name mismatch can be bridged at bake time with a `clipNames` map
  (`{ "<glTF name|index>": "<clip id>" }`) rather than re-exporting.
- Channels target joint nodes via `translation`/`rotation`/`scale` samplers;
  channels on non-joint nodes are ignored. A clip animating no joint warns.
- The bake samples every clip at a fixed fps (default 12) and is deterministic —
  the same `.glb` always yields a byte-identical VAT.

## Materials (textures — consumed by slice 05, not the bake)

Each material set should provide `albedo`, `normal`, `orm` (occlusion /
roughness / metalness), and a `factionMask`. The faction mask marks only the
tiny team identifier geometry, currently an upper sword-arm band. Crests,
shield faces, tunics, plumes, and armor stay natural material colors.

## Validation

`validateRig()` (`src/validate.ts`) reports, before anything renders:

- missing skin/joints, missing inverse-binds, broken parent order
- bone count over the layout ceiling
- missing required clips, zero-duration or unanimated clips

A malformed asset surfaces a precise error in the workbench, never a crash, and
never changes the placeholder default render.

## Test fixture

`assets/test/two-bone.glb` is a generated 2-bone arm with one animation per
required human clip — the smallest real asset that exercises the importer end to
end. Regenerate with `node packages/soldier-assets/bake/make-test-glb.mjs`;
`gltf.test.mjs` asserts it is byte-stable and round-trips to a golden VAT.
