# Shared palette kernel feasibility

The production owner and final near-unit angle correction are now verified in
[Three production cutover evidence](three-palette-cutover.md). The measurements
below retain the original feasibility gate and its red controls; current runtime
ownership and remaining acceptance boundaries live in that follow-up.

This is a bounded numerical 06b prerequisite, not the production playback cutover. The named `pose-palette` scene loads the authored mounted rig plus a hostile synthetic rig, uses the source-owned local bake/resolver and 80-byte playback packer, and runs one shared WGSL function through Three storage nodes and the real raw frame shell's precompute hook. Neither a screenshot nor a finished-animation verdict is claimed.

Run from `web`: `VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5195 node scene.mjs pose-palette`. This pass used the software adapter. [Final report](palette-kernel-final.json) retains each numerical check; [missing-statement red](palette-kernel-first.json) and [built-in arithmetic red](palette-kernel-trig.json) retain the failures that changed the implementation.

## What the probe established

Raw and Three produce byte-identical palettes. Sixty poses cover fractional sampling, exact STEP T/R/S boundaries (including a fraction rounded to one before the boundary), terminal samples, both sides of the near-parallel quaternion branch, antipodal keys, a half-turn, frozen sources, full-body composed-pose death sources, base crossfade and masked upper exit toward the evaluated base. Both rigs contain nonadjacent parents. The mounted mask leaves horse, pelvis and legs on the base chain.

Against the shared CPU decoder/composer, maximum matrix-component error was `6.5566e-7`. Applying the existing CPU weighted mesh poser to the read-back palettes versus reference matrices produced maximum position/normal/tangent component error `4.7684e-7`; the unchanged provisional numerical gate is `1e-5`. This is **not** a measurement of the production vertex shader, shadow rendering, or original-track encoding error. Those remain distinct integration gates. The source encoding's independently measured error must not be conflated with GPU arithmetic error.

## Two red controls

Three's native `wgslFn` call is an expression. Appending that expression to a compute stack built its helper definition and bindings but emitted no call in `main`: the kernel compiled without errors, while every Three output matrix stayed zero. A local Three-only `Node<void>` wrapper emits the child call through `builder.addLineFlowCode`; retaining the child as a node field preserves dependency traversal. The scene now asserts both the generated main invocation and a compute dispatch increment, in addition to actual read-back values. No dummy output dependency or extra storage write was added. The shared WGSL/data owner remains independent of Three.

The first real invocation then exposed built-in trigonometric error on the software GPU. Runtime-fed `sin(.747f)` differed from CPU by `+4.0654e-5`, `sin(.153f)` by `-1.8933e-5`, and `acos(cos(.9)f)` by `-1.4366e-5`. `atan2(sin(.9)f, cos(.9)f)` differed by `4.07e-8`. Four hostile poses failed the unchanged gate (largest matrix error `4.9919e-5`). Replacing only acos with atan2 left those four failures, isolating sine as the dominant remaining error.

The bounded alternative preserves shortest-arc selection, the `.9995` near-parallel branch and exact endpoints. Its angle uses `atan2(length(b - a*dot), dot)`; sine is a degree-11 odd polynomial only on the shortest-arc interval `[0, pi/2]`. The common sine denominator cancels under final quaternion normalization. The analytic Taylor remainder alone is not the measured result: 1,025 runtime-fed Float32 samples measured maximum sine error `1.5051e-7`. All pose checks then passed without loosening tolerances. This is not a general-purpose trig library. Extra polynomial arithmetic, private hierarchy-array pressure and hardware behavior belong in 07 measurement; the source/bounds owner has been notified that the final normalized GPU arithmetic needs its own bound check.

## Integration boundaries

The original feasibility proof did not exercise production draws. The [production follow-up](three-palette-cutover.md) owns the actual weighted vertex, visible/shadow, frozen-residency and allocation-failure evidence; complete format cutover requires both consumers and the producer to land together. Initial/reload admission and ordinary live growth retain the decisions in the [consumer proposal](palette-consumer-proposal.md); neither proof introduces asynchronous stale-frame growth or an instance cap.

Static CPU metadata now has one owner, `renderer-core/rigPaletteData.ts`: it preserves parent order and inverse-bind columns, appends the canonical STEP masks, resolves appearance joint names and deduplicates equivalent upper-body masks. Both adapters receive absolute mask offsets; neither needs its own name-to-joint lookup. Focused tests pin manual-only empty masks, equivalent masks in different source order, nonadjacent parents, and rejection of invalid hierarchy, unknown mask joints and inverse-bind values that overflow Float32. GPU allocation remains adapter-owned.

The original disposable Three adapter deleted compute-only attributes through the pinned renderer's central attribute cache after disposing its compute node, following the separate lifetime probe. It had no live render-material consumers. Releasing buffers underneath retained material bindings is **not** safe; production replacement retires/rebuilds every consumer. No visual acceptance, GPU budget acceptance, or user approval is inferred from this numerical result.

Independent review found no functional kernel issue; its two packaging warnings concerned machine-local dependency and scratch copies, all excluded from the focused commit. Typecheck and the final numerical rerun passed after the header indices were wired to shared packing constants. The test owns a bounded compute oracle, not a second production material or render route.
