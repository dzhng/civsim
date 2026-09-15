# Source presentation packet checkpoint

The live loop now builds interpolation, readouts, attack triangles and tactical
cues synchronously, then calls the production renderer's `present` method. Its
camera center/target are detached from mutable input state. Presentation arrays
remain borrowed until this operation settles; asynchronous scheduling is the next
checkpoint and is required before installing an asynchronous candidate.

Source `present` remains synchronous. It calls the existing overridable readout,
draw, triangle and tactical-line hooks. The startup-only callback preserves the
observed extra grass settle/render between crowd upload and tactical render.
`CaptureBattleRenderer.draw` and `CapturePhotorealBattleWorld` command observation
are therefore retained. No ordinary frame settles grass or fences the queue.

CPU verification: four presentation tests and twenty existing crowd/action-adapter
tests pass; web typecheck passes. Existing animation assertions are unchanged;
their fixture adapters now consume prepared presentation fields instead of
intercepting submission inside BattleCrowd. A read-only Vitest setup redirected
excluded fixture reads to the primary checkout, without copying assets. Independent
code review found no concrete regression. No GPU or browser was run.

Required refreshed controls before acceptance: source menu preparation/running
origin and pan/zoom/horizon command recording, frozen/debug triangle clearing,
first/repeated frames, and benchmark frame/submission identity. Initial CPU work
now finishes packet construction before source hooks, so wall-clock event times
can shift even though hook order is retained. Existing archived images are not
reblessed and this checkpoint claims no visual equivalence or performance win.

## Asynchronous frame ownership

The following scheduler checkpoint permits a renderer promise without queueing
another frame behind a synchronous facade. The source still completes and
schedules synchronously. Exit aborts input/readiness first, then drains the active
frame before HUD cleanup, Game.free, or entry into another scene. Reentrant scene
switch requests do not await their own frame. Startup readiness also checks its
battle signal before its second delayed settle, preventing old readiness work
from mutating a reused renderer.

`renderAwaitMs` measures loop suspension, which can include library continuations;
it is not GPU time or proof of idle CPU. `renderWallMs` includes the full
presentation latency, while active renderer CPU is supplied by its receipt.
Animation-frame timestamps, interval/FPS definitions, simulation tick limits and
camera-tour scheduling are unchanged. No submission count advances merely because
a promise exists. Late cancelled completions do not record a frame or touch HUD.

Packets now include timeSeconds, fixedTime and frozen-effects policy before any
await. The synchronous source intentionally retains its existing separate draw
and tactical-render clock reads. A future candidate must use captured time rather
than resampling after resource waits; this is not a claim of exact historical
per-hook timestamp parity. Its startup callback must run only at a safe admitted
upload boundary, not concurrently with a pending scene operation.

New regression gates cover delayed scheduling, rejection, cancellation/drain,
reentrant and queued scene transitions, real BattleScene cleanup order, delayed
readiness cancellation, synchronous source receipts, and CPU/suspension accounting.
Existing benchmark/debug fixtures add zero wait and their previous CPU duration as
wall duration; their cadence and submission assertions are unchanged. The integrated source passes the actual [Menu validity controls](menu-validity/README.md); frozen/capture controls and performance acceptance remain separate.

Scheduler verification: 21 focused source/ownership/timing tests and all 20 existing
crowd/action tests pass. Web typecheck passes. Independent review found teardown
was suppressing unrelated asynchronous errors after abort; the corrected handler
suppresses only actual cancellation and a new regression preserves other failures.
The lab control typecheck also requires its source @packages alias mapping (owned
and corrected in the parent control pass). No existing assertion was re-pinned.

Parent integration:36 focused packet, frame, exit and crowd/action tests passed, and independent static review found no concrete source scheduling defect. The shared replay test-only async mock typing was corrected separately before the full web typecheck passed.
