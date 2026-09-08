# Actual mesh LOD exporter — CPU control

This is an offline geometry reduction tool, not a performance or visual acceptance. The original fitted near source remains authoritative. Each reduced tier starts from that same saved Blender assembly and reuses the existing anatomy exporter, native orientation, armature and actions. No runtime LOD thresholds change.

## Decisions

- Reduce disconnected surfaces independently. A global collapse can erase a thin spearhead before appreciably reducing the torso; islands of at most 32 triangles remain exact, and larger islands retain at least 12 triangles. This is a pragmatic starting safeguard, not a guarantee of good silhouette or topology.
- Start at approximately 4,000 / 1,200 triangles. Production mesh bands are 9–18 and 4–9 projected pixels; retaining half of a 100k mesh would still amplify excessive geometry over a crowd. Per-island floors mean actual counts exceed targets. These are initial delivery targets, not measured optimal budgets.
- Preserve materials and let Blender interpolate UV/deform data through collapse. The existing GLB exporter retains its four-highest-influence normalization. Export warnings about additional interpolated influences are recorded, not interpreted as exact deformation preservation. Reduced skinning needs production visual checks.

## Control results

Blender 5.2.1 LTS, build `9e2066aef7ef`. Heavy: 127,196 → 4,016 → 1,328 triangles, all thirteen imported actions and rig exact. Frozen fourteen-action medium: 155,190 → 4,140 → 1,610, all actions and rig exact. Both preserve material JSON exactly and export finite UVs, normals, tangents and normalized skin weights. The source hashes and output hashes are in the paired reduction reports.

The Blender consumer fixture failed when the implementation merely copied its source, then passed real reduction while pinning unchanged original geometry and exact thin gear. Passing three identical GLBs to the importer consumer failed strict triangle descent. Real reduced exports passed. These tests establish numerical/export structure only, not visible quality, ground contact or the 30k/33ms envelope.

## Review

Shape review: one offline reduction owner, using the existing final exporter; no renderer, simulation, clock, schema or runtime fallback added. Diff review found no exporter defect. Independent CLI review session `01a08062-b13c-7113-9c0d-77081ec68fe1` also found no exporter issue; its medium benchmark finding applies to a separate, unfinished candidate-binding pass. Its Blender/Vitest attempts had environment setup failures, so they are not claimed as independent test reproductions. Main executed the controls listed here.

## Change ledger

| Test | Previous behavior | New behavior | Why / provenance |
| --- | --- | --- | --- |
| `blender-mesh-lods.test.py` | No exporter consumer coverage | A substantial mesh reduces while its original, thin gear, UV/material assignments and normalized weights remain controlled | New tracer; identity-copy mutant red, reduction green |
| `mesh-lods.test.mjs` | No three-tier export consumer coverage | Exact rig/actions/materials across decreasing real tiers; finite attributes and valid normalized joints/weights | New tracer; identity tiers red, both real sources green |

## Reproduce

Run from the repository root. The medium frozen donor path is preserved by the pike-family author; its source hash is the authority until that lane integrates.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python packages/soldier-assets/bake/blender-mesh-lods.test.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python packages/soldier-assets/bake/blender-mesh-lods.py -- --source packages/soldier-assets/assets/source/heavy-kit/heavy-kit.blend --body HeavyKit-Deform --output throwaway/mesh-lod/heavy
node packages/soldier-assets/bake/mesh-lods.test.mjs packages/soldier-assets/assets/source/heavy-kit/heavy-kit.glb throwaway/mesh-lod/heavy/mid.glb throwaway/mesh-lod/heavy/far.glb
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python packages/soldier-assets/bake/blender-mesh-lods.py -- --source /Users/david/dev/game-pike-family-delivery/throwaway/pike-family/complete/medium-phalanx.blend --body MediumPhalanx-Deform --output throwaway/mesh-lod/medium14
node packages/soldier-assets/bake/mesh-lods.test.mjs /Users/david/dev/game-pike-family-delivery/throwaway/pike-family/complete/medium-phalanx.glb throwaway/mesh-lod/medium14/mid.glb throwaway/mesh-lod/medium14/far.glb
```

Generated reduced Blender/GLB artifacts remain in the named task-owned output paths. This focused tool commit does not promote those artifacts or any presentation bindings; candidate visual/performance verification follows separately.
