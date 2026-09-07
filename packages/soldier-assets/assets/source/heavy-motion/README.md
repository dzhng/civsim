# Equipped motion inspection source

The saved Blender scene freezes a fitted heavy's geometry and carries locally
authored ready/walk actions. Its geometry-source hash identifies the actual
comparison input; it is not a production catalog entry. Refit new geometry before
claiming these clips work with it.

[Motion authoring](../../../bake/blender-heavy-motion.py) regenerates only owned
motion actions on this scene. It preserves shared inspection actions and bind
geometry. Foot support is authored into joint keys and pelvis height offline;
no foot solver, horizontal root displacement or combat authority enters runtime.
The same production exporter, loader and skinning path consume the result.

The first ready pose is deliberately planted and static. Walk encodes the current
heavy march speed through stride length and cadence, but has not been accepted
for production. Ground checks do not establish natural joint shape, weapon contact
or actual-speed visual quality; the [motion evidence](../../../../../specs/battle-model-quality/assets/evidence/11/heavy-walk/review.md)
owns those limits.
