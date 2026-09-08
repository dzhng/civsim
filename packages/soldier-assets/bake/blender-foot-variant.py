"""Compose an editable foot soldier from the saved fitted kit and its actions.

Equipment choices come from the caller's canonical appearance description.
Run in isolated background Blender; never rebuild the shared anatomy here.
"""
import argparse
import importlib.util
import math
import sys
from pathlib import Path

import bpy
import bmesh

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("anatomy", HERE / "blender-human-anatomy.py")
anatomy = importlib.util.module_from_spec(spec)
sys.dont_write_bytecode = True
spec.loader.exec_module(anatomy)
spec = importlib.util.spec_from_file_location("surfaces", HERE / "blender-heavy-surfaces.py")
surfaces = importlib.util.module_from_spec(spec)
spec.loader.exec_module(surfaces)


def rematerial(obj, name):
    # The saved kit shares one texture atlas: identity requires its UV tile as
    # well as its material slot. A slot-only swap still samples the old surface.
    names = list(surfaces.SURFACES)
    old = names.index(obj.data.materials[0].name.removeprefix("heavy-"))
    new = names.index(name)
    for loop in obj.data.uv_layers.active.data:
        loop.uv.x += (new % 4 - old % 4) / 4
        loop.uv.y += (new // 4 - old // 4) / 2
    obj.data.materials.clear()
    obj.data.materials.append(bpy.data.materials["heavy-" + name])


def build(source, output, name, armor, shield, helmet):
    with bpy.data.libraries.load(str(source)) as (data, target):
        target.scenes = [next(n for n in data.scenes if n == "HeavyMotionCandidate")]
    scene = target.scenes[0]
    bpy.context.window.scene = scene
    scene.name = f"FootVariant-{name}"
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    parts = [o for o in scene.objects if o.type == "MESH"
             and o.name not in {"HumanAnatomy-Sculpt", "HeavyKit-Deform"}]
    # Remove only the redundant combined export, retaining the editable pieces.
    bpy.data.objects.remove(scene.objects["HeavyKit-Deform"], do_unlink=True)
    for part in parts[:]:
        omit = ((armor not in {"heavy", "medium"} and part.name == "Mail shirt")
                or (helmet == "bare" and part.name.startswith("Helmet"))
                or (helmet == "cap" and part.name.startswith("Helmet cheek"))
                or (shield == "none" and (part.name.startswith("Shield")
                                          or part.name == "Convex oval shield")))
        if omit:
            parts.remove(part)
            bpy.data.objects.remove(part, do_unlink=True)
    if armor == "light":
        # The existing fitted cloth shell supplies the leather garment silhouette
        # without changing body support weights or inventing another skin surface.
        tunic = scene.objects["Tunic"]
        rematerial(tunic, "leather")
    if armor == "medium":
        cuirass = scene.objects["Mail shirt"]
        cuirass.name = "Leather shoulder cuirass"
        rematerial(cuirass, "leather")
    if armor == "rag":
        cloth = bpy.data.materials["heavy-cloth"].copy()
        cloth.name = f"{name}-undyed-cloth"
        for node in cloth.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                for link in list(node.inputs["Base Color"].links):
                    cloth.node_tree.links.remove(link)
                node.inputs["Base Color"].default_value = (.24, .18, .11, 1)
        scene.objects["Tunic"].data.materials[0] = cloth
    if helmet == "cap":
        bowl = scene.objects["Helmet bowl and rolled edge"]
        rematerial(bowl, "leather")
    if shield == "round":
        board = scene.objects["Convex oval shield"]
        # The fitted shield is rolled in bind space. Shorten its actual long
        # axis, not world Z, preserving the rigid hand attachment and convexity.
        ring = list(board.data.vertices)[:64]
        cx = sum(v.co.x for v in ring) / len(ring)
        cz = sum(v.co.z for v in ring) / len(ring)
        xx = sum((v.co.x-cx)**2 for v in ring)
        zz = sum((v.co.z-cz)**2 for v in ring)
        xz = sum((v.co.x-cx)*(v.co.z-cz) for v in ring)
        angle = .5 * math.atan2(2*xz, xx-zz)
        ax, az = math.cos(angle), math.sin(angle)
        delta = math.sqrt((xx-zz)**2 + 4*xz*xz)
        ratio = math.sqrt((xx+zz-delta)/(xx+zz+delta))
        for vertex in board.data.vertices:
            along = (vertex.co.x-cx)*ax + (vertex.co.z-cz)*az
            vertex.co.x += along*(ratio-1)*ax
            vertex.co.z += along*(ratio-1)*az
    bpy.ops.object.select_all(action="DESELECT")
    copies = []
    for part in parts:
        copy = part.copy()
        copy.data = part.data.copy()
        scene.collection.objects.link(copy)
        copy.hide_set(False)
        copy.hide_render = False
        copy.select_set(True)
        copies.append(copy)
        part.hide_set(True)
        part.hide_render = True
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    body = copies[0]
    body.name = f"{name}-Deform"
    mesh = bmesh.new()
    mesh.from_mesh(body.data)
    bmesh.ops.triangulate(mesh, faces=list(mesh.faces))
    mesh.to_mesh(body.data)
    mesh.free()
    scene["equipment_source"] = str(source)
    scene["appearance_name"] = name
    anatomy.export_candidate(body, arm, output, name)
    print({"appearance": name, "parts": len(parts), "vertices": len(body.data.vertices),
           "actions": [track.name for track in arm.animation_data.nla_tracks]})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--name", required=True)
    parser.add_argument("--armor", choices=["heavy", "medium", "light", "cloth", "rag"], required=True)
    parser.add_argument("--shield", choices=["tall", "round", "none"], required=True)
    parser.add_argument("--helmet", choices=["bronze", "cap", "bare"], required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    build(args.source, args.output, args.name, args.armor, args.shield, args.helmet)
