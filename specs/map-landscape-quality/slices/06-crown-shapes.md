# 06 — Tree crown representation and scale

Status: pending. Dependencies: [01](01-surface-contract.md).

## Contract and owner

Keep the shared scenery registry as the mesh owner. Extend existing leaves/canopy representations rather than make campaign-only tree families or import the battle renderer into model code.

Slice variable: **Tree silhouette and foliage coverage across projected sizes.**

## Work

Improve the coarse crowns so they no longer read as identical attached spheres with abrupt dark patches. Preserve species silhouettes and credible trunk attachment. Add a small deterministic set of crown variants per family, with shared geometry reused by instances. Verify close leaf coverage separately from distant crown coverage. Choose representation by projected crown size with hysteresis and stable identity; do not flip the entire scene to one detail mode. Make casts/receivers follow the same representation and pose.

## Runnable checkpoint

Extend tree-canopies with family contact sheets and a planned landscape-tree-lod zoom/return scene at battle and campaign pitch.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Compare fixed tree poses at near/mid/far pixel sizes. Require recognizable crowns without alpha disappearance or a noticeable coverage dip during transitions. Repeat the sequence with a frozen owned clock. Keep detailed model snapshots unchanged unless the tree improvement intentionally affects them, then ledger the change. Report visible/submitted/shadow work.

Crop/mask: Tree-family sheet, isolated crown/trunk and transition crops. Forest density, terrain form, water and environment are frozen; large-scale planting patterns are out of scope.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Variant count, crown construction and representation thresholds are delegated within measured budgets. Static identity and the shared registry are fixed. Global MSAA changes are excluded.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: Preference for a more painted versus detailed crown changes its geometry/material profile, not ownership. Decide from the reference autonomously.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.
