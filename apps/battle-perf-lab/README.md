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
