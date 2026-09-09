# Far body continuity before performance

The 250-triangle target was rejected at the first bounded production inspection. Actual 376/460-triangle heavy/medium far meshes lost substantial head and limb surfaces in the magnified diagnostic, leaving helmet/feet visually detached. This was not accepted as harmless omitted fittings. Near ~8k remained coherent; mid ~1k was faceted but connected. All numerical admission and frozen-repeat checks passed, demonstrating why those checks alone cannot accept geometry.

The bounded correction raises only the far target to 800, keeping runtime near 8,000 and mid 1,000. No new joint policy, renderer LOD threshold, source-art rewrite or runtime fallback is introduced. `--tier far` reruns only that output from the original saved source, preserves existing near/mid bytes and writes `far-reduction.json` rather than overwriting their full report. Default invocation still writes all tiers.

## Material validation

The light-spear far export legitimately omitted every small bronze island. Blender therefore removed that unused material and renumbered texture indices; exact raw GLB material-array equality rejected it even though the production bake passed.

The shared importer test now uses the existing production `appearanceMaterials` owner. Original materials are registered first; every retained reduced-tier primitive must resolve to an existing identical semantic material slot. The same owner resolves embedded image bytes and sampler settings and rejects conflicts across tiers. Omitted slots/index renumbering are allowed; changed retained factors, normal-map flags/scales, image bytes or samplers are not. Mapped-frame checks use that same real resolved material registry.

The actual light-spear original/near/far comparison passes. Changing one retained roughness factor is red; changing one embedded image byte is red. Independent review identified authored `doubleSided` as a property the production registry intentionally does not encode. The test now additionally compares source sidedness for each semantic slot; its isolated sidedness mutant is red. No texture registry was duplicated. The first scratch sidedness mutant accidentally inherited the prior in-memory image mutation; it was corrected to copy input bytes per mutant before claiming isolated proof.

## Change ledger

| Test | Previous behavior | New behavior | Why / provenance |
| --- | --- | --- | --- |
| `mesh-lods.test.mjs` retained-material consumer | Exact raw array equality rejected valid omitted slots/index renumbering | Exact retained production semantics and resolved image/sampler identity, with missing distant slots allowed | Real light-spear red; original production material owner; factor and image-byte mutants red |
| Offline `--tier far` output control | Always regenerated all outputs | Far-only invocation leaves existing near/mid SHA256 unchanged and emits separate report | New bounded CLI option; actual heavy before/after hash control |

This leaf records the correction, not final hardware or visual acceptance. The first rejected sheets and full report remain in the task-owned `throwaway/mesh-lod/rejected-far250/` directory; the unchanged original-runtime reference sheets remain beside them.
