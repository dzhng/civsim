# Battle rendering laboratory

The [production presentation diagnostics](src/live/README.md) observe the TypeGPU
renderer through the actual game Menu and benchmark. Use live runs for cadence and recorded replay for
matching rendering history; capture work is excluded from timing. The
[trial runner](trials/README.md) drives one already-built Menu artifact through
that same benchmark and archives its provenance and host evidence, and the
[offline scorecard](report/README.md) validates the resulting paired Menu exports
and experiment manifests without choosing a renderer. A
[held-authority build](src/held/README.md) runs the same benchmark as a renderer-only
comparison at a fixed simulation state, and the
[whole-map shadow control](src/shadow-control/README.md) builds it at the original
whole-map shadow coverage, which is what the shadow arm of the protocol prices
against today's fitted default.

Historical Three source capture and full-scene comparison belong to pinned Git
revision `16ad724514eeb840f241917c8fedb437a52ac1e3`. Reproduce that source in an
isolated checkout of the revision recorded with the evidence; the active tree
keeps no Three battle owner or capture route as an alternate production runtime.

[Portable fixture commands](src/fixture.ts) describe resolved time, crowd,
readout, tactical-cue and presentation updates. [Capture metadata](src/captureData.ts)
is archived data rather than an inferred type from today's renderer. Typed arrays
retain exact bytes, and shared poses and grass resources retain their recorded
identities. Replay decodes one packet at a time and never reconstructs missing
initialization or camera history from a final snapshot.

Grass sampling history belongs to the renderer-independent
[residency owner](../../packages/game-renderer/src/battle/battleGrassResidency.ts).
The [publication provider](src/CaptureGrassResidency.ts) preserves resolved
records, edits, visibility and transitions for correctness replay. Its replay mode
consumes recorded publications instead of starting another sampler; live native
benchmarks continue to use the ordinary residency owner. Recorded residency
statistics are inputs, not an independent proof of emitted GPU work.

The [recorded replay driver](scripts/spoolReplay.mjs) consumes an existing archive
through the [native replay build](src/replay.vite.config.mts), selecting raw,
TypeGPU or vgpu. Its arguments are replay URL, empty output directory, archive
directory, backend and optional atlas catalog. The archive is read-only. Input,
catalog, packet and resource hashes remain admission gates; output byte caps and
deadlines bound the replay. Source capture, compression and diagnostic readback
are correctness work and make no performance claim.

The native adapter preserves each crowd upload separately from render-only
presentations. Resolved grass records are checked against the source diagnostic
hash through one shared algorithm; selected endpoints additionally read actual
GPU record prefixes and indirect command buffers before the next presentation.
CPU recipe identity is reported separately from GPU readback. Source clock groups
remain recorded, while native shaders consume explicit recorded time/camera data.
The native mode retains strict image/count gates and makes no timing claim.

The first full native history result remains [diagnostic red](../../specs/battle-performance/assets/02-preflight/raw-spool/README.md).

GPU allocation accounting in [nativeGpuAllocations](../../packages/battle-renderer/src/nativeGpuAllocations.ts)
observes public device creation and explicit destruction. Install it before the
backend and telemetry so both are included; restore after their disposal. Live
and peak bytes describe requested buffer sizes and known texture texel payloads,
including mips, array layers and samples. Unknown or implementation-dependent
formats make current totals unavailable while live, and historical peaks remain
unavailable. Imported resources, swapchain images, driver overhead and deferred
reclamation are excluded: these numbers are not physical VRAM. Historical Three object counts cannot establish byte parity with native resources.

GPU timestamp intervals can overlap across passes. The shared
[range aggregator](../../packages/renderer-core/src/gpuTimestampRanges.ts) reports
the span from earliest start to latest end and the union of observed intervals.
The span includes gaps; the union removes overlap but is not physical GPU busy
time. Overall values come from all recorded ranges, never a sum of stage unions.
Pass-duration sums remain diagnostic only. Incomplete query coverage withholds
interval metrics, and raw timestamps remain an opt-in diagnostic payload.

The same observer counts the draw commands a submission window offered to
`queue.submit`: direct, indexed and indirect draws, plus every submitted
execution of a render bundle's own draws — per invocation, never per bundle
creation. Offered is not drawn. The count is synchronous and needs no timestamp
query and no readback, so it is the same under either timing mode; whether that
batch was accepted and presented is the renderer's own admission and presentation
validation, reported beside it rather than folded into it. What a window offered
and what it encoded without offering are two accounts with their own reasons, so a
batch that was built and dropped cannot spoil the total for the batches the queue
actually received, and a backend that submits after the window closes shows up as
work left behind rather than as a confident frame count. The observer's own timing
resolve/copy submission is in neither account. Where an honest total is
impossible — an executed bundle this observer never recorded, a submitted buffer
it never encoded, a repeat submission WebGPU rejects, a multi-draw command whose
count lives in a GPU buffer — the window reports unavailable with that reason
instead of a lower bound. Retention is bounded and keyed to the open window, so
no command history accumulates.
