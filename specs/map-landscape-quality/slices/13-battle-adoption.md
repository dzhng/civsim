# 13 — Battle presentation adopts the shared landscape

Status: in progress; shared owners and authored material checkpoint implemented. Dependencies: [05](05-terrain-material.md), [06](06-crown-shapes.md), [07](07-ecological-placement.md), [09](09-water-response.md), [10](10-environment.md).

## Contract and owner

Battle consumes the same shared material/water/scenery owners through battleTerrainBuild and terrainLayer. Existing campaign battlegen and battle descriptors remain the source of local character.

Slice variable: **Consistency of terrain character and visual integration in battle.**

## Work

Apply the accepted physical materials, cover transitions and scale-appropriate scenery to playable ground and vista. Use existing ground cover, tint, height and generated slope data. For authored A/B/C and city/crossing templates, derive visual slope response from geometry/profile while retaining authored semantic tint; do not write gameplay slope bands or regenerate physical terrain. Include the 07 forest-membership/slope fix. Keep the existing campaign site-to-recipe mapping; do not add a generic locale payload solely for symmetry. Any missing presentation input must be demonstrated at a consumer and recorded before a minimal seam change.

## Runnable checkpoint

Prepared additions to battle-landscape-character preserve isolated authored A/C controls and include full compositions (application A; existing shared-world lab C). The existing battle-genmap-curated scene owns the pinned highland, wooded and coastal production worlds; prepared forest-edge and water-join cameras inspect source features outside the corridor-facing army vista. Actual campaign handoffs remain part of final integration verification.

The [composed audit](../assets/slice-13/composed/README.md) records nine exact-repeat hardware captures and remaining defects. Canonical baselines and full visual acceptance remain pending. A named map or green certificate alone does not prove the intended feature is visible in the image.

## Verification and review

Run battle-ground-turf, battle-terrain-seams, battle-seating, battle-terrain-controls, camera and water gates. Preserve terrain hashes, deployment/crossing behavior, save replay and combat_handoff tests. If Rust changes become necessary, run targeted cargo tests and rebuild wasm before browser evidence. Any physics/hash change is a regression, not an art baseline.

Crop/mask: Battle eye-level ridge/grass shelf, forest edge, water join and ground cues; compare the shared reference properties rather than miniature campaign scale. Battle balance, new map recipes and exact geographic replication are excluded.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Mode-specific density, material wavelengths and projected representation thresholds are delegated. Physics, recipe identity, deployment, and existing site semantics are fixed.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: Exact-geography replication or new tactical mechanics would change scope; the user explicitly chose character matching only.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.

## Authored material checkpoint

The current audit found that null gameplay slope descriptors disable physical rock response on authored templates. The focused checkpoint resolves a visual default inside the existing material, preserving semantic tint and all physical inputs. Existing shared scenery and forest membership/slope work is already adopted. See [evidence and corrected cover audit](../assets/slice-13/README.md). Full slice acceptance remains pending.

Fresh composed-image critique keeps acceptance open: forest density and boundary transitions belong to 07, water/vista seam to 08, and heavy distant haze to 10. Battle-specific integration must address isolated cool rock props on beige patches and the weak visible join between playable field and distant relief using material/vista presentation, preserving physical terrain and gameplay. The hardware audit is archived; scene edits await canonical baseline delivery.

The [density checkpoint](../assets/slice-07/battle-density/README.md) is accepted only for woodland presence and bounded cost. Its world crop is deterministic, while full-frame hardware cardbar raster drift remains unresolved; software baseline delivery is still pending. The standing 30k scene requests close zoom 24/28 but records settled zoom 8, so fix that verification mismatch before making close-camera performance claims.
