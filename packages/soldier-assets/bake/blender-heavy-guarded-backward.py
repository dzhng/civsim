"""Original guarded backward-walk keys on a fitted, supported heavy source.

Adds one candidate action. Existing actions and editable geometry remain intact.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("motion", HERE / "blender-heavy-motion.py")
motion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(motion)
CLIP = "guarded-backward-walk"


def curves(action):
    return [(curve.data_path, curve.array_index,
             [(tuple(key.co), key.interpolation, tuple(key.handle_left), tuple(key.handle_right))
              for key in curve.keyframe_points])
            for layer in action.layers for strip in layer.strips
            for bag in strip.channelbags for curve in bag.fcurves]


def place_leg(arm, side, ankle):
    """Offline two-segment geometry with the knee held toward the threat."""
    thigh, shin = (arm.pose.bones[name + "." + side] for name in ("thigh", "shin"))
    hip = thigh.head.copy()
    axis = (ankle - hip).normalized()
    reach = (ankle - hip).length
    upper, lower = thigh.bone.length, shin.bone.length
    along = (upper * upper - lower * lower + reach * reach) / (2 * reach)
    forward = Vector((0, -1, 0))
    pole = (forward - axis * forward.dot(axis)).normalized()
    knee = hip + axis * along + pole * math.sqrt(upper * upper - along * along)
    for bone, direction in ((thigh, knee - hip), (shin, ankle - knee)):
        motion.orient(arm, bone.name, (bone.bone.tail_local - bone.bone.head_local).rotation_difference(direction) @ bone.bone.matrix_local.to_quaternion())
    arm.pose.bones["knee-volume." + side].rotation_euler = tuple(value * .5 for value in shin.rotation_euler)


def author(source, output, speed):
    if not math.isfinite(speed) or speed <= 0:
        raise ValueError("Backward speed must be a finite positive magnitude")
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    arm = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    controls = {action.name: curves(action) for action in bpy.data.actions}
    if CLIP in controls:
        raise ValueError("Choose the frozen source without this candidate action")
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
    # One second at 30Hz. Each foot stays supported for 62% of the cycle,
    # giving overlapping support while the other foot reaches backwards.
    for frame in range(31):
        phase = (frame % 30) / 30
        for bone in arm.pose.bones:
            bone.rotation_euler, bone.location = base[bone.name]
        sway = math.cos(math.tau * phase)
        pelvis = arm.pose.bones["pelvis"]
        target = Vector((-.025 * sway, -.005, .864 - .007 * math.cos(2 * math.tau * (phase - .1))))
        pelvis.location = pelvis.bone.matrix_local.to_3x3().inverted() @ (target - pelvis.bone.head_local)
        arm.pose.bones["spine"].rotation_euler.y += .018 * sway
        arm.pose.bones["chest"].rotation_euler.x += .012 * math.sin(2 * math.tau * phase)
        arm.pose.bones["neck"].rotation_euler.y -= .013 * sway
        bpy.context.view_layer.update()
        for side, sign in (("L", 1), ("R", -1)):
            step = (phase + (0 if side == "R" else .5)) % 1
            half = .62 * speed / 2
            if step <= .62:
                travel = half - speed * step
                clearance = 0
            else:
                u = (step - .62) / .38
                # Endpoint velocities join the planted travel. The foot reaches
                # backward through a low arc rather than replaying a forward gait.
                travel = (-half * (2 * u**3 - 3 * u**2 + 1)
                          + half * (-2 * u**3 + 3 * u**2)
                          - speed * .38 * (2 * u**3 - 3 * u**2 + u))
                clearance = .045 * math.sin(math.pi * u)**2
            roll = motion.cycle_value(((0, .22), (.10, 0), (.45, 0), (.62, -.22),
                                       (.78, -.08), (.92, .13), (1, .22)), step)
            rotation = Matrix.Rotation(roll, 3, "X").to_quaternion() @ feet[side]
            foot = arm.data.bones["foot." + side]
            transform = rotation.to_matrix() @ foot.matrix_local.to_3x3().inverted()
            offsets = [transform @ (vertex.co - foot.head_local) for vertex in soles[side].data.vertices]
            ankle = Vector((sign * .165, travel, clearance - min(point.z for point in offsets)))
            place_leg(arm, side, ankle)
            motion.orient(arm, "foot." + side, rotation)
        # The fitted ready grip remains local to the connected guarded arms.
        for bone in arm.pose.bones:
            bone.keyframe_insert("rotation_euler", frame=frame)
            bone.keyframe_insert("location", frame=frame)
    action = arm.animation_data.action
    action.name = CLIP
    action["author"] = "heavy-guarded-backward"
    action["stride_distance_m"] = speed
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = "LINEAR"
    track = arm.animation_data.nla_tracks.new()
    track.name, track.mute = CLIP, True
    strip = track.strips.new(CLIP, 0, action)
    strip.action_slot = action.slots[0]
    assert controls == {name: curves(bpy.data.actions[name]) for name in controls}
    motion.anatomy.export_candidate(scene.objects["HeavyKit-Deform"], arm, output, "heavy-guarded")
    (output / "controls.json").write_text(json.dumps({"sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "glbSha256": hashlib.sha256((output / "heavy-guarded.glb").read_bytes()).hexdigest(),
        "exactExistingActions": list(controls), "addedClip": CLIP, "duration": 1,
        "strideDistanceMeters": speed, "supportFraction": .62}, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--speed", type=float, required=True, help="Measured backward speed magnitude in m/s")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    author(args.source, args.output, args.speed)
