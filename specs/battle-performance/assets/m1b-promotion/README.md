# Raw world promotion: implementation verified, remaining gates open

89b2850b integrates Claude2c8eaad0. The complete raw world and58 moved TypeScript
modules now have final ownership in battle-renderer. Root's AST comparison finds
identical non-import statements. The GPU scope registry is split from lab timing;
selectors and measurement drivers stay outside the package. Independent review
finds no introduced regression. Root full web TypeScript,38 focused web tests,
162 lab tests and14 TypeGPU tests pass.

Five fixed pre/post builds succeed. The replay bundle also builds. Root repaired
a fragile emitted-constructor verifier, which mistook a typed-array allocation for
the residency owner. Its runtime publication/control check passes; a wrong-provider
mutation fails the intended assertion; the original artifact restores byte-for-byte
and passes. Independent fix review finds no defect; its default-path run used an
incomplete different bundle, while root checked the explicit promoted output.

Full-scene source/raw counts match at all8 checkpoints with15560 soldiers. Both
builds dispose all tracked textures/buffers without GPU/browser errors. Seven
pre/post raw images match exactly. Initial tactical differs41 pixels, maximum10;
an unchanged reference repeat differs10 different pixels, maximum10. This proves
some initial variability, not full attribution of all41 pixels. Its origin remains
open; the divergent pixels and all raw comparison reports are retained.

Fresh unprimed review sees no one-sided loss, but flags shared dense-unit/grass
readability, finite fixture terrain boundaries, cue overlap and labels. Root does
not accept those images as a final user-shadow or live-quality fix. Full reviewed
images/crops accompany the report; remaining raw captures stay in fixed scratch.

Frame lifecycle passes at1x/4x sampling, including failed resize, retained output,
post toggling, stable camera bindings and zero retained resources. The optional
shadow/scenery frame comparison fails its strict image threshold in both builds:
all12 source and raw RGBA outputs and comparison metrics are exactly unchanged.
Generic no-shadow/no-scenery frame controls also fail; their unchanged-reference
comparison is being completed. No threshold, assertion or baseline is relaxed.

M1b's source30k regression floor and shared snapCheck/pose gates remain open.
The native facade cannot yet satisfy that scene's source-shaped diagnostic reads;
M9 must migrate those reads honestly while preserving all locked floors. This
checkpoint establishes relocation ownership, not raw performance acceptance.
