"""Saved crew preservation check; run with Blender background and two Blend paths."""
import importlib.util
import sys
from pathlib import Path

import bpy

spec = importlib.util.spec_from_file_location("ranged", Path(__file__).with_name("blender-ranged-foot.py"))
ranged = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ranged)


def snapshot(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(path)) as (data, target):
        target.scenes = ["FootVariant-artillery-crew"]
    scene = target.scenes[0]
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    parts = {}
    for obj in scene.objects:
        if obj.type != "MESH" or obj.name in {"artillery-crew-Deform", "HumanAnatomy-Sculpt"}:
            continue
        if obj.name.startswith("Artillery "):
            continue
        parts[obj.name] = {
            "matrix": [list(row) for row in obj.matrix_world],
            "vertices": [list(v.co) for v in obj.data.vertices],
            "polygons": [(list(p.vertices), p.material_index, p.use_smooth) for p in obj.data.polygons],
            "uvs": [[list(loop.uv) for loop in layer.data] for layer in obj.data.uv_layers],
            "weights": [[(obj.vertex_groups[g.group].name, g.weight) for g in v.groups]
                        for v in obj.data.vertices],
        }
    return {
        "parts": parts,
        "bones": {b.name: (b.parent.name if b.parent else None,
                            [list(row) for row in b.matrix_local]) for b in arm.data.bones},
        "actions": {track.name: ranged.motion.action_signature(track.strips[0].action)
                    for track in arm.animation_data.nla_tracks},
    }


before, after = map(Path, sys.argv[sys.argv.index("--") + 1:])
old, new = snapshot(before), snapshot(after)
assert old == new, "Saved crew parts, bone transforms/hierarchy or authored keys changed"
print({"unchangedParts": len(old["parts"]), "unchangedBones": len(old["bones"]),
       "unchangedActions": len(old["actions"]), "invariant": "exact saved source values"})
