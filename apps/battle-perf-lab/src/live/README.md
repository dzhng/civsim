# Production battle presentation diagnostics

The [production renderer](../../../../web/src/battle/renderer.ts) owns TypeGPU
presentation for the ordinary Menu, benchmark and campaign handoff. The
[measurement build](../../benchmark.vite.config.mts) can hold simulation authority
or control shadow coverage without substituting a second renderer facade.
Raw and vgpu comparisons consume archived inputs through native replay.
Historical live selectors and the Three source build belong to pinned revision
`16ad724514eeb840f241917c8fedb437a52ac1e3`.

The renderer snapshots terrain inputs and uses the installed world's actual
ground and apron triangles for picking. Differential CPU tests retain an
independent geometric comparison over seams, misses, backfaces and grazing rays.

Presentation uses the packet's captured camera and time. A scene-owned readiness
operation is serialized with uploads and rendering; its additional submissions
are reported explicitly. Ordinary frames do not wait for queue completion.
Canvas ownership transfers only after the old native surface has drained and
released. Production lifecycle tests exercise this same facade directly.

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
frame's id; environment, terrain, cue, crowd, shadow and depth reports come from
the owners inside that world which hold them, so a replaced generation or a new
cue upload moves the report. A world's declared identity is separate from all of
them: each world [declares its own](../../../../packages/battle-renderer/src/identity.ts),
and no backend is labelled with a neighbour's name or with a capability another
world happens to implement — the debug-block upload buys access to that method
and nothing else. The terrain and cue reports share one contract in
[the neutral battle types](../../../../packages/battle-renderer/src/types.ts), so a
check written against one world migrates to the other unchanged. A world
that is not installed — before construction, on a retired comparison backend,
after disposal — reports null rather than an empty shape, and every such null is
named so it cannot be read as an empty scene. Measurements no world here makes
truthfully are named as open obligations instead of being approximated:
per-instance seating verification, and the blade counts the grass field routes on
the GPU. No diagnostic adds a readback, a wait or a repeated population scan to
the presenting path.

Draw calls are the one such obligation a frame can discharge for itself. The
published count is the draw commands that frame's own battle draw offered to
`queue.submit`, taken from the [shared observer](../../../../packages/battle-renderer/src/nativeGpuTelemetry.ts) as that
submission window closed and kept with the frame, never re-read off whichever
submission is latest: the readiness renders that follow a startup frame, and every
later frame, leave it where it was. Only a frame that presented publishes one, so a
presentation that failed validation, was cancelled, or was cut off by disposal leaves
the previous frame's count standing instead of claiming its own, exactly as its camera
and frame id do. Offered is not executed, and a lower bound is not a total: a window
that could not count honestly, or that left encoded draws it never handed to the queue,
publishes no number, names the reason beside it, and keeps the obligation open. A
scene that encoded no drawing publishes zero, which is a measurement and not a
missing one.

Seating is verified by asking, never by watching. The explicit inspection walks
every instance of one admitted crowd pose and re-samples it against the installed
playable height field — the same sampler the crowd builder was handed, not the
one that adds the vista apron no soldier stands on. It is a measurement, so a
nonfinite elevation or height fails rather than slipping past an absolute compare,
and an empty, unadmitted, uninstalled or disposed world reports itself unavailable
rather than passing vacuously. Admission is not presentation: the pose and terrain
generation a frame actually drew are recorded with that frame's presentation
receipt, and a later inspection refuses to answer once a replacement has moved
either, instead of attributing a verdict to the frame that no longer owns the
pose. The result is returned to its caller and never cached, so `stats().seating`
stays unavailable and the obligation above stays named. It proves the CPU
firewall between the height field and the uploaded instance data; where the GPU
actually drew a soldier's feet remains the image gate's claim, not this one's.

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

High cascades, staged crowd reload and the debug-block view belong to the
production TypeGPU world. No source renderer is constructed as a fallback.

CPU verification: native live tests, source crowd/action/presentation/scheduler/
benchmark tests, typechecks and a production lab build. Independent code review
found readiness cancellation, delayed canvas teardown and frozen invalidation
races; regression tests cover all three. Fixed-checkout Menu controls are recorded
in [live evidence](../../../../specs/done/battle-performance/assets/02-live/native-facade/README.md).
Frozen settings, native picking, source capture compatibility and final matched
performance still need their respective hardware controls. No visual or performance
acceptance is claimed by this checkpoint.

Native allocation diagnostics count requested buffer/texture payloads from device
creation through explicit destruction, including measurement buffers. They expose
current and peak logical bytes plus unavailable-format counts. These are not
physical VRAM or directly comparable to the source renderer's object counts;
swapchain/imported resources and driver overhead remain outside their scope.
