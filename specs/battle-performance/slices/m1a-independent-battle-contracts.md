# M1a — own the battle presentation contract independently

Raw is selected by [the decision](../backend-decision.md). This pass removes type
ownership by the old implementation; it changes no rendering behavior.

Own the frontend API/options/dispose hook/memory and GPU-event shapes in
`web/src/battle/battleRendererApi.ts`, using explicit signatures rather than
`Pick<BattleRenderer>` or `ReturnType` of the old renderer. Put renderer-neutral
camera/tactical-frame data in `packages/battle-renderer/src/types.ts`; terrain,
water and environment types keep their existing real owners. Update actual type
consumers in web, the selected lab facade, photoreal reference and renderer-lab.
Do not leave re-export aliases or a second generic renderer facade. Keep current
behavior and diagnostic meaning; source memory counts must not become GPU buffer
counts by renaming. The old source runtime remains the production constructor
until M9, and experiment-specific event fields are retired at cutover.

Inputs are the current immutable BattlePresentation and canonical Camera3DParams.
This pass creates no GPU resources, new clock, message or asynchronous boundary.
Its perf contract is no added work; it cannot claim a speedup.

Gate: full TypeScript plus affected renderer/presentation/freeze/benchmark tests,
including native facade conformance. Inspect the runtime import graph to confirm
that moving types did not introduce a runtime dependency or new selector. Existing
playable Menu and production routes remain unchanged; no new visual assertion is
needed for a types-only change. If behavior changes, split and verify it separately.
