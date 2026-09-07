"""Original equipped-heavy ready/walk keyframes; no runtime IK or sim changes."""
import argparse
import hashlib
import importlib.util
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
OUTPUT = HERE.parent / "assets/source/heavy-motion"
spec = importlib.util.spec_from_file_location("anatomy", HERE / "blender-human-anatomy.py")
anatomy = importlib.util.module_from_spec(spec)
sys.dont_write_bytecode = True
spec.loader.exec_module(anatomy)


def orient(arm, name, rotation):
    bone = arm.pose.bones[name]
    base = bone.bone.matrix_local
    if bone.parent:
        base = bone.parent.matrix @ bone.parent.bone.matrix_local.inverted() @ base
    bone.rotation_euler = (base.to_quaternion().inverted() @ rotation).to_euler("XYZ")
    bpy.context.view_layer.update()


def aim(arm, name, direction, roll=0):
    rest = arm.data.bones[name].matrix_local
    rotation = rest.to_3x3().col[1].rotation_difference(Vector(direction).normalized()) @ rest.to_quaternion()
    rotation = rotation @ Matrix.Rotation(roll, 3, "Y").to_quaternion()
    orient(arm, name, rotation)


def cycle_value(keys, phase):
    for (start, a), (end, b) in zip(keys, keys[1:]):
        if start <= phase <= end:
            u = (phase-start)/(end-start)
            return a+(b-a)*u*u*(3-2*u)
    raise ValueError("Cycle phase outside authored keys")


def author_motion(arm, scene):
    """Key a slow loaded stride on the fixed rig; retain all inspection actions."""
    active = arm.animation_data.action
    if active and not any(track.strips[0].action == active for track in arm.animation_data.nla_tracks):
        track = arm.animation_data.nla_tracks.new()
        track.name, track.mute = active.name, True
        strip = track.strips.new(active.name, 0, active)
        strip.action_slot = active.slots[0]
    for track in list(arm.animation_data.nla_tracks):
        action = track.strips[0].action
        if action.get("author") == "heavy-motion":
            arm.animation_data.nla_tracks.remove(track)
            if arm.animation_data.action == action:
                arm.animation_data.action = None
            bpy.data.actions.remove(action)
    if any(name in bpy.data.actions for name in ("ready", "walk")):
        raise RuntimeError("Unrelated ready/walk action exists; use an isolated source scene")
    soles = {side: next(o for o in scene.objects if o.name == "Sandal sole."+side)
             for side in ("L", "R")}
    for clip, walking in (("ready", False), ("walk", True)):
        arm.animation_data.action = None
        cycle_frames = 30 if walking else 36
        for frame in range(cycle_frames+1):
            phase = frame / cycle_frames
            for bone in arm.pose.bones:
                bone.rotation_mode = "XYZ"
                bone.rotation_euler = (0, 0, 0)
                bone.location = (0, 0, 0)
            sway = math.sin(math.tau*phase) if walking else 0
            arm.pose.bones["spine"].rotation_euler.x = .035
            arm.pose.bones["chest"].rotation_euler.y = .025*sway
            bpy.context.view_layer.update()
            for side, sign in (("R", -1), ("L", 1)):
                step = (phase + (0 if side == "R" else .5)) % 1
                swing = max(0, (step-.5)*2)
                knee = cycle_value(((0,.10),(.08,.27),(.25,.10),(.35,.10),
                                    (.50,.67),(.65,.95),(.80,.65),(1,.10)), step) if walking else .10
                roll = cycle_value(((0,-.25),(.10,0),(.35,0),(.50,.30),
                                    (.65,-.15),(.85,-.15),(1,-.25)), step) if walking else 0
                # 0.765m steps at 120 steps/min match the current heavy march
                # target: 1.7m/s base pace × 0.9 class multiplier = 1.53m/s.
                stride = (-.3825+1.53*step if step < .5 else .3825*math.cos(math.pi*swing)) if walking else 0
                heel = max(soles[side].data.vertices, key=lambda v:v.co.y).co
                toe = min(soles[side].data.vertices, key=lambda v:v.co.y).co
                pivot = toe.lerp(heel, .5+.5*math.cos(math.tau*step))-arm.data.bones["foot."+side].head_local
                stride -= (Matrix.Rotation(roll,3,"X")@pivot-pivot).y
                # Offline joint authoring: chosen knee lift plus a linear support
                # interval. No target solver or planted-foot state enters runtime.
                upper, lower = arm.data.bones["thigh."+side].length, arm.data.bones["shin."+side].length
                reach = math.hypot(upper+lower*math.cos(knee), lower*math.sin(knee))
                thigh = math.asin(stride/reach)-math.atan2(lower*math.sin(knee), upper+lower*math.cos(knee))
                arm.pose.bones["thigh."+side].rotation_euler.x = thigh
                arm.pose.bones["shin."+side].rotation_euler.x = knee
                arm.pose.bones["knee-volume."+side].rotation_euler.x = knee/2
                bpy.context.view_layer.update()
                foot = arm.data.bones["foot."+side].matrix_local.to_quaternion()
                foot = Matrix.Rotation(roll, 3, "X").to_quaternion() @ foot
                orient(arm, "foot."+side, foot)
                aim(arm, "upper-arm."+side, (sign*(.12 if side == "R" else .42), -.10, -1))
                aim(arm, "forearm."+side,
                    (sign*.15, -.72+.04*sway if side == "R" else -.30, -.65 if side == "R" else -.95),
                    math.pi/2 if side == "R" else 0)
                helper = arm.pose.bones["elbow-volume."+side]
                base = helper.parent.matrix @ helper.parent.bone.matrix_local.inverted() @ helper.bone.matrix_local
                orient(arm, helper.name, base.to_quaternion().slerp(arm.pose.bones["forearm."+side].matrix.to_quaternion(), .5))
            # Author pelvis height from the rigid supporting sole, not a runtime IK
            # controller. Root horizontal translation remains exactly zero.
            support = "R" if not walking or phase % 1 < .5 else "L"
            foot = arm.pose.bones["foot."+support]
            transform = foot.matrix @ foot.bone.matrix_local.inverted()
            lowest = min((transform @ v.co).z for v in soles[support].data.vertices)
            pelvis = arm.pose.bones["pelvis"]
            pelvis.location = pelvis.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, -lowest))
            bpy.context.view_layer.update()
            for side in ("L", "R"):
                foot = arm.pose.bones["foot."+side]
                transform = foot.matrix @ foot.bone.matrix_local.inverted()
                sole_height = min((transform @ v.co).z for v in soles[side].data.vertices)
                if sole_height < -.0001 or (side == support and abs(sole_height) > .0001):
                    raise RuntimeError(f"{clip} frame {frame}: {side} sole floor error {sole_height}m")
            for bone in arm.pose.bones:
                bone.keyframe_insert("rotation_euler", frame=frame)
                bone.keyframe_insert("location", frame=frame)
        action = arm.animation_data.action
        action.name, action["author"] = clip, "heavy-motion"
        track = arm.animation_data.nla_tracks.new()
        track.name, track.mute = clip, True
        strip = track.strips.new(clip, 0, action)
        strip.action_slot = action.slots[0]
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = "LINEAR"
    arm.animation_data.action = bpy.data.actions["ready"]
    arm.animation_data.action_slot = arm.animation_data.action.slots[0]
    scene.frame_set(0)


def build(source):
    with bpy.data.libraries.load(str(source)) as (data, target):
        target.scenes = [next(n for n in data.scenes if n in ("HeavyKitCandidate", "HeavyMotionCandidate"))]
    scene = target.scenes[0]
    scene.name = "HeavyMotionCandidate"
    bpy.context.window.scene = scene
    if "motion_geometry_source_sha256" not in scene:
        scene["motion_geometry_source_sha256"] = hashlib.sha256(source.read_bytes()).hexdigest()
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    body = next(o for o in scene.objects if o.name == "HeavyKit-Deform")
    owned = {track.strips[0].action.name for track in arm.animation_data.nla_tracks}
    if arm.animation_data.action:
        owned.add(arm.animation_data.action.name)
    if not {name for name, _, _ in anatomy.INSPECTION_CLIPS} <= owned:
        raise RuntimeError("Freeze a fitted source with the shared rig's inspection clips before authoring motion")
    author_motion(arm, scene)
    anatomy.export_candidate(body, arm, OUTPUT, "heavy-motion")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=OUTPUT/"heavy-motion.blend")
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    build(args.source)
