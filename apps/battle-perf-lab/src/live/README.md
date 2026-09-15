# Native live benchmark checkpoint

The lab Vite configuration substitutes only the battle world's renderer import.
The ordinary Menu route, benchmark scenario, Game, ActionTimeline, camera tour,
HUD, cancellation, and result collection remain their production owners. Select
`BATTLE_NATIVE_BACKEND=raw|typegpu|vgpu` and supply
`BATTLE_NATIVE_ATLAS_CATALOG` as the URL of the verified full appearance atlas
catalog. These build-time values survive the Menu's document navigation.

Native scenes share construction and synchronous submission with offline replay,
without importing replay history into live grass residency. The facade snapshots
terrain inputs and uses the prepared scene's actual ground/apron triangles for
picking. Source Octree picking remains unchanged; differential CPU tests cover
terrain/vista seams, misses, backfaces and grazing rays.

Presentation uses the packet's captured camera and time. A scene-owned readiness
operation is serialized with uploads and rendering; its additional submissions
are reported explicitly. Ordinary frames do not wait for queue completion.
Canvas ownership transfers only after the old native surface has drained and
released. Source capture hooks still receive their original commands because the
source renderer continues to implement its existing `present` path.

This is a functional checkpoint, not a ranked renderer result. CPU values cover
synchronous API entry and instance packing; asynchronous continuations are not
CPU-profiled. Memory diagnostics remain explicitly unavailable. GPU pass timings use the shared
native observer when timestamp-query is supported; missing results stay explicit.
Submission identities count actual queue submissions, without a fictitious Three
frame number. Each measured synchronous owner call has a validation scope popped before await;
this admission and timestamp instrumentation overhead is part of the instrumented
control. Readback helpers are counted globally but never replace final render IDs.

The benchmark's default single shadows, canvas scale, post/grade, grass settings,
and frozen behavior are retained. CSM, debug-block rendering and development asset
reload are explicitly unsupported in this checkpoint. No source renderer is
constructed as a fallback.

CPU verification: native live tests, source crowd/action/presentation/scheduler/
benchmark tests, typechecks and a production lab build. Independent code review
found readiness cancellation, delayed canvas teardown and frozen invalidation
races; regression tests now cover all three. GPU Menu launch, startup readiness,
full timed validity, cancellation/re-entry, frozen settings, picking and source
capture controls still require refreshed fixed-checkout hardware runs. No visual
or performance acceptance is claimed by this checkpoint.
