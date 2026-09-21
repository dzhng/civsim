# Validate pose commands at their owner

Candidate457caafa corrects the camera-reuse branch's admission boundary.
A synchronous caller batch closes its error scopes before an asynchronous crowd
upload or reprojection resumes. Pose encoding therefore owns a local scope that
covers its actual commands. Pose work remains owed until validation succeeds;
a rejected or discarded submission cannot become reusable state. An encoding
exception remains the primary failure even when validation also rejects.
This restores the existing admission contract, without a new product policy.

Root regressions exercise both actual asynchronous scene entrypoints inside the
production `GpuAdmissionBatch`. Their GPU double attributes failures to scopes
open at submission, rather than injecting a global error during a synchronous
mock upload. Both fail on25034412 because the operation resolves, then pass with
the local scope. A third regression first reproduced the secondary validation
error hiding the original encoding error; the corrected drain preserves it.
These are three added tests, with no existing expectations weakened.

Root121 TypeGPU tests and web TypeScript pass. Independent review accepted scope
placement and disposal handling, identified the error-preservation issue above,
and a final scoped Codex review found no remaining findings (29 scene tests pass).
The broad review's borrowed-public-directory complaint concerns unstaged worktree
setup; the commit contains only battleScene.ts and its lifecycle test.

This is CPU/control-flow evidence with mocked GPU edges. Actual device failure
and retry checks, camera performance, and integration remain open. The branch is
`codex/battle-camera-pose-reuse`; do not claim a live FPS gain from this correction.
