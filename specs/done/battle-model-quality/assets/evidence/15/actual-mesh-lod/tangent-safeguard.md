# Collapsed smooth-face tangent safeguard

The production heavy bake rejected practical near before any GPU capture: normal-mapped imported vertex 201 had tangent `[0,0,0]`. The existing finite-attribute test passed because zero is finite. The production normal-frame assertion was not relaxed.

The defect was isolated to one smoothed skin triangle after collapse. Its UVs and geometric area were nonzero, but the interpolated smooth corner normal made the computed UV tangent degenerate. In an isolated copy, using that triangle's face normal yielded unit tangent vectors at all three corners. No source mesh, animation, UV or material was edited.

The offline exporter now explicitly triangulates its reduced copy, calculates tangent frames, and uses face normals **only for normal-mapped faces with a degenerate smooth frame**. It recognizes the fitted material owner's direct Normal Map → Principled connection. Unmapped slots are not flattened or rejected for unused tangent data. It recalculates and rejects remaining mapped degeneracy instead of inventing tangent vectors. Heavy near corrects one face; heavy mid/far and all medium tiers correct zero. These are ordinary fresh exports, not patched GLB tangents or old-value pinning.

The added `mesh-lods.test.mjs` check calls the production complete mapped-frame assertion on each mapped primitive and tolerates optional unmapped/default materials. It fails on the preserved invalid heavy near and passes the corrected export. Existing exact rig/actions/material, finite attributes, normalized skin and original-source controls remain unchanged. The full production heavy and medium bakes then pass, including mapped-frame and animated-bound validation. This numerical correction does not itself imply visual acceptance.

Independent review found three test/scope issues: the first draft also flattened unmapped slots, dereferenced optional materials, and tested only nonzero tangents rather than the complete production invariant. All three were corrected as described above; the archived review is not a no-findings claim. Main reviewed the final focused diff and reran the real red/green consumer and exporter controls.

| Test | Previous behavior | New behavior | Why / provenance |
| --- | --- | --- | --- |
| `packages/soldier-assets/bake/mesh-lods.test.mjs` — mapped tangent direction | Finite zero tangent could pass imported tier checks | Normal-mapped vertices require nonzero tangent direction | Actual production-bake failure; preserved invalid near red, corrected fresh near green |
| Existing production `deriveAnimatedBounds` normal-frame checks | Reject practical heavy near vertex201 | Pass corrected heavy and medium tiers with unchanged assertions | Offline smooth-face fix; no threshold or renderer change |

The invalid source artifact is preserved at `/Users/david/dev/game-actual-mesh-lod/throwaway/mesh-lod/heavy-invalid-tangent-near.glb`; its hash is also in the earlier practical reduction report. Exact diagnostic commands and red/green logs remain in this leaf and task-owned scratch. Original saved source hashes remain unchanged.
