# Source GLB to complete candidate bundle

`packages/soldier-assets/bake/appearance.mjs` imports three explicit GLBs, converts their complete geometry/rig system into engine coordinates, joins primitives without dropping weights, and emits the ordinary appearance contract. The near tier owns animation; other tiers must have matching named bones, parentage and bind transforms. Equivalent quaternion signs are accepted. Missing tiers or incompatible rigs fail before writing outputs. No roster catalog changes automatically.

Original tier GLBs are retained with material-source references. Scalar base color, roughness and metallic factors are decoded now. Textures, samplers and material extensions remain in those source GLBs for04; this is not a texture-rendering parity claim. Imported faction masks remain zero until explicitly authored rather than guessed from color.

## Verification

`node packages/soldier-assets/bake/appearance.test.mjs` passes with the shared loader over HTTP:

| Fixture | Recorded poses | Loaded-tier surface points | Maximum error |
| --- | --- | --- | --- |
| Human | 4 | 5,472 | 4.3109514976479507e-7 m |
| Mounted | 10 | 8,640 | 3.916562606680189e-7 m |

The two composed mounted samples reconstruct a clip from the loaded local tracks and the independent oracle mask. This proves source-data retention, not06 runtime playback. The other twelve samples use the loaded animation directly. All comparisons transform the independent Blender oracle into engine coordinates.

Additional checks reverse source skin slots and confirm named-bone remapping; join individually Uint16 primitives past the 65,535 index limit and confirm Uint32 output; reject missing tiers, unknown looping clips and mismatched binds; preserve scalar material factors and original source bytes; and run the real CLI twice with identical output. Invalid CLI arguments leave the previous candidate untouched. Existing placeholder-bundle, glTF and VAT tests also pass.

Independent Codex review found one P2: the initial bind comparison rejected opposite-sign quaternions even though they describe the same rotation. A regression first failed on that implementation, then passed after semantic rotation comparison. No gate tolerance changed.

The integrating agent owns `engine-basis.mjs` and `appearanceBundle.ts`; verification copies are excluded from this source-baker commit. The production workbench and default `bake:test` wiring are integration gates, not completion claims here.

## Decisions for integration

- **Sound, high confidence:** explicit three-tier inputs prevent a missing distance representation from silently becoming three copies of the near model. Diagnostic callers may deliberately pass the same fixture three times; this is not detailed-art LOD acceptance.
- **Sound, high confidence:** near-tier clips drive every tier after rig compatibility checks and name remapping. Different exporter joint numbering is harmless; different bind skeletons are not.
- **Sound, medium confidence:** retain original GLBs as material provenance until04 defines the full texture contract. It costs source bytes but does not discard information or invent a premature texture schema. Scalar-only rendering remains explicit.
- **Sound, medium confidence:** the far atlas source is the near mesh at the first authored clip's initial pose. It is deterministic and works for diagnostics without inventing an `idle` clip; final-art distance slices must select and verify the intended far pose.

The new test adds bundle-level proof; it replaces no existing assertions or simulation behavior.
