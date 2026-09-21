# 13 — Battle presentation adopts the shared landscape

Status: in progress; TypeGPU production adoption remains open after the main merge. Dependencies: [05](05-terrain-material.md), [06](06-crown-shapes.md), [07](07-ecological-placement.md), [09](09-water-response.md), [10](10-environment.md).

## Contract and owner

Production battle uses TypeGPU; campaign and landscape material controls use Three. Share CPU terrain, coverage and appearance policy across those adapters. Existing campaign battlegen and battle descriptors remain the source of local character. Matching character does not require one rendering backend.

Slice variable: **Consistency of terrain character and visual integration in battle.**

## Work

Apply the accepted physical materials, cover transitions and scale-appropriate scenery to playable ground and vista. Use existing ground cover, tint, height and generated slope data. For authored A/B/C and city/crossing templates, derive visual slope response from geometry/profile while retaining authored semantic tint; do not write gameplay slope bands or regenerate physical terrain. Include the 07 forest-membership/slope fix. Keep the existing campaign site-to-recipe mapping; do not add a generic locale payload solely for symmetry. Any missing presentation input must be demonstrated at a consumer and recorded before a minimal seam change.

## Runnable checkpoint

Use battle-landscape-character for isolated authored A/C controls and battle-genmap-curated for pinned highland, wooded and coastal production worlds. Verify each route reaches the current TypeGPU adapter before using its captures as production evidence. Frame forest edges and water joins at their source features, including those outside the corridor-facing army vista. Actual campaign handoffs remain part of final integration verification.

The [composed audit](../assets/slice-13/composed/README.md) records nine exact-repeat hardware captures from the pre-merge Three battle and remaining defects. It is historical evidence, not acceptance of current TypeGPU output. Canonical baselines and full visual acceptance remain pending. A named map or green certificate alone does not prove the intended feature is visible in the image.

## Verification and review

Run battle-ground-turf, battle-terrain-seams, battle-seating, battle-terrain-controls, camera and water gates. Preserve terrain hashes, deployment/crossing behavior, save replay and combat_handoff tests. If Rust changes become necessary, run targeted cargo tests and rebuild wasm before browser evidence. Any physics/hash change is a regression, not an art baseline.

Crop/mask: Battle eye-level ridge/grass shelf, forest edge, water join and ground cues; compare the shared reference properties rather than miniature campaign scale. Battle balance, new map recipes and exact geographic replication are excluded.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Mode-specific density, material wavelengths and projected representation thresholds are delegated. Physics, recipe identity, deployment, and existing site semantics are fixed.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: Exact-geography replication or new tactical mechanics would change scope; the user explicitly chose character matching only.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.

## Current TypeGPU pickup

1. **Categorical coverage checkpoint complete.** Shared CPU ground/vista meshes carry rock/forest/scree weights before joins. Both adapters consume them; simulation tint grids remain unchanged. The production CPU seam regression passes, generated forest-edge false rock outlines disappear, authored A/C controls remain pixel-identical, and six views repeat exactly. See [coverage/shadow evidence](../assets/slice-13/coverage-shadow/README.md). Full production seam and composed-world acceptance remain required.

2. **Bitmap rock checkpoint complete.** TypeGPU now borrows one scene-owned mipmapped raw height image across ground and vista replacements, using the same neutral asset and material policy as Three. Authored visual slope defaults preserve null gameplay metadata and prop-footprint semantics. Close/distant generated ridge views improve; clay and authored A/C controls stay identical; all five repeat exactly. Campaign Alps/Italy/close Alps also remain identical. See [bitmap evidence and test ledger](../assets/slice-13/bitmap-rock/README.md). Motion, composed character and current hardware acceptance remain required.

3. **Common water policy and linear blending.** Consume `TERRAIN_WATER_BLEND` and the shared physical-water palette rather than duplicate constants. TypeGPU currently converts water to linear, blends with display-authored dry albedo, then converts the result again; match the accepted single-conversion boundary. Preserve the already-shared affine `shoreWaterSignal`. Campaign signed kilometre shores and battle filtered water weights remain distinct inputs. Compare field-water edges, oblique vista shores and lake/ocean joins in actual production images.

**Dry normals already have the required source:** TypeGPU beauty uses interpolated geometric normals without procedural bump. Preserve that behavior; clay's derivative face normals are a diagnostic, not a replacement for beauty normals. Normalize interpolated normals at the shading boundary where needed.

The bitmap is a terrain-scene resource, shared by ground and all vista generations; never decode per layer. Snapshot caller terrain inputs before the first asynchronous load. Borrowers release before the shared image; failed replacements retain it, and failed initial admission/disposal release it. Decode height data without color conversion and reuse the existing mip upload owner. Keep water changes in their own pass.

Each pass needs focused CPU/resource tests, production before/after pixels, fresh visual critique and exact repeats. Use terrain-seam/control and water scenes alongside the character views; the Three rock-detail test alone cannot prove TypeGPU output. Rerun the current hardware performance gate after bitmap sampling. No remaining visual or performance gate is closed by this plan.

## Historical checkpoints and remaining acceptance

The pre-merge Three [authored material and cover checkpoint](../assets/slice-13/README.md) established the accepted visual defaults and categorical coverage behavior. Its implementation and evidence do not establish production TypeGPU adoption.

The pre-merge composed critique identified forest density/boundary transitions (07), water/vista seams (08), heavy distant haze (10), isolated cool rock props on beige patches and a weak playable-field/distant-relief join. Reassess these in current production while preserving physical terrain and gameplay. The [density checkpoint](../assets/slice-07/battle-density/README.md) records historical woodland presence and bounded cost, including unresolved full-frame hardware cardbar raster drift.

The old close-camera zoom mismatch and Three readout `depthTest`/`toneMapped` discrepancy describe the retired battle adapter. Main's TypeGPU migration supersedes those implementation diagnoses. Use current production camera telemetry, readout depth/output contracts and performance evidence for new verdicts; do not carry the old findings forward as present-tense defects or infer that final landscape acceptance has passed.
