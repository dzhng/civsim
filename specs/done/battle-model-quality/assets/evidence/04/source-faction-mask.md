# Source faction-mask transport

Blender custom `_FACTION_MASK` data now reaches canonical `factionMasks`. Absent attributes mean unmarked geometry, not an inferred color region. Present data must be a non-normalized FLOAT SCALAR accessor, match the primitive vertex count, and contain only finite values in [0,1]. Generic accessor validation owns finiteness; the mask adds range validation.

## Actual authoring proof

Blender 5.2.1 LTS exports `mesh.attributes.new(name="_FACTION_MASK", type="FLOAT", domain="POINT")` when `export_attributes=True`. The owned reference exporter enables that option and gives the existing human forward-tip marker values 0/.25/.75/1. Its GLB has 24 exported mask values, 18 nonzero; no geometry was added. A disposable CORNER-domain export also passed the new importer with six seam-split vertices and values `[0,.5,.125,.25,.75,1]` in exact exported order. Blender resolves the domain into ordinary glTF vertex data; the runtime needs no domain flag.

The Attributes option is off by default; unprefixed names are not exported. That produces legitimately unmarked glTF, not an import error. Authors who intend faction markings must enable the option and use the exact attribute name. No texture or vertex-color convention is involved.

## Checks and boundaries

- Tracer before importer change: complete bundle masks were `[0]` instead of `[0,.25,.75,1]`; after change all three tiers preserve the exact source accessor values and merged vertex order.
- All nine human primitives' non-mask imported fields, rig and baked animation compare exactly against the prior committed GLB. The landmark file changes only its GLB hash. New source SHA-256: `3c58cb89b03d1b13c6c770a32d0dd044e4f8c847c5437549843e76e6f6ea003d`.
- `node --test packages/soldier-assets/bake/{appearance,gltf,engine-basis,soldier-placeholders}.test.mjs`: four files pass. Human/mounted Blender surface errors remain below 0.00000044 metres. Placeholder coverage still checks 2,058,336 animated vertices.
- `node packages/soldier-assets/bake/blender-candidates.mjs --check`: passes; only human candidate masks and source provenance blobs change. Production roster, texture bindings, snapshots and mounted content are unchanged.
- Independent Codex review `01a074ff-7b05-7fa1-a11c-272be9a0cf90`: no actionable findings. Reviewer independently confirmed unchanged source geometry/attributes/indices/animation; its HTTP test listener was sandbox-blocked, while the full same test passed outside that sandbox.
- Final self-review found explicit null was accepted as absence. A red assertion demonstrated the missing rejection; the absence check now distinguishes null and the complete focused test run passes again.

This is numerical source-transport acceptance, not a visual-quality verdict. The tiny marker is now intentionally faction-tintable; no screenshot baselines were rewritten.

Main integration also passed all four focused source suites and deterministic
candidate checking. The Blender reference sheets and mounted production sheet
remain pixel-exact. The human production sheet changes2582 pixels confined to the
existing forward-tip marker across its eight views. Main inspected the difference
image; a fresh image-only reviewer found unchanged geometry, poses and framing,
with only blue-violet coloring at those endpoints and no new silhouette/clipping
artifacts. That one intended candidate baseline was refreshed after review.
The review is retained in `source-mask-visual-review.txt`; it describes the marker
visually as foot/ground-contact endpoints, not a change to the underlying rig.

## Change ledger

Rows are added cases in `packages/soldier-assets/bake/appearance.test.mjs`; existing skeletal/pose tolerances and assertions are unchanged.

| Test case | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Real Blender mask through complete bake | Exported mask was ignored; canonical values were all zero. | Source 0/.25/.75/1 values retain exact vertex order through import and all three tiers. | Explicit source data is now copied rather than discarded. **moved** |
| Unmarked primitives and missing attribute | No asserted source convention; all imported masks were zero regardless of source. | Missing mask stays zero; deleting the attribute leaves every other mesh field identical. | Optional faction authoring is valid ordinary glTF, not a color fallback. **moved** |
| Present invalid shape/encoding/count | These mask attributes were ignored. | VEC2, unsigned integer, normalized FLOAT and mismatched counts reject. | Present data must satisfy the supported scalar contract. **moved** |
| Present invalid values | Negative, greater-than-one and nonfinite mask data were ignored. | -0.1, 1.1, NaN and Infinity reject. | Prevent invalid faction mixing from entering canonical assets. **moved** |
| Explicit null reference | Initially accepted like an absent attribute; tracer reported missing expected exception. | Null rejects through the semantic reader. | Only absence means unmarked; a present broken reference is malformed input. **your-regression** |

## Choices for the plan owner

- **Sound/high:** absent means zero, as explicitly directed by the parent. An ordinary unmarked Blender export remains usable; source markings do not need an extra required metadata flag.
- **Sound/high:** support FLOAT SCALAR only for the custom attribute. Blender's tested scalar export already matches this representation, avoiding an unneeded second compressed/normalized mask encoding.
- **Sound/high:** use the existing small forward marker as diagnostic material data. It exercises fractional masks without moving geometry, changing the checker shield or introducing production artwork.

No simulation/stat changes, external assets or services, new texture format, or renderer ownership changes.
