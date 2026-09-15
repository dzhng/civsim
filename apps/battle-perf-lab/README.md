# Battle replay laboratory

The lab build runs the actual menu, battle loop and crowd presentation. Its
importer-scoped Vite substitutions wrap the original renderer and real world
factory. The factory records outer public world calls and observes every actual
presentation, including presentations made while settling. Disposal removes the
wrappers and registry entry. Ordinary builds retain their original imports.

A replay frame is an ordered batch of semantic updates on resolved battle data:
time, crowd observations, readouts, triangles, tactical lines, settling and
presentation. The Three control calls those same public methods. Native candidates
consume the same resolved inputs and must implement the corresponding semantics;
this is not a GPU API trace or permission to hide a Three renderer in a candidate.
Recording the actual calls preserves initialization, LOD and grass history that a
reconstructed last-frame snapshot misses.

Start the lab server with
`web/node_modules/.bin/vite --config apps/battle-perf-lab/vite.config.mts --port 5189`.
With exclusive GPU access, run
`node apps/battle-perf-lab/scripts/capturePrelude.mjs` to capture the actual menu
benchmark from its first presentation through its first running frame, then replay
and compare the source canvas pixel for pixel. The script retains evidence even
when comparison fails. This proves only the running-origin window; later motion
windows still need their relevant presentation history.

For interactive capture, arm `window.__battleCapture.prelude()` before the first
presentation. `start(frameLimit, byteLimit)` records a bounded later window but
cannot manufacture its missing history. `status()` identifies the active capture
or finalization stage; `cancel()` finishes a partial window. The latest capture
replaces the previous one in this origin's IndexedDB. Open `/renderer/battle-replay`
to replay it and download the archive and boundary PNG.

The cap covers static inputs, generated-ground hash scratch, command chunks,
shared frozen-pose definitions and the boundary PNG. Typed arrays retain exact
bytes; immutable pose arrays are stored once per window without quantization.
Loaded appearance content is hashed one appearance at a time, and the manifest
records total encoded content and the largest appearance. Replay decodes one frame
at a time instead of materializing a five-minute object graph.

Finishing capture cancels the benchmark through its existing public API after the
boundary PNG is requested. This explicitly partial run allows hashes and storage
to finish without competing with simulation/rendering. Copies, readback, hashing,
and correctness replay are not performance measurements. GPU indirect-command
readback gives actual grass draw counts; Three's triangle counters use CPU instance
capacity for indirect draws and accumulate until its animation callback resets
stats, while the grass CPU tier mirror is cached and sampled. Neither estimate is
an emitted-work floor.

Grass sampling history belongs to the renderer-independent
[residency owner](../../packages/game-renderer/src/battle/battleGrassResidency.ts).
It retains the production whole-map base and focus-ring scheduling, cancellation,
hysteresis and synchronous settling rules. Its snapshots lend packed records with
revisions plus visibility, transition and cull state; consumers upload only changed
revisions and must not mutate the borrowed arrays. The Three adapter owns its
materials, uploads and GPU stats. Other runtimes consume the same residency owner
without importing Three or reconstructing focus history from a final camera.
This extraction preserves the existing work budgets; it does not optimize sampling
or establish grass performance parity for a complete scene.

The motion correctness driver (`scripts/spoolReplay.mjs`) records every actual
presentation from preparation through the last selected window into lossless gzip
packets. Source capture finishes and its page closes before Three replay begins.
This avoids a second world competing with the actual menu presentation stream.
Compression and transport still alter cadence, so this is never a timing oracle.

A single lab worker compresses packets and posts them directly to a localhost disk
sink. Its bounded ordered queue drains all delivered packets without another
main-thread dispatch, with one compression operation at a time. Source-page
polling carries status only. Transferred input bytes remain charged until the
worker acknowledges their disk write; encoded PNGs replace their larger pending
reservations once their actual size is known. The source retains at most 32 packets and 128 MiB of encoded inputs, compression
reservations and endpoint images. A packet stays owned until the disk writer
acknowledges it. Total compressed recording is capped at 1 GiB; cap and deadline
failures are durable errors. Frozen poses share one dictionary within each packet,
and offline replay decodes one packet at a time. The complete actual command prefix
is retained, so later windows do not depend on guessed initialization state.

Every selected command frame and its source/replay counts are retained. Only the
first and last frames of each window receive PNG comparisons. Actual source Three
frame-clock groups are recorded, and replay waits for a new public frame clock only
when a new source group requires it. Async grass publication timing remains a
correctness gate; retaining commands alone is not a claim that all temporal state
is already reproduced. Nonzero endpoint differences and mismatched counts remain
failed gates, not performance results.

For resolved grass replay, the lab config substitutes the shared residency import
only inside Three's grass adapter for capture. The native replay config applies
the same provider inside the lab's shared grass field. Live capture delegates every owner method and
records its snapshot after each actual `prepareRender`. Record arrays are copied
only when base/ring revisions change; other routing and transition state is kept
per boundary. Replay consumes this stream through the same Three upload consumer,
without running a second sampler or forcing source settlement. Recorded residency
statistics are inputs, not independent validation. Actual active layer record
hashes and endpoint GPU indirect commands are checked separately. The native live
benchmark still runs the real shared residency owner; only render-only correctness
replay consumes these resolved publications.

The optional `localize` replay diagnostic stops after the recorded zoom endpoints
and saves small target crops. It compares the original submission with a redraw
of the prepared public scene and a temporary grass-hidden redraw. These altered
scenes attribute pixel contributions; they never replace source parity gates.

Native recorded replay uses the same packet/pose/resource decoder and archive loop.
Run the replay Vite config, then select `raw` after the archive argument of
`scripts/spoolReplay.mjs` (the next optional argument is the prepared atlas catalog
URL). Native mode requires `replay-only` and a fresh output directory; it never
captures source state, rebakes atlases or copies the archive. The input/catalog,
packet and resource hashes remain admission gates.

The native adapter preserves each crowd upload separately from render-only
presentations. Resolved grass records are checked against the source diagnostic
hash through one shared algorithm; selected endpoints additionally read actual
GPU record prefixes and indirect command buffers before the next presentation.
CPU recipe identity is reported separately from GPU readback. Source clock groups
remain recorded, while native shaders consume explicit recorded time/camera data.
The native mode retains strict image/count gates and makes no timing claim.

The first full native history result remains [diagnostic red](../../specs/battle-performance/assets/02-preflight/raw-spool/README.md).

GPU allocation accounting in [nativeGpuAllocations](src/nativeGpuAllocations.ts)
observes public device creation and explicit destruction. Install it before the
backend and telemetry so both are included; restore after their disposal. Live
and peak bytes describe requested buffer sizes and known texture texel payloads,
including mips, array layers and samples. Unknown or implementation-dependent
formats make current totals unavailable while live, and historical peaks remain
unavailable. Imported resources, swapchain images, driver overhead and deferred
reclamation are excluded: these numbers are not physical VRAM. The source battle
renderer currently exposes Three geometry/texture counts and optional program
counts only; those counts cannot establish byte parity with native candidates.
