# 07 — Forests, edges and intermediate ground detail

Status: battle eligibility and campaign canopy coverage checkpoints integrated; further ecological detail and composed acceptance remain open. Dependencies: [04](04-mountain-form.md), [05](05-terrain-material.md), [06](06-crown-shapes.md).

## Contract and owner

Share deterministic field-based scatter mechanics under the CPU terrain owner. Campaign and battle supply their own eligibility/reservation/density policy. Physical terrain remains read-only.

Slice variable: **Vegetation distribution and density on fixed terrain/models.**

## Work

Preserve world-stable candidate identities and actual forest membership, wet coverage and slope eligibility at each candidate. Preserve campaign regional reservations, existing species mixing, city/road clearance and battle gameplay clearings. Build dense interiors, irregular edges and sparser outliers; use existing bush/stone assets for intermediate detail before adding models. Species and clumps follow climate/source cover. Keep work bounded: iterate a deterministic candidate lattice or finite candidate budget, never retry until a desired count is reached. Upload static spatial buckets only when their residency/representation changes.

## Runnable checkpoint

The existing [landscape-vegetation scene](../../../web/scenes/campaign/landscape-vegetation.mjs)
checks scenery seating, membership and upload lifetime through terrain changes.
It does not prove forest interior/edge/plain composition or coast/cliff exclusion;
those remain required through regional and battle production controls.

## Verification and review

Test deterministic overlap across tile origins, candidate membership, slope/water exclusion, reservation handling, stable identities through LOD and bounded output. Explicitly reproduce the old battle disc spill outside an irregular forest and prove it is gone. Run terrainFeatures tests and battle-seating, plus campaign-lod region coverage.

Crop/mask: Forest interior/edge/outlier and open-plain crops, plus full frames. Tree geometry, material palette, terrain shape, water and lighting are frozen.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Candidate spacing, species weights, clump/edge curves and detail density are delegated within the budgets. Do not preserve exact old tree positions; preserve geography, exclusion behavior and determinism.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: A stronger preference for woodland density changes policy. Forest physics and strategic movement are not changed to match visual planting.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.

## Accepted checkpoints and their limits

| Checkpoint | Evidence and retained boundary |
| --- | --- |
| Battle membership and slope eligibility | [Ecology evidence](../assets/ecology/README.md) proves exact extracted forest membership, world-stable candidates, all-prop exclusions and correct boundary slopes. Explicit authored discs retain their meaning. Spatial correctness does not establish composed forest quality. |
| Campaign placement ownership and canopy coverage | [Canopy evidence](../assets/slice-07/canopy-coverage/README.md) accepts improved woodland mass on the shared relief and existing campaign candidate/reservation owner. The embedded landscape planting path is retired; do not reimplement it. |
| Bounded battle density | [Density evidence](../assets/slice-07/battle-density/README.md) accepts improved woodland presence with scoped hardware cost. Its full-frame HUD drift and pre-migration consumer limits remain historical evidence, not current TypeGPU acceptance. |
| Categorical forest material boundary | [Forest-cover evidence](../assets/slice-07/forest-cover/README.md) accepts removal of false rock at grass/forest transitions. [Current TypeGPU coverage evidence](../assets/slice-13/coverage-shadow/README.md) proves the migrated consumer. Preserve independent cover weights before interpolation; physical tint remains unchanged. |
| Detached campaign rock removal | [Production comparison](../assets/slice-07/campaign-rock-removal/README.md) accepts continuity without changing tree records. Generic battle/authored rocks remain; this does not supply intermediate ground detail. |

The [budget-edge checkpoint](../assets/slice-07/budget-edges/README.md) adds small
world-stable variation to final selection, softening some clump boundaries while
preserving the existing cap and eligibility. Both production regions repeat
exactly. Full-size outliers and missing intermediate growth remain unresolved.

## Remaining ecological quality

Resolve oversized geometric conifers, isolated planted clumps, exposed slope
placement and missing intermediate ground detail in campaign. Battle still needs
judgment of tree proportions, forest-floor striping, understory and troop
visibility under crowns through the current production adapter. Neither larger
crowns nor more candidates alone establishes a natural forest edge.

Keep species, regional budgets and static/dynamic reservations in the existing
[campaign producer](../../../packages/game-renderer/src/campaign/scenery.ts).
Share relief sampling with geometry; candidate identity must not depend on mesh
tessellation, and final seating follows the presented surface. Keep exact forest
membership and authored-disc semantics in the existing
[battle producer](../../../packages/game-renderer/src/battle/terrainFeatures.ts).
All props must respect water, roads, walls and gameplay clearings. Do not weaken
exclusion assertions to mature trees only or introduce another scatter lattice,
budget, tier schema or clearance owner.

The common [production matrix](15-acceptance.md) owns final regional scale,
forest interior/edge/outlier and plains-detail composition, current hardware,
strict repeats and final critique. Preserve scoped accepted checkpoints while
keeping the whole slice open.

## Rejected intermediate-growth controls

The independent shrub pool exceeded existing budgets. Relocating existing bushes
made little campaign difference and admitted battle bushes into grass-painted
clearings. The subsequent age/size mixture was also rejected: smaller trees
exposed more relief but left dense boundaries abrupt. None was integrated.
These outcomes rule out repeating the same size-only or separate-pool proposal
without a new hypothesis about the visible transition. The former mature-record
freeze was a diagnostic constraint, not a requirement to preserve every mature
tree in future ecological work.
