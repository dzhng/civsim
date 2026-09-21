# Initial scene integration candidate — review finding still open

Fixed build2da55ab2 passes real Menu whole-population seating over generated
terrain:15560 soldiers, then16060 after spawning, height spans3.902/4.637m,
zero nonfinite samples and worst elevation difference0. Repeated inspection
adds no draw or simulation mutation; reload advances the crowd generation and
matches the frame that presented it. Disposal rejects inspection and releases
all tracked allocation bytes.

Separate fault injection passes successful reload, missing atlas retention,
actual GPU validation rejection with old crowd retention, and disposal while
GPU admission waits. Pending/future reloads reject with disposed errors; the
recorded disposal has0 tracked bytes and0 tracked live textures. No page errors.
These are resource/admitted-CPU-state checks, not drawn-foot, image parity,
frame-time or moving-shadow proofs. Captures were newly created diagnostic
baselines, not source comparisons.

Root candidate62/62 and live57/57 tests and live-test typecheck pass. The first
build failed because root's worktree setup mounted wasm at web/wasm instead of
web/src/wasm; correcting the borrowed mount restored the build. A first external
preview launch omitted BATTLE_NATIVE_BACKEND and failed before navigation; the
corrected launch produced the recorded completed run.

Independent review found an uncovered P2: reload after uploadCrowd but before
first prepare loses the admitted pose because lastCamera is null. Root accepted
that finding by tracing the public scene sequence. The Opus follow-up owns a
red regression and correction; this candidate is NOT integrated yet. The ordinary
Menu tests above do not cover that corner and do not overrule the finding.
