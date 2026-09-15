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
