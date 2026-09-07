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


def upright_carry(arm, original_forearm, phase):
    old_axis = original_forearm.to_3x3().col[1].normalized()
    old_normal = Vector((0, -1, 0))
    old_normal = (old_normal - old_axis * old_normal.dot(old_axis)).normalized()
    step = math.tau * phase
    lean = .045 + .012 * math.sin(2 * step)
    turn = math.radians(10) + .04 * math.sin(step)
    torso_turn = Matrix.Rotation(turn, 3, "Z") @ Matrix.Rotation(lean, 3, "X")
    for name, yaw, pitch in (("spine", 0, lean), ("chest", turn, lean),
                             ("neck", 0, .015), ("head", 0, .015)):
        rotation = Matrix.Rotation(yaw, 3, "Z") @ Matrix.Rotation(pitch, 3, "X")
        motion.orient(arm, name, rotation.to_quaternion() @ arm.data.bones[name].matrix_local.to_quaternion())
    # The held load lags the chest; connected elbow flex absorbs their relative
    # motion. A wider lateral carry gives the advancing ankle room below it.
    # A slight rearward upright rake brings the lower purchase forward, keeping
    # the left wrist aligned while the shield-bearing elbow hangs at the flank.
    shaft = Vector((.008 * math.sin(step - .5), .28 + .015 * math.sin(2 * step - .7), 1)).normalized()
    rise = arm.pose.bones["pelvis"].head.z - arm.data.bones["pelvis"].head_local.z
    right_grip = Vector((.30 + .008 * math.sin(step - .5),
                         -.23 + .006 * math.sin(2 * step - .7),
                         1.38 + .6 * rise + .012 * math.sin(2 * step - .7)))
    # Closely spaced lower purchases let the elbows hang beneath the load,
    # carrying the shield at flank without folding a forearm beside the face.
    grips = {"R": right_grip, "L": right_grip - shaft * .16}
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
            pole = torso_turn @ Vector((.25, -.7, -1) if side == "L" else (0, -.8, -1))
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


def author(arm):
    arm.animation_data.action = bpy.data.actions["pike-carry"]
    arm.animation_data.action_slot = arm.animation_data.action.slots[0]
    bpy.context.scene.frame_set(0)
    original_forearm = arm.pose.bones["forearm.L"].matrix.copy()
    carry = {b.name: b.rotation_euler.copy() for b in arm.pose.bones}
    action = bpy.data.actions["walk"]
    arm.animation_data.action = action
    arm.animation_data.action_slot = action.slots[0]
    upper = [n for n in carry if n in ("spine", "chest", "neck", "head")
             or n.startswith(("clavicle.", "upper-arm.", "forearm.", "hand.", "elbow-volume."))]
    # The donor's .9 s / 1.53 m walk follows the class-independent 1.7 m/s
    # floor. Keep its planted travel keys while the arms absorb the held load.
    previous = {}
    for frame in range(28):
        bpy.context.scene.frame_set(frame)
        phase = frame / 27
        for name in upper:
            arm.pose.bones[name].rotation_euler = carry[name]
        upright_carry(arm, original_forearm, phase)
        for name in upper:
            bone = arm.pose.bones[name]
            if name in previous:
                # Equivalent Euler branches must not spin a wrist between keys.
                bone.rotation_euler = bone.rotation_euler.to_quaternion().to_euler("XYZ", previous[name])
            previous[name] = bone.rotation_euler.copy()
            bone.keyframe_insert("rotation_euler", frame=frame)
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
