"""Original equipped-heavy locomotion keys; no runtime IK or sim changes."""
import argparse
import hashlib
import importlib.util
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
OUTPUT = HERE.parent / "assets/source/heavy-kit"
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


def shield_forearm(arm, axis, normal):
    """Orient the gripped board's outward normal without changing its wrist anchor."""
    name = "forearm.L"
    axis, normal = Vector(axis).normalized(), Vector(normal)
    normal = (normal-axis*normal.dot(axis)).normalized()
    source_axis = arm.data.bones[name].matrix_local.to_3x3().col[1].normalized()
    source_normal = Vector((0, 1, 0))
    source_normal = (source_normal-source_axis*source_normal.dot(source_axis)).normalized()
    source = Matrix((source_normal, source_axis.cross(source_normal), source_axis)).transposed()
    target = Matrix((normal, axis.cross(normal), axis)).transposed()
    orient(arm, name, (target@source.transposed()).to_quaternion()@arm.data.bones[name].matrix_local.to_quaternion())


def carry_arm(arm, side, phase, traveling, running=False):
    if side == "R":
        carriage = math.cos(math.tau*phase) if traveling else 0
        upper = (-.20, -.08+.38*carriage, -1) if running else (-.12, -.10+.23*carriage, -1)
        forearm = (-.15, -.72+.15*carriage, .10) if running else (-.15, -.72+.19*carriage, -.65)
        aim(arm, "upper-arm.R", upper, -math.pi/4)
        aim(arm, "forearm.R", forearm, math.pi/2-math.pi)
    else:
        sway = math.cos(math.tau*phase) if traveling else 0
        aim(arm, "upper-arm.L", (.32, -.04+.04*sway, -1))
        shield_forearm(arm, (-.12, -.10+.06*sway, -1), (1, 0, 0))


def cycle_value(keys, phase):
    for (start, a), (end, b) in zip(keys, keys[1:]):
        if start <= phase <= end:
            u = (phase-start)/(end-start)
            return a+(b-a)*u*u*(3-2*u)
    raise ValueError("Cycle phase outside authored keys")


def loaded_body(arm, phase, running):
    """World Z is vertical: local Y, not local Z, follows these torso bones."""
    stride = math.cos(math.tau*phase)
    impact = math.sin(2*math.tau*phase)
    pitch = .27 if running else .12
    for name, lean, turn in (
        ("pelvis", .12 if running else .045, .065*stride),
        ("spine", pitch, -.075*stride),
        ("chest", pitch+.025*impact, -.12*stride),
        ("neck", pitch*.35, -.04*stride),
        ("head", .025, -.02*stride),
    ):
        rotation = (Matrix.Rotation(turn, 3, "Z") @ Matrix.Rotation(lean, 3, "X")).to_quaternion()
        orient(arm, name, rotation @ arm.data.bones[name].matrix_local.to_quaternion())


def thigh_angle(arm, side, knee, stride):
    thigh, shin, foot = (arm.data.bones[name+"."+side] for name in ("thigh", "shin", "foot"))
    # The rest chain is angled, not a pair of vertical segments. Rotate its
    # actual ankle offset so the authored support travel survives knee flexion.
    ankle = shin.matrix_local @ Matrix.Rotation(knee, 4, "X") @ shin.matrix_local.inverted() @ foot.head_local
    reach = ankle-thigh.head_local
    target = stride+foot.head_local.y-thigh.head_local.y
    return math.asin(target/math.hypot(reach.y, reach.z))-math.atan2(reach.y, -reach.z)


def author_motion(arm, scene):
    """Key loaded locomotion on the fixed rig; retain all inspection actions."""
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
    if any(name in bpy.data.actions for name in ("idle", "ready", "walk")):
        raise RuntimeError("Unrelated idle/ready/walk action exists; use an isolated source scene")
    soles = {side: next(o for o in scene.objects if o.name == "Sandal sole."+side)
             for side in ("L", "R")}
    for clip, walking in (("idle", False), ("walk", True)):
        arm.animation_data.action = None
        cycle_frames = 27 if walking else 36
        for frame in range(cycle_frames+1):
            phase = frame / cycle_frames
            for bone in arm.pose.bones:
                bone.rotation_mode = "XYZ"
                bone.rotation_euler = (0, 0, 0)
                bone.location = (0, 0, 0)
            arm.pose.bones["spine"].rotation_euler.x = .035
            if walking:
                loaded_body(arm, phase, False)
            bpy.context.view_layer.update()
            for side in ("R", "L"):
                step = (phase + (0 if side == "R" else .5)) % 1
                swing = max(0, (step-.5)*2)
                knee = cycle_value(((0,.10),(.08,.27),(.25,.10),(.35,.10),
                                    (.50,.88),(.65,1.03),(.80,.65),(1,.10)), step) if walking else .10
                roll = cycle_value(((0,-.25),(.10,0),(.30,0),(.42,.35),(.50,.52),
                                    (.65,.20),(.85,-.15),(1,-.25)), step) if walking else 0
                # 0.765m steps in a .9s cycle target the class-independent
                # 1.7m/s walk floor. Class pace scales only the ABOVE-walk range.
                stride = (-.3825+1.53*step if step < .5 else .3825*math.cos(math.pi*swing)) if walking else 0
                heel = max(soles[side].data.vertices, key=lambda v:v.co.y).co
                toe = min(soles[side].data.vertices, key=lambda v:v.co.y).co
                pivot = toe.lerp(heel, .5+.5*math.cos(math.tau*step))-arm.data.bones["foot."+side].head_local
                stride -= (Matrix.Rotation(roll,3,"X")@pivot-pivot).y
                stride -= arm.pose.bones["thigh."+side].head.y-arm.data.bones["thigh."+side].head_local.y
                # Offline joint authoring: chosen knee lift plus a linear support
                # interval. No target solver or planted-foot state enters runtime.
                if walking:
                    thigh = thigh_angle(arm, side, knee, stride)
                    orient(arm, "thigh."+side, Matrix.Rotation(thigh, 3, "X").to_quaternion() @ arm.data.bones["thigh."+side].matrix_local.to_quaternion())
                else:
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
                carry_arm(arm, side, phase, walking)
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
    arm.animation_data.action = bpy.data.actions["idle"]
    arm.animation_data.action_slot = arm.animation_data.action.slots[0]
    scene.frame_set(0)
    author_run(arm, scene)
    author_ready(arm, scene)


def author_ready(arm, scene):
    """Keep the planted idle body, raising only the shield arm into protection."""
    ready = bpy.data.actions["idle"].copy()
    ready.name = "ready"
    arm.animation_data.action = ready
    arm.animation_data.action_slot = ready.slots[0]
    for frame in range(37):
        scene.frame_set(frame)
        aim(arm, "upper-arm.L", (.32, -.60, -1))
        shield_forearm(arm, (-.8, -.10, .16), (0, -1, 0))
        helper = arm.pose.bones["elbow-volume.L"]
        base = helper.parent.matrix@helper.parent.bone.matrix_local.inverted()@helper.bone.matrix_local
        orient(arm, helper.name, base.to_quaternion().slerp(arm.pose.bones["forearm.L"].matrix.to_quaternion(), .5))
        for name in ("upper-arm.L", "forearm.L", "elbow-volume.L"):
            arm.pose.bones[name].keyframe_insert("rotation_euler", frame=frame)
    track = arm.animation_data.nla_tracks.new()
    track.name, track.mute = "ready", True
    strip = track.strips.new("ready", 0, ready)
    strip.action_slot = ready.slots[0]
    scene.frame_set(0)


def author_run(arm, scene):
    """A fresh unimpeded heavy runs at 1.7+(3.4-1.7)*.9 = 3.23m/s."""
    for track in list(arm.animation_data.nla_tracks):
        action = track.strips[0].action
        if action.get("author") == "heavy-run":
            arm.animation_data.nla_tracks.remove(track)
            if arm.animation_data.action == action:
                arm.animation_data.action = None
            bpy.data.actions.remove(action)
    if "run" in bpy.data.actions:
        raise RuntimeError("Unrelated run action exists; use an isolated source scene")
    soles = {side: next(o for o in scene.objects if o.name == "Sandal sole."+side)
             for side in ("L", "R")}
    arm.animation_data.action = None
    for frame in range(25):
        phase = frame/24
        for bone in arm.pose.bones:
            bone.rotation_mode = "XYZ"
            bone.rotation_euler = (0,0,0)
            bone.location = (0,0,0)
        loaded_body(arm, phase, True)
        bpy.context.view_layer.update()
        minimum = {}
        for side in ("R", "L"):
            step = (phase+(0 if side == "R" else .5))%1
            knee = cycle_value(((0,.30),(.12,.68),(.28,.34),(.35,.30),
                                (.50,1.75),(.70,1.15),(.90,.45),(1,.30)),step)
            roll = cycle_value(((0,-.10),(.08,0),(.22,0),(.35,.60),
                                (.50,.55),(.72,-.22),(1,-.10)),step)
            # .8s cycle / 150 steps per minute. Each .28s support interval
            # travels .9044m backward relative to the unchanged runtime root.
            stride = -.4522+3.23*.8*step if step<.35 else .4522*math.cos(math.pi*(step-.35)/.65)
            heel = max(soles[side].data.vertices,key=lambda v:v.co.y).co
            toe = min(soles[side].data.vertices,key=lambda v:v.co.y).co
            pivot = toe.lerp(heel,.5+.5*math.cos(math.pi*min(step/.35,1)))-arm.data.bones["foot."+side].head_local
            stride -= (Matrix.Rotation(roll,3,"X")@pivot-pivot).y
            stride -= arm.pose.bones["thigh."+side].head.y-arm.data.bones["thigh."+side].head_local.y
            thigh=thigh_angle(arm,side,knee,stride)
            orient(arm,"thigh."+side,Matrix.Rotation(thigh,3,"X").to_quaternion()@arm.data.bones["thigh."+side].matrix_local.to_quaternion())
            arm.pose.bones["shin."+side].rotation_euler.x=knee
            arm.pose.bones["knee-volume."+side].rotation_euler.x=knee/2
            bpy.context.view_layer.update()
            orient(arm,"foot."+side,Matrix.Rotation(roll,3,"X").to_quaternion()@arm.data.bones["foot."+side].matrix_local.to_quaternion())
            carry_arm(arm, side, phase, True, running=True)
            helper=arm.pose.bones["elbow-volume."+side]
            base=helper.parent.matrix@helper.parent.bone.matrix_local.inverted()@helper.bone.matrix_local
            orient(arm,helper.name,base.to_quaternion().slerp(arm.pose.bones["forearm."+side].matrix.to_quaternion(),.5))
            foot=arm.pose.bones["foot."+side]
            transform=foot.matrix@foot.bone.matrix_local.inverted()
            minimum[side] = min((transform@v.co).z for v in soles[side].data.vertices)
        half=phase%.5
        clearance=.035*math.sin(math.pi*(half-.35)/.15) if half>.35 else 0
        pelvis=arm.pose.bones["pelvis"]
        offset = -min(minimum.values())+clearance
        support = "R" if phase % 1 < .5 else "L"
        if half <= .35 and abs(minimum[support]+offset) > .0001:
            raise RuntimeError(f"Run frame {frame}: intended support foot is not grounded")
        if any(height+offset < -.0001 for height in minimum.values()):
            raise RuntimeError(f"Run frame {frame}: sole penetrates ground")
        pelvis.location=pelvis.bone.matrix_local.to_3x3().inverted()@Vector((0,0,offset))
        for bone in arm.pose.bones:
            bone.keyframe_insert("rotation_euler",frame=frame)
            bone.keyframe_insert("location",frame=frame)
    action=arm.animation_data.action
    action.name,action["author"]="run","heavy-run"
    track=arm.animation_data.nla_tracks.new()
    track.name,track.mute="run",True
    strip=track.strips.new("run",0,action)
    strip.action_slot=action.slots[0]
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:key.interpolation="LINEAR"
    arm.animation_data.action=bpy.data.actions["idle"]
    arm.animation_data.action_slot=arm.animation_data.action.slots[0]
    scene.frame_set(0)


def build(source, output=OUTPUT):
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
    anatomy.export_candidate(body, arm, output, "heavy-kit")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=OUTPUT/"heavy-kit.blend")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    build(args.source, args.output)
