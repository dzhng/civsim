# Texture transport integration

The target is source fidelity: the authored checker and independent material maps
must survive loading, posing and production rendering without recoloring unrelated
slots. These diagnostic fixtures do not accept anatomy, final armor or distant
silhouette quality.

## Visible transfer

The production human contact sheet changes 22,215 pixels (1.0847%); the untextured
mounted sheet remains exact. Camera, poses, viewport, lighting and geometry are
fixed. The [before](human-before.png), [after](human-after.png) and
[enlarged panel comparison](human-panel-crop.png) preserve the review surface.
The standard-loader export sheet shows the same checker placement and projected
pattern in all eight views. Different lighting prevents a whole-frame color oracle.

The [independent critique](human-critique.txt) finds matching geometry, camera and
attachment, with no confident bleeding, missing surface or layering defect.
Coarse and stair-stepped checks are consistent with the source's explicitly
nearest-filtered image, also visible in the standard-loader sheet. They are not
accepted as final soldier texture quality. The actual asymmetric sampling probes,
not this symmetric checker alone, own orientation proof.

Verdict for the named transfer variable: the textured candidate is less wrong.
After inspection and critique, its baseline was refreshed and the same production
scene passed strict comparison. No other candidate baseline changed.

## Shared and retained paths

The merged type check and all 216 Vitest tests pass. The aggregate bake test passes,
including exact image transport, source admission, deterministic generators,
2,058,336 posed placeholder vertices and the unchanged card synchronization check.
Workbench and scalar far-property scenes pass unchanged; the raw material and
campaign-model scenes also pass on the merged tree. Normal images are transported
but deliberately do not affect shading until the posed tangent-frame pass.

The [image-upload report](image-upload-merged.json) passes on the existing warmed
Vite server. Its initial failure was a probe importing node constructors from a
second Three instance after dependency optimization, not failed image upload.
Using the renderer namespace's own TSL constructors fixes all four failures without
weakening any numerical check or changing the production uploader.

Independent review of the shared loader/Three diff found no actionable ownership,
correctness or complexity defect. Its sandbox could not run the aggregate bake
command; the main task ran that command successfully. Raw review found and fixed
campaign teardown during asynchronous preparation. An analogous battle reload
inspection reproduced resurrection after disposal and now has a dedicated real
GPU/network boundary regression. The merged [lifecycle gate](disposal-merged.json)
and [image-property gate](image-properties-merged.json) both pass. Base-color and
metalness/roughness scalar oracles agree exactly; linear filtering and occlusion
differ by at most one RGB code. Missing/decode failures retain the original crowd,
catalog, node and atlas identities, live counts and exact pixels. A bypassed base
image produces twelve failures in the retained [mutation run](image-properties-mutation.json).

The [near/far comparison](near-far-checker.png) and
[fresh critique](near-far-critique.txt) show the same four-color layout. Coarser far
edges, filtered boundary bands and far shadow differences remain the already
classified distance-quality debt; they are not accepted as final model quality.

The [standing hardware gate](30k-merged.log) passes on Apple Metal3 at1280×800
with30,560 soldiers and150 GPU samples per stop: mid median13.0ms/p9520.47ms,
vista median11.27ms/p9512.20ms. Pan, continuous zoom, wheel burst and close grass
checks remain within33ms. This is the existing paused-simulation rendering gate,
not the live animated budget owned by07.

Merged commands, from the worktree root with its Vite server on5174:

```sh
bun run --cwd web typecheck
bun run --cwd web test
bun run --cwd web bake:test
VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node web/scene.mjs image-texture battle-model-workbench battle-model-far-properties blender-production-candidates soldier-materials campaign-models battle-model-image-properties battle-model-reload-disposal
VERIFY_URL=http://localhost:5174 bun run --cwd web perf:30k
```

The scenes were run in focused groups, with hardware performance isolated from
the software-rendered correctness captures. Preview opened at05:42:51UTC and
closed after05:48:10UTC with no user response. Proceed on the numerical and
scoped visual evidence above; silence is not user approval of final model quality.

Raw output alpha was inspected during integration: its opaque target has no blend,
the canvas is opaque, and later RGB blends ignore destination alpha. No retained
RGB/coverage failure was demonstrated, so inherited alpha output was not changed.

## Changed-test behavior

| Gate | Previous behavior | Current behavior | Reason |
| --- | --- | --- | --- |
| Appearance bundle loader | Scalar-array admission and complete mesh/clip checks | Complete surface container, exact encoded bytes, material-relative URLs, per-transaction image/surface sharing, fresh reload and missing-image rejection | One source-owned surface contract replaces the array; existing mesh/clip rejection remains. |
| Shared material admission/packing | No texture flags or sampler contract | Independent channel flags, authored strengths, declared samplers and three-row GPU data | Different slot uses must not accidentally enable AO or normal shading. |
| Prepared Three surface | No owned image decode/upload transaction | Explicit decode options, sampling, image dimensions, bitmap closure and rollback on later decode/upload failure | Failed preparation must not leak resources or replace the current scene. |
| Far atlas unit gate | Scalar texture argument | Prepared surface argument with unchanged GPU admission/restoration assertions | Near and far consume one owner; admission behavior is unchanged. |
| Workbench mutation probes | Intercepted a material array | Intercept the container's material table and retain its texture definitions | Preserve all malformed/reindex/scalar/mask/late-pose checks under the new format. |
| Human production sheet | Checker slot rendered a flat scalar surface | Authored checker reaches all reviewed poses | Intentional reviewed texture transfer; mounted sheet stays exact. |

Source and raw lane reports retain their own complete changed-test ledgers. No
simulation, balance, save or gameplay assertion changed in this pass.
