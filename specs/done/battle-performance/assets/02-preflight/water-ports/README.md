# TypeGPU and vgpu water controls

These are runtime-owned ocean/lake components under the existing bounded water
fixture, not complete battle renderers or performance measurements. The
[summary](summary.json) and individual reports retain the unchanged strict
numerical gate. Lake passes in both runtimes at one/four samples. Ocean remains
red: TypeGPU reaches 0.008789/0.059570 maximum difference and vgpu reaches
0.008789/0.082520. No tolerance was relaxed. Every capture is finite, all browser
and WebGPU error lists are empty, and tracked textures/buffers return to zero.

Water topology, CPU packing and WGSL field/vertex/surface bodies have one shared
owner. The native shader has identical tokens after extraction, ignoring
whitespace. Each candidate supplies its own public resource bindings, pipeline,
frame and command encoder; neither port calls raw water or hides Three rendering.
The source oracle and real lake terrain bank remain identical fixtures in one
shared runner; raw and runtime-port pages are thin entrypoints.

TypeGPU owns typed buffers, per-kind pipelines and draw commands. Its public
binding getters are kept lazy until GPU resolution. Typed vertex/index upload
uses copied ArrayBuffers, matching the existing typed geometry API. vgpu owns
public Buffer handles, Geometry layouts and Draw compilation. Buffers are
created and owned individually before Geometry borrows their public handles:
its data-taking Geometry constructor leaked the first allocation when a later
allocation failed in the fault probe. This fixes the water owner's failure path
without reaching into private runtime state. No per-frame geometry upload or
capacity-growth pool is introduced: immutable terrain/water changes replace the
component. Pipeline admission and these API calls are costs to measure in a
complete live comparison, not evidence of a speedup.

The lifecycle control admits empty content, replaces it with two surfaces,
disposes twice, and injects a failure at each of the four allocations of a new owner, including
the state uniform.
Both runtimes reject that admission and destroy all buffers already allocated.
The subsequent real frame renders on the borrowed device, proving cleanup did
not destroy it. The two-surface probe requires both runtimes to realize all eight buffers
before admission completes; TypeGPU explicitly unwraps its state and bind group
through public APIs. Camera, environment, frame
attachments and caller-owned device retain their existing owners.

Against the native captures, TypeGPU ocean PNGs are byte-identical at both
sample counts; lake differs by at most one byte. vgpu ocean at four samples has
sparse differences up to 21 byte levels, retained as a strict red diagnostic.
Both source and candidate horizon repeats are byte-identical in every case.

Independent code review found the deferred TypeGPU uniform admission gap. It is
fixed, and all 32 per-allocation fault cases now reject with zero live buffers.
The [pre-fix reports](pre-admission-fix/summary.json) preserve the earlier blind
spot; [image hashes](admission-fix-image-check.json) prove all 96 final PNGs are
byte-identical to the versions inspected in the [fresh visual review](visual-review/review.md).
That review found no material port-specific visible regression. The
[shared-runner smoke](shared-runner-smoke.json) also retains exact pixels across
raw lake, TypeGPU lake and vgpu ocean after fixture extraction.

Change ledger (no simulation tests or unit stats changed):

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `checkWaterLifetime`, `apps/battle-perf-lab/src/waterLifetimeCheck.ts` | Faulted allocation 2 only; TypeGPU realized 6 buffers for two surfaces, leaving uniforms deferred. | Faults each allocation 1–4 and requires 8 admitted buffers; all 32 fault cases reject and release everything. | Public realization now includes both state uniforms before admission closes, removing the first-draw allocation gap. **moved** |

Source stepped lake shores,
rectangular depth patches, exposed fixture edges and distant ocean speckle remain
source limitations. Still-frame repeatability does not prove smooth motion or
complete-world equivalence.
