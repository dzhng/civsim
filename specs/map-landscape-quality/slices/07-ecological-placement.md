# 07 — Forests, edges and intermediate ground detail

Status: battle eligibility checkpoint integrated; campaign placement and composed visuals pending. Dependencies: [04](04-mountain-form.md), [05](05-terrain-material.md), [06](06-crown-shapes.md).

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

## Battle eligibility checkpoint

The battle subpass replaces the equivalent-area forest disc with each extracted
forest's exact source-cell footprint. Explicitly authored features without a
footprint retain their disc meaning. World-anchored lattice candidates share
identity across windows and feature enumeration; the existing per-forest cap is
selected by stable random priority rather than filling the first rows.

Only forest tint cells admit trees. Existing water, roads, walls and gameplay
clearings therefore remain exclusions without a second reservation map. The
shared height sampler rejects steep surfaces; its normal helper now uses the
actual one-sided sample separation at field edges, also correcting the same
eligibility error for battle grass. No physical height, tint or gameplay rule
is changed.

The production placement control has 139 of 240 trees outside a concave forest
before this subpass and 0 of 240 after. Seven CPU cases cover that reproduction,
reserved cells, slopes, deterministic identity, explicit disc semantics, window
overlap and boundary normals. See [battle ecology evidence](../assets/ecology/README.md).

Whole-slice status remains **pending**: campaign distribution, production scale,
intermediate vegetation detail and the composed visual acceptance still remain.

## Campaign implementation pickup

The instance data and physical scenery layer now have neutral owners, with unchanged behavior. The existing `campaign/scenery.ts` already owns species mixing, regional budgets, static city/road clearances and dynamic reservations. Reuse those policies when replacing the embedded planting loop in `campaignLandscape.ts`; do not create another clearance implementation. Candidate positions must depend on a fixed world lattice, not terrain tessellation. Sample slope/water at the candidate location, and keep rendered seating tied to the presented surface.

Global candidate generation, local presentation and terrain geometry are distinct responsibilities. Prefer the existing world candidate cache and view filtering where they fit. Remove the landscape builder's redundant planting path when its callers consume the shared campaign producer.

### Current campaign pass (not yet accepted)

The global producer now proposes trees on a fixed 4 km lattice, queries actual
source cover and coastal footprint, and rejects steep canonical relief sampled
at 2 km. Coast scratch is bounded to one 128 km block with a 24 km halo; no
whole-map height cache is introduced. Source interpolation and geographic relief
are extracted to one owner shared by geometry and eligibility, with exact array
equality at 2, 8 and 16 km verified before further visual changes.

Existing regional budgets, species choices and static/dynamic reservations remain
the campaign policy owner. Candidate heights are assigned by the consuming
presentation surface: the current production producer still seats against its
current field, and the new physical world must seat against its presented mesh.
The embedded prototype planting path and worker scenery payload are removed. Real-region distribution is under fresh visual review; repeated residency/upload
and fog/growth behavior pass. Whole-slice acceptance remains pending.


The sparse first candidate and an evenly dispersed second candidate were rejected.
Candidate selection now uses spatially coherent priority, preserving dense cores
instead of uniformly thinning them. Source cover remains primary; moisture can
support small groves on gentle rendered foothills. The global candidate cap is
32,000, separate from visible scenery. Mixed broadleaf cover now connects northern
conifer groups. The species/density policy remains in the existing campaign owner.

The water source predicate excludes river centers without altering strategic
land semantics. Fog applies the campaign entity visibility rule to scenery and
cannot reveal it during a terrain swap. A membership-change regression exposed
stale Three bindings after disposing/reusing geometry. Shrinking sets retain their
capacity; growth replaces geometry identity and disposes the old buffers. The
browser fixture exercises hiding/restoring/growth and reports no GPU errors.
