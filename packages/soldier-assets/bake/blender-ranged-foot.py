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


def grip_pose(arm, side, target, direction):
    hand = arm.data.bones["hand." + side]
    center = Vector((.5732 if side == "L" else -.5732, -.051, .9024))
    source_axis = Vector((-.8, 0, -.6) if side == "L" else (.8, 0, -.6))
    rotation = source_axis.rotation_difference(Vector(direction))
    wrist = Vector(target) - rotation @ (center - hand.head_local)
    upper, lower = (arm.pose.bones[n + "." + side] for n in ("upper-arm", "forearm"))
    origin = upper.head.copy()
    elbow = motion.limb_joint(origin, wrist, upper.bone.length, lower.bone.length,
                               Vector((1 if side == "L" else -1, .2, -.4)))
    motion.aim(arm, upper.name, elbow - origin)
    motion.aim(arm, lower.name, wrist - elbow)
    motion.orient(arm, hand.name, rotation @ hand.matrix_local.to_quaternion())
    helper = arm.pose.bones["elbow-volume." + side]
    motion.orient(arm, helper.name,
        upper.matrix.to_quaternion().slerp(lower.matrix.to_quaternion(), .5))


def crew_pose(arm, recover):
    direction = Vector((1, 0, .15)).normalized()
    right = Vector((-.18, -.36 + .12 * recover, 1.13))
    grip_pose(arm, "R", right, direction)
    grip_pose(arm, "L", right + direction * .30, direction)


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
        obj.data.materials.append(bpy.data.materials["heavy-" + material])
        obj.vertex_groups.new(name=joint or "hand." + side).add(
            list(range(len(obj.data.vertices))), 1, "REPLACE")
        obj.parent = arm
        obj.modifiers.new("Fitted hand attachment", "ARMATURE").object = arm
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
            polygon.use_smooth = True
        parts.append(obj)
        return obj

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
            grip_pose(arm, "L", (.1, -.48, 1.42), (0, 0, 1))
            grip_pose(arm, "R", (.1, -.08, 1.42), (0, 0, 1))
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
            grip_pose(arm, "L", (.1, -.48, 1.42 - .18 * recover), (0, 0, 1))
            grip_pose(arm, "R", (.1 - .30 * recover, -.08 + .05 * recover,
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
    foot.export_parts(scene, arm, parts, output, name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--name", choices=["archers", "skirmishers", "artillery-crew"], required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    build(args.source, args.output, args.name)
