"""Supported ready stance and restrained breathing on an equipped heavy source.

Run Blender with --background SOURCE.blend --python this-file -- --output DIR.
Only idle/ready actions change; the donor mesh, rig and travel stay intact.
"""
import argparse
import importlib.util
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent


def curves(action):
    return [curve for layer in action.layers for strip in layer.strips
            for bag in strip.channelbags for curve in bag.fcurves]


def ready_stance(arm):
    """Offline two-segment construction; runtime receives ordinary pose keys."""
    def orient(bone, rotation):
        base = bone.parent.matrix @ bone.parent.bone.matrix_local.inverted() @ bone.bone.matrix_local
        bone.rotation_euler = (base.to_quaternion().inverted() @ rotation).to_euler("XYZ")
        bpy.context.view_layer.update()

    pelvis = arm.pose.bones["pelvis"]
    pelvis.location = pelvis.bone.matrix_local.to_3x3().inverted() @ (Vector((0, -.005, .880)) - pelvis.bone.head_local)
    bpy.context.view_layer.update()
    for side, sign in (("L", 1), ("R", -1)):
        thigh, shin, foot = (arm.pose.bones[n + "." + side] for n in ("thigh", "shin", "foot"))
        foot_rotation = foot.bone.matrix_local.to_quaternion()
        ankle = Vector((sign * .165, -.075 if side == "L" else .070, .093))
        hip = thigh.head.copy()
        axis = (ankle - hip).normalized()
        reach = (ankle - hip).length
        upper, lower = thigh.bone.length, shin.bone.length
        along = (upper * upper - lower * lower + reach * reach) / (2 * reach)
        forward = Vector((0, -1, 0))
        pole = (forward - axis * forward.dot(axis)).normalized()
        knee = hip + axis * along + pole * math.sqrt(upper * upper - along * along)
        orient(thigh, (thigh.bone.tail_local - thigh.bone.head_local).rotation_difference(knee - hip) @ thigh.bone.matrix_local.to_quaternion())
        orient(shin, (shin.bone.tail_local - shin.bone.head_local).rotation_difference(ankle - knee) @ shin.bone.matrix_local.to_quaternion())
        orient(foot, foot_rotation)
        arm.pose.bones["knee-volume." + side].rotation_euler = tuple(v * .5 for v in shin.rotation_euler)
    # The shield-bearing trunk inclines slightly over the staggered support.
    arm.pose.bones["spine"].rotation_euler.x = .080
    arm.pose.bones["neck"].rotation_euler.x = -.025
    bpy.context.view_layer.update()
    changed = ["pelvis", "spine", "neck"] + [name + "." + side for side in ("L", "R")
        for name in ("thigh", "shin", "foot", "knee-volume")]
    for name in changed:
        bone = arm.pose.bones[name]
        for frame in range(181):
            bone.keyframe_insert("rotation_euler", frame=frame)
            bone.keyframe_insert("location", frame=frame)


def author(arm, scene):
    for name, strength in (("idle", 1.0), ("ready", .65)):
        action = bpy.data.actions[name]
        arm.animation_data.action = action
        arm.animation_data.action_slot = action.slots[0]
        scene.frame_set(0)
        if name == "ready":
            ready_stance(arm)
        base = {bone.name: bone.rotation_euler.copy() for bone in arm.pose.bones}
        # Two breaths over a six-second settling cycle. Rotation stays above
        # the pelvis: the support stance and world root stay fixed through it.
        channels = {"spine", "chest", "neck", "head"}
        for frame in range(181):
            phase = frame / 180
            breath = math.sin(2 * math.tau * phase)
            settle = math.sin(math.tau * phase)
            turn = math.sin(math.tau * phase) * math.sin(math.pi * phase)**2
            offsets = {
                "spine": (.008 * breath, .014 * settle, .004 * turn),
                "chest": (.010 * breath, -.004 * settle, -.002 * turn),
                "neck": (-.009 * breath, -.006 * settle, -.001 * turn),
                "head": (-.003 * breath, -.002 * settle, .005 * turn),
            }
            for bone_name in channels:
                bone = arm.pose.bones[bone_name]
                offset = Euler(tuple(v * strength for v in offsets[bone_name]), "XYZ")
                bone.rotation_euler = (base[bone_name] if frame in (0, 180) else
                    (base[bone_name].to_quaternion() @ offset.to_quaternion()).to_euler("XYZ", base[bone_name]))
                bone.keyframe_insert("rotation_euler", frame=frame)
        # Dense samples preserve the authored curve through the GLB exporter.
        for curve in curves(action):
            for key in curve.keyframe_points:
                key.interpolation = "LINEAR"
        action["idle_recipe"] = "supported upper-trunk breathing and settling"
        for track in arm.animation_data.nla_tracks:
            for strip in track.strips:
                if strip.action == action:
                    strip.action_frame_end = 180
                    strip.frame_end = 180
    arm.animation_data.action = bpy.data.actions["idle"]
    arm.animation_data.action_slot = arm.animation_data.action.slots[0]
    scene.frame_set(0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    author(arm, bpy.context.scene)
    spec = importlib.util.spec_from_file_location("anatomy", HERE / "blender-human-anatomy.py")
    anatomy = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(anatomy)
    anatomy.export_candidate(bpy.data.objects["HeavyKit-Deform"], arm, args.output, "heavy-motion")
