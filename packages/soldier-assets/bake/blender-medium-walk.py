"""Upright-pike at-ease march on the frozen fitted medium assembly.

Run in Blender on SOURCE.blend, then -- --output DIRECTORY. Only walk changes;
the forward pike-carry, inherited ready/run and inspection actions stay intact.
"""
import argparse
import importlib.util
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("motion", HERE / "blender-heavy-motion.py")
motion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(motion)


def upright_carry(arm):
    arm.animation_data.action = bpy.data.actions["pike-carry"]
    arm.animation_data.action_slot = arm.animation_data.action.slots[0]
    bpy.context.scene.frame_set(0)
    original_forearm = arm.pose.bones["forearm.L"].matrix.copy()
    old_axis = original_forearm.to_3x3().col[1].normalized()
    old_normal = Vector((0, -1, 0))
    old_normal = (old_normal - old_axis * old_normal.dot(old_axis)).normalized()
    torso_turn = Matrix.Rotation(math.radians(25), 3, "Z")
    motion.orient(arm, "chest", torso_turn.to_quaternion() @ arm.data.bones["chest"].matrix_local.to_quaternion())
    motion.orient(arm, "neck", arm.data.bones["neck"].matrix_local.to_quaternion())
    motion.orient(arm, "head", arm.data.bones["head"].matrix_local.to_quaternion())
    shaft = Vector((0, -.15, 1)).normalized()
    right_grip = Vector((.24, -.08, 1.46))
    # The left hand purchases below the right for ordinary upright travel.
    # Raising both old forward-carry grips would lift the shield beside the head.
    grips = {"R": right_grip, "L": right_grip - shaft * .34}
    for side, sign in (("R", -1), ("L", 1)):
        rest_grip = Vector((sign * .5732, -.051, .9024))
        rest_along, rest_across = Vector((sign * .6, 0, -.8)), Vector((sign * .8, 0, .6))
        source = Matrix((rest_across, rest_along, rest_across.cross(rest_along))).transposed()
        along, across = Vector((-sign, -.2, -.1)), shaft * -sign
        hand = arm.data.bones["hand." + side]
        shoulder = arm.pose.bones["upper-arm." + side].head.copy()
        upper, lower = (arm.data.bones[n + "." + side].length for n in ("upper-arm", "forearm"))
        for _ in range(24):
            along = (along - shaft * along.dot(shaft)).normalized()
            target = Matrix((across, along, across.cross(along))).transposed()
            rotation = target @ source.transposed()
            wrist = grips[side] - rotation @ (rest_grip - hand.head_local)
            delta = wrist - shoulder
            reach, forward = delta.length, delta.normalized()
            if not abs(upper - lower) < reach < upper + lower:
                raise ValueError(f"Unreachable upright {side} wrist")
            pole = torso_turn @ Vector((0, -1, -.2) if side == "L" else (sign, .2, -.8))
            pole = (pole - forward * pole.dot(forward)).normalized()
            distance = (upper * upper - lower * lower + reach * reach) / (2 * reach)
            elbow = shoulder + forward * distance + pole * math.sqrt(upper * upper - distance * distance)
            along = along.lerp((wrist - elbow).normalized(), .5).normalized()
        upper_rest = torso_turn @ arm.data.bones["upper-arm." + side].matrix_local.to_3x3()
        motion.orient(arm, "upper-arm." + side,
            upper_rest.col[1].rotation_difference(elbow - shoulder) @ upper_rest.to_quaternion())
        if side == "L":
            axis = (wrist - elbow).normalized()
            normal = Vector((1, 0, 0))
            normal = (normal - axis * normal.dot(axis)).normalized()
            source_frame = Matrix((old_normal, old_axis.cross(old_normal), old_axis)).transposed()
            target_frame = Matrix((normal, axis.cross(normal), axis)).transposed()
            motion.orient(arm, "forearm.L",
                (target_frame @ source_frame.transposed()).to_quaternion() @ original_forearm.to_quaternion())
        else:
            motion.aim(arm, "forearm.R", wrist - elbow)
        motion.orient(arm, "hand." + side, (rotation @ hand.matrix_local.to_3x3()).to_quaternion())
        helper = arm.pose.bones["elbow-volume." + side]
        base = helper.parent.matrix @ helper.parent.bone.matrix_local.inverted() @ helper.bone.matrix_local
        motion.orient(arm, helper.name, base.to_quaternion().slerp(arm.pose.bones["forearm." + side].matrix.to_quaternion(), .5))
    return {b.name: b.rotation_euler.copy() for b in arm.pose.bones}


def author(arm):
    carry = upright_carry(arm)
    action = bpy.data.actions["walk"]
    arm.animation_data.action = action
    arm.animation_data.action_slot = action.slots[0]
    upper = [n for n in carry if n in ("spine", "chest", "neck", "head")
             or n.startswith(("clavicle.", "upper-arm.", "forearm.", "hand.", "elbow-volume."))]
    # The donor's .9 s / 1.53 m walk follows the class-independent 1.7 m/s
    # floor. Keep its planted travel keys; pose the carried load as one assembly.
    for frame in range(28):
        bpy.context.scene.frame_set(frame)
        phase = frame / 27
        for name in upper:
            arm.pose.bones[name].rotation_euler = carry[name]
        pitch = .045 + .008 * math.sin(2 * math.tau * phase)
        for name, turn, lean in (("spine", 0, pitch), ("chest", math.radians(25), pitch),
                                 ("neck", 0, .015), ("head", 0, .015)):
            rotation = Matrix.Rotation(turn, 3, "Z") @ Matrix.Rotation(lean, 3, "X")
            motion.orient(arm, name, rotation.to_quaternion() @ arm.data.bones[name].matrix_local.to_quaternion())
        for name in upper:
            arm.pose.bones[name].keyframe_insert("rotation_euler", frame=frame)
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = "LINEAR"
    action["author"] = "medium-upright-walk"
    bpy.context.scene.frame_set(0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    author(arm)
    motion.anatomy.export_candidate(bpy.data.objects["MediumPhalanx-Deform"], arm, args.output, "medium-phalanx")
