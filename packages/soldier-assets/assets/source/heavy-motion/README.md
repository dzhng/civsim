# Equipped motion inspection source

The saved Blender scene freezes a fitted heavy's geometry and carries locally
authored ready/walk actions. Its geometry-source hash identifies the actual
comparison input; it is not a production catalog entry. Refit new geometry before
claiming these clips work with it.

[Motion authoring](../../../bake/blender-heavy-motion.py) now defaults to the
combined heavy-kit source, whose fitted hand and equipment orientation supports
the current carry recipe. This directory is a frozen older motion study; do not
substitute it for that combined source. The recipe preserves shared inspection actions and bind
geometry. Foot support is authored into joint keys and pelvis height offline;
no foot solver, horizontal root displacement or combat authority enters runtime.
The same production exporter, loader and skinning path consume the result.

Reauthoring and re-exporting are different operations. The authoring script uses
its current recipe and replaces the saved motion actions; it is not a neutral
format conversion. To change only export coordinates, load the saved scene and
use the shared anatomy exporter directly, preserving those actions. Otherwise a
frozen comparison silently takes newer gait keys while retaining old geometry.

The first ready pose is deliberately planted and static. Walk encodes the current
heavy march speed through stride length and cadence, but has not been accepted
for production. Ground checks do not establish natural joint shape, weapon contact
or actual-speed visual quality; the [motion evidence](../../../../../specs/battle-model-quality/assets/evidence/11/heavy-walk/review.md)
owns those limits.
