# 13 — Battle presentation adopts the shared landscape

Status: pending. Dependencies: [05](05-terrain-material.md), [06](06-crown-shapes.md), [07](07-ecological-placement.md), [09](09-water-response.md), [10](10-environment.md).

## Contract and owner

Battle consumes the same shared material/water/scenery owners through battleTerrainBuild and battleTerrain. Existing campaign battlegen and battle descriptors remain the source of local character.

Slice variable: **Consistency of terrain character and visual integration in battle.**

## Work

Apply the accepted physical materials, cover transitions and scale-appropriate scenery to playable ground and vista. Use existing ground cover, tint, height and generated slope data. For authored A/B/C and city/crossing templates, derive visual slope response from geometry/profile while retaining authored semantic tint; do not write gameplay slope bands or regenerate physical terrain. Include the 07 forest-membership/slope fix. Keep the existing campaign site-to-recipe mapping; do not add a generic locale payload solely for symmetry. Any missing presentation input must be demonstrated at a consumer and recorded before a minimal seam change.

## Runnable checkpoint

Planned battle-landscape-character scene plus existing generated highland/wooded/coastal and authored battle routes, and actual campaign handoffs.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Run battle-ground-turf, battle-terrain-seams, battle-seating, battle-terrain-controls, camera and water gates. Preserve terrain hashes, deployment/crossing behavior, save replay and combat_handoff tests. If Rust changes become necessary, run targeted cargo tests and rebuild wasm before browser evidence. Any physics/hash change is a regression, not an art baseline.

Crop/mask: Battle eye-level ridge/grass shelf, forest edge, water join and ground cues; compare the shared reference properties rather than miniature campaign scale. Battle balance, new map recipes and exact geographic replication are excluded.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Mode-specific density, material wavelengths and projected representation thresholds are delegated. Physics, recipe identity, deployment, and existing site semantics are fixed.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: Exact-geography replication or new tactical mechanics would change scope; the user explicitly chose character matching only.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.
