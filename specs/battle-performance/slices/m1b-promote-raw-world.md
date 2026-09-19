# M1b — promote the already-complete raw world

Depends on M1a. Move the live closure rooted at
`apps/battle-perf-lab/src/raw/battleScene.ts` into
`packages/battle-renderer/src/`, along with the shared shader/data helpers that
belong to the shipped world. Update imports; do not copy a parallel implementation.
Use the actual dependency graph, distinguishing type-only and fixture readback
imports. Keep comparison drivers, numerical readbacks and source timestamp taps
in the lab. Do not promote createSceneBackend's three-way selector.

The selected world owns HDR color/depth/camera/post attachments, scene layers and
resource disposal. The caller retains device/canvas/authoritative presentation.
Keep existing update frequency, buffer layouts, pass order, deferred destruction
and admission barriers; this pass is relocation/ownership, not an unmeasured frame
rewrite. Campaign's frame shell stays separate. Shared renderer-core edits need
campaign consumer checks.

The raw Menu route must use the final world package. The source product constructor
stays complete until M9. Preserve healthy-frame/depth ordering, resize, failure and
disposal controls and logical-resource accounting. Run the existing raw frame and
lifecycle controls, complete-scene/pose checks, affected TypeScript/unit checks,
and the unchanged30k floor. Use existing captures through snapCheck; any changed
pixels need comparison and fresh-eyes review before equivalence is claimed.

The unchanged30k scene currently verifies the still-source production constructor.
Its source-shaped diagnostics do not support the native lab facade yet. Keep
that source regression guard, and preserve the same numerical/workload floor when
M9 migrates its diagnostic reads. Do not label a source pass as a raw timing pass.
