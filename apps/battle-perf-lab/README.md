# Battle replay laboratory

The capture build runs the actual game menu, battle loop and crowd presentation.
Its Vite config substitutes a recording subclass only at the battle world's
renderer import. The normal build keeps the original renderer. Capture therefore
sees the interpolated positions, animation playback, readouts and attack triangles
that production submits, without a second simulation/bootstrap implementation.

Start Vite from the repository with
`web/node_modules/.bin/vite --config apps/battle-perf-lab/vite.config.mts`.
Launch the battle from the real menu, wait for the benchmark to enter its running phase, and
call `await window.__battleCapture.start()` in the browser console. Limits may
be passed as frame count and total retained bytes, including static data, pose
dictionary, frame chunks and the boundary PNG. `status()` exposes the current
finalization step and completed hash count. Capture is intentionally a
short window; its copies and source image readback make it unsuitable for FPS
measurement. Finishing a window cancels the benchmark through its public API after
the boundary image is requested; the benchmark is explicitly partial, and hashing
can finish without competing with further simulation/rendering. `cancel()` finishes
a partial window early.

The latest window replaces the previous one in this origin's IndexedDB. Open
`/renderer/battle-replay` to replay it through the real Three control, inspect
source/replay counts and download the capture or source image. Replay verifies
recorded hashes and the loaded appearance content before drawing. Typed arrays
are encoded by bytes, preserving their exact values independently of live wasm
storage. The driver decodes one frame at a time rather than a full recording's
object graph. Shared immutable frozen poses are stored once per window, with exact
Float64 bytes rather than a repeated numeric object graph. Loaded appearance
content is hashed one appearance at a time; the manifest records total encoded
content and the largest appearance, while the existing loader remains its owner.

These captures remain provisional until matching source/replay pixels and
submitted work establish that all history-dependent renderer inputs are represented. A matching hash proves input identity, not matching pixels, grass history,
submitted work or performance. The replay route deliberately reports image parity
as unverified; settling its cold world is a screenshot aid and cannot count as a
performance result. Source images are recorded at the frame-count boundary;
byte-limited or cancelled windows may have no matching source image.
