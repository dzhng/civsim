# 01 — World-stable surface and evidence

Status: complete. Dependencies: None.

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

## Completed evidence — 2026-09-15

The preview now uses the neutral indexed surface/query owner. World-aligned windows include a coast halo beyond the 18 km influence and normal stencil; shared vertices have identical heights, normals and coast distances. Tree placement uses world-cell seeds. Surface views choose one owner for samples and ray hits, falling back to coarse coverage. Physics remains untouched.

The `landscape-surface` scene renders two adjacent coastal-ridge windows and checks a tilted camera ray. CPU checks exercise both triangle diagonals, overlapping real-coordinate windows, tree identity and hidden coarse hits. The full web suite passes (75 files / 428 tests), typecheck, focused lint and build pass. `campaign-landscape`, `landscape-surface` and `terrain-water` repeat at zero differing pixels with explicit zero tolerances on the landscape scenes. No GPU validation/page errors. Evidence is in [slice-01 assets](../assets/slice-01/).

Comparison verdict: accept the surface contract, not final landscape quality. Alps changed 500,506 RGB pixels and Italy 619,409 versus the archived spike, predominantly stable world reseeding, aligned sampling and halo-derived normals. Cameras, materials and light remain fixed for those comparisons. Independent critiques found no internal cracks; contour-like texture, stepped crests, tree scale/contact ambiguity and flat water remain assigned to 04–10. The synthetic fixture intentionally exposes its outer sample boundary; production coverage belongs to 03. The final adjacent-window fixture was separately inspected and critiqued.

Independent Codex review found stale active baselines while the review was running; reviewed baselines were subsequently updated and the exact-repeat run passed. Shape review retained one indexed geometry/query owner and removed the battle-specific mesh-type dependency from the shared consumer. Runtime revision identities are unique per generated surface; tile cache identity remains a separate spatial concept.

Baseline provenance at `c20af951`: production tests passed on Google SwiftShader, 1280×800 DPR1, fixture camera `(0,450,6)`. Production visual checks at DPR2 passed their existing tolerant checker but differed by 195–5,820 pixels in several frames. No production baselines were changed; this inherited drift remains to diagnose during production acceptance. Software timing is not hardware evidence.
