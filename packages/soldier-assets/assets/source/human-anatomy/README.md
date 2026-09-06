# Editable human anatomy candidate

This is original locally scripted Blender geometry, not a downloaded or externally
generated character. The [authoring script](../../../bake/blender-human-anatomy.py)
owns anatomical cross-sections, facial relief, the joined sculpt, provisional
reduced topology and deform rig. The editable sculpt remains in the source scene;
only the selected deform mesh and rig enter the GLB. Unrelated open Blender scenes
are excluded from both outputs.

Curvature-preserving reduction retains small silhouettes such as fingers; it
does not establish joint-quality. The reduced surface must remain manifold,
and bends must be inspected. Automatic heat weights are
limited and normalized to the runtime's four-influence contract; their bends
must still be judged in the production workbench. Source density is not a
performance budget.

The [candidate baker](../../../bake/human-anatomy.mjs) shares one untextured body
between the first pair's inspection entries. Its repeated tiers and manual-only
clip are inspection inputs, not production-ready distance or gameplay assets.
The [anatomy slice](../../../../../specs/battle-model-quality/slices/08-anatomy.md)
owns current acceptance evidence and unresolved art work.
