"""Restrained breathing/settling on an existing equipped heavy source.

Run Blender with --background SOURCE.blend --python this-file -- --output DIR.
Only idle/ready actions change; the donor mesh, rig and travel stay intact.
"""
import argparse
import importlib.util
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent


def curves(action):
    return [curve for layer in action.layers for strip in layer.strips
            for bag in strip.channelbags for curve in bag.fcurves]


def author(arm, scene):
    for name, strength in (("idle", 1.0), ("ready", .65)):
        action = bpy.data.actions[name]
        arm.animation_data.action = action
        arm.animation_data.action_slot = action.slots[0]
        scene.frame_set(0)
        base = {bone.name: bone.rotation_euler.copy() for bone in arm.pose.bones}
        # Two breaths over a six-second settling cycle. Rotation stays above
        # the pelvis: the original support stance and world root remain exact.
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
