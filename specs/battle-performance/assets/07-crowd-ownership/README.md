# Crowd ownership candidate — implementation active

The independent read-only review locates duplicate construction in the native
facade and retained snapshot. Its proposed single owner is accepted as a candidate
architecture, subject to the [slice contract](../../slices/07-crowd-ownership.md).
The compressed report and implementation prompt preserve the review surface.

Two reviewer claims are not adoption criteria: the estimated250–400ms saving is
unmeasured, and disappearing capture/begin profile labels can merely mean code
moved. Actual preparation time and presented cadence decide adoption. Playback
copying still has to happen once. Source Three is confirmed as current production;
the reviewer had left that uncertain. Do not delete comparison consumers or
unverified fields as part of this optimization.

Claude Opus implements in the isolated codex/battle-crowd-ownership worktree from
89365503. Root owns integration, hardware verification and disposition. No candidate
is merged or performance gain claimed by this document.

## Execution-order correction during review

The original reviewer incorrectly inferred deferred construction from async
syntax. Both library scene owners enter createSceneLifecycle.run, which evaluates
operation() synchronously before awaiting its result. Their crowd upload invokes
history.begin before awaiting GPU work. The actual retained construction therefore
already runs before the public upload call returns. No extra per-call snapshot is
needed to protect borrowed input. Remove that candidate copy and verify the real
consumer lifetime, preserving lifecycle refusal before any build.

A root synthetic facade test reproduced negative upload time when an arbitrary
mock delayed construction until after a yield. That is not the actual backend
execution pattern. It must not motivate clamping timings or a general extra CPU
accounting mechanism. Construction remains synchronous at the scene boundary;
measure it where it runs and test actual callers. The existing BattlePresentation
contract also keeps packet arrays stable until present settles, so moving the
readout await alone does not demonstrate a packet mutation bug.

## Initial candidate review

7547db35 is committed on the worker branch, not integrated. Claude is correcting
the extra library snapshots and timing clamp in the same worktree; current logs
are throwaway/correction-result.txt and correction-stderr.log there. Root will
review and run hardware only after correction. The initial report is retained.

The [failure-bearing test outputs](initial-test-failures.json.gz) distinguish
expected oracle recording, missing sparse fixture files, unchanged retired-policy
checks and corrected test/mocking mistakes from the unresolved full-suite failure.
One full web run reported1 failure/790 passes, but its shell command discarded
everything except the last five lines. Its name cannot be recovered from that
output. Eight subsequent green repeats do not explain it; do not call that a
resolved failure or repeat unchanged suites to seek green. After the actual
correction, capture complete focused-test output and exit status, with one
appropriate merged verification pass and diagnosis of any new failure.

The initial facade timing test supplied an invented positive buildMs without
spending that much measured CPU time, then motivated a production clamp when
subtraction went negative. Replace that inaccurate mock with elapsed-work
accounting under a controlled clock or a real consumer. The arbitrary deferred
mock used during root review is likewise not proof of a real backend defect.
