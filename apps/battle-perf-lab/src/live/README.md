# Native live benchmark checkpoint

The lab Vite configuration substitutes only the battle world's renderer import.
The ordinary Menu route, benchmark scenario, Game, ActionTimeline, camera tour,
HUD, cancellation, and result collection remain their production owners. Select
`BATTLE_NATIVE_BACKEND=raw|typegpu|vgpu` and supply
`BATTLE_NATIVE_ATLAS_CATALOG` as the URL of the verified full appearance atlas
catalog. These build-time values survive the Menu's document navigation.

`BATTLE_NATIVE_TIMING_QUERIES=enabled|disabled` (default `enabled`) is the lab's
incremental query/readback overhead control. `disabled` withholds only the native
observer's timestamp work: no query set, no injected `timestampWrites`, no query
resolve/copy submission and no timestamp readback. It is not an uninstrumented
build. Requested device features, drawing, shaders, validation scopes, graphics
settings, submission identity, submission counting and allocation observation all
stay as they are under the default. A disabled build reports GPU timing as
explicitly unavailable rather than zero, and both modes name the flag and its value
in the renderer's diagnostic stats.

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
CPU-profiled. GPU pass timings use the shared native observer when timestamp-query
is supported; missing results stay explicit.

The reported GPU time is one presented frame's own submission: that frame's receipt
joined to the observer event measuring the same submission, reported as the observed
span the shared [range aggregator](../../../../packages/renderer-core/src/gpuTimestampRanges.ts)
defines, with its union beside it. Overlapping passes are never summed into a frame
total, and the source runtime's render-pass-only value is a different measurement,
not an equivalent one. Readbacks land after presentation, so the published sample is
an already-completed frame carrying its own frame and submission identity — never
relabelled as the frame in flight. Incomplete, dropped, readiness-only and unqueried
submissions report no GPU time rather than a zero; retention evictions, cursor gaps
and an unavailable query mode are reported beside the sample. The join adds no
queries, submissions, readbacks or waits of its own.

Scene diagnostics describe the world actually installed. The expected population
is the static simulation data, not a number borrowed from the crowd owner; the
published camera is the frame that actually presented, carried together with the
identity it presented under, so a newer pose is never labelled with an older
frame's id; content, depth and cue counts come from the owners that hold them.
A world that is not installed — before construction, on a retired comparison
backend, after disposal — reports null rather than an empty shape. Measurements
this world cannot make truthfully are named as open obligations beside those
nulls instead of being approximated: per-instance seating verification (a
whole-population inspection, not a rotating per-frame sample of a crowd that
moves), per-frame draw calls, and the blade counts the grass field routes on the
GPU. No diagnostic adds a readback, a wait or a repeated population scan to the
presenting path.

Submission identities count actual queue submissions, without a fictitious Three
frame number. Routine preparation closes each validation scope before awaiting its
operation, allowing validation to overlap subsequent preparation. Every presentation
submission waits for the complete batch, including startup submissions. Terrain/resize
resource mutations and final submission retain immediate admission. Failure drains
outstanding checks inside lifecycle ownership before resources can be released; cleanup preserves the
original operation or cancellation error. This does not promise rollback of CPU
state or already-submitted pose compute. Admission and timestamp instrumentation
remain part of the measured control. Readback helpers are counted globally but
never replace final render IDs.

The benchmark's default single shadows, canvas scale, post/grade, grass settings,
and frozen behavior are retained. High cascades, staged crowd reload and the
debug-block view belong to the selected raw world; the discarded comparison
candidates refuse all three. No source renderer is constructed as a fallback.

CPU verification: native live tests, source crowd/action/presentation/scheduler/
benchmark tests, typechecks and a production lab build. Independent code review
found readiness cancellation, delayed canvas teardown and frozen invalidation
races; regression tests cover all three. Fixed-checkout Menu controls are recorded
in [live evidence](../../../../specs/battle-performance/assets/02-live/native-facade/README.md).
Frozen settings, native picking, source capture compatibility and final matched
performance still need their respective hardware controls. No visual or performance
acceptance is claimed by this checkpoint.

Native allocation diagnostics count requested buffer/texture payloads from device
creation through explicit destruction, including measurement buffers. They expose
current and peak logical bytes plus unavailable-format counts. These are not
physical VRAM or directly comparable to the source renderer's object counts;
swapchain/imported resources and driver overhead remain outside their scope.
