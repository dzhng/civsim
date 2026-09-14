# 01 — World-stable surface and evidence

Status: pending. Dependencies: None.

## Contract and owner

Promote the CPU surface/domain contract described in architecture.md. The campaign raster adapter owns source classification; shared surface topology owns rendered samples and ray hits. Keep battle physical queries distinct.

Slice variable: **Surface identity and query correctness; existing appearance is held fixed.**

## Work

Archive the current production and spike cameras, test failures, source revision, and performance environment before changing owners. Create a small deterministic coastal ridge fixture plus two adjacent windows over the same real coordinates. Replace region-local tree seeds with world-cell identities at the shared placement boundary; preserve the current placement algorithm until its slice. Derive coast distance from a world field or a halo with a finite proven influence radius. Establish common mesh/query revision semantics, and make the preview consume them instead of its private height closure. Do not redesign geology yet.

## Runnable checkpoint

Existing campaign-landscape route plus planned landscape-surface scene: same feature sampled from different windows, both triangle diagonals, coast, and a tilted pointer ray.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

CPU tests require identical overlapping source samples, coast distances, and stable instance identities regardless of window origin/order. Sample actual mesh triangle centroids and compare ray hits; test out-of-detail queries fall back to the coarse surface. Run existing campaignLandscape, campaignRenderMask, campaignPicking, and terrainGrid tests; preserve old flat-plane tests only as tests of the flat projection primitive, not as terrain-picking proof.

Crop/mask: Full fixture and overlapping tile seam/raised-slope crops; the reference is context only. Mountain shape, vegetation density, water appearance, and lighting are explicitly out of scope.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Names, buffer packing, finite halo implementation, and baseline capture order are delegated. Domain units, world-coordinate determinism, and the separate physical/rendered query meanings are fixed.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: New geographic data or a requirement for exact campaign-to-battle geography would change the input contract. Neither is requested.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.
