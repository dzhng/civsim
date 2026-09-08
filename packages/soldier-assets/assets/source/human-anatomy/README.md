# Editable human anatomy candidate

This is original locally scripted Blender geometry, not a downloaded or externally
generated character. The [authoring script](../../../bake/blender-human-anatomy.py)
owns anatomical cross-sections, facial relief, the joined sculpt, provisional
reduced topology and deform rig. The editable sculpt remains in the source scene;
only the selected deform mesh and rig enter the GLB. Unrelated open Blender scenes
are excluded from both outputs.

The hidden sculpt is the joined construction surface, not a second final model.
The final head lives on the editable deform mesh after local head refinement.
Projection back to the construction surface restores contours that reduction
cannot retain. The head envelope then shapes the vault, jaw, cheek, socket,
muzzle and exposed eye surface together, leaving the existing body and hand
weight solution intact. Edit this final mesh when judging exported head form,
rather than the hidden construction input. The eye surface is continuous clay
geometry for static anatomy inspection; it adds no facial animation or separate
eye material.

Curvature-preserving reduction retains small silhouettes such as fingers; it
does not establish joint-quality. The reduced surface must remain manifold,
and bends must be inspected. Automatic heat weights are
limited and normalized to the runtime's four-influence contract; their bends
must still be judged in the production workbench. Source density is not a
performance budget.

The final hand is a local post-weight reconstruction, not the preliminary curl
used by the body's weight donor. Keeping that donor stable prevents a hand edit
from changing the whole-body heat field. The hand alone is joined, relaxed and
reduced, then grafted to the retained wrist loop by boundary arclength. Original
retained vertices and weights do not move; new vertices interpolate and normalize
the existing field. The final hand is present in both the editable sculpt and
deform mesh. Its inspection UV islands are not a texture-ready skin atlas.
Actual handle contact and natural anatomy are separate gates: a manifold,
nonpenetrating grip can still look like parallel tubes and a slab palm.

Rebuild comparisons use Blender's original default-thread invocation, without
an explicit `-t` override. The upstream body remesh/reduction and local hand
union/reduction can produce different topology with a different thread count;
an otherwise identical authoring script is not proof of identical baked data.
Keep the editable weighted donor as the preservation control and compare its
untouched positions, weights and rig against the rebuilt candidate.

The [candidate baker](../../../bake/human-anatomy.mjs) shares one untextured body
between the first pair's inspection entries. Its repeated tiers and manual-only
clips are inspection inputs, not production-ready distance or gameplay assets.
Pronation is carried by the forearm, with half roll on the existing elbow-volume
support; it is composed after elbow flex. The hand itself does not roll locally,
so its hand/forearm-weighted grip surface follows rigid hand-attached equipment.
The source checks that tracking numerically, but cannot establish handle clearance
or credible anatomy. Owned muted NLA tracks associate inspection clips with this
rig without exporting unrelated Blender actions.
The [model rationale](../../../../../specs/done/battle-model-quality/README.md)
records the delivered boundary and retained art limitations.
