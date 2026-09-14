# 07 — Forests, edges and intermediate ground detail

Status: pending. Dependencies: [04](04-mountain-form.md), [05](05-terrain-material.md), [06](06-crown-shapes.md).

## Contract and owner

Share deterministic field-based scatter mechanics under the CPU terrain owner. Campaign and battle supply their own eligibility/reservation/density policy. Physical terrain remains read-only.

Slice variable: **Vegetation distribution and density on fixed terrain/models.**

## Work

Replace window-local scatter and battle circular approximations with world-stable candidate identities. Test actual forest membership, wet coverage and slope at each candidate. Preserve campaign regional reservations, existing species mixing, city/road clearance and battle gameplay clearings. Build dense interiors, irregular edges and sparser outliers; use existing bush/stone assets for intermediate detail before adding models. Species and clumps follow climate/source cover. Keep work bounded: iterate a deterministic candidate lattice or finite candidate budget, never retry until a desired count is reached. Upload static spatial buckets only when their residency/representation changes.

## Runnable checkpoint

Planned landscape-vegetation scene: forest interior/edge/plain and coast/cliff exclusion; battle wooded and authored irregular-forest fixtures use the same scatter core.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Test deterministic overlap across tile origins, candidate membership, slope/water exclusion, reservation handling, stable identities through LOD and bounded output. Explicitly reproduce the old battle disc spill outside an irregular forest and prove it is gone. Run terrainFeatures tests and battle-seating, plus campaign-lod region coverage.

Crop/mask: Forest interior/edge/outlier and open-plain crops, plus full frames. Tree geometry, material palette, terrain shape, water and lighting are frozen.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Candidate spacing, species weights, clump/edge curves and detail density are delegated within the budgets. Do not preserve exact old tree positions; preserve geography, exclusion behavior and determinism.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: A stronger preference for woodland density changes policy. Forest physics and strategic movement are not changed to match visual planting.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.
