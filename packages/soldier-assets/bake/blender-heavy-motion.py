"""Canonical equipped-heavy motion composition; no runtime IK or sim changes."""
import argparse
import hashlib
import importlib.util
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector

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


def action_signature(action):
    return [(curve.data_path, curve.array_index,
             [(tuple(key.co), key.interpolation, tuple(key.handle_left), tuple(key.handle_right))
              for key in curve.keyframe_points])
            for curve in action_fcurves(action)]


def author_loaded_run(arm, scene):
    controls = {action.name: action_signature(action) for action in bpy.data.actions if action.name != "run"}
    for track in arm.animation_data.nla_tracks:
        track.mute = True
    action = bpy.data.actions["run"]
    arm.animation_data.action = action
    arm.animation_data.action_slot = action.slots[0]
    soles = {side: scene.objects["Sandal sole." + side] for side in ("L", "R")}
    # Freeze the fitted arm carriage before editing the trunk. Wrist/grip keys survive.
    carriage = []
    for frame in range(25):
        scene.frame_set(frame)
        carriage.append({name: arm.pose.bones[name].matrix.to_quaternion().copy()
                         for name in ("upper-arm.L", "forearm.L", "upper-arm.R", "forearm.R")})
    changed = {"pelvis", "spine", "chest", "neck", "head"}
    changed.update(name + "." + side for side in ("L", "R")
                   for name in ("thigh", "shin", "knee-volume", "foot", "upper-arm", "forearm", "elbow-volume"))
    untouched = [(path, index, keys) for path, index, keys in action_signature(action)
                 if not any(path.startswith(f'pose.bones["{name}"]') for name in changed)]
    for frame in range(25):
        scene.frame_set(frame)
        phase = frame / 24
        half = phase % .5
        stride = math.cos(math.tau * phase)
        # Loading occurs after touchdown. Chest response lags the pelvis; the
        # neck stabilizes the gaze instead of adding the same bob to every joint.
        load = math.cos(2 * math.tau * (phase - .11))
        delayed = math.cos(2 * math.tau * (phase - .15))
        for name, pitch, turn, roll in (
            ("pelvis", .10 + .035 * load, .085 * stride, -.025 * stride),
            ("spine", .28 + .065 * load, -.08 * stride, .035 * stride),
            ("chest", .32 + .070 * delayed, -.145 * stride, .060 * stride),
            ("neck", .11 + .025 * delayed, -.035 * stride, .020 * stride),
            ("head", .015, -.020 * stride, .006 * stride),
        ):
            rotation = Matrix.Rotation(turn, 3, "Z") @ Matrix.Rotation(pitch, 3, "X") @ Matrix.Rotation(roll, 3, "Y")
            orient(arm, name, rotation.to_quaternion() @ arm.data.bones[name].matrix_local.to_quaternion())
        arm.pose.bones["pelvis"].location = (0, 0, 0)
        bpy.context.view_layer.update()
        minimum = {}
        for side in ("R", "L"):
            step = (phase + (0 if side == "R" else .5)) % 1
            # Flex under impact, extend against the floor, then fold the recovering
            # leg. The review fixture prescribes linear ground travel at 3.23m/s.
            knee = cycle_value(((0, .38), (.11, .88), (.23, .54), (.35, .24),
                                       (.51, 1.85), (.69, 1.35), (.88, .54), (1, .38)), step)
            roll = cycle_value(((0, -.12), (.07, 0), (.18, 0), (.35, .80),
                                       (.50, .60), (.73, -.24), (1, -.12)), step)
            # The foot lands nearer the hip and leaves farther behind it; a
            # symmetric reach ahead made landing the lowest point of the bounce.
            travel = -.32 + 3.23 * .8 * step if step < .35 else .1322 + .4522 * math.cos(math.pi * (step - .35) / .65)
            heel = max(soles[side].data.vertices, key=lambda vertex: vertex.co.y).co
            toe = min(soles[side].data.vertices, key=lambda vertex: vertex.co.y).co
            pivot = toe.lerp(heel, .5 + .5 * math.cos(math.pi * min(step / .35, 1))) - arm.data.bones["foot." + side].head_local
            travel -= (Matrix.Rotation(roll, 3, "X") @ pivot - pivot).y
            travel -= arm.pose.bones["thigh." + side].head.y - arm.data.bones["thigh." + side].head_local.y
            thigh = thigh_angle(arm, side, knee, travel)
            orient(arm, "thigh." + side, Matrix.Rotation(thigh, 3, "X").to_quaternion() @ arm.data.bones["thigh." + side].matrix_local.to_quaternion())
            arm.pose.bones["shin." + side].rotation_euler.x = knee
            arm.pose.bones["knee-volume." + side].rotation_euler.x = knee / 2
            bpy.context.view_layer.update()
            orient(arm, "foot." + side, Matrix.Rotation(roll, 3, "X").to_quaternion() @ arm.data.bones["foot." + side].matrix_local.to_quaternion())
            for name, gain in (("upper-arm." + side, 1), ("forearm." + side, .55)):
                swing = (.15 if side == "R" else .07) * math.sin(math.tau * phase - .25)
                delta = Matrix.Rotation(.055 * delayed + gain * swing, 3, "X") @ Matrix.Rotation(.035 * stride, 3, "Y")
                orient(arm, name, delta.to_quaternion() @ carriage[frame][name])
            helper = arm.pose.bones["elbow-volume." + side]
            base = helper.parent.matrix @ helper.parent.bone.matrix_local.inverted() @ helper.bone.matrix_local
            orient(arm, helper.name, base.to_quaternion().slerp(arm.pose.bones["forearm." + side].matrix.to_quaternion(), .5))
            foot = arm.pose.bones["foot." + side]
            transform = foot.matrix @ foot.bone.matrix_local.inverted()
            minimum[side] = min((transform @ vertex.co).z for vertex in soles[side].data.vertices)
        clearance = .025 * math.sin(math.pi * (half - .35) / .15) if half > .35 else 0
        offset = -min(minimum.values()) + clearance
        support = "R" if phase % 1 < .5 else "L"
        if half <= .35:
            assert abs(minimum[support] + offset) < .0001, (frame, "support foot lost floor")
        pelvis = arm.pose.bones["pelvis"]
        pelvis.location = pelvis.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, offset))
        for name in changed:
            arm.pose.bones[name].keyframe_insert("rotation_euler", frame=frame)
        pelvis.keyframe_insert("location", frame=frame)
    assert controls == {action.name: action_signature(action) for action in bpy.data.actions if action.name != "run"}
    assert untouched == [(path, index, keys) for path, index, keys in action_signature(action)
                         if not any(path.startswith(f'pose.bones["{name}"]') for name in changed)]


def action_fcurves(action):
    return [curve for layer in action.layers for strip in layer.strips
            for bag in strip.channelbags for curve in bag.fcurves]


def limb_joint(origin, target, upper, lower, bend_hint):
    """Offline two-segment geometry shared by supported legs and the sword arm."""
    axis = (target - origin).normalized()
    reach = (target - origin).length
    along = (upper * upper - lower * lower + reach * reach) / (2 * reach)
    pole = (bend_hint - axis * bend_hint.dot(axis)).normalized()
    return origin + axis * along + pole * math.sqrt(upper * upper - along * along)


def place_supported_leg(arm, side, ankle, forward=Vector((0, -1, 0))):
    """Offline two-segment construction; runtime receives ordinary pose keys."""
    thigh, shin = (arm.pose.bones[name + "." + side] for name in ("thigh", "shin"))
    hip = thigh.head.copy()
    knee = limb_joint(hip, ankle, thigh.bone.length, shin.bone.length, forward)
    orient(arm, thigh.name, (thigh.bone.tail_local - thigh.bone.head_local).rotation_difference(knee - hip) @ thigh.bone.matrix_local.to_quaternion())
    orient(arm, shin.name, (shin.bone.tail_local - shin.bone.head_local).rotation_difference(ankle - knee) @ shin.bone.matrix_local.to_quaternion())
    arm.pose.bones["knee-volume." + side].rotation_euler = tuple(v * .5 for v in shin.rotation_euler)


def begin_ready_action(arm, scene, clip, author):
    """Rebuild owned clips from ready, leaving unrelated source controls intact."""
    if scene.render.fps / scene.render.fps_base != 30:
        raise ValueError("Ready-based authoring requires the frozen 30 fps donor")
    controls = {action.name: action_signature(action) for action in bpy.data.actions if action.name != clip}
    previous = bpy.data.actions.get(clip)
    if previous:
        if previous.get("author") != author:
            raise RuntimeError(f"Unrelated {clip} action exists")
        for track in list(arm.animation_data.nla_tracks):
            if any(strip.action == previous for strip in track.strips):
                arm.animation_data.nla_tracks.remove(track)
        if arm.animation_data.action == previous:
            arm.animation_data.action = None
        bpy.data.actions.remove(previous)
    for track in arm.animation_data.nla_tracks:
        track.mute = True
    ready = bpy.data.actions["ready"]
    arm.animation_data.action = ready
    arm.animation_data.action_slot = ready.slots[0]
    scene.frame_set(0)
    base = {bone.name: (bone.rotation_euler.copy(), bone.location.copy()) for bone in arm.pose.bones}
    feet = {side: arm.pose.bones["foot." + side].matrix.to_quaternion().copy() for side in ("L", "R")}
    soles = {side: scene.objects["Sandal sole." + side] for side in ("L", "R")}
    arm.animation_data.action = None
    return controls, base, feet, soles


def finish_ready_action(arm, clip, author, distance, controls):
    action = arm.animation_data.action
    action.name, action["author"] = clip, author
    if distance is not None:
        action["stride_distance_m"] = distance
    for curve in action_fcurves(action):
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR"
    track = arm.animation_data.nla_tracks.new()
    track.name, track.mute = clip, True
    strip = track.strips.new(clip, 0, action)
    strip.action_slot = action.slots[0]
    assert controls == {name: action_signature(bpy.data.actions[name]) for name in controls}


def author_guarded_backward(arm, scene):
    """Provisional threat-facing retreat, calibrated to the recorded centroid trace."""
    clip, author = "guarded-backward-walk", "heavy-guarded-backward"
    speed = .9161101579666129
    controls, base, feet, soles = begin_ready_action(arm, scene, clip, author)
    # Each foot stays supported for 62% of this one-second cycle. Rebuild
    # from ready, never from the previous candidate's accumulated offsets.
    for frame in range(31):
        phase = (frame % 30) / 30
        for bone in arm.pose.bones:
            bone.rotation_euler, bone.location = base[bone.name]
        sway = math.cos(math.tau * phase)
        settle = math.cos(2 * math.tau * (phase - .1))
        pelvis = arm.pose.bones["pelvis"]
        target = Vector((-.032 * sway, -.005, .864 - .013 * settle))
        pelvis.location = pelvis.bone.matrix_local.to_3x3().inverted() @ (target - pelvis.bone.head_local)
        pelvis.rotation_euler.y += .018 * sway
        arm.pose.bones["spine"].rotation_euler.y += .040 * sway
        arm.pose.bones["spine"].rotation_euler.x += .035 * settle
        arm.pose.bones["chest"].rotation_euler.x -= .014 * math.cos(2 * math.tau * (phase - .14))
        arm.pose.bones["chest"].rotation_euler.y -= .025 * math.cos(math.tau * (phase - .04))
        arm.pose.bones["neck"].rotation_euler.y -= .022 * math.cos(math.tau * (phase - .08))
        for side, sign in (("L", 1), ("R", -1)):
            arm.pose.bones["upper-arm." + side].rotation_euler.x += .025 * math.sin(math.tau * (phase - .08)) * sign
            arm.pose.bones["forearm." + side].rotation_euler.x -= .016 * math.sin(math.tau * (phase - .12)) * sign
        bpy.context.view_layer.update()
        for side, sign in (("L", 1), ("R", -1)):
            step = (phase + (0 if side == "R" else .5)) % 1
            half = .62 * speed / 2
            if step <= .62:
                travel = half - speed * step
                clearance = 0
            else:
                u = (step - .62) / .38
                travel = (-half * (2 * u**3 - 3 * u**2 + 1)
                          + half * (-2 * u**3 + 3 * u**2)
                          - speed * .38 * (2 * u**3 - 3 * u**2 + u))
                clearance = .045 * math.sin(math.pi * u)**2
            roll = cycle_value(((0, .30), (.10, 0), (.45, 0), (.62, -.28),
                                (.78, -.08), (.92, .18), (1, .30)), step)
            rotation = Matrix.Rotation(roll, 3, "X").to_quaternion() @ feet[side]
            foot = arm.data.bones["foot." + side]
            transform = rotation.to_matrix() @ foot.matrix_local.to_3x3().inverted()
            offsets = [transform @ (vertex.co - foot.head_local) for vertex in soles[side].data.vertices]
            ankle = Vector((sign * .185, travel, clearance - min(point.z for point in offsets)))
            place_supported_leg(arm, side, ankle, Vector((.16 * sign, -1, 0)))
            orient(arm, "foot." + side, rotation)
        for bone in arm.pose.bones:
            bone.keyframe_insert("rotation_euler", frame=frame)
            bone.keyframe_insert("location", frame=frame)
    finish_ready_action(arm, clip, author, speed, controls)


def author_guarded_left(arm, scene):
    """Left-leading step-close: shield side stays left, never a mirrored rig."""
    clip, author = "guarded-left-walk", "heavy-guarded-left"
    duration, speed = .6, .760776176053138
    controls, base, feet, soles = begin_ready_action(arm, scene, clip, author)
    distance = speed * duration
    for frame in range(19):
        phase = (frame % 18) / 18
        for bone in arm.pose.bones:
            bone.rotation_euler, bone.location = base[bone.name]
        sway = math.sin(math.tau * phase)
        load = math.cos(2 * math.tau * (phase - .08))
        pelvis = arm.pose.bones["pelvis"]
        # A smooth local transfer must not reverse the prescribed world travel.
        # Keep a usable closing base instead of chasing the sole with the pelvis.
        transfer = .065 * sway
        target = Vector((transfer, -.040, .800 - .016 * load))
        pelvis.location = pelvis.bone.matrix_local.to_3x3().inverted() @ (target - pelvis.bone.head_local)
        arm.pose.bones["spine"].rotation_euler.x += .035 * load
        arm.pose.bones["chest"].rotation_euler.x -= .012 * math.cos(2 * math.tau * (phase - .12))
        bpy.context.view_layer.update()
        for name, lean in (("pelvis", .028), ("spine", .140), ("chest", -.025), ("neck", -.050)):
            bone = arm.pose.bones[name]
            orient(arm, name, Matrix.Rotation(lean * sway, 3, "Y").to_quaternion() @ bone.matrix.to_quaternion())
        for side, sign in (("L", 1), ("R", -1)):
            step = (phase + (0 if side == "L" else .5)) % 1
            half = .75 * distance / 2
            if step <= .75:
                travel, clearance = half - distance * step, 0
            else:
                u = (step - .75) / .25
                travel = (-half * (2*u**3 - 3*u**2 + 1) + half * (-2*u**3 + 3*u**2)
                          - distance * .25 * (2*u**3 - 3*u**2 + u))
                clearance = .035 * math.sin(math.pi * u)**2
            roll = cycle_value(((0, .08), (.10, 0), (.62, 0), (.75, -.09), (.87, 0), (1, .08)), step)
            rotation = Matrix.Rotation(roll, 3, "Y").to_quaternion() @ feet[side]
            foot = arm.data.bones["foot." + side]
            transform = rotation.to_matrix() @ foot.matrix_local.to_3x3().inverted()
            offsets = [transform @ (v.co - foot.head_local) for v in soles[side].data.vertices]
            ankle = Vector((sign * .220 + travel, -.075 if side == "L" else .065,
                            clearance - min(p.z for p in offsets)))
            place_supported_leg(arm, side, ankle, Vector((.30 * sign, -1, 0)))
            orient(arm, "foot." + side, rotation)
        for bone in arm.pose.bones:
            bone.keyframe_insert("rotation_euler", frame=frame)
            bone.keyframe_insert("location", frame=frame)
    finish_ready_action(arm, clip, author, distance, controls)


def author_guarded_right(arm, scene):
    """Right-leading guarded step; original shield-side stagger stays intact."""
    clip, author = "guarded-right-walk", "heavy-guarded-right"
    duration, speed = .6, .9253140324024038
    controls, base, feet, soles = begin_ready_action(arm, scene, clip, author)
    distance = speed * duration
    for frame in range(19):
        phase = (frame % 18) / 18
        for bone in arm.pose.bones:
            bone.rotation_euler, bone.location = base[bone.name]
        sway = -math.sin(math.tau * phase)
        load = math.cos(2 * math.tau * (phase - .08))
        pelvis = arm.pose.bones["pelvis"]
        target = Vector((.065 * sway, -.040, .800 - .018 * load))
        pelvis.location = pelvis.bone.matrix_local.to_3x3().inverted() @ (target - pelvis.bone.head_local)
        arm.pose.bones["spine"].rotation_euler.x += .040 * load
        arm.pose.bones["chest"].rotation_euler.x -= .014 * math.cos(2 * math.tau * (phase - .12))
        bpy.context.view_layer.update()
        for name, lean in (("pelvis", .028), ("spine", .140), ("chest", -.025), ("neck", -.050)):
            bone = arm.pose.bones[name]
            orient(arm, name, Matrix.Rotation(lean * sway, 3, "Y").to_quaternion() @ bone.matrix.to_quaternion())
        for side, sign in (("L", 1), ("R", -1)):
            step = (phase + (0 if side == "R" else .5)) % 1
            half = .75 * distance / 2
            if step <= .75:
                travel, clearance = half - distance * step, 0
            else:
                u = (step - .75) / .25
                travel = (-half * (2*u**3 - 3*u**2 + 1) + half * (-2*u**3 + 3*u**2)
                          - distance * .25 * (2*u**3 - 3*u**2 + u))
                clearance = .040 * math.sin(math.pi * u)**2
            roll = cycle_value(((0, -.08), (.10, 0), (.62, 0), (.75, .09), (.87, 0), (1, -.08)), step)
            rotation = Matrix.Rotation(roll, 3, "Y").to_quaternion() @ feet[side]
            foot = arm.data.bones["foot." + side]
            transform = rotation.to_matrix() @ foot.matrix_local.to_3x3().inverted()
            offsets = [transform @ (v.co - foot.head_local) for v in soles[side].data.vertices]
            # Keep the actual left shield-side foot forward, even while right leads.
            ankle = Vector((sign * .240 - travel, -.075 if side == "L" else .065,
                            clearance - min(p.z for p in offsets)))
            place_supported_leg(arm, side, ankle, Vector((.30 * sign, -1, 0)))
            orient(arm, "foot." + side, rotation)
        for bone in arm.pose.bones:
            bone.keyframe_insert("rotation_euler", frame=frame)
            bone.keyframe_insert("location", frame=frame)
    finish_ready_action(arm, clip, author, distance, controls)


def author_sword_effort(arm, scene):
    """Unpaired descending cut: art cadence, never a simulated contact event."""
    clip, author = "sword-effort", "heavy-sword-effort"
    controls, base, feet, soles = begin_ready_action(arm, scene, clip, author)
    ready_world = {b.name: b.matrix.to_quaternion().copy() for b in arm.pose.bones}
    ankles = {side: arm.pose.bones["foot."+side].head.copy() for side in ("L", "R")}
    forearm = arm.pose.bones["forearm.R"]
    axis = (forearm.tail-forearm.head).normalized()
    hand = arm.pose.bones["hand.R"]
    centers = [sum((v.co for v in scene.objects[name].data.vertices), Vector()) / len(scene.objects[name].data.vertices)
               for name in ("Sword blade", "Sword grip")]
    blade = (hand.matrix.to_3x3() @ hand.bone.matrix_local.to_3x3().inverted() @ (centers[0]-centers[1])).normalized()
    blade = (blade-axis*blade.dot(axis)).normalized()
    source = Matrix((axis.cross(blade), axis, blade)).transposed()
    upper = arm.pose.bones["upper-arm.R"]
    upper_axis = (upper.tail-upper.head).normalized()
    shield_upper = arm.pose.bones["upper-arm.L"]
    shield_axis = (shield_upper.tail-shield_upper.head).normalized()
    shield_elbow = shield_upper.tail.copy()
    wrist = forearm.tail.copy()
    goals = [(0, wrist, blade, upper_axis)]
    for seconds, target, edge, pole in (
        (.08, (-.51, -.227, 1.00), blade, upper_axis),
        (.18, (-.53, -.25, 1.27), (0, -.35, .94), (-1, 0, .1)),
        (.30, (-.49, -.17, 1.53), (0, .25, .97), (-.8, .2, .7)),
        (.40, (-.48, -.32, 1.30), (0, -.95, .31), (-.4, -1, .5)),
        (.50, (-.40, -.38, 1.08), (0, -.87, -.5), (-.3, -1, .5)),
        (.65, (-.40, -.37, 1.10), (0, -.9, -.43), (-.3, -1, .5)),
        (.85, (-.50, -.25, 1.00), blade, (-.4, -1, .5)),
        (.94, (-.50, -.227, .95), blade, upper_axis),
    ):
        goals.append((seconds, Vector(target), Vector(edge), Vector(pole)))
    goals.append((1.05, wrist, blade, upper_axis))
    previous = {}
    for frame in range(37):
        seconds = frame/30
        for bone in arm.pose.bones:
            bone.rotation_euler, bone.location = base[bone.name]
        if 0 < seconds < 1.05:
            turn = cycle_value(((0, 0), (.30, -.18), (.50, .24), (.72, .17), (1.05, 0), (1.2, 0)), seconds)
            drive = cycle_value(((0, 0), (.22, -.055), (.32, -.030), (.50, .095), (.65, .080), (.85, .015), (1.05, 0)), seconds)
            lateral = cycle_value(((0, 0), (.22, -.045), (.50, .045), (.80, .02), (1.05, 0)), seconds)
            sink = cycle_value(((0, 0), (.22, .035), (.50, .035), (.65, .025), (.85, .020), (1.05, 0)), seconds)
            heel = cycle_value(((0, 0), (.30, 0), (.46, .32), (.65, .25), (.85, 0), (1.05, 0)), seconds)
            advance = cycle_value(((0, 0), (.22, 0), (.40, 1), (.85, 1), (1.05, 0)), seconds)
            lift = 0
            for start, end in ((.22, .40), (.85, 1.05)):
                if start < seconds < end:
                    lift = .035*math.sin(math.pi*(seconds-start)/(end-start))**2
            pelvis = arm.pose.bones["pelvis"]
            pelvis.location += pelvis.bone.matrix_local.to_3x3().inverted() @ Vector((lateral, -drive, -sink))
            bpy.context.view_layer.update()
            for name, twist, lean in (("pelvis", .45, .3), ("spine", .7, 1), ("chest", 1, .5), ("neck", -.55, -.4)):
                bone = arm.pose.bones[name]
                orient(arm, name, (Matrix.Rotation(turn*twist, 3, "Z") @ Matrix.Rotation(drive*lean, 3, "X")).to_quaternion() @ bone.matrix.to_quaternion())
            for side in ("L", "R"):
                foot = arm.data.bones["foot."+side]
                roll = heel if side == "R" else cycle_value(((0, 0), (.32, 0), (.40, -.10), (.46, 0), (1.05, 0)), seconds)
                rotation = Matrix.Rotation(roll, 3, "X").to_quaternion() @ feet[side]
                ready_transform = feet[side].to_matrix() @ foot.matrix_local.to_3x3().inverted()
                transform = rotation.to_matrix() @ foot.matrix_local.to_3x3().inverted()
                toe = min(soles[side].data.vertices, key=lambda v: (ready_transform @ (v.co-foot.head_local)).y).co-foot.head_local
                ankle = ankles[side] + ready_transform@toe-transform@toe
                offsets = [transform@(v.co-foot.head_local) for v in soles[side].data.vertices]
                if side == "L":
                    ankle += Vector((.035*advance, -.14*advance, 0))
                ankle.z = -min(v.z for v in offsets)+(lift if side == "L" else 0)
                place_supported_leg(arm, side, ankle)
                orient(arm, "foot."+side, rotation)
            for (start, wa, ba, pa), (end, wb, bb, pb) in zip(goals, goals[1:]):
                if start <= seconds <= end:
                    u = (seconds-start)/(end-start)
                    u = u*u*(3-2*u)
                    target_wrist = wa.lerp(wb, u)
                    elbow = limb_joint(upper.head.copy(), target_wrist, upper.bone.length, forearm.bone.length, pa.lerp(pb, u))
                    orient(arm, upper.name, upper_axis.rotation_difference(elbow-upper.head) @ ready_world[upper.name])
                    target_axis = (target_wrist-elbow).normalized()
                    target_blade = ba.lerp(bb, u)
                    target_blade = (target_blade-target_axis*target_blade.dot(target_axis)).normalized()
                    target = Matrix((target_axis.cross(target_blade), target_axis, target_blade)).transposed()
                    orient(arm, forearm.name, (target @ source.transposed()).to_quaternion() @ ready_world[forearm.name])
                    break
            # The shield arm compensates the chest turn around its own grip.
            target = shield_elbow + Vector((0, -.04*min(sink/.025, 1), -sink*.4))
            direction = (target-shield_upper.head).normalized()
            orient(arm, shield_upper.name, shield_axis.rotation_difference(direction) @ ready_world[shield_upper.name])
            orient(arm, "forearm.L", Matrix.Rotation(max(turn, 0)*1.25, 3, "Z").to_quaternion() @ ready_world["forearm.L"])
            for side in ("L", "R"):
                helper = arm.pose.bones["elbow-volume."+side]
                parent = helper.parent.matrix @ helper.parent.bone.matrix_local.inverted() @ helper.bone.matrix_local
                orient(arm, helper.name, parent.to_quaternion().slerp(arm.pose.bones["forearm."+side].matrix.to_quaternion(), .5))
        for bone in arm.pose.bones:
            if bone.name in previous:
                bone.rotation_euler = bone.rotation_euler.to_quaternion().to_euler("XYZ", previous[bone.name])
            previous[bone.name] = bone.rotation_euler.copy()
            bone.keyframe_insert("rotation_euler", frame=frame)
            bone.keyframe_insert("location", frame=frame)
    finish_ready_action(arm, clip, author, None, controls)


def supported_ready_stance(arm):
    """Offline two-segment construction; runtime receives ordinary pose keys."""
    pelvis = arm.pose.bones["pelvis"]
    pelvis.location = pelvis.bone.matrix_local.to_3x3().inverted() @ (Vector((0, -.005, .880)) - pelvis.bone.head_local)
    bpy.context.view_layer.update()
    for side, sign in (("L", 1), ("R", -1)):
        foot = arm.pose.bones["foot." + side]
        foot_rotation = foot.bone.matrix_local.to_quaternion()
        ankle = Vector((sign * .165, -.075 if side == "L" else .070, .093))
        place_supported_leg(arm, side, ankle)
        orient(arm, foot.name, foot_rotation)
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


def author_idle_ready(arm, scene):
    for name, strength in (("idle", 1.0), ("ready", .65)):
        action = bpy.data.actions[name]
        arm.animation_data.action = action
        arm.animation_data.action_slot = action.slots[0]
        scene.frame_set(0)
        if name == "ready":
            supported_ready_stance(arm)
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
        for curve in action_fcurves(action):
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
    # Reconstruct the fitted carry before adding response: never accumulate
    # trunk/arm deltas from a previously authored loaded run.
    author_motion(arm, scene)
    author_loaded_run(arm, scene)
    author_idle_ready(arm, scene)
    author_guarded_backward(arm, scene)
    author_guarded_left(arm, scene)
    author_guarded_right(arm, scene)
    author_sword_effort(arm, scene)
    anatomy.export_candidate(body, arm, output, "heavy-kit")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=OUTPUT/"heavy-kit.blend")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    build(args.source, args.output)
