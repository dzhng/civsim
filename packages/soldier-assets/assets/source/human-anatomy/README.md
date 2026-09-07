# Editable human anatomy candidate

This is original locally scripted Blender geometry, not a downloaded or externally
generated character. The [authoring script](../../../bake/blender-human-anatomy.py)
owns anatomical cross-sections, facial relief, the joined sculpt, provisional
reduced topology and deform rig. The editable sculpt remains in the source scene;
only the selected deform mesh and rig enter the GLB. Unrelated open Blender scenes
are excluded from both outputs.

The hidden sculpt is the joined construction surface, not a second final model.
Fine facial landmarks live on the editable deform mesh after local face
refinement. Projection back to the construction surface restores smooth contours
that reduction cannot retain; the subsequent eye and nasal shaping leaves the
existing body and hand weight solution intact. Edit this final mesh when judging
exported facial form, rather than the hidden construction input.

Curvature-preserving reduction retains small silhouettes such as fingers; it
does not establish joint-quality. The reduced surface must remain manifold,
and bends must be inspected. Automatic heat weights are
limited and normalized to the runtime's four-influence contract; their bends
must still be judged in the production workbench. Source density is not a
performance budget.

The [candidate baker](../../../bake/human-anatomy.mjs) shares one untextured body
between the first pair's inspection entries. Its repeated tiers and manual-only
clips are inspection inputs, not production-ready distance or gameplay assets.
Pronation is carried by the forearm, with half roll on the existing elbow-volume
support; it is composed after elbow flex. The hand itself does not roll locally,
so its hand/forearm-weighted grip surface follows rigid hand-attached equipment.
The source checks that tracking numerically, but cannot establish handle clearance
or credible anatomy. Owned muted NLA tracks associate inspection clips with this
rig without exporting unrelated Blender actions.
The [anatomy slice](../../../../../specs/battle-model-quality/slices/08-anatomy.md)
owns current acceptance evidence and unresolved art work.
