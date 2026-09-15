# Battle standards component

The three candidates consume the same authored mesh, per-unit seed, faction livery,
wave coefficients and caller-provided legibility scale. The production Three layer
uses the extracted CPU packing and surface policy directly. Alternative runtimes
own their buffers, pipelines and draw encoding; they do not invoke Three.

[The control](../../../../../apps/battle-perf-lab/src/raw/standards-check.ts) compares
actual `PhotorealStandardLayer` HDR output with each candidate under the same
camera, time, environment and attachments. It retains a nearly stacked-banner
stress view alongside readable views, animation, selection, enlarged distant
standards, capacity growth, shrink, hidden and empty states. Pixel reports are
linear HDR; PNG previews apply display conversion only. The verifier fails on
warnings, nonfinite output, any alpha-coverage difference, or covered RGB error
above 1/255. The raw reports preserve failures rather than accepting an arbitrary
number of differing pixels.

## Current evidence boundary

The three backends produce the same gate outcomes and failing-pixel coordinates. At one sample, the overlapping
stress view and its post-growth repeat have one shading outlier at (304,236),
with exact coverage. The remaining cases pass. At four samples, every case
passes, with maximum covered-channel error 0.00048828125. The one-sample outlier
is still an unresolved strict failure; its gold-versus-cloth-like colors suggest
primitive-boundary ownership, but no causal diagnostic has established that.
It is not accepted as a general precision allowance.

[Independent fresh image review](visual-review/review.md) found no visible
pair regression in the readable front/wave/reverse views. Shared weak emblem
contrast, edge-on readability and absent ground/bearer context remain explicit;
this does not resolve the overlapping stress view's numerical failure.

These are component controls, not full battle, animation-sequence or performance
eligibility. They exercise the golden environment; the separately verified shared
PBR/sky/haze owners supply environment lighting. Full-scene depth ordering,
selection context and motion remain integration gates.

## Ownership and source fidelity

The layer belongs in the opaque world pass, writes reversed depth, and does not
cast or receive shadows, matching the production legibility-scaled standards.
The caller provides world pose and scale; it must not recompute the scale using a
candidate-specific camera rule. Explicit time remains the sole animation clock.
Authored normals are preserved even on the back face. The source's geometry
roughness uses its original vertex normal, while shading uses the yaw-rotated
custom normal; the port deliberately retains this distinction.

Each runtime keeps one pipeline and static mesh through instance publication.
Only capacity growth allocates a replacement instance buffer; failed admission
retains the previous valid GPU content. Concurrent uploads are rejected before
packing state changes; later smaller uploads size admission from the live GPU
capacity, so rejected growth cannot poison recovery. The control verifies overlap
rejection and zero remaining buffers/textures after full backend disposal, before
the borrowed device is destroyed.
The [unguarded growth diagnostic](diagnostics/concurrent-upload-unguarded/report.json)
records an observed red control before restoring the upload guard; the restored
raw four-sample control passes.

TypeGPU uses public typed buffers and pipelines plus the pinned experimental
render-command API. Initial lazy buffers and the bind group are materialized
through public `root.unwrap` while admission is open. The control requires all
four layer buffers to exist before the factory returns. The
[lazy-allocation negative control](diagnostics/lazy-typegpu-admission/report.json)
observed only two without the explicit materialization; the restored control
observed four and passed. This proves admission timing, not injected hardware OOM
behavior. Binary writes copy the
visible CPU span. Vgpu uses public
core-buffer writes, draw/frame encoding and the public GeometryLike contract with
a live instance-buffer getter, so growth does not leave the draw pointing at a
destroyed buffer. Its context owns pipeline caches. No native pipeline or encoder
fallback is used by either library.

Run [the Vite control config](../../../../../apps/battle-perf-lab/src/raw/standards.vite.config.mts)
on port5203, then [the verifier](../../../../../apps/battle-perf-lab/src/raw/verify-standards.mjs).
`STANDARDS_CHECK_URL` selects the control URL's `backend` and `samples` query
parameters. The verifier writes each result beside this document. No soldier
asset copying or offline atlas preparation is needed for this procedural model.
