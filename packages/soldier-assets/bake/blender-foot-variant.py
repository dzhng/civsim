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


def add_helmet_crest(scene, arm):
    """Rigid sagittal horsehair crest for the fitted human helmet."""
    helmet = scene.objects["Helmet bowl and rolled edge"]
    front, rear = (fn(v.co.y for v in helmet.data.vertices) for fn in (min, max))
    top = max(v.co.z for v in helmet.data.vertices)
    center, radius = (front + rear) / 2, (rear - front) * .45
    samples = (-1, -.6, 0, .6, 1)
    bottom = [(center + radius * t, top - .085 * t*t) for t in samples]
    profile = [(y, z + .10 * (1 - .35 * abs(t))) for (y, z), t in zip(bottom, samples)]
    profile += list(reversed(bottom))
    vertices = [(x, y, z) for x in (-.016, .016) for y, z in profile]
    count = len(profile)
    faces = [tuple(reversed(range(count))), tuple(range(count, 2 * count))]
    faces += [(i, (i+1) % count, (i+1) % count + count, i+count) for i in range(count)]
    mesh = bpy.data.meshes.new("Fitted horsehair crest")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    part = bpy.data.objects.new("Helmet horsehair crest", mesh)
    scene.collection.objects.link(part)
    group = part.vertex_groups.new(name="head")
    group.add(list(range(len(vertices))), 1, "REPLACE")
    modifier = part.modifiers.new("Fitted rig", "ARMATURE")
    modifier.object = arm
    material = bpy.data.materials.new("Crest dyed horsehair")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (.20, .035, .018, 1)
    shader.inputs["Roughness"].default_value = .85
    part.data.materials.append(material)
    return part


def author_held_equipment(scene, arm, parts, active_clips, *, bone_name, parent_name="hand.R"):
    """Show fitted handheld equipment only in the existing named action roles.

    The child is part of the rider/upper mask, not a gameplay equipment state.
    Tiny nonzero scale avoids singular skin transforms outside the held action;
    the fitted belt scabbard remains unchanged in every action.
    """
    if not parts:
        raise ValueError("Retain fitted parts before authoring held visibility")
    actions = [track.strips[0].action for track in arm.animation_data.nla_tracks]
    if not set(active_clips).issubset({action.name for action in actions}):
        raise ValueError("Held equipment active clips must already exist")
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    parent = arm.data.edit_bones[parent_name]
    bone = arm.data.edit_bones.new(bone_name)
    bone.head, bone.tail, bone.parent = parent.head, parent.tail, parent
    bpy.ops.object.mode_set(mode="OBJECT")
    for part in parts:
        for group in list(part.vertex_groups):
            part.vertex_groups.remove(group)
        part.vertex_groups.new(name=bone_name).add(
            list(range(len(part.data.vertices))), 1, "REPLACE")
    active, frame = arm.animation_data.action, scene.frame_current
    for action in actions:
        arm.animation_data.action = action
        arm.animation_data.action_slot = action.slots[0]
        scale = 1 if action.name in active_clips else .001
        pose = arm.pose.bones[bone_name]
        pose.scale = (scale,)*3
        for endpoint in action.frame_range:
            pose.keyframe_insert("scale", frame=endpoint)
    arm.animation_data.action = active
    if active:
        arm.animation_data.action_slot = active.slots[0]
    scene.frame_set(frame)
    return bone_name


def build(source, output, name, armor, shield, helmet, export=True):
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
    if shield in {"round", "small"}:
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
        if shield == "small":
            for part in (board, scene.objects["Shield boss"]):
                for vertex in part.data.vertices:
                    vertex.co.x = .5732 + (vertex.co.x - .5732) * .65
                    vertex.co.z = .9024 + (vertex.co.z - .9024) * .65
    scene["equipment_source"] = str(source)
    scene["appearance_name"] = name
    if export:
        export_parts(scene, arm, parts, output, name)
    return scene, arm, parts


def export_parts(scene, arm, parts, output, name, body_name=None):
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
    body.name = body_name or f"{name}-Deform"
    mesh = bmesh.new()
    mesh.from_mesh(body.data)
    bmesh.ops.triangulate(mesh, faces=list(mesh.faces))
    mesh.to_mesh(body.data)
    mesh.free()
    anatomy.export_candidate(body, arm, output, name)
    print({"appearance": name, "parts": len(parts), "vertices": len(body.data.vertices),
           "actions": [track.name for track in arm.animation_data.nla_tracks]})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--name", required=True)
    parser.add_argument("--armor", choices=["heavy", "medium", "light", "cloth", "rag"], required=True)
    parser.add_argument("--shield", choices=["tall", "round", "small", "none"], required=True)
    parser.add_argument("--helmet", choices=["bronze", "cap", "bare"], required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    build(args.source, args.output, args.name, args.armor, args.shield, args.helmet)
