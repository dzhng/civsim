"""Native source controls: retained fitted rider, not regenerated anatomy."""
import argparse
import struct
import sys

import bpy


def f32(value):
    return struct.unpack("f", struct.pack("f", value))[0]


def records(path):
    bpy.ops.wm.open_mainfile(filepath=path)
    scene = bpy.context.scene
    arm = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    bones = {bone.name: (tuple(bone.head_local), tuple(bone.tail_local),
                        bone.parent.name if bone.parent else None)
             for bone in arm.data.bones}
    meshes = {}
    for obj in scene.objects:
        if obj.type != "MESH" or obj.name == "HumanAnatomy-Sculpt":
            continue
        if obj.name.endswith("-Deform") and obj.name != "HumanAnatomy-Deform":
            continue
        meshes[obj.name] = {
            "positions": [tuple(vertex.co) for vertex in obj.data.vertices],
            "faces": [tuple(polygon.vertices) for polygon in obj.data.polygons],
            "weights": [sorted((obj.vertex_groups[group.group].name, group.weight)
                               for group in vertex.groups) for vertex in obj.data.vertices],
            "materials": [material.name for material in obj.data.materials],
            "uv": [tuple(loop.uv) for loop in obj.data.uv_layers.active.data]
                  if obj.data.uv_layers.active else [],
        }
    return bones, meshes


args = argparse.ArgumentParser()
args.add_argument("--donor", required=True)
args.add_argument("--candidate", required=True)
args.add_argument("--weapon", choices=["lance", "sword", "bow"], required=True)
options = args.parse_args(sys.argv[sys.argv.index("--")+1:])
old_bones, old_meshes = records(options.donor)
new_bones, new_meshes = records(options.candidate)
for name, (head, tail, parent) in old_bones.items():
    expected = tuple(tuple(f32(v+f32(.68)) if i == 2 else v for i, v in enumerate(point))
                     for point in (head, tail))
    assert new_bones[name][:2] == expected, (name, "fitted rest rig changed", new_bones[name][:2], expected)
    assert new_bones[name][2] == ("mount-body" if name == "root" else parent), name
checked = 0
for name, old in old_meshes.items():
    if options.weapon == "lance" and name.startswith("Sword"):
        assert name not in new_meshes, "lance assembly retains a second held blade"
        continue
    new = new_meshes[name]
    expected = [tuple(f32(v+f32(.68)) if i == 2 else v for i, v in enumerate(point))
                for point in old["positions"]]
    assert new["positions"] == expected, (name, "fitted positions changed")
    for field in ("faces", "materials", "uv"):
        assert new[field] == old[field], (name, field)
    if options.weapon == "bow" and name.startswith("Sword"):
        assert all(weights == [("held-sword", 1)] for weights in new["weights"]), name
    else:
        assert new["weights"] == old["weights"], (name, "fitted support weights changed")
    checked += 1
print(f"Exact translated fitted source: {len(old_bones)} bones, {checked} mesh components; explicit weapon exception only")
