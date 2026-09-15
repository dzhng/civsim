# Authored appearance inputs

An appearance is an atomic bundle: three explicit geometry tiers, compatible skeleton,
animation, materials, conservative animated bounds, and an explicit far pose. The
catalog selects complete bundles; absent or malformed inputs fail visibly instead of
silently substituting a procedural model.

The executable input contract lives in [the GLB importer](../bake/gltf.mjs) and
[appearance producer](../bake/appearance.mjs). Their tests pin supported weighted
attributes, hierarchy and bind transforms, deterministic baking, and actionable
errors. Skeleton-local tracks are retained alongside sampled skin matrices so
later animation composition does not need to reconstruct a rig from matrices.

All three tiers must be supplied deliberately. The near tier owns animation;
compatible joint names and binds permit index remapping, not a different rig hidden
behind a shared label. Clip looping is authored explicitly, never guessed from its
name. Source Y-up coordinates use the shared engine-basis conversion.

The current producer retains original GLBs as provenance and extracts scalar PBR
factors. It does not promise source texture parity: texture-backed production
materials are a subsequent quality slice. Diagnostic Blender fixtures exercise
this transport contract, not the finished art-quality target.

Generated placeholders remain catalog entries until deliberately replaced. Source
candidates use a separate catalog for review through the same production loader
and renderer; reviewing a candidate never promotes it to the default roster.

The fixed far pose can be prepared as a [verified offline property atlas](../bake/impostors/README.md).
Its content identity follows posed geometry and authored material inputs; runtime
renderers consume the shared mip-byte contract without loading the authoring renderer.
