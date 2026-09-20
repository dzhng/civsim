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
