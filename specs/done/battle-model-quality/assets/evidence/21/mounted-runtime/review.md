# Mounted runtime tiers

The shared offline reducer now derives practical runtime meshes from the retained
mounted sources. Original editable assemblies, equipment, rig and authored actions
are untouched. Reduced editable exports remain local reproducible intermediates;
the committed runtime GLBs and adjacent reduction reports are the consumer inputs.

Targets are 8,000 / 1,000 / 800 triangles. Actual counts are lance 7,920 / 986 / 756,
sword 7,914 / 990 / 762 and archer 7,950 / 968 / 760. Each tier is reduced directly
from its original saved source, not from another reduction.

The six adjacent control logs compare each original against runtime near and
mid/far. Rig/actions are exact, skin values finite and normalized, and retained
material factors, texture bytes and samplers agree through the production material
registry. The old literal material-array check failed when omitted small islands
removed unused slots; shared semantic test `de6cfb26` resolves that indexing-only
assumption without forgiving material changes. Production bake controls also pass.

This is CPU/source verification, **not** a distance silhouette or hardware cadence
acceptance. Root owns the complete-roster visual and performance gates. No GPU
capture or baseline update was performed for these exports in this lane.

Reproduction uses `blender-mesh-lods.py` with the original family Blend, its named
`<family>-Deform` mesh, output `<family>/runtime`, and `--far-triangles 800`.
The existing `mesh-lods.test.mjs` owns the imported GLB controls; no second baker or
material comparator was added.
