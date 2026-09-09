# Final saved-source reproduction

The final saved Blender assemblies reproduce the shipped roster through the
existing exporter, reducer, baker and ordinary asset loader. This closes the
`.blend → GLB → bake` evidence gap: the earlier roster test began at tracked
LOD GLBs and could not establish that first boundary.

## Scope and result

Pinned revision: `2e200452f1fe2ab815923ac1f26000c729a1a636`.
Blender 5.2.1 LTS, background/factory-startup, two threads per process, at most
two concurrent export jobs. No GPU/browser render or interactive Blender scene
was used. A clean `git archive` extraction contained the existing source/bake
code and all 18 final saved assemblies, not regenerated donors. Every extracted
assembly hash equals the pinned tracked source. Their file textures are packed,
so no untracked external texture path supplies an export input.

All 18 source exports succeeded. They produced 54 fresh reduced GLBs using the
published 8000/1000/800 targets and the unchanged island/extent/tangent rules.
The primary/rest pike pairs reuse their respective saved assembly, producing
20 separately baked appearance bundles. All 20 load individually; their fresh
complete catalog also passes `loadAppearanceCatalog` and gameplay admission.
The existing `mesh-lods.test.mjs` passes on every fresh near/mid/far set.

The [summary](summary.json) and [per-appearance comparisons](comparisons/) record:

- All three loaded meshes are byte-identical to the shipped meshes: positions,
  topology, normals, tangents, UVs, colors, joints, weights, material IDs and faction masks.
- Rig and clip metadata, sampled local-animation bytes and computed bounds agree
  exactly. Material factors, samplers and image-channel sets agree; image bytes
  have identical hashes. No float differences were observed in this run.
- Every extracted and production `.blend` hash remains unchanged. The production
  catalog hash remains unchanged; no fresh product was published over it.

The [source inventory](source-inventory.json) identifies actual saved scenes,
deform meshes, armatures, owned action tracks and packed images. The
[manifest](manifest.json) maps every appearance to its source and existing recipe.
The [reduction reports](reductions/) retain actual topology counts and fresh GLB
hashes; targets are not falsely presented as exact triangle caps.

## Reproduction and evidence ownership

The maintained owners are the pinned revision's
`packages/soldier-assets/bake/blender-mesh-lods.py` (which calls
`blender-human-anatomy.py::export_candidate`), `roster.mjs::rosterRecipe`,
`appearance.mjs::bakeAppearance/writeAppearance`, and
`src/appearanceBundle.ts` loader. The comparison does not call
`bakeRosterAppearance` on old GLBs as its fresh-product source.

[Exact per-source commands](commands.json) include the working directory,
arguments, output log, start/end time and exit code for the 17 jobs following
the heavy tracer. [Initial and final commands](initial-commands.md) cover that
tracer, tracked-source extraction, source inspection and final catalog gate.
[LOD contract commands](lod-contracts.json) cover all 18 cross-tier checks.
[Driver records](driver-records/) preserve the actual short orchestration and
comparison code as evidence, including local-file fetch at the network boundary;
they are not another production exporter or a newly maintained general runner.
Their absolute paths describe this run and must be relocated for another checkout.

The [full run log](logs/full-run.txt) records every source finishing with exporter
and bake/load exit 0. Final [contract output](logs/final-contracts.txt) records
all cross-tier checks and complete-catalog admission. Export logs retain Blender's
multiple-image-node and highest-four-influence warnings. Those existing export
operations were not disabled or altered: the fresh/shipped skin, material and
texture comparisons establish the resulting data, rather than ignoring warnings
and assuming equivalence.

## Boundary

This is final saved-source reproducibility and loader admission, not regeneration
of authored `.blend` files from donor scripts, a new raster capture, visual-quality
approval or performance measurement. No art, source, catalog, assertion threshold
or baseline was changed. Large extracted sources and fresh generated products
remain scratch; the tracked original sources, pinned code, input/output hashes,
commands, logs and comparison results are the durable proof.
