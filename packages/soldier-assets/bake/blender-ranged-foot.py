"""Original foot ranged/crew equipment and release motion on the fitted rig."""
import argparse
import importlib.util
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


foot = module("foot", "blender-foot-variant.py")
motion = module("motion", "blender-heavy-motion.py")


def finish_equipment(scene, arm, parts, obj, material, joint, smooth=True):
    obj.data.materials.append(bpy.data.materials["heavy-" + material])
    obj.vertex_groups.new(name=joint).add(list(range(len(obj.data.vertices))), 1, "REPLACE")
    obj.parent = arm
    obj.modifiers.new("Fitted rig attachment", "ARMATURE").object = arm
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    tile = list(foot.surfaces.SURFACES).index(material)
    for loop in obj.data.uv_layers.active.data:
        loop.uv.x = (tile % 4 + loop.uv.x) / 4
        loop.uv.y = (tile // 4 + loop.uv.y) / 2
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth
    parts.append(obj)
    return obj


def add_artillery_equipment(scene, arm, parts):
    """Rigid root-mounted carriage in the existing native right/forward envelope.

    Coordinates below are native engine XYZ; the saved authoring scene faces
    -Y and the shared exporter rotates the complete assembly by pi. No weapon
    mechanism is animated, and the crew's authored channels remain untouched.
    """
    if any(part.name.startswith("Artillery ") for part in parts):
        raise ValueError("Artillery equipment already exists")
    arm.data.bones["root"].use_deform = True

    def finish(obj, label, material="wood"):
        obj.name = "Artillery " + label
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        modifier = obj.modifiers.new("Rigid equipment triangles", "TRIANGULATE")
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        return finish_equipment(scene, arm, parts, obj, material, "root", smooth=False)

    def beam(label, start, end, width, depth=None, material="wood"):
        a, b = (Vector((-p[0], -p[1], p[2])) for p in (start, end))
        bpy.ops.mesh.primitive_cube_add(size=1, location=(a+b)/2)
        obj = bpy.context.object
        obj.rotation_euler = (b-a).to_track_quat("Z", "Y").to_euler()
        obj.scale = (width, depth or width, (b-a).length)
        return finish(obj, label, material)

    # Two long rails, crossmembers and connected wheel axles keep an open,
    # readable wooden carriage rather than reproducing the old solid blocks.
    for x in (.18, .98):
        beam(f"chassis rail {x}", (x, -.18, .42), (x, .64, .42), .13)
    for y in (-.12, .26, .58):
        beam(f"crossmember {y}", (.12, y, .50), (1.04, y, .50), .12)
    for y in (0, .50):
        beam(f"axle {y}", (.02, y, .26), (1.14, y, .26), .085, material="iron")
        for x in (.04, 1.12):
            # Eight-sided wheels remain below the shared simple-island floor;
            # runtime reduction must not push their grounded rims below soil.
            bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=.26, depth=.12,
                location=(-x, -y, .26), rotation=(0, math.pi/2, 0))
            finish(bpy.context.object, f"wheel {x} {y}")
    for x in (.24, .92):
        beam(f"upright {x}", (x, .28, .48), (x, .28, .86), .11)
        beam(f"diagonal brace {x}", (x, -.12, .48), (x, .28, .85), .085)
    beam("pivot", (.18, .28, .86), (.98, .28, .86), .10, material="iron")
    beam("throwing beam", (.58, .24, .86), (.58, 1.40, 1.06), .10)
    # Open wooden projectile cradle at the same forward tip as the legacy cup.
    for x in (.47, .69):
        beam(f"cradle side {x}", (x, 1.28, 1.08), (x, 1.50, 1.08), .055)
    beam("cradle base", (.47, 1.39, 1.025), (.69, 1.39, 1.025), .055, .22)


def crew_pose(arm, recover):
    direction = Vector((1, 0, .15)).normalized()
    right = Vector((-.18, -.36 + .12 * recover, 1.13))
    motion.grip_pose(arm, "R", right, direction)
    motion.grip_pose(arm, "L", right + direction * .30, direction)


def build(source, output, name):
    archer = name == "archers"
    crew = name == "artillery-crew"
    scene, arm, parts = foot.build(source, output, name,
        "cloth" if archer or crew else "light", "none" if archer or crew else "small",
        "bare" if archer else "cap" if crew else "bare", export=False)
    grip = Vector((.5732 if archer else -.5732, -.051, .9024))
    axis = Vector((-.8, 0, -.6) if archer else (.8, 0, -.6))
    side = "L" if archer else "R"

    def finish(obj, material="wood", joint=None):
        return finish_equipment(scene, arm, parts, obj, material, joint or "hand." + side)

    def rod(label, points, radius, material="wood", across=(0, 1, 0), depth=None):
        obj = foot.anatomy.loft(label, [(p, radius, radius) for p in points],
                                12, across, depth or axis.cross(Vector((0, 1, 0))))
        return finish(obj, material)

    if archer:
        rows = [(1.58, .10, .105), (1.69, .105, .115), (1.77, .078, .09), (1.805, .01, .015)]
        vertices = [(w * math.cos(a), .012 + d * math.sin(a), z)
                    for z, w, d in rows for a in [-.35 + (math.pi + .7) * j / 16 for j in range(17)]]
        faces = [(i * 17 + j, i * 17 + j + 1, (i + 1) * 17 + j + 1, (i + 1) * 17 + j)
                 for i in range(3) for j in range(16)]
        mesh = bpy.data.meshes.new("Open faced cloth hood")
        mesh.from_pydata(vertices, [], faces)
        hood = bpy.data.objects.new(mesh.name, mesh)
        scene.collection.objects.link(hood)
        finish(hood, "cloth", "head")
        points = [grip + axis * (.64 * math.cos(math.pi * i / 24))
                  + Vector((0, .18 * (1 - math.sin(math.pi * i / 24)), 0))
                  for i in range(25)]
        rod("Curved wooden bow", points, .018)
        string = rod("Bow string", [points[0], grip + Vector((0, .18, 0)), points[-1]], .0025, "cloth")
        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode="EDIT")
        center = arm.data.edit_bones.new("bow-string")
        center.head, center.tail = grip + Vector((0, .18, 0)), grip + Vector((0, .28, 0))
        center.parent = arm.data.edit_bones["hand.L"]
        bpy.ops.object.mode_set(mode="OBJECT")
        arm.pose.bones["bow-string"].rotation_mode = "XYZ"
        string.vertex_groups["hand.L"].remove(list(range(12, 24)))
        string.vertex_groups.new(name="bow-string").add(list(range(12, 24)), 1, "REPLACE")
        arrow = rod("Nocked arrow", [grip + Vector((0, .4, 0)), grip + Vector((0, -.38, 0))],
                    .0035, "wood", (1, 0, 0), (0, 0, 1))
        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode="EDIT")
        held = arm.data.edit_bones.new("held-arrow")
        held.head, held.tail = grip, grip + Vector((0, .1, 0))
        held.parent = arm.data.edit_bones["hand.L"]
        bpy.ops.object.mode_set(mode="OBJECT")
        arm.pose.bones["held-arrow"].rotation_mode = "XYZ"
        arrow.vertex_groups.clear()
        arrow.vertex_groups.new(name="held-arrow").add(list(range(len(arrow.data.vertices))), 1, "REPLACE")
        for track in arm.animation_data.nla_tracks:
            track.mute = True
        ready = bpy.data.actions["ready"]
        arm.animation_data.action, arm.animation_data.action_slot = ready, ready.slots[0]
        for frame in range(181):
            scene.frame_set(frame)
            motion.grip_pose(arm, "L", (.1, -.48, 1.42), (0, 0, 1))
            motion.grip_pose(arm, "R", (.1, -.08, 1.42), (0, 0, 1))
            arm.pose.bones["bow-string"].location.y = .22
            for bone in arm.pose.bones:
                if bone.name.startswith(("upper-arm", "forearm", "hand", "elbow-volume")):
                    bone.keyframe_insert("rotation_euler", frame=frame)
            arm.pose.bones["bow-string"].keyframe_insert("location", frame=frame)
    else:
        length = .8 if crew else 1.25
        shaft = rod("Crew rammer" if crew else "Javelin shaft",
            [grip - axis * .65, grip + axis * length], .022 if crew else .012)
        if not crew:
            tip = rod("Javelin head", [grip + axis * length, grip + axis * (length + .16)], .022, "iron")
            bpy.ops.object.select_all(action="DESELECT")
            arm.select_set(True)
            bpy.context.view_layer.objects.active = arm
            bpy.ops.object.mode_set(mode="EDIT")
            held = arm.data.edit_bones.new("held-projectile")
            held.head, held.tail = grip, grip + axis * .1
            held.parent = arm.data.edit_bones["hand.R"]
            bpy.ops.object.mode_set(mode="OBJECT")
            arm.pose.bones["held-projectile"].rotation_mode = "XYZ"
            for obj in (shaft, tip):
                obj.vertex_groups.clear()
                obj.vertex_groups.new(name="held-projectile").add(
                    list(range(len(obj.data.vertices))), 1, "REPLACE")

    if crew:
        for track in arm.animation_data.nla_tracks:
            track.mute = True
        ready = bpy.data.actions["ready"]
        arm.animation_data.action, arm.animation_data.action_slot = ready, ready.slots[0]
        for frame in range(181):
            scene.frame_set(frame)
            crew_pose(arm, 0)
            for bone in arm.pose.bones:
                if bone.name.startswith(("upper-arm", "forearm", "hand", "elbow-volume")):
                    bone.keyframe_insert("rotation_euler", frame=frame)

    # Release is an observed event, not permission to invent an advance firing
    # clock. Its entry is the release-compatible pose; recovery follows it.
    clip = "bow-release" if archer else "crew-release" if crew else "throw-release"
    controls, base, _, _ = motion.begin_ready_action(arm, scene, clip, "ranged-foot")
    for frame in range(25):
        phase = frame / 24
        recover = min(1, phase / .65)
        recover = recover * recover * (3 - 2 * recover)
        for bone in arm.pose.bones:
            bone.rotation_euler, bone.location = base[bone.name]
        bpy.context.view_layer.update()
        if archer:
            arm.pose.bones["bow-string"].location.y = 0
            arm.pose.bones["held-arrow"].scale = (.0001, .0001, .0001)
            arm.pose.bones["held-arrow"].keyframe_insert("scale", frame=frame)
            motion.grip_pose(arm, "L", (.1, -.48, 1.42 - .18 * recover), (0, 0, 1))
            motion.grip_pose(arm, "R", (.1 - .30 * recover, -.08 + .05 * recover,
                                   1.42 - .25 * recover), (0, 0, 1))
        elif crew:
            crew_pose(arm, recover)
        else:
            motion.aim(arm, "upper-arm.R", (-.2, -1, .45 - 1.1 * recover))
            motion.aim(arm, "forearm.R", (.1, -1, .12 - .75 * recover))
            # The engine owns the flying projectile. Its handheld copy vanishes
            # at release and returns only when the soldier has recovered.
            size = max(.0001, 0 if frame < 20 else (frame - 20) / 4)
            arm.pose.bones["held-projectile"].scale = (size, size, size)
            arm.pose.bones["held-projectile"].keyframe_insert("scale", frame=frame)
        for bone in arm.pose.bones:
            bone.keyframe_insert("rotation_euler", frame=frame)
            bone.keyframe_insert("location", frame=frame)
    motion.finish_ready_action(arm, clip, "ranged-foot", None, controls)
    if archer:
        for track in arm.animation_data.nla_tracks:
            action = track.strips[0].action
            arm.animation_data.action, arm.animation_data.action_slot = action, action.slots[0]
            size = 1 if action.name == "ready" else .0001
            for frame in action.frame_range:
                arm.pose.bones["held-arrow"].scale = (size, size, size)
                arm.pose.bones["held-arrow"].keyframe_insert("scale", frame=frame)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    foot.author_held_equipment(scene, arm,
        [part for part in parts if part.name.startswith("Sword")],
        {"sword-effort"}, bone_name="held-sword")
    if crew:
        clips = {track.strips[0].action.name for track in arm.animation_data.nla_tracks}
        foot.author_held_equipment(scene, arm, [shaft], clips - {"sword-effort"}, bone_name="held-tool")
    elif not archer:
        action = bpy.data.actions["sword-effort"]
        arm.animation_data.action, arm.animation_data.action_slot = action, action.slots[0]
        for frame in action.frame_range:
            arm.pose.bones["held-projectile"].scale = (.0001, .0001, .0001)
            arm.pose.bones["held-projectile"].keyframe_insert("scale", frame=frame)
    if crew:
        add_artillery_equipment(scene, arm, parts)
    foot.export_parts(scene, arm, parts, output, name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--name", choices=["archers", "skirmishers", "artillery-crew"], required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    build(args.source, args.output, args.name)
